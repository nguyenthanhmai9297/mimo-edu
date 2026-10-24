import { describe, expect, it } from 'vitest';
import { docToRichText, richTextToDoc } from '../components/editor/richTextDoc';
import { aiParsedHomeworkResponseSchema } from '../schemas/validation';
import {
  mapParsedQuestions,
  normalizeGrade,
  parseOutputTokenLimit,
  richTextFromAIText,
} from '../services/aiAdapter';
import { createRichTextFromPlain, gradeSingleQuestion, normalizeShortAnswer } from '../utils/gradingEngine';
import { checkCompleteness, incompletenessMessage, isIncomplete } from '../utils/aiCompleteness';
import type { HomeworkQuestion, RichTextContent } from '../types/domain';

/** Fixes found by the real-AI check of the grade-3 sample exam. */

const parse = (questions: unknown[]) =>
  aiParsedHomeworkResponseSchema.parse({ title: 'Đề', grade: 'Lớp 3', questions }).questions;

describe('Câu AI chưa giải được: gắn cờ, không tự bịa đáp án', () => {
  it('câu hình học thiếu lời giải được gắn cờ cho giáo viên', () => {
    const [q] = mapParsedQuestions(parse([{ type: 'essay', promptText: 'Tính chu vi hình chữ nhật ABCD.', points: 1.5 }]), true);
    expect(q.aiReviewNote).toContain('AI chưa giải được câu này');
    expect(q.sampleSolution).toBeUndefined();
  });

  it('giữ lý do AI tự ghi và thêm lý do chưa giải', () => {
    const [q] = mapParsedQuestions(
      parse([{ type: 'short_answer', promptText: 'Đo độ dài', points: 1, needsReview: true, reviewNote: 'Hình mờ, thiếu số đo.' }]),
      true
    );
    expect(q.aiReviewNote).toBe('Hình mờ, thiếu số đo. AI chưa giải được câu này, thầy cô hãy nhập đáp án hoặc lời giải.');
  });

  it('nhãn đáp án không khớp thì để trống, không tự chọn A', () => {
    const [q] = mapParsedQuestions(
      parse([{ type: 'single_choice', promptText: 'Chọn', points: 1, options: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }], correctOptionLabel: 'E' }]),
      true
    );
    expect(q.correctOptionId).toBeUndefined();
    expect(q.aiReviewNote).toContain('chưa giải được');
  });

  it('mệnh đề đúng/sai thiếu kết luận thì để trống, không mặc định là Đúng', () => {
    const [q] = mapParsedQuestions(
      parse([{ type: 'true_false_multi', promptText: 'Đúng ghi Đ', points: 1, statements: [{ label: 'a', text: '1 m = 100 cm', isTrue: true }, { label: 'b', text: '3 kg = 300 g' }] }]),
      true
    );
    expect(q.statements!.map((s) => s.isTrue)).toEqual([true, undefined]);
    expect('isTrue' in q.statements![1]).toBe(false); // Firestore rejects undefined fields
    expect(q.aiReviewNote).toContain('chưa giải được');
  });

  it('câu đã giải đủ thì không bị gắn cờ, và khi tắt AI giải đề thì không gắn cờ chưa giải', () => {
    const solved = parse([{ type: 'essay', promptText: 'Tính chu vi', points: 1, sampleSolutionText: 'Chu vi là: $(8 + 5) \\times 2 = 26$ (cm)\nĐáp số: 26 cm' }]);
    expect(mapParsedQuestions(solved, true)[0].aiReviewNote).toBeUndefined();
    const unsolved = parse([{ type: 'essay', promptText: 'Tính chu vi', points: 1 }]);
    expect(mapParsedQuestions(unsolved, false)[0].aiReviewNote).toBeUndefined();
  });

  it('đáp án ngắn của AI được viết lại như giáo viên gõ', () => {
    const [q] = mapParsedQuestions(parse([{ type: 'short_answer', promptText: 'Tính', points: 1, acceptableAnswers: ['$7\\,023$', '7 023', '$\\,$'] }]), true);
    expect(q.acceptableAnswers).toEqual(['7 023', '7 023']);
  });
});

describe('Chuẩn hóa LaTeX trong đáp án', () => {
  it.each([
    ['$7\\,023$', '7023'],
    ['7\\,023', '7023'],
    ['1\\;000\\;000', '1000000'],
    ['2{,}5', '2.5'],
    ['\\frac{3}{4}', '3/4'],
    ['$\\dfrac{3}{4}$ m', '3/4 m'],
    ['26\\text{ cm}', '26 cm'],
    ['3 \\times 4', '3×4'],
    ['12 \\div 3', '12:3'],
  ])('%s → %s', (raw, expected) => expect(normalizeShortAnswer(raw)).toBe(expected));

  it('học sinh ghi 7023, 7 023 hay 7.023 đều đúng với đáp án LaTeX $7\\,023$', () => {
    const q: HomeworkQuestion = { id: 'q', order: 1, type: 'short_answer', prompt: createRichTextFromPlain('Tính'), points: 1, acceptableAnswers: ['$7\\,023$'] };
    for (const text of ['7023', '7 023', '7.023']) {
      expect(gradeSingleQuestion(q, { questionId: 'q', type: 'short_answer', shortAnswerText: text }).isCorrect, text).toBe(true);
    }
    expect(gradeSingleQuestion(q, { questionId: 'q', type: 'short_answer', shortAnswerText: '723' }).isCorrect).toBe(false);
  });
});

describe('Khối lớp', () => {
  it.each([
    ['Lớp 3', 'Khối 3'],
    ['lớp 3', 'Khối 3'],
    ['Khối 3', 'Khối 3'],
    ['3', 'Khối 3'],
    ['', 'Khối 3'],
    [undefined, 'Khối 3'],
    ['Lớp 4', 'Khối 4'],
    ['Lớp 3A', 'Lớp 3A'],
  ])('%s → %s', (raw, expected) => expect(normalizeGrade(raw)).toBe(expected));
});

describe('Bảng số liệu', () => {
  const ai = 'Bảng dưới đây cho biết số sách:\n| Lớp | 3A | 3B | 3C |\n|---|---|---|---|\n| Số sách | 125 | 108 | 132 |\nCả ba lớp quyên góp được bao nhiêu quyển sách?';

  it('AI viết bảng dạng | … | thì thành khối bảng có hàng tiêu đề', () => {
    expect(richTextFromAIText(ai).blocks).toEqual([
      { type: 'paragraph', align: 'left', text: 'Bảng dưới đây cho biết số sách:' },
      { type: 'table', header: true, rows: [{ cells: ['Lớp', '3A', '3B', '3C'] }, { cells: ['Số sách', '125', '108', '132'] }] },
      { type: 'paragraph', align: 'left', text: 'Cả ba lớp quyên góp được bao nhiêu quyển sách?' },
    ]);
  });

  it('bảng không có tiêu đề, hàng thiếu ô được bù cho đủ cột, ô giữ được công thức', () => {
    const [block] = richTextFromAIText('| $\\frac{1}{2}$ | 4 |\n| 3 |').blocks;
    expect(block).toEqual({ type: 'table', header: false, rows: [{ cells: ['$\\frac{1}{2}$', '4'] }, { cells: ['3', ''] }] });
  });

  it('một dòng có dấu | nhưng không phải bảng thì giữ nguyên là chữ', () => {
    expect(richTextFromAIText('Giá trị |x| là 5').blocks[0].type).toBe('paragraph');
  });

  it('trình soạn bài mở và lưu lại bảng không mất dữ liệu; hàng trống bị bỏ', () => {
    const content: RichTextContent = richTextFromAIText(ai);
    expect(docToRichText(richTextToDoc(content))).toEqual(content);
    const doc = richTextToDoc({ version: 1, blocks: [{ type: 'table', header: false, rows: [{ cells: ['1', '2'] }, { cells: ['', ' '] }] }] });
    expect(docToRichText(doc).blocks).toEqual([{ type: 'table', header: false, rows: [{ cells: ['1', '2'] }] }]);
  });

  it('cấu trúc lưu không có mảng lồng trực tiếp trong mảng (Firestore không cho phép)', () => {
    const block = richTextFromAIText(ai).blocks[1];
    const arrayInArray = (v: unknown): boolean =>
      Array.isArray(v)
        ? v.some((x) => Array.isArray(x) || arrayInArray(x))
        : v !== null && typeof v === 'object' && Object.values(v).some(arrayInArray);
    expect(JSON.stringify(block)).toContain('"cells"');
    expect(arrayInArray(block)).toBe(false);
    expect(arrayInArray({ rows: [['a']] })).toBe(true); // the check itself works
  });
});

describe('Giới hạn token đầu ra trên production', () => {
  it('theo số trang, có trần 64 000', () => {
    expect(parseOutputTokenLimit(1)).toBe(12000);
    expect(parseOutputTokenLimit(5)).toBe(28000);
    expect(parseOutputTokenLimit(20)).toBe(64000);
  });
});

describe('Phát hiện AI bỏ sót câu hỏi', () => {
  it('đủ 10 câu đánh số liên tục thì không cảnh báo', () => {
    const c = checkCompleteness(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10'], 10, false);
    expect(isIncomplete(c)).toBe(false);
    expect(incompletenessMessage(c)).toBeNull();
  });

  it('AI dừng ở câu 8 trên đề 10 câu thì báo thiếu câu 9, 10', () => {
    const c = checkCompleteness(['1', '2', '3', '4', '5', '6', '7', '8'], 10, false);
    expect(c.missingNumbers).toEqual([9, 10]);
    expect(incompletenessMessage(c)).toContain('không thấy câu 9, 10');
    expect(incompletenessMessage(c)).toContain('đối chiếu với đề gốc');
  });

  it('số thứ tự nhảy cóc cũng bị phát hiện kể cả khi AI không báo tổng số câu', () => {
    expect(checkCompleteness(['1', '2', '4', '5'], undefined, false).missingNumbers).toEqual([3]);
  });

  it('câu tách ý 3a, 3b được tính là câu 3; "Câu 4" cũng đọc được', () => {
    const c = checkCompleteness(['1', '2', '3a', '3b', 'Câu 4'], 4, false);
    expect(c.missingNumbers).toEqual([]);
    expect(isIncomplete(c)).toBe(false);
  });

  it('chép ít câu hơn số AI đếm được, hoặc AI dừng giữa chừng, đều bị cảnh báo', () => {
    expect(isIncomplete(checkCompleteness([undefined, undefined], 3, false))).toBe(true);
    expect(incompletenessMessage(checkCompleteness(['1', '2'], 2, true))).toContain('dừng trước khi chép xong');
  });

  it('không có số câu nào để so sánh thì không tự đoán là thiếu', () => {
    expect(isIncomplete(checkCompleteness([undefined, undefined], undefined, false))).toBe(false);
  });

  it('kết quả của bộ xử lý mang theo số câu in trên đề', () => {
    const parsed = aiParsedHomeworkResponseSchema.parse({
      title: 'Đề',
      questionCountOnExam: 10,
      questions: [{ sourceNumber: '8', type: 'essay', promptText: 'Tính chu vi', points: 1 }],
    });
    expect(parsed.questionCountOnExam).toBe(10);
    expect(parsed.questions[0].sourceNumber).toBe('8');
  });
});
