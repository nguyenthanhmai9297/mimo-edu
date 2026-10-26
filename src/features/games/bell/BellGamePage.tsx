import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  Bell,
  Check,
  Expand,
  Flag,
  LifeBuoy,
  Minimize,
  Pause,
  Play,
  Trophy,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { RichContentRenderer } from '../../../components/editor/RichContentRenderer';
import {
  ConfirmDialog,
  ErrorState,
  LoadingState,
  StatusBadge,
  StudioModal,
  TD,
  TH,
  THEAD,
  TR,
} from '../../../components/studio/StudioUi';
import { bellAction, getBellGame, type BellAction } from '../../../services/bellGameService';
import { LETTERS } from '../../tools/quizStyle';
import { playChime, playFanfare } from '../../tools/toolSound';
import {
  answerLabel,
  isLastQuestion,
  MAX_RESCUES,
  rightAnswerLabel,
  standings,
  winners,
  type BellGame,
  type BellHostView,
  type BellPlayer,
} from './bellEngine';
import { BellSetup } from './BellSetup';
import { QrCode } from './QrCode';

/** Rung chuông vàng – teacher side: set up a game from a saved homework, then run the field. */
export const BellGamePage: React.FC = () => {
  const [params] = useSearchParams();
  const gameId = params.get('game');
  return gameId ? <BellBoard key={gameId} id={gameId} /> : <BellSetup preselect={params.get('homework') ?? ''} />;
};

// ------------------------------------------------------------------ board

const POLL_MS = 1200;

const BellBoard: React.FC<{ id: string }> = ({ id }) => {
  const [view, setView] = useState<BellHostView | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [marks, setMarks] = useState<Record<string, boolean>>({});
  const [detail, setDetail] = useState<string | null>(null);
  const [rescueOpen, setRescueOpen] = useState(false);
  const [confirmEnd, setConfirmEnd] = useState(false);
  const [full, setFull] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const last = useRef<BellHostView['status'] | null>(null);

  const accept = useCallback((next: BellHostView) => {
    setOffset(next.serverNow - Date.now());
    if (last.current && last.current !== next.status) {
      if (next.status === 'reveal' || next.status === 'judging') playChime();
      if (next.status === 'ended') playFanfare();
    }
    if (next.status !== 'judging') setMarks({});
    last.current = next.status;
    setView(next);
    setError('');
  }, []);

  useEffect(() => {
    let alive = true;
    const tick = () =>
      getBellGame(id)
        .then((v) => alive && accept(v))
        .catch((e: Error) => alive && setError(e.message));
    void tick();
    // Polls while the game runs; an ended game is loaded once
    const timer = window.setInterval(() => {
      if (last.current !== 'ended') void tick();
    }, POLL_MS);
    return () => {
      alive = false;
      window.clearInterval(timer);
    };
  }, [id, accept]);
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    const onFull = () => setFull(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFull);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('fullscreenchange', onFull);
    };
  }, []);

  const act = async (action: BellAction, body: unknown = {}) => {
    setBusy(true);
    try {
      accept(await bellAction(id, action, body));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Không thực hiện được, thử lại nhé.');
      return false;
    } finally {
      setBusy(false);
    }
  };
  const toggleFull = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void root.current?.requestFullscreen?.();
  };

  if (!view) {
    return error ? <ErrorState message={error} /> : <LoadingState label="Đang mở sân thi đấu…" />;
  }

  const q = view.index >= 0 ? view.questions[view.index] : null;
  const onField = view.players.filter((p) => p.alive);
  const out = view.players.filter((p) => !p.alive);
  const left = view.status === 'question' && view.endsAt ? Math.max(0, Math.ceil((view.endsAt - (now + offset)) / 1000)) : view.status === 'paused' ? Math.ceil((view.remainingMs ?? 0) / 1000) : null;
  const joinUrl = `${window.location.origin}/rcv?code=${view.code}`;
  const showKey = view.status === 'reveal' || view.status === 'judging';
  const game = view as unknown as BellGame;
  const lastQ = isLastQuestion(game);
  const detailPlayer = view.players.find((p) => p.id === detail) ?? null;
  const unmarked = view.status === 'judging' ? onField.filter((p) => typeof marks[p.id] !== 'boolean').length : 0;

  const clickTile = (p: BellPlayer) => {
    if (view.status === 'judging' && p.alive) {
      // Not marked → Đúng → Sai → not marked
      setMarks((m) => {
        const next = { ...m };
        if (m[p.id] === undefined) next[p.id] = true;
        else if (m[p.id] === true) next[p.id] = false;
        else delete next[p.id];
        return next;
      });
    } else setDetail(p.id);
  };

  const big = full ? 'text-2xl' : 'text-lg';
  return (
    <div ref={root} className={`bell-stage flex flex-col gap-3 bg-[#0B1F5C] text-white ${full ? 'h-screen overflow-y-auto p-5' : '-m-2 rounded-3xl p-4 sm:p-5'}`} data-testid="bell-board">
      {/* top bar */}
      <div className="flex flex-wrap items-center gap-3">
        {!full && (
          <Link to="/admin/homework/game/rung-chuong-vang" className="rounded-xl p-2 text-white/70 hover:bg-white/10" aria-label="Về trang Rung chuông vàng">
            <ArrowLeft className="h-5 w-5" />
          </Link>
        )}
        <Bell className="h-7 w-7 text-[#FFD34E]" />
        <div className="min-w-0 flex-1">
          <div className="text-xs font-bold tracking-wide text-[#FFD34E] uppercase">Rung chuông vàng · {view.mode === 'online' ? 'Điện thoại' : 'Bảng con'}</div>
          <div className="truncate font-display text-xl font-extrabold">{view.title}</div>
        </div>
        <Stat label="Còn trên sân" value={`${onField.length}/${view.players.length}`} testid="bell-alive" highlight />
        <Stat label="Câu" value={view.index >= 0 ? `${view.index + 1}/${view.questions.length}` : `0/${view.questions.length}`} />
        <Stat label="Cứu trợ còn" value={`${MAX_RESCUES - view.rescuesUsed}`} testid="bell-rescues" />
        {view.mode === 'online' && view.status !== 'ended' && <Stat label="Mã phòng" value={view.code} testid="bell-code" />}
        <button type="button" onClick={toggleFull} className="rounded-xl border border-white/30 p-2 hover:bg-white/10" aria-label={full ? 'Thoát toàn màn hình' : 'Toàn màn hình'}>
          {full ? <Minimize className="h-5 w-5" /> : <Expand className="h-5 w-5" />}
        </button>
      </div>

      {error && <div role="alert" className="rounded-xl bg-rose-500/20 px-3 py-2 text-sm font-bold text-rose-100">{error}</div>}

      <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-[1fr_200px]">
        <div className="min-w-0 space-y-3">
          {/* question / lobby / result */}
          {view.status === 'lobby' && view.mode === 'online' ? (
            <div className="flex flex-col items-center gap-4 rounded-3xl bg-white p-5 text-[#172B4D] sm:flex-row">
              <div className="rounded-2xl bg-white p-2 ring-4 ring-[#FFD34E]">
                <QrCode text={joinUrl} size={full ? 260 : 180} />
              </div>
              <div className="text-center sm:text-left">
                <div className="text-sm font-bold text-[#5E6C84]">Học sinh quét QR hoặc vào</div>
                <div className="font-bold break-all text-[#2563EB]">{window.location.host}/rcv</div>
                <div className="mt-2 text-sm font-bold text-[#5E6C84]">rồi nhập mã phòng</div>
                <div className="font-display text-6xl font-extrabold tracking-[0.2em] text-[#0B1F5C] [font-variant-numeric:tabular-nums]" data-testid="bell-join-code">{view.code}</div>
                <div className="mt-1 text-sm text-[#5E6C84]">Không cần tài khoản – chỉ cần nhập tên.</div>
              </div>
            </div>
          ) : view.status === 'ended' ? (
            <Podium view={view} />
          ) : q ? (
            <div className="rounded-3xl bg-white p-4 text-[#172B4D] sm:p-5">
              <div className="flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center gap-2 text-sm font-extrabold text-[#2563EB]">
                    Câu {view.index + 1}
                    {lastQ && <span className="inline-flex items-center gap-1 rounded-full bg-[#FFD34E] px-2 text-[#5A3A00]"><Bell className="h-3.5 w-3.5" /> Câu chuông vàng</span>}
                    {view.status === 'paused' && <StatusBadge kind="warning">Tạm dừng</StatusBadge>}
                  </div>
                  <RichContentRenderer content={q.prompt} className={`${big} font-bold`} inheritSize />
                </div>
                {left !== null && <Countdown left={left} total={view.perQuestionSec} big={full} />}
              </div>
              {q.kind === 'choice' && (
                <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {q.options!.map((o, i) => {
                    const right = showKey && q.correct!.includes(i);
                    return (
                      <div key={i} className={`flex items-start gap-2 rounded-2xl border-2 p-2.5 ${right ? 'border-[#1F9D6B] bg-[#E7F7F0]' : 'border-[#DCE7F3]'}`}>
                        <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-xl font-extrabold text-white ${right ? 'bg-[#1F9D6B]' : 'bg-[#2563EB]'}`}>{LETTERS[i]}</span>
                        <RichContentRenderer content={o} className={full ? 'text-xl' : 'text-base'} inheritSize />
                      </div>
                    );
                  })}
                </div>
              )}
              {q.kind === 'short' && !showKey && <p className="mt-3 text-sm font-bold text-[#5E6C84]">Viết câu trả lời {view.mode === 'online' ? 'trên điện thoại' : 'vào bảng con'}.</p>}
              {showKey && (
                <div className="mt-3 rounded-2xl bg-[#E7F7F0] px-3 py-2 font-extrabold text-[#14532D]" data-testid="bell-right-answer">
                  Đáp án: {rightAnswerLabel(q)}
                  {q.explanation && <RichContentRenderer content={q.explanation} className="mt-1 text-sm font-normal" />}
                </div>
              )}
            </div>
          ) : null}

          {/* field */}
          <div className="rounded-3xl bg-[#13307E] p-3">
            <div className="mb-2 flex flex-wrap items-center gap-2 text-sm font-bold text-white/80">
              <Users className="h-4 w-4" /> Sân thi đấu
              {view.status === 'judging' && <span className="text-[#FFD34E]">– bấm vào ô để chấm: 1 lần = Đúng, 2 lần = Sai ({unmarked} bạn chưa chấm)</span>}
              {view.mode === 'online' && (view.status === 'question' || view.status === 'paused') && <span className="text-[#FFD34E]">– {view.answeredIds.length}/{onField.length} bạn đã trả lời</span>}
            </div>
            {view.players.length === 0 ? (
              <p className="py-6 text-center text-white/70">Chờ học sinh vào phòng…</p>
            ) : (
              <div className={`grid gap-2 ${full ? 'grid-cols-[repeat(auto-fill,minmax(130px,1fr))]' : 'grid-cols-[repeat(auto-fill,minmax(108px,1fr))]'}`}>
                {view.players.map((p) => (
                  <Tile key={p.id} p={p} answered={view.answeredIds.includes(p.id)} mark={marks[p.id]} judging={view.status === 'judging'} onClick={() => clickTile(p)} />
                ))}
              </div>
            )}
          </div>
        </div>

        {/* question ladder with the golden bell on top */}
        <ol className="flex flex-row flex-wrap gap-1.5 rounded-3xl bg-[#13307E] p-3 lg:flex-col-reverse lg:flex-nowrap" aria-label="Tiến trình câu hỏi">
          {view.questions.map((_, i) => {
            const isLast = i === view.questions.length - 1;
            const state = i < view.index || (i === view.index && (view.status === 'reveal' || view.status === 'ended')) ? 'done' : i === view.index ? 'now' : 'next';
            return (
              <li
                key={i}
                className={`flex min-w-10 items-center justify-center gap-1 rounded-xl px-2 py-1 text-sm font-extrabold lg:justify-start ${
                  state === 'now' ? 'bg-[#FFD34E] text-[#5A3A00]' : state === 'done' ? 'bg-white/20 text-white' : 'bg-white/5 text-white/60'
                }`}
              >
                {isLast ? <Bell className="h-4 w-4 text-[#FFD34E]" /> : state === 'done' ? <Check className="h-3.5 w-3.5" /> : null}
                <span>{isLast ? `Câu ${i + 1} · Chuông vàng` : `Câu ${i + 1}`}</span>
              </li>
            );
          })}
        </ol>
      </div>

      {/* controls */}
      {view.status !== 'ended' && (
        <div className="flex flex-wrap items-center gap-2">
          {(view.status === 'lobby' || view.status === 'reveal') && !lastQ && (
            <button type="button" disabled={busy || onField.length === 0} onClick={() => void act('start')} className="studio-btn bg-[#FFD34E] text-[#5A3A00] hover:bg-[#FFC61A]">
              <Play className="h-4 w-4" />
              {view.status === 'lobby' ? 'Bắt đầu câu 1' : view.index + 2 === view.questions.length ? 'Câu chuông vàng' : `Câu ${view.index + 2}`}
            </button>
          )}
          {view.status === 'question' && (
            <>
              <button type="button" disabled={busy} onClick={() => void act('pause')} className="studio-btn border border-white/40 text-white hover:bg-white/10">
                <Pause className="h-4 w-4" /> Tạm dừng
              </button>
              <button type="button" disabled={busy} onClick={() => void act('close')} className="studio-btn bg-white text-[#0B1F5C]">
                <Flag className="h-4 w-4" /> {view.mode === 'online' ? 'Dừng & chấm' : 'Dừng & chấm bảng con'}
              </button>
            </>
          )}
          {view.status === 'paused' && (
            <>
              <button type="button" disabled={busy} onClick={() => void act('resume')} className="studio-btn bg-[#FFD34E] text-[#5A3A00]">
                <Play className="h-4 w-4" /> Tiếp tục
              </button>
              <button type="button" disabled={busy} onClick={() => void act('close')} className="studio-btn bg-white text-[#0B1F5C]">
                <Flag className="h-4 w-4" /> Dừng & chấm
              </button>
            </>
          )}
          {view.status === 'judging' && (
            <>
              <button type="button" onClick={() => setMarks((m) => Object.fromEntries(onField.map((p) => [p.id, m[p.id] ?? true])))} className="studio-btn border border-white/40 text-white hover:bg-white/10">
                Bạn chưa chấm: Đúng
              </button>
              <button type="button" onClick={() => setMarks((m) => Object.fromEntries(onField.map((p) => [p.id, m[p.id] ?? false])))} className="studio-btn border border-white/40 text-white hover:bg-white/10">
                Bạn chưa chấm: Sai
              </button>
              <button type="button" disabled={busy || unmarked > 0} onClick={() => void act('judge', { marks })} className="studio-btn bg-[#FFD34E] text-[#5A3A00]">
                <Check className="h-4 w-4" /> Chốt kết quả
              </button>
            </>
          )}
          {view.status === 'reveal' && (
            <button type="button" disabled={busy || out.length === 0 || view.rescuesUsed >= MAX_RESCUES} onClick={() => setRescueOpen(true)} className="studio-btn border border-[#FFD34E] text-[#FFD34E] hover:bg-white/10">
              <LifeBuoy className="h-4 w-4" /> Cứu trợ ({MAX_RESCUES - view.rescuesUsed}/{MAX_RESCUES})
            </button>
          )}
          <span className="ml-auto" />
          {view.status === 'reveal' && onField.length === 0 && view.rescuesUsed < MAX_RESCUES && <span className="text-sm font-bold text-[#FFD34E]">Không còn ai trên sân – có thể cứu trợ hoặc kết thúc.</span>}
          <button type="button" disabled={busy} onClick={() => setConfirmEnd(true)} className={`studio-btn ${view.status === 'reveal' && (lastQ || onField.length === 0) ? 'bg-[#FFD34E] text-[#5A3A00]' : 'border border-white/40 text-white hover:bg-white/10'}`}>
            <Trophy className="h-4 w-4" /> Kết thúc & công bố
          </button>
        </div>
      )}
      {view.status === 'ended' && <ResultsTable view={view} onPick={setDetail} />}

      <PlayerDetail
        player={detailPlayer}
        view={view}
        busy={busy}
        onClose={() => setDetail(null)}
        onField={async (p, on) => {
          if (await act('field', { playerId: p.id, onField: on })) setDetail(null);
        }}
      />
      <RescueModal
        open={rescueOpen}
        out={out}
        round={view.rescuesUsed + 1}
        busy={busy}
        onClose={() => setRescueOpen(false)}
        onRescue={async (ids) => {
          if (await act('rescue', { playerIds: ids })) setRescueOpen(false);
        }}
      />
      <ConfirmDialog
        open={confirmEnd}
        title="Kết thúc trận đấu?"
        message={`Trận dừng ở câu ${Math.max(0, view.index + 1)}/${view.questions.length}. ${onField.length ? `${onField.length} bạn còn trên sân sẽ là người thắng.` : 'Người thắng là bạn có điểm cao nhất.'} Kết quả được lưu lại.`}
        confirmLabel="Kết thúc & công bố"
        onCancel={() => setConfirmEnd(false)}
        onConfirm={async () => {
          setConfirmEnd(false);
          await act('end');
        }}
      />
    </div>
  );
};

const Stat: React.FC<{ label: string; value: string; highlight?: boolean; testid?: string }> = ({ label, value, highlight, testid }) => (
  <div className={`rounded-2xl px-3 py-1.5 text-center ${highlight ? 'bg-[#FFD34E] text-[#5A3A00]' : 'bg-white/10'}`}>
    <div className={`text-[11px] font-bold uppercase ${highlight ? '' : 'text-white/70'}`}>{label}</div>
    <div className="font-display text-xl font-extrabold [font-variant-numeric:tabular-nums]" data-testid={testid}>{value}</div>
  </div>
);

const Countdown: React.FC<{ left: number; total: number; big: boolean }> = ({ left, total, big }) => {
  const warn = left <= 5;
  return (
    <div className={`flex shrink-0 flex-col items-center justify-center rounded-full border-8 ${warn ? 'border-[#E5484D] text-[#E5484D]' : 'border-[#FFD34E] text-[#0B1F5C]'} ${big ? 'h-32 w-32' : 'h-24 w-24'}`} role="timer" aria-label={`Còn ${left} giây`}>
      <span className={`font-display font-extrabold [font-variant-numeric:tabular-nums] ${big ? 'text-5xl' : 'text-4xl'}`} data-testid="bell-timer">{left}</span>
      <span className="text-[10px] font-bold text-[#5E6C84]">/ {total} giây</span>
    </div>
  );
};

const Tile: React.FC<{ p: BellPlayer; answered: boolean; mark: boolean | undefined; judging: boolean; onClick: () => void }> = ({ p, answered, mark, judging, onClick }) => {
  const ring = judging && p.alive ? (mark === true ? 'ring-4 ring-[#22C38E]' : mark === false ? 'ring-4 ring-[#E5484D]' : 'ring-2 ring-white/60 ring-dashed') : '';
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid="bell-tile"
      data-state={p.alive ? 'on' : 'out'}
      className={`relative flex flex-col items-center rounded-2xl px-2 py-2 text-center transition ${ring} ${
        p.alive ? 'bg-gradient-to-b from-[#FFE27A] to-[#FFC61A] text-[#5A3A00] shadow-[0_3px_0_#C99400]' : 'bg-[#5E6C84]/60 text-white/70'
      }`}
    >
      <span className="font-display text-2xl leading-none font-extrabold [font-variant-numeric:tabular-nums]">{p.seat}</span>
      <span className="mt-1 line-clamp-1 w-full text-xs font-bold">{p.name}</span>
      <span className="text-[10px] font-bold">
        {judging && p.alive ? (mark === true ? 'Đúng' : mark === false ? 'Sai' : 'Chưa chấm') : p.alive ? `${p.score} điểm` : `Loại ở câu ${(p.outAt ?? 0) + 1}`}
      </span>
      {answered && p.alive && (
        <span className="absolute -top-1.5 -right-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-[#22C38E] text-white" title="Đã trả lời">
          <Check className="h-3.5 w-3.5" />
        </span>
      )}
    </button>
  );
};

const PlayerDetail: React.FC<{ player: BellPlayer | null; view: BellHostView; busy: boolean; onClose: () => void; onField: (p: BellPlayer, on: boolean) => void }> = ({ player, view, busy, onClose, onField }) => (
  <StudioModal
    open={Boolean(player)}
    onClose={onClose}
    icon={Users}
    tone="yellow"
    title={player ? `${player.seat}. ${player.name}` : ''}
    footer={
      player && view.status !== 'ended' ? (
        player.alive ? (
          <button type="button" disabled={busy} onClick={() => onField(player, false)} className="studio-btn studio-btn-danger">
            <UserMinus className="h-4 w-4" /> Loại khỏi sân
          </button>
        ) : (
          <button type="button" disabled={busy} onClick={() => onField(player, true)} className="studio-btn studio-btn-primary">
            <UserPlus className="h-4 w-4" /> Khôi phục lên sân
          </button>
        )
      ) : undefined
    }
  >
    {player && (
      <div className="space-y-3 text-sm text-[#172B4D]" data-testid="bell-player-detail">
        <div className="grid grid-cols-3 gap-2 text-center">
          {[
            ['Trạng thái', player.alive ? 'Trên sân' : `Loại ở câu ${(player.outAt ?? 0) + 1}`],
            ['Đúng', String(player.correct)],
            ['Sai', String(player.wrong)],
            ['Điểm', String(player.score)],
            ['Được cứu trợ', `${player.rescued} lần`],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl bg-[#F6FAFF] p-2">
              <div className="text-xs text-[#5E6C84]">{k}</div>
              <div className="font-extrabold">{v}</div>
            </div>
          ))}
        </div>
        <div>
          <div className="mb-1 text-xs font-bold text-[#5E6C84]">Lịch sử trả lời</div>
          {player.history.length === 0 ? (
            <p className="text-[#5E6C84]">Chưa trả lời câu nào.</p>
          ) : (
            <ul className="space-y-1">
              {player.history.map((h) => (
                <li key={h.q} className="flex items-center gap-2">
                  <span className={`flex h-5 w-5 items-center justify-center rounded-full text-white ${h.ok ? 'bg-[#1F9D6B]' : 'bg-[#E5484D]'}`}>{h.ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}</span>
                  Câu {h.q + 1}: {h.answer === 'bảng con' ? 'bảng con' : h.answer ? answerLabel(view.questions[h.q], h.answer) : 'không trả lời'}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    )}
  </StudioModal>
);

const RescueModal: React.FC<{ open: boolean; out: BellPlayer[]; round: number; busy: boolean; onClose: () => void; onRescue: (ids: string[]) => void }> = ({ open, out, round, busy, onClose, onRescue }) => {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  useEffect(() => {
    if (open) setPicked(new Set(out.map((p) => p.id)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);
  return (
    <StudioModal
      open={open}
      onClose={onClose}
      icon={LifeBuoy}
      tone="yellow"
      title={`Cứu trợ – lượt ${round}/${MAX_RESCUES}`}
      footer={
        <button type="button" disabled={busy || picked.size === 0} onClick={() => onRescue([...picked])} className="studio-btn studio-btn-primary">
          <LifeBuoy className="h-4 w-4" /> Đưa {picked.size} bạn trở lại sân
        </button>
      }
    >
      <div className="mb-2 flex gap-2 text-xs font-bold">
        <button type="button" className="text-[#2563EB] hover:underline" onClick={() => setPicked(new Set(out.map((p) => p.id)))}>Chọn tất cả</button>
        <button type="button" className="text-[#2563EB] hover:underline" onClick={() => setPicked(new Set())}>Bỏ chọn</button>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {out.map((p) => (
          <label key={p.id} className="flex items-center gap-2 rounded-xl border border-[#DCE7F3] p-2 text-sm">
            <input
              type="checkbox"
              checked={picked.has(p.id)}
              onChange={(e) => setPicked((s) => { const n = new Set(s); if (e.target.checked) n.add(p.id); else n.delete(p.id); return n; })}
            />
            <span className="font-bold">{p.seat}.</span> <span className="truncate">{p.name}</span>
          </label>
        ))}
      </div>
    </StudioModal>
  );
};

const Podium: React.FC<{ view: BellHostView }> = ({ view }) => {
  const champs = winners(view as unknown as BellGame);
  return (
    <div className="rounded-3xl bg-gradient-to-b from-[#FFE27A] to-[#FFC61A] p-6 text-center text-[#5A3A00]" data-testid="bell-winners">
      <Bell className="mx-auto h-14 w-14" />
      <div className="font-display text-3xl font-extrabold">{champs.length ? 'Rung chuông vàng!' : 'Kết thúc trận đấu'}</div>
      <div className="mt-2 text-xl font-extrabold">{champs.length ? champs.map((w) => `${w.seat}. ${w.name}`).join(' · ') : 'Chưa có người thắng'}</div>
      <div className="mt-1 text-sm font-bold">Kết quả đã được lưu.</div>
    </div>
  );
};

const ResultsTable: React.FC<{ view: BellHostView; onPick: (id: string) => void }> = ({ view, onPick }) => (
  <div className="overflow-x-auto rounded-3xl bg-white text-[#172B4D]">
    <table className="w-full min-w-[620px] text-sm">
      <thead className={THEAD}>
        <tr>
          {['Hạng', 'Học sinh', 'Kết quả', 'Đúng', 'Sai', 'Điểm', 'Cứu trợ'].map((h) => (
            <th key={h} className={`${TH} text-left`}>{h}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {standings(view as unknown as BellGame).map((p, i) => (
          <tr key={p.id} className={`${TR} cursor-pointer`} onClick={() => onPick(p.id)}>
            <td className={TD}>{i + 1}</td>
            <td className={TD}><b>{p.seat}.</b> {p.name}</td>
            <td className={TD}>{p.alive ? <StatusBadge kind="success">Trụ đến cuối</StatusBadge> : `Loại ở câu ${(p.outAt ?? 0) + 1}`}</td>
            <td className={TD}>{p.correct}</td>
            <td className={TD}>{p.wrong}</td>
            <td className={TD}>{p.score}</td>
            <td className={TD}>{p.rescued}</td>
          </tr>
        ))}
      </tbody>
    </table>
  </div>
);
