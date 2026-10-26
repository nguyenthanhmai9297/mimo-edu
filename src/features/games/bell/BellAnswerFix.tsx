import React, { useEffect, useMemo, useState } from 'react';
import { Check, CheckCircle2, ListChecks } from 'lucide-react';
import { RichContentRenderer } from '../../../components/editor/RichContentRenderer';
import { ErrorState, STUDIO_INPUT, StudioModal } from '../../../components/studio/StudioUi';
import type { HomeworkQuestion } from '../../../types/domain';
import { LETTERS } from '../../tools/quizStyle';
import { bellQuestionsOf } from './bellQuestions';

/** A question the game cannot use yet that the teacher can settle here: its answer is missing or AI asked for a check. */
export function needsAnswer(q: HomeworkQuestion): boolean {
  if (q.type === 'essay') return false;
  const shaped =
    ((q.type === 'single_choice' || q.type === 'multiple_choice') && (q.options?.length ?? 0) > 1) ||
    (q.type === 'true_false_multi' && (q.statements?.length ?? 0) > 0) ||
    q.type === 'short_answer';
  return shaped && (Boolean(q.aiReviewNote) || bellQuestionsOf([q]).usable.length === 0);
}

interface Answer {
  chosen: string[];
  tf: Record<string, boolean>;
  text: string;
}

const answerOf = (q: HomeworkQuestion): Answer => ({
  chosen: q.type === 'single_choice' ? (q.correctOptionId ? [q.correctOptionId] : []) : q.correctOptionIds ?? [],
  tf: Object.fromEntries((q.statements ?? []).filter((s) => typeof s.isTrue === 'boolean').map((s) => [s.id, s.isTrue as boolean])),
  text: (q.acceptableAnswers ?? []).join('; '),
});

const complete = (q: HomeworkQuestion, a: Answer) =>
  q.type === 'true_false_multi'
    ? (q.statements ?? []).every((s) => typeof a.tf[s.id] === 'boolean')
    : q.type === 'short_answer'
      ? a.text.split(';').some((t) => t.trim())
      : a.chosen.length > 0;

/** The question with the answer the teacher confirmed; the AI check note is cleared. */
function applied(q: HomeworkQuestion, a: Answer): HomeworkQuestion {
  const { aiReviewNote: _checked, ...rest } = q;
  if (q.type === 'single_choice') return { ...rest, correctOptionId: a.chosen[0] };
  if (q.type === 'multiple_choice') return { ...rest, correctOptionIds: a.chosen };
  if (q.type === 'true_false_multi') return { ...rest, statements: (q.statements ?? []).map((s) => ({ ...s, isTrue: a.tf[s.id] })) };
  return { ...rest, acceptableAnswers: a.text.split(';').map((t) => t.trim()).filter(Boolean) };
}

const pill = (on: boolean) =>
  `rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${on ? 'border-[#1F9D6B] bg-[#E8F8F1] text-[#14724D]' : 'border-[#DCE7F3] bg-white text-[#3B4A66] hover:border-[#2563EB]'}`;

/**
 * Lets the teacher pick or confirm the answers the game still lacks, without
 * leaving Rung chuông vàng. Nothing is filled in by itself: a question counts
 * only once the teacher has chosen or confirmed its answer.
 */
export const BellAnswerFix: React.FC<{
  open: boolean;
  title: string;
  questions: HomeworkQuestion[];
  saveLabel: string;
  busy: boolean;
  error: string;
  onClose: () => void;
  onSave: (questions: HomeworkQuestion[]) => void;
}> = ({ open, title, questions, saveLabel, busy, error, onClose, onSave }) => {
  const todo = useMemo(() => questions.filter(needsAnswer), [questions]);
  const [answers, setAnswers] = useState<Record<string, Answer>>({});
  const [confirmed, setConfirmed] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (!open) return;
    setAnswers(Object.fromEntries(todo.map((q) => [q.id, answerOf(q)])));
    setConfirmed(new Set());
  }, [open, todo]);

  const set = (q: HomeworkQuestion, change: (a: Answer) => Answer) => {
    const next = change(answers[q.id] ?? answerOf(q));
    setAnswers((prev) => ({ ...prev, [q.id]: next }));
    setConfirmed((prev) => {
      const s = new Set(prev);
      if (complete(q, next)) s.add(q.id);
      else s.delete(q.id);
      return s;
    });
  };
  const confirm = (q: HomeworkQuestion) => setConfirmed((prev) => new Set(prev).add(q.id));

  const result = questions.map((q) => (confirmed.has(q.id) ? applied(q, answers[q.id]) : q));
  const playable = bellQuestionsOf(result).usable.length;
  const essays = questions.filter((q) => q.type === 'essay').length;

  return (
    <StudioModal
      open={open}
      onClose={onClose}
      icon={ListChecks}
      tone="yellow"
      width="lg"
      title={title}
      footer={
        <div className="flex w-full flex-wrap items-center justify-end gap-2">
          <span className="mr-auto text-sm font-bold text-[#3B4A66]" data-testid="bell-fix-count">
            {playable} câu chơi được
          </span>
          <button type="button" onClick={onClose} className="studio-btn studio-btn-secondary">Để sau</button>
          <button type="button" disabled={busy || playable === 0} onClick={() => onSave(result)} className="studio-btn studio-btn-primary">
            <Check className="h-4 w-4" /> {busy ? 'Đang lưu…' : saveLabel}
          </button>
        </div>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-[#5E6C84]">
          {todo.length > 0
            ? `${todo.length} câu cần thầy cô chọn hoặc xác nhận đáp án. Câu chưa xác nhận sẽ không đưa vào trò chơi.`
            : 'Các câu đều đã có đáp án.'}
          {essays > 0 ? ` ${essays} câu tự luận không dùng trong trò chơi.` : ''}
        </p>
        {error && <ErrorState message={error} />}
        {todo.map((q) => {
          const a = answers[q.id] ?? answerOf(q);
          const ok = confirmed.has(q.id);
          return (
            <div key={q.id} className={`rounded-2xl border-2 p-3 ${ok ? 'border-[#1F9D6B]' : 'border-[#DCE7F3]'}`} data-testid="bell-fix-item">
              <div className="flex items-start gap-2">
                <span className="rounded-lg bg-[#FFF4C2] px-2 py-0.5 text-xs font-extrabold text-[#5A3A00]">Câu {q.order}</span>
                <RichContentRenderer content={q.prompt} className="min-w-0 flex-1 text-sm font-bold text-[#172B4D]" inheritSize />
              </div>
              {q.aiReviewNote && <p className="mt-1 text-xs text-amber-800">AI ghi chú: {q.aiReviewNote}</p>}
              <div className="mt-2 flex flex-wrap items-center gap-2">
                {(q.type === 'single_choice' || q.type === 'multiple_choice') &&
                  q.options!.map((o, i) => (
                    <button
                      key={o.id}
                      type="button"
                      aria-pressed={a.chosen.includes(o.id)}
                      onClick={() =>
                        set(q, (x) => ({
                          ...x,
                          chosen: q.type === 'single_choice' ? [o.id] : x.chosen.includes(o.id) ? x.chosen.filter((c) => c !== o.id) : [...x.chosen, o.id],
                        }))
                      }
                      className={`${pill(a.chosen.includes(o.id))} flex items-center gap-1.5`}
                    >
                      <b>{o.label || LETTERS[i]}.</b>
                      <RichContentRenderer content={o.content} className="text-sm" inheritSize />
                    </button>
                  ))}
                {q.type === 'true_false_multi' &&
                  q.statements!.map((s) => (
                    <div key={s.id} className="flex w-full flex-wrap items-center gap-2">
                      <span className="text-sm font-bold">{s.label})</span>
                      <RichContentRenderer content={s.statement} className="min-w-0 flex-1 text-sm" inheritSize />
                      {[true, false].map((v) => (
                        <button key={String(v)} type="button" aria-pressed={a.tf[s.id] === v} onClick={() => set(q, (x) => ({ ...x, tf: { ...x.tf, [s.id]: v } }))} className={pill(a.tf[s.id] === v)}>
                          {v ? 'Đúng' : 'Sai'}
                        </button>
                      ))}
                    </div>
                  ))}
                {q.type === 'short_answer' && (
                  <input
                    aria-label={`Đáp án câu ${q.order}`}
                    className={`${STUDIO_INPUT} max-w-xs`}
                    value={a.text}
                    placeholder="Ví dụ: 28 cm"
                    onChange={(e) => set(q, (x) => ({ ...x, text: e.target.value }))}
                  />
                )}
                {ok ? (
                  <span className="ml-auto flex items-center gap-1 text-xs font-extrabold text-[#1F9D6B]">
                    <CheckCircle2 className="h-4 w-4" /> Đã xác nhận
                  </span>
                ) : (
                  complete(q, a) && (
                    <button type="button" onClick={() => confirm(q)} className="ml-auto studio-btn studio-btn-secondary">
                      Đáp án này đúng
                    </button>
                  )
                )}
              </div>
            </div>
          );
        })}
      </div>
    </StudioModal>
  );
};
