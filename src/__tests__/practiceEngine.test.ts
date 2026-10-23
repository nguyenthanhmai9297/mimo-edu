import { describe, it, expect } from 'vitest';
import fs from 'fs';
import { PRACTICE_CATALOG, PRACTICE_TOPICS } from '../data/practiceCatalog';
import type { PracticeQuestion } from '../types/practice';
import {
  buildAttemptQuestions,
  createRng,
  gradePracticeAttempt,
  pickPracticeQuestions,
  servableQuestions,
  validatePracticeImport,
} from '../utils/practiceEngine';

const N01 = JSON.parse(
  fs.readFileSync('question-bank/MimoEDU_Toan3_ChuyenDe01_40cau.json', 'utf8')
);
const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

function approvedN01(): PracticeQuestion[] {
  return validatePracticeImport(N01).questions.map((q) => ({
    ...q,
    status: 'approved' as const,
    updatedAt: '2026-10-23T00:00:00.000Z',
  }));
}

describe('practice catalog', () => {
  it('has 5 groups and 35 unique topics N01–N35', () => {
    expect(PRACTICE_CATALOG).toHaveLength(5);
    expect(PRACTICE_TOPICS.map((t) => t.id)).toEqual(
      Array.from({ length: 35 }, (_, i) => `N${String(i + 1).padStart(2, '0')}`)
    );
  });

  it('labels every N01 skill used in the question file', () => {
    const skills = new Set<string>(N01.questions.map((q: { skillId: string }) => q.skillId));
    const labelled = Object.keys(PRACTICE_TOPICS[0].skills ?? {});
    expect([...skills].every((s) => labelled.includes(s))).toBe(true);
  });
});

describe('validatePracticeImport', () => {
  it('accepts the N01 set (40 questions) without errors', () => {
    const v = validatePracticeImport(N01);
    expect(v.errors).toEqual([]);
    expect(v.questions).toHaveLength(40);
    expect(v.dataset).toMatchObject({ id: 'mimoedu-toan3-n01-v2', topicId: 'N01' });
    expect(v.questions.every((q) => q.status === 'draft' && q.type === 'single_choice')).toBe(true);
    // The file is not approved yet: the teacher must review before publishing
    expect(v.warnings.some((w) => /approved/.test(w.message))).toBe(true);
  });

  it('reports conflicts with ids already in the database', () => {
    const v = validatePracticeImport(N01, ['M3-N01-001', 'M3-N01-040']);
    expect(v.conflictIds).toEqual(['M3-N01-001', 'M3-N01-040']);
  });

  it('detects duplicate ids, unknown topics and invalid levels', () => {
    const data = clone(N01);
    data.questions[1].id = data.questions[0].id;
    data.questions[2].topicId = 'N99';
    data.questions[3].level = 'kho';
    const messages = validatePracticeImport(data).errors.map((e) => `${e.questionId}: ${e.message}`);
    expect(messages).toContain('M3-N01-001: Mã câu bị trùng trong tệp.');
    expect(messages.some((m) => m.startsWith('M3-N01-003') && m.includes('N99'))).toBe(true);
    expect(messages.some((m) => m.startsWith('M3-N01-004') && m.includes('kho'))).toBe(true);
  });

  it('detects missing, malformed and unknown answers', () => {
    const data = clone(N01);
    delete data.questions[0].correctAnswer;
    data.questions[1].correctAnswer = 2;
    data.questions[2].correctAnswer = 'E';
    data.questions[3].correctAnswer = ['A', 'A'];
    const errors = validatePracticeImport(data).errors;
    const of = (id: string) => errors.filter((e) => e.questionId === id).map((e) => e.message).join(' | ');
    expect(of('M3-N01-001')).toMatch(/thiếu hoặc sai định dạng/);
    expect(of('M3-N01-002')).toMatch(/thiếu hoặc sai định dạng/);
    expect(of('M3-N01-003')).toMatch(/không trùng với phương án nào/);
    expect(of('M3-N01-004')).toMatch(/bị lặp/);
  });

  it('detects bad options, unsupported types and mixed topics', () => {
    const data = clone(N01);
    data.questions[0].options[1].text = data.questions[0].options[0].text;
    data.questions[1].options = [{ id: 'A', text: '1' }];
    data.questions[2].type = 'essay';
    data.questions[3].topicId = 'N02';
    data.questions[3].skillId = 'N02.compare';
    const v = validatePracticeImport(data);
    const text = v.errors.map((e) => e.message).join(' | ');
    expect(text).toMatch(/cùng nội dung/);
    expect(text).toMatch(/từ 2 đến 6 phương án/);
    expect(text).toMatch(/chưa được hỗ trợ/);
    expect(text).toMatch(/chỉ được chứa một chuyên đề/);
  });

  it('rejects non-objects and missing metadata without throwing', () => {
    expect(validatePracticeImport(null).errors).toHaveLength(1);
    expect(validatePracticeImport({ questions: [] }).errors.length).toBeGreaterThan(1);
  });
});

describe('practice sessions', () => {
  it('serves only approved questions of published sets', () => {
    const qs = approvedN01();
    qs[0].status = 'draft';
    expect(servableQuestions(qs, [])).toEqual([]);
    expect(servableQuestions(qs, ['mimoedu-toan3-n01-v2'])).toHaveLength(39);
  });

  it('picks by level and skill, at most 10 questions', () => {
    const qs = approvedN01();
    const rng = createRng(1);
    const byLevel = pickPracticeQuestions(qs, { level: 'thu_thach' }, rng);
    expect(byLevel).toHaveLength(10);
    expect(byLevel.every((q) => q.level === 'thu_thach')).toBe(true);
    const bySkill = pickPracticeQuestions(qs, { level: 'thong_hieu', skillId: 'N01.compare' }, rng);
    expect(bySkill.length).toBeGreaterThan(0);
    expect(bySkill.every((q) => q.skillId === 'N01.compare' && q.level === 'thong_hieu')).toBe(true);
  });

  it('sends no answers, explanations or option ids to the browser', () => {
    const qs = approvedN01();
    const { publicQuestions } = buildAttemptQuestions(qs, createRng(7));
    const payload = JSON.stringify(publicQuestions);
    for (const q of qs) expect(payload).not.toContain(q.explanation);
    expect(payload).not.toMatch(/correct|explanation|"id":"[A-D]"/);
    expect(Object.keys(publicQuestions[0]).sort()).toEqual(['id', 'level', 'options', 'prompt', 'skillId', 'type']);
    expect(typeof publicQuestions[0].options[0]).toBe('string');
  });

  it('shuffles options so the correct one is not always first', () => {
    const qs = approvedN01();
    const { optionOrder } = buildAttemptQuestions(qs, createRng(42));
    const positions = qs.map((q) => optionOrder[q.id].indexOf(q.correctAnswers[0]));
    expect(new Set(positions).size).toBe(4);
  });

  it('grades by display position and summarizes skills', () => {
    const qs = approvedN01().slice(0, 4);
    const attempt = { questionIds: qs.map((q) => q.id), ...buildAttemptQuestions(qs, createRng(3)) };
    const answers: Record<string, unknown> = {};
    qs.forEach((q, i) => {
      const correctPos = attempt.optionOrder[q.id].indexOf(q.correctAnswers[0]);
      answers[q.id] = i < 3 ? [correctPos] : [(correctPos + 1) % 4];
    });
    answers.unknown = [0];
    const graded = gradePracticeAttempt(attempt, qs, answers);
    expect(graded.score).toBe(3);
    expect(graded.total).toBe(4);
    expect(graded.results[3].correct).toBe(false);
    expect(graded.results[3].explanation).toBe(qs[3].explanation);
    expect(graded.skills.reduce((s, x) => s + x.total, 0)).toBe(4);
  });

  it('ignores malformed answers instead of crashing', () => {
    const qs = approvedN01().slice(0, 2);
    const attempt = { questionIds: qs.map((q) => q.id), ...buildAttemptQuestions(qs, createRng(5)) };
    const graded = gradePracticeAttempt(attempt, qs, { [qs[0].id]: ['x', 99, -1, 1.5], [qs[1].id]: 'A' });
    expect(graded.answers[qs[0].id]).toEqual([]);
    expect(graded.score).toBe(0);
    expect(gradePracticeAttempt(attempt, qs, 'nonsense').total).toBe(2);
  });
});
