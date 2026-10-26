import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import Anthropic from '@anthropic-ai/sdk';
import {
  AnthropicAIAdapter,
  badRequestReason,
  imagePixelSize,
  pixelBoxToNormalized,
  seenImageSize,
  sniffImageType,
} from '../services/aiAdapter';

/**
 * Converting an exam photo with Claude, against a fake Claude client: the
 * requests MimoEDU sends and how the replies become questions. No real API call.
 */

/** Smallest file headers that carry an image's size. */
function pngHeader(width: number, height: number): string {
  const b = Buffer.alloc(33);
  Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex').copy(b, 0);
  b.writeUInt32BE(width, 16);
  b.writeUInt32BE(height, 20);
  return b.toString('base64');
}
function jpegHeader(width: number, height: number): string {
  const app0 = Buffer.from('ffe000104a46494600010100000100010000', 'hex');
  const sof = Buffer.alloc(19);
  Buffer.from('ffc00011080000000003', 'hex').copy(sof, 0);
  sof.writeUInt16BE(height, 5);
  sof.writeUInt16BE(width, 7);
  return Buffer.concat([Buffer.from('ffd8', 'hex'), app0, sof]).toString('base64');
}
function webpHeader(width: number, height: number): string {
  const b = Buffer.alloc(30);
  b.write('RIFF', 0, 'latin1');
  b.write('WEBPVP8X', 8, 'latin1');
  b.writeUIntLE(width - 1, 24, 3);
  b.writeUIntLE(height - 1, 27, 3);
  return b.toString('base64');
}

const PAGE = { mimeType: 'image/jpeg', base64Data: jpegHeader(700, 978) };

const EXTRACTION = {
  title: 'Kiểm tra cuối năm – Toán 3',
  description: 'Khoanh vào chữ cái đặt trước câu trả lời đúng.',
  grade: 'Lớp 3',
  questionCountOnExam: 2,
  questions: [
    {
      sourceNumber: '1',
      type: 'single_choice',
      promptText: 'Diện tích của hình bên là:',
      points: 1,
      options: [
        { label: 'A', text: '9 cm²' },
        { label: 'D', text: '11 cm²' },
      ],
      statements: [],
      figures: [{ page: 1, box: [427, 495, 616, 587], description: 'Hình ô vuông' }],
      reviewNote: '',
    },
    {
      sourceNumber: '2a',
      type: 'short_answer',
      promptText: 'Hình H gồm hình vuông ABCD và hình chữ nhật DEGK như hình bên.\na) Diện tích hình H là: ……',
      points: 0.5,
      options: [],
      statements: [],
      figures: [{ page: 1, box: [395, 805, 650, 978], description: 'Hình H' }],
      reviewNote: '',
    },
  ],
};

const SOLUTION = {
  answers: [
    {
      index: 1,
      correctOptionLabels: ['D'],
      statementAnswers: [],
      acceptableAnswers: [],
      sampleSolutionText: '',
      certain: false,
      reviewNote: 'Phải đếm ô trên hình, chưa chắc chắn.',
    },
    {
      index: 2,
      correctOptionLabels: [],
      statementAnswers: [],
      acceptableAnswers: ['274 cm²', '274'],
      sampleSolutionText: '',
      certain: true,
      reviewNote: '',
    },
  ],
};

type SentRequest = { system: string; messages: { content: { type: string; text?: string }[] }[]; output_config: { effort: string; format: { schema: Record<string, unknown> } } };

function fakeAdapter(replies: (object | Error)[]) {
  const sent: SentRequest[] = [];
  const adapter = new AnthropicAIAdapter(undefined, { fallbacks: false });
  (adapter as unknown as { client: unknown }).client = {
    beta: {
      messages: {
        stream: (request: SentRequest) => {
          sent.push(request);
          const reply = replies.shift();
          return {
            finalMessage: async () => {
              if (reply instanceof Error) throw reply;
              return {
                model: 'claude-sonnet-5-5',
                stop_reason: 'end_turn',
                usage: { input_tokens: 1000, output_tokens: 500 },
                content: [{ type: 'text', text: JSON.stringify(reply) }],
              };
            },
          };
        },
      },
    },
  };
  return { adapter, sent };
}

/** Properties of a JSON schema (at any depth) that are not listed as required. */
function optionalProperties(node: unknown): string[] {
  if (!node || typeof node !== 'object') return [];
  const n = node as { properties?: Record<string, unknown>; required?: string[] };
  const own = Object.keys(n.properties ?? {}).filter((k) => !(n.required ?? []).includes(k));
  return [...own, ...Object.values(node).flatMap(optionalProperties)];
}

describe('chuyển ảnh đề bằng Claude', () => {
  const savedKey = process.env.ANTHROPIC_API_KEY;
  beforeAll(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
  });
  afterAll(() => {
    if (savedKey === undefined) delete process.env.ANTHROPIC_API_KEY;
    else process.env.ANTHROPIC_API_KEY = savedKey;
  });

  it('schema gửi Claude không có trường tùy chọn (lỗi 400 "Schema is too complex")', async () => {
    const { adapter, sent } = fakeAdapter([EXTRACTION, SOLUTION]);
    await adapter.parseHomeworkFromMedia({ files: [PAGE], solveWithAI: true });
    expect(sent).toHaveLength(2);
    for (const request of sent) expect(optionalProperties(request.output_config.format.schema)).toEqual([]);
  });

  it('hai chế độ dùng chung đúng một yêu cầu chép đề; chế độ giải chỉ thêm bước giải', async () => {
    const copy = fakeAdapter([EXTRACTION]);
    const solve = fakeAdapter([EXTRACTION, SOLUTION]);
    await copy.adapter.parseHomeworkFromMedia({ files: [PAGE], solveWithAI: false });
    await solve.adapter.parseHomeworkFromMedia({ files: [PAGE], solveWithAI: true });
    expect(copy.sent).toHaveLength(1);
    // Same prompt, pages, effort and schema (compared as sent over the wire)
    expect(JSON.stringify(solve.sent[0])).toBe(JSON.stringify(copy.sent[0]));
    expect(copy.sent[0].system).toContain('KHÔNG giải');
    // The solve step sees the copied questions, not a second reading of the paper
    const solveText = solve.sent[1].messages[0].content.map((b) => b.text ?? '').join('');
    expect(solveText).toContain('Diện tích hình H là');
  });

  it('chỉ chép đề: không có đáp án; khung hình đổi từ pixel sang thang 0–1000', async () => {
    const { adapter, sent } = fakeAdapter([EXTRACTION]);
    const result = await adapter.parseHomeworkFromMedia({ files: [PAGE], solveWithAI: false });
    const pageLabel = sent[0].messages[0].content[0].text;
    expect(pageLabel).toBe('Trang/File 1 (ảnh rộng 700 px, cao 978 px):');
    expect(result.questions).toHaveLength(2);
    expect(result.questions[0].correctOptionId).toBeUndefined();
    expect(result.questions[1].acceptableAnswers).toEqual([]);
    expect(result.figures.map((f) => f.box)).toEqual([
      [610, 506, 880, 600],
      [564, 823, 929, 1000],
    ]);
    expect(result.completeness).toMatchObject({ declared: 2, missingNumbers: [] });
  });

  it('AI giải: dùng đáp án chắc chắn; đáp án AI tự nhận là đoán thì bỏ, chỉ giữ ghi chú', async () => {
    const { adapter } = fakeAdapter([EXTRACTION, SOLUTION]);
    const result = await adapter.parseHomeworkFromMedia({ files: [PAGE], solveWithAI: true });
    expect(result.questions[0].correctOptionId).toBeUndefined();
    expect(result.questions[0].aiReviewNote).toContain('Phải đếm ô trên hình');
    expect(result.questions[1].acceptableAnswers).toEqual(['274 cm²', '274']);
    expect(result.questions[1].aiReviewNote).toBeUndefined();
    expect(result.aiSolverEnabled).toBe(true);
  });

  it('bước giải lỗi: vẫn trả đề đã chép, mỗi câu ghi rõ lý do', async () => {
    const overloaded = new Anthropic.RateLimitError(429, { error: { message: 'rate' } }, 'rate', new Headers());
    const { adapter } = fakeAdapter([EXTRACTION, overloaded]);
    const result = await adapter.parseHomeworkFromMedia({ files: [PAGE], solveWithAI: true });
    expect(result.questions).toHaveLength(2);
    for (const q of result.questions) expect(q.aiReviewNote).toContain('Bước AI giải bị lỗi: Claude đang quá tải');
  });

  it('lỗi 400 báo đúng nguyên nhân kèm mã yêu cầu, không đổ cho tệp', async () => {
    const tooComplex = new Anthropic.BadRequestError(
      400,
      { error: { message: 'Schema is too complex.' } },
      'Schema is too complex.',
      new Headers({ 'request-id': 'req_123' })
    );
    const { adapter } = fakeAdapter([tooComplex]);
    await expect(adapter.parseHomeworkFromMedia({ files: [PAGE], solveWithAI: false })).rejects.toThrow(
      /cấu hình AI phía máy chủ.*mã yêu cầu: req_123/
    );
  });

  it('tệp mang đuôi .jpg nhưng không phải ảnh (ví dụ HEIC): báo rõ, không gọi Claude', async () => {
    const { adapter, sent } = fakeAdapter([EXTRACTION]);
    const heic = Buffer.from('000000186674797068656963000000006d696631', 'hex').toString('base64');
    await expect(
      adapter.parseHomeworkFromMedia({ files: [{ mimeType: 'image/jpeg', base64Data: heic }], solveWithAI: false })
    ).rejects.toThrow('HEIC');
    expect(sent).toHaveLength(0);
  });
});

describe('đọc ảnh trang đề', () => {
  it('kích thước và định dạng thật từ nội dung tệp', () => {
    expect(imagePixelSize(jpegHeader(700, 978))).toEqual({ width: 700, height: 978 });
    expect(imagePixelSize(pngHeader(1600, 1100))).toEqual({ width: 1600, height: 1100 });
    expect(imagePixelSize(webpHeader(1200, 800))).toEqual({ width: 1200, height: 800 });
    expect(sniffImageType(pngHeader(10, 10))).toBe('image/png');
    expect(sniffImageType(jpegHeader(10, 10))).toBe('image/jpeg');
    expect(sniffImageType(webpHeader(10, 10))).toBe('image/webp');
  });

  it('ảnh lớn: tọa độ tính trên ảnh Claude thực sự nhìn (cạnh dài tối đa 2576 px)', () => {
    expect(seenImageSize(jpegHeader(4000, 2750))).toEqual({ width: 2335, height: 1606 });
    expect(pixelBoxToNormalized([350, 489, 700, 978], { width: 700, height: 978 })).toEqual([500, 500, 1000, 1000]);
    // Reversed or out-of-page values are put in order and kept on the page
    expect(pixelBoxToNormalized([800, 100, 350, -5], { width: 700, height: 978 })).toEqual([500, 0, 1000, 102]);
  });

  it('nguyên nhân lỗi 400 theo nội dung Claude trả về', () => {
    expect(badRequestReason('Schema is too complex for compilation.')).toContain('cấu hình AI');
    expect(badRequestReason('The PDF is password protected')).toContain('mật khẩu');
    expect(badRequestReason('image exceeds 5 MB maximum')).toContain('quá lớn');
    expect(badRequestReason('Could not process image')).toContain('JPG/PNG');
  });
});
