import { describe, it, expect } from 'vitest';
import fs from 'fs';
import type { HomeworkQuestion } from '../types/domain';
import type { PracticeQuestion } from '../types/practice';
import { createRng, validatePracticeImport } from '../utils/practiceEngine';
import { createRichTextFromPlain } from '../utils/gradingEngine';
import {
  fromHomeworkQuestion,
  fromManual,
  fromPracticeQuestion,
  isAnswerCorrect,
  manualQuestionProblem,
  richToPlain,
  shuffleOptions,
} from '../features/tools/toolQuestions';

const rt = createRichTextFromPlain;

const single: HomeworkQuestion = {
  id: 'q1', order: 1, type: 'single_choice', prompt: rt('2 + 3 = ?'), points: 1,
  options: [{ id: 'a', label: 'A', content: rt('4') }, { id: 'b', label: 'B', content: rt('5') }],
  correctOptionId: 'b',
};

describe('toolQuestions', () => {
  it('converts single and multiple choice homework questions', () => {
    const [q] = fromHomeworkQuestion(single, 'Đề 1');
    expect(q.correct).toEqual([1]);
    expect(q.multi).toBe(false);
    const multi = fromHomeworkQuestion(
      { ...single, id: 'q2', type: 'multiple_choice', correctOptionId: undefined, correctOptionIds: ['a', 'b'] },
      'Đề 1'
    )[0];
    expect(multi.correct).toEqual([0, 1]);
    expect(multi.multi).toBe(true);
  });

  it('splits true/false statements and skips questions without an answer key', () => {
    const tf: HomeworkQuestion = {
      id: 'q3', order: 3, type: 'true_false_multi', prompt: rt('Khối hộp chữ nhật có:'), points: 1,
      statements: [
        { id: 's1', label: 'a', statement: rt('8 đỉnh'), isTrue: true, points: 0.5 },
        { id: 's2', label: 'b', statement: rt('6 đỉnh'), isTrue: false, points: 0.5 },
        { id: 's3', label: 'c', statement: rt('?'), points: 0.5 },
      ],
    };
    const out = fromHomeworkQuestion(tf, 'Đề 1');
    expect(out).toHaveLength(2);
    expect(out[1].correct).toEqual([1]);
    expect(richToPlain(out[0].prompt)).toContain('Ý a: 8 đỉnh');
    expect(fromHomeworkQuestion({ ...single, correctOptionId: undefined }, 'x')).toEqual([]);
    expect(fromHomeworkQuestion({ ...single, type: 'essay' }, 'x')).toEqual([]);
  });

  it('converts the N01 practice bank', () => {
    const N01 = JSON.parse(fs.readFileSync('question-bank/MimoEDU_Toan3_ChuyenDe01_40cau.json', 'utf8'));
    const qs = validatePracticeImport(N01).questions.map((q) => ({ ...q, updatedAt: '' }) as PracticeQuestion);
    const tool = qs.map((q) => fromPracticeQuestion(q, 'N01')).filter(Boolean);
    expect(tool).toHaveLength(40);
    expect(tool.every((q) => q!.correct.length === 1 && q!.options.length === 4 && q!.explanation)).toBe(true);
  });

  it('validates and converts manual questions, dropping empty options', () => {
    expect(manualQuestionProblem({ id: 'm', prompt: '', options: ['1', '2'], correct: [0] })).toMatch(/nội dung/);
    expect(manualQuestionProblem({ id: 'm', prompt: 'x', options: ['1', ''], correct: [0] })).toMatch(/2 đáp án/);
    expect(manualQuestionProblem({ id: 'm', prompt: 'x', options: ['1', '2'], correct: [] })).toMatch(/đáp án đúng/);
    const q = fromManual({ id: 'm', prompt: '$3 \\times 4$ = ?', options: ['10', '', '12', ''], correct: [2] })!;
    expect(q.options).toHaveLength(2);
    expect(q.correct).toEqual([1]);
  });

  it('keeps the answer key in sync when shuffling options', () => {
    const [q] = fromHomeworkQuestion(single, 'x');
    for (let seed = 1; seed < 10; seed++) {
      const s = shuffleOptions(q, createRng(seed));
      expect(richToPlain(s.options[s.correct[0]])).toBe('5');
      expect(isAnswerCorrect(s, s.correct)).toBe(true);
    }
    expect(isAnswerCorrect({ ...q, correct: [0, 2] }, [2, 0, 0])).toBe(true);
    expect(isAnswerCorrect({ ...q, correct: [0, 2] }, [0])).toBe(false);
  });
});
