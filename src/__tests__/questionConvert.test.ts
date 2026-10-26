import { describe, expect, it } from 'vitest';
import type { HomeworkQuestion, RichTextContent } from '../types/domain';
import { changeQuestionType, isPlainContent, richToText } from '../features/homework/questionConvert';

const text = (t: string): RichTextContent => ({ version: 1, blocks: [{ type: 'paragraph', align: 'left', text: t }] });
const IMG = 'data:image/jpeg;base64,AAAA';
// A real-looking prompt: text, a formula and a figure
const prompt: RichTextContent = {
  version: 1,
  blocks: [
    { type: 'paragraph', align: 'left', text: 'Hình bên có bao nhiêu hình tam giác?' },
    { type: 'math', inline: false, latex: '\\frac{3}{4} + \\frac{1}{4}' },
    { type: 'image', url: IMG, alt: 'Hình vẽ' },
  ],
} as RichTextContent;
const solution = text('Đếm từng hình nhỏ rồi cộng lại.');

const base = { id: 'q1', order: 3, prompt, points: 2, sampleSolution: solution, topicId: 't1', aiReviewNote: 'kiểm tra' };
const single: HomeworkQuestion = {
  ...base,
  type: 'single_choice',
  options: [
    { id: 'a', label: 'A', content: text('3') },
    { id: 'b', label: 'B', content: text('5') },
    { id: 'c', label: 'C', content: { version: 1, blocks: [{ type: 'math', inline: false, latex: '\\frac{1}{2}' }] } as RichTextContent },
    { id: 'd', label: 'D', content: { version: 1, blocks: [{ type: 'image', url: IMG, alt: '' }] } as RichTextContent },
  ],
  correctOptionId: 'b',
};
const multiple: HomeworkQuestion = { ...single, type: 'multiple_choice', correctOptionId: undefined, correctOptionIds: ['a', 'b'] };
const tf: HomeworkQuestion = {
  ...base,
  type: 'true_false_multi',
  statements: [
    { id: 's1', label: 'a', statement: text('12 > 10'), isTrue: true, points: 1 },
    { id: 's2', label: 'b', statement: text('5 + 5 = 11'), isTrue: false, points: 1 },
  ],
};
const short: HomeworkQuestion = { ...base, type: 'short_answer', acceptableAnswers: ['42 cm', '42cm'], unitMode: 'optional' };
const essay: HomeworkQuestion = { ...base, type: 'essay', rubric: 'Đúng phép tính 1đ, đúng đáp số 1đ' };

const keepsCommon = (q: HomeworkQuestion) => {
  expect(q.prompt).toBe(prompt);
  expect(q.points).toBe(2);
  expect(q.order).toBe(3);
  expect(q.sampleSolution).toBe(solution);
  expect(q.topicId).toBe('t1');
  expect(q.aiReviewNote).toBe('kiểm tra');
};

describe('changeQuestionType – không mất nội dung khi đổi dạng câu', () => {
  const all = [single, multiple, tf, short, essay];
  for (const from of all) {
    for (const to of ['single_choice', 'multiple_choice', 'true_false_multi', 'short_answer', 'essay'] as const) {
      if (from.type === to) continue;
      it(`${from.type} → ${to}: giữ đề bài, công thức, hình, điểm, lời giải`, () => {
        const { question } = changeQuestionType(from, to);
        expect(question.type).toBe(to);
        keepsCommon(question);
      });
    }
  }

  it('cùng dạng: không đổi gì', () => {
    expect(changeQuestionType(single, 'single_choice')).toEqual({ question: single, losses: [], notes: [] });
  });

  it('1 đáp án → nhiều đáp án: giữ nguyên phương án (cả hình, công thức) và đáp án đúng, không cần cảnh báo', () => {
    const { question, losses } = changeQuestionType(single, 'multiple_choice');
    expect(losses).toEqual([]);
    expect(question.options!.map((o) => o.content)).toEqual(single.options!.map((o) => o.content));
    expect(question.correctOptionIds).toEqual([question.options![1].id]);
    expect(question.correctOptionId).toBeUndefined();
  });

  it('nhiều đáp án → 1 đáp án: cảnh báo khi có hơn 1 đáp án đúng', () => {
    const { question, losses } = changeQuestionType(multiple, 'single_choice');
    expect(losses).toHaveLength(1);
    expect(losses[0]).toContain('2 đáp án đúng');
    expect(question.correctOptionId).toBe(question.options![0].id);
    expect(question.options).toHaveLength(4);
  });

  it('trắc nghiệm → Đúng/Sai: phương án thành ý, đúng/sai giữ nguyên, nội dung có hình giữ nguyên', () => {
    const { question, losses } = changeQuestionType(single, 'true_false_multi');
    expect(losses).toEqual([]);
    expect(question.statements!.map((s) => s.isTrue)).toEqual([false, true, false, false]);
    expect(question.statements![3].statement).toBe(single.options![3].content);
    expect(question.options).toBeUndefined();
  });

  it('Đúng/Sai → trắc nghiệm nhiều đáp án: ý Đúng thành đáp án đúng', () => {
    const { question, losses } = changeQuestionType(tf, 'multiple_choice');
    expect(losses).toEqual([]);
    expect(question.options!.map((o) => o.content)).toEqual(tf.statements!.map((s) => s.statement));
    expect(question.correctOptionIds).toEqual([question.options![0].id]);
    expect(question.statements).toBeUndefined();
  });

  it('trắc nghiệm → đáp số ngắn: đáp án đúng thành đáp số, cảnh báo phương án sai và hình', () => {
    const { question, losses } = changeQuestionType(single, 'short_answer');
    expect(question.acceptableAnswers).toEqual(['5']);
    expect(losses.join(' ')).toContain('Các phương án sai');
    expect(losses.join(' ')).toContain('[có hình]');
  });

  it('đáp số ngắn → 1 đáp án: đáp số thành phương án A đúng, cảnh báo cách viết khác và tùy chọn chấm', () => {
    const { question, losses, notes } = changeQuestionType(short, 'single_choice');
    expect(richToText(question.options![0].content).text).toBe('42 cm');
    expect(question.correctOptionId).toBe(question.options![0].id);
    expect(question.options).toHaveLength(4);
    expect(question.unitMode).toBeUndefined();
    expect(losses.join(' ')).toContain('42cm');
    expect(losses.join(' ')).toContain('Tùy chọn chấm');
    expect(notes.length).toBeGreaterThan(0);
  });

  it('tự luận → trắc nghiệm: cảnh báo mất hướng dẫn chấm, tạo 4 phương án trống', () => {
    const { question, losses } = changeQuestionType(essay, 'single_choice');
    expect(losses[0]).toContain('Đúng phép tính 1đ');
    expect(question.options).toHaveLength(4);
    expect(question.rubric).toBeUndefined();
  });

  it('trắc nghiệm → tự luận: đáp án cũ được chép vào hướng dẫn chấm', () => {
    const { question, losses } = changeQuestionType(single, 'essay');
    expect(question.rubric).toContain('B. 5 (đúng)');
    expect(question.rubric).toContain('$\\frac{1}{2}$');
    expect(losses.join(' ')).toContain('D');
  });

  it('Đúng/Sai → đáp số ngắn: cảnh báo mất các ý', () => {
    const { question, losses } = changeQuestionType(tf, 'short_answer');
    expect(question.acceptableAnswers).toEqual([]);
    expect(losses[0]).toContain('12 > 10');
  });

  it('không làm thay đổi câu gốc (để hoàn tác)', () => {
    const before = JSON.stringify(single);
    changeQuestionType(single, 'essay');
    changeQuestionType(single, 'true_false_multi');
    expect(JSON.stringify(single)).toBe(before);
  });
});

describe('isPlainContent', () => {
  it('chỉ một đoạn chữ thường mới sửa được trong ô một dòng', () => {
    expect(isPlainContent(text('3'))).toBe(true);
    expect(isPlainContent({ version: 1, blocks: [] } as unknown as RichTextContent)).toBe(true);
    expect(isPlainContent(single.options![2].content)).toBe(false);
    expect(isPlainContent(single.options![3].content)).toBe(false);
    expect(isPlainContent(prompt)).toBe(false);
  });
});
