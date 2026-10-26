import React, { useState } from 'react';
import { CheckCircle2, Loader2, Pencil, RotateCcw, Save, X } from 'lucide-react';
import { practiceSkillLabel } from '../../../data/practiceCatalog';
import { PRACTICE_LEVEL_LABELS } from '../../../types/domain';
import { PRACTICE_LEVELS, PracticeQuestion } from '../../../types/practice';
import { validatePracticeQuestionEdit } from '../../../utils/practiceEngine';
import { PracticeText } from '../PracticeText';

interface PracticeQuestionCardProps {
  question: PracticeQuestion;
  skillOptions: string[];
  onSave: (next: PracticeQuestion) => Promise<void>;
  onToggleApproved: (q: PracticeQuestion) => Promise<void>;
  /** Teachers who are not admins only look at the bank. */
  readOnly?: boolean;
}

/** One bank question: preview with the answer key, inline editing and approval. */
const LEVEL_BORDER: Record<PracticeQuestion['level'], string> = {
  nhan_biet: 'border-l-[#22C38E]',
  thong_hieu: 'border-l-[#2563EB]',
  van_dung: 'border-l-[#FFB800]',
  thu_thach: 'border-l-[#FF76B5]',
};

export const PracticeQuestionCard: React.FC<PracticeQuestionCardProps> = ({
  question,
  skillOptions,
  onSave,
  onToggleApproved,
  readOnly = false,
}) => {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(question);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const approved = question.status === 'approved';

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không lưu được.');
    } finally {
      setBusy(false);
    }
  };

  const save = () =>
    run(async () => {
      const issues = validatePracticeQuestionEdit(draft);
      if (issues.length > 0) throw new Error(issues.map((i) => i.message).join(' '));
      // An edited question must be reviewed again before students see it
      await onSave({ ...draft, status: 'draft' });
      setEditing(false);
    });

  const toggleCorrect = (optId: string) =>
    setDraft((d) => ({
      ...d,
      correctAnswers: d.correctAnswers.includes(optId)
        ? d.correctAnswers.filter((a) => a !== optId)
        : [...d.correctAnswers, optId].sort(),
    }));

  return (
    <div className={`rounded-2xl border border-l-4 border-slate-200 bg-white p-4 shadow-sm transition hover:shadow-md sm:p-5 ${LEVEL_BORDER[question.level]}`}>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap items-center gap-1.5 text-[11px] font-bold">
          <span className="rounded-full bg-[#1E3A8A] px-2.5 py-0.5 font-mono text-white">{question.id}</span>
          <span className="rounded-full bg-[#EAF6FF] px-2.5 py-0.5 text-[#2563EB]">{PRACTICE_LEVEL_LABELS[question.level]}</span>
          <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-slate-700" title={question.skillId}>{practiceSkillLabel(question.skillId)}</span>
          {question.type === 'multiple_choice' && <span className="rounded-full bg-[#F3EFFF] px-2.5 py-0.5 text-[#6A4BE6]">Nhiều đáp án</span>}
          <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 ${approved ? 'bg-[#EAFBF4] text-[#119468]' : 'bg-[#FFF8E1] text-[#B7790A]'}`}>
            <span className={`h-1.5 w-1.5 rounded-full ${approved ? 'bg-[#22C38E]' : 'bg-[#FFB800]'}`} />
            {approved ? 'Đã duyệt' : 'Chờ duyệt'}
          </span>
        </div>
        {!editing && !readOnly && (
          <div className="flex gap-1.5">
            <button
              type="button"
              onClick={() => {
                setDraft(question);
                setEditing(true);
              }}
              className="flex min-h-[34px] items-center gap-1 rounded-full bg-white px-3 text-xs font-bold text-[#2563EB] ring-1 ring-[#BFE3FF] hover:bg-[#F4FAFF]"
            >
              <Pencil className="h-3.5 w-3.5" /> Sửa
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => run(() => onToggleApproved(question))}
              className={`flex min-h-[34px] items-center gap-1 rounded-full px-3 text-xs font-extrabold transition ${
                approved ? 'bg-white text-slate-600 ring-1 ring-slate-300 hover:bg-slate-50' : 'bg-[#22C38E] text-white shadow-sm hover:brightness-105'
              }`}
            >
              {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : approved ? <RotateCcw className="h-3.5 w-3.5" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
              {approved ? 'Bỏ duyệt' : 'Duyệt'}
            </button>
          </div>
        )}
      </div>

      {!editing ? (
        <>
          <PracticeText text={question.prompt} className="text-base font-semibold text-[#1E3A8A]" />
          <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {question.options.map((o) => (
              <div
                key={o.id}
                className={`flex items-center gap-2 rounded-xl border px-3 py-2 text-sm ${
                  question.correctAnswers.includes(o.id) ? 'border-[#22C38E] bg-[#EAFBF4] font-bold text-[#0B6B4A]' : 'border-slate-200 text-slate-700'
                }`}
              >
                <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-extrabold ${question.correctAnswers.includes(o.id) ? 'bg-[#22C38E] text-white' : 'bg-slate-100 text-slate-500'}`}>{o.id}</span>
                <PracticeText text={o.text} className="inline-block" />
              </div>
            ))}
          </div>
          <div className="mt-3 rounded-xl bg-[#F4FAFF] p-3 text-sm text-slate-700">
            <b className="text-[#2563EB]">Lời giải:</b> {question.explanation || <i className="text-slate-400">chưa có</i>}
          </div>
        </>
      ) : (
        <div className="space-y-2.5 text-sm">
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Câu hỏi (công thức đặt trong $...$)</span>
            <textarea
              rows={3}
              value={draft.prompt}
              onChange={(e) => setDraft({ ...draft, prompt: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="space-y-1.5">
            <span className="text-xs font-bold text-slate-700">Phương án – tích vào đáp án đúng</span>
            {draft.options.map((o, idx) => (
              <div key={o.id} className="flex items-center gap-2">
                <input
                  type="checkbox"
                  aria-label={`Đáp án ${o.id} đúng`}
                  checked={draft.correctAnswers.includes(o.id)}
                  onChange={() => toggleCorrect(o.id)}
                  className="h-4 w-4"
                />
                <span className="w-5 font-mono text-xs font-bold">{o.id}</span>
                <input
                  value={o.text}
                  onChange={(e) =>
                    setDraft({
                      ...draft,
                      options: draft.options.map((x, i) => (i === idx ? { ...x, text: e.target.value } : x)),
                    })
                  }
                  className="flex-1 rounded-lg border border-slate-300 px-2.5 py-1.5"
                />
              </div>
            ))}
          </div>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Mức độ</span>
              <select
                value={draft.level}
                onChange={(e) => setDraft({ ...draft, level: e.target.value as PracticeQuestion['level'] })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
              >
                {PRACTICE_LEVELS.map((l) => (
                  <option key={l} value={l}>{PRACTICE_LEVEL_LABELS[l]}</option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="text-xs font-bold text-slate-700">Kĩ năng</span>
              <select
                value={draft.skillId}
                onChange={(e) => setDraft({ ...draft, skillId: e.target.value })}
                className="mt-1 w-full rounded-lg border border-slate-300 px-2.5 py-1.5"
              >
                {skillOptions.map((s) => (
                  <option key={s} value={s}>{practiceSkillLabel(s)}</option>
                ))}
              </select>
            </label>
          </div>
          <label className="block">
            <span className="text-xs font-bold text-slate-700">Lời giải</span>
            <textarea
              rows={2}
              value={draft.explanation}
              onChange={(e) => setDraft({ ...draft, explanation: e.target.value })}
              className="mt-1 w-full rounded-lg border border-slate-300 px-3 py-2"
            />
          </label>
          <div className="rounded-lg border border-dashed border-slate-300 p-2">
            <div className="mb-1 text-[11px] font-bold text-slate-500">Xem trước</div>
            <PracticeText text={draft.prompt} />
          </div>
          <div className="flex items-center justify-between gap-2">
            <span className="text-[11px] text-slate-500">Sau khi lưu, câu trở về &ldquo;Chờ duyệt&rdquo;.</span>
            <div className="flex gap-1.5">
              <button type="button" onClick={() => setEditing(false)} className="flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-bold">
                <X className="h-3.5 w-3.5" /> Hủy
              </button>
              <button type="button" disabled={busy} onClick={save} className="flex items-center gap-1 rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-extrabold text-white">
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />} Lưu
              </button>
            </div>
          </div>
        </div>
      )}
      {error && <div className="mt-2 rounded-lg bg-rose-50 p-2 text-xs font-bold text-rose-700">{error}</div>}
    </div>
  );
};
