/**
 * Real-AI check of "ảnh/PDF → bài tập" against an exam whose answers are known.
 *
 *   npx tsx scripts/ai-eval/runSample.ts                 # dry run: checks setup, calls nothing
 *   npx tsx scripts/ai-eval/runSample.ts --confirm-cost  # one real AI call (costs money)
 *
 * Options: --sample <name> (default de-lop3-mau-01), --no-solve (recognition only),
 * --max-cost <usd> (lower ceiling; 0.15 at most).
 *
 * Safety:
 * - The key is read from .env.local into this process only; it is never printed
 *   (only "có"/"không") and the script refuses to run if .env.local is tracked by git.
 * - The AI adapter is called directly, not through the API server, so nothing
 *   reaches Firebase (no aiJobs log, no homework saved). Results go to
 *   scripts/ai-eval/out/ (git-ignored).
 * - Without --confirm-cost no request is sent.
 */
import { execFileSync } from 'child_process';
import dotenv from 'dotenv';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { AnswerKey, compareWithKey } from './compare';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const HERE = path.join(ROOT, 'scripts/ai-eval');
const args = process.argv.slice(2);
const confirmed = args.includes('--confirm-cost');
const solve = !args.includes('--no-solve');
/** Ceiling for one run: --max-cost <usd>, never above the 0.15 USD first approved. */
const COST_CAP_USD = Math.min(0.15, args.includes('--max-cost') ? Number(args[args.indexOf('--max-cost') + 1]) || 0 : 0.15);
/** The count includes the output schema; a small margin covers rounding on the server. */
const SCHEMA_TOKEN_MARGIN = 100;
/** Most output a 10-question page has needed so far (2,471 tokens), plus ~20%. Less room risks a cut-off answer. */
const MIN_OUTPUT_TOKENS = 3000;
const sampleName = args.includes('--sample') ? args[args.indexOf('--sample') + 1] : 'de-lop3-mau-01';

const stop = (message: string): never => {
  console.error(`✖ ${message}`);
  process.exit(1);
};

// ---------- 1. Setup checks (no network) ----------
try {
  if (execFileSync('git', ['ls-files', '.env.local'], { cwd: ROOT }).toString().trim()) {
    stop('.env.local đang được git theo dõi. Hãy gỡ khỏi git trước khi đặt khóa vào đó.');
  }
} catch {
  // not a git checkout: nothing to check
}
dotenv.config({ path: path.join(ROOT, '.env.local'), quiet: true });
const provider = process.env.AI_PROVIDER === 'gemini' ? 'gemini' : 'anthropic';
const keyName = provider === 'gemini' ? 'GEMINI_API_KEY' : 'ANTHROPIC_API_KEY';
const hasKey = Boolean(process.env[keyName]?.trim());

const keyPath = path.join(HERE, 'samples', `${sampleName}.answers.json`);
if (!fs.existsSync(keyPath)) stop(`Không có đáp án mẫu ${keyPath}`);
const answerKey: AnswerKey = JSON.parse(fs.readFileSync(keyPath, 'utf8'));
const examPath = path.join(HERE, 'samples', answerKey.file);
if (!fs.existsSync(examPath)) stop(`Không có tệp đề ${examPath}`);
const examBytes = fs.readFileSync(examPath);

console.log(`Đề mẫu        : ${answerKey.file} (${answerKey.questions.length} câu, ${(examBytes.length / 1024).toFixed(0)} KB)`);
console.log(`Nhà cung cấp  : ${provider} · model ${process.env.AI_MODEL || 'mặc định của bộ xử lý'}`);
console.log(`${keyName.padEnd(14)}: ${hasKey ? 'có (không hiển thị giá trị)' : 'KHÔNG CÓ trong .env.local'}`);
console.log(`AI giải đề    : ${solve ? 'bật' : 'tắt'}`);
console.log('Ghi Firebase  : không (gọi thẳng bộ xử lý AI, không qua server)');
console.log(`Trần chi phí  : ${COST_CAP_USD} USD (một yêu cầu, không thử lại)`);

if (!confirmed) {
  console.log('\nCHẠY THỬ: chưa gửi yêu cầu nào. Thêm --confirm-cost để gọi AI thật.');
  process.exit(0);
}
if (!hasKey) stop(`Chưa có ${keyName} trong .env.local.`);

// ---------- 2. One real AI call ----------
async function main() {
  if (provider !== 'anthropic') stop('Giới hạn chi phí hiện chỉ áp dụng cho Claude (bỏ AI_PROVIDER=gemini).');
  const { AnthropicAIAdapter, CLAUDE_PRICING_PER_MTOK } = await import('../../src/services/aiAdapter');
  const input = { files: [{ mimeType: answerKey.mimeType, base64Data: examBytes.toString('base64') }], solveWithAI: solve };

  // Cost cap: exact input tokens (free count) + a margin for the output schema,
  // then max_tokens is whatever output still fits under the cap. No retries and
  // no fallback model. "AI giải" is two billed requests (copy, then solve), so
  // each gets half the cap.
  const steps = solve ? 2 : 1;
  const counter = new AnthropicAIAdapter(process.env.AI_MODEL, { maxRetries: 0 });
  const price = CLAUDE_PRICING_PER_MTOK[counter.defaultModel];
  if (!price) stop(`Chưa có bảng giá cho model ${counter.defaultModel}, không tính được giới hạn chi phí.`);
  const inputTokens = (await counter.countParseInputTokens(input)) + SCHEMA_TOKEN_MARGIN;
  const inputCost = (inputTokens * price.input) / 1_000_000;
  const maxOutputTokens = Math.floor(((COST_CAP_USD / steps - inputCost) * 1_000_000) / price.output);
  console.log(`Token đầu vào (đã cộng dự phòng ${SCHEMA_TOKEN_MARGIN}): ${inputTokens} ≈ ${inputCost.toFixed(4)} USD`);
  console.log(`Giới hạn đầu ra: ${maxOutputTokens} token → tối đa ${COST_CAP_USD} USD, ${steps} yêu cầu, không thử lại, không model dự phòng`);
  if (maxOutputTokens < MIN_OUTPUT_TOKENS) {
    stop(`Trần ${COST_CAP_USD} USD chỉ đủ cho ${maxOutputTokens} token đầu ra, dưới mức an toàn ${MIN_OUTPUT_TOKENS}; AI có thể bị cắt giữa chừng. Không gửi yêu cầu.`);
  }

  const adapter = new AnthropicAIAdapter(process.env.AI_MODEL, { maxRetries: 0, fallbacks: false, maxOutputTokens });
  console.log(`\nĐang gửi đề tới ${adapter.providerName} (${adapter.defaultModel})…`);
  let result;
  try {
    result = await adapter.parseHomeworkFromMedia(input);
  } finally {
    const u = adapter.lastUsage;
    if (u) console.log(`Chi phí thực tế (theo token Claude báo về): ${u.inputTokens} vào + ${u.outputTokens} ra = ${u.costUsd} USD`);
  }

  const rows = compareWithKey(result, answerKey, solve);

  console.log(`\nKhối lớp AI đọc được: ${result.grade} ${result.grade === answerKey.grade ? '✓' : `✗ (cần ${answerKey.grade})`}`);
  const { incompletenessMessage } = await import('../../src/utils/aiCompleteness');
  console.log(`Cảnh báo thiếu câu cho giáo viên: ${incompletenessMessage(result.completeness) ?? 'không (AI báo đủ câu)'}`);
  console.log(`Lý do AI dừng: ${adapter.lastUsage?.stopReason ?? 'không rõ'}`);
  console.log(`Số câu AI trả về: ${result.questions.length} / ${answerKey.questions.length}`);
  for (const r of rows) {
    const solvedMark = r.solved === null ? '' : r.solved ? ' · giải đúng' : ' · GIẢI SAI';
    console.log(`Câu ${String(r.no).padStart(2)} ${r.recognized ? '✓' : '✗'} ${r.skill}${solvedMark}${r.notes.length ? ' — ' + r.notes.join('; ') : ''}`);
  }
  const recognizedCount = rows.filter((r) => r.recognized).length;
  console.log(`\nNhận diện đúng: ${recognizedCount}/${rows.length}`);
  if (solve) console.log(`AI giải đúng  : ${rows.filter((r) => r.solved).length}/${rows.length}`);
  console.log(`Thời gian: ${(result.durationMs / 1000).toFixed(1)} s · chi phí ước tính: ${result.estimatedCostUsd} USD · model ${result.model}`);

  const outDir = path.join(HERE, 'out');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${sampleName}-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify({ sample: sampleName, solve, rows, result }, null, 2));
  console.log(`Kết quả đầy đủ: ${path.relative(ROOT, outFile)}`);
}

main().catch((error) => {
  // Adapter errors are already worded without secrets
  const detail = (error as { detail?: string }).detail; // e.g. "ANTHROPIC_API_KEY rejected: …" (never the key itself)
  stop(`AI chưa chạy được: ${error instanceof Error ? error.message : String(error)}${detail ? `\n  Chi tiết: ${detail}` : ''}`);
});
