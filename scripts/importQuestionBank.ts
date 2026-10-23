/**
 * Imports the question bank (question-bank/*.json, top folder only) into
 * Firestore as DRAFT sets with DRAFT questions — the same documents the
 * teacher's "Nhập tệp" button writes. It never approves or publishes anything:
 * teachers still review each question and publish each set in MimoEDU Studio.
 *
 *   npx tsx scripts/importQuestionBank.ts                 → dry run (reads only)
 *   npx tsx scripts/importQuestionBank.ts --apply         → backup, then write
 *   ... --only N01,N02                                    → limit to some topics
 *
 * Credentials: FIREBASE_SERVICE_ACCOUNT (same as the API server), or
 * FIREBASE_ACCESS_TOKEN — a short-lived OAuth token of a project owner, e.g.
 * the Firebase CLI login, so no service-account key has to be created. Safety:
 * - backup-old/, archive/ and other subfolders are never read;
 * - any validation error, duplicate id or duplicate datasetId aborts;
 * - any set or question that already exists aborts (no overwrite option):
 *   writes use create(), which also fails if a document appears meanwhile;
 * - before writing, every practiceSets/practiceQuestions doc is saved to
 *   backups/firestore-practice-<time>.json.
 */
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
import { Firestore } from '@google-cloud/firestore';
import { getAdminDb, isUsingFirebaseEmulator } from '../api/firebaseAdmin';
import { ImportValidation, validatePracticeImport } from '../src/utils/practiceEngine';
import firebaseConfig from '../firebase-applet-config.json';

const BANK_DIR = path.resolve('question-bank');
const BACKUP_DIR = path.resolve('backups');
const SETS = 'practiceSets';
const QUESTIONS = 'practiceQuestions';
const BATCH_SIZE = 400;
const IMPORTED_BY = 'nguyenthanhmai9297@gmail.com';

const apply = process.argv.includes('--apply');
const onlyArg = process.argv.find((a) => a.startsWith('--only'));
const only = onlyArg
  ? new Set((onlyArg.includes('=') ? onlyArg.split('=')[1] : process.argv[process.argv.indexOf(onlyArg) + 1]).split(','))
  : null;

function fail(message: string): never {
  console.error(`\n✖ ${message}\nKhông ghi gì lên Firestore.`);
  process.exit(1);
}

function getDb(): { db: Firestore | null; projectId: string } {
  const token = process.env.FIREBASE_ACCESS_TOKEN;
  if (!token || isUsingFirebaseEmulator()) {
    return { db: getAdminDb(), projectId: process.env.GCLOUD_PROJECT || firebaseConfig.projectId };
  }
  // Admin SDK only accepts service accounts / ADC for Firestore, so use the
  // underlying client with the owner's OAuth token instead.
  // Take OAuth2Client from the copy Firestore's own google-gax loads; the
  // top-level google-auth-library is an older major and fails inside gRPC.
  const require = createRequire(import.meta.url);
  const gax = require.resolve('google-gax', { paths: [path.dirname(require.resolve('@google-cloud/firestore'))] });
  const { OAuth2Client } = createRequire(gax)('google-auth-library');
  const authClient = new OAuth2Client();
  authClient.setCredentials({ access_token: token });
  const db = new Firestore({
    projectId: firebaseConfig.projectId,
    databaseId: firebaseConfig.firestoreDatabaseId,
    authClient,
  } as ConstructorParameters<typeof Firestore>[0]);
  return { db, projectId: firebaseConfig.projectId };
}

async function main() {
  const { db, projectId } = getDb();
  if (!db) fail('Thiếu FIREBASE_SERVICE_ACCOUNT hoặc FIREBASE_ACCESS_TOKEN.');
  const target = isUsingFirebaseEmulator() ? 'EMULATOR' : `PRODUCTION project=${projectId} database=${db.databaseId}`;
  console.log(`Đích: ${target} · Chế độ: ${apply ? 'GHI (--apply)' : 'CHẠY THỬ, chỉ đọc'}\n`);

  // 1. Local validation of the main-folder files only
  const files = fs
    .readdirSync(BANK_DIR, { withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => e.name)
    .sort();
  const imports: { file: string; v: ImportValidation }[] = [];
  const seenQuestionIds = new Map<string, string>();
  const seenDatasetIds = new Map<string, string>();
  for (const file of files) {
    const v = validatePracticeImport(JSON.parse(fs.readFileSync(path.join(BANK_DIR, file), 'utf8')));
    if (!v.dataset || v.errors.length > 0) {
      fail(`${file}: ${v.errors.map((e) => `${e.questionId ?? ''} ${e.message}`).join('; ')}`);
    }
    if (only && !only.has(v.dataset.topicId)) continue;
    if (seenDatasetIds.has(v.dataset.id)) fail(`datasetId ${v.dataset.id} trùng ở ${file} và ${seenDatasetIds.get(v.dataset.id)}.`);
    seenDatasetIds.set(v.dataset.id, file);
    for (const q of v.questions) {
      if (seenQuestionIds.has(q.id)) fail(`Mã câu ${q.id} trùng ở ${file} và ${seenQuestionIds.get(q.id)}.`);
      seenQuestionIds.set(q.id, file);
      if (q.status !== 'draft') fail(`${q.id}: trạng thái sau kiểm tra phải là draft.`);
    }
    imports.push({ file, v });
  }
  if (imports.length === 0) fail('Không có tệp nào để nhập.');

  // 2. Nothing may exist already: no overwrite, ever
  const setRefs = imports.map(({ v }) => db.collection(SETS).doc(v.dataset!.id));
  const questionRefs = [...seenQuestionIds.keys()].map((id) => db.collection(QUESTIONS).doc(id));
  const existing = [];
  for (let i = 0; i < questionRefs.length; i += BATCH_SIZE) {
    existing.push(...(await db.getAll(...questionRefs.slice(i, i + BATCH_SIZE))).filter((s) => s.exists));
  }
  existing.push(...(await db.getAll(...setRefs)).filter((s) => s.exists));

  for (const { file, v } of imports) {
    console.log(`  ${v.dataset!.topicId}  ${v.dataset!.id}  ${v.questions.length} câu  ← ${file}`);
  }
  console.log(`\nTổng: ${imports.length} bộ · ${seenQuestionIds.size} câu · tất cả ở trạng thái nháp (draft)`);
  console.log(`Đã có trên Firestore: ${existing.length} tài liệu trùng mã`);
  if (existing.length > 0) {
    fail(`Đã có sẵn: ${existing.slice(0, 10).map((s) => s.ref.path).join(', ')}${existing.length > 10 ? ' …' : ''}`);
  }
  if (!apply) {
    console.log('\nChạy thử xong. Thêm --apply để sao lưu rồi ghi.');
    return;
  }

  // 3. Backup current practice data
  const dump: Record<string, unknown> = {};
  for (const coll of [SETS, QUESTIONS]) {
    for (const d of (await db.collection(coll).get()).docs) dump[d.ref.path] = d.data();
  }
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  const backupFile = path.join(BACKUP_DIR, `firestore-practice-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(backupFile, JSON.stringify(dump, null, 2));
  const readBack = Object.keys(JSON.parse(fs.readFileSync(backupFile, 'utf8'))).length;
  if (readBack !== Object.keys(dump).length) fail(`Bản sao lưu đọc lại được ${readBack}/${Object.keys(dump).length} tài liệu.`);
  console.log(`\nĐã sao lưu và đọc lại ${readBack} tài liệu → ${backupFile}`);

  // 4. Write, one set per batch group, mirroring importPracticeSet()
  for (const { v } of imports) {
    const dataset = v.dataset!;
    const now = new Date().toISOString();
    for (let i = 0; i < v.questions.length; i += BATCH_SIZE) {
      const batch = db.batch();
      for (const { id, ...q } of v.questions.slice(i, i + BATCH_SIZE)) {
        batch.create(db.collection(QUESTIONS).doc(id), { ...q, updatedAt: now, updatedBy: IMPORTED_BY });
      }
      if (i === 0) {
        batch.create(db.collection(SETS).doc(dataset.id), {
          topicId: dataset.topicId,
          title: dataset.title,
          schemaVersion: dataset.schemaVersion,
          questionCount: v.questions.length,
          status: 'draft',
          ...(dataset.notes ? { notes: dataset.notes.slice(0, 2000) } : {}),
          importedAt: now,
          importedBy: IMPORTED_BY,
          updatedAt: now,
        });
      }
      await batch.commit();
    }
    console.log(`  ✔ ${dataset.topicId} ${dataset.id}`);
  }
  console.log('\nXong. Các bộ đang ở trạng thái nháp: giáo viên duyệt câu và xuất bản trong MimoEDU Studio.');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
