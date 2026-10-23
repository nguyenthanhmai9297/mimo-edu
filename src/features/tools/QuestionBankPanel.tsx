import React, { useEffect, useMemo, useState } from 'react';
import { BookOpen, ChevronDown, ChevronUp, Loader2, PenLine, Sparkles } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAppContext } from '../../app/providers';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { findPracticeTopic } from '../../data/practiceCatalog';
import { listPracticeQuestions, listPracticeSets } from '../../services/practiceAdminService';
import { PRACTICE_LEVEL_LABELS, QuestionType } from '../../types/domain';
import { PRACTICE_LEVELS, PracticeQuestion, PracticeSet } from '../../types/practice';
import { PracticeText } from '../practice/PracticeText';

/** Question types the upcoming quiz games can show with automatic answers. */
const GAME_READY_TYPES: QuestionType[] = ['single_choice', 'multiple_choice', 'true_false_multi'];
const PREVIEW_LIMIT = 4;

/**
 * "Kho câu hỏi": read-only overview of question sets teachers already have,
 * to be picked by the quiz tools (Câu hỏi nhanh, Lật mảnh ghép Mimo).
 */
export const QuestionBankPanel: React.FC<{ search: string }> = ({ search }) => {
  const { homeworkList } = useAppContext();
  const [practiceSets, setPracticeSets] = useState<PracticeSet[]>([]);
  const [practiceQuestions, setPracticeQuestions] = useState<PracticeQuestion[]>([]);
  const [practiceLoading, setPracticeLoading] = useState(true);
  const [practiceError, setPracticeError] = useState(false);
  const [open, setOpen] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    Promise.all([listPracticeSets(), listPracticeQuestions()])
      .then(([s, q]) => {
        if (!alive) return;
        setPracticeSets(s);
        setPracticeQuestions(q);
      })
      .catch(() => alive && setPracticeError(true))
      .finally(() => alive && setPracticeLoading(false));
    return () => {
      alive = false;
    };
  }, []);

  const q = search.trim().toLowerCase();
  const homework = useMemo(
    () =>
      homeworkList
        .filter((h) => h.status !== 'archived' && (!q || h.title.toLowerCase().includes(q)))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)),
    [homeworkList, q]
  );
  const sets = practiceSets.filter((s) => !q || s.title.toLowerCase().includes(q) || s.topicId.toLowerCase().includes(q));

  const toggle = (id: string) => setOpen((cur) => (cur === id ? null : id));

  return (
    <div className="space-y-8">
      <div className="flex flex-col gap-3 rounded-2xl border border-[#DCE7F3] bg-[#F6FAFF] p-4 text-sm text-[#5E6C84] sm:flex-row sm:items-center sm:justify-between">
        <p>
          Các bộ câu hỏi dưới đây sẽ được chọn trực tiếp khi mở <b className="text-[#172B4D]">Kéo co kiến thức</b>,{' '}
          <b className="text-[#172B4D]">Mimo Quiz</b> và các trò chơi giáo viên điều khiển. Giáo viên cũng sẽ nhập được câu hỏi thủ công ngay trong công cụ.
        </p>
        <Link to="/admin/homework" className="studio-btn studio-btn-primary shrink-0">
          <PenLine className="h-4 w-4" /> Soạn bộ câu hỏi mới
        </Link>
      </div>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-extrabold text-[#172B4D]">
          <BookOpen className="h-5 w-5 text-[#1267E9]" /> Kho học liệu Toán 3
          <span className="studio-badge studio-badge-info">{homework.length} bộ</span>
        </h2>
        {homework.length === 0 ? (
          <div className="studio-card p-6 text-center text-sm text-[#5E6C84]">
            {q ? 'Không có bộ nào khớp từ khóa.' : 'Chưa có đề nào trong Kho học liệu Toán 3.'}
          </div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {homework.map((h) => {
              const ready = h.questions.filter((x) => GAME_READY_TYPES.includes(x.type)).length;
              const key = `hw-${h.id}`;
              const isOpen = open === key;
              return (
                <div key={h.id} className="studio-card overflow-hidden">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-[#172B4D]">{h.title}</div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="studio-badge studio-badge-info">{h.questions.length} câu</span>
                        <span className={`studio-badge ${ready ? 'studio-badge-success' : 'studio-badge-warning'}`}>
                          {ready} câu dùng được cho trò chơi
                        </span>
                        {h.grade && <span className="studio-badge bg-slate-100 text-slate-600">{h.grade}</span>}
                        {h.status === 'draft' && <span className="studio-badge studio-badge-warning">Bản nháp</span>}
                      </div>
                    </div>
                    <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className="studio-btn studio-btn-secondary shrink-0 px-3 text-xs">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Xem
                    </button>
                  </div>
                  {isOpen && (
                    <ol className="space-y-2 border-t border-[#EEF3F9] bg-[#FBFDFF] px-4 py-3 text-sm">
                      {h.questions.slice(0, PREVIEW_LIMIT).map((x, i) => (
                        <li key={x.id} className="flex gap-2">
                          <span className="font-bold text-[#1267E9]">{i + 1}.</span>
                          <RichContentRenderer content={x.prompt} className="text-sm" />
                        </li>
                      ))}
                      {h.questions.length > PREVIEW_LIMIT && (
                        <li className="text-xs text-[#5E6C84]">… và {h.questions.length - PREVIEW_LIMIT} câu khác</li>
                      )}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="mb-3 flex items-center gap-2 font-display text-base font-extrabold text-[#172B4D]">
          <Sparkles className="h-5 w-5 text-[#FF76B5]" /> Luyện Toán cùng Mimo
          <span className="studio-badge studio-badge-info">{sets.length} bộ</span>
        </h2>
        {practiceLoading ? (
          <div className="studio-card flex items-center gap-2 p-6 text-sm text-[#5E6C84]">
            <Loader2 className="h-4 w-4 animate-spin" /> Đang tải…
          </div>
        ) : practiceError ? (
          <div className="studio-card p-6 text-sm text-[#5E6C84]">Không tải được ngân hàng Luyện Toán cùng Mimo.</div>
        ) : sets.length === 0 ? (
          <div className="studio-card p-6 text-center text-sm text-[#5E6C84]">Chưa có bộ câu hỏi nào.</div>
        ) : (
          <div className="grid gap-3 lg:grid-cols-2">
            {sets.map((s) => {
              const inSet = practiceQuestions.filter((x) => x.datasetId === s.id);
              const approved = inSet.filter((x) => x.status === 'approved');
              const key = `pr-${s.id}`;
              const isOpen = open === key;
              return (
                <div key={s.id} className="studio-card overflow-hidden">
                  <div className="flex items-start justify-between gap-3 p-4">
                    <div className="min-w-0">
                      <div className="truncate font-bold text-[#172B4D]">
                        {s.topicId}. {findPracticeTopic(s.topicId)?.name ?? s.title}
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="studio-badge studio-badge-success">{approved.length}/{inSet.length} câu đã duyệt</span>
                        {PRACTICE_LEVELS.map((l) => {
                          const n = approved.filter((x) => x.level === l).length;
                          return n ? (
                            <span key={l} className="studio-badge bg-slate-100 text-slate-600">
                              {PRACTICE_LEVEL_LABELS[l]} {n}
                            </span>
                          ) : null;
                        })}
                      </div>
                    </div>
                    <button type="button" onClick={() => toggle(key)} aria-expanded={isOpen} className="studio-btn studio-btn-secondary shrink-0 px-3 text-xs">
                      {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />} Xem
                    </button>
                  </div>
                  {isOpen && (
                    <ol className="space-y-2 border-t border-[#EEF3F9] bg-[#FBFDFF] px-4 py-3 text-sm">
                      {approved.slice(0, PREVIEW_LIMIT).map((x, i) => (
                        <li key={x.id} className="flex gap-2">
                          <span className="font-bold text-[#1267E9]">{i + 1}.</span>
                          <PracticeText text={x.prompt} className="text-sm" />
                        </li>
                      ))}
                      {approved.length > PREVIEW_LIMIT && (
                        <li className="text-xs text-[#5E6C84]">… và {approved.length - PREVIEW_LIMIT} câu khác</li>
                      )}
                    </ol>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>
    </div>
  );
};
