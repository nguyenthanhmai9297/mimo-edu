import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { buildHomeworkFromMimo, mimoDatasetSchema } from '../features/homework/mimoImport';

/**
 * Structural checks for every curated set in question-bank/ (source for
 * "Luyện Toán cùng Mimo"). Content correctness still needs teacher review.
 */
const BANK_DIR = 'question-bank';
const files = fs.existsSync(BANK_DIR)
  ? fs.readdirSync(BANK_DIR).filter((f) => f.endsWith('.json')).sort()
  : [];
const normalize = (s: string) => s.replace(/\s/g, '');

describe.skipIf(files.length === 0)('question-bank', () => {
  const datasets = files.map((file) => ({
    file,
    data: mimoDatasetSchema.parse(JSON.parse(fs.readFileSync(path.join(BANK_DIR, file), 'utf8'))),
  }));

  it('uses unique question ids across all files', () => {
    const ids = datasets.flatMap(({ data }) => data.questions.map((q) => q.id));
    expect(ids.length).toBe(new Set(ids).size);
  });

  it('uses unique dataset ids', () => {
    const ids = datasets.map(({ data }) => data.datasetId);
    expect(ids.length).toBe(new Set(ids).size);
  });

  for (const { file, data } of datasets) {
    describe(file, () => {
      it('has well-formed choice questions with an answer among the options', () => {
        const problems: string[] = [];
        for (const q of data.questions) {
          const options = q.options ?? [];
          const labels = options.map((o) => o.id);
          const answers = Array.isArray(q.correctAnswer) ? q.correctAnswer : [q.correctAnswer];
          if (options.length < 2) problems.push(`${q.id}: fewer than 2 options`);
          if (new Set(labels).size !== labels.length) problems.push(`${q.id}: duplicate option ids`);
          if (new Set(options.map((o) => normalize(o.text))).size !== options.length) {
            problems.push(`${q.id}: duplicate option text`);
          }
          if (answers.some((a) => !labels.includes(a))) problems.push(`${q.id}: answer not among options`);
          if (!q.explanation?.trim()) problems.push(`${q.id}: missing explanation`);
          if (!q.topicId || !q.skillId) problems.push(`${q.id}: missing topic/skill`);
        }
        expect(problems).toEqual([]);
      });

      it('covers all four practice levels', () => {
        expect(new Set(data.questions.map((q) => q.level)).size).toBe(4);
      });

      it('converts fully into app questions', () => {
        const draft = buildHomeworkFromMimo(data, ['nhan_biet', 'thong_hieu', 'van_dung', 'thu_thach']);
        expect(draft.skippedIds).toEqual([]);
        expect(draft.questions.filter((q) => q.aiReviewNote)).toEqual([]);
      });
    });
  }
});
