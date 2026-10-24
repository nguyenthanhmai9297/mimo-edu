import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ArrowLeft, CheckCircle2, FileUp, FlaskConical, Loader2, Rocket, Sparkles, Undo2 } from 'lucide-react';
import { useAppContext } from '../../../app/providers';
import { PRACTICE_CATALOG, findPracticeTopic, practiceSkillLabel } from '../../../data/practiceCatalog';
import { usingFirebaseEmulator } from '../../../lib/firebase/config';
import {
  findExistingQuestionIds,
  importPracticeSet,
  listPracticeQuestions,
  listPracticeSets,
  setPracticeQuestionStatus,
  setPracticeSetStatus,
  updatePracticeQuestion,
} from '../../../services/practiceAdminService';
import { PRACTICE_LEVEL_LABELS } from '../../../types/domain';
import { PRACTICE_LEVELS, PracticeLevel, PracticeQuestion, PracticeSet } from '../../../types/practice';
import { ImportValidation, validatePracticeImport } from '../../../utils/practiceEngine';
import { PracticeImportModal } from './PracticeImportModal';
import { PracticeQuestionCard } from './PracticeQuestionCard';
import { GROUP_THEMES, ProgressBar } from '../student/practiceTheme';

type StatusFilter = 'all' | 'draft' | 'approved';

export const PracticeAdminPage: React.FC = () => {
  const { user } = useAppContext();
  const teacherEmail = user?.email ?? 'unknown';
  const [sets, setSets] = useState<PracticeSet[]>([]);
  const [questions, setQuestions] = useState<PracticeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [topicId, setTopicId] = useState<string | null>(null);
  const [importing, setImporting] = useState<{ fileName: string; validation: ImportValidation } | null>(null);
  const [levelFilter, setLevelFilter] = useState<PracticeLevel | 'all'>('all');
  const [skillFilter, setSkillFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [confirmBulk, setConfirmBulk] = useState(false);
  const [busy, setBusy] = useState(false);

  const reload = useCallback(async () => {
    setError(null);
    try {
      const [s, q] = await Promise.all([listPracticeSets(), listPracticeQuestions()]);
      setSets(s);
      setQuestions(q);
    } catch {
      setError('Không tải được kho câu hỏi. Kiểm tra quyền quản trị hoặc kết nối Firestore.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const statsByTopic = useMemo(() => {
    const map = new Map<string, { total: number; approved: number; published: boolean }>();
    for (const q of questions) {
      const s = map.get(q.topicId) ?? { total: 0, approved: 0, published: false };
      s.total += 1;
      if (q.status === 'approved') s.approved += 1;
      map.set(q.topicId, s);
    }
    for (const set of sets) {
      if (set.status === 'published' && map.has(set.topicId)) map.get(set.topicId)!.published = true;
    }
    return map;
  }, [questions, sets]);

  const handleFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setError('Tệp không phải JSON hợp lệ.');
      return;
    }
    try {
      const firstPass = validatePracticeImport(json);
      const existing = firstPass.questions.length
        ? await findExistingQuestionIds(firstPass.questions.map((q) => q.id).filter(Boolean))
        : [];
      setImporting({ fileName: file.name, validation: validatePracticeImport(json, existing) });
    } catch {
      setError('Không kiểm tra được câu trùng mã trên hệ thống. Kiểm tra quyền quản trị hoặc kết nối Firestore.');
    }
  };

  const topic = topicId ? findPracticeTopic(topicId) : undefined;
  const topicQuestions = questions.filter((q) => q.topicId === topicId);
  const topicSets = sets.filter((s) => s.topicId === topicId);
  const skillOptions = [...new Set([...Object.keys(topic?.skills ?? {}), ...topicQuestions.map((q) => q.skillId)])];
  const visible = topicQuestions.filter(
    (q) =>
      (levelFilter === 'all' || q.level === levelFilter) &&
      (skillFilter === 'all' || q.skillId === skillFilter) &&
      (statusFilter === 'all' || q.status === statusFilter)
  );
  const pendingVisible = visible.filter((q) => q.status === 'draft');

  const withBusy = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      await reload();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Thao tác không thành công.');
    } finally {
      setBusy(false);
    }
  };

  const resetFilters = () => {
    setLevelFilter('all');
    setSkillFilter('all');
    setStatusFilter('all');
    setConfirmBulk(false);
  };

  const pill = (active: boolean) =>
    `inline-flex min-h-[36px] items-center rounded-full px-3.5 text-xs font-bold transition ${
      active ? 'bg-[#2563EB] text-white shadow-sm' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:ring-[#54C8FF]'
    }`;

  return (
    <div className="studio-skin space-y-6">
      {/* Header: navy accent strip, content stays on light backgrounds */}
      <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-[#1E3A8A] via-[#0E3AA8] to-[#2563EB] p-5 text-white shadow-md sm:p-6">
        <div className="pointer-events-none absolute -top-8 right-24 h-28 w-28 rounded-full bg-[#54C8FF]/30 blur-2xl" />
        <div className="pointer-events-none absolute -bottom-10 right-4 h-32 w-32 rounded-full bg-[#FF76B5]/25 blur-2xl" />
        <div className="relative flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
          <div>
            <h1 className="flex items-center gap-2 font-display text-2xl font-extrabold">
              <Sparkles className="h-6 w-6 text-[#FFD34E]" /> Luyện Toán cùng Mimo
            </h1>
            <p className="mt-1 text-sm text-white/80">
              Ngân hàng câu hỏi Toán 3 đã kiểm duyệt cho học sinh tự luyện · 5 nhóm kiến thức · 35 chuyên đề · 4 mức độ
            </p>
          </div>
          <label className="flex min-h-[44px] cursor-pointer items-center gap-2 self-start rounded-2xl bg-[#FFD34E] px-4 text-sm font-extrabold whitespace-nowrap text-[#1E3A8A] shadow-md transition hover:brightness-105">
            <FileUp className="h-4 w-4" /> Nhập bộ câu hỏi (.json)
            <input type="file" accept="application/json,.json" onChange={handleFile} className="hidden" />
          </label>
        </div>
      </div>

      {usingFirebaseEmulator && (
        <div className="flex items-center gap-2 rounded-2xl bg-[#F3EFFF] p-3 text-xs font-bold text-[#5B3FD1] ring-1 ring-[#D9CCFF]">
          <FlaskConical className="h-4 w-4" /> Chế độ thử nghiệm: đang dùng Firebase Emulator trên máy, không ảnh hưởng dữ liệu thật.
        </div>
      )}
      {error && <div className="rounded-2xl bg-rose-50 p-4 text-sm font-bold text-rose-700 ring-1 ring-rose-200">{error}</div>}

      {loading ? (
        <div className="flex items-center gap-2 rounded-2xl bg-white p-6 text-sm text-slate-600 shadow-sm">
          <Loader2 className="h-4 w-4 animate-spin" /> Đang tải kho câu hỏi…
        </div>
      ) : !topic ? (
        PRACTICE_CATALOG.map((group) => {
          const theme = GROUP_THEMES[group.id];
          return (
            <section key={group.id} className="space-y-3">
              <h2 className="flex items-center gap-2 font-display text-base font-extrabold text-[#1E3A8A]">
                <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${theme.gradient}`}>
                  <theme.icon className="h-4 w-4" />
                </span>
                {group.id}. {group.name}
              </h2>
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {group.topics.map((t) => {
                  const s = statsByTopic.get(t.id);
                  return (
                    <button
                      key={t.id}
                      type="button"
                      onClick={() => {
                        setTopicId(t.id);
                        resetFilters();
                      }}
                      className={`rounded-2xl border p-4 text-left transition hover:-translate-y-0.5 hover:shadow-md ${
                        s ? 'border-[#BFE3FF] bg-white shadow-sm' : 'border-slate-200 bg-slate-50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className={`rounded-full px-2 py-0.5 font-mono text-[11px] font-bold ${s ? 'bg-[#EAF6FF] text-[#2563EB]' : 'bg-slate-200 text-slate-500'}`}>{t.id}</span>
                        {s && (
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold ${s.published ? 'bg-[#EAFBF4] text-[#119468]' : 'bg-[#FFF8E1] text-[#B7790A]'}`}>
                            {s.published ? 'Đang mở cho học sinh' : 'Chưa xuất bản'}
                          </span>
                        )}
                      </div>
                      <div className={`mt-1.5 font-display text-sm font-extrabold ${s ? 'text-[#1E3A8A]' : 'text-slate-500'}`}>{t.name}</div>
                      {s ? (
                        <div className="mt-3">
                          <div className="flex justify-between text-[11px] font-bold text-slate-500">
                            <span>{s.total} câu</span>
                            <span>{s.approved}/{s.total} đã duyệt</span>
                          </div>
                          <ProgressBar value={s.total ? s.approved / s.total : 0} className="mt-1 h-2" />
                        </div>
                      ) : (
                        <div className="mt-2 text-[11px] font-bold text-slate-400">Chưa có dữ liệu</div>
                      )}
                    </button>
                  );
                })}
              </div>
            </section>
          );
        })
      ) : (
        <div className="space-y-4">
          <button type="button" onClick={() => setTopicId(null)} className="inline-flex items-center gap-1 text-sm font-bold text-[#2563EB] hover:underline">
            <ArrowLeft className="h-4 w-4" /> Tất cả chuyên đề
          </button>

          <div className="rounded-3xl border border-[#BFE3FF] bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center gap-3">
              <span className="rounded-full bg-[#EAF6FF] px-2.5 py-0.5 font-mono text-xs font-bold text-[#2563EB]">{topic.id}</span>
              <h2 className="font-display text-xl font-extrabold text-[#1E3A8A]">{topic.name}</h2>
            </div>

            {topicSets.length === 0 ? (
              <p className="mt-2 text-sm text-slate-500">Chuyên đề này chưa có bộ câu hỏi. Hãy nhập tệp JSON đã biên soạn và kiểm duyệt.</p>
            ) : (
              <div className="mt-4 space-y-2">
                {topicSets.map((set) => {
                  const inSet = topicQuestions.filter((q) => q.datasetId === set.id);
                  const approvedCount = inSet.filter((q) => q.status === 'approved').length;
                  const published = set.status === 'published';
                  return (
                    <div key={set.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-[#F4FAFF] p-3.5">
                      <div className="min-w-0 flex-1 text-xs">
                        <div className="font-bold text-[#1E3A8A]">{set.title}</div>
                        <div className="mt-0.5 text-slate-500">
                          <span className="font-mono">{set.id}</span> · {approvedCount}/{inSet.length} câu đã duyệt ·{' '}
                          <b className={published ? 'text-[#119468]' : 'text-[#B7790A]'}>{published ? 'Đã xuất bản' : 'Nháp'}</b>
                        </div>
                        <ProgressBar value={inSet.length ? approvedCount / inSet.length : 0} className="mt-2 h-2 max-w-xs" track="bg-white" />
                      </div>
                      <button
                        type="button"
                        disabled={busy || (!published && approvedCount === 0)}
                        title={!published && approvedCount === 0 ? 'Cần duyệt ít nhất một câu' : undefined}
                        onClick={() => withBusy(() => setPracticeSetStatus(set, published ? 'draft' : 'published'))}
                        className={`flex min-h-[40px] items-center gap-1.5 rounded-xl px-4 text-xs font-extrabold transition disabled:opacity-50 ${
                          published ? 'bg-white text-slate-700 ring-1 ring-slate-300 hover:bg-slate-50' : 'bg-[#2563EB] text-white shadow-sm hover:bg-[#1D4ED8]'
                        }`}
                      >
                        {published ? <Undo2 className="h-4 w-4" /> : <Rocket className="h-4 w-4" />}
                        {published ? 'Gỡ xuất bản' : 'Xuất bản cho học sinh'}
                      </button>
                    </div>
                  );
                })}
                <p className="text-[11px] text-slate-500">
                  Học sinh chỉ luyện được các câu <b>đã duyệt</b> thuộc bộ <b>đã xuất bản</b>.
                </p>
              </div>
            )}
          </div>

          {topicQuestions.length > 0 && (
            <>
              <div className="space-y-3 rounded-3xl border border-slate-200 bg-white p-4 shadow-sm">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-extrabold text-slate-500">Chuyên đề</span>
                  <select
                    value={topic.id}
                    onChange={(e) => {
                      setTopicId(e.target.value);
                      resetFilters();
                    }}
                    className="min-h-[36px] rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-[#1E3A8A]"
                  >
                    {PRACTICE_CATALOG.flatMap((g) => g.topics).map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.id}. {t.name}{statsByTopic.has(t.id) ? '' : ' (chưa có dữ liệu)'}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-extrabold text-slate-500">Mức độ</span>
                  <button type="button" onClick={() => setLevelFilter('all')} className={pill(levelFilter === 'all')}>Tất cả</button>
                  {PRACTICE_LEVELS.map((l) => (
                    <button key={l} type="button" onClick={() => setLevelFilter(l)} className={pill(levelFilter === l)}>
                      {PRACTICE_LEVEL_LABELS[l]} · {topicQuestions.filter((q) => q.level === l).length}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-extrabold text-slate-500">Kĩ năng</span>
                  <select
                    value={skillFilter}
                    onChange={(e) => setSkillFilter(e.target.value)}
                    className="min-h-[36px] rounded-full border border-slate-200 bg-white px-3 text-xs font-bold text-[#1E3A8A]"
                  >
                    <option value="all">Tất cả kĩ năng</option>
                    {skillOptions.map((s) => (
                      <option key={s} value={s}>{practiceSkillLabel(s)}</option>
                    ))}
                  </select>
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="w-20 text-xs font-extrabold text-slate-500">Trạng thái</span>
                  {([['all', 'Tất cả'], ['draft', 'Chờ duyệt'], ['approved', 'Đã duyệt']] as const).map(([v, label]) => (
                    <button key={v} type="button" onClick={() => setStatusFilter(v)} className={pill(statusFilter === v)}>
                      {label}
                    </button>
                  ))}
                  <span className="ml-auto text-xs font-bold text-slate-500">{visible.length} câu</span>
                </div>
                {pendingVisible.length > 0 && (
                  <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-3 text-xs">
                    {confirmBulk ? (
                      <>
                        <span className="font-bold text-[#B7790A]">Duyệt {pendingVisible.length} câu chưa xem riêng từng câu?</span>
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() =>
                            withBusy(async () => {
                              await setPracticeQuestionStatus(pendingVisible, 'approved', teacherEmail);
                              setConfirmBulk(false);
                            })
                          }
                          className="min-h-[36px] rounded-full bg-[#22C38E] px-4 font-extrabold text-white"
                        >
                          Đồng ý
                        </button>
                        <button type="button" onClick={() => setConfirmBulk(false)} className="min-h-[36px] rounded-full px-4 font-bold text-slate-600 ring-1 ring-slate-300">
                          Hủy
                        </button>
                      </>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmBulk(true)}
                        className="inline-flex min-h-[36px] items-center gap-1.5 rounded-full bg-[#EAFBF4] px-4 font-extrabold text-[#119468] ring-1 ring-[#22C38E]/40"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Duyệt {pendingVisible.length} câu đang lọc
                      </button>
                    )}
                  </div>
                )}
              </div>

              <div className="space-y-3">
                {visible.map((q) => (
                  <PracticeQuestionCard
                    key={`${q.id}-${q.updatedAt}`}
                    question={q}
                    skillOptions={skillOptions}
                    // Errors propagate to the card so it can stay open and show them
                    onSave={async (next) => {
                      await updatePracticeQuestion(next, teacherEmail);
                      await reload();
                    }}
                    onToggleApproved={async (cur) => {
                      await setPracticeQuestionStatus([cur], cur.status === 'approved' ? 'draft' : 'approved', teacherEmail);
                      await reload();
                    }}
                  />
                ))}
                {visible.length === 0 && (
                  <div className="rounded-2xl bg-white p-6 text-center text-sm text-slate-500 shadow-sm">Không có câu nào khớp bộ lọc.</div>
                )}
              </div>
            </>
          )}
        </div>
      )}

      {importing && (
        <PracticeImportModal
          fileName={importing.fileName}
          validation={importing.validation}
          onCancel={() => setImporting(null)}
          onConfirm={async (replaceConflicts) => {
            await importPracticeSet(importing.validation, { teacherEmail, replaceConflicts });
            const imported = importing.validation.dataset?.topicId ?? null;
            setImporting(null);
            await reload();
            setTopicId(imported);
          }}
        />
      )}
    </div>
  );
};
