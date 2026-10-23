import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Flag, Lock, Play, RotateCcw, Settings2, Square, Trophy, Volume2, VolumeX } from 'lucide-react';
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
  ropeOffset,
  startTug,
  stopTug,
  Team,
  tickTug,
  TugSettings,
  TugState,
} from './tugOfWar';

const TEAM_STYLE = [
  { main: '#1267E9', soft: 'bg-[#EAF5FF]', text: 'text-[#1267E9]', ring: 'ring-[#1267E9]', grad: 'from-[#1267E9] to-[#54C8FF]' },
  { main: '#E5484D', soft: 'bg-[#FFEEF0]', text: 'text-[#D93B5B]', ring: 'ring-[#E5484D]', grad: 'from-[#E5484D] to-[#FF76B5]' },
] as const;
const OPTION_COLORS = ['bg-[#1267E9]', 'bg-[#FF76B5]', 'bg-[#FFB800]', 'bg-[#7B5CFF]', 'bg-[#13B5C9]', 'bg-[#22C38E]'];
const LETTERS = 'ABCDEF';
const DURATIONS = [2, 3, 5, 8, 10];

/** Two crews of little MimoEDU robots pulling a rope; the flag moves one step per point. */
const Rope: React.FC<{ offset: number; limit: number; pulse: Team | null; names: [string, string] }> = ({ offset, limit, pulse, names }) => {
  const shift = (-offset / limit) * 230; // positive offset = flag towards the left team
  const crew = (team: Team) =>
    [0, 1, 2].map((i) => {
      const x = team === 0 ? 70 + i * 52 : 730 - i * 52;
      const c = TEAM_STYLE[team].main;
      return (
        <g key={i} transform={`translate(${x} 0)`}>
          <ellipse cx="0" cy="176" rx="18" ry="4" fill="#071A63" opacity="0.12" />
          <rect x="-13" y="118" width="26" height="42" rx="10" fill={c} />
          <rect x="-11" y="158" width="9" height="16" rx="4" fill={c} />
          <rect x="2" y="158" width="9" height="16" rx="4" fill={c} />
          <circle cx="0" cy="102" r="17" fill="#FFFFFF" stroke={c} strokeWidth="4" />
          <circle cx={team === 0 ? 5 : -5} cy="100" r="3" fill="#071A63" />
          <path d={team === 0 ? 'M-2 109 q6 4 11 0' : 'M2 109 q-6 4 -11 0'} stroke="#071A63" strokeWidth="2" fill="none" strokeLinecap="round" />
          <circle cx="0" cy="84" r="3.5" fill="#FFD34E" />
        </g>
      );
    });
  return (
    <svg viewBox="0 0 800 190" className="h-auto w-full" role="img" aria-label={`${names[0]} ${offset > 0 ? 'đang dẫn' : offset < 0 ? 'đang bị dẫn' : 'đang hòa'}`}>
      <rect x="398" y="40" width="4" height="150" fill="#DCE7F3" />
      <text x="400" y="30" textAnchor="middle" fontSize="13" fontWeight="700" fill="#5E6C84">VẠCH GIỮA</text>
      <g style={{ transform: `translateX(${shift}px)`, transition: 'transform 0.55s cubic-bezier(.34,1.56,.64,1)' }}>
        <g className={pulse !== null ? 'mimo-pop' : ''} key={`${offset}-${pulse}`}>
          <path d="M40 132 C 220 138, 580 126, 760 132" stroke="#B7790A" strokeWidth="9" fill="none" strokeLinecap="round" />
          <path d="M40 132 C 220 138, 580 126, 760 132" stroke="#FFD34E" strokeWidth="4" strokeDasharray="10 10" fill="none" />
          {crew(0)}
          {crew(1)}
          <g transform="translate(400 132)">
            <rect x="-3" y="-46" width="5" height="54" fill="#071A63" />
            <path d="M2 -46 L34 -36 L2 -26 Z" fill="#FF76B5" />
          </g>
        </g>
      </g>
    </svg>
  );
};

const QuestionCard: React.FC<{
  question: ToolQuestion;
  team: Team;
  name: string;
  locked: boolean;
  lockLeft: number;
  big: boolean;
  feedback: 'correct' | 'wrong' | null;
  onAnswer: (chosen: number[]) => void;
}> = ({ question, team, name, locked, lockLeft, big, feedback, onAnswer }) => {
  const [picked, setPicked] = useState<number[]>([]);
  useEffect(() => setPicked([]), [question]);
  const style = TEAM_STYLE[team];
  return (
    <div className={`relative overflow-hidden rounded-2xl bg-white p-4 shadow-[var(--studio-shadow)] ring-2 sm:p-5 ${style.ring}`}>
      <div className={`mb-3 inline-flex items-center gap-1.5 rounded-full bg-gradient-to-r px-3 py-1 font-extrabold text-white ${style.grad} ${big ? 'text-lg' : 'text-sm'}`}>
        <Flag className="h-4 w-4" /> {name}
      </div>
      <RichContentRenderer content={question.prompt} inheritSize className={big ? 'text-3xl font-semibold text-[#071A63] sm:text-4xl' : 'text-lg font-semibold text-[#071A63]'} />
      {question.multi && <p className="mt-1 text-sm font-bold text-[#6A4BE6]">Chọn tất cả đáp án đúng rồi bấm Chốt</p>}
      <div className={`mt-4 grid gap-2.5 ${big ? 'sm:grid-cols-2' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {question.options.map((opt, i) => {
          const on = picked.includes(i);
          return (
            <button
              key={i}
              type="button"
              disabled={locked}
              onClick={() => (question.multi ? setPicked((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i])) : onAnswer([i]))}
              aria-pressed={question.multi ? on : undefined}
              className={`flex items-center gap-3 rounded-xl border-2 bg-white px-3 text-left transition active:scale-[0.98] disabled:opacity-60 ${
                big ? 'min-h-[76px] text-2xl' : 'min-h-[56px] text-base'
              } ${on ? 'border-[#071A63] bg-[#F6FAFF]' : 'border-[#DCE7F3] hover:border-[#54C8FF]'}`}
            >
              <span className={`flex shrink-0 items-center justify-center rounded-lg font-extrabold text-white ${OPTION_COLORS[i]} ${big ? 'h-12 w-12 text-xl' : 'h-9 w-9 text-base'}`}>
                {on ? <Check className="h-5 w-5" /> : LETTERS[i]}
              </span>
              <RichContentRenderer content={opt} inheritSize />
            </button>
          );
        })}
      </div>
      {question.multi && (
        <button type="button" disabled={locked || picked.length === 0} onClick={() => onAnswer(picked)} className="studio-btn studio-btn-navy mt-3 w-full">
          Chốt đáp án
        </button>
      )}
      {(locked || feedback) && (
        <div
          className={`absolute inset-0 flex flex-col items-center justify-center gap-2 backdrop-blur-[2px] ${
            feedback === 'correct' ? 'bg-[#E7F7F0]/90' : 'bg-white/85'
          }`}
        >
          {feedback === 'correct' ? (
            <span className={`mimo-pop font-display font-extrabold text-[#1F9D6B] ${big ? 'text-5xl' : 'text-3xl'}`}>Đúng rồi! +1</span>
          ) : (
            <>
              <Lock className={`text-[#D93B5B] ${big ? 'h-12 w-12' : 'h-8 w-8'}`} />
              <span className={`font-display font-extrabold text-[#D93B5B] ${big ? 'text-4xl' : 'text-2xl'}`}>
                {feedback === 'wrong' ? 'Chưa đúng!' : 'Chờ chút!'} {lockLeft > 0 ? `${lockLeft}s` : ''}
              </span>
            </>
          )}
        </div>
      )}
    </div>
  );
};

type Phase = 'setup' | 'play' | 'result';

/** "Kéo co kiến thức": two teams on one teacher-controlled screen. */
export const TugOfWarTool: React.FC<{ presenting: boolean }> = ({ presenting }) => {
  const [phase, setPhase] = useState<Phase>('setup');
  const [settings, setSettings] = useState<TugSettings>(DEFAULT_TUG_SETTINGS);
  const [questions, setQuestions] = useState<ToolQuestion[]>([]);
  const [game, setGame] = useState<TugState | null>(null);
  const [now, setNow] = useState(Date.now());
  const [sound, setSound] = useState(true);
  const [feedback, setFeedback] = useState<[('correct' | 'wrong' | null), ('correct' | 'wrong' | null)]>([null, null]);
  const [pulse, setPulse] = useState<Team | null>(null);
  const [lastEvent, setLastEvent] = useState<{ team: Team; correct: boolean; at: number } | null>(null);
  const soundRef = useRef(sound);
  soundRef.current = sound;
  const big = presenting;

  const onQuestions = useCallback((q: ToolQuestion[]) => setQuestions(q), []);
  const usable = questions.length;

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
      const id = window.setTimeout(() => setPhase('result'), 900);
      return () => window.clearTimeout(id);
    }
  }, [game?.finished, phase, game]);

  const begin = () => {
    const t = Date.now();
    setGame(startTug(questions, { ...settings, questionCount: Math.min(settings.questionCount, usable) }, t));
    setNow(t);
    setFeedback([null, null]);
    setLastEvent(null);
    setPhase('play');
  };

  const answer = (team: Team, chosen: number[]) => {
    if (!game) return;
    const t = Date.now();
    const { state, correct } = answerTug(game, settings, team, chosen, t);
    if (correct === null) return;
    setGame(state);
    if (soundRef.current) (correct ? playCorrect : playWrong)();
    setFeedback((f) => {
      const n = [...f] as typeof f;
      n[team] = correct ? 'correct' : 'wrong';
      return n;
    });
    if (correct) setPulse(team);
    setLastEvent({ team, correct, at: t });
    window.setTimeout(() => {
      setFeedback((f) => {
        const n = [...f] as typeof f;
        n[team] = null;
        return n;
      });
      setPulse(null);
    }, correct ? 700 : Math.max(900, settings.lockSeconds * 1000));
  };

  const set = <K extends keyof TugSettings>(k: K, v: TugSettings[K]) => setSettings((s) => ({ ...s, [k]: v }));

  // ---------------------------------------------------------------- setup
  if (phase === 'setup') {
    return (
      <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_360px]">
        <section>
          <h2 className="mb-3 font-display text-base font-extrabold text-[#172B4D]">1. Chọn câu hỏi</h2>
          <QuestionPicker onChange={onQuestions} />
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
            <span className="text-xs font-bold text-[#5E6C84]">Số câu tối đa: {Math.min(settings.questionCount, usable || settings.questionCount)}</span>
            <input
              type="range"
              min={2}
              max={Math.max(2, Math.min(40, usable || 40))}
              value={Math.min(settings.questionCount, Math.max(2, usable || 40))}
              onChange={(e) => set('questionCount', Number(e.target.value))}
              className="mt-1 w-full accent-[#1267E9]"
            />
          </label>

          <div>
            <span className="text-xs font-bold text-[#5E6C84]">Thời gian thi đấu</span>
            <div className="mt-1 flex flex-wrap gap-1.5">
              {DURATIONS.map((m) => (
                <button key={m} type="button" onClick={() => set('durationSec', m * 60)} aria-pressed={settings.durationSec === m * 60}
                  className={`min-h-[36px] rounded-full px-3 text-sm font-bold ${settings.durationSec === m * 60 ? 'bg-[#1267E9] text-white' : 'bg-[#EAF5FF] text-[#1267E9]'}`}>
                  {m} phút
                </button>
              ))}
            </div>
          </div>

          <fieldset>
            <legend className="text-xs font-bold text-[#5E6C84]">Điều kiện thắng</legend>
            {([['lead', `Dẫn trước ${settings.leadTarget} điểm là thắng ngay`], ['time', 'Hết thời gian (hoặc hết câu): đội nhiều điểm hơn thắng']] as const).map(([v, label]) => (
              <label key={v} className="mt-1 flex items-start gap-2 text-sm text-[#172B4D]">
                <input type="radio" name="winRule" checked={settings.winRule === v} onChange={() => set('winRule', v)} className="mt-1 accent-[#1267E9]" />
                {label}
              </label>
            ))}
          </fieldset>

          <fieldset>
            <legend className="text-xs font-bold text-[#5E6C84]">Cách thi</legend>
            {([['turns', 'Hai đội lần lượt trả lời'], ['race', 'Cùng thi trên một màn hình (mỗi đội một nửa)']] as const).map(([v, label]) => (
              <label key={v} className="mt-1 flex items-start gap-2 text-sm text-[#172B4D]">
                <input type="radio" name="mode" checked={settings.mode === v} onChange={() => set('mode', v)} className="mt-1 accent-[#1267E9]" />
                {label}
              </label>
            ))}
          </fieldset>

          <label className="flex items-center gap-2 text-sm text-[#172B4D]">
            <input type="checkbox" checked={settings.lockSeconds > 0} onChange={(e) => set('lockSeconds', e.target.checked ? 3 : 0)} className="h-4 w-4 accent-[#1267E9]" />
            Trả lời sai bị khóa 3 giây
          </label>
          <label className="flex items-center gap-2 text-sm text-[#172B4D]">
            <input type="checkbox" checked={sound} onChange={(e) => setSound(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
            Âm thanh đúng / sai
          </label>

          <button type="button" disabled={usable < 2} onClick={begin} className="studio-btn studio-btn-accent min-h-[52px] w-full text-base">
            <Play className="h-5 w-5" /> Bắt đầu kéo co
          </button>
          {usable < 2 && <p className="text-xs font-semibold text-[#B7790A]">Cần chọn ít nhất 2 câu hỏi.</p>}
        </section>
      </div>
    );
  }

  // ---------------------------------------------------------------- result
  if (phase === 'result' && game) {
    const w = game.winner;
    const reason = { lead: `dẫn trước ${settings.leadTarget} điểm`, time: 'hết thời gian', questions: 'hết câu hỏi', stopped: 'giáo viên kết thúc' }[game.endReason ?? 'stopped'];
    return (
      <div className="mx-auto max-w-3xl space-y-6 text-center">
        <div className="flex flex-col items-center gap-3">
          <MimoMascot size={big ? 150 : 110} eager />
          <Trophy className={`mimo-pop text-[#FFB800] ${big ? 'h-16 w-16' : 'h-12 w-12'}`} />
          <h2 className={`font-display font-extrabold text-[#071A63] ${big ? 'text-6xl' : 'text-4xl'}`}>
            {w === 'draw' ? 'Hòa nhau!' : `${settings.teamNames[w as Team]} chiến thắng!`}
          </h2>
          <p className={`text-[#5E6C84] ${big ? 'text-xl' : ''}`}>Trận đấu kết thúc vì {reason}.</p>
        </div>
        <div className="grid grid-cols-2 gap-4">
          {([0, 1] as Team[]).map((t) => (
            <div key={t} className={`rounded-2xl p-5 ring-2 ${TEAM_STYLE[t].soft} ${TEAM_STYLE[t].ring}`}>
              <div className={`font-display font-extrabold ${TEAM_STYLE[t].text} ${big ? 'text-3xl' : 'text-xl'}`}>{settings.teamNames[t]}</div>
              <div className={`font-display font-extrabold text-[#071A63] ${big ? 'text-8xl' : 'text-6xl'}`}>{game.scores[t]}</div>
              <div className={`text-[#5E6C84] ${big ? 'text-lg' : 'text-sm'}`}>
                Đúng {game.scores[t]}/{game.answered[t]} câu{game.answered[t] ? ` · ${Math.round((game.scores[t] / game.answered[t]) * 100)}%` : ''}
              </div>
            </div>
          ))}
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <button type="button" onClick={begin} className={`studio-btn studio-btn-accent ${big ? 'min-h-[60px] px-8 text-lg' : 'min-h-[48px] px-6'}`}>
            <RotateCcw className="h-5 w-5" /> Chơi lại
          </button>
          <button type="button" onClick={() => setPhase('setup')} className={`studio-btn studio-btn-secondary ${big ? 'min-h-[60px] text-lg' : 'min-h-[48px]'}`}>
            <Settings2 className="h-5 w-5" /> Đổi bộ câu hỏi / thiết lập
          </button>
        </div>
      </div>
    );
  }

  // ---------------------------------------------------------------- play
  if (!game) return null;
  const limit = settings.winRule === 'lead' ? settings.leadTarget : 5;
  const left = Math.max(0, (game.endsAt - now) / 1000);
  const lockLeft = (t: Team) => Math.max(0, Math.ceil((game.lockedUntil[t] - now) / 1000));
  const sides: Team[] = settings.mode === 'race' ? [0, 1] : [game.turn];

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-3">
        {([0, 1] as Team[]).map((t) => (
          <div
            key={t}
            className={`rounded-2xl px-4 py-3 ${TEAM_STYLE[t].soft} ${t === 1 ? 'order-3 text-right' : ''} ${
              settings.mode === 'turns' && game.turn === t && !game.finished ? `ring-4 ${TEAM_STYLE[t].ring}` : ''
            }`}
          >
            <div className={`truncate font-display font-extrabold ${TEAM_STYLE[t].text} ${big ? 'text-2xl' : 'text-base'}`}>{settings.teamNames[t]}</div>
            <div className={`font-display font-extrabold text-[#071A63] ${big ? 'text-7xl' : 'text-5xl'}`}>{game.scores[t]}</div>
          </div>
        ))}
        <div className="order-2 text-center">
          <div className={`font-display font-extrabold [font-variant-numeric:tabular-nums] ${left <= 10 ? 'text-[#D93B5B]' : 'text-[#071A63]'} ${big ? 'text-6xl' : 'text-4xl'}`}>
            {formatClock(left)}
          </div>
          <div className="text-xs font-bold text-[#5E6C84]">
            {settings.winRule === 'lead' ? `Dẫn ${settings.leadTarget} điểm để thắng` : 'Nhiều điểm hơn khi hết giờ'}
          </div>
        </div>
      </div>

      <Rope offset={ropeOffset(game, settings)} limit={limit} pulse={pulse} names={settings.teamNames} />

      {settings.mode === 'turns' && !game.finished && (
        <div className="flex flex-col items-center gap-1">
          {lastEvent && now - lastEvent.at < 2500 && (
            <span
              key={lastEvent.at}
              className={`mimo-pop rounded-full px-4 py-1 font-bold ${lastEvent.correct ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-[#FFEDF1] text-[#D93B5B]'} ${big ? 'text-xl' : 'text-sm'}`}
            >
              {settings.teamNames[lastEvent.team]} {lastEvent.correct ? 'trả lời đúng, +1 điểm!' : 'chưa đúng, không được điểm.'}
            </span>
          )}
          <p className={`text-center font-display font-extrabold ${TEAM_STYLE[game.turn].text} ${big ? 'text-3xl' : 'text-lg'}`}>
            Lượt của {settings.teamNames[game.turn]}
          </p>
        </div>
      )}

      <div className={`grid gap-4 ${sides.length === 2 ? 'md:grid-cols-2' : 'mx-auto max-w-4xl'}`}>
        {sides.map((t) => {
          const idx = game.current[t];
          if (idx === null) return <div key={t} className="rounded-2xl bg-[#F6FAFF] p-6 text-center text-[#5E6C84]">Đã hết câu hỏi</div>;
          return (
            <QuestionCard
              key={`${t}-${idx}`}
              question={game.deck[idx]}
              team={t}
              name={settings.teamNames[t]}
              locked={isLocked(game, t, now) || game.finished}
              lockLeft={lockLeft(t)}
              big={big}
              feedback={feedback[t]}
              onAnswer={(chosen) => answer(t, chosen)}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap items-center justify-center gap-3">
        <span className="text-sm text-[#5E6C84]">
          Câu đã dùng {game.next}/{game.deck.length}
        </span>
        <button type="button" onClick={() => setSound((s) => !s)} aria-pressed={sound} className="studio-btn studio-btn-secondary">
          {sound ? <Volume2 className="h-4 w-4" /> : <VolumeX className="h-4 w-4" />} {sound ? 'Có âm thanh' : 'Tắt âm'}
        </button>
        <button type="button" onClick={() => setGame(stopTug(game))} className="studio-btn studio-btn-danger">
          <Square className="h-4 w-4" /> Kết thúc trận
        </button>
      </div>
    </div>
  );
};
