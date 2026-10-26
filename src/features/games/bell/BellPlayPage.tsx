import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Bell, Check, LogOut, Send, X } from 'lucide-react';
import { RichContentRenderer } from '../../../components/editor/RichContentRenderer';
import { answerBell, forgetPlayer, getBellPlay, joinBellGame, savedPlayer } from '../../../services/bellGameService';
import { LETTERS, TILE } from '../../tools/quizStyle';
import type { BellPlayView } from './bellEngine';

const POLL_MS = 1500;

/** Rung chuông vàng on a pupil's phone: join with the room code and a name, then answer each question. */
export const BellPlayPage: React.FC = () => {
  const [params] = useSearchParams();
  const [token, setToken] = useState<string | null>(() => savedPlayer()?.token ?? null);
  const [code, setCode] = useState(params.get('code') ?? '');
  const [name, setName] = useState('');
  const [view, setView] = useState<BellPlayView | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState<number[]>([]);
  const [text, setText] = useState('');
  const shownIndex = useRef(-2);

  const leave = useCallback(() => {
    forgetPlayer();
    setToken(null);
    setView(null);
  }, []);

  useEffect(() => {
    if (!token) return;
    let alive = true;
    const tick = () =>
      getBellPlay(token)
        .then((v) => {
          if (!alive) return;
          setOffset(v.serverNow - Date.now());
          if (v.index !== shownIndex.current) {
            shownIndex.current = v.index;
            setPicked([]);
            setText('');
          }
          setView(v);
          setError('');
        })
        .catch((e: Error & { status?: number }) => {
          if (!alive) return;
          if (e.status === 401) leave();
          setError(e.message);
        });
    void tick();
    const timer = window.setInterval(tick, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [token, leave]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const join = async () => {
    setBusy(true);
    setError('');
    try {
      // A new room replaces the one this phone played before
      const r = await joinBellGame(code, name);
      setToken(r.token);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const send = async () => {
    if (!token || !view?.question) return;
    setBusy(true);
    setError('');
    try {
      await answerBell(token, view.index, view.question.kind === 'choice' ? { chosen: picked } : { text });
      setView({ ...view, myAnswer: view.question.kind === 'choice' ? picked.join(',') : text });
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const shell = (children: React.ReactNode) => (
    <div className="min-h-screen bg-[#0B1F5C] px-4 py-5 text-white">
      <div className="mx-auto max-w-md space-y-4">
        <div className="flex items-center gap-2">
          <Bell className="h-7 w-7 text-[#FFD34E]" />
          <div className="font-display text-xl font-extrabold">Rung chuông vàng</div>
          {token && (
            <button type="button" onClick={leave} className="ml-auto flex items-center gap-1 rounded-xl px-2 py-1 text-xs font-bold text-white/70 hover:bg-white/10">
              <LogOut className="h-4 w-4" /> Rời phòng
            </button>
          )}
        </div>
        {error && <div role="alert" className="rounded-xl bg-rose-500/25 px-3 py-2 text-sm font-bold">{error}</div>}
        {children}
      </div>
    </div>
  );

  if (!token) {
    return shell(
      <form
        className="space-y-3 rounded-3xl bg-white p-5 text-[#172B4D]"
        onSubmit={(e) => {
          e.preventDefault();
          void join();
        }}
      >
        <label className="block text-sm font-bold" htmlFor="bell-code-input">Mã phòng (6 số)</label>
        <input
          id="bell-code-input"
          inputMode="numeric"
          autoComplete="off"
          maxLength={6}
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ''))}
          className="w-full rounded-2xl border-2 border-[#DCE7F3] px-4 py-3 text-center font-display text-3xl font-extrabold tracking-[0.3em]"
        />
        <label className="block text-sm font-bold" htmlFor="bell-name-input">Tên của con</label>
        <input id="bell-name-input" maxLength={40} value={name} onChange={(e) => setName(e.target.value)} className="w-full rounded-2xl border-2 border-[#DCE7F3] px-4 py-3 text-lg font-bold" placeholder="Ví dụ: Minh Anh" />
        <button type="submit" disabled={busy || code.length !== 6 || !name.trim()} className="w-full rounded-2xl bg-[#FFD34E] py-3 text-lg font-extrabold text-[#5A3A00] disabled:opacity-50">
          {busy ? 'Đang vào…' : 'Vào sân'}
        </button>
      </form>
    );
  }

  if (!view) return shell(<p className="py-10 text-center text-white/70">Đang vào sân…</p>);

  const me = view.me;
  const left = view.status === 'question' && view.endsAt ? Math.max(0, Math.ceil((view.endsAt - (now + offset)) / 1000)) : null;
  const header = me && (
    <div className={`flex items-center gap-3 rounded-2xl p-3 ${me.alive ? 'bg-gradient-to-b from-[#FFE27A] to-[#FFC61A] text-[#5A3A00]' : 'bg-white/15 text-white'}`} data-testid="bell-me">
      <span className="font-display text-3xl font-extrabold">{me.seat}</span>
      <div className="min-w-0 flex-1">
        <div className="truncate font-extrabold">{me.name}</div>
        <div className="text-xs font-bold">{me.alive ? 'Đang ở trên sân' : `Rời sân ở câu ${(me.outAt ?? 0) + 1} – chờ cứu trợ`}</div>
      </div>
      <div className="text-right text-xs font-bold">
        <div className="font-display text-xl">{me.score}</div>điểm
      </div>
    </div>
  );
  const info = <div className="text-center text-sm font-bold text-white/80">Câu {Math.max(0, view.index + 1)}/{view.total} · Còn {view.aliveCount}/{view.playerCount} bạn trên sân</div>;

  let body: React.ReactNode;
  if (view.status === 'ended') {
    const won = me && view.winners?.includes(`${me.seat}. ${me.name}`);
    body = (
      <div className="rounded-3xl bg-white p-6 text-center text-[#172B4D]" data-testid="bell-play-ended">
        <Bell className={`mx-auto h-12 w-12 ${won ? 'text-[#F5A800]' : 'text-[#5E6C84]'}`} />
        <div className="mt-2 font-display text-2xl font-extrabold">{won ? 'Con đã rung chuông vàng!' : 'Trận đấu kết thúc'}</div>
        <div className="mt-1 text-sm">Người thắng: {view.winners?.join(', ') || 'chưa có'}</div>
        {me && <div className="mt-2 text-sm font-bold">Con đúng {me.correct} câu · {me.score} điểm</div>}
      </div>
    );
  } else if (view.status === 'lobby') {
    body = <p className="rounded-3xl bg-white/10 p-6 text-center font-bold">Con đã vào sân. Chờ thầy cô bắt đầu nhé!</p>;
  } else if (view.question && view.myAnswer === null && view.status === 'question') {
    const q = view.question;
    body = (
      <div className="space-y-3 rounded-3xl bg-white p-4 text-[#172B4D]">
        <div className="flex items-center justify-between text-sm font-extrabold text-[#2563EB]">
          <span>Câu {view.index + 1}</span>
          {left !== null && <span className={`font-display text-2xl ${left <= 5 ? 'text-[#E5484D]' : ''}`} data-testid="bell-play-timer">{left}s</span>}
        </div>
        <RichContentRenderer content={q.prompt} className="text-lg font-bold" inheritSize />
        {q.kind === 'choice' ? (
          <div className="grid grid-cols-1 gap-2">
            {q.options!.map((o, i) => {
              const on = picked.includes(i);
              return (
                <button
                  key={i}
                  type="button"
                  data-testid="bell-option"
                  onClick={() => setPicked((p) => (q.multi ? (on ? p.filter((x) => x !== i) : [...p, i]) : [i]))}
                  className={`flex items-center gap-2 rounded-2xl border-4 p-2 text-left ${on ? 'border-[#0B1F5C]' : 'border-transparent'} ${TILE[i % TILE.length].bg} text-white`}
                >
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/25 font-extrabold">{LETTERS[i]}</span>
                  <RichContentRenderer content={o} className="text-base font-bold text-white" inheritSize />
                  {on && <Check className="ml-auto h-6 w-6" />}
                </button>
              );
            })}
            {q.multi && <p className="text-xs text-[#5E6C84]">Câu này có thể có nhiều đáp án đúng.</p>}
          </div>
        ) : (
          <input
            aria-label="Câu trả lời"
            maxLength={60}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="w-full rounded-2xl border-2 border-[#DCE7F3] px-4 py-3 text-xl font-bold"
            placeholder="Viết câu trả lời"
          />
        )}
        <button
          type="button"
          disabled={busy || (q.kind === 'choice' ? picked.length === 0 : !text.trim())}
          onClick={() => void send()}
          className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#0B1F5C] py-3 text-lg font-extrabold text-white disabled:opacity-40"
        >
          <Send className="h-5 w-5" /> Gửi câu trả lời
        </button>
      </div>
    );
  } else if (view.status === 'question' || view.status === 'paused') {
    body = (
      <p className="rounded-3xl bg-white/10 p-6 text-center font-bold">
        {view.status === 'paused'
          ? 'Thầy cô đang tạm dừng.'
          : !me?.alive
            ? 'Con đang ở ngoài sân, chưa trả lời được. Chờ lượt cứu trợ nhé!'
            : 'Đã gửi câu trả lời. Chờ công bố kết quả…'}
      </p>
    );
  } else if (view.result) {
    body = (
      <div className={`rounded-3xl p-6 text-center ${view.result.ok ? 'bg-[#22C38E]' : 'bg-[#E5484D]'}`} data-testid="bell-play-result">
        {view.result.ok ? <Check className="mx-auto h-12 w-12" /> : <X className="mx-auto h-12 w-12" />}
        <div className="font-display text-2xl font-extrabold">{view.result.ok ? 'Chính xác! Con ở lại sân' : 'Chưa đúng – con rời sân'}</div>
        <div className="mt-1 font-bold">Đáp án: {view.result.rightAnswer}</div>
      </div>
    );
  } else {
    body = <p className="rounded-3xl bg-white/10 p-6 text-center font-bold">{me?.alive ? 'Chờ câu tiếp theo…' : 'Con đang ở ngoài sân. Chờ lượt cứu trợ nhé!'}</p>;
  }

  return shell(
    <>
      {header}
      {info}
      {body}
    </>
  );
};
