import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Check, ChevronRight, Flag, Play, Trophy, Users, X } from 'lucide-react';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { closeLiveQuestion, endLiveQuiz, getLiveQuiz, openLiveQuestion } from '../../services/liveQuizService';
import type { LiveQuizHostView } from '../../types/liveQuiz';
import { LETTERS, TILE, TimerRing } from './quizStyle';
import { playChime, playFanfare } from './toolSound';
import type { ToolQuestion } from './toolQuestions';

const POLL_MS = 1500;

/** Teacher board for "Mimo Quiz – học sinh tham gia": shows the code, live answer counts and results. */
export const LiveQuizHost: React.FC<{
  deck: ToolQuestion[];
  initial: LiveQuizHostView;
  perQuestionSec: number | null;
  presenting: boolean;
  sound: boolean;
  onExit: () => void;
}> = ({ deck, initial, perQuestionSec, presenting, sound, onExit }) => {
  const [view, setView] = useState(initial);
  const [offset, setOffset] = useState(initial.serverNow - Date.now());
  const [now, setNow] = useState(Date.now());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const lastStatus = useRef(initial.status);
  const big = presenting;
  const id = initial.sessionId;

  const accept = useCallback(
    (next: LiveQuizHostView) => {
      setOffset(next.serverNow - Date.now());
      if (lastStatus.current === 'question' && next.status === 'closed' && sound) playChime();
      if (lastStatus.current !== 'ended' && next.status === 'ended' && sound) playFanfare();
      lastStatus.current = next.status;
      setView(next);
      setError('');
    },
    [sound]
  );

  useEffect(() => {
    if (view.status === 'ended') return;
    let alive = true;
    const tick = async () => {
      try {
        const next = await getLiveQuiz(id);
        if (alive) accept(next);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Mất kết nối máy chủ.');
      }
    };
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [id, view.status, accept]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const act = async (fn: () => Promise<LiveQuizHostView>) => {
    setBusy(true);
    try {
      accept(await fn());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được, thử lại nhé.');
    } finally {
      setBusy(false);
    }
  };

  const joinUrl = `${window.location.origin}/quiz`;
  const q = deck[view.index];
  const left = view.questionEndsAt !== null ? Math.max(0, Math.ceil((view.questionEndsAt - (now + offset)) / 1000)) : null;
  const players = view.players.length;
  const btn = big ? 'min-h-[60px] px-8 text-lg' : 'min-h-[48px] px-6';
  const last = view.index >= view.total - 1;

  const playerChips = (
    <div className="flex flex-wrap gap-2">
      {view.players.map((p) => (
        <span
          key={p.studentId}
          className={`mimo-pop inline-flex items-center gap-1 rounded-full px-3 py-1 font-bold ${big ? 'text-base' : 'text-sm'} ${
            view.status === 'question' && p.answeredCurrent ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-[#EAF5FF] text-[#1267E9]'
          }`}
        >
          {view.status === 'question' && p.answeredCurrent && <Check className="h-4 w-4" />}
          {p.name}
        </span>
      ))}
      {players === 0 && <span className="text-sm text-[#5E6C84]">Chưa có bạn nào vào phòng…</span>}
    </div>
  );

  return (
    <div className="space-y-4">
      {error && <p className="rounded-xl bg-[#FFEDF1] px-4 py-2 text-sm font-bold text-[#D93B5B]">{error}</p>}

      {/* ------------------------------------------------ lobby */}
      {view.status === 'lobby' && (
        <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="studio-card flex flex-col items-center justify-center gap-3 p-6 text-center">
            <div className="text-sm font-bold uppercase tracking-wide text-[#5E6C84]">Mã phòng</div>
            <div data-testid="live-code" className={`font-display font-extrabold tracking-[0.18em] text-[#071A63] ${big ? 'text-8xl' : 'text-6xl'}`}>
              {view.code}
            </div>
            <div className={`text-[#172B4D] ${big ? 'text-2xl' : 'text-base'}`}>
              Học sinh mở <b className="text-[#1267E9]">{joinUrl}</b> và nhập mã phòng
            </div>
            <div className="text-xs text-[#5E6C84]">Học sinh đăng nhập bằng mã học sinh của mình trước khi vào phòng.</div>
          </div>
          <div className="studio-card space-y-3 p-5">
            <div className="flex items-center gap-2 font-display font-extrabold text-[#071A63]">
              <Users className="h-5 w-5" /> Đã vào phòng: {players} bạn
            </div>
            {playerChips}
            <div className="flex flex-wrap gap-3 pt-2">
              <button type="button" disabled={busy} onClick={() => act(() => openLiveQuestion(id, 0))} className={`studio-btn studio-btn-accent ${btn}`}>
                <Play className="h-5 w-5" /> Bắt đầu câu 1
              </button>
              <button type="button" disabled={busy} onClick={() => act(() => endLiveQuiz(id))} className="studio-btn studio-btn-secondary">
                <X className="h-4 w-4" /> Hủy phòng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ------------------------------------------------ question / closed */}
      {(view.status === 'question' || view.status === 'closed') && q && (
        <>
          <div className="flex flex-wrap items-center gap-3">
            <div className={`rounded-full bg-[#071A63] px-4 py-1.5 font-display font-extrabold text-white ${big ? 'text-2xl' : 'text-base'}`}>
              Câu {view.index + 1}/{view.total}
            </div>
            <span className="rounded-full bg-[#EAF5FF] px-3 py-1 text-sm font-bold text-[#1267E9]">Mã phòng {view.code}</span>
            {q.multi && <span className="rounded-full bg-[#F1ECFF] px-3 py-1 text-sm font-bold text-[#6A4BE6]">Nhiều đáp án đúng</span>}
            <div className="ml-auto flex items-center gap-4">
              <div className="text-right">
                <div data-testid="live-answered" className={`font-display font-extrabold text-[#071A63] ${big ? 'text-5xl' : 'text-3xl'}`}>
                  {view.answeredCount}/{players}
                </div>
                <div className="text-xs font-bold text-[#5E6C84]">đã trả lời</div>
              </div>
              {view.status === 'question' && left !== null && perQuestionSec && <TimerRing left={left} total={perQuestionSec} big={big} />}
            </div>
          </div>

          <div className="studio-card p-5 sm:p-7">
            <RichContentRenderer content={q.prompt} inheritSize className={`font-semibold text-[#071A63] ${big ? 'text-3xl sm:text-[42px] leading-snug' : 'text-xl sm:text-2xl'}`} />
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {q.options.map((opt, i) => {
              const closed = view.status === 'closed';
              const right = q.correct.includes(i);
              const count = view.optionCounts?.[i] ?? 0;
              const share = view.answeredCount ? count / view.answeredCount : 0;
              return (
                <div
                  key={i}
                  data-testid="live-option"
                  data-correct={closed && right ? 'true' : undefined}
                  className={`relative flex items-center gap-4 overflow-hidden rounded-2xl px-4 text-white shadow-md transition-all duration-500 ${TILE[i].bg} ${
                    big ? 'min-h-[100px] text-3xl' : 'min-h-[72px] text-xl'
                  } ${closed ? (right ? 'ring-8 ring-[#FFD34E]' : 'opacity-40 saturate-50') : ''}`}
                >
                  {closed && <span className="absolute inset-y-0 left-0 bg-white/20 transition-all duration-700" style={{ width: `${share * 100}%` }} />}
                  <span className={`relative flex shrink-0 items-center justify-center rounded-xl bg-white/25 font-display font-extrabold ${big ? 'h-14 w-14 text-3xl' : 'h-11 w-11 text-xl'}`}>
                    {LETTERS[i]}
                  </span>
                  <RichContentRenderer content={opt} inheritSize className="relative font-bold [&_*]:!text-white" />
                  {closed && (
                    <span className="relative ml-auto flex items-center gap-2 font-display font-extrabold">
                      {right && <Check className="h-7 w-7" strokeWidth={3} />}
                      {count}
                    </span>
                  )}
                </div>
              );
            })}
          </div>

          {view.status === 'closed' && (
            <p className={`text-center font-display font-extrabold text-[#1F9D6B] ${big ? 'text-3xl' : 'text-xl'}`}>
              {view.correctCount}/{view.answeredCount} bạn trả lời đúng
            </p>
          )}
          {view.status === 'closed' && q.explanation && (
            <div className="rounded-2xl bg-[#FFF6DC] p-4">
              <div className="text-xs font-bold text-[#B7790A]">Giải thích</div>
              <RichContentRenderer content={q.explanation} inheritSize className={big ? 'text-xl' : ''} />
            </div>
          )}

          {view.status === 'question' && playerChips}

          <div className="flex flex-wrap items-center justify-center gap-3">
            {view.status === 'question' ? (
              <button type="button" disabled={busy} onClick={() => act(() => closeLiveQuestion(id))} className={`studio-btn studio-btn-navy ${btn}`}>
                <Flag className="h-5 w-5" /> Đóng câu hỏi & hiện đáp án
              </button>
            ) : last ? (
              <button type="button" disabled={busy} onClick={() => act(() => endLiveQuiz(id))} className={`studio-btn studio-btn-accent ${btn}`}>
                <Trophy className="h-5 w-5" /> Kết thúc & xem kết quả
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => act(() => openLiveQuestion(id, view.index + 1))} className={`studio-btn studio-btn-primary ${btn}`}>
                Câu tiếp <ChevronRight className="h-5 w-5" />
              </button>
            )}
            {view.status === 'closed' && !last && (
              <button type="button" disabled={busy} onClick={() => act(() => endLiveQuiz(id))} className="studio-btn studio-btn-danger">
                Kết thúc sớm
              </button>
            )}
          </div>
        </>
      )}

      {/* ------------------------------------------------ ended */}
      {view.status === 'ended' && (
        <div className="mx-auto max-w-4xl space-y-5">
          <h2 className={`text-center font-display font-extrabold text-[#071A63] ${big ? 'text-5xl' : 'text-3xl'}`}>Kết quả Mimo Quiz</h2>
          <ol className="studio-card divide-y divide-[#EAF5FF] p-2">
            {[...view.players]
              .sort((a, b) => b.score - a.score)
              .map((p, rank) => (
                <li key={p.studentId} className={`flex items-center gap-3 px-3 py-2 ${big ? 'text-2xl' : 'text-base'}`}>
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full font-extrabold ${
                      rank === 0 ? 'bg-[#FFD34E] text-[#071A63]' : rank < 3 ? 'bg-[#EAF5FF] text-[#1267E9]' : 'bg-[#F6FAFF] text-[#5E6C84]'
                    }`}
                  >
                    {rank + 1}
                  </span>
                  <span className="flex-1 font-bold text-[#172B4D]">{p.name}</span>
                  <span className="font-display font-extrabold text-[#071A63]">
                    {p.score}/{view.total}
                  </span>
                </li>
              ))}
            {players === 0 && <li className="p-4 text-center text-[#5E6C84]">Không có học sinh nào tham gia.</li>}
          </ol>
          <section className="studio-card p-4">
            <h3 className="mb-2 font-display font-extrabold text-[#071A63]">Tỉ lệ đúng từng câu</h3>
            <ul className="space-y-1.5">
              {view.questionStats.map((s, i) => {
                const pct = s.answered ? Math.round((s.correct / s.answered) * 100) : 0;
                return (
                  <li key={i} className="flex items-center gap-3 text-sm">
                    <span className="w-14 shrink-0 font-bold text-[#5E6C84]">Câu {i + 1}</span>
                    <span className="h-3 flex-1 overflow-hidden rounded-full bg-[#EAF5FF]">
                      <span className={`block h-full rounded-full ${pct >= 70 ? 'bg-[#22C38E]' : pct >= 40 ? 'bg-[#F5A800]' : 'bg-[#E5484D]'}`} style={{ width: `${pct}%` }} />
                    </span>
                    <span className="w-28 shrink-0 text-right text-[#172B4D]">
                      {s.correct}/{s.answered} đúng ({pct}%)
                    </span>
                  </li>
                );
              })}
            </ul>
          </section>
          <div className="flex justify-center">
            <button type="button" onClick={onExit} className="studio-btn studio-btn-secondary min-h-[48px]">
              Về màn hình thiết lập
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
