import React, { useCallback, useEffect, useState } from 'react';
import { Check, LogIn, Send } from 'lucide-react';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { MimoMascot } from '../practice/student/practiceTheme';
import { LETTERS, TILE } from '../tools/quizStyle';
import { answerLiveQuestion, getLivePlay, joinLiveQuiz } from '../../services/liveQuizService';
import { getSavedStudentToken, loginWithStudentCode } from '../../services/studentPortalService';
import type { LiveQuizPlayView } from '../../types/liveQuiz';

const SESSION_KEY = 'mimoedu.quiz.session';
const POLL_MS = 1500;

function readSession(): string | null {
  try {
    return sessionStorage.getItem(SESSION_KEY);
  } catch {
    return null;
  }
}
function writeSession(id: string | null) {
  try {
    if (id) sessionStorage.setItem(SESSION_KEY, id);
    else sessionStorage.removeItem(SESSION_KEY);
  } catch {
    /* private mode: the student just re-enters the code after a reload */
  }
}

const Shell: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div className="min-h-screen bg-gradient-to-b from-[#1E3A8A] via-[#0F2C8A] to-[#2563EB] px-4 py-6">
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <div className="flex items-center gap-2 text-white">
        <MimoMascot size={44} />
        <span className="font-display text-lg font-extrabold">Mimo Quiz</span>
      </div>
      {children}
    </div>
  </div>
);

const Card: React.FC<{ children: React.ReactNode; className?: string }> = ({ children, className = '' }) => (
  <div className={`rounded-[1.75rem] bg-white p-5 shadow-xl sm:p-6 ${className}`}>{children}</div>
);

/** /quiz – students join the teacher's Mimo Quiz room and answer on their own device. */
export const StudentQuizPage: React.FC = () => {
  const [hasToken, setHasToken] = useState(() => Boolean(getSavedStudentToken()));
  const [sessionId, setSessionId] = useState<string | null>(readSession);
  const [view, setView] = useState<LiveQuizPlayView | null>(null);
  const [offset, setOffset] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [input, setInput] = useState(() => new URLSearchParams(window.location.search).get('code') ?? '');
  const [studentCode, setStudentCode] = useState('');
  const [picked, setPicked] = useState<number[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!sessionId) return;
    try {
      const next = await getLivePlay(sessionId);
      setOffset(next.serverNow - Date.now());
      setView((prev) => {
        if (prev?.index !== next.index) setPicked([]);
        return next;
      });
      setError('');
    } catch (e) {
      const msg = e instanceof Error ? e.message : '';
      if (/chưa vào phòng/i.test(msg)) {
        writeSession(null);
        setSessionId(null);
        setView(null);
      } else setError(msg || 'Mất kết nối, đang thử lại…');
    }
  }, [sessionId]);

  useEffect(() => {
    if (!sessionId || view?.status === 'ended') return;
    refresh();
    const t = window.setInterval(refresh, POLL_MS);
    return () => window.clearInterval(t);
  }, [sessionId, view?.status, refresh]);

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 250);
    return () => window.clearInterval(t);
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError('');
    try {
      await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Có lỗi, con thử lại nhé.');
    } finally {
      setBusy(false);
    }
  };

  // ------------------------------------------------ 1. student login
  if (!hasToken) {
    return (
      <Shell>
        <Card className="space-y-4 text-center">
          <MimoMascot size={110} eager className="mx-auto" />
          <h1 className="font-display text-2xl font-extrabold text-[#1E3A8A]">Con nhập mã học sinh nhé</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                await loginWithStudentCode(studentCode);
                setHasToken(true);
              });
            }}
            className="space-y-3"
          >
            <input
              value={studentCode}
              onChange={(e) => setStudentCode(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
              aria-label="Mã học sinh"
              placeholder="VD: MIMO03"
              className="w-full rounded-2xl border-2 border-[#DCE7F3] px-4 py-3 text-center font-display text-2xl font-extrabold tracking-[0.2em] text-[#1E3A8A] focus:border-[#2563EB] focus:outline-none"
            />
            <button type="submit" disabled={busy || studentCode.length !== 6} className="studio-btn studio-btn-primary min-h-[52px] w-full text-lg">
              <LogIn className="h-5 w-5" /> Đăng nhập
            </button>
          </form>
          {error && <p className="text-sm font-bold text-[#D93B5B]">{error}</p>}
        </Card>
      </Shell>
    );
  }

  // ------------------------------------------------ 2. room code
  if (!sessionId) {
    return (
      <Shell>
        <Card className="space-y-4 text-center">
          <MimoMascot size={110} eager className="mx-auto" />
          <h1 className="font-display text-2xl font-extrabold text-[#1E3A8A]">Nhập mã phòng trên bảng</h1>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              run(async () => {
                const { sessionId: id } = await joinLiveQuiz(input);
                writeSession(id);
                setView(null);
                setSessionId(id);
              });
            }}
            className="space-y-3"
          >
            <input
              value={input}
              onChange={(e) => setInput(e.target.value.toUpperCase())}
              maxLength={6}
              autoComplete="off"
              aria-label="Mã phòng"
              placeholder="ABC123"
              className="w-full rounded-2xl border-2 border-[#DCE7F3] px-4 py-3 text-center font-display text-3xl font-extrabold tracking-[0.25em] text-[#1E3A8A] focus:border-[#2563EB] focus:outline-none"
            />
            <button type="submit" disabled={busy || input.trim().length !== 6} className="studio-btn studio-btn-accent min-h-[52px] w-full text-lg">
              Vào phòng
            </button>
          </form>
          {error && <p className="text-sm font-bold text-[#D93B5B]">{error}</p>}
        </Card>
      </Shell>
    );
  }

  if (!view) {
    return (
      <Shell>
        <Card className="text-center text-[#5E6C84]">{error || 'Đang vào phòng…'}</Card>
      </Shell>
    );
  }

  const left = view.questionEndsAt !== null ? Math.max(0, Math.ceil((view.questionEndsAt - (now + offset)) / 1000)) : null;
  const header = (
    <div className="flex items-center justify-between text-white">
      <span className="font-bold">Xin chào {view.name}!</span>
      <span className="rounded-full bg-white/15 px-3 py-1 text-sm font-bold">Điểm: {view.myScore}</span>
    </div>
  );

  // ------------------------------------------------ lobby
  if (view.status === 'lobby') {
    return (
      <Shell>
        {header}
        <Card className="space-y-3 text-center">
          <MimoMascot size={120} eager className="mx-auto mimo-float" />
          <h2 className="font-display text-2xl font-extrabold text-[#1E3A8A]">Con đã vào phòng!</h2>
          <p className="text-[#5E6C84]">Chờ thầy cô bắt đầu câu hỏi đầu tiên nhé.</p>
        </Card>
      </Shell>
    );
  }

  // ------------------------------------------------ ended
  if (view.status === 'ended') {
    return (
      <Shell>
        <Card className="space-y-3 text-center">
          <MimoMascot size={130} eager className="mx-auto" />
          <h2 className="font-display text-3xl font-extrabold text-[#1E3A8A]">Hoàn thành Quiz!</h2>
          <p className="font-display text-5xl font-extrabold text-[#2563EB]">
            {view.myScore}/{view.total}
          </p>
          <p className="text-[#5E6C84]">câu trả lời đúng. Giỏi lắm, {view.name}!</p>
          <button
            type="button"
            onClick={() => {
              writeSession(null);
              setSessionId(null);
              setView(null);
              setInput('');
            }}
            className="studio-btn studio-btn-secondary min-h-[48px] w-full"
          >
            Vào phòng khác
          </button>
        </Card>
      </Shell>
    );
  }

  // ------------------------------------------------ question / closed
  const q = view.question!;
  const open = view.status === 'question';
  const answered = view.myAnswer !== null;
  const timeUp = open && left === 0;
  const canAnswer = open && !answered && !timeUp;

  return (
    <Shell>
      {header}
      <Card className="space-y-4">
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-[#1E3A8A] px-3 py-1 text-sm font-extrabold text-white">
            Câu {view.index + 1}/{view.total}
          </span>
          {q.multi && <span className="rounded-full bg-[#F1ECFF] px-3 py-1 text-xs font-bold text-[#6A4BE6]">Chọn tất cả đáp án đúng</span>}
          {open && left !== null && (
            <span data-testid="student-timer" className={`ml-auto font-display text-2xl font-extrabold ${left <= 5 ? 'text-[#E5484D]' : 'text-[#1E3A8A]'}`}>
              {left}s
            </span>
          )}
        </div>
        <RichContentRenderer content={q.prompt} inheritSize className="text-xl font-semibold text-[#1E3A8A]" />
        <div className="grid gap-2.5">
          {q.options.map((opt, i) => {
            const mine = (view.myAnswer ?? picked).includes(i);
            const right = view.correct?.includes(i);
            return (
              <button
                key={i}
                type="button"
                disabled={!canAnswer}
                aria-pressed={mine}
                onClick={() => setPicked((p) => (q.multi ? (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]) : [i]))}
                className={`flex min-h-[64px] items-center gap-3 rounded-2xl px-3 text-left text-lg text-white transition ${TILE[i].bg} ${
                  mine ? 'ring-4 ring-[#1E3A8A] ring-offset-2' : ''
                } ${!open && !right ? 'opacity-40' : ''} ${!canAnswer ? 'cursor-default' : 'active:scale-[0.98]'}`}
              >
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/25 font-display text-xl font-extrabold">
                  {mine ? <Check className="h-6 w-6" strokeWidth={3} /> : LETTERS[i]}
                </span>
                <RichContentRenderer content={opt} inheritSize className="font-bold [&_*]:!text-white" />
                {!open && right && <Check className="ml-auto h-7 w-7 shrink-0" strokeWidth={3} />}
              </button>
            );
          })}
        </div>

        {canAnswer && (
          <button
            type="button"
            disabled={busy || picked.length === 0}
            onClick={() =>
              run(async () => {
                await answerLiveQuestion(view.sessionId, view.index, picked);
                await refresh();
              })
            }
            className="studio-btn studio-btn-accent min-h-[56px] w-full text-lg"
          >
            <Send className="h-5 w-5" /> Gửi đáp án
          </button>
        )}
        {open && answered && (
          <p className="rounded-2xl bg-[#EAF5FF] p-3 text-center font-bold text-[#2563EB]">
            Đã gửi đáp án {view.myAnswer!.map((c) => LETTERS[c]).join(', ')}! Chờ thầy cô hiện kết quả nhé.
          </p>
        )}
        {timeUp && !answered && <p className="rounded-2xl bg-[#FFEDF1] p-3 text-center font-bold text-[#D93B5B]">Hết giờ rồi!</p>}
        {!open && (
          <p
            data-testid="student-result"
            className={`mimo-pop rounded-2xl p-3 text-center font-display text-xl font-extrabold ${
              view.myResult ? 'bg-[#E7F7F0] text-[#1F9D6B]' : 'bg-[#FFEDF1] text-[#D93B5B]'
            }`}
          >
            {view.myResult === true
              ? 'Đúng rồi! Giỏi quá! 🎉'
              : view.myResult === false
                ? `Chưa đúng. Đáp án đúng: ${view.correct?.map((c) => LETTERS[c]).join(', ')}`
                : `Con chưa trả lời câu này. Đáp án: ${view.correct?.map((c) => LETTERS[c]).join(', ')}`}
          </p>
        )}
        {error && <p className="text-center text-sm font-bold text-[#D93B5B]">{error}</p>}
      </Card>
    </Shell>
  );
};
