import type { HomeworkQuestion, QuestionType, RichTextContent } from '../../types/domain';
import { createRichTextFromPlain } from '../../utils/gradingEngine';

/**
 * Changing a question's type keeps everything the new type can hold: the
 * prompt (text, formulas, images, tables), points, solution and AI/curriculum
 * notes always stay; options, statements and answers are carried across when
 * the new type has a place for them. Whatever cannot be carried is listed in
 * `losses` so the teacher confirms before anything disappears.
 */
export interface TypeChange {
  question: HomeworkQuestion;
  /** Content that the new type cannot keep (shown before converting). */
  losses: string[];
  /** What the teacher still has to do or check after converting. */
  notes: string[];
}

const ANSWER_FIELDS = [
  'options',
  'correctOptionId',
  'correctOptionIds',
  'statements',
  'acceptableAnswers',
  'unitMode',
  'acceptEquivalentFractions',
  'rubric',
] as const;

const CHOICE_LABELS = 'ABCDEFGHIJ'.split('');
const STATEMENT_LABELS = 'abcdefghij'.split('');

/** One-line text of rich content; `visual` when it holds an image, drawing or table that text cannot carry. */
export function richToText(content?: RichTextContent): { text: string; visual: boolean } {
  let visual = false;
  const parts: string[] = [];
  for (const b of content?.blocks ?? []) {
    if (b.type === 'paragraph') parts.push(b.text);
    else if (b.type === 'math') parts.push(`$${b.latex}$`);
    else if (b.type === 'list') parts.push(b.items.join('; '));
    else visual = true;
  }
  return { text: parts.join(' ').replace(/\s+/g, ' ').trim(), visual };
}

/** Plain single-paragraph content, safe to edit in a one-line box without losing anything. */
export function isPlainContent(content?: RichTextContent): boolean {
  const blocks = content?.blocks ?? [];
  return blocks.length === 0 || (blocks.length === 1 && blocks[0].type === 'paragraph' && !blocks[0].bold && !blocks[0].italic);
}

interface Item {
  content: RichTextContent;
  correct: boolean | undefined;
  label: string;
}

/** Options, statements or accepted answers of the current question, as neutral items. */
function itemsOf(q: HomeworkQuestion): Item[] {
  if ((q.type === 'single_choice' || q.type === 'multiple_choice') && q.options?.length) {
    const keys = q.type === 'single_choice' ? (q.correctOptionId ? [q.correctOptionId] : []) : q.correctOptionIds ?? [];
    return q.options.map((o) => ({ content: o.content, correct: keys.includes(o.id), label: o.label }));
  }
  if (q.type === 'true_false_multi' && q.statements?.length) {
    return q.statements.map((st) => ({ content: st.statement, correct: st.isTrue, label: st.label }));
  }
  if (q.type === 'short_answer') {
    return (q.acceptableAnswers ?? [])
      .filter((a) => a.trim())
      .map((a, i) => ({ content: createRichTextFromPlain(a), correct: true, label: String(i + 1) }));
  }
  return [];
}

const describe = (it: Item) => {
  const { text, visual } = richToText(it.content);
  return `${it.label}. ${text || '(trống)'}${visual ? ' [có hình]' : ''}`;
};

const newId = (qId: string, kind: string, i: number) => `${qId}_${kind}_${Date.now().toString(36)}${i}`;

export function changeQuestionType(q: HomeworkQuestion, to: QuestionType): TypeChange {
  if (q.type === to) return { question: q, losses: [], notes: [] };
  const base: HomeworkQuestion = { ...q, type: to };
  for (const field of ANSWER_FIELDS) delete base[field];
  const losses: string[] = [];
  const notes: string[] = [];
  const items = itemsOf(q);
  const fromShort = q.type === 'short_answer';

  if (q.type === 'essay' && q.rubric?.trim()) {
    losses.push(`Hướng dẫn chấm (chỉ dạng tự luận có): “${q.rubric.trim()}”`);
  }
  if (fromShort && (q.unitMode || q.acceptEquivalentFractions)) {
    losses.push('Tùy chọn chấm đáp số ngắn (bỏ đơn vị, phân số bằng nhau)');
  }

  if (to === 'single_choice' || to === 'multiple_choice') {
    // A short answer's accepted forms are one answer written several ways: keep the first as the right option
    let source = fromShort ? items.slice(0, 1) : items;
    if (fromShort && items.length > 1) {
      losses.push(`Các cách viết khác của đáp số: ${items.slice(1).map((it) => richToText(it.content).text).join('; ')}`);
    }
    if (source.length === 0) {
      source = CHOICE_LABELS.slice(0, 4).map((label) => ({ content: createRichTextFromPlain(''), correct: false, label }));
      notes.push('Nhập nội dung các phương án.');
    } else if (source.length < 4 && fromShort) {
      source = [...source, ...CHOICE_LABELS.slice(source.length, 4).map((label) => ({ content: createRichTextFromPlain(''), correct: false, label }))];
      notes.push('Đáp số đã thành phương án A (đúng); nhập thêm các phương án sai.');
    }
    const options = source.slice(0, CHOICE_LABELS.length).map((it, i) => ({ id: newId(q.id, 'opt', i), label: CHOICE_LABELS[i], content: it.content }));
    const correctIds = options.filter((_, i) => source[i].correct === true).map((o) => o.id);
    if (q.type === 'true_false_multi') notes.push('Các ý Đúng/Sai đã thành phương án; các ý Đúng thành đáp án đúng.');
    if (to === 'single_choice') {
      if (correctIds.length > 1) {
        losses.push(`Câu đang có ${correctIds.length} đáp án đúng; dạng 1 đáp án chỉ giữ ${options.find((o) => o.id === correctIds[0])!.label} là đúng`);
      }
      if (correctIds.length === 0) notes.push('Chọn đáp án đúng.');
      return { question: { ...base, options, ...(correctIds[0] ? { correctOptionId: correctIds[0] } : {}) }, losses, notes };
    }
    if (correctIds.length === 0) notes.push('Chọn các đáp án đúng.');
    return { question: { ...base, options, correctOptionIds: correctIds }, losses, notes };
  }

  if (to === 'true_false_multi') {
    let source = fromShort ? [] : items;
    if (fromShort && items.length) losses.push(`Đáp số ngắn: ${items.map((it) => richToText(it.content).text).join('; ')}`);
    if (source.length === 0) {
      source = STATEMENT_LABELS.slice(0, 4).map((label) => ({ content: createRichTextFromPlain(''), correct: undefined, label }));
      notes.push('Nhập các ý và chọn Đúng/Sai cho từng ý.');
    } else {
      notes.push('Mỗi phương án đã thành một ý; phương án đúng thành ý Đúng, phương án còn lại thành ý Sai.');
    }
    const each = Math.max(0.25, Math.round((q.points / source.length) * 4) / 4);
    const statements = source.slice(0, STATEMENT_LABELS.length).map((it, i) => ({
      id: newId(q.id, 'st', i),
      label: STATEMENT_LABELS[i],
      statement: it.content,
      ...(typeof it.correct === 'boolean' ? { isTrue: it.correct } : {}),
      points: each,
    }));
    return { question: { ...base, statements }, losses, notes };
  }

  if (to === 'short_answer') {
    if (q.type === 'true_false_multi') {
      if (items.length) losses.push(`Các ý Đúng/Sai: ${items.map(describe).join(' · ')}`);
      notes.push('Nhập đáp số được chấp nhận.');
      return { question: { ...base, acceptableAnswers: [] }, losses, notes };
    }
    const right = items.filter((it) => it.correct === true);
    const wrong = items.filter((it) => it.correct !== true);
    if (wrong.length) losses.push(`Các phương án sai: ${wrong.map(describe).join(' · ')}`);
    const answers: string[] = [];
    for (const it of right) {
      const { text, visual } = richToText(it.content);
      if (visual) losses.push(`Hình trong phương án ${it.label} (đáp số ngắn chỉ ghi được chữ và công thức)`);
      if (text) answers.push(text);
    }
    if (answers.length === 0) notes.push('Nhập đáp số được chấp nhận.');
    return { question: { ...base, acceptableAnswers: answers }, losses, notes };
  }

  // essay: answers are copied into the marking guide as text, so nothing written is lost
  if (items.length) {
    const lines = items.map((it) => `${describe(it)}${it.correct === true ? ' (đúng)' : it.correct === false && q.type === 'true_false_multi' ? ' (sai)' : ''}`);
    base.rubric = `Đáp án trước khi đổi dạng: ${lines.join('; ')}`;
    notes.push('Đáp án cũ đã được chép vào ô Hướng dẫn chấm.');
    const visuals = items.filter((it) => richToText(it.content).visual);
    if (visuals.length) losses.push(`Hình trong ${visuals.map((it) => it.label).join(', ')} (Hướng dẫn chấm chỉ ghi chữ)`);
  } else {
    base.rubric = '';
  }
  if (!base.sampleSolution) base.sampleSolution = createRichTextFromPlain('');
  return { question: base, losses, notes };
}
