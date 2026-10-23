import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Check,
  Eye,
  Flag,
  Lightbulb,
  ListOrdered,
  Lock,
  Maximize2,
  MessageCircleQuestion,
  Minimize2,
  Pause,
  Play,
  Plus,
  RotateCcw,
  Settings2,
  SkipForward,
  Square,
  Trash2,
  Trophy,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { MimoMascot } from '../practice/student/practiceTheme';
import { QuestionPicker } from './QuestionPicker';
import { playCorrect, playFanfare, playWhistle, playWrong } from './toolSound';
import type { ToolQuestion } from './toolQuestions';
import { formatClock, shuffleList } from './toolUtils';
import {
  answerTug,
  DEFAULT_TUG_SETTINGS,
  isLocked,
  nextTug,
  pauseTug,
  resumeTug,
  revealTug,
  startTug,
  stopTug,
  Team,
  tickTug,
  timeLeft,
  TugSettings,
  TugState,
} from './tugOfWar';
import { ConfirmButton, Confetti, QuestionCard, TEAM_STYLE, TUG_CSS } from './TugOfWarTool';
import {
  buildPuzzles,
  checkRound,
  customPuzzleCars,
  customPuzzleProblem,
  CustomTrainPuzzle,
  DEFAULT_ORDER_SETTINGS,
  fromCustomPuzzle,
  hintRound,
  MAX_CARS,
  MIN_CARS,
  nextOrderRound,
  OrderGame,
  OrderGameSettings,
  orderTurn,
  placeCar,
  removeCar,
  revealRound,
  roundFilled,
  roundPoints,
  startOrderGame,
  TRAIN_TEMPLATES,
  TrainRange,
  TrainRound,
  updateOrderRound,
} from './knowledgeTrain';

const CAR_COLORS = ['#1267E9', '#FF76B5', '#F5A800', '#7B5CFF', '#13B5C9', '#22C38E', '#FF8A3D', '#E5484D'];
const CUSTOM_KEY = 'mimoedu.tools.trainPuzzles';
const ROUND_CHOICES = [3, 5, 8, 10];
const RANGES: TrainRange[] = [1000, 10000, 100000];
const DURATIONS = [3, 5, 8, 10];
const TARGETS = [5, 7, 10];

const TRAIN_CSS = `
.train-depart { animation: train-depart 2.6s cubic-bezier(.55,0,.85,.35) 0.5s forwards; }
@keyframes train-depart { to { transform: translateX(-130vw); } }
.train-smoke { animation: train-smoke 1.6s ease-out infinite; transform-box: fill-box; transform-origin: 50% 100%; }
@keyframes train-smoke { 0% { opacity: .9; transform: translateY(0) scale(.8); } 100% { opacity: 0; transform: translateY(-14px) scale(1.4); } }
.train-wrong { animation: tug-shake 0.45s ease-in-out; }
@media (prefers-reduced-motion: reduce) { .train-depart, .train-smoke, .train-wrong { animation: none; } }
`;

type Size = 'sm' | 'lg' | 'fit';

/** Locomotive facing left: the train reads left to right, front first. */
const Locomotive: React.FC<{ color?: string; className?: string }> = ({ color = '#1267E9', className = '' }) => (
  <svg viewBox="0 0 124 100" className={`shrink-0 ${className}`} aria-hidden="true">
    <g className="train-smoke">
      <circle cx="30" cy="10" r="7" fill="#DCE7F3" />
      <circle cx="40" cy="5" r="4.5" fill="#EAF1F8" />
    </g>
    <rect x="24" y="18" width="13" height="22" rx="3" fill="#071A63" />
    <rect x="8" y="38" width="68" height="40" rx="12" fill={color} />
    <rect x="70" y="20" width="46" height="58" rx="8" fill={color} />
    <rect x="66" y="14" width="54" height="10" rx="5" fill="#FFD34E" />
    <rect x="80" y="30" width="26" height="20" rx="5" fill="#EAF6FF" />
    <circle cx="93" cy="41" r="6" fill="#FFFFFF" />
    <circle cx="91" cy="40" r="2" fill="#071A63" />
    <circle cx="16" cy="54" r="6" fill="#FFD34E" stroke="#071A63" strokeWidth="2" />
    <path d="M8 70 L0 86 L22 86 Z" fill="#FF76B5" />
    <rect x="116" y="64" width="8" height="6" rx="2" fill="#071A63" />
    {[30, 62, 96].map((x) => (
      <g key={x}>
        <circle cx={x} cy="86" r="11" fill="#071A63" />
        <circle cx={x} cy="86" r="4.5" fill="#DCE7F3" />
      </g>
    ))}
  </svg>
);

const SIZE = {
  sm: { car: 'h-16 min-w-[92px] px-3 text-lg', loco: 'h-[76px] w-[94px]', slot: 'h-16 min-w-[92px] text-base' },
  lg: { car: 'h-24 min-w-[150px] px-4 text-4xl', loco: 'h-[112px] w-[140px]', slot: 'h-24 min-w-[150px] text-2xl' },
  fit: { car: 'h-[11vh] min-w-[17vh] px-[1.4vh] text-[4vh]', loco: 'h-[13vh] w-[16vh]', slot: 'h-[11vh] min-w-[17vh] text-[2.6vh]' },
} as const;

/** One wagon. Wheels are drawn below so cars line up on the rail. */
const CarView: React.FC<{
  text: string;
  color: string;
  size: Size;
  mark?: boolean | null;
  locked?: boolean;
  faded?: boolean;
  ghost?: boolean;
}> = ({ text, color, size, mark = null, locked = false, faded = false, ghost = false }) => (
  <span
    className={`relative flex items-center justify-center rounded-t-[1.1em] rounded-b-[0.4em] font-display font-extrabold whitespace-nowrap text-white shadow-[0_6px_0_0_rgba(7,26,99,0.25)] ${SIZE[size].car} ${
      mark === true ? 'ring-4 ring-[#22C38E]' : mark === false ? 'train-wrong ring-4 ring-[#FF4F9A]' : ''
    } ${faded ? 'opacity-30' : ''} ${ghost ? 'scale-110 rotate-[-3deg] shadow-2xl' : ''}`}
    style={{ background: color }}
  >
    <span className="drop-shadow-[0_1px_0_rgba(7,26,99,0.35)]">{text}</span>
    {(['left-[16%]', 'right-[16%]'] as const).map((pos) => (
      <span key={pos} className={`absolute -bottom-[0.45em] ${pos} h-[0.8em] w-[0.8em] rounded-full border-[0.18em] border-[#071A63] bg-[#DCE7F3]`} />
    ))}
    {mark !== null && (
      <span className={`absolute -top-[0.5em] -right-[0.5em] flex h-[1.1em] w-[1.1em] items-center justify-center rounded-full text-white ${mark ? 'bg-[#22C38E]' : 'bg-[#FF4F9A]'}`}>
        {mark ? <Check className="h-[70%] w-[70%]" /> : <X className="h-[70%] w-[70%]" />}
      </span>
    )}
    {locked && (
      <span className="absolute -top-[0.5em] -left-[0.5em] flex h-[1.1em] w-[1.1em] items-center justify-center rounded-full bg-[#FFD34E] text-[#071A63]">
        <Lock className="h-[60%] w-[60%]" />
      </span>
    )}
  </span>
);

const Coupler: React.FC<{ size: Size }> = ({ size }) => (
  <span aria-hidden="true" className={`mb-[1.6em] h-[0.3em] w-[0.6em] shrink-0 self-end rounded-full bg-[#071A63] ${size === 'fit' ? 'text-[3vh]' : size === 'lg' ? 'text-2xl' : 'text-base'}`} />
);

const Rail: React.FC = () => (
  <div
    aria-hidden="true"
    className="mt-1 h-3 rounded-full"
    style={{ background: 'repeating-linear-gradient(90deg, #B7790A 0 10px, transparent 10px 22px), linear-gradient(#DCE7F3, #DCE7F3)', backgroundSize: '100% 40%, 100% 30%', backgroundPosition: 'bottom, top', backgroundRepeat: 'no-repeat' }}
  />
);

/** Fullscreen presentation of a game screen only (no sidebar, no setup), as in Kéo co. */
function usePresentation(active: boolean) {
  const [fullscreen, setFullscreen] = useState(false);
  const fsRef = useRef<HTMLDivElement>(null);
  const hostRef = useRef<Element | null>(null);
  const fit = fullscreen && active;

  const present = useCallback(() => {
    hostRef.current = document.fullscreenElement ?? document.body;
    setFullscreen(true);
  }, []);

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

  const exit = useCallback(() => {
    if (document.fullscreenElement && document.fullscreenElement === fsRef.current) void document.exitFullscreen().catch(() => undefined);
    setFullscreen(false);
  }, []);

  const wrap = (content: React.ReactNode) => {
    const styles = (
      <style>
        {TUG_CSS}
        {TRAIN_CSS}
      </style>
    );
    if (fit) {
      return createPortal(
        <div
          ref={fsRef}
          className="fixed inset-0 z-[95] overflow-hidden bg-gradient-to-br from-[#F6FAFF] via-white to-[#FFF8E1] px-[2.5vw] py-[2vh]"
          role="dialog"
          aria-label="Đoàn tàu kiến thức – trình chiếu"
        >
          {styles}
          {content}
        </div>,
        hostRef.current ?? document.body
      );
    }
    return (
      <div ref={fsRef}>
        {styles}
        {content}
      </div>
    );
  };

  return { fit, fullscreen, present, exit, wrap };
}

/** Toolbar buttons shared by both modes. */
function useToolbar(fit: boolean, big: boolean, sound: boolean, setSound: (fn: (s: boolean) => boolean) => void, present: () => void, exit: () => void) {
  const btn = fit ? 'min-h-[5.4vh] px-[1.6vh] text-[2vh]' : big ? 'min-h-[52px] text-lg' : '';
  const soundButton = (
    <button type="button" onClick={() => setSound((s) => !s)} aria-pressed={sound} className={`studio-btn studio-btn-secondary ${btn}`}>
      {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {sound ? 'Có âm thanh' : 'Đã tắt âm'}
    </button>
  );
  const fullscreenButton = fit ? (
    <button type="button" onClick={exit} className={`studio-btn studio-btn-secondary ${btn}`}>
      <Minimize2 className="h-4 w-4" /> Thoát trình chiếu
    </button>
  ) : (
    <button type="button" onClick={present} className={`studio-btn studio-btn-primary ${btn}`}>
      <Maximize2 className="h-4 w-4" /> Trình chiếu toàn màn hình
    </button>
  );
  return { btn, soundButton, fullscreenButton };
}

// =================================================================== Xếp toa

function loadCustom(): CustomTrainPuzzle[] {
  try {
    const raw = localStorage.getItem(CUSTOM_KEY);
    return raw ? (JSON.parse(raw) as CustomTrainPuzzle[]) : [];
  } catch {
    return [];
  }
}

const newCustom = (): CustomTrainPuzzle => ({ id: `${Date.now()}${Math.random().toString(36).slice(2, 6)}`, title: '', text: '' });

interface DragState {
  car: number;
  /** Position the car was taken from, or null for the station. */
  from: number | null;
  pointerId: number;
  startX: number;
  startY: number;
  x: number;
  y: number;
  moved: boolean;
}

/**
 * The train being built. Tap a car at the station to hook it on, tap a car on
 * the train to send it back; drag (mouse or finger) to put a car exactly where
 * you want or to swap two cars.
 */
const OrderBoard: React.FC<{
  round: TrainRound;
  size: Size;
  onChange: (update: (r: TrainRound) => TrainRound) => void;
}> = ({ round, size, onChange }) => {
  const [drag, setDrag] = useState<DragState | null>(null);
  const done = round.solved || round.revealed;
  // Colours are shuffled per puzzle so they never give the order away
  const colors = useMemo(() => shuffleList(CAR_COLORS), [round.puzzle.id]);
  const colorOf = (car: number) => colors[car % colors.length];

  const down = (e: React.PointerEvent, car: number, from: number | null) => {
    if (done || (from !== null && round.locked[from]) || e.button > 0) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    setDrag({ car, from, pointerId: e.pointerId, startX: e.clientX, startY: e.clientY, x: e.clientX, y: e.clientY, moved: false });
  };
  const move = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const moved = drag.moved || Math.hypot(e.clientX - drag.startX, e.clientY - drag.startY) > 8;
    setDrag({ ...drag, x: e.clientX, y: e.clientY, moved });
  };
  const up = (e: React.PointerEvent) => {
    if (!drag || e.pointerId !== drag.pointerId) return;
    const d = drag;
    setDrag(null);
    if (!d.moved) {
      onChange((r) => (d.from === null ? placeCar(r, d.car) : removeCar(r, d.from)));
      return;
    }
    const target = document.elementFromPoint(e.clientX, e.clientY);
    const slot = target?.closest('[data-train-slot]');
    if (slot) onChange((r) => placeCar(r, d.car, Number(slot.getAttribute('data-train-slot'))));
    else if (d.from !== null && target?.closest('[data-train-yard]')) onChange((r) => removeCar(r, d.from!));
  };
  // Keyboard (Enter / Space) has no pointer events: a click with detail 0
  const keyClick = (e: React.MouseEvent, action: () => void) => {
    if (e.detail === 0) action();
  };
  const carHandlers = (car: number, from: number | null) => ({
    onPointerDown: (e: React.PointerEvent) => down(e, car, from),
    onPointerMove: move,
    onPointerUp: up,
    onPointerCancel: () => setDrag(null),
    onClick: (e: React.MouseEvent) =>
      keyClick(e, () => onChange((r) => (from === null ? placeCar(r, car) : removeCar(r, from)))),
  });
  const gap = size === 'fit' ? 'gap-x-[0.6vh]' : 'gap-x-1.5';
  const textSize = size === 'fit' ? 'text-[2.2vh]' : size === 'lg' ? 'text-xl' : 'text-sm';

  return (
    <div className={size === 'fit' ? 'space-y-[2.4vh]' : 'space-y-5'}>
      {/* the train */}
      <div className="overflow-x-auto overflow-y-hidden pt-3 pb-2">
        <div className={`flex w-max items-end ${gap} pr-4 ${round.solved ? 'train-depart' : ''}`}>
          <Locomotive className={SIZE[size].loco} />
          {round.slots.map((car, pos) => (
            <React.Fragment key={pos}>
              <Coupler size={size} />
              <span data-train-slot={pos} className="relative">
                {car === null ? (
                  <span
                    className={`flex items-center justify-center rounded-[0.8em] border-[3px] border-dashed border-[#9FB6D3] bg-white/70 font-display font-extrabold text-[#9FB6D3] ${SIZE[size].slot}`}
                  >
                    Toa {pos + 1}
                  </span>
                ) : (
                  <button
                    type="button"
                    aria-label={`Toa ${pos + 1}: ${round.puzzle.cars[car]}${round.locked[pos] ? ' (đã khóa)' : ''}`}
                    disabled={done || round.locked[pos]}
                    className="touch-none select-none disabled:cursor-default"
                    {...carHandlers(car, pos)}
                  >
                    <CarView
                      text={round.puzzle.cars[car]}
                      color={colorOf(car)}
                      size={size}
                      mark={round.marks[pos]}
                      locked={round.locked[pos]}
                      faded={drag?.moved === true && drag.car === car}
                    />
                  </button>
                )}
              </span>
            </React.Fragment>
          ))}
        </div>
        <Rail />
      </div>

      {/* the station */}
      {!done && (
        <div data-train-yard className={`rounded-3xl bg-[#FFF8E1] ring-2 ring-[#FFE39A] ${size === 'fit' ? 'p-[2vh]' : 'p-4'}`}>
          <div className={`mb-2 font-display font-extrabold text-[#B7790A] ${textSize}`}>
            Sân ga · {round.yard.length > 0 ? `${round.yard.length} toa đang chờ` : 'đã nối hết toa'}
          </div>
          <div className={`flex min-h-[1em] flex-wrap ${size === 'fit' ? 'gap-[2vh]' : 'gap-3'} pb-2`}>
            {round.yard.map((car) => (
              <button
                key={car}
                type="button"
                aria-label={`Nối toa ${round.puzzle.cars[car]}`}
                className="touch-none select-none"
                {...carHandlers(car, null)}
              >
                <CarView text={round.puzzle.cars[car]} color={colorOf(car)} size={size} faded={drag?.moved === true && drag.car === car} />
              </button>
            ))}
          </div>
        </div>
      )}

      {drag?.moved && (
        <span className="pointer-events-none fixed z-[200] -translate-x-1/2 -translate-y-1/2" style={{ left: drag.x, top: drag.y }}>
          <CarView text={round.puzzle.cars[drag.car]} color={colorOf(drag.car)} size={size} ghost />
        </span>
      )}
    </div>
  );
};

type Phase = 'setup' | 'play' | 'result';

const OrderMode: React.FC<{ presenting: boolean; tabs: React.ReactNode }> = ({ presenting, tabs }) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [settings, setSettings] = useState<OrderGameSettings>(DEFAULT_ORDER_SETTINGS);
  const [custom, setCustom] = useState<CustomTrainPuzzle[]>(loadCustom);
  const [useCustom, setUseCustom] = useState<string[]>(() => loadCustom().map((c) => c.id));
  const [game, setGame] = useState<OrderGame | null>(null);
  const [sound, setSound] = useState(true);
  const { fit, fullscreen, present, exit, wrap } = usePresentation(phase !== 'setup');
  const big = presenting || fit;
  const size: Size = fit ? 'fit' : big ? 'lg' : 'sm';
  const { btn, soundButton, fullscreenButton } = useToolbar(fit, big, sound, setSound, present, exit);

  useEffect(() => {
    try {
      localStorage.setItem(CUSTOM_KEY, JSON.stringify(custom));
    } catch {
      // Storage unavailable: the puzzles still work for this visit
    }
  }, [custom]);

  const customReady = custom.filter((c) => useCustom.includes(c.id)).map(fromCustomPuzzle).filter((p) => p !== null);
  const plannedRounds = settings.templates.length > 0 ? settings.rounds : Math.min(settings.rounds, customReady.length);
  const set = <K extends keyof OrderGameSettings>(k: K, v: OrderGameSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  const begin = (fullscreenNow: boolean) => {
    const puzzles = buildPuzzles(settings, customReady);
    if (puzzles.length === 0) return;
    setGame(startOrderGame(puzzles));
    setPhase('play');
    if (fullscreenNow && !fullscreen) present();
  };
  const toSetup = () => {
    exit();
    setGame(null);
    setPhase('setup');
  };

  useEffect(() => {
    if (phase === 'play' && game?.finished) {
      if (sound) playFanfare();
      setPhase('result');
    }
  }, [game?.finished, phase, sound]);

  // ---------------------------------------------------------------- setup
  if (phase === 'setup') {
    const updateCustom = (id: string, patch: Partial<CustomTrainPuzzle>) =>
      setCustom((list) => list.map((c) => (c.id === id ? { ...c, ...patch } : c)));
    return (
      <div className="space-y-5">
        {tabs}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section className="space-y-4">
            <h2 className="font-display text-base font-extrabold text-[#172B4D]">1. Chọn đề xếp toa</h2>
            <div>
              <p className="mb-2 text-xs font-bold text-[#5E6C84]">Mẫu Toán 3 (mỗi vòng tạo đề mới, không lặp)</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {TRAIN_TEMPLATES.map((t) => {
                  const on = settings.templates.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-2 transition ${on ? 'bg-[#EAF5FF] ring-[#1267E9]' : 'bg-white ring-[#DCE7F3] hover:ring-[#54C8FF]'}`}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        onChange={() => set('templates', on ? settings.templates.filter((x) => x !== t.id) : [...settings.templates, t.id])}
                        className="mt-1 h-4 w-4 accent-[#1267E9]"
                      />
                      <span>
                        <span className="block text-sm font-extrabold text-[#172B4D]">{t.name}</span>
                        <span className="block text-xs text-[#5E6C84]">{t.example}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>

            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className="text-xs font-bold text-[#5E6C84]">Đề giáo viên tự nhập (lưu trên máy này) · mỗi đề dùng một lần</p>
                <button
                  type="button"
                  onClick={() => {
                    const c = newCustom();
                    setCustom((list) => [...list, c]);
                    setUseCustom((ids) => [...ids, c.id]);
                  }}
                  className="studio-btn studio-btn-secondary min-h-[36px] px-3 text-sm"
                >
                  <Plus className="h-4 w-4" /> Thêm đề
                </button>
              </div>
              {custom.length === 0 && (
                <p className="rounded-2xl bg-[#F6FAFF] p-4 text-sm text-[#5E6C84]">
                  Ví dụ: yêu cầu “Xếp các bước giải bài toán”, rồi gõ mỗi dòng một toa theo đúng thứ tự ({MIN_CARS}–{MAX_CARS} toa). Trò chơi sẽ tự xáo trộn.
                </p>
              )}
              <div className="space-y-3">
                {custom.map((c, i) => {
                  const problem = customPuzzleProblem(c);
                  const on = useCustom.includes(c.id);
                  return (
                    <div key={c.id} className="rounded-2xl bg-white p-3 ring-2 ring-[#DCE7F3]">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-extrabold text-[#5E6C84]">Đề {i + 1}</span>
                        <label className="ml-auto flex items-center gap-1.5 text-xs font-bold text-[#172B4D]">
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() => setUseCustom((ids) => (on ? ids.filter((x) => x !== c.id) : [...ids, c.id]))}
                            className="h-4 w-4 accent-[#1267E9]"
                          />
                          Dùng trong trò chơi
                        </label>
                        <button
                          type="button"
                          onClick={() => setCustom((list) => list.filter((x) => x.id !== c.id))}
                          aria-label={`Xóa đề ${i + 1}`}
                          className="rounded-lg p-1.5 text-[#D93B5B] hover:bg-[#FFEEF0]"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                      <input
                        value={c.title}
                        maxLength={80}
                        onChange={(e) => updateCustom(c.id, { title: e.target.value })}
                        placeholder="Yêu cầu, ví dụ: Xếp các số từ bé đến lớn"
                        className="mt-2 w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2 text-sm font-bold"
                      />
                      <textarea
                        value={c.text}
                        rows={4}
                        onChange={(e) => updateCustom(c.id, { text: e.target.value })}
                        placeholder={'Mỗi dòng một toa, theo đúng thứ tự\n125\n152\n215'}
                        className="mt-2 w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2 font-mono text-sm"
                      />
                      <p className={`mt-1 text-xs font-semibold ${problem ? 'text-[#B7790A]' : 'text-[#1F9D6B]'}`}>
                        {problem ?? `${customPuzzleCars(c.text).length} toa · sẵn sàng`}
                      </p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h2 className="font-display text-base font-extrabold text-[#172B4D]">2. Thiết lập</h2>
            <div>
              <span className="text-xs font-bold text-[#5E6C84]">Số vòng</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {ROUND_CHOICES.map((n) => (
                  <button
                    key={n}
                    type="button"
                    onClick={() => set('rounds', n)}
                    aria-pressed={settings.rounds === n}
                    className={`min-h-[36px] min-w-[44px] rounded-full px-3 text-sm font-bold ${settings.rounds === n ? 'bg-[#1267E9] text-white' : 'bg-[#EAF5FF] text-[#1267E9]'}`}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <label className="block">
              <span className="text-xs font-bold text-[#5E6C84]">Số toa mỗi đoàn tàu (mẫu): {settings.cars}</span>
              <input type="range" min={MIN_CARS} max={MAX_CARS} value={settings.cars} onChange={(e) => set('cars', Number(e.target.value))} className="mt-1 w-full accent-[#1267E9]" />
            </label>
            <div>
              <span className="text-xs font-bold text-[#5E6C84]">Phạm vi số (mẫu xếp số)</span>
              <div className="mt-1 flex flex-wrap gap-1.5">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    type="button"
                    onClick={() => set('range', r)}
                    aria-pressed={settings.range === r}
                    className={`min-h-[36px] rounded-full px-3 text-sm font-bold ${settings.range === r ? 'bg-[#071A63] text-white' : 'bg-white text-[#5E6C84] ring-1 ring-[#DCE7F3]'}`}
                  >
                    Đến {r.toLocaleString('vi-VN')}
                  </button>
                ))}
              </div>
            </div>
            <fieldset>
              <legend className="text-xs font-bold text-[#5E6C84]">Cách chơi</legend>
              {(
                [
                  [1, 'Cả lớp cùng xếp'],
                  [2, 'Hai đội luân phiên mỗi vòng'],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="mt-1 flex items-center gap-2 text-sm text-[#172B4D]">
                  <input type="radio" name="trainTeams" checked={settings.teams === v} onChange={() => set('teams', v)} className="accent-[#1267E9]" />
                  {label}
                </label>
              ))}
            </fieldset>
            {settings.teams === 2 && (
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
            )}
            <p className="rounded-xl bg-[#F6FAFF] p-3 text-xs text-[#5E6C84]">
              Xếp đúng ngay lần kiểm tra đầu: 3 điểm · mỗi lần kiểm tra lại hoặc gợi ý: bớt 1 điểm (ít nhất 1) · hiện đáp án: 0 điểm.
            </p>
            <label className="flex items-center gap-2 text-sm text-[#172B4D]">
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
              Âm thanh (còi tàu, đúng / sai)
            </label>
            <div className="space-y-2">
              <button type="button" disabled={plannedRounds < 1} onClick={() => begin(true)} className="studio-btn studio-btn-accent min-h-[52px] w-full text-base">
                <Maximize2 className="h-5 w-5" /> Bắt đầu & trình chiếu toàn màn hình
              </button>
              <button type="button" disabled={plannedRounds < 1} onClick={() => begin(false)} className="studio-btn studio-btn-secondary min-h-[44px] w-full">
                <Play className="h-4 w-4" /> Bắt đầu trên trang này
              </button>
            </div>
            <p className={`text-xs font-semibold ${plannedRounds < 1 ? 'text-[#B7790A]' : 'text-[#5E6C84]'}`}>
              {plannedRounds < 1 ? 'Hãy chọn ít nhất một mẫu hoặc một đề tự nhập hợp lệ.' : `Sẽ chơi ${plannedRounds} vòng.`}
            </p>
          </section>
        </div>
      </div>
    );
  }

  if (!game) return null;
  const teamName = (t: 0 | 1) => (settings.teams === 2 ? settings.teamNames[t] : 'Cả lớp');
  let content: React.ReactNode;

  // ---------------------------------------------------------------- result
  if (phase === 'result') {
    const solved = game.results.filter((r) => r.solved).length;
    const w = settings.teams === 2 ? (game.scores[0] === game.scores[1] ? 'draw' : game.scores[0] > game.scores[1] ? 0 : 1) : null;
    content = (
      <div className={`relative mx-auto flex max-w-4xl flex-col items-center text-center ${fit ? 'h-full justify-center gap-[2.4vh]' : 'gap-6'}`}>
        {solved > 0 && <Confetti />}
        <MimoMascot size={fit ? 120 : big ? 140 : 100} eager />
        <Trophy className={`mimo-pop text-[#FFB800] ${fit ? 'h-[7vh] w-[7vh]' : big ? 'h-16 w-16' : 'h-12 w-12'}`} />
        <h2 className={`mimo-pop font-display font-extrabold ${w === null || w === 'draw' ? 'text-[#071A63]' : TEAM_STYLE[w].text} ${fit ? 'text-[6.4vh]' : big ? 'text-6xl' : 'text-4xl'}`}>
          {w === null ? `Xếp đúng ${solved}/${game.results.length} đoàn tàu!` : w === 'draw' ? 'Hòa nhau!' : `${settings.teamNames[w]} chiến thắng!`}
        </h2>
        {settings.teams === 2 ? (
          <div className="grid w-full grid-cols-2 gap-4">
            {([0, 1] as Team[]).map((t) => (
              <div key={t} className={`rounded-2xl p-5 ring-2 ${TEAM_STYLE[t].soft} ${TEAM_STYLE[t].ring}`}>
                <div className={`font-display font-extrabold ${TEAM_STYLE[t].text} ${fit ? 'text-[3.4vh]' : 'text-2xl'}`}>{settings.teamNames[t]}</div>
                <div className={`font-display font-extrabold text-[#071A63] ${fit ? 'text-[9vh] leading-none' : 'text-7xl'}`}>{game.scores[t]}</div>
                <div className="text-sm text-[#5E6C84]">điểm</div>
              </div>
            ))}
          </div>
        ) : (
          <p className={`font-display font-extrabold text-[#1267E9] ${fit ? 'text-[4vh]' : 'text-2xl'}`}>Cả lớp được {game.scores[0]} điểm</p>
        )}
        <div className="flex flex-wrap justify-center gap-2">
          {game.results.map((r, i) => (
            <span key={i} className={`rounded-full px-3 py-1 text-sm font-extrabold ${r.solved ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-[#FFEDF1] text-[#D93B5B]'}`}>
              Vòng {i + 1}: {r.solved ? `+${r.points}` : 'chưa xếp được'}
            </span>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-center gap-3">
          <ConfirmButton
            label={
              <>
                <RotateCcw className="h-5 w-5" /> Chơi lại
              </>
            }
            question="Chơi lại với đề mới? Kết quả trên sẽ được xóa."
            confirmLabel="Chơi lại"
            onConfirm={() => begin(fullscreen)}
            className={`studio-btn studio-btn-accent ${btn || 'min-h-[48px] px-6'}`}
          />
          <ConfirmButton
            label={
              <>
                <Settings2 className="h-5 w-5" /> Đổi đề / thiết lập
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
    const round = game.round;
    const team = orderTurn(game, settings);
    const done = round.solved || round.revealed;
    const last = game.index + 1 >= game.puzzles.length;
    const update = (fn: (r: TrainRound) => TrainRound) => setGame((g) => (g ? updateOrderRound(g, fn) : g));
    const check = () => {
      const next = checkRound(round);
      if (next === round) return;
      update(() => next);
      if (!sound) return;
      if (next.solved) {
        playCorrect();
        window.setTimeout(playWhistle, 400);
      } else playWrong();
    };
    const wrongCount = round.marks.filter((m) => m === false).length;

    content = (
      <div className={fit ? 'flex h-full min-h-0 flex-col gap-[1.6vh]' : 'space-y-4'}>
        {/* round, team, score */}
        <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
          <span className={`rounded-full bg-[#071A63] px-4 py-1 font-display font-extrabold text-white ${fit ? 'text-[2.4vh]' : big ? 'text-xl' : 'text-sm'}`}>
            Vòng {game.index + 1}/{game.puzzles.length}
          </span>
          <div className="flex flex-wrap items-center gap-2">
            {(settings.teams === 2 ? ([0, 1] as Team[]) : ([0] as Team[])).map((t) => (
              <span
                key={t}
                className={`inline-flex items-center gap-2 rounded-2xl px-3 py-1 font-display font-extrabold ${TEAM_STYLE[t].soft} ${TEAM_STYLE[t].text} ${
                  settings.teams === 2 && team === t ? `ring-4 ${TEAM_STYLE[t].ring}` : ''
                } ${fit ? 'text-[2.6vh]' : big ? 'text-2xl' : 'text-base'}`}
              >
                {teamName(t)} <span className="text-[#071A63]">{game.scores[t]} điểm</span>
              </span>
            ))}
          </div>
        </div>

        <div className="shrink-0 text-center">
          {settings.teams === 2 && !done && (
            <p className={`font-display font-extrabold ${TEAM_STYLE[team].text} ${fit ? 'text-[2.6vh]' : big ? 'text-2xl' : 'text-base'}`}>Lượt của {teamName(team)}</p>
          )}
          <h2 className={`font-display font-extrabold text-[#071A63] ${fit ? 'text-[4.4vh]' : big ? 'text-4xl' : 'text-2xl'}`}>{round.puzzle.title}</h2>
          <p className={`text-[#5E6C84] ${fit ? 'text-[2vh]' : big ? 'text-lg' : 'text-sm'}`}>
            Chạm toa ở sân ga để nối vào tàu · chạm toa trên tàu để trả về · kéo thả để đổi chỗ
          </p>
        </div>

        <div className={fit ? 'min-h-0 flex-1' : ''}>
          <OrderBoard round={round} size={size} onChange={update} />
        </div>

        {/* what happened — fixed height so the controls don't jump */}
        <div className={`flex shrink-0 items-center justify-center text-center ${fit ? 'min-h-[5vh]' : 'min-h-[44px]'}`}>
          {round.solved ? (
            <span className={`mimo-pop rounded-full bg-[#E7F7F0] px-5 py-1.5 font-display font-extrabold text-[#1F9D6B] ${fit ? 'text-[3.2vh]' : big ? 'text-3xl' : 'text-lg'}`}>
              Tàu xuất phát! Xếp đúng rồi · +{roundPoints(round)} điểm cho {teamName(team)}
            </span>
          ) : round.revealed ? (
            <span className={`rounded-full bg-[#FFF8E1] px-5 py-1.5 font-bold text-[#B7790A] ${fit ? 'text-[2.6vh]' : big ? 'text-2xl' : 'text-base'}`}>Đây là thứ tự đúng</span>
          ) : wrongCount > 0 ? (
            <span key={round.checks} className={`mimo-pop rounded-full bg-[#FFEDF1] px-5 py-1.5 font-bold text-[#D93B5B] ${fit ? 'text-[2.6vh]' : big ? 'text-2xl' : 'text-base'}`}>
              Còn {wrongCount} toa chưa đúng chỗ – đổi lại rồi kiểm tra nhé!
            </span>
          ) : null}
        </div>

        {/* controls */}
        <div className="flex shrink-0 flex-wrap items-center justify-center gap-2">
          {!done ? (
            <>
              <button type="button" disabled={!roundFilled(round)} onClick={check} className={`studio-btn studio-btn-accent ${btn || 'min-h-[48px] px-6'}`}>
                <Check className="h-5 w-5" /> Kiểm tra
              </button>
              <button type="button" onClick={() => update(hintRound)} className={`studio-btn studio-btn-secondary ${btn}`}>
                <Lightbulb className="h-4 w-4" /> Gợi ý 1 toa
              </button>
              <button type="button" onClick={() => update(revealRound)} className={`studio-btn studio-btn-secondary ${btn}`}>
                <Eye className="h-4 w-4" /> Hiện đáp án
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setGame((g) => (g ? nextOrderRound(g, settings) : g))} className={`studio-btn studio-btn-primary ${btn || 'min-h-[48px] px-6'}`}>
              <SkipForward className="h-5 w-5" /> {last ? 'Xem kết quả' : 'Vòng tiếp theo'}
            </button>
          )}
          {!done && !last && (
            <ConfirmButton
              label={
                <>
                  <SkipForward className="h-4 w-4" /> Bỏ qua vòng
                </>
              }
              question="Bỏ qua vòng này (0 điểm)?"
              confirmLabel="Bỏ qua"
              onConfirm={() => setGame((g) => (g ? nextOrderRound(g, settings) : g))}
              className={`studio-btn studio-btn-secondary ${btn}`}
            />
          )}
          {soundButton}
          <ConfirmButton
            label={
              <>
                <Square className="h-4 w-4" /> Kết thúc
              </>
            }
            question="Kết thúc trò chơi và về màn hình thiết lập?"
            confirmLabel="Kết thúc"
            onConfirm={toSetup}
            className={`studio-btn studio-btn-danger ${btn}`}
          />
          {fullscreenButton}
        </div>
      </div>
    );
  }

  return wrap(content);
};

// =================================================================== Nối toa (trả lời câu hỏi)

const DEFAULT_RACE_SETTINGS: TugSettings = {
  ...DEFAULT_TUG_SETTINGS,
  teamNames: ['Tàu Xanh', 'Tàu Đỏ'],
  winRule: 'first',
  target: 5,
};

/** One team's track: the locomotive pulls one car per correct answer towards the station. */
const RaceLane: React.FC<{
  team: Team;
  name: string;
  cars: number;
  /** Cars needed to reach the station, or null when the game is played on time. */
  target: number | null;
  active: boolean;
  fresh: boolean;
  fit: boolean;
  big: boolean;
}> = ({ team, name, cars, target, active, fresh, fit, big }) => {
  const style = TEAM_STYLE[team];
  const slots = target ?? Math.max(8, cars);
  return (
    <div className={`rounded-2xl ${style.soft} ${fit ? 'px-[1.6vh] py-[1vh]' : 'px-3 py-2'} ${active ? `ring-4 ${style.ring}` : ''}`}>
      <div className={`mb-1 flex items-center justify-between font-display font-extrabold ${style.text} ${fit ? 'text-[2.4vh]' : big ? 'text-xl' : 'text-sm'}`}>
        <span>{name}</span>
        <span className="text-[#071A63]">
          {cars}
          {target ? `/${target}` : ''} toa
        </span>
      </div>
      <div className="flex items-end gap-1">
        <Locomotive color={style.main} className={fit ? 'h-[7vh] w-[8.6vh]' : big ? 'h-16 w-20' : 'h-11 w-14'} />
        {Array.from({ length: slots }, (_, i) => (
          <span
            key={i}
            className={`min-w-0 flex-1 rounded-t-lg rounded-b-sm ${fit ? 'h-[5vh]' : big ? 'h-11' : 'h-8'} ${
              i < cars ? `${fresh && i === cars - 1 ? 'mimo-pop' : ''}` : 'border-2 border-dashed border-[#BFD6EE] bg-white/60'
            }`}
            style={i < cars ? { background: CAR_COLORS[(i + team * 3) % CAR_COLORS.length] } : undefined}
          />
        ))}
        {target && (
          <span className={`flex shrink-0 flex-col items-center font-extrabold text-[#071A63] ${fit ? 'text-[1.6vh]' : 'text-[10px]'}`}>
            <Flag className={`${fit ? 'h-[4vh] w-[4vh]' : 'h-7 w-7'} text-[#FF76B5]`} />
            Ga đích
          </span>
        )}
      </div>
      <Rail />
    </div>
  );
};

const RaceMode: React.FC<{ presenting: boolean; tabs: React.ReactNode }> = ({ presenting, tabs }) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [settings, setSettings] = useState<TugSettings>(DEFAULT_RACE_SETTINGS);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]);
  const [game, setGame] = useState<TugState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(true);
  const [lastEvent, setLastEvent] = useState<{ team: Team; correct: boolean; at: number } | null>(null);
  const { fit, fullscreen, present, exit, wrap } = usePresentation(phase !== 'setup');
  const big = presenting || fit;
  const { btn, soundButton, fullscreenButton } = useToolbar(fit, big, sound, setSound, present, exit);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const settingsRef = useRef(settings);
  settingsRef.current = settings;

  const onQuestions = useCallback((q: ToolQuestion[]) => setQuestions(q), []);
  const usable = new Set(questions.map((q) => q.id)).size;
  const set = <K extends keyof TugSettings>(k: K, v: TugSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

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
      if (soundRef.current) playWhistle();
      const id = window.setTimeout(() => {
        if (soundRef.current) playFanfare();
        setPhase('result');
      }, 1800);
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

  const begin = (fullscreenNow: boolean) => {
    const t = Date.now();
    setGame(startTug(questions, { ...settings, questionCount: Math.min(settings.questionCount, usable) }, t));
    setNow(t);
    setLastEvent(null);
    setPhase('play');
    if (fullscreenNow && !fullscreen) present();
  };
  const toSetup = () => {
    exit();
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

  // ---------------------------------------------------------------- setup
  if (phase === 'setup') {
    return (
      <div className="space-y-5">
        {tabs}
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
          <section>
            <h2 className="mb-3 font-display text-base font-extrabold text-[#172B4D]">1. Chọn câu hỏi</h2>
            <QuestionPicker onChange={onQuestions} groupByTopic initialSource="practice" />
          </section>
          <section className="space-y-4">
            <h2 className="font-display text-base font-extrabold text-[#172B4D]">2. Thiết lập cuộc đua</h2>
            <div className="grid grid-cols-2 gap-2">
              {([0, 1] as Team[]).map((t) => (
                <label key={t} className="block">
                  <span className={`text-xs font-bold ${TEAM_STYLE[t].text}`}>Tên đoàn tàu {t + 1}</span>
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
                Số câu tối đa: {Math.min(settings.questionCount, usable || settings.questionCount)} (lấy ngẫu nhiên, không lặp)
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
              <span className="text-xs font-bold text-[#5E6C84]">Thời gian</span>
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
                  ['first', `Đoàn tàu nối đủ ${settings.target} toa trước về ga đích`],
                  ['time', 'Hết giờ: đoàn tàu dài hơn thắng'],
                ] as const
              ).map(([v, label]) => (
                <label key={v} className="mt-1 flex items-start gap-2 text-sm text-[#172B4D]">
                  <input type="radio" name="trainWin" checked={settings.winRule === v} onChange={() => set('winRule', v)} className="mt-1 accent-[#1267E9]" />
                  {label}
                </label>
              ))}
              {settings.winRule === 'first' && (
                <div className="mt-2 flex items-center gap-1.5">
                  <span className="text-xs font-bold text-[#5E6C84]">Số toa:</span>
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
                  <input type="radio" name="trainMode" checked={settings.mode === v} onChange={() => set('mode', v)} className="mt-1 accent-[#1267E9]" />
                  {label}
                </label>
              ))}
            </fieldset>
            <label className="flex items-center gap-2 text-sm text-[#172B4D]">
              <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
              Âm thanh (còi tàu, đúng / sai)
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
      </div>
    );
  }

  if (!game) return null;
  const target = settings.winRule === 'first' ? settings.target : null;
  let content: React.ReactNode;

  // ---------------------------------------------------------------- result
  if (phase === 'result') {
    const w = game.winner;
    content = (
      <div className={`relative mx-auto flex max-w-4xl flex-col items-center text-center ${fit ? 'h-full justify-center gap-[2.4vh]' : 'gap-6'}`}>
        {w !== 'draw' && <Confetti />}
        <MimoMascot size={fit ? 120 : big ? 140 : 100} eager />
        <Trophy className={`mimo-pop text-[#FFB800] ${fit ? 'h-[7vh] w-[7vh]' : big ? 'h-16 w-16' : 'h-12 w-12'}`} />
        <h2 className={`mimo-pop font-display font-extrabold ${w === 'draw' ? 'text-[#071A63]' : TEAM_STYLE[w as Team].text} ${fit ? 'text-[6.4vh]' : big ? 'text-6xl' : 'text-4xl'}`}>
          {w === 'draw' ? 'Hai đoàn tàu dài bằng nhau!' : `${settings.teamNames[w as Team]} về đích!`}
        </h2>
        <div className="w-full space-y-3">
          {([0, 1] as Team[]).map((t) => (
            <RaceLane key={t} team={t} name={settings.teamNames[t]} cars={game.scores[t]} target={target} active={w === t} fresh={false} fit={fit} big={big} />
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
    const left = timeLeft(game, now);
    const paused = game.pausedAt !== null;
    const waitLeft = (t: Team) => Math.max(0, Math.ceil((game.lockedUntil[t] - now) / 1000));
    const sides: Team[] = settings.mode === 'race' ? [0, 1] : [game.turn];
    const turnReveal = game.reveal[game.turn];
    const eventShown = lastEvent && now - lastEvent.at < 3000 ? lastEvent : null;

    content = (
      <div className={fit ? 'flex h-full min-h-0 flex-col gap-[1.2vh]' : 'space-y-4'}>
        <div className="flex shrink-0 items-center justify-center gap-4">
          <div
            className={`font-display font-extrabold [font-variant-numeric:tabular-nums] ${paused ? 'text-[#B7790A]' : left <= 10 ? 'text-[#D93B5B]' : 'text-[#071A63]'} ${
              fit ? 'text-[5.4vh] leading-none' : big ? 'text-5xl' : 'text-3xl'
            }`}
          >
            {formatClock(left)}
          </div>
          <span className={`font-bold text-[#5E6C84] ${fit ? 'text-[2vh]' : 'text-sm'}`}>
            {paused ? 'Đang tạm dừng' : target ? `Nối đủ ${target} toa để về ga đích` : 'Hết giờ: đoàn tàu dài hơn thắng'}
          </span>
        </div>

        <div className={`grid shrink-0 gap-[1vh] ${fit ? '' : 'gap-2'}`}>
          {([0, 1] as Team[]).map((t) => (
            <RaceLane
              key={t}
              team={t}
              name={settings.teamNames[t]}
              cars={game.scores[t]}
              target={target}
              active={settings.mode === 'turns' && game.turn === t && !game.finished}
              fresh={eventShown?.team === t && eventShown.correct}
              fit={fit}
              big={big}
            />
          ))}
        </div>

        <div className={`flex shrink-0 flex-wrap items-center justify-center gap-3 ${fit ? 'min-h-[4.4vh]' : 'min-h-[36px]'}`}>
          {game.finished ? (
            <span className={`mimo-pop font-display font-extrabold text-[#071A63] ${fit ? 'text-[3.2vh]' : 'text-2xl'}`}>
              {game.winner === 'draw' ? 'Hòa nhau!' : `${settings.teamNames[game.winner as Team]} về đích!`}
            </span>
          ) : (
            <>
              {settings.mode === 'turns' && (
                <span className={`font-display font-extrabold ${TEAM_STYLE[game.turn].text} ${fit ? 'text-[2.8vh]' : big ? 'text-2xl' : 'text-lg'}`}>
                  Lượt của {settings.teamNames[game.turn]}
                </span>
              )}
              {eventShown && (
                <span
                  key={eventShown.at}
                  className={`mimo-pop rounded-full px-4 py-1 font-bold ${eventShown.correct ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-[#FFEDF1] text-[#D93B5B]'} ${fit ? 'text-[2.1vh]' : big ? 'text-xl' : 'text-sm'}`}
                >
                  {settings.teamNames[eventShown.team]} {eventShown.correct ? 'nối thêm 1 toa!' : 'trả lời chưa đúng.'}
                </span>
              )}
            </>
          )}
        </div>

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
                  <Square className="h-4 w-4" /> Kết thúc
                </>
              }
              question="Kết thúc cuộc đua ngay và xem kết quả?"
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

  return wrap(content);
};

// =================================================================== tool

type Mode = 'order' | 'race';

/** "Đoàn tàu kiến thức": arrange the cars in order, or answer questions to add cars. */
export const KnowledgeTrainTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [mode, setMode] = useState<Mode>('order');
  const tabs = (
    <div role="tablist" aria-label="Chế độ chơi" className="grid gap-2 sm:grid-cols-2">
      {(
        [
          ['order', ListOrdered, 'Xếp toa đúng thứ tự', 'Kéo thả các toa thành đoàn tàu: số, phép tính, tháng, thứ hoặc đề tự nhập'],
          ['race', MessageCircleQuestion, 'Trả lời để nối toa', 'Hai đoàn tàu thi trả lời câu hỏi, mỗi câu đúng nối thêm một toa'],
        ] as const
      ).map(([id, Icon, title, desc]) => (
        <button
          key={id}
          type="button"
          role="tab"
          aria-selected={mode === id}
          onClick={() => setMode(id)}
          className={`flex items-start gap-3 rounded-2xl p-4 text-left ring-2 transition ${mode === id ? 'bg-[#071A63] text-white ring-[#071A63]' : 'bg-white text-[#172B4D] ring-[#DCE7F3] hover:ring-[#54C8FF]'}`}
        >
          <Icon className={`mt-0.5 h-6 w-6 shrink-0 ${mode === id ? 'text-[#FFD34E]' : 'text-[#1267E9]'}`} />
          <span>
            <span className="block font-display text-base font-extrabold">{title}</span>
            <span className={`block text-xs ${mode === id ? 'text-white/80' : 'text-[#5E6C84]'}`}>{desc}</span>
          </span>
        </button>
      ))}
    </div>
  );
  return mode === 'order' ? <OrderMode presenting={presenting} tabs={tabs} /> : <RaceMode presenting={presenting} tabs={tabs} />;
};
