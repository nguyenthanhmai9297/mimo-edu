import { describe, it, expect } from 'vitest';
import fs from 'fs';
import {
  buildHomeworkFromMimo,
  countByLevel,
  isMimoDataset,
  mimoDatasetSchema,
} from '../features/homework/mimoImport';
import { homeworkImportSchema } from '../schemas/validation';
import { createPublicQuestionsSnapshot, gradeSingleQuestion } from '../utils/gradingEngine';

const DATASET_PATH = 'question-bank/MimoEDU_Toan3_ChuyenDe01_40cau.json';
const hasDataset = fs.existsSync(DATASET_PATH);

const sample = {
  schemaVersion: '1.0',
  datasetId: 'demo',
  title: 'Chuyên đề mẫu',
  questions: [
    {
      id: 'M3-X-001', grade: 3, topicId: 'X', skillId: 'X.a', level: 'nhan_biet', type: 'multiple_choice',
      prompt: 'Tính $2+3$', options: [{ id: 'A', text: '5' }, { id: 'B', text: '6' }],
      correctAnswer: 'A', explanation: '2 + 3 = 5', status: 'approved',
    },
    {
      id: 'M3-X-002', grade: 3, level: 'thu_thach', type: 'multiple_choice', prompt: 'Chọn số chẵn',
      options: [{ id: 'A', text: '2' }, { id: 'B', text: '3' }, { id: 'C', text: '4' }],
      correctAnswer: ['A', 'C'],
    },
    { id: 'M3-X-003', level: 'van_dung', type: 'essay', prompt: 'Giải bài toán', correctAnswer: '' },
  ],
};

describe('MimoEDU import', () => {
  it('detects MimoEDU files and does not confuse them with app homework files', () => {
    expect(isMimoDataset(sample)).toBe(true);
    expect(isMimoDataset({ title: 'Đề', questions: [] })).toBe(false);
  });

  it('maps single and multi answers, explanation and curriculum metadata', () => {
    const draft = buildHomeworkFromMimo(mimoDatasetSchema.parse(sample), ['nhan_biet', 'van_dung', 'thu_thach']);
    const [q1, q2] = draft.questions;
    expect(q1.type).toBe('single_choice');
    expect(q1.correctOptionId).toBe('mimo_M3-X-001_opt_A');
    expect(q1.sampleSolution?.blocks[0]).toEqual({ type: 'paragraph', align: 'left', text: '2 + 3 = 5' });
    expect(q1).toMatchObject({ sourceId: 'M3-X-001', topicId: 'X', skillId: 'X.a', level: 'nhan_biet' });
    expect(q2.type).toBe('multiple_choice');
    expect(q2.correctOptionIds).toEqual(['mimo_M3-X-002_opt_A', 'mimo_M3-X-002_opt_C']);
    expect(draft.skippedIds).toEqual(['M3-X-003']);
    expect(draft.questions.reduce((s, q) => s + q.points, 0)).toBe(10);
  });

  it('flags answers that match no option instead of guessing', () => {
    const broken = { ...sample, questions: [{ ...sample.questions[0], correctAnswer: 'D' }] };
    const [q] = buildHomeworkFromMimo(mimoDatasetSchema.parse(broken), ['nhan_biet']).questions;
    expect(q.correctOptionId).toBeUndefined();
    expect(q.aiReviewNote).toMatch(/không khớp/);
  });
});

describe.skipIf(!hasDataset)('MimoEDU Toán 3 – Chuyên đề 01 (40 câu)', () => {
  const dataset = mimoDatasetSchema.parse(JSON.parse(fs.readFileSync(DATASET_PATH, 'utf8')));

  it('has 10 questions per level', () => {
    expect(countByLevel(dataset)).toEqual({ nhan_biet: 10, thong_hieu: 10, van_dung: 10, thu_thach: 10 });
  });

  it('converts all 40 questions into a valid homework worth 10 points', () => {
    const draft = buildHomeworkFromMimo(dataset, ['nhan_biet', 'thong_hieu', 'van_dung', 'thu_thach']);
    expect(draft.questions).toHaveLength(40);
    expect(draft.skippedIds).toEqual([]);
    expect(draft.grade).toBe('Khối 3');
    expect(draft.questions.every((q) => q.type === 'single_choice' && q.correctOptionId && !q.aiReviewNote)).toBe(true);
    expect(draft.questions.reduce((s, q) => s + q.points, 0)).toBeCloseTo(10);
    // Round-trips through the app's own import format
    expect(homeworkImportSchema.safeParse({ ...draft, answerSource: 'teacher' }).success).toBe(true);
  });

  it('grades each question with the answer key from the file', () => {
    const draft = buildHomeworkFromMimo(dataset, ['nhan_biet', 'thong_hieu', 'van_dung', 'thu_thach']);
    for (const q of draft.questions) {
      const source = dataset.questions.find((s) => s.id === q.sourceId)!;
      const picked = q.options!.find((o) => o.label === source.correctAnswer)!;
      const result = gradeSingleQuestion(q, { questionId: q.id, type: q.type, selectedOptionId: picked.id });
      expect(result.score).toBe(q.points);
    }
  });

  it('keeps answers, explanations and metadata out of the student snapshot', () => {
    const draft = buildHomeworkFromMimo(dataset, ['thu_thach']);
    for (const q of createPublicQuestionsSnapshot(draft.questions)) {
      expect(q).not.toHaveProperty('correctOptionId');
      expect(q).not.toHaveProperty('sampleSolution');
      expect(q).not.toHaveProperty('level');
    }
  });
});
