import { findPracticeTopic } from '../data/practiceCatalog.js';
import {
  PRACTICE_LEVELS,
  PracticeAttempt,
  PracticeLevel,
  PracticeOption,
  PracticePublicQuestion,
  PracticeQuestion,
  PracticeQuestionResult,
  PracticeSkillSummary,
} from '../types/practice.js';

/**
 * Pure logic for "Luyện Toán cùng Mimo", shared by the API server, the teacher
 * pages and tests: import validation, question selection, answer stripping and
 * grading. Nothing here touches Firestore.
 */

// ---------------------------------------------------------------------------
// Import validation (MimoEDU question files)
// ---------------------------------------------------------------------------

export interface ImportIssue {
  questionId?: string;
  message: string;
}

/** A validated question ready to be stored (timestamps added by the caller). */
export type ImportedQuestion = Omit<PracticeQuestion, 'updatedAt' | 'updatedBy'>;

export interface ImportValidation {
  dataset: {
    id: string;
    title: string;
    schemaVersion: string;
    topicId: string;
    notes?: string;
  } | null;
  questions: ImportedQuestion[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Question ids that already exist in the database. */
  conflictIds: string[];
}

const DOC_ID = /^[a-zA-Z0-9_\-@.]{1,128}$/;
const MAX_PROMPT = 2000;
const MAX_EXPLANATION = 4000;
const MAX_OPTION = 500;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);
const normalizeText = (s: string) => s.replace(/\s+/g, '').toLowerCase();

/**
 * Validates a MimoEDU question file (schemaVersion 1.x) without throwing.
 * Any error blocks the import; warnings are shown to the teacher.
 */
export function validatePracticeImport(
  json: unknown,
  existingIds: Iterable<string> = []
): ImportValidation {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const result: ImportValidation = { dataset: null, questions: [], errors, warnings, conflictIds: [] };

  if (!isObject(json)) {
    errors.push({ message: 'Tệp không phải là một đối tượng JSON.' });
    return result;
  }
  const { schemaVersion, datasetId, title, notes, questions } = json;
  if (typeof schemaVersion !== 'string' || !schemaVersion.startsWith('1.')) {
    errors.push({ message: `schemaVersion không được hỗ trợ (${String(schemaVersion)}). Cần 1.x.` });
  }
  if (typeof datasetId !== 'string' || !DOC_ID.test(datasetId)) {
    errors.push({ message: 'datasetId thiếu hoặc chứa ký tự không hợp lệ.' });
  }
  if (typeof title !== 'string' || !title.trim()) {
    errors.push({ message: 'Thiếu tiêu đề bộ câu hỏi (title).' });
  }
  if (!Array.isArray(questions) || questions.length === 0) {
    errors.push({ message: 'Tệp không có câu hỏi nào (questions).' });
    return result;
  }

  const seenIds = new Set<string>();
  const topicIds = new Set<string>();
  const existing = new Set(existingIds);
  let unreviewed = 0;

  questions.forEach((raw, index) => {
    const label = `Câu thứ ${index + 1}`;
    if (!isObject(raw)) {
      errors.push({ message: `${label}: không phải đối tượng.` });
      return;
    }
    const id = typeof raw.id === 'string' ? raw.id : '';
    const qid = id || label;
    const err = (message: string) => errors.push({ questionId: qid, message });

    if (!DOC_ID.test(id)) err('Mã câu (id) thiếu hoặc chứa ký tự không hợp lệ.');
    else if (seenIds.has(id)) err('Mã câu bị trùng trong tệp.');
    else {
      seenIds.add(id);
      if (existing.has(id)) result.conflictIds.push(id);
    }

    const topicId = typeof raw.topicId === 'string' ? raw.topicId : '';
    if (!findPracticeTopic(topicId)) err(`Chuyên đề "${topicId}" không có trong danh mục 35 chuyên đề.`);
    else topicIds.add(topicId);

    const skillId = typeof raw.skillId === 'string' ? raw.skillId : '';
    if (!skillId.startsWith(`${topicId}.`) || skillId.length <= topicId.length + 1) {
      err(`Mã kĩ năng "${skillId}" phải có dạng ${topicId || 'Nxx'}.ten_ki_nang.`);
    }

    const level = raw.level as PracticeLevel;
    if (!PRACTICE_LEVELS.includes(level)) err(`Mức độ "${String(raw.level)}" không hợp lệ.`);

    const prompt = typeof raw.prompt === 'string' ? raw.prompt.trim() : '';
    if (!prompt) err('Thiếu nội dung câu hỏi (prompt).');
    else if (prompt.length > MAX_PROMPT) err(`Nội dung câu hỏi dài quá ${MAX_PROMPT} ký tự.`);

    if (raw.type !== 'multiple_choice' && raw.type !== 'single_choice') {
      err(`Dạng câu "${String(raw.type)}" chưa được hỗ trợ (chỉ nhận trắc nghiệm).`);
    }

    const options: PracticeOption[] = [];
    if (!Array.isArray(raw.options) || raw.options.length < 2 || raw.options.length > 6) {
      err('Cần từ 2 đến 6 phương án (options).');
    } else {
      const optionIds = new Set<string>();
      const optionTexts = new Set<string>();
      for (const opt of raw.options) {
        const optId = isObject(opt) && typeof opt.id === 'string' ? opt.id.trim() : '';
        const text = isObject(opt) && typeof opt.text === 'string' ? opt.text.trim() : '';
        if (!optId || !text) {
          err('Có phương án thiếu id hoặc nội dung.');
          continue;
        }
        if (text.length > MAX_OPTION) err(`Phương án ${optId} dài quá ${MAX_OPTION} ký tự.`);
        if (optionIds.has(optId)) err(`Mã phương án "${optId}" bị trùng.`);
        if (optionTexts.has(normalizeText(text))) err(`Hai phương án có cùng nội dung "${text}".`);
        optionIds.add(optId);
        optionTexts.add(normalizeText(text));
        options.push({ id: optId, text });
      }
    }

    const rawAnswer = raw.correctAnswer;
    const answers = Array.isArray(rawAnswer) ? rawAnswer : [rawAnswer];
    const correctAnswers: string[] = [];
    if (
      answers.length === 0 ||
      answers.some((a) => typeof a !== 'string' || !a.trim())
    ) {
      err('Đáp án (correctAnswer) thiếu hoặc sai định dạng: cần mã phương án, ví dụ "A" hoặc ["A","C"].');
    } else {
      for (const a of answers as string[]) {
        const key = a.trim();
        if (!options.some((o) => o.id === key)) err(`Đáp án "${key}" không trùng với phương án nào.`);
        else if (correctAnswers.includes(key)) err(`Đáp án "${key}" bị lặp.`);
        else correctAnswers.push(key);
      }
    }
    if (raw.type === 'single_choice' && correctAnswers.length > 1) {
      err('Câu một đáp án nhưng khai báo nhiều đáp án đúng.');
    }

    const explanation = typeof raw.explanation === 'string' ? raw.explanation.trim() : '';
    if (!explanation) warnings.push({ questionId: qid, message: 'Chưa có lời giải.' });
    else if (explanation.length > MAX_EXPLANATION) err(`Lời giải dài quá ${MAX_EXPLANATION} ký tự.`);

    if (raw.grade !== undefined && raw.grade !== 3) {
      warnings.push({ questionId: qid, message: `Câu ghi khối lớp ${String(raw.grade)}, không phải lớp 3.` });
    }
    const sourceStatus = typeof raw.status === 'string' ? raw.status : undefined;
    if (sourceStatus !== 'approved') unreviewed += 1;

    result.questions.push({
      id,
      datasetId: typeof datasetId === 'string' ? datasetId : '',
      topicId,
      skillId,
      level,
      // "multiple_choice" in MimoEDU files means a choice question; one answer = single choice
      type: correctAnswers.length > 1 ? 'multiple_choice' : 'single_choice',
      prompt,
      options,
      correctAnswers,
      explanation,
      status: 'draft',
      order: index + 1,
      ...(sourceStatus ? { sourceStatus } : {}),
    });
  });

  if (topicIds.size > 1) {
    errors.push({ message: `Một tệp chỉ được chứa một chuyên đề, tệp này có ${[...topicIds].join(', ')}.` });
  }
  if (unreviewed > 0) {
    warnings.push({ message: `${unreviewed} câu chưa ở trạng thái "approved" trong tệp – cần duyệt trên hệ thống trước khi xuất bản.` });
  }
  if (result.conflictIds.length > 0) {
    warnings.push({ message: `${result.conflictIds.length} câu đã có trên hệ thống (trùng mã).` });
  }

  const topicId = [...topicIds][0] ?? '';
  if (typeof datasetId === 'string') {
    result.dataset = {
      id: typeof datasetId === 'string' ? datasetId : '',
      title: typeof title === 'string' ? title.trim() : '',
      schemaVersion: typeof schemaVersion === 'string' ? schemaVersion : '',
      topicId,
      ...(typeof notes === 'string' && notes.trim() ? { notes: notes.trim() } : {}),
    };
  }
  return result;
}

// ---------------------------------------------------------------------------
// Practice sessions
// ---------------------------------------------------------------------------

export type Rng = () => number;

/** Seedable PRNG (mulberry32) so tests are deterministic. */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export const DEFAULT_PRACTICE_SIZE = 10;

export function pickPracticeQuestions(
  pool: PracticeQuestion[],
  filter: { level: PracticeLevel; skillId?: string | null; count?: number },
  rng: Rng = Math.random
): PracticeQuestion[] {
  const matching = pool.filter(
    (q) =>
      q.status === 'approved' &&
      q.level === filter.level &&
      (!filter.skillId || q.skillId === filter.skillId)
  );
  return shuffle(matching, rng).slice(0, filter.count ?? DEFAULT_PRACTICE_SIZE);
}

/** Strips everything that would reveal the answer; options become plain texts in display order. */
export function toPublicQuestion(q: PracticeQuestion, order: string[]): PracticePublicQuestion {
  return {
    id: q.id,
    skillId: q.skillId,
    level: q.level,
    type: q.type,
    prompt: q.prompt,
    options: order.map((optId) => q.options.find((o) => o.id === optId)?.text ?? ''),
  };
}

/** Shuffles the options of each question for one attempt. */
export function buildAttemptQuestions(
  questions: PracticeQuestion[],
  rng: Rng = Math.random
): { optionOrder: Record<string, string[]>; publicQuestions: PracticePublicQuestion[] } {
  const optionOrder: Record<string, string[]> = {};
  const publicQuestions = questions.map((q) => {
    optionOrder[q.id] = shuffle(q.options.map((o) => o.id), rng);
    return toPublicQuestion(q, optionOrder[q.id]);
  });
  return { optionOrder, publicQuestions };
}

/** Keeps only valid, distinct display positions. */
export function sanitizeAnswer(raw: unknown, optionCount: number): number[] {
  if (!Array.isArray(raw)) return [];
  const positions = raw.filter(
    (p): p is number => Number.isInteger(p) && p >= 0 && p < optionCount
  );
  return [...new Set(positions)].sort((a, b) => a - b);
}

export function gradePracticeAttempt(
  attempt: Pick<PracticeAttempt, 'questionIds' | 'optionOrder'>,
  questions: PracticeQuestion[],
  rawAnswers: unknown
): {
  answers: Record<string, number[]>;
  results: PracticeQuestionResult[];
  score: number;
  total: number;
  skills: PracticeSkillSummary[];
} {
  const answersInput = isObject(rawAnswers) ? rawAnswers : {};
  const answers: Record<string, number[]> = {};
  const results: PracticeQuestionResult[] = [];
  const skillMap = new Map<string, PracticeSkillSummary>();

  for (const qid of attempt.questionIds) {
    const q = questions.find((x) => x.id === qid);
    const order = attempt.optionOrder[qid] ?? [];
    if (!q) continue;
    const selected = sanitizeAnswer(answersInput[qid], order.length);
    const correctPositions = order
      .map((optId, pos) => (q.correctAnswers.includes(optId) ? pos : -1))
      .filter((p) => p >= 0);
    const correct =
      selected.length === correctPositions.length &&
      selected.every((p, i) => p === correctPositions[i]);

    answers[qid] = selected;
    results.push({
      questionId: qid,
      skillId: q.skillId,
      correct,
      selected,
      correctPositions,
      explanation: q.explanation,
    });
    const s = skillMap.get(q.skillId) ?? { skillId: q.skillId, correct: 0, total: 0 };
    s.total += 1;
    if (correct) s.correct += 1;
    skillMap.set(q.skillId, s);
  }

  return {
    answers,
    results,
    score: results.filter((r) => r.correct).length,
    total: results.length,
    skills: [...skillMap.values()],
  };
}

/** Questions students may practise: approved and belonging to a published set. */
export function servableQuestions(
  questions: PracticeQuestion[],
  publishedSetIds: Iterable<string>
): PracticeQuestion[] {
  const published = new Set(publishedSetIds);
  return questions.filter((q) => q.status === 'approved' && published.has(q.datasetId));
}

/** Re-checks one edited question with the same rules as a file import. */
export function validatePracticeQuestionEdit(q: PracticeQuestion): ImportIssue[] {
  const { errors } = validatePracticeImport({
    schemaVersion: '1.0',
    datasetId: q.datasetId,
    title: 'edit',
    questions: [
      {
        id: q.id,
        topicId: q.topicId,
        skillId: q.skillId,
        level: q.level,
        type: 'multiple_choice',
        prompt: q.prompt,
        options: q.options,
        correctAnswer: q.correctAnswers,
        explanation: q.explanation,
      },
    ],
  });
  return errors;
}
