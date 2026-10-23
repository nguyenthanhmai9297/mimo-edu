import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Eye,
  Flag,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  RotateCcw,
  Settings2,
  SkipForward,
  Square,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { MimoMascot } from '../practice/student/practiceTheme';
import { QuestionPicker } from './QuestionPicker';
import { playCorrect, playFanfare, playWrong } from './toolSound';
import type { ToolQuestion } from './toolQuestions';
import { formatClock } from './toolUtils';
import {
  answerTug,
  DEFAULT_TUG_SETTINGS,
  isLocked,
  nextTug,
  pauseTug,
  resumeTug,
  revealTug,
  ropeLimit,
  ropeOffset,
  startTug,
  stopTug,
  Team,
  tickTug,
  timeLeft,
  TugReveal,
  TugSettings,
  TugState,
} from './tugOfWar';

export const TEAM_STYLE = [
  { main: '#1267E9', soft: 'bg-[#EAF5FF]', text: 'text-[#1267E9]', ring: 'ring-[#1267E9]', grad: 'from-[#1267E9] to-[#54C8FF]' },
  { main: '#E5484D', soft: 'bg-[#FFEEF0]', text: 'text-[#D93B5B]', ring: 'ring-[#E5484D]', grad: 'from-[#E5484D] to-[#FF76B5]' },
] as const;
const OPTION_COLORS = ['bg-[#1267E9]', 'bg-[#FF76B5]', 'bg-[#FFB800]', 'bg-[#7B5CFF]', 'bg-[#13B5C9]', 'bg-[#22C38E]'];
const LETTERS = 'ABCDEF';
const DURATIONS = [2, 3, 5, 8, 10];
const TARGETS = [3, 5, 7];

/** Animations of this tool only (pulling crews, wrong-answer shake, confetti). */
export const TUG_CSS = `
.tug-crew { transform-box: fill-box; transform-origin: 50% 100%; }
.tug-crew-0 { transform: rotate(-7deg); }
.tug-crew-1 { transform: rotate(7deg); }
.tug-pull-0 { animation: tug-pull-0 0.42s ease-in-out 2; }
.tug-pull-1 { animation: tug-pull-1 0.42s ease-in-out 2; }
.tug-stumble { animation: tug-stumble 0.5s ease-in-out; }
.tug-cheer { animation: tug-cheer 0.6s ease-in-out infinite; }
@keyframes tug-pull-0 { 0%,100% { transform: rotate(-7deg) translateX(0); } 50% { transform: rotate(-18deg) translateX(-10px); } }
@keyframes tug-pull-1 { 0%,100% { transform: rotate(7deg) translateX(0); } 50% { transform: rotate(18deg) translateX(10px); } }
@keyframes tug-stumble { 0%,100% { transform: rotate(0); } 25% { transform: rotate(6deg); } 75% { transform: rotate(-6deg); } }
@keyframes tug-cheer { 0%,100% { transform: translateY(0); } 50% { transform: translateY(-14px); } }
.tug-shake { animation: tug-shake 0.45s ease-in-out; }
@keyframes tug-shake { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-8px); } 40%,80% { transform: translateX(8px); } }
.tug-confetti { position: absolute; top: -4vh; width: 1.1vh; height: 1.8vh; border-radius: 2px; animation: tug-fall linear infinite; }
@keyframes tug-fall { to { transform: translateY(110vh) rotate(720deg); } }
@media (prefers-reduced-motion: reduce) {
  .tug-pull-0, .tug-pull-1, .tug-stumble, .tug-cheer, .tug-shake, .tug-confetti { animation: none; }
}
`;

/**
 * Two crews of little MimoEDU robots pulling a rope. The flag in the middle of
 * the rope moves one step per point of lead; reaching a team's line wins.
 */
const Rope: React.FC<{
  offset: number;
  limit: number;
  /** Changes on every answer so the pull / stumble animation replays. */
  event: { team: Team; correct: boolean; at: number } | null;
  winner: Team | 'draw' | null;
  names: [string, string];
}> = ({ offset, limit, event, winner, names }) => {
  const MAX = 150;
  const shift = (-offset / limit) * MAX; // positive offset = flag towards the left team
  const crew = (team: Team) => {
    const anim =
      winner === team ? 'tug-cheer' : event?.team === team ? (event.correct ? `tug-pull-${team}` : 'tug-stumble') : '';
    return [0, 1, 2].map((i) => {
      const x = team === 0 ? 285 - i * 55 : 715 + i * 55;
      const c = TEAM_STYLE[team].main;
      return (
        <g key={i} transform={`translate(${x} 0)`}>
          <ellipse cx="0" cy="186" rx="20" ry="4" fill="#071A63" opacity="0.12" />
          <g key={`${event?.at ?? 0}-${winner}`} className={`tug-crew tug-crew-${team} ${anim}`}>
            <rect x="-11" y="166" width="9" height="18" rx="4" fill={c} />
            <rect x="2" y="166" width="9" height="18" rx="4" fill={c} />
            <rect x="-14" y="124" width="28" height="46" rx="11" fill={c} />
            <path d={team === 0 ? 'M6 140 L26 138' : 'M-6 140 L-26 138'} stroke={c} strokeWidth="7" strokeLinecap="round" />
            <circle cx={team === 0 ? 27 : -27} cy="138" r="5" fill="#FFFFFF" stroke={c} strokeWidth="2.5" />
            <circle cx="0" cy="106" r="18" fill="#FFFFFF" stroke={c} strokeWidth="4" />
            <circle cx={team === 0 ? 6 : -6} cy="104" r="3.2" fill="#071A63" />
            <path d={team === 0 ? 'M-1 113 q6 4 12 0' : 'M1 113 q-6 4 -12 0'} stroke="#071A63" strokeWidth="2.2" fill="none" strokeLinecap="round" />
            <circle cx="0" cy="87" r="3.5" fill="#FFD34E" />
          </g>
        </g>
      );
    });
  };
  const ticks = Array.from({ length: limit * 2 + 1 }, (_, i) => 500 + ((i - limit) / limit) * MAX);
  return (
    <svg
      viewBox="0 0 1000 205"
      preserveAspectRatio="xMidYMid meet"
      className="h-full w-full"
      role="img"
      aria-label={`${names[0]} ${offset > 0 ? 'đang dẫn' : offset < 0 ? 'đang bị dẫn' : 'đang hòa'} ${Math.abs(offset)} bước`}
    >
      <rect x="20" y="188" width="960" height="14" rx="7" fill="#E7F7F0" />
      {ticks.map((x, i) => (
        <rect key={i} x={x - 1.5} y="186" width="3" height="18" rx="1.5" fill={i === limit ? '#071A63' : '#BFD6EE'} />
      ))}
      {/* finish lines: when the flag reaches one, that team wins */}
      <rect x={500 - MAX - 3} y="40" width="6" height="164" rx="3" fill={TEAM_STYLE[0].main} opacity="0.35" />
      <rect x={500 + MAX - 3} y="40" width="6" height="164" rx="3" fill={TEAM_STYLE[1].main} opacity="0.35" />
      <text x={500 - MAX} y="30" textAnchor="middle" fontSize="15" fontWeight="800" fill={TEAM_STYLE[0].main}>
        VẠCH THẮNG
      </text>
      <text x={500 + MAX} y="30" textAnchor="middle" fontSize="15" fontWeight="800" fill={TEAM_STYLE[1].main}>
        VẠCH THẮNG
      </text>
      <rect x="498" y="60" width="4" height="144" fill="#DCE7F3" />
      <g style={{ transform: `translateX(${shift}px)`, transition: 'transform 0.8s cubic-bezier(.34,1.35,.64,1)' }}>
        <path d="M60 138 C 260 144, 740 132, 940 138" stroke="#B7790A" strokeWidth="10" fill="none" strokeLinecap="round" />
        <path d="M60 138 C 260 144, 740 132, 940 138" stroke="#FFD34E" strokeWidth="4" strokeDasharray="12 12" fill="none" />
        {crew(0)}
        {crew(1)}
        <g transform="translate(500 138)">
          <rect x="-3" y="-58" width="6" height="66" rx="2" fill="#071A63" />
          <path d="M3 -58 L42 -46 L3 -34 Z" fill="#FF76B5" />
          <circle cx="0" cy="-60" r="5" fill="#FFD34E" />
        </g>
      </g>
    </svg>
  );
};

export const QuestionCard: React.FC<{
  question: ToolQuestion;
  team: Team;
  name: string;
  reveal: TugReveal | null;
  waitLeft: number;
  paused: boolean;
  disabled: boolean;
  /** Fullscreen layout sized from the window height so everything fits 16:9. */
  fit: boolean;
  /** Two cards side by side (race mode). */
  half: boolean;
  big: boolean;
  onAnswer: (chosen: number[]) => void;
}> = ({ question, team, name, reveal, waitLeft, paused, disabled, fit, half, big, onAnswer }) => {
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [question]);
  const style = TEAM_STYLE[team];
  const locked = disabled || paused || reveal !== null;
  const size = (f: string, b: string, n: string) => (fit ? f : big ? b : n);

  return (
    <div
      className={`relative flex flex-col overflow-hidden rounded-2xl bg-white shadow-[var(--studio-shadow)] ring-2 ${style.ring} ${
        fit ? 'h-full min-h-0 p-[1.8vh]' : 'p-4 sm:p-5'
      } ${reveal?.correct === false ? 'tug-shake' : ''}`}
    >
      <div className="mb-[1.2vh] flex min-h-[4.2vh] flex-wrap items-center gap-2">
        <span className={`inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-3 py-1 font-extrabold text-white ${style.grad} ${size('text-[2.2vh]', 'text-lg', 'text-sm')}`}>
          <Flag className="h-4 w-4" /> {name}
        </span>
        {reveal?.correct === true && (
          <span className={`mimo-pop rounded-full bg-[#E7F7F0] px-3 py-1 font-display font-extrabold text-[#1F9D6B] ${size('text-[2.6vh]', 'text-2xl', 'text-base')}`}>
            Đúng rồi! +1 điểm
          </span>
        )}
        {reveal?.correct === false && (
          <span className={`mimo-pop rounded-full bg-[#FFEDF1] px-3 py-1 font-display font-extrabold text-[#D93B5B] ${size('text-[2.6vh]', 'text-2xl', 'text-base')}`}>
            Chưa đúng – không được điểm{waitLeft > 0 ? ` · ${waitLeft}s` : ''}
          </span>
        )}
        {reveal && reveal.chosen === null && (
          <span className={`rounded-full bg-[#FFF8E1] px-3 py-1 font-bold text-[#B7790A] ${size('text-[2.2vh]', 'text-lg', 'text-sm')}`}>Đáp án đúng</span>
        )}
      </div>
      <RichContentRenderer
        content={question.prompt}
        inheritSize
        className={`font-semibold text-[#071A63] ${size(half ? 'text-[2.8vh] leading-snug' : 'text-[3.6vh] leading-snug', 'text-3xl sm:text-4xl', 'text-lg')}`}
      />
      {question.multi && !reveal && <p className={`mt-1 font-bold text-[#6A4BE6] ${size('text-[2vh]', 'text-lg', 'text-sm')}`}>Chọn tất cả đáp án đúng rồi bấm Chốt</p>}
      <div
        className={`grid gap-[1.2vh] ${fit ? 'mt-[1.6vh] min-h-0 flex-1 auto-rows-fr grid-cols-2' : `mt-4 ${big ? 'sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}`}
      >
        {question.options.map((opt, i) => {
          const on = picked.includes(i);
          const isRight = reveal !== null && question.correct.includes(i);
          const isWrongPick = reveal?.chosen?.includes(i) && !isRight;
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => (question.multi ? setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i])) : onAnswer([i]))}
              aria-pressed={question.multi ? on : undefined}
              data-tug-option={i}
              className={`flex items-center gap-[1.2vh] rounded-xl border-2 px-3 text-left transition active:scale-[0.98] ${
                fit ? `min-h-0 ${half ? 'text-[2.6vh]' : 'text-[3.2vh]'}` : big ? 'min-h-[76px] text-2xl' : 'min-h-[56px] text-base'
              } ${
                isRight
                  ? 'border-[#22C38E] bg-[#EAFBF4] font-bold text-[#0B6B4A]'
                  : isWrongPick
                    ? 'border-[#FF76B5] bg-[#FFF0F7] text-[#9C2C62]'
                    : on
                      ? 'border-[#071A63] bg-[#F6FAFF]'
                      : `border-[#DCE7F3] bg-white ${locked ? '' : 'hover:border-[#54C8FF]'}`
              } ${reveal && !isRight && !isWrongPick ? 'opacity-55' : ''}`}
            >
              <span
                className={`flex shrink-0 items-center justify-center rounded-lg font-extrabold text-white ${isRight ? 'bg-[#22C38E]' : isWrongPick ? 'bg-[#FF76B5]' : OPTION_COLORS[i]} ${
                  fit ? 'h-[5.4vh] w-[5.4vh] text-[2.6vh]' : big ? 'h-12 w-12 text-xl' : 'h-9 w-9 text-base'
                }`}
              >
                {isRight || on ? <Check className="h-[60%] w-[60%]" /> : isWrongPick ? <X className="h-[60%] w-[60%]" /> : LETTERS[i]}
              </span>
              <RichContentRenderer content={opt} inheritSize />
              {isWrongPick && <span className="ml-auto shrink-0 text-[0.6em] font-extrabold">Đội chọn</span>}
            </button>
          );
        })}
      </div>
      {question.multi && !reveal && (
        <button type="button" disabled={locked || picked.length === 0} onClick={() => onAnswer(picked)} className="studio-btn studio-btn-navy mt-3 w-full">
          Chốt đáp án
        </button>
      )}
      {reveal && question.explanation && (
        <div className={`mt-[1.2vh] flex gap-2 overflow-auto rounded-xl bg-[#FFF8E1] px-3 py-2 text-[#071A63] ${size('max-h-[11vh] text-[2.2vh]', 'text-xl', 'text-sm')}`}>
          <b className="shrink-0 text-[#B7790A]">Lời giải:</b>
          <RichContentRenderer content={question.explanation} inheritSize />
        </div>
      )}
      {paused && !reveal && (
        <div className="absolute inset-0 flex items-center justify-center bg-white/80 backdrop-blur-[3px]">
          <span className={`flex items-center gap-2 font-display font-extrabold text-[#071A63] ${size('text-[5vh]', 'text-4xl', 'text-2xl')}`}>
            <Pause className="h-[1em] w-[1em]" /> Tạm dừng
          </span>
        </div>
      )}
    </div>
  );
};

/** A button that asks "are you sure?" inline before running a destructive action. */
export const ConfirmButton: React.FC<{
  label: React.ReactNode;
  question: string;
  confirmLabel: string;
  onConfirm: () => void;
  className: string;
}> = ({ label, question, confirmLabel, onConfirm, className }) => {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" onClick={() => setAsking(true)} className={className}>
        {label}
      </button>
    );
  }
  return (
    <span role="alertdialog" aria-label={question} className="inline-flex flex-wrap items-center gap-2 rounded-2xl bg-[#FFF8E1] px-3 py-1.5 ring-1 ring-[#FFD34E]">
      <span className="text-sm font-bold text-[#7A5200]">{question}</span>
      <button
        type="button"
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
        className="min-h-[36px] rounded-full bg-[#D93B5B] px-4 text-sm font-extrabold text-white"
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setAsking(false)} className="min-h-[36px] rounded-full bg-white px-4 text-sm font-bold text-slate-600 ring-1 ring-slate-300">
        Hủy
      </button>
    </span>
  );
};

const CONFETTI_COLORS = ['#1267E9', '#54C8FF', '#FFD34E', '#FF76B5', '#22C38E', '#7B5CFF'];
export const Confetti: React.FC = () => (
  <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
    {Array.from({ length: 48 }, (_, i) => (
      <span
        key={i}
        className="tug-confetti"
        style={{
          left: `${(i * 37) % 100}%`,
          background: CONFETTI_COLORS[i % CONFETTI_COLORS.length],
          animationDuration: `${2.6 + ((i * 13) % 20) / 10}s`,
          animationDelay: `${((i * 7) % 25) / 10}s`,
        }}
      />
    ))}
  </div>
);

type Phase = 'setup' | 'play' | 'result';

/** "Kéo co kiến thức": two teams on one teacher-controlled screen. */
export const TugOfWarTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [settings, setSettings] = useState<TugSettings>(DEFAULT_TUG_SETTINGS);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]);
  const [game, setGame] = useState<TugState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(true);
  const [lastEvent, setLastEvent] = useState<{ team: Team; correct: boolean; at: number } | null>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const fsRef = useRef<HTMLDivElement>(null);
  /** Where the presentation is mounted: the page, or the stage if "Trình chiếu" of the frame is already fullscreen. */
  const hostRef = useRef<Element | null>(null);
  const present = useCallback(() => {
    hostRef.current = document.fullscreenElement ?? document.body;
    setFullscreen(true);
  }, []);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const fit = fullscreen && phase !== 'setup';
  const big = presenting || fit;

  const onQuestions = useCallback((q: ToolQuestion[]) => setQuestions(q), []);
  const usable = new Set(questions.map((q) => q.id)).size;

  // ---- fullscreen presentation (only this game's screen, no sidebar or setup)
  useEffect(() => {
    if (!fit) return;
    const el = fsRef.current;
    if (el && document.fullscreenElement !== el) el.requestFullscreen?.().catch(() => undefined);
    let entered = false;
    const onChange = () => {
      if (document.fullscreenElement === fsRef.current) entered = true;
      else if (entered) setFullscreen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setFullscreen(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    window.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('fullscreenchange', onChange);
      window.removeEventListener('keydown', onKey);
    };
  }, [fit]);

  const exitFullscreen = useCallback(() => {
    if (document.fullscreenElement && document.fullscreenElement === fsRef.current) void document.exitFullscreen().catch(() => undefined);
    setFullscreen(false);
  }, []);

  // ---- clock
  useEffect(() => {
    if (phase !== 'play') return;
    const id = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(id);
  }, [phase]);

  useEffect(() => {
    if (phase !== 'play' || !game) return;
    const next = tickTug(game, now);
    if (next !== game) setGame(next);
  }, [now, game, phase]);

  useEffect(() => {
    if (phase === 'play' && game?.finished) {
      if (soundRef.current) playFanfare();
      const id = window.setTimeout(() => setPhase('result'), 1800);
      return () => window.clearTimeout(id);
    }
  }, [game?.finished, phase, game]);

  // Race mode: a side moves on by itself once its answer has been shown long enough
  useEffect(() => {
    if (!game || game.finished || game.pausedAt !== null || settings.mode !== 'race') return;
    const timers = ([0, 1] as Team[])
      .filter((t) => game.reveal[t] && game.current[t] !== null)
      .map((t) => {
        const idx = game.current[t];
        return window.setTimeout(() => setGame((g) => (g ? nextTug(g, settingsRef.current, t, idx) : g)), Math.max(0, game.lockedUntil[t] - Date.now()));
      });
    return () => timers.forEach((id) => window.clearTimeout(id));
  }, [game, settings.mode]);

  const begin = (fullscreenNow = false) => {
    const t = Date.now();
    setGame(startTug(questions, { ...settings, questionCount: Math.min(settings.questionCount, usable) }, t));
    setNow(t);
    setLastEvent(null);
    setPhase('play');
    // Already presenting ("Chơi lại"): stay on the same screen
    if (fullscreenNow && !fullscreen) present();
  };

  const toSetup = () => {
    exitFullscreen();
    setGame(null);
    setPhase('setup');
  };

  const answer = (team: Team, chosen: number[]) => {
    if (!game) return;
    const t = Date.now();
    const { state, correct } = answerTug(game, settings, team, chosen, t);
    if (correct === null) return;
    setGame(state);
    if (soundRef.current) (correct ? playCorrect : playWrong)();
    setLastEvent({ team, correct, at: t });
  };

  const set = <K extends keyof TugSettings>(k: K, v: TugSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const winText = (s: TugSettings) =>
    s.winRule === 'first' ? `Đạt ${s.target} điểm trước là thắng` : s.winRule === 'lead' ? `Dẫn trước ${s.target} điểm là thắng` : 'Nhiều điểm hơn khi hết giờ';

  // ---------------------------------------------------------------- setup
  if (phase === 'setup') {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="mb-3 font-display text-base font-extrabold text-[#172B4D]">1. Chọn câu hỏi</h2>
          <QuestionPicker onChange={onQuestions} groupByTopic initialSource="practice" />
        </section>
        <section className="space-y-4">
          <h2 className="font-display text-base font-extrabold text-[#172B4D]">2. Thiết lập trận đấu</h2>
          <div className="grid grid-cols-2 gap-2">
            {([0, 1] as Team[]).map((t) => (
              <label key={t} className="block">
                <span className={`text-xs font-bold ${TEAM_STYLE[t].text}`}>Tên đội {t + 1}</span>
                <input
                  value={settings.teamNames[t]}
                  maxLength={24}
                  onChange={(e) => {
                    const names = [...settings.teamNames] as [string, string];
                    names[t] = e.target.value;
                    set('teamNames', names);
                  }}
                  className={`mt-1 w-full rounded-xl border-2 px-3 py-2 text-sm font-bold ${t === 0 ? 'border-[#BFD6EE]' : 'border-[#FFC9D1]'}`}
                />
              </label>
            ))}
          </div>

          <label className="block">
            <span className="text-xs font-bold text-[#5E6C84]">
              Số câu tối đa trong trận: {Math.min(settings.questionCount, usable || settings.questionCount)} (lấy ngẫu nhiên, không lặp)
            </span>
            <input
              type="range"
              min={2}
              max={Math.max(2, Math.min(60, usable || 40))}
              value={Math.min(settings.questionCount, Math.max(2, usable || 40))}
              onChange={(e) => set('questionCount', Number(e.target.value))}
              className="mt-1 w-full accent-[#1267E9]"
            />
          </label>

          <div>
            <span className="text-xs font-bold text-[#5E6C84]">Thời gian thi đấu</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DURATIONS.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => set('durationSec', m * 60)}
                  aria-pressed={settings.durationSec === m * 60}
                  className={`min-h-[36px] rounded-full px-3 text-sm font-bold ${settings.durationSec === m * 60 ? 'bg-[#1267E9] text-white' : 'bg-[#EAF5FF] text-[#1267E9]'}`}
                >
                  {m} phút
                </button>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className="text-xs font-bold text-[#5E6C84]">Điều kiện thắng</legend>
            {(
              [
                ['first', `Đội nào đạt ${settings.target} điểm trước thì thắng`],
                ['lead', `Dẫn trước ${settings.target} điểm là thắng ngay`],
                ['time', 'Hết thời gian: đội nhiều điểm hơn thắng'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="mt-1 flex items-start gap-2 text-sm text-[#172B4D]">
                <input type="radio" name="winRule" checked={settings.winRule === v} onChange={() => set('winRule', v)} className="mt-1 accent-[#1267E9]" />
                {label}
              </label>
            ))}
            {settings.winRule !== 'time' && (
              <div className="mt-2 flex items-center gap-1.5">
                <span className="text-xs font-bold text-[#5E6C84]">Số điểm:</span>
                {TARGETS.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set('target', n)}
                    aria-pressed={settings.target === n}
                    className={`min-h-[32px] min-w-[40px] rounded-full px-3 text-sm font-bold ${settings.target === n ? 'bg-[#071A63] text-white' : 'bg-white text-[#5E6C84] ring-1 ring-[#DCE7F3]'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            )}
            <p className="mt-1 text-xs text-[#5E6C84]">Hết giờ hoặc hết câu hỏi: đội nhiều điểm hơn thắng, bằng điểm là hòa.</p>
          </fieldset>

          <fieldset>
            <legend className="text-xs font-bold text-[#5E6C84]">Cách thi</legend>
            {(
              [
                ['turns', 'Hai đội lần lượt trả lời (giáo viên hiện đáp án, chuyển câu)'],
                ['race', 'Cùng thi trên một màn hình (mỗi đội một nửa)'],
              ] as const
            ).map(([v, label]) => (
              <label key={v} className="mt-1 flex items-start gap-2 text-sm text-[#172B4D]">
                <input type="radio" name="mode" checked={settings.mode === v} onChange={() => set('mode', v)} className="mt-1 accent-[#1267E9]" />
                {label}
              </label>
            ))}
          </fieldset>

          {settings.mode === 'race' && (
            <label className="flex items-center gap-2 text-sm text-[#172B4D]">
              <input type="checkbox" checked={settings.lockSeconds > 0} onChange={(e) => set('lockSeconds', e.target.checked ? 3 : 0)} className="h-4 w-4 accent-[#1267E9]" />
              Trả lời sai phải chờ 3 giây (xem đáp án đúng)
            </label>
          )}
          <label className="flex items-center gap-2 text-sm text-[#172B4D]">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
            Âm thanh đúng / sai
          </label>

          <div className="space-y-2">
            <button type="button" disabled={usable < 2} onClick={() => begin(true)} className="studio-btn studio-btn-accent min-h-[52px] w-full text-base">
              <Maximize2 className="h-5 w-5" /> Bắt đầu & trình chiếu toàn màn hình
            </button>
            <button type="button" disabled={usable < 2} onClick={() => begin(false)} className="studio-btn studio-btn-secondary min-h-[44px] w-full">
              <Play className="h-4 w-4" /> Bắt đầu trên trang này
            </button>
          </div>
          {usable < 2 && <p className="text-xs font-semibold text-[#B7790A]">Cần chọn ít nhất 2 câu hỏi.</p>}
        </section>
      </div>
    );
  }

  if (!game) return null;
  const btn = fit ? 'min-h-[5.4vh] px-[1.6vh] text-[2vh]' : big ? 'min-h-[52px] text-lg' : '';
  const soundButton = (
    <button type="button" onClick={() => setSound((s) => !s)} aria-pressed={sound} className={`studio-btn studio-btn-secondary ${btn}`}>
      {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {sound ? 'Có âm thanh' : 'Đã tắt âm'}
    </button>
  );
  const fullscreenButton = fit ? (
    <button type="button" onClick={exitFullscreen} className={`studio-btn studio-btn-secondary ${btn}`}>
      <Minimize2 className="h-4 w-4" /> Thoát trình chiếu
    </button>
  ) : (
    <button type="button" onClick={present} className={`studio-btn studio-btn-primary ${btn}`}>
      <Maximize2 className="h-4 w-4" /> Trình chiếu toàn màn hình
    </button>
  );

  let content: React.ReactNode;
  // ---------------------------------------------------------------- result
  if (phase === 'result') {
    const w = game.winner;
    const reason = {
      target: `đạt ${settings.target} điểm`,
      lead: `dẫn trước ${settings.target} điểm`,
      time: 'hết thời gian',
      questions: 'hết câu hỏi',
      stopped: 'giáo viên kết thúc',
    }[game.endReason ?? 'stopped'];
    content = (
      <div className={`relative mx-auto flex max-w-4xl flex-col items-center text-center ${fit ? 'h-full justify-center gap-[2.4vh]' : 'gap-6'}`}>
        {w !== 'draw' && <Confetti />}
        <div className="flex flex-col items-center gap-2">
          <MimoMascot size={fit ? 130 : big ? 150 : 110} eager />
          <Trophy className={`mimo-pop text-[#FFB800] ${fit ? 'h-[7vh] w-[7vh]' : big ? 'h-16 w-16' : 'h-12 w-12'}`} />
          <h2 className={`mimo-pop font-display font-extrabold ${w === 'draw' ? 'text-[#071A63]' : TEAM_STYLE[w as Team].text} ${fit ? 'text-[7vh]' : big ? 'text-6xl' : 'text-4xl'}`}>
            {w === 'draw' ? 'Hòa nhau!' : `${settings.teamNames[w as Team]} chiến thắng!`}
          </h2>
          <p className={`text-[#5E6C84] ${fit ? 'text-[2.4vh]' : big ? 'text-xl' : ''}`}>Trận đấu kết thúc vì {reason}.</p>
        </div>
        <div className="grid w-full grid-cols-2 gap-4">
          {([0, 1] as Team[]).map((t) => (
            <div key={t} className={`rounded-2xl p-5 ring-2 ${TEAM_STYLE[t].soft} ${TEAM_STYLE[t].ring} ${w === t ? 'shadow-[0_0_0_6px_rgba(255,211,78,0.6)]' : ''}`}>
              <div className={`font-display font-extrabold ${TEAM_STYLE[t].text} ${fit ? 'text-[3.4vh]' : big ? 'text-3xl' : 'text-xl'}`}>
                {w === t && '🏆 '}
                {settings.teamNames[t]}
              </div>
              <div className={`font-display font-extrabold text-[#071A63] ${fit ? 'text-[10vh] leading-none' : big ? 'text-8xl' : 'text-6xl'}`}>{game.scores[t]}</div>
              <div className={`text-[#5E6C84] ${fit ? 'text-[2.2vh]' : big ? 'text-lg' : 'text-sm'}`}>
                Đúng {game.scores[t]}/{game.answered[t]} câu{game.answered[t] ? ` · ${Math.round((game.scores[t] / game.answered[t]) * 100)}%` : ''}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ConfirmButton
            label={
              <>
                <RotateCcw className="h-5 w-5" /> Chơi lại
              </>
            }
            question="Chơi lại với bộ câu hỏi này? Kết quả trên sẽ được xóa."
            confirmLabel="Chơi lại"
            onConfirm={() => begin(fullscreen)}
            className={`studio-btn studio-btn-accent ${btn || 'min-h-[48px] px-6'}`}
          />
          <ConfirmButton
            label={
              <>
                <Settings2 className="h-5 w-5" /> Đổi câu hỏi / thiết lập
              </>
            }
            question="Về màn hình thiết lập? Kết quả trên sẽ được xóa."
            confirmLabel="Đồng ý"
            onConfirm={toSetup}
            className={`studio-btn studio-btn-secondary ${btn || 'min-h-[48px]'}`}
          />
          {fullscreenButton}
        </div>
      </div>
    );
  } else {
    // ---------------------------------------------------------------- play
    const limit = ropeLimit(settings);
    const left = timeLeft(game, now);
    const paused = game.pausedAt !== null;
    const waitLeft = (t: Team) => Math.max(0, Math.ceil((game.lockedUntil[t] - now) / 1000));
    const sides: Team[] = settings.mode === 'race' ? [0, 1] : [game.turn];
    const turnReveal = game.reveal[game.turn];
    const eventShown = lastEvent && now - lastEvent.at < 3000 ? lastEvent : null;

    content = (
      <div className={fit ? 'flex h-full min-h-0 flex-col gap-[1.4vh]' : 'space-y-4'}>
        {/* scores + clock */}
        <div className="grid shrink-0 grid-cols-[1fr_auto_1fr] items-center gap-3">
          {([0, 1] as Team[]).map((t) => (
            <div
              key={t}
              className={`flex items-center gap-3 rounded-2xl ${TEAM_STYLE[t].soft} ${t === 1 ? 'order-3 flex-row-reverse text-right' : ''} ${
                fit ? 'px-[2vh] py-[0.8vh]' : 'px-4 py-3'
              } ${settings.mode === 'turns' && game.turn === t && !game.finished ? `ring-4 ${TEAM_STYLE[t].ring}` : ''}`}
            >
              <div className={`font-display font-extrabold leading-none text-[#071A63] ${fit ? 'text-[7vh]' : big ? 'text-7xl' : 'text-5xl'}`}>{game.scores[t]}</div>
              <div className="min-w-0">
                <div className={`truncate font-display font-extrabold ${TEAM_STYLE[t].text} ${fit ? 'text-[2.8vh]' : big ? 'text-2xl' : 'text-base'}`}>{settings.teamNames[t]}</div>
                {settings.winRule === 'first' && (
                  <div className={`font-bold text-[#5E6C84] ${fit ? 'text-[1.8vh]' : 'text-xs'}`}>
                    {game.scores[t]}/{settings.target} điểm
                  </div>
                )}
              </div>
            </div>
          ))}
          <div className="order-2 text-center">
            <div
              className={`font-display font-extrabold [font-variant-numeric:tabular-nums] ${paused ? 'text-[#B7790A]' : left <= 10 ? 'text-[#D93B5B]' : 'text-[#071A63]'} ${
                fit ? 'text-[6.4vh] leading-none' : big ? 'text-6xl' : 'text-4xl'
              }`}
            >
              {formatClock(left)}
            </div>
            <div className={`font-bold text-[#5E6C84] ${fit ? 'text-[1.8vh]' : 'text-xs'}`}>{paused ? 'Đang tạm dừng' : winText(settings)}</div>
          </div>
        </div>

        {/* rope */}
        <div className={fit ? 'h-[22vh] shrink-0' : 'mx-auto w-full max-w-5xl'}>
          <Rope offset={ropeOffset(game, settings)} limit={limit} event={lastEvent} winner={game.finished ? game.winner : null} names={settings.teamNames} />
        </div>

        {/* what just happened / whose turn — fixed height so nothing jumps */}
        <div className={`flex shrink-0 flex-wrap items-center justify-center gap-3 ${fit ? 'min-h-[4.6vh]' : 'min-h-[40px]'}`}>
          {game.finished ? (
            <span className={`mimo-pop font-display font-extrabold text-[#071A63] ${fit ? 'text-[3.4vh]' : 'text-2xl'}`}>
              {game.winner === 'draw' ? 'Hòa nhau!' : `${settings.teamNames[game.winner as Team]} thắng!`}
            </span>
          ) : (
            <>
              {settings.mode === 'turns' && (
                <span className={`font-display font-extrabold ${TEAM_STYLE[game.turn].text} ${fit ? 'text-[3vh]' : big ? 'text-3xl' : 'text-lg'}`}>
                  Lượt của {settings.teamNames[game.turn]}
                </span>
              )}
              {eventShown && (
                <span
                  key={eventShown.at}
                  className={`mimo-pop rounded-full px-4 py-1 font-bold ${eventShown.correct ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-[#FFEDF1] text-[#D93B5B]'} ${fit ? 'text-[2.2vh]' : big ? 'text-xl' : 'text-sm'}`}
                >
                  {settings.teamNames[eventShown.team]} {eventShown.correct ? 'kéo được 1 bước!' : 'trả lời chưa đúng.'}
                </span>
              )}
            </>
          )}
        </div>

        {/* questions */}
        <div className={`grid gap-[1.6vh] ${fit ? 'min-h-0 flex-1' : ''} ${sides.length === 2 ? (fit ? 'grid-cols-2' : 'md:grid-cols-2') : fit ? 'mx-auto w-full max-w-[150vh]' : 'mx-auto max-w-4xl'}`}>
          {sides.map((t) => {
            const idx = game.current[t];
            if (idx === null) {
              return (
                <div key={t} className="flex items-center justify-center rounded-2xl bg-[#F6FAFF] p-6 text-center text-[#5E6C84]">
                  {settings.teamNames[t]} đã làm hết câu hỏi
                </div>
              );
            }
            return (
              <QuestionCard
                key={`${t}-${idx}`}
                question={game.deck[idx]}
                team={t}
                name={settings.teamNames[t]}
                reveal={game.reveal[t]}
                waitLeft={waitLeft(t)}
                paused={paused}
                disabled={game.finished || isLocked(game, t, now)}
                fit={fit}
                half={sides.length === 2}
                big={big}
                onAnswer={(chosen) => answer(t, chosen)}
              />
            );
          })}
        </div>

        {/* teacher controls */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
          {!game.finished && (
            <>
              <button
                type="button"
                onClick={() => setGame((g) => (g ? (g.pausedAt === null ? pauseTug(g, Date.now()) : resumeTug(g, Date.now())) : g))}
                className={`studio-btn ${paused ? 'studio-btn-accent' : 'studio-btn-secondary'} ${btn}`}
              >
                {paused ? <Play className="h-4 w-4" /> : <Pause className="h-4 w-4" />} {paused ? 'Tiếp tục' : 'Tạm dừng'}
              </button>
              {settings.mode === 'turns' && (
                <>
                  <button
                    type="button"
                    disabled={turnReveal !== null || paused}
                    onClick={() => setGame((g) => (g ? revealTug(g, g.turn) : g))}
                    className={`studio-btn studio-btn-secondary ${btn}`}
                  >
                    <Eye className="h-4 w-4" /> Hiện đáp án & lời giải
                  </button>
                  <button
                    type="button"
                    disabled={paused}
                    onClick={() => setGame((g) => (g ? nextTug(g, settings, g.turn) : g))}
                    className={`studio-btn ${turnReveal ? 'studio-btn-primary' : 'studio-btn-secondary'} ${btn}`}
                  >
                    <SkipForward className="h-4 w-4" /> {turnReveal ? 'Câu tiếp theo' : 'Bỏ qua câu này'}
                  </button>
                </>
              )}
            </>
          )}
          {soundButton}
          <span className={`text-[#5E6C84] ${fit ? 'text-[1.8vh]' : 'text-sm'}`}>
            Câu {game.next}/{game.deck.length}
          </span>
          {!game.finished && (
            <ConfirmButton
              label={
                <>
                  <RotateCcw className="h-4 w-4" /> Chơi lại
                </>
              }
              question="Chơi lại từ đầu? Kết quả trận này sẽ mất."
              confirmLabel="Chơi lại"
              onConfirm={() => begin(fullscreen)}
              className={`studio-btn studio-btn-secondary ${btn}`}
            />
          )}
          {!game.finished && (
            <ConfirmButton
              label={
                <>
                  <Square className="h-4 w-4" /> Kết thúc trận
                </>
              }
              question="Kết thúc trận ngay và xem kết quả?"
              confirmLabel="Kết thúc"
              onConfirm={() => setGame((g) => (g ? stopTug(g) : g))}
              className={`studio-btn studio-btn-danger ${btn}`}
            />
          )}
          {fullscreenButton}
        </div>
      </div>
    );
  }

  const styleTag = <style>{TUG_CSS}</style>;
  if (fit) {
    return createPortal(
      <div
        ref={fsRef}
        className="fixed inset-0 z-[95] overflow-hidden bg-gradient-to-br from-[#F6FAFF] via-white to-[#EAF5FF] px-[2.5vw] py-[2vh]"
        role="dialog"
        aria-label="Kéo co kiến thức – trình chiếu"
      >
        {styleTag}
        {content}
      </div>,
      hostRef.current ?? document.body
    );
  }
  return (
    <div ref={fsRef}>
      {styleTag}
      {content}
    </div>
  );
};
