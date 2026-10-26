import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';
import type { HomeworkQuestion, RichBlockNode, RichTextContent } from '../types/domain';
import {
  buildHomeworkDocx,
  DEFAULT_WORD_OPTIONS,
  groupQuestions,
  readImageInfo,
  WordExportError,
  wordFileName,
  type WordExportOptions,
  type WordHomework,
  type WordImage,
} from '../features/homework/wordExport';

/**
 * The Word file is checked by opening the .docx (a zip) and reading its XML,
 * the same parts Microsoft Word reads.
 */

const rich = (...blocks: RichBlockNode[]): RichTextContent => ({ version: 1, blocks });
const p = (text: string): RichBlockNode => ({ type: 'paragraph', text });
const opt = (label: string, text: string) => ({ id: `o${label}`, label, content: rich(p(text)) });

/** 1×1 PNG header with the given size (enough for Word to place it). */
function png(width: number, height: number): Uint8Array {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52]);
  new DataView(b.buffer).setUint32(16, width);
  new DataView(b.buffer).setUint32(20, height);
  return b;
}

/** The grade 3 exam as AI import saves it: figures on câu 4 and 6, a table in câu 5, 6a/6b split. */
const FIG4 = 'https://res.cloudinary.com/demo/image/authenticated/s--x--/mimoedu/homework/q4.jpg';
const FIG6 = 'https://res.cloudinary.com/demo/image/authenticated/s--y--/mimoedu/homework/q6.jpg';
const QUESTIONS: HomeworkQuestion[] = [
  {
    id: 'q1', order: 1, type: 'single_choice', points: 0.5,
    prompt: rich(p('Số lớn nhất trong các số: 59 599; 59 990; 59 909; 59 099 là:')),
    options: [opt('A', '59 599'), opt('B', '59 990'), opt('C', '59 909'), opt('D', '59 099')],
    correctOptionId: 'oB',
  },
  {
    id: 'q4', order: 4, type: 'single_choice', points: 1,
    prompt: rich(p('Diện tích của hình bên là:'), { type: 'image', url: FIG4, alt: 'Hình ô vuông' }),
    options: [opt('A', '9 cm²'), opt('B', '10 cm²'), opt('C', '11 cm'), opt('D', '11 cm²')],
    aiReviewNote: 'Phải đếm ô vuông trên hình.',
  },
  {
    id: 'q5', order: 5, type: 'single_choice', points: 1,
    prompt: rich(
      p('Dưới đây là bảng số liệu về thời gian đọc sách:'),
      {
        type: 'table',
        header: true,
        rows: [
          { cells: ['Bạn', 'Thanh', 'Hóa', 'Việt', 'Nam'] },
          { cells: ['Số giờ đọc sách', '8 giờ', '13 giờ', '14 giờ', '10 giờ'] },
        ],
      },
      p('Bạn đọc nhiều nhất hơn bạn đọc ít nhất bao nhiêu giờ?')
    ),
    options: [opt('A', '4 giờ'), opt('B', '5 giờ'), opt('C', '6 giờ'), opt('D', '7 giờ')],
    correctOptionId: 'oC',
  },
  {
    id: 'q6a', order: 6, type: 'short_answer', points: 0.5,
    prompt: rich(p('a) Hình H gồm hình vuông ABCD và hình chữ nhật DEGK. Diện tích hình H là: ……'), { type: 'image', url: FIG6, alt: 'Hình H' }),
    acceptableAnswers: ['274 cm²', '274'],
  },
  {
    id: 'q6b', order: 7, type: 'short_answer', points: 0.5,
    prompt: rich(p('b) Chu vi hình H là: ……'), { type: 'image', url: FIG6, alt: 'Hình H' }),
    acceptableAnswers: ['82 cm'],
  },
];
// Saved out of order on purpose: the file follows `order`
const EXAM: WordHomework = { title: 'Kiểm tra cuối năm – Toán 3', questions: [QUESTIONS[2], QUESTIONS[0], QUESTIONS[4], QUESTIONS[1], QUESTIONS[3]] };

function deps(loaded: string[] = []) {
  return {
    loadImage: async (url: string): Promise<WordImage> => {
      loaded.push(url);
      // Different bytes per picture, as real ones are (equal bytes share one file in the .docx)
      const data = png(400, 300 + loaded.length);
      return { data, type: 'png', width: 400, height: 300 };
    },
    renderGeometry: async (): Promise<WordImage> => ({ data: png(360, 240), type: 'png', width: 360, height: 240 }),
  };
}

async function open(hw: WordHomework, options: Partial<WordExportOptions> = {}, d = deps()) {
  const blob = await buildHomeworkDocx(hw, { ...DEFAULT_WORD_OPTIONS, ...options }, d);
  const zip = await JSZip.loadAsync(await blob.arrayBuffer());
  const xml = await zip.file('word/document.xml')!.async('string');
  const text = [...xml.matchAll(/<(?:w|m):t[^>]*>([^<]*)<\/(?:w|m):t>/g)].map((m) => m[1]).join('');
  const media = Object.keys(zip.files).filter((f) => f.startsWith('word/media/') && !f.endsWith('/'));
  return { blob, zip, xml, text, media };
}

describe('xuất Word (.docx)', () => {
  it('là tệp Word thật: gói zip có document.xml, kiểu MIME Word', async () => {
    const { blob, zip, xml } = await open(EXAM);
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    expect(Object.keys(zip.files)).toContain('[Content_Types].xml');
    expect(xml).toContain('<w:body>');
    // Word treats a body ending in a table as damaged
    expect(xml).toMatch(/(<\/w:p>|<w:p\/>)<w:sectPr/);
  });

  it('đề không đáp án: đúng thứ tự câu, nội dung giữ nguyên, không lộ đáp án', async () => {
    const { text } = await open(EXAM);
    const positions = ['Câu 1.', 'Câu 2.', 'Câu 3.', 'Câu 4.'].map((c) => text.indexOf(c));
    expect(positions.every((x, i) => x >= 0 && (i === 0 || x > positions[i - 1]))).toBe(true);
    expect(text).not.toContain('Câu 5.');
    expect(text).toContain('Số lớn nhất trong các số: 59 599; 59 990; 59 909; 59 099 là:');
    expect(text).toContain('a) Hình H gồm hình vuông ABCD và hình chữ nhật DEGK. Diện tích hình H là: ……');
    expect(text).toContain('b) Chu vi hình H là: ……');
    for (const o of ['9 cm²', '10 cm²', '11 cm', '11 cm²']) expect(text).toContain(o);
    expect(text).not.toContain('Đáp án');
    expect(text).not.toContain('274');
    expect(text).not.toContain('Cần giáo viên kiểm tra');
  });

  it('6a, 6b in chung một câu; hình H dùng chung chỉ chèn một lần, đặt tại câu đó', async () => {
    const loaded: string[] = [];
    const { text, media, xml } = await open(EXAM, {}, deps(loaded));
    expect(text.indexOf('Câu 4.')).toBeLessThan(text.indexOf('b) Chu vi'));
    expect(media).toHaveLength(2);
    expect(loaded.sort()).toEqual([FIG4, FIG6].sort());
    expect((xml.match(/<w:drawing>/g) ?? []).length).toBe(2);
    // Each picture comes right after its question's text
    const drawings = [...xml.matchAll(/<w:drawing>/g)].map((m) => m.index!);
    expect(xml.indexOf('Diện tích của hình bên là:')).toBeLessThan(drawings[0]);
    expect(drawings[0]).toBeLessThan(xml.indexOf('Dưới đây là bảng'));
    expect(xml.indexOf('Diện tích hình H là')).toBeLessThan(drawings[1]);
    expect(drawings[1]).toBeLessThan(xml.indexOf('b) Chu vi'));
  });

  it('hình giữ tỉ lệ và không vượt khổ giấy', async () => {
    const big = {
      loadImage: async (): Promise<WordImage> => ({ data: png(3000, 1000), type: 'png', width: 3000, height: 1000 }),
      renderGeometry: deps().renderGeometry,
    };
    const { xml } = await open({ title: 'T', questions: [QUESTIONS[1]] }, {}, big);
    const [, cx, cy] = /<wp:extent cx="(\d+)" cy="(\d+)"/.exec(xml)!.map(Number);
    expect(cx / cy).toBeCloseTo(3, 1);
    // A4 portrait 21 cm minus 2.5 + 1.5 cm margins = 17 cm (EMU: 360000 per cm)
    expect(cx).toBeLessThanOrEqual(17 * 360000);
  });

  it('bảng số liệu là bảng Word sửa được, đủ hàng và cột', async () => {
    const { xml } = await open(EXAM);
    const table = xml.slice(xml.indexOf('<w:tbl>', xml.indexOf('Dưới đây là bảng')));
    const first = table.slice(0, table.indexOf('</w:tbl>'));
    expect((first.match(/<w:tr>/g) ?? []).length).toBe(2);
    expect((first.match(/<w:tc>/g) ?? []).length).toBe(10);
    for (const cell of ['Bạn', 'Thanh', 'Hóa', 'Việt', 'Nam', 'Số giờ đọc sách', '8 giờ', '13 giờ', '14 giờ', '10 giờ']) {
      expect(first).toContain(`>${cell}</w:t>`);
    }
    // Table and the lines after it move with the question, so Word never splits a question across pages
    expect((first.match(/<w:keepNext\/>/g) ?? []).length).toBe(10);
  });

  it('công thức thành phương trình Word (phân số, căn, lũy thừa), không còn mã LaTeX', async () => {
    const q: HomeworkQuestion = {
      id: 'm', order: 1, type: 'short_answer', points: 1,
      prompt: rich(p('Tính $\\frac{3}{4} + \\frac{1}{4}$ và $\\sqrt{16}$, $5^2$, $12 \\times 3$ cm'), { type: 'math', inline: false, latex: '\\dfrac{a+b}{2}' }),
      acceptableAnswers: ['1'],
    };
    const { xml, text } = await open({ title: 'T', questions: [q] });
    expect((xml.match(/<m:f>/g) ?? []).length).toBe(3);
    expect(xml).toContain('<m:rad>');
    expect(xml).toContain('<m:sSup>');
    expect(text).toContain('×');
    expect(text).not.toMatch(/\\frac|\\sqrt|\\times|\$/);
  });

  it('đề kèm đáp án: đáp án đúng như đã lưu, câu chưa có đáp án ghi rõ cần giáo viên kiểm tra', async () => {
    const { text } = await open(EXAM, { content: 'exam_with_answers' });
    expect(text).toMatch(/Câu 1\..*Đáp án: B/);
    expect(text).toContain('Đáp án: chưa có đáp án – giáo viên cần nhập');
    expect(text).toContain('Cần giáo viên kiểm tra: Phải đếm ô vuông trên hình.');
    expect(text).toContain('a) Đáp án: 274 cm² (chấp nhận: 274)');
    expect(text).toContain('b) Đáp án: 82 cm');
    expect(text).toContain('Đáp án: C');
  });

  it('file đáp án riêng: bảng câu – đáp án – điểm, không chép lại đề', async () => {
    const { text, media } = await open(EXAM, { content: 'answers' });
    expect(text).toContain('ĐÁP ÁN – KIỂM TRA CUỐI NĂM – TOÁN 3');
    // Numbered as printed: 1, 2, 3, 4a, 4b
    expect(text).toContain('CâuĐáp ánĐiểm1B0,52chưa có đáp án – giáo viên cần nhập – Cần giáo viên kiểm tra13C14a274 cm² (chấp nhận: 274)0,54b82 cm0,5');
    expect(text).not.toContain('Họ và tên');
    expect(text).not.toContain('Số lớn nhất');
    expect(media).toHaveLength(0);
  });

  it('câu tự luận: dòng kẻ chấm hoặc khoảng trống; bản đáp án in lời giải', async () => {
    const essay: HomeworkQuestion = {
      id: 'e', order: 1, type: 'essay', points: 2,
      prompt: rich(p('Một cửa hàng có 25 kg gạo, đã bán 7 kg. Hỏi còn lại bao nhiêu ki-lô-gam gạo?')),
      sampleSolution: rich(p('Số gạo còn lại là: 25 − 7 = 18 (kg)'), p('Đáp số: 18 kg')),
      rubric: 'Lời giải đúng 1 điểm, phép tính đúng 1 điểm.',
    };
    const hw = { title: 'T', questions: [essay] };
    const lines = await open(hw, { essaySpace: 'lines', essayLines: 8 });
    expect((lines.xml.match(/w:leader="dot"/g) ?? []).length).toBe(8 + 2); // + họ tên, lớp
    const blank = await open(hw, { essaySpace: 'blank', essayLines: 5, studentFields: false });
    expect(blank.xml).not.toContain('w:leader="dot"');
    const key = await open(hw, { content: 'exam_with_answers' });
    expect(key.text).toContain('Số gạo còn lại là: 25 − 7 = 18 (kg)');
    expect(key.text).toContain('Hướng dẫn chấm: Lời giải đúng 1 điểm');
  });

  it('câu Đúng/Sai: bảng các ý; chỉ bản đáp án mới điền Đ/S', async () => {
    const tf: HomeworkQuestion = {
      id: 't', order: 1, type: 'true_false_multi', points: 1,
      prompt: rich(p('Đúng ghi Đ, sai ghi S:')),
      statements: [
        { id: 's1', label: 'a', statement: rich(p('7 × 8 = 56')), isTrue: true, points: 0.5 },
        { id: 's2', label: 'b', statement: rich(p('9 × 6 = 56')), isTrue: false, points: 0.5 },
      ],
    };
    const exam = await open({ title: 'T', questions: [tf] });
    expect(exam.text).toContain('a) 7 × 8 = 56');
    expect(exam.text).not.toMatch(/56Đ|56S/);
    const key = await open({ title: 'T', questions: [tf] }, { content: 'exam_with_answers' });
    expect(key.text).toContain('a) 7 × 8 = 56Đ');
    expect(key.text).toContain('b) 9 × 6 = 56S');
  });

  it('hình vẽ hình học được chèn thành ảnh tại câu', async () => {
    const q: HomeworkQuestion = {
      id: 'g', order: 1, type: 'short_answer', points: 1,
      prompt: rich(p('Tính chu vi hình tam giác ABC.'), {
        type: 'geometry',
        drawing: { width: 360, height: 240, points: [], elements: [], caption: 'Tam giác ABC' },
      }),
      acceptableAnswers: ['12 cm'],
    };
    const { media, text } = await open({ title: 'T', questions: [q] });
    expect(media).toHaveLength(1);
    expect(text).toContain('Tam giác ABC');
  });

  it('khổ A4 ngang, cỡ chữ 14, Times New Roman, lề tính theo cm', async () => {
    const { xml, zip } = await open(EXAM, { orientation: 'landscape', fontSize: 14, margins: { top: 2, bottom: 2, left: 3, right: 2 } });
    expect(xml).toMatch(/<w:pgSz w:w="16838" w:h="11906" w:orient="landscape"\/>/);
    expect(xml).toMatch(/w:left="1701"/);
    const styles = await zip.file('word/styles.xml')!.async('string');
    expect(styles).toContain('w:ascii="Times New Roman"');
    expect(styles).toContain('<w:sz w:val="28"/>');
  });

  it('không tải được hình: báo lỗi rõ câu nào, không tạo tệp thiếu hình', async () => {
    const failing = {
      loadImage: async (): Promise<WordImage> => {
        throw new Error('máy chủ ảnh trả về HTTP 404');
      },
      renderGeometry: deps().renderGeometry,
    };
    await expect(buildHomeworkDocx(EXAM, DEFAULT_WORD_OPTIONS, failing)).rejects.toThrow(WordExportError);
    await expect(buildHomeworkDocx(EXAM, DEFAULT_WORD_OPTIONS, failing)).rejects.toThrow(/Câu 2 .*HTTP 404/);
    await expect(buildHomeworkDocx({ title: 'T', questions: [] }, DEFAULT_WORD_OPTIONS, deps())).rejects.toThrow('chưa có câu hỏi');
  });

  it('không sửa dữ liệu đề đang soạn', async () => {
    const before = JSON.stringify(EXAM);
    await open(EXAM, { content: 'exam_with_answers' });
    expect(JSON.stringify(EXAM)).toBe(before);
  });

  it('gộp câu con chỉ khi câu trước có a)', () => {
    expect(groupQuestions(EXAM.questions).map((g) => g.map((q) => q.id))).toEqual([['q1'], ['q4'], ['q5'], ['q6a', 'q6b']]);
    const lone: HomeworkQuestion = { ...QUESTIONS[4], id: 'x', order: 1 };
    expect(groupQuestions([lone])).toHaveLength(1);
  });

  it('đọc định dạng và kích thước ảnh từ nội dung tệp; tên tệp không dấu', () => {
    expect(readImageInfo(png(286, 188))).toEqual({ type: 'png', width: 286, height: 188 });
    const jpeg = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0, 4, 0, 0, 0xff, 0xc0, 0, 17, 8, 0, 114, 0, 236, 3, 0, 0, 0, 0]);
    expect(readImageInfo(jpeg)).toEqual({ type: 'jpg', width: 236, height: 114 });
    expect(readImageInfo(new TextEncoder().encode('<svg></svg>'))).toBeNull();
    expect(wordFileName('Kiểm tra cuối năm – Toán 3 (Đề 1)', 'exam')).toBe('kiem-tra-cuoi-nam-toan-3-de-1-de.docx');
    expect(wordFileName('', 'answers')).toBe('bai-tap-dap-an.docx');
  });
});
