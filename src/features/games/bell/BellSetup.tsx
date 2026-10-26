import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowLeft, Bell, ChevronDown, FileUp, ListChecks, Loader2, Smartphone, Trophy, Users } from 'lucide-react';
import { useAppContext } from '../../../app/providers';
import {
  DataTable,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  STUDIO_INPUT,
  STUDIO_LABEL,
  StatusBadge,
  TD,
  TH,
  THEAD,
  TR,
} from '../../../components/studio/StudioUi';
import { mediaStoreEnabled, storeInlineImages } from '../../../services/mediaService';
import { reserveHomeworkRef, saveHomework } from '../../../services/firestoreRepository';
import { createBellGame, listBellGames } from '../../../services/bellGameService';
import type { Homework, HomeworkQuestion } from '../../../types/domain';
import { normalizeGrade } from '../../../utils/grade';
import {
  ACCEPT_ATTR,
  ACCEPTED_TYPES,
  extractHomework,
  prepareFile,
  resolveMimeType,
  type ExtractedHomework,
  type PendingFile,
  type SourceFile,
} from '../../homework/AIImportModal';
import { homeworkPath, NEW_HOMEWORK, withSaveTimeout } from '../../homework/homeworkFlow';
import { MAX_BELL_QUESTIONS, MAX_PLAYERS, type BellMode, type BellSummary } from './bellEngine';
import { bellQuestionsOf } from './bellQuestions';
import { BellRosterPicker, keepRoster, loadRoster, rosterPlayers, type Roster } from './BellRoster';
import { BellAnswerFix, needsAnswer } from './BellAnswerFix';

const SECONDS = [10, 15, 20, 30, 45, 60, 90];
const fmtDate = (t: number) => new Date(t).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' });
const NO_QUESTIONS: HomeworkQuestion[] = [];
export const BELL_PATH = '/admin/homework/game/rung-chuong-vang';

/** A recognised exam waiting for the teacher's answers before it is saved. */
interface NewExam {
  data: ExtractedHomework;
  solved: boolean;
  questions: HomeworkQuestion[];
  sources: SourceFile[];
}

const Step: React.FC<{ n: number; title: string; children: React.ReactNode }> = ({ n, title, children }) => (
  <div className="flex gap-3">
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[#FFD34E] font-display text-base font-extrabold text-[#5A3A00]">{n}</span>
    <div className="min-w-0 flex-1 space-y-2">
      <h2 className="font-display text-base font-extrabold text-[#172B4D]">{title}</h2>
      {children}
    </div>
  </div>
);

const tab = (on: boolean) =>
  `flex-1 rounded-xl px-3 py-2 text-sm font-extrabold transition ${on ? 'bg-white text-[#172B4D] shadow' : 'text-[#5E6C84] hover:text-[#172B4D]'}`;

/** Rung chuông vàng setup: choose a homework, choose how to play, start. */
export const BellSetup: React.FC<{ preselect: string }> = ({ preselect }) => {
  const { homeworkList, adminDataLoading } = useAppContext();
  const [roster, setRosterState] = useState<Roster | null>(loadRoster);
  const setRoster = (r: Roster | null) => {
    setRosterState(r);
    keepRoster(r);
  };
  const navigate = useNavigate();
  const [source, setSource] = useState<'saved' | 'new'>('saved');
  const [homeworkId, setHomeworkId] = useState(preselect);
  const [mode, setMode] = useState<BellMode>('online');
  const [seconds, setSeconds] = useState(20);
  const [count, setCount] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [reading, setReading] = useState<number | null>(null);
  const [readError, setReadError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);
  const [newExam, setNewExam] = useState<NewExam | null>(null);
  const [fixing, setFixing] = useState(false);
  const [reviewNew, setReviewNew] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState('');
  const [saved, setSaved] = useState<BellSummary[] | null>(null);
  const [savedError, setSavedError] = useState('');

  // Every homework with questions, drafts included; the playable count is worked out here
  const all = useMemo(
    () =>
      homeworkList
        .filter((hw) => hw.questions.length > 0)
        .map((hw) => ({ hw, usable: bellQuestionsOf(hw.questions).usable, toFix: hw.questions.filter(needsAnswer).length })),
    [homeworkList]
  );
  const chosen = all.find((o) => o.hw.id === homeworkId) ?? null;
  const max = Math.min(MAX_BELL_QUESTIONS, chosen?.usable.length ?? 0);
  const players = rosterPlayers(roster);

  useEffect(() => {
    if (!homeworkId && all.length) setHomeworkId((all.find((o) => o.usable.length > 0) ?? all[0]).hw.id);
  }, [homeworkId, all]);
  // All playable questions by default (the game takes at most 30)
  useEffect(() => setCount(max), [max, homeworkId]);
  const loadSaved = useCallback(() => {
    setSavedError('');
    listBellGames()
      .then(setSaved)
      .catch((e: Error) => setSavedError(e.message));
  }, []);
  useEffect(loadSaved, [loadSaved]);

  useEffect(() => {
    if (reading === null) return;
    const t = window.setInterval(() => setReading((s) => (s === null ? s : s + 1)), 1000);
    return () => window.clearInterval(t);
  }, [reading === null]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Picture, PDF or Word file → AI reads it (and proposes answers) → the answer check opens. */
  const readExam = async (picked: File[]) => {
    setReadError('');
    const ok = picked.filter((f) => ACCEPTED_TYPES.includes(resolveMimeType(f)));
    if (!ok.length) {
      setReadError('Chọn ảnh, PDF hoặc tệp Word (.docx).');
      return;
    }
    setReading(0);
    let pages: PendingFile[] = [];
    try {
      pages = (await Promise.all(ok.map(prepareFile))).flat();
      if (pages.length > 20) throw new Error('Đề quá dài (tối đa 20 trang).');
      if (pages.reduce((n, p) => n + p.base64.length, 0) > 4_200_000) throw new Error('Đề quá lớn. Hãy bớt trang hoặc chọn tệp nhỏ hơn.');
      const { data } = await extractHomework(pages, true);
      onExtracted(data, true, pages.map(({ id, name, mimeType, objectUrl }) => ({ id, name, mimeType, objectUrl })));
    } catch (e) {
      pages.forEach((p) => URL.revokeObjectURL(p.objectUrl));
      setReadError(e instanceof Error ? e.message : String(e));
    } finally {
      setReading(null);
    }
  };
  const pickFile = () => {
    if (fileInput.current) fileInput.current.value = '';
    fileInput.current?.click();
  };

  const onExtracted = (data: ExtractedHomework, solved: boolean, sources: SourceFile[]) => {
    setSaveError('');
    const questions = (data.questions ?? []).map((q, i) => ({ ...q, order: q.order || i + 1 }));
    newExam?.sources.forEach((s) => URL.revokeObjectURL(s.objectUrl));
    setNewExam({ data, solved, questions, sources });
    setReviewNew(true);
  };

  /** Saves the confirmed answers: into the chosen homework, or a recognised exam as a new draft. */
  const saveAnswers = async (questions: HomeworkQuestion[]) => {
    setSaving(true);
    setSaveError('');
    try {
      if (newExam && reviewNew) {
        const ref = reserveHomeworkRef();
        const stored = mediaStoreEnabled ? (await withSaveTimeout(storeInlineImages(ref.id, questions), 120_000)).questions : questions;
        await withSaveTimeout(
          saveHomework(
            {
              title: newExam.data.title || 'Đề Rung chuông vàng',
              description: newExam.data.description || '',
              subject: 'Toán',
              grade: normalizeGrade(newExam.data.grade),
              questions: stored,
              answerSource: newExam.solved ? 'ai' : 'teacher',
              aiSolverEnabled: newExam.solved,
              totalPoints: 0,
              status: 'draft',
            },
            ref
          )
        );
        newExam.sources.forEach((s) => URL.revokeObjectURL(s.objectUrl));
        setNewExam(null);
        setReviewNew(false);
        setHomeworkId(ref.id);
        setSource('saved');
      } else if (chosen) {
        const { id, createdAt, updatedAt: _u, ...rest }: Homework = chosen.hw;
        await withSaveTimeout(saveHomework({ ...rest, questions }, { id, createdAt }));
        setFixing(false);
      }
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setSaving(false);
    }
  };

  const start = async () => {
    if (!chosen) return;
    setBusy(true);
    setError('');
    try {
      const view = await createBellGame({
        title: chosen.hw.title,
        homeworkId: chosen.hw.id,
        mode,
        perQuestionSec: seconds,
        questions: chosen.usable.slice(0, Math.max(1, count)),
        players: mode === 'offline' ? players : [],
        roster: mode === 'online' ? players : [],
      });
      navigate(`${BELL_PATH}?game=${view.id}`);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const playersReady = players.length <= MAX_PLAYERS && (mode === 'online' || players.length > 0);
  const canStart = source === 'saved' && Boolean(chosen) && max > 0 && playersReady;
  const blocker =
    source === 'new'
      ? 'Tải đề lên trước.'
      : !chosen
        ? 'Chọn một đề.'
        : max === 0
          ? 'Bấm “Xác nhận đáp án”.'
          : !playersReady
            ? players.length > MAX_PLAYERS
              ? `Tối đa ${MAX_PLAYERS} học sinh.`
              : 'Chọn lớp hoặc tải danh sách học sinh.'
            : '';

  return (
    <div className="studio-skin mx-auto max-w-3xl space-y-5">
      <PageHeader
        icon={Bell}
        tone="yellow"
        eyebrow={
          <Link to="/admin/homework/game" className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" /> Soạn bài tập Game
          </Link>
        }
        title="Rung chuông vàng"
      />

      <section className="studio-card space-y-6 p-5" data-testid="bell-setup">
        <Step n={1} title="Chọn đề">
          <div className="flex gap-1 rounded-2xl bg-[#EEF3F9] p-1" role="tablist">
            <button type="button" role="tab" aria-selected={source === 'saved'} className={tab(source === 'saved')} onClick={() => setSource('saved')}>
              Đề đã lưu
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={source === 'new'}
              className={tab(source === 'new')}
              onClick={() => {
                setSource('new');
                if (!newExam && reading === null) pickFile();
              }}
            >
              Tải đề mới
            </button>
          </div>

          {source === 'saved' ? (
            adminDataLoading && !homeworkList.length ? (
              <LoadingState rows={1} label="Đang tải đề…" />
            ) : all.length === 0 ? (
              <p className="text-sm text-[#5E6C84]">Chưa có đề. Bấm <b>Tải đề mới</b>.</p>
            ) : (
              <>
                <select id="bell-homework" aria-label="Đề đã lưu" className={STUDIO_INPUT} value={homeworkId} onChange={(e) => setHomeworkId(e.target.value)}>
                  {all.map((o) => (
                    <option key={o.hw.id} value={o.hw.id}>
                      {o.hw.title}
                      {o.hw.status === 'draft' ? ' (nháp)' : ''} – {o.usable.length} câu chơi được
                    </option>
                  ))}
                </select>
                {chosen && (
                  <div className="flex flex-wrap items-center gap-2 text-sm" data-testid="bell-chosen">
                    <span className={`font-bold ${max ? 'text-[#1F9D6B]' : 'text-[#5E6C84]'}`}>✓ {chosen.usable.length} câu chơi được</span>
                    {chosen.toFix > 0 && (
                      <>
                        <span className="text-[#5E6C84]">· {chosen.toFix} câu cần xác nhận đáp án</span>
                        <button type="button" onClick={() => { setSaveError(''); setFixing(true); }} className="studio-btn studio-btn-secondary">
                          <ListChecks className="h-4 w-4" /> Xác nhận đáp án
                        </button>
                      </>
                    )}
                  </div>
                )}
              </>
            )
          ) : (
            <div className="space-y-2">
              <input ref={fileInput} type="file" multiple hidden accept={ACCEPT_ATTR} data-testid="bell-file" onChange={(e) => void readExam(Array.from(e.target.files ?? []))} />
              {reading !== null ? (
                <div role="status" className="flex items-center justify-center gap-2 rounded-2xl bg-[#F6FAFF] p-5 font-bold text-[#2563EB]">
                  <Loader2 className="h-5 w-5 animate-spin" /> AI đang đọc đề… {reading} giây
                </div>
              ) : newExam ? (
                <button type="button" onClick={() => setReviewNew(true)} className="studio-btn studio-btn-secondary w-full justify-center">
                  <ListChecks className="h-4 w-4" /> Xác nhận đáp án “{newExam.data.title || 'đề vừa tải'}”
                </button>
              ) : (
                <button
                  type="button"
                  onClick={pickFile}
                  className="flex w-full flex-col items-center gap-1 rounded-2xl border-2 border-dashed border-[#9CC0F5] bg-[#F6FAFF] p-5 text-[#2563EB] hover:bg-[#EFF6FF]"
                >
                  <FileUp className="h-7 w-7" />
                  <span className="font-extrabold">Chọn tệp đề</span>
                  <span className="text-xs text-[#5E6C84]">Ảnh, PDF hoặc Word</span>
                </button>
              )}
              {readError && <ErrorState message={readError} />}
            </div>
          )}
        </Step>

        <Step n={2} title="Chọn cách chơi">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            {[
              { v: 'online' as const, icon: Smartphone, t: 'Online – điện thoại' },
              { v: 'offline' as const, icon: Users, t: 'Offline – bảng con' },
            ].map((m) => (
              <label key={m.v} className={`flex cursor-pointer items-center gap-3 rounded-2xl border-2 p-3 ${mode === m.v ? 'border-[#2563EB] bg-[#EFF6FF]' : 'border-[#DCE7F3]'}`}>
                <input type="radio" name="bell-mode" checked={mode === m.v} onChange={() => setMode(m.v)} />
                <m.icon className="h-5 w-5 shrink-0 text-[#2563EB]" />
                <span className="text-sm font-extrabold text-[#172B4D]">{m.t}</span>
              </label>
            ))}
          </div>
          <BellRosterPicker roster={roster} onChange={setRoster} optional={mode === 'online'} />
        </Step>

        <Step n={3} title="Thời gian mỗi câu">
          <select id="bell-seconds" aria-label="Thời gian mỗi câu" className={`${STUDIO_INPUT} max-w-[200px]`} value={seconds} onChange={(e) => setSeconds(Number(e.target.value))}>
            {SECONDS.map((s) => (
              <option key={s} value={s}>{s} giây</option>
            ))}
          </select>
        </Step>

        {error && <ErrorState message={error} />}
        <div className="space-y-1">
          <button
            type="button"
            disabled={!canStart || busy}
            onClick={() => void start()}
            className="flex w-full items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-[#FFE27A] to-[#FFC61A] px-5 py-4 font-display text-lg font-extrabold text-[#5A3A00] shadow-[0_6px_0_#D9A400] transition active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Bell className="h-6 w-6" />
            {busy ? 'Đang chuẩn bị sân…' : 'Bắt đầu Rung chuông vàng'}
          </button>
          <p className="text-center text-xs text-[#5E6C84]" data-testid="bell-start-note">
            {blocker || `${Math.min(count, max)} câu${players.length ? ` · ${players.length} học sinh` : ''}`}
          </p>
        </div>

        <details className="rounded-2xl border border-[#DCE7F3] px-4 py-2">
          <summary className="flex cursor-pointer items-center gap-1 text-sm font-bold text-[#3B4A66]">
            <ChevronDown className="h-4 w-4" /> Tùy chọn thêm
          </summary>
          <div className="mt-2 grid grid-cols-1 gap-2 pb-2 sm:grid-cols-2">
            <div>
              <label className={STUDIO_LABEL} htmlFor="bell-count">Số câu (tối đa {max || '–'})</label>
              <input id="bell-count" type="number" min={1} max={max || 1} className={STUDIO_INPUT} value={count} onChange={(e) => setCount(Math.min(max, Math.max(1, Number(e.target.value) || 1)))} />
            </div>
            <div className="flex items-end gap-2 text-sm">
              <Link to={homeworkPath('game', NEW_HOMEWORK)} className="font-bold text-[#2563EB] hover:underline">Soạn đề bằng tay</Link>
              {chosen && (
                <>
                  <span className="text-[#C1CCDA]">·</span>
                  <Link to={homeworkPath('game', chosen.hw.id)} className="font-bold text-[#2563EB] hover:underline">Mở đề trong trình soạn</Link>
                </>
              )}
            </div>
          </div>
        </details>

        <details className="rounded-2xl border border-[#DCE7F3] px-4 py-2" data-testid="bell-history">
          <summary className="flex cursor-pointer items-center gap-1 text-sm font-bold text-[#3B4A66]">
            <Trophy className="h-4 w-4" /> Kết quả đã lưu{saved ? ` (${saved.length})` : ''}
          </summary>
          <div className="mt-2 pb-2">
            {savedError ? (
              <ErrorState message={savedError} onRetry={loadSaved} />
            ) : saved === null ? (
              <LoadingState rows={2} />
            ) : saved.length === 0 ? (
              <EmptyState icon={Trophy} title="Chưa có trận nào" text="Kết quả mỗi trận được lưu khi kết thúc." />
            ) : (
              <DataTable minWidth={560}>
                <thead className={THEAD}>
                  <tr>
                    <th className={TH}>Trận</th>
                    <th className={TH}>Chế độ</th>
                    <th className={TH}>Người thắng</th>
                    <th className={TH}></th>
                  </tr>
                </thead>
                <tbody>
                  {saved.map((s) => (
                    <tr key={s.id} className={TR}>
                      <td className={TD}>
                        <div className="font-bold text-[#172B4D]">{s.title}</div>
                        <div className="text-xs text-[#5E6C84]">{fmtDate(s.createdAt)} · {s.players} bạn · đến câu {Math.max(0, s.reached)}/{s.questions}</div>
                      </td>
                      <td className={TD}>{s.mode === 'online' ? 'Điện thoại' : 'Bảng con'}</td>
                      <td className={TD}>{s.status === 'ended' ? s.winners.join(', ') || 'Không có' : <StatusBadge kind="warning">Đang diễn ra</StatusBadge>}</td>
                      <td className={TD}>
                        <Link to={`${BELL_PATH}?game=${s.id}`} className="font-bold text-[#2563EB] hover:underline">
                          {s.status === 'ended' ? 'Xem kết quả' : 'Mở lại sân'}
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            )}
          </div>
        </details>
      </section>

      <BellAnswerFix
        open={reviewNew || fixing}
        title={reviewNew ? 'Xác nhận đáp án đề mới' : 'Xác nhận đáp án'}
        questions={reviewNew && newExam ? newExam.questions : chosen?.hw.questions ?? NO_QUESTIONS}
        saveLabel={reviewNew ? 'Lưu đề và chọn' : 'Lưu đáp án'}
        busy={saving}
        error={saveError}
        // A recognised exam is kept: the teacher can come back to it from "Tải đề mới"
        onClose={() => {
          setReviewNew(false);
          setFixing(false);
        }}
        onSave={(qs) => void saveAnswers(qs)}
      />
    </div>
  );
};
