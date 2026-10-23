import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, Check, Loader2, PenLine, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { findPracticeTopic } from '../../data/practiceCatalog';
import { listPracticeQuestions, listPracticeSets } from '../../services/practiceAdminService';
import { PRACTICE_LEVEL_LABELS } from '../../types/domain';
import { PRACTICE_LEVELS, PracticeLevel, PracticeQuestion, PracticeSet } from '../../types/practice';
import {
  fromHomework,
  fromManual,
  fromPracticeQuestion,
  ManualQuestionDraft,
  manualQuestionProblem,
  ToolQuestion,
} from './toolQuestions';

type Source = 'homework' | 'practice' | 'manual';
const MANUAL_KEY = 'mimoedu.tools.manualQuestions';

function loadManual(): ManualQuestionDraft[] {
  try {
    const raw = localStorage.getItem(MANUAL_KEY);
    return raw ? (JSON.parse(raw) as ManualQuestionDraft[]) : [];
  } catch {
    return [];
  }
}

const newDraft = (): ManualQuestionDraft => ({
  id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`,
  prompt: '',
  options: ['', '', '', ''],
  correct: [],
});

/**
 * Question picker shared by classroom tools. Teachers combine sets from
 * Kho học liệu Toán 3, Luyện Toán cùng Mimo and questions typed by hand
 * (kept on this device only).
 */
export const QuestionPicker: React.FC<{ onChange: (questions: ToolQuestion[]) => void }> = ({ onChange }) => {
  const { homeworkList } = useAppContext();
  const [source, setSource] = useState<Source>('homework');
  const [homeworkIds, setHomeworkIds] = useState<string[]>([]);
  const [practiceSets, setPracticeSets] = useState<PracticeSet[]>([]);
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [practiceLoading, setPracticeLoading] = useState(true);
  const [practiceSetIds, setPracticeSetIds] = useState<string[]>([]);
  const [levels, setLevels] = useState<PracticeLevel[]>([...PRACTICE_LEVELS]);
  const [manual, setManual] = useState<ManualQuestionDraft[]>(loadManual);
  const [useManual, setUseManual] = useState(true);

  useEffect(() => {
    let alive = true;
    Promise.all([listPracticeSets(), listPracticeQuestions()])
      .then(([s, q]) => {
        if (!alive) return;
        setPracticeSets(s);
        setPracticeQuestions(q.filter((x) => x.status === 'approved'));
      })
      .catch(() => undefined)
      .finally(() => alive && setPracticeLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(MANUAL_KEY, JSON.stringify(manual));
    } catch {
      // storage unavailable: drafts live for this visit only
    }
  }, [manual]);

  const homeworkOptions = useMemo(
    () =>
      homeworkList
        .filter((h) => h.status !== 'archived')
        .map((h) => ({ hw: h, questions: fromHomework(h) }))
        .filter((x) => x.questions.length > 0),
    [homeworkList]
  );

  const selected = useMemo(() => {
    const fromHw = homeworkOptions.filter((x) => homeworkIds.includes(x.hw.id)).flatMap((x) => x.questions);
    const fromPractice = practiceQuestions
      .filter((q) => practiceSetIds.includes(q.datasetId) && levels.includes(q.level))
      .map((q) => fromPracticeQuestion(q, findPracticeTopic(q.topicId)?.name ?? q.topicId))
      .filter((q): q is ToolQuestion => q !== null);
    const fromManualList = useManual ? manual.map(fromManual).filter((q): q is ToolQuestion => q !== null) : [];
    return { all: [...fromHw, ...fromPractice, ...fromManualList], hw: fromHw.length, practice: fromPractice.length, manual: fromManualList.length };
  }, [homeworkOptions, homeworkIds, practiceQuestions, practiceSetIds, levels, manual, useManual]);

  useEffect(() => {
    onChange(selected.all);
  }, [selected, onChange]);

  const toggle = <T,>(list: T[], v: T) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const updateDraft = (id: string, patch: Partial<ManualQuestionDraft>) =>
    setManual((prev) => prev.map((d) => (d.id === id ? { ...d, ...patch } : d)));

  const tabs: [Source, string, React.ElementType, number][] = [
    ['homework', 'Kho học liệu Toán 3', BookOpen, selected.hw],
    ['practice', 'Luyện Toán cùng Mimo', Sparkles, selected.practice],
    ['manual', 'Tự nhập', PenLine, selected.manual],
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        {tabs.map(([id, label, Icon, count]) => (
          <button
            key={id}
            type="button"
            onClick={() => setSource(id)}
            aria-pressed={source === id}
            className={`inline-flex min-h-[40px] items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition ${
              source === id ? 'bg-[#1267E9] text-white' : 'bg-white text-[#172B4D] ring-1 ring-[#DCE7F3] hover:ring-[#54C8FF]'
            }`}
          >
            <Icon className="h-4 w-4" /> {label}
            {count > 0 && (
              <span className={`rounded-full px-1.5 text-[11px] ${source === id ? 'bg-white/25' : 'bg-[#EAF5FF] text-[#1267E9]'}`}>{count}</span>
            )}
          </button>
        ))}
      </div>

      <div className="rounded-2xl border border-[#DCE7F3] bg-[#FBFDFF] p-3">
        {source === 'homework' &&
          (homeworkOptions.length === 0 ? (
            <p className="p-3 text-sm text-[#5E6C84]">
              Kho học liệu chưa có đề có câu trắc nghiệm hoặc Đúng/Sai kèm đáp án. Hãy chọn nguồn khác hoặc tự nhập câu hỏi.
            </p>
          ) : (
            <ul className="space-y-1.5">
              {homeworkOptions.map(({ hw, questions }) => {
                const on = homeworkIds.includes(hw.id);
                return (
                  <li key={hw.id}>
                    <button
                      type="button"
                      onClick={() => setHomeworkIds((l) => toggle(l, hw.id))}
                      aria-pressed={on}
                      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? 'bg-[#EAF5FF] ring-1 ring-[#1267E9]' : 'bg-white ring-1 ring-[#DCE7F3] hover:ring-[#54C8FF]'}`}
                    >
                      <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${on ? 'bg-[#1267E9] text-white' : 'ring-1 ring-[#BFD6EE]'}`}>
                        {on && <Check className="h-3.5 w-3.5" />}
                      </span>
                      <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#172B4D]">{hw.title}</span>
                      <span className="studio-badge studio-badge-info shrink-0">{questions.length} câu dùng được</span>
                    </button>
                  </li>
                );
              })}
            </ul>
          ))}

        {source === 'practice' &&
          (practiceLoading ? (
            <p className="flex items-center gap-2 p-3 text-sm text-[#5E6C84]"><Loader2 className="h-4 w-4 animate-spin" /> Đang tải…</p>
          ) : practiceSets.length === 0 ? (
            <p className="p-3 text-sm text-[#5E6C84]">Chưa có bộ câu hỏi Luyện Toán cùng Mimo nào.</p>
          ) : (
            <div className="space-y-3">
              <ul className="space-y-1.5">
                {practiceSets.map((s) => {
                  const on = practiceSetIds.includes(s.id);
                  const n = practiceQuestions.filter((q) => q.datasetId === s.id).length;
                  return (
                    <li key={s.id}>
                      <button
                        type="button"
                        onClick={() => setPracticeSetIds((l) => toggle(l, s.id))}
                        aria-pressed={on}
                        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition ${on ? 'bg-[#EAF5FF] ring-1 ring-[#1267E9]' : 'bg-white ring-1 ring-[#DCE7F3] hover:ring-[#54C8FF]'}`}
                      >
                        <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ${on ? 'bg-[#1267E9] text-white' : 'ring-1 ring-[#BFD6EE]'}`}>
                          {on && <Check className="h-3.5 w-3.5" />}
                        </span>
                        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-[#172B4D]">
                          {s.topicId}. {findPracticeTopic(s.topicId)?.name ?? s.title}
                        </span>
                        <span className="studio-badge studio-badge-success shrink-0">{n} câu đã duyệt</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
              <div className="flex flex-wrap items-center gap-2 px-1">
                <span className="text-xs font-bold text-[#5E6C84]">Mức độ:</span>
                {PRACTICE_LEVELS.map((l) => (
                  <button
                    key={l}
                    type="button"
                    onClick={() => setLevels((cur) => toggle(cur, l))}
                    aria-pressed={levels.includes(l)}
                    className={`min-h-[32px] rounded-full px-3 text-xs font-bold ${levels.includes(l) ? 'bg-[#071A63] text-white' : 'bg-white text-[#5E6C84] ring-1 ring-[#DCE7F3]'}`}
                  >
                    {PRACTICE_LEVEL_LABELS[l]}
                  </button>
                ))}
              </div>
            </div>
          ))}

        {source === 'manual' && (
          <div className="space-y-3">
            <label className="flex items-center gap-2 px-1 text-sm text-[#172B4D]">
              <input type="checkbox" checked={useManual} onChange={(e) => setUseManual(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
              Dùng các câu tự nhập dưới đây (lưu trên máy này, không gửi lên hệ thống)
            </label>
            {manual.map((d, idx) => {
              const problem = manualQuestionProblem(d);
              return (
                <div key={d.id} className="rounded-xl bg-white p-3 ring-1 ring-[#DCE7F3]">
                  <div className="mb-2 flex items-center justify-between">
                    <span className="text-xs font-extrabold text-[#1267E9]">Câu {idx + 1}</span>
                    <button type="button" onClick={() => setManual((l) => l.filter((x) => x.id !== d.id))} aria-label="Xóa câu" className="rounded-lg p-1 text-[#D93B5B] hover:bg-[#FFF1F4]">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                  <textarea
                    rows={2}
                    value={d.prompt}
                    onChange={(e) => updateDraft(d.id, { prompt: e.target.value })}
                    placeholder="Nội dung câu hỏi (công thức đặt trong $...$, ví dụ $3 \times 4$)"
                    aria-label={`Nội dung câu ${idx + 1}`}
                    className="w-full rounded-lg border border-[#DCE7F3] px-3 py-2 text-sm"
                  />
                  <div className="mt-2 grid gap-2 sm:grid-cols-2">
                    {d.options.map((o, i) => (
                      <label key={i} className="flex items-center gap-2">
                        <input
                          type="checkbox"
                          checked={d.correct.includes(i)}
                          onChange={() => updateDraft(d.id, { correct: toggle(d.correct, i) })}
                          aria-label={`Đáp án ${'ABCD'[i]} đúng`}
                          className="h-4 w-4 accent-[#22C38E]"
                        />
                        <span className="w-4 text-xs font-bold text-[#5E6C84]">{'ABCD'[i]}</span>
                        <input
                          value={o}
                          onChange={(e) => updateDraft(d.id, { options: d.options.map((x, j) => (j === i ? e.target.value : x)) })}
                          placeholder={i < 2 ? 'Bắt buộc' : 'Không bắt buộc'}
                          aria-label={`Đáp án ${'ABCD'[i]} của câu ${idx + 1}`}
                          className="min-w-0 flex-1 rounded-lg border border-[#DCE7F3] px-2.5 py-1.5 text-sm"
                        />
                      </label>
                    ))}
                  </div>
                  {problem && <p className="mt-2 text-xs font-semibold text-[#B7790A]">{problem}</p>}
                </div>
              );
            })}
            <button type="button" onClick={() => setManual((l) => [...l, newDraft()])} className="studio-btn studio-btn-secondary">
              <Plus className="h-4 w-4" /> Thêm câu hỏi
            </button>
          </div>
        )}
      </div>

      <p className="text-sm font-semibold text-[#172B4D]">
        Đã chọn <b className="text-[#1267E9]">{selected.all.length}</b> câu
        <span className="font-normal text-[#5E6C84]">
          {' '}(Kho học liệu {selected.hw} · Luyện Toán {selected.practice} · Tự nhập {selected.manual})
        </span>
      </p>
    </div>
  );
};
