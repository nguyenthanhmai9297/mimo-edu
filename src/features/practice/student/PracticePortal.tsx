import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronRight,
  CircleDashed,
  History,
  Loader2,
  Lock,
  PlayCircle,
  RotateCcw,
  Rocket,
  Sparkles,
  Star,
  Target,
  Trophy,
  XCircle,
} from 'lucide-react';
import { PRACTICE_CATALOG, PracticeGroupInfo, findPracticeTopic, practiceSkillLabel } from '../../../data/practiceCatalog';
import {
  fetchPracticeAttempt,
  fetchPracticeCatalog,
  fetchPracticeHistory,
  PracticeHistoryItem,
  startPractice,
  submitPractice,
} from '../../../services/practiceService';
import { PRACTICE_LEVEL_LABELS } from '../../../types/domain';
import {
  PRACTICE_LEVELS,
  PracticeCatalogAvailability,
  PracticeLevel,
  PracticeStartResponse,
  PracticeSubmitResponse,
} from '../../../types/practice';
import { PracticeText } from '../PracticeText';
import { GROUP_THEMES, HeroBanner, LEVEL_THEMES, MimoMascot, MimoSays, ProgressBar, SpaceDecor } from './practiceTheme';

type Stage =
  | { name: 'browse' }
  | { name: 'topic'; topicId: string }
  | { name: 'session'; session: PracticeStartResponse }
  | { name: 'result'; result: PracticeSubmitResponse; topicId: string; level: PracticeLevel; skillId: string | null };

const LETTERS = 'ABCDEF';

/** Topic card badges: open (published, not started), learning (has attempts), closed. */
const TOPIC_STATUS = {
  open: { label: 'Đã mở', className: 'bg-[#E3F7EA] text-[#1F7A4F]' },
  learning: { label: 'Đang học', className: 'bg-[#EFE7FF] text-[#5B3FB8]' },
  closed: { label: 'Chưa mở', className: 'bg-white text-[#5A6B9A]' },
} as const;
const PASS_RATIO = 0.8;

/** Progress per topic from the student's recent attempts (latest 20 kept by the server). */
function useTopicProgress(history: PracticeHistoryItem[]) {
  return useMemo(() => {
    const map = new Map<string, { attempts: number; passed: Set<PracticeLevel>; best: Partial<Record<PracticeLevel, number>> }>();
    for (const h of history) {
      if (h.status !== 'submitted' || !h.total) continue;
      const entry = map.get(h.topicId) ?? { attempts: 0, passed: new Set<PracticeLevel>(), best: {} };
      const ratio = (h.score ?? 0) / h.total;
      entry.attempts += 1;
      if (ratio >= PASS_RATIO) entry.passed.add(h.level);
      entry.best[h.level] = Math.max(entry.best[h.level] ?? 0, ratio);
      map.set(h.topicId, entry);
    }
    return map;
  }, [history]);
}

const SectionTitle: React.FC<{ icon?: React.ReactNode; children: React.ReactNode }> = ({ icon, children }) => (
  <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold text-white sm:text-xl">
    {icon}
    {children}
  </h2>
);

const BackButton: React.FC<{ onClick: () => void; children: React.ReactNode }> = ({ onClick, children }) => (
  <button
    type="button"
    onClick={onClick}
    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-full bg-white/10 px-4 text-sm font-bold text-white ring-1 ring-white/25 backdrop-blur transition hover:bg-white/20"
  >
    <ArrowLeft className="h-4 w-4" /> {children}
  </button>
);

/** Circular score indicator for the result screen. */
const ScoreRing: React.FC<{ score: number; total: number }> = ({ score, total }) => {
  const r = 52;
  const c = 2 * Math.PI * r;
  const ratio = total ? score / total : 0;
  return (
    <div className="relative h-36 w-36">
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={r} fill="none" stroke="#EAF6FF" strokeWidth="12" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#mimo-score)"
          strokeWidth="12"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - ratio)}
          style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
        />
        <defs>
          <linearGradient id="mimo-score" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#54C8FF" />
            <stop offset="60%" stopColor="#1267E9" />
            <stop offset="100%" stopColor="#FF76B5" />
          </linearGradient>
        </defs>
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="font-display text-4xl font-extrabold text-[#071A63]">{score}</span>
        <span className="text-sm font-bold text-slate-500">/ {total} câu đúng</span>
      </div>
    </div>
  );
};

export const PracticePortal: React.FC = () => {
  const [stage, setStage] = useState<Stage>({ name: 'browse' });
  const [catalog, setCatalog] = useState<PracticeCatalogAvailability | null>(null);
  const [history, setHistory] = useState<PracticeHistoryItem[]>([]);
  const [groupId, setGroupId] = useState<string>(PRACTICE_CATALOG[0].id);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [skillId, setSkillId] = useState<string | null>(null);
  const [answers, setAnswers] = useState<Record<string, number[]>>({});
  const [current, setCurrent] = useState(0);
  const [confirmSubmit, setConfirmSubmit] = useState(false);
  const groupsRef = useRef<HTMLElement>(null);
  const sessionTopRef = useRef<HTMLDivElement>(null);
  const progress = useTopicProgress(history);

  const loadOverview = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [c, h] = await Promise.all([fetchPracticeCatalog(), fetchPracticeHistory()]);
      setCatalog(c);
      setHistory(h);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không tải được danh sách chuyên đề.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadOverview();
  }, [loadOverview]);

  const topicTotal = (topicId: string) =>
    Object.values(catalog?.topics[topicId]?.levels ?? {}).reduce((a, b) => a + b, 0);

  const toTop = () => window.scrollTo({ top: 0, behavior: 'smooth' });

  const openSession = (session: PracticeStartResponse) => {
    setAnswers({});
    setCurrent(0);
    setConfirmSubmit(false);
    setStage({ name: 'session', session });
    toTop();
  };

  const begin = async (topicId: string, lvl: PracticeLevel, skill: string | null) => {
    setBusy(true);
    setError(null);
    try {
      openSession(await startPractice({ topicId, level: lvl, skillId: skill }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không bắt đầu được bài luyện.');
    } finally {
      setBusy(false);
    }
  };

  const submit = async (session: PracticeStartResponse) => {
    setBusy(true);
    setError(null);
    try {
      const result = await submitPractice(session.attemptId, answers);
      setStage({ name: 'result', result, topicId: session.topicId, level: session.level, skillId: session.skillId });
      toTop();
      void fetchPracticeHistory().then(setHistory).catch(() => undefined);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Nộp bài chưa thành công, con thử lại nhé.');
    } finally {
      setBusy(false);
    }
  };

  const openHistory = async (item: PracticeHistoryItem) => {
    setBusy(true);
    setError(null);
    try {
      const detail = await fetchPracticeAttempt(item.id);
      if (detail.status === 'submitted') {
        setStage({ name: 'result', result: detail, topicId: item.topicId, level: item.level, skillId: item.skillId });
        toTop();
      } else {
        openSession(detail);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không mở được bài cũ.');
    } finally {
      setBusy(false);
    }
  };

  const errorBox = error && (
    <div className="rounded-2xl bg-white p-4 text-sm font-bold text-rose-600 shadow-sm ring-2 ring-rose-200">{error}</div>
  );

  let content: React.ReactNode;

  // ================================================================ browse
  if (stage.name === 'browse') {
    const group = PRACTICE_CATALOG.find((g) => g.id === groupId) as PracticeGroupInfo;
    const groupTheme = GROUP_THEMES[group.id];
    content = (
      <div className="space-y-8">
        <HeroBanner onStart={() => groupsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })} />
        {errorBox}

        <section ref={groupsRef} className="scroll-mt-20">
          <SectionTitle icon={<Sparkles className="h-5 w-5 text-[#FFD34E]" />}>Chọn nhóm kiến thức</SectionTitle>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
            {PRACTICE_CATALOG.map((g) => {
              const theme = GROUP_THEMES[g.id];
              const Icon = theme.icon;
              const open = g.topics.filter((t) => topicTotal(t.id) > 0).length;
              const active = g.id === groupId;
              return (
                <button
                  key={g.id}
                  type="button"
                  onClick={() => setGroupId(g.id)}
                  aria-pressed={active}
                  className={`group relative flex min-h-[148px] flex-col items-start gap-2.5 rounded-3xl bg-white p-4 text-left transition duration-200 hover:-translate-y-1.5 hover:shadow-[0_18px_40px_-18px_rgba(84,200,255,0.9)] ${
                    active ? 'ring-4 ring-[#FFD34E] shadow-[0_18px_40px_-18px_rgba(255,211,78,0.9)]' : 'shadow-md'
                  }`}
                >
                  <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md transition group-hover:scale-110 group-hover:rotate-6 ${theme.gradient}`}>
                    <Icon className="h-6 w-6" />
                  </span>
                  <span className="font-display text-[15px] leading-snug font-extrabold text-[#071A63]">{g.name}</span>
                  <span className={`mt-auto text-xs font-extrabold ${theme.text}`}>
                    {g.topics.length} chuyên đề{open > 0 ? ` · ${open} đã mở` : ''}
                  </span>
                  {active && (
                    <span className="absolute -top-2 -right-2 flex h-7 w-7 items-center justify-center rounded-full bg-[#FFD34E] text-[#071A63] shadow">
                      <Check className="h-4 w-4" />
                    </span>
                  )}
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionTitle
            icon={
              <span className={`flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br text-white ${groupTheme.gradient}`}>
                <groupTheme.icon className="h-4 w-4" />
              </span>
            }
          >
            {group.name}
          </SectionTitle>
          {loading ? (
            <div className="flex items-center gap-2 rounded-3xl bg-white p-6 text-sm font-bold text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Mimo đang tải chuyên đề…
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {group.topics.map((t) => {
                const total = topicTotal(t.id);
                const levels = catalog?.topics[t.id]?.levels;
                const availableLevels = PRACTICE_LEVELS.filter((l) => (levels?.[l] ?? 0) > 0);
                const p = progress.get(t.id);
                const passed = p ? availableLevels.filter((l) => p.passed.has(l)).length : 0;
                const open = total > 0;
                const select = () => {
                  setSkillId(null);
                  setError(null);
                  setStage({ name: 'topic', topicId: t.id });
                  toTop();
                };

                const status = !open ? 'closed' : p ? 'learning' : 'open';
                const badge = TOPIC_STATUS[status];

                if (!open) {
                  return (
                    <div key={t.id} className="flex min-h-[132px] flex-col rounded-3xl bg-[#F1F3FA] p-4" aria-disabled="true">
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full bg-white px-2.5 py-0.5 font-mono text-xs font-bold text-slate-500">{t.id}</span>
                        <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${badge.className}`}>
                          <Lock className="h-3.5 w-3.5" /> {badge.label}
                        </span>
                      </div>
                      <div className="mt-2 font-display text-base leading-snug font-extrabold text-[#5A6B9A]">{t.name}</div>
                      <div className="mt-auto pt-3 text-xs font-bold text-[#8A9BC4]">Cô đang chuẩn bị bài cho chuyên đề này</div>
                    </div>
                  );
                }

                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={select}
                    className={`group flex min-h-[132px] flex-col rounded-3xl p-4 text-left ring-2 transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_40px_-18px_rgba(255,211,78,0.9)] focus-visible:ring-4 focus-visible:ring-[#FFD34E] focus-visible:outline-none ${groupTheme.soft} ${
                      status === 'learning' ? 'ring-[#B49CFF]' : 'ring-white/70'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`rounded-full bg-gradient-to-r px-2.5 py-0.5 font-mono text-xs font-bold text-white ${groupTheme.gradient}`}>{t.id}</span>
                      <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold ${badge.className}`}>
                        {status === 'learning' ? <PlayCircle className="h-3.5 w-3.5" /> : <Star className="h-3.5 w-3.5" />} {badge.label}
                      </span>
                    </div>
                    <div className="mt-2 font-display text-lg leading-snug font-extrabold text-[#071A63]">{t.name}</div>
                    <div className="mt-auto pt-3">
                      {status === 'learning' ? (
                        <>
                          <div className="flex items-center justify-between text-xs font-extrabold">
                            <span className="text-[#6A4BE6]">Vượt qua {passed}/{availableLevels.length} mức</span>
                            <span className="text-slate-500">{total} câu</span>
                          </div>
                          <ProgressBar value={availableLevels.length ? passed / availableLevels.length : 0} className="mt-1.5" track="bg-white" />
                        </>
                      ) : (
                        <div className="text-xs font-extrabold text-slate-500">{total} câu hỏi · {availableLevels.length} mức độ</div>
                      )}
                      <span className={`mt-2.5 inline-flex items-center gap-1 text-sm font-extrabold transition group-hover:gap-2 ${groupTheme.text}`}>
                        {status === 'learning' ? 'Học tiếp' : 'Bắt đầu luyện'} <ChevronRight className="h-4 w-4" />
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {history.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-md">
            <h2 className="mb-3 flex items-center gap-2 font-display text-lg font-extrabold text-[#071A63]">
              <History className="h-5 w-5 text-[#1267E9]" /> Hành trình gần đây
            </h2>
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {history.slice(0, 6).map((h) => {
                const done = h.status === 'submitted';
                const ratio = done && h.total ? (h.score ?? 0) / h.total : 0;
                return (
                  <li key={h.id}>
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() => openHistory(h)}
                      className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl bg-[#F4FAFF] px-3.5 py-2.5 text-left transition hover:bg-[#EAF6FF]"
                    >
                      <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-sm font-extrabold ${done ? (ratio >= PASS_RATIO ? 'bg-[#EAFBF4] text-[#119468]' : 'bg-[#FFF8E1] text-[#B7790A]') : 'bg-[#EAF6FF] text-[#1267E9]'}`}>
                        {done ? `${h.score}/${h.total}` : '…'}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-bold text-[#071A63]">{findPracticeTopic(h.topicId)?.name ?? h.topicId}</span>
                        <span className="block text-xs text-slate-500">
                          {PRACTICE_LEVEL_LABELS[h.level]}{h.skillId ? ` · ${practiceSkillLabel(h.skillId)}` : ''}{done ? '' : ' · Đang làm dở'}
                        </span>
                      </span>
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
        )}
      </div>
    );
  }

  // ================================================================ topic
  else if (stage.name === 'topic') {
    const topic = findPracticeTopic(stage.topicId)!;
    const availability = catalog?.topics[stage.topicId];
    const skills = Object.entries(availability?.skills ?? {});
    const p = progress.get(stage.topicId);
    content = (
      <div className="space-y-6">
        <BackButton onClick={() => setStage({ name: 'browse' })}>Chọn chuyên đề khác</BackButton>

        <section className="rounded-[2rem] bg-white p-5 shadow-md sm:p-6">
          <span className="rounded-full bg-[#EAF6FF] px-2.5 py-0.5 font-mono text-xs font-bold text-[#1267E9]">{topic.id}</span>
          <h1 className="mt-2 font-display text-2xl font-extrabold text-[#071A63] sm:text-3xl">{topic.name}</h1>
          <div className="mt-4">
            <MimoSays>Chọn kĩ năng con muốn luyện, rồi bấm vào một mức độ để bay vào vũ trụ Toán học nhé! 🚀</MimoSays>
          </div>

          <h2 className="mt-6 mb-2.5 flex items-center gap-2 font-display text-base font-extrabold text-[#071A63]">
            <Target className="h-5 w-5 text-[#FF76B5]" /> Kĩ năng
          </h2>
          <div className="flex flex-wrap gap-2">
            {[[null, Object.values(availability?.skills ?? {}).reduce((a, b) => a + b, 0)] as const, ...skills].map(([s, count]) => {
              const active = skillId === s;
              return (
                <button
                  key={s ?? 'all'}
                  type="button"
                  onClick={() => setSkillId(s)}
                  aria-pressed={active}
                  className={`inline-flex min-h-[44px] items-center gap-2 rounded-full px-4 text-sm font-bold transition ${
                    active ? 'bg-[#1267E9] text-white shadow-md' : 'bg-[#F4FAFF] text-[#071A63] ring-1 ring-[#54C8FF]/40 hover:ring-[#1267E9]'
                  }`}
                >
                  {active && <Check className="h-4 w-4" />}
                  {s ? practiceSkillLabel(s) : 'Tất cả kĩ năng'}
                  <span className={`rounded-full px-1.5 text-xs ${active ? 'bg-white/25' : 'bg-white text-slate-500'}`}>{count}</span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <SectionTitle icon={<Trophy className="h-5 w-5 text-[#FFD34E]" />}>Bài luyện theo mức độ</SectionTitle>
          {errorBox && <div className="mb-3">{errorBox}</div>}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
            {PRACTICE_LEVELS.map((l) => {
              const theme = LEVEL_THEMES[l];
              const Icon = theme.icon;
              const count = availability?.levels[l] ?? 0;
              const best = p?.best[l];
              return (
                <div key={l} className={`flex flex-col rounded-3xl bg-white p-4 shadow-md transition hover:-translate-y-1 ${count === 0 ? 'opacity-60' : ''}`}>
                  <div className="flex items-center gap-3">
                    <span className={`flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br text-white shadow-md ${theme.gradient}`}>
                      <Icon className="h-6 w-6" />
                    </span>
                    <div>
                      <div className="font-display text-lg font-extrabold text-[#071A63]">{PRACTICE_LEVEL_LABELS[l]}</div>
                      <div className={`text-xs font-bold ${theme.text}`}>{theme.hint}</div>
                    </div>
                  </div>
                  <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-xs font-bold text-slate-600 ${theme.soft}`}>
                    <span>{count > 0 ? `${count} câu hỏi` : 'Sắp ra mắt'}</span>
                    {best !== undefined && (
                      <span className="inline-flex items-center gap-1">
                        <Star className="h-3.5 w-3.5 fill-[#FFD34E] text-[#FFD34E]" /> {Math.round(best * 100)}%
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    disabled={busy || count === 0}
                    onClick={() => begin(stage.topicId, l, skillId)}
                    className={`mt-4 inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl bg-gradient-to-r text-sm font-extrabold text-white shadow-md transition hover:brightness-110 disabled:cursor-not-allowed disabled:from-slate-300 disabled:to-slate-300 ${theme.gradient}`}
                  >
                    {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <PlayCircle className="h-5 w-5" />}
                    {count === 0 ? 'Chưa có bài' : 'Bắt đầu'}
                  </button>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  // ================================================================ session
  else if (stage.name === 'session') {
    const { session } = stage;
    const total = session.questions.length;
    const idx = Math.min(current, total - 1);
    const q = session.questions[idx];
    const answered = session.questions.filter((x) => (answers[x.id] ?? []).length > 0).length;
    const levelTheme = LEVEL_THEMES[session.level];
    const choose = (qid: string, pos: number, multi: boolean) =>
      setAnswers((prev) => {
        const cur = prev[qid] ?? [];
        const next = multi ? (cur.includes(pos) ? cur.filter((x) => x !== pos) : [...cur, pos].sort()) : [pos];
        return { ...prev, [qid]: next };
      });
    const go = (next: number) => {
      setCurrent(Math.max(0, Math.min(total - 1, next)));
      setConfirmSubmit(false);
      // Keep the progress header and the new question in view
      const top = sessionTopRef.current?.getBoundingClientRect().top ?? 0;
      if (top < 0) sessionTopRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    };

    content = (
      <div className="mx-auto max-w-3xl space-y-4">
        <div ref={sessionTopRef} className="scroll-mt-20 rounded-3xl bg-white p-4 shadow-lg">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <div className="truncate font-display text-base font-extrabold text-[#071A63]">{findPracticeTopic(session.topicId)?.name}</div>
              <div className={`text-xs font-bold ${levelTheme.text}`}>
                {PRACTICE_LEVEL_LABELS[session.level]}{session.skillId ? ` · ${practiceSkillLabel(session.skillId)}` : ''}
              </div>
            </div>
            <span className="shrink-0 rounded-full bg-[#EAF6FF] px-3 py-1.5 text-sm font-extrabold text-[#1267E9]">
              Đã làm {answered}/{total}
            </span>
          </div>
          <ProgressBar value={total ? answered / total : 0} className="mt-3" />
          <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Chọn câu hỏi">
            {session.questions.map((x, i) => {
              const done = (answers[x.id] ?? []).length > 0;
              return (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => go(i)}
                  aria-current={i === idx ? 'step' : undefined}
                  aria-label={`Câu ${i + 1}${done ? ' (đã làm)' : ''}`}
                  className={`h-8 w-8 rounded-full text-xs font-extrabold transition ${
                    i === idx ? 'bg-[#FFD34E] text-[#071A63] ring-2 ring-[#071A63]' : done ? 'bg-[#1267E9] text-white' : 'bg-[#F4FAFF] text-slate-500 hover:bg-[#EAF6FF]'
                  }`}
                >
                  {i + 1}
                </button>
              );
            })}
          </div>
        </div>

        <div key={q.id} className="rounded-[2rem] bg-white p-5 shadow-lg sm:p-7">
          <div className="mb-4 flex flex-wrap items-center gap-2">
            <span className={`rounded-full bg-gradient-to-r px-3 py-1 text-sm font-extrabold text-white ${levelTheme.gradient}`}>
              Câu {idx + 1}/{total}
            </span>
            {q.type === 'multiple_choice' && (
              <span className="rounded-full bg-[#F3EFFF] px-2.5 py-1 text-xs font-extrabold text-[#6A4BE6]">Chọn tất cả đáp án đúng</span>
            )}
          </div>
          <PracticeText text={q.prompt} className="text-xl leading-relaxed font-semibold text-[#071A63] sm:text-2xl" />
          <div className="mt-6 grid grid-cols-1 gap-3 sm:grid-cols-2">
            {q.options.map((text, pos) => {
              const picked = (answers[q.id] ?? []).includes(pos);
              return (
                <button
                  key={pos}
                  type="button"
                  aria-pressed={picked}
                  onClick={() => choose(q.id, pos, q.type === 'multiple_choice')}
                  className={`flex min-h-[64px] items-center gap-3 rounded-2xl border-2 px-4 py-3 text-left text-lg transition duration-150 active:scale-[0.98] ${
                    picked
                      ? 'border-[#1267E9] bg-[#EAF6FF] font-bold text-[#071A63] shadow-[0_8px_20px_-10px_rgba(18,103,233,0.8)]'
                      : 'border-[#DCEEFF] bg-white text-[#071A63] hover:border-[#54C8FF] hover:bg-[#F4FAFF]'
                  }`}
                >
                  <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-base font-extrabold transition ${picked ? 'bg-[#1267E9] text-white' : 'bg-[#FFF8E1] text-[#B7790A] ring-1 ring-[#FFD34E]'}`}>
                    {picked ? <Check className="h-5 w-5" /> : LETTERS[pos]}
                  </span>
                  <PracticeText text={text} />
                </button>
              );
            })}
          </div>

          <div className="mt-6 flex items-center justify-between gap-3">
            <button
              type="button"
              disabled={idx === 0}
              onClick={() => go(idx - 1)}
              className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-[#F4FAFF] px-5 text-base font-extrabold text-[#1267E9] transition hover:bg-[#EAF6FF] disabled:opacity-40"
            >
              <ArrowLeft className="h-5 w-5" /> Câu trước
            </button>
            {idx < total - 1 && (
              <button
                type="button"
                onClick={() => go(idx + 1)}
                className="inline-flex min-h-[52px] items-center gap-2 rounded-2xl bg-[#1267E9] px-5 text-base font-extrabold text-white shadow-md transition hover:bg-[#0F59CC]"
              >
                Câu sau <ArrowRight className="h-5 w-5" />
              </button>
            )}
          </div>
        </div>

        {errorBox}
        <div className="rounded-3xl bg-white/10 p-4 ring-1 ring-white/20 backdrop-blur">
          {confirmSubmit && answered < total ? (
            <div className="space-y-3 rounded-2xl bg-white p-4">
              <MimoSays size={56}>Con còn {total - answered} câu chưa làm. Con vẫn muốn nộp bài chứ?</MimoSays>
              <div className="flex gap-2">
                <button type="button" onClick={() => setConfirmSubmit(false)} className="min-h-[52px] flex-1 rounded-2xl bg-[#F4FAFF] text-base font-bold text-[#1267E9]">
                  Làm tiếp
                </button>
                <button type="button" disabled={busy} onClick={() => submit(session)} className="min-h-[52px] flex-1 rounded-2xl bg-[#FFD34E] text-base font-extrabold text-[#071A63] shadow-md">
                  Nộp bài
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              disabled={busy}
              onClick={() => (answered < total ? setConfirmSubmit(true) : submit(session))}
              className="flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFD34E] to-[#FFB800] text-lg font-extrabold text-[#071A63] shadow-[0_14px_30px_-12px_rgba(255,211,78,0.9)] transition hover:brightness-105"
            >
              {busy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Rocket className="h-5 w-5" />} Nộp bài và xem kết quả
            </button>
          )}
        </div>
      </div>
    );
  }

  // ================================================================ result
  else {
    const { result } = stage;
    const ratio = result.total ? result.score / result.total : 0;
    const stars = ratio >= 0.9 ? 3 : ratio >= 0.6 ? 2 : ratio > 0 ? 1 : 0;
    const blank = result.results.filter((r) => r.selected.length === 0).length;
    const wrong = result.total - result.score - blank;
    const weakSkills = result.skills.filter((s) => s.correct < s.total);
    const cheer =
      ratio >= 0.9
        ? 'Tuyệt đỉnh! Con là phi hành gia Toán học rồi! Thử mức độ khó hơn nhé!'
        : ratio >= 0.6
          ? 'Làm tốt lắm! Cùng Mimo xem lại vài câu để giỏi hơn nữa nhé.'
          : 'Không sao cả! Mỗi lần luyện là một bước tiến. Cùng xem lời giải rồi thử lại nhé!';

    content = (
      <div className="mx-auto max-w-3xl space-y-5">
        <section className="rounded-[2rem] bg-white p-6 text-center shadow-lg">
          <div className="flex flex-col items-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
            <div className="mimo-float">
              <MimoMascot size={120} eager />
            </div>
            <ScoreRing score={result.score} total={result.total} />
          </div>
          <div className="mt-3 flex justify-center gap-2">
            {[0, 1, 2].map((i) => (
              <Star
                key={i}
                style={{ animationDelay: `${i * 0.15}s` }}
                className={`mimo-pop h-10 w-10 ${i < stars ? 'fill-[#FFD34E] text-[#FFD34E]' : 'text-slate-200'}`}
              />
            ))}
          </div>
          <div className="mt-2 text-sm font-bold text-slate-500">
            {findPracticeTopic(stage.topicId)?.name} · {PRACTICE_LEVEL_LABELS[stage.level]}
          </div>
          <div className="mt-3 flex flex-wrap justify-center gap-2 text-sm font-extrabold">
            <span className="rounded-full bg-[#EAFBF4] px-3 py-1 text-[#119468]">✓ Đúng {result.score}</span>
            <span className="rounded-full bg-[#FFF0F7] px-3 py-1 text-[#D9468C]">✗ Chưa đúng {wrong}</span>
            {blank > 0 && <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-500">○ Bỏ trống {blank}</span>}
          </div>
          <p className="mx-auto mt-4 max-w-md rounded-2xl bg-[#FFF8E1] px-4 py-3 text-base font-bold text-[#071A63]">{cheer}</p>
        </section>

        {weakSkills.length > 0 && (
          <section className="rounded-3xl bg-white p-5 shadow-md">
            <h2 className="font-display text-base font-extrabold text-[#071A63]">Mimo gợi ý ôn tập</h2>
            <ul className="mt-3 space-y-2">
              {weakSkills.map((s) => (
                <li key={s.skillId} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-[#F4FAFF] px-4 py-3">
                  <span className="text-sm text-[#071A63]">
                    Ôn lại <b>{practiceSkillLabel(s.skillId)}</b> <span className="text-slate-500">(đúng {s.correct}/{s.total})</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => begin(stage.topicId, stage.level, s.skillId)}
                    className="min-h-[40px] rounded-full bg-[#1267E9] px-4 text-xs font-extrabold text-white hover:bg-[#0F59CC]"
                  >
                    Luyện kĩ năng này
                  </button>
                </li>
              ))}
            </ul>
          </section>
        )}

        <SectionTitle icon={<Sparkles className="h-5 w-5 text-[#FFD34E]" />}>Xem lại từng câu</SectionTitle>
        {result.questions.map((q, i) => {
          const r = result.results.find((x) => x.questionId === q.id);
          if (!r) return null;
          const isBlank = r.selected.length === 0;
          return (
            <div key={q.id} className="rounded-[2rem] bg-white p-5 shadow-md sm:p-6">
              <div
                className={`mb-3 flex items-center gap-2 rounded-2xl px-3 py-2 text-sm font-extrabold ${
                  r.correct ? 'bg-[#EAFBF4] text-[#119468]' : isBlank ? 'bg-slate-100 text-slate-600' : 'bg-[#FFF0F7] text-[#D9468C]'
                }`}
              >
                {r.correct ? <CheckCircle2 className="h-5 w-5" /> : isBlank ? <CircleDashed className="h-5 w-5" /> : <XCircle className="h-5 w-5" />}
                Câu {i + 1} ·{' '}
                {r.correct ? 'Chính xác! Con giỏi quá! 🎉' : isBlank ? 'Con chưa chọn đáp án cho câu này' : 'Chưa đúng rồi, cùng xem Mimo giải thích nhé! 💪'}
              </div>
              <PracticeText text={q.prompt} className="text-lg font-semibold text-[#071A63]" />
              <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                {q.options.map((text, pos) => {
                  const isCorrect = r.correctPositions.includes(pos);
                  const picked = r.selected.includes(pos);
                  return (
                    <div
                      key={pos}
                      className={`flex min-h-[56px] items-center gap-3 rounded-2xl border-2 px-4 py-2.5 text-base ${
                        isCorrect ? 'border-[#22C38E] bg-[#EAFBF4] font-bold text-[#0B6B4A]' : picked ? 'border-[#FF76B5] bg-[#FFF0F7] text-[#9C2C62]' : 'border-[#EEF4FB] text-slate-600'
                      }`}
                    >
                      <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${isCorrect ? 'bg-[#22C38E] text-white' : picked ? 'bg-[#FF76B5] text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {LETTERS[pos]}
                      </span>
                      <PracticeText text={text} />
                      {isCorrect && <span className="ml-auto shrink-0 text-xs font-extrabold text-[#119468]">Đáp án đúng</span>}
                      {picked && !isCorrect && <span className="ml-auto shrink-0 text-xs font-extrabold text-[#D9468C]">Con chọn</span>}
                    </div>
                  );
                })}
              </div>
              {r.explanation && (
                <div className="mt-3 flex gap-3 rounded-2xl bg-[#FFF8E1] p-4 text-base text-[#071A63]">
                  <span className="text-xl" aria-hidden="true">💡</span>
                  <div>
                    <b className="text-[#B7790A]">Mimo giải thích: </b>
                    <PracticeText text={r.explanation} className="inline" />
                  </div>
                </div>
              )}
            </div>
          );
        })}

        {errorBox}
        <div className="flex flex-col gap-3 sm:flex-row">
          <button
            type="button"
            disabled={busy}
            onClick={() => begin(stage.topicId, stage.level, stage.skillId)}
            className="flex min-h-[56px] flex-1 items-center justify-center gap-2 rounded-2xl bg-gradient-to-r from-[#FFD34E] to-[#FFB800] text-base font-extrabold text-[#071A63] shadow-md"
          >
            <RotateCcw className="h-5 w-5" /> Luyện lượt mới
          </button>
          <button
            type="button"
            onClick={() => {
              setStage({ name: 'browse' });
              void loadOverview();
            }}
            className="min-h-[56px] flex-1 rounded-2xl bg-white text-base font-extrabold text-[#1267E9] shadow-md"
          >
            Chọn chuyên đề khác
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="relative -mx-4 overflow-hidden bg-[#071A63] bg-[radial-gradient(ellipse_at_top_left,rgba(84,200,255,0.28),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(255,118,181,0.22),transparent_55%)] px-4 py-6 sm:mx-0 sm:rounded-[2rem] sm:px-6 sm:py-8">
      <SpaceDecor />
      <div className="relative">{content}</div>
    </div>
  );
};
