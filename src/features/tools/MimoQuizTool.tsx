import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronLeft, ChevronRight, Eye, Flag, Play, RotateCcw, Settings2, Timer, Volume2, VolumeX } from 'lucide-react';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { MimoMascot } from '../practice/student/practiceTheme';
import { QuestionPicker } from './QuestionPicker';
import { playChime, playFanfare } from './toolSound';
import type { ToolQuestion } from './toolQuestions';
import { formatClock } from './toolUtils';
import { LETTERS, TILE, TimerRing } from './quizStyle';
import { LiveQuizHost } from './LiveQuizHost';
import { usingFirebaseEmulator } from '../../lib/firebase/config';
import { createLiveQuiz } from '../../services/liveQuizService';
import type { LiveQuizHostView } from '../../types/liveQuiz';
import {
  buildQuizDeck,
  DEFAULT_QUIZ_SETTINGS,
  finishQuiz,
  goTo,
  markClass,
  quizSummary,
  reveal,
  secondsLeft,
  startQuiz,
  tickQuiz,
  type ClassMark,
  type QuizRun,
  type QuizSettings,
} from './mimoQuiz';

const PER_QUESTION = [10, 20, 30, 45, 60, 90];
const TOTAL_MIN = [5, 10, 15, 20];
const MARKS: { v: ClassMark; label: string; cls: string }[] = [
  { v: 'most', label: 'Đa số đúng', cls: 'bg-[#E7F7F0] text-[#1F9D6B] ring-[#1F9D6B]' },
  { v: 'some', label: 'Khoảng một nửa', cls: 'bg-[#FFF6DC] text-[#B7790A] ring-[#F5A800]' },
  { v: 'few', label: 'Ít bạn đúng', cls: 'bg-[#FFEDF1] text-[#D93B5B] ring-[#D93B5B]' },
];

const Chip: React.FC<{ on: boolean; onClick: () => void; children: React.ReactNode }> = ({ on, onClick, children }) => (
  <button
    type="button"
    aria-pressed={on}
    onClick={onClick}
    className={`min-h-[36px] rounded-full px-3 text-sm font-bold ${on ? 'bg-[#1267E9] text-white' : 'bg-[#EAF5FF] text-[#1267E9]'}`}
  >
    {children}
  </button>
);

type Phase = 'setup' | 'play' | 'summary' | 'live';

// Join mode needs the live-quiz API, which is only switched on against the Firebase Emulator for now
const LIVE_AVAILABLE = usingFirebaseEmulator;

/** "Mimo Quiz": presentation mode (one board) or join mode (students answer on their own devices). */
export const MimoQuizTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [settings, setSettings] = useState<QuizSettings>(DEFAULT_QUIZ_SETTINGS);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]);
  const [run, setRun] = useState<QuizRun | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(true);
  const [timeUpAt, setTimeUpAt] = useState<number | null>(null);
  const [mode, setMode] = useState<'present' | 'live'>('present');
  const [live, setLive] = useState<{ deck: ToolQuestion[]; view: LiveQuizHostView; perQuestionSec: number | null } | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState('');
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const big = presenting;
  const onQuestions = useCallback((q: ToolQuestion[]) => setQuestions(q), []);
  const usable = questions.length;
  const set = <K extends keyof QuizSettings>(k: K, v: QuizSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play' || !run) return;
    const t = tickQuiz(run, settings, now);
    if (t.run === run) return;
    setRun(t.run);
    if (t.timeUp) {
      setTimeUpAt(now);
      if (soundRef.current) playChime();
    }
    if (t.run.finishedAt !== null) setPhase('summary');
  }, [now, run, settings, phase]);

  const beginLive = async () => {
    setStarting(true);
    setStartError('');
    try {
      const deck = buildQuizDeck(questions, settings);
      const perQuestionSec = settings.timer === 'per' ? settings.perQuestionSec : null;
      setLive({ deck, view: await createLiveQuiz(deck, perQuestionSec, 'Mimo Quiz'), perQuestionSec });
      setPhase('live');
    } catch (e) {
      setStartError(e instanceof Error ? e.message : 'Không tạo được phòng Quiz.');
    } finally {
      setStarting(false);
    }
  };

  const begin = () => {
    if (mode === 'live') return void beginLive();
    const t = Date.now();
    setRun(startQuiz(buildQuizDeck(questions, settings), settings, t));
    setNow(t);
    setTimeUpAt(null);
    setPhase('play');
  };

  const move = useCallback(
    (delta: number) => {
      if (!run) return;
      setRun(goTo(run, run.index + delta, settings, Date.now()));
      setTimeUpAt(null);
    },
    [run, settings]
  );

  const doReveal = useCallback(() => {
    if (!run || run.revealed[run.index]) return;
    setRun(reveal(run));
  }, [run]);

  const finish = useCallback(() => {
    if (!run) return;
    setRun(finishQuiz(run, Date.now()));
    if (soundRef.current) playFanfare();
    setPhase('summary');
  }, [run]);

  useEffect(() => {
    if (phase !== 'play') return;
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input, textarea, select')) return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') move(1);
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') move(-1);
      else if (e.key === ' ' || e.key === 'Enter') {
        e.preventDefault();
        doReveal();
      } else return;
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [phase, move, doReveal]);

  // ---------------------------------------------------------------- setup
  if (phase === 'setup') {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="mb-3 font-display text-base font-extrabold text-[#172B4D]">1. Chọn câu hỏi</h2>
          <QuestionPicker onChange={onQuestions} />
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-base font-extrabold text-[#172B4D]">2. Thiết lập Quiz</h2>
          <div>
            <span className="text-xs font-bold text-[#5E6C84]">Cách chơi</span>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {(
                [
                  ['present', 'Trình chiếu', 'Chiếu lên bảng, học sinh giơ tay hoặc giơ thẻ A/B/C/D.'],
                  ['live', 'Học sinh tham gia', LIVE_AVAILABLE ? 'Học sinh nhập mã phòng và trả lời trên máy của mình (thử nghiệm).' : 'Đang thử nghiệm, chưa bật trên máy chủ này.'],
                ] as const
              ).map(([v, name, hint]) => (
                <button
                  key={v}
                  type="button"
                  aria-pressed={mode === v}
                  disabled={v === 'live' && !LIVE_AVAILABLE}
                  onClick={() => {
                    setMode(v);
                    if (v === 'live' && settings.timer === 'total') set('timer', 'per');
                  }}
                  className={`rounded-xl border-2 p-3 text-left disabled:opacity-50 ${mode === v ? 'border-[#1267E9] bg-[#EAF5FF]' : 'border-[#DCE7F3] bg-white'}`}
                >
                  <div className="font-bold text-[#071A63]">{name}</div>
                  <div className="text-xs text-[#5E6C84]">{hint}</div>
                </button>
              ))}
            </div>
          </div>
          <label className="block">
            <span className="text-xs font-bold text-[#5E6C84]">Số câu: {Math.min(settings.questionCount, usable || settings.questionCount)}</span>
            <input
              type="range"
              min={1}
              max={Math.max(1, Math.min(40, usable || 40))}
              value={Math.min(settings.questionCount, Math.max(1, usable || 40))}
              onChange={(e) => set('questionCount', Number(e.target.value))}
              className="mt-1 w-full accent-[#1267E9]"
            />
          </label>
          <div>
            <span className="text-xs font-bold text-[#5E6C84]">Hẹn giờ</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              <Chip on={settings.timer === 'per'} onClick={() => set('timer', 'per')}>Mỗi câu</Chip>
              {mode === 'present' && (
                <Chip on={settings.timer === 'total'} onClick={() => set('timer', 'total')}>
                  Cả bài
                </Chip>
              )}
              <Chip on={settings.timer === 'none'} onClick={() => set('timer', 'none')}>Không hẹn giờ</Chip>
            </div>
            {settings.timer === 'per' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {PER_QUESTION.map((s) => (
                  <Chip key={s} on={settings.perQuestionSec === s} onClick={() => set('perQuestionSec', s)}>
                    {s} giây
                  </Chip>
                ))}
              </div>
            )}
            {settings.timer === 'total' && (
              <div className="mt-2 flex flex-wrap gap-1.5">
                {TOTAL_MIN.map((m) => (
                  <Chip key={m} on={settings.totalSec === m * 60} onClick={() => set('totalSec', m * 60)}>
                    {m} phút
                  </Chip>
                ))}
              </div>
            )}
          </div>
          {(
            [
              ['shuffleQuestions', 'Xáo trộn thứ tự câu hỏi'],
              ['shuffleAnswers', 'Xáo trộn đáp án A/B/C/D'],
              ...(settings.timer === 'per' && mode === 'present' ? ([['autoReveal', 'Hết giờ tự hiện đáp án']] as const) : []),
            ] as const
          ).map(([k, label]) => (
            <label key={k} className="flex items-center gap-2 text-sm text-[#172B4D]">
              <input type="checkbox" checked={settings[k]} onChange={(e) => set(k, e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
              {label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-[#172B4D]">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
            Âm báo hết giờ
          </label>
          <button type="button" disabled={usable < 1 || starting} onClick={begin} className="studio-btn studio-btn-accent min-h-[52px] w-full text-base">
            <Play className="h-5 w-5" /> {mode === 'live' ? (starting ? 'Đang tạo phòng…' : 'Tạo phòng Quiz') : 'Bắt đầu Quiz'}
          </button>
          {startError && <p className="text-sm font-bold text-[#D93B5B]">{startError}</p>}
          {usable < 1 && <p className="text-xs font-semibold text-[#B7790A]">Hãy chọn ít nhất 1 câu hỏi.</p>}
        </section>
      </div>
    );
  }

  if (phase === 'live' && live) {
    return (
      <LiveQuizHost
        deck={live.deck}
        initial={live.view}
        perQuestionSec={live.perQuestionSec}
        presenting={presenting}
        sound={sound}
        onExit={() => {
          setLive(null);
          setPhase('setup');
        }}
      />
    );
  }

  if (!run) return null;

  // ---------------------------------------------------------------- summary
  if (phase === 'summary') {
    const s = quizSummary(run);
    return (
      <div className="mx-auto max-w-4xl space-y-6">
        <div className="flex flex-col items-center gap-2 text-center">
          <MimoMascot size={big ? 140 : 100} eager />
          <h2 className={`font-display font-extrabold text-[#071A63] ${big ? 'text-5xl' : 'text-3xl'}`}>Hoàn thành Mimo Quiz!</h2>
          <p className="text-[#5E6C84]">
            Đã chữa {s.revealed}/{s.total} câu · {formatClock(s.durationSec)}
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3">
          {MARKS.map((m) => (
            <div key={m.v} className={`rounded-2xl p-4 text-center ring-2 ${m.cls}`}>
              <div className={`font-display font-extrabold ${big ? 'text-6xl' : 'text-4xl'}`}>{s[m.v]}</div>
              <div className="text-sm font-bold">{m.label}</div>
            </div>
          ))}
        </div>
        {s.review.length > 0 && (
          <section className="studio-card p-4">
            <h3 className="mb-2 font-display font-extrabold text-[#071A63]">Nên ôn lại</h3>
            <ol className="space-y-2">
              {s.review.map(({ q, i, mark }) => (
                <li key={i} className="flex gap-3 rounded-xl bg-[#F6FAFF] p-3">
                  <span className={`h-fit shrink-0 rounded-full px-2 py-0.5 text-xs font-bold ${MARKS.find((m) => m.v === mark)!.cls}`}>Câu {i + 1}</span>
                  <div className="min-w-0 flex-1">
                    <RichContentRenderer content={q.prompt} />
                    <div className="mt-1 text-sm font-bold text-[#1F9D6B]">
                      Đáp án: {q.correct.map((c) => LETTERS[c]).join(', ')}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          </section>
        )}
        <details className="studio-card p-4">
          <summary className="cursor-pointer font-display font-extrabold text-[#071A63]">Xem lại tất cả câu và đáp án</summary>
          <ol className="mt-3 space-y-3">
            {run.deck.map((q, i) => (
              <li key={i} className="rounded-xl bg-[#F6FAFF] p-3">
                <div className="text-xs font-bold text-[#5E6C84]">Câu {i + 1}</div>
                <RichContentRenderer content={q.prompt} />
                <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                  {q.options.map((o, k) => (
                    <li key={k} className={`flex items-center gap-2 text-sm ${q.correct.includes(k) ? 'font-bold text-[#1F9D6B]' : 'text-[#5E6C84]'}`}>
                      <span>{LETTERS[k]}.</span>
                      <RichContentRenderer content={o} />
                      {q.correct.includes(k) && <Check className="h-4 w-4" />}
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ol>
        </details>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={begin} className="studio-btn studio-btn-accent min-h-[48px] px-6">
            <RotateCcw className="h-5 w-5" /> Làm lại Quiz
          </button>
          <button type="button" onClick={() => setPhase('setup')} className="studio-btn studio-btn-secondary min-h-[48px]">
            <Settings2 className="h-5 w-5" /> Đổi câu hỏi / thiết lập
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- play
  const q = run.deck[run.index];
  const shown = run.revealed[run.index];
  const left = secondsLeft(run, now);
  const ringTotal = settings.timer === 'total' ? settings.totalSec : settings.perQuestionSec;
  const showTimeUp = timeUpAt !== null && now - timeUpAt < 2500;
  const last = run.index === run.deck.length - 1;

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className={`rounded-full bg-[#071A63] px-4 py-1.5 font-display font-extrabold text-white ${big ? 'text-2xl' : 'text-base'}`}>
          Câu {run.index + 1}/{run.deck.length}
        </div>
        {q.multi && <span className="rounded-full bg-[#F1ECFF] px-3 py-1 text-sm font-bold text-[#6A4BE6]">Có thể có nhiều đáp án đúng</span>}
        <div className="ml-auto flex items-center gap-3">
          {showTimeUp && <span className={`mimo-pop font-display font-extrabold text-[#E5484D] ${big ? 'text-3xl' : 'text-xl'}`}>Hết giờ!</span>}
          {left !== null ? <TimerRing left={left} total={ringTotal} big={big} /> : settings.timer !== 'none' && <Timer className="h-8 w-8 text-[#B3C2D6]" />}
        </div>
      </div>

      <div className="studio-card p-5 sm:p-7">
        <RichContentRenderer
          content={q.prompt}
          inheritSize
          className={`font-semibold text-[#071A63] ${big ? 'text-3xl leading-snug sm:text-[42px]' : 'text-xl sm:text-2xl'}`}
        />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {q.options.map((opt, i) => {
          const right = q.correct.includes(i);
          return (
            <div
              key={i}
              data-testid="quiz-option"
              data-correct={shown && right ? 'true' : undefined}
              className={`relative flex items-center gap-4 rounded-2xl px-4 text-white shadow-md transition-all duration-500 ${TILE[i].bg} ${
                big ? 'min-h-[110px] text-3xl' : 'min-h-[76px] text-xl'
              } ${shown ? (right ? 'scale-[1.02] ring-8 ring-[#FFD34E]' : 'opacity-30 saturate-50') : ''}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-xl bg-white/25 font-display font-extrabold ${big ? 'h-16 w-16 text-3xl' : 'h-11 w-11 text-xl'}`}>
                {LETTERS[i]}
              </span>
              <RichContentRenderer content={opt} inheritSize className="font-bold [&_*]:!text-white" />
              {shown && right && (
                <span className="mimo-pop ml-auto flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-white text-[#1F9D6B]">
                  <Check className="h-7 w-7" strokeWidth={3} />
                </span>
              )}
              <span aria-hidden className="pointer-events-none absolute right-3 top-1 text-lg opacity-30">
                {TILE[i].shape}
              </span>
            </div>
          );
        })}
      </div>

      {shown && q.explanation && (
        <div className="rounded-2xl bg-[#FFF6DC] p-4">
          <div className="text-xs font-bold text-[#B7790A]">Giải thích</div>
          <RichContentRenderer content={q.explanation} inheritSize className={big ? 'text-xl' : ''} />
        </div>
      )}

      {shown && (
        <div className="flex flex-wrap items-center justify-center gap-2">
          <span className="text-sm font-bold text-[#5E6C84]">Cả lớp làm câu này:</span>
          {MARKS.map((m) => (
            <button
              key={m.v}
              type="button"
              aria-pressed={run.marks[run.index] === m.v}
              onClick={() => setRun(markClass(run, run.marks[run.index] === m.v ? null : m.v))}
              className={`min-h-[40px] rounded-full px-4 text-sm font-bold ${run.marks[run.index] === m.v ? `ring-2 ${m.cls}` : 'bg-white text-[#5E6C84] ring-1 ring-[#DCE7F3]'}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap items-center justify-center gap-3">
        <button type="button" onClick={() => move(-1)} disabled={run.index === 0} className={`studio-btn studio-btn-secondary ${big ? 'min-h-[60px] text-lg' : 'min-h-[48px]'}`}>
          <ChevronLeft className="h-5 w-5" /> Câu trước
        </button>
        {!shown ? (
          <button type="button" onClick={doReveal} className={`studio-btn studio-btn-navy ${big ? 'min-h-[60px] px-8 text-lg' : 'min-h-[48px] px-6'}`}>
            <Eye className="h-5 w-5" /> Hiện đáp án
          </button>
        ) : last ? (
          <button type="button" onClick={finish} className={`studio-btn studio-btn-accent ${big ? 'min-h-[60px] px-8 text-lg' : 'min-h-[48px] px-6'}`}>
            <Flag className="h-5 w-5" /> Xem tổng kết
          </button>
        ) : null}
        <button type="button" onClick={() => move(1)} disabled={last} className={`studio-btn studio-btn-primary ${big ? 'min-h-[60px] text-lg' : 'min-h-[48px]'}`}>
          Câu tiếp <ChevronRight className="h-5 w-5" />
        </button>
      </div>

      <div className="flex flex-wrap items-center justify-center gap-2">
        {run.deck.map((_, i) => (
          <button
            key={i}
            type="button"
            aria-label={`Đến câu ${i + 1}`}
            aria-current={i === run.index ? 'step' : undefined}
            onClick={() => {
              setRun(goTo(run, i, settings, Date.now()));
              setTimeUpAt(null);
            }}
            className={`h-8 w-8 rounded-full text-xs font-bold ${
              i === run.index ? 'bg-[#071A63] text-white' : run.revealed[i] ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-[#EAF5FF] text-[#1267E9]'
            }`}
          >
            {i + 1}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3 text-sm">
        <button type="button" onClick={() => setSound((v) => !v)} aria-pressed={sound} className="studio-btn studio-btn-secondary">
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {sound ? 'Có âm báo' : 'Tắt âm'}
        </button>
        <button type="button" onClick={finish} className="studio-btn studio-btn-danger">
          <Flag className="h-4 w-4" /> Kết thúc Quiz
        </button>
        <span className="text-[#5E6C84]">Phím tắt: ← → chuyển câu · Cách/Enter hiện đáp án</span>
      </div>
    </div>
  );
};
