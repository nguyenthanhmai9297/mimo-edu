import { describe, expect, it } from 'vitest';
import { compareWithKey, type AnswerKey } from '../../scripts/ai-eval/compare';
import type { ParsedHomeworkOutput } from '../services/aiAdapter';
import { createRichTextFromPlain } from '../utils/gradingEngine';
import type { HomeworkQuestion } from '../types/domain';

/**
 * The scorer used for the real-AI check. Its inputs here are hand-written
 * conversions (not AI output) to prove it catches every kind of mistake.
 */
const key: AnswerKey = {
  file: 'x.png',
  mimeType: 'image/png',
  grade: 'Khối 3',
  questions: [
    { no: 1, type: 'single_choice', mustContain: [['125'], ['× 4', '\\times 4']], options: 4, correct: 'B', skill: 'nhân' },
    { no: 2, type: 'true_false_multi', statements: [true, false], skill: 'đúng sai' },
    { no: 3, type: 'short_answer', mustContain: [['chu vi']], answer: '26 cm', unitMode: 'optional', figure: true, skill: 'hình' },
    { no: 4, type: 'essay', mustContain: [['\\frac{1}{5}', '1/5']], answer: '1000 kg', allowShortAnswer: true, skill: 'lời văn' },
  ],
};
const opts = (...labels: string[]) => labels.map((label) => ({ id: `o${label}`, label, content: createRichTextFromPlain(label) }));
const output = (questions: HomeworkQuestion[], figures: ParsedHomeworkOutput['figures'] = []): ParsedHomeworkOutput => ({
  title: 'Đề',
  description: '',
  grade: 'Khối 3',
  questions,
  figures,
  completeness: { received: questions.length, missingNumbers: [], cutOff: false },
  answerSource: 'ai',
  aiSolverEnabled: true,
  provider: 'hand-written',
  model: 'none',
  durationMs: 0,
  estimatedCostUsd: 0,
});
const base = { order: 1, points: 1 };
const right: HomeworkQuestion[] = [
  { ...base, id: 'q1', type: 'single_choice', prompt: createRichTextFromPlain('Kết quả của $125 \\times 4$ là'), options: opts('A', 'B', 'C', 'D'), correctOptionId: 'oB' },
  {
    ...base, id: 'q2', type: 'true_false_multi', prompt: createRichTextFromPlain('Đúng ghi Đ'),
    statements: [
      { id: 's1', label: 'a', statement: createRichTextFromPlain('1 m = 100 cm'), isTrue: true, points: 0.5 },
      { id: 's2', label: 'b', statement: createRichTextFromPlain('3 kg = 300 g'), isTrue: false, points: 0.5 },
    ],
  },
  { ...base, id: 'q3', type: 'short_answer', prompt: createRichTextFromPlain('Tính chu vi hình chữ nhật'), acceptableAnswers: ['26 cm', '26'] },
  { ...base, id: 'q4', type: 'essay', prompt: createRichTextFromPlain('Đã bán $\\frac{1}{5}$ số gạo'), sampleSolution: createRichTextFromPlain('Còn lại: 1 250 - 250 = 1 000 (kg)') },
];
const figure = [{ questionId: 'q3', page: 1, box: [600, 600, 900, 800] as [number, number, number, number], description: 'hình chữ nhật' }];

describe('Bộ so sánh kết quả AI với đáp án đề mẫu', () => {
  it('chấm đạt khi mọi câu đúng', () => {
    const rows = compareWithKey(output(right, figure), key, true);
    expect(rows.map((r) => [r.recognized, r.solved])).toEqual([[true, true], [true, true], [true, true], [true, true]]);
  });

  it('phát hiện chép thiếu, sai dạng câu, thiếu lựa chọn, thiếu hình và đáp án sai', () => {
    const wrong: HomeworkQuestion[] = [
      { ...right[0], prompt: createRichTextFromPlain('Kết quả của 125 là'), options: opts('A', 'B', 'C'), correctOptionId: 'oC' },
      { ...right[1], statements: right[1].statements!.map((s) => ({ ...s, isTrue: true })) },
      { ...right[2], acceptableAnswers: ['26 mm'] },
      { ...right[3], sampleSolution: createRichTextFromPlain('Còn lại 250 kg') },
    ];
    const rows = compareWithKey(output(wrong), key, true);
    expect(rows[0].recognized).toBe(false);
    expect(rows[0].notes.join(' ')).toContain('thiếu "× 4"');
    expect(rows[0].notes.join(' ')).toContain('3 lựa chọn');
    expect(rows[0].solved).toBe(false);
    expect(rows[1]).toMatchObject({ recognized: true, solved: false });
    expect(rows[2].notes).toContain('không khoanh vùng hình vẽ');
    expect(rows[2].solved).toBe(false);
    expect(rows[3].solved).toBe(false);
  });

  it('câu bị thiếu trong kết quả AI bị tính là sai', () => {
    const rows = compareWithKey(output(right.slice(0, 2)), key, true);
    expect(rows[3]).toMatchObject({ recognized: false, solved: false });
  });

  it('khi tắt AI giải đề thì chỉ chấm phần nhận diện', () => {
    const rows = compareWithKey(output(right, figure), key, false);
    expect(rows.every((r) => r.recognized && r.solved === null)).toBe(true);
  });
});
