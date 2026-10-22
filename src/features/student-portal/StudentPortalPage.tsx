import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  ArrowLeft,
  BookOpen,
  Check,
  CheckCircle2,
  Clock,
  Copy,
  ExternalLink,
  Gamepad2,
  Home,
  KeyRound,
  LogOut,
  MessageSquareHeart,
  RefreshCw,
  Save,
  Send,
  ShieldAlert,
  User,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { MathRichEditor } from '../../components/editor/MathRichEditor';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { GamePortalBannerIllustration } from '../../components/ui/CartoonIllustrations';
import {
  fetchStudentPortalData,
  loginWithStudentCode,
  StudentPortalBundle,
  submitStudentHomework,
} from '../../services/studentPortalService';
import {
  GameCategory,
  HomeworkQuestion,
  MathGame,
  StudentQuestionAnswer,
} from '../../types/domain';
import { createRichTextFromPlain } from '../../utils/gradingEngine';

type PortalTab = 'overview' | 'homework' | 'comments' | 'games' | 'profile';

export const StudentPortalPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    hasStudentSession,
    refreshStudentSessionState,
    logoutStudentPortal,
  } = useAppContext();

  const [activeTab, setActiveTab] = useState<PortalTab>('overview');
  const [bundle, setBundle] = useState<StudentPortalBundle | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login gate state when not authenticated
  const [codeInput, setCodeInput] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);

  // Homework filter & active exam state
  const [hwFilter, setHwFilter] = useState<'all' | 'pending' | 'completed'>(
    'all'
  );
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(
    null
  );
  const [answersMap, setAnswersMap] = useState<
    Record<string, StudentQuestionAnswer>
  >({});
  const [savingDraft, setSavingDraft] = useState(false);
  const [submittingExam, setSubmittingExam] = useState(false);
  const [lastSavedText, setLastSavedText] = useState<string | null>(null);
  const [confirmSubmitModal, setConfirmSubmitModal] = useState(false);
  const [examFeedbackBanner, setExamFeedbackBanner] = useState<string | null>(
    null
  );

  // Games filter & active game state
  const [selectedCategory, setSelectedCategory] = useState<
    'all' | GameCategory
  >('all');
  const [playingGame, setPlayingGame] = useState<MathGame | null>(null);

  // Profile code copy state
  const [copiedMyCode, setCopiedMyCode] = useState(false);

  const loadPortalData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchStudentPortalData();
      setBundle(data);
    } catch (err) {
      if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
        refreshStudentSessionState();
        setBundle(null);
      } else {
        setError(
          err instanceof Error
            ? err.message
            : 'Không thể tải dữ liệu cổng học sinh.'
        );
      }
    } finally {
      setLoading(false);
    }
  }, [refreshStudentSessionState]);

  useEffect(() => {
    if (hasStudentSession) {
      loadPortalData();
    } else {
      setBundle(null);
    }
  }, [hasStudentSession, loadPortalData]);

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    const clean = codeInput.trim().toUpperCase();
    if (clean.length !== 6) {
      setLoginError('Mã truy cập học sinh phải gồm đúng 6 ký tự.');
      return;
    }

    setLoginLoading(true);
    try {
      await loginWithStudentCode(clean);
      refreshStudentSessionState();
    } catch (err) {
      setLoginError(
        err instanceof Error ? err.message : 'Đăng nhập không thành công.'
      );
    } finally {
      setLoginLoading(false);
    }
  };

  const handleExitPortal = () => {
    logoutStudentPortal();
    setBundle(null);
    navigate('/');
  };

  const openAssignmentWorkspace = (assignmentId: string) => {
    if (!bundle) return;
    const asg = bundle.assignmentsMap[assignmentId];
    if (!asg) return;

    const existingSub = bundle.submissionsMap[assignmentId];
    const initialMap: Record<string, StudentQuestionAnswer> = {};
    for (const q of asg.publicQuestionsSnapshot || []) {
      const found = existingSub?.answers?.find((a) => a.questionId === q.id);
      if (found) {
        initialMap[q.id] = found;
      } else {
        initialMap[q.id] = {
          questionId: q.id,
          type: q.type,
          ...(q.type === 'essay'
            ? { essayContent: createRichTextFromPlain('') }
            : {}),
        };
      }
    }

    setAnswersMap(initialMap);
    setLastSavedText(
      existingSub?.updatedAt
        ? `Đã lưu lúc ${new Date(existingSub.updatedAt).toLocaleTimeString('vi-VN')}`
        : null
    );
    setExamFeedbackBanner(null);
    setActiveAssignmentId(assignmentId);
    setActiveTab('homework');
  };

  const updateQuestionAnswer = (
    q: HomeworkQuestion,
    patch: Partial<StudentQuestionAnswer>
  ) => {
    setAnswersMap((prev) => ({
      ...prev,
      [q.id]: {
        ...(prev[q.id] || { questionId: q.id, type: q.type }),
        ...patch,
      },
    }));
  };

  const handleSaveOrSubmit = async (isFinalSubmit: boolean) => {
    if (!activeAssignmentId) return;
    setExamFeedbackBanner(null);
    if (isFinalSubmit) {
      setSubmittingExam(true);
    } else {
      setSavingDraft(true);
    }

    try {
      const answersArray = Object.values(answersMap);
      const res = await submitStudentHomework({
        assignmentId: activeAssignmentId,
        answers: answersArray,
        isFinalSubmit,
      });

      if (isFinalSubmit) {
        setConfirmSubmitModal(false);
        setExamFeedbackBanner(
          res.status === 'graded'
            ? `Nộp bài thành công! Hệ thống đã chấm tự động: ${res.totalScore}/${res.maxScore} điểm.`
            : 'Nộp bài thành công! Bài tập của con đã được gửi tới thầy/cô để chấm câu tự luận.'
        );
        await loadPortalData();
      } else {
        setLastSavedText(
          `Đã lưu nháp lúc ${new Date().toLocaleTimeString('vi-VN')}`
        );
      }
    } catch (err) {
      setExamFeedbackBanner(
        err instanceof Error
          ? err.message
          : 'Không thể lưu bài lúc này. Vui lòng kiểm tra kết nối mạng và thử lại.'
      );
    } finally {
      setSavingDraft(false);
      setSubmittingExam(false);
    }
  };

  // ==========================================================================
  // VIEW 1: 6-CHARACTER CODE LOGIN GATE
  // ==========================================================================
  if (!hasStudentSession) {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center bg-[#FFFDF7] p-4">
        <div className="cartoon-card w-full max-w-md bg-white p-6 sm:p-8">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/')}
              className="flex items-center gap-1.5 text-xs font-bold text-slate-600 hover:text-slate-900"
            >
              <ArrowLeft className="h-4 w-4" />
              Trang chủ
            </button>
            <span className="font-display text-xs font-extrabold text-blue-700">
              LỚP CHÚNG TÔI
            </span>
          </div>

          <div className="mt-6 text-center">
            <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-2xl border-2 border-slate-900 bg-amber-300 shadow-[0_3px_0_0_#1E293B]">
              <KeyRound className="h-8 w-8 text-slate-900" />
            </div>
            <h1 className="mt-4 font-display text-2xl font-extrabold text-slate-900">
              Cổng Phụ Huynh & Học Sinh
            </h1>
            <p className="mt-1.5 text-sm text-slate-600">
              Nhập mã truy cập 6 ký tự của học sinh để xem bài tập về nhà, kết
              quả học tập và kho trò chơi Toán học.
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
            <div>
              <label className="mb-1.5 block text-center text-xs font-extrabold text-slate-700">
                MÃ HỌC SINH (6 KÝ TỰ CHỮ & SỐ)
              </label>
              <input
                type="text"
                maxLength={6}
                value={codeInput}
                onChange={(e) =>
                  setCodeInput(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  )
                }
                placeholder="8K9P2A"
                className="w-full rounded-2xl border-2 border-slate-900 bg-amber-50/50 py-3.5 text-center font-mono text-2xl font-black tracking-[0.35em] text-slate-900 uppercase focus:bg-white focus:outline-none"
              />
            </div>

            {loginError && (
              <div className="rounded-xl border-2 border-rose-800 bg-rose-50 p-3 text-center text-xs font-bold text-rose-800">
                {loginError}
              </div>
            )}

            <button
              type="submit"
              disabled={loginLoading}
              className="cartoon-button flex min-h-[48px] w-full items-center justify-center rounded-2xl bg-blue-600 px-6 py-3 font-display text-base font-extrabold text-white"
            >
              {loginLoading ? 'Đang kiểm tra mã...' : 'Vào Góc Học Tập'}
            </button>
          </form>

          <p className="mt-5 text-center text-xs text-slate-500">
            Nếu quên mã truy cập, phụ huynh vui lòng nhắn giáo viên phụ trách
            lớp để nhận lại mã.
          </p>
        </div>
      </div>
    );
  }

  // ==========================================================================
  // LOADING OR ERROR STATES
  // ==========================================================================
  if (loading && !bundle) {
    return (
      <div className="mx-auto max-w-5xl space-y-4 p-4">
        <div className="h-16 animate-pulse rounded-2xl border-2 border-slate-200 bg-white" />
        <div className="h-44 animate-pulse rounded-2xl border-2 border-slate-200 bg-white" />
        <div className="h-64 animate-pulse rounded-2xl border-2 border-slate-200 bg-white" />
      </div>
    );
  }

  if (error || !bundle) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <div className="cartoon-card max-w-md bg-white p-6 text-center">
          <AlertTriangle className="mx-auto h-10 w-10 text-amber-600" />
          <h2 className="mt-3 font-display text-lg font-extrabold text-slate-900">
            Không thể tải dữ liệu
          </h2>
          <p className="mt-1 text-xs text-slate-600">
            {error || 'Phiên làm việc đã gián đoạn.'}
          </p>
          <div className="mt-5 flex justify-center gap-3">
            <button
              type="button"
              onClick={loadPortalData}
              className="cartoon-button rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white"
            >
              Thử lại
            </button>
            <button
              type="button"
              onClick={handleExitPortal}
              className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-800"
            >
              Thoát cổng
            </button>
          </div>
        </div>
      </div>
    );
  }

  const {
    student,
    classes,
    studentAssignments,
    assignmentsMap,
    submissionsMap,
    comments,
    games,
  } = bundle;

  const pendingAssignments = studentAssignments.filter(
    (sa) =>
      sa.status === 'assigned' ||
      sa.status === 'in_progress' ||
      sa.status === 'returned'
  );
  const publishedScoreList = studentAssignments.filter(
    (sa) => sa.status === 'graded' && sa.isScorePublished
  );

  // ==========================================================================
  // ACTIVE HOMEWORK EXAM / RESULT VIEW
  // ==========================================================================
  const currentExamAssignment = activeAssignmentId
    ? assignmentsMap[activeAssignmentId]
    : null;
  const currentStudentAssignment = activeAssignmentId
    ? studentAssignments.find((sa) => sa.assignmentId === activeAssignmentId)
    : null;
  const currentSubmission = activeAssignmentId
    ? submissionsMap[activeAssignmentId]
    : null;

  const isReadOnlyExam =
    currentStudentAssignment?.status === 'submitted' ||
    currentStudentAssignment?.status === 'graded';

  return (
    <div className="min-h-screen bg-[#FFFDF7] pb-24 text-slate-900">
      {/* Compact Sticky Top App Bar (<= 56px height to respect 15% mobile sticky cap) */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b-2 border-slate-900 bg-amber-100/95 px-4 backdrop-blur-xs">
        <div className="flex items-center gap-2.5 truncate">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border-2 border-slate-900 bg-white font-display text-sm font-black text-blue-600">
            {student.fullName.slice(0, 1).toUpperCase()}
          </div>
          <div className="truncate">
            <div className="truncate font-display text-sm font-extrabold text-slate-900">
              {student.fullName}
            </div>
            <div className="font-mono text-[11px] font-bold text-slate-600">
              {student.grade} · Mã: {student.accessCode}
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={loadPortalData}
            className="flex min-h-[40px] min-w-[40px] items-center justify-center rounded-xl border-2 border-slate-900 bg-white text-slate-700 hover:bg-slate-50"
            title="Làm mới dữ liệu"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          <button
            type="button"
            onClick={handleExitPortal}
            className="cartoon-button flex min-h-[40px] items-center gap-1.5 rounded-xl bg-white px-3 py-1.5 text-xs font-extrabold text-rose-700 whitespace-nowrap"
          >
            <LogOut className="h-3.5 w-3.5" />
            Thoát
          </button>
        </div>
      </header>

      {/* Main Responsive Container (expands cleanly on desktop) */}
      <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
        {/* Desktop Tab Pills for large screens */}
        <div className="mb-6 hidden items-center justify-between rounded-2xl border-2 border-slate-900 bg-white p-2 md:flex">
          <div className="flex items-center gap-2">
            {(
              [
                { id: 'overview', label: 'Tổng quan', icon: Home },
                {
                  id: 'homework',
                  label: `Bài tập (${pendingAssignments.length})`,
                  icon: BookOpen,
                },
                { id: 'comments', label: 'Nhận xét', icon: MessageSquareHeart },
                { id: 'games', label: 'Trò chơi Toán', icon: Gamepad2 },
                { id: 'profile', label: 'Hồ sơ & Lớp học', icon: User },
              ] as const
            ).map((t) => {
              const Icon = t.icon;
              const isActive = activeTab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setActiveTab(t.id);
                    if (t.id !== 'homework') setActiveAssignmentId(null);
                  }}
                  className={`flex items-center gap-2 rounded-xl px-4 py-2 text-xs font-extrabold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'border-2 border-slate-900 bg-blue-600 text-white shadow-[0_2px_0_0_#1E293B]'
                      : 'text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  <span>{t.label}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* ================================================================ */}
        {/* TAB 1: TỔNG QUAN (OVERVIEW)                                      */}
        {/* ================================================================ */}
        {activeTab === 'overview' && (
          <div className="space-y-6">
            {/* Student Welcome Banner */}
            <div className="cartoon-card bg-gradient-to-r from-sky-100 via-white to-amber-100 p-5 sm:p-6">
              <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                <div>
                  <span className="text-xs font-extrabold text-blue-700">
                    GÓC HỌC TẬP TOÁN HỌC
                  </span>
                  <h1 className="mt-1 font-display text-2xl font-extrabold text-slate-900">
                    Chào {student.nickname || student.fullName}!
                  </h1>
                  <p className="mt-1 text-sm text-slate-700">
                    Lớp đang tham gia:{' '}
                    <strong>
                      {classes.map((c) => c.name).join(', ') || 'Chưa phân lớp'}
                    </strong>
                  </p>
                </div>

                <div className="grid grid-cols-2 gap-3 sm:w-auto">
                  <div className="rounded-2xl border-2 border-slate-900 bg-amber-300 px-4 py-2.5 text-center">
                    <div className="font-mono text-2xl font-black text-slate-900 tabular-nums">
                      {pendingAssignments.length}
                    </div>
                    <div className="text-[11px] font-bold text-slate-800">
                      BTVN cần làm
                    </div>
                  </div>
                  <div className="rounded-2xl border-2 border-slate-900 bg-emerald-300 px-4 py-2.5 text-center">
                    <div className="font-mono text-2xl font-black text-slate-900 tabular-nums">
                      {publishedScoreList.length}
                    </div>
                    <div className="text-[11px] font-bold text-slate-800">
                      Bài đã có điểm
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
              {/* Pending / Upcoming Homework */}
              <div className="cartoon-card bg-white p-5 lg:col-span-7">
                <div className="flex items-center justify-between">
                  <h2 className="font-display text-base font-extrabold text-slate-900">
                    Bài Tập Cần Hoàn Thành & Sắp Đến Hạn
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveTab('homework')}
                    className="text-xs font-bold text-blue-700 hover:underline"
                  >
                    Tất cả bài tập →
                  </button>
                </div>

                {pendingAssignments.length === 0 ? (
                  <div className="mt-5 rounded-2xl border border-dashed border-slate-300 bg-emerald-50/50 p-6 text-center">
                    <CheckCircle2 className="mx-auto h-7 w-7 text-emerald-600" />
                    <p className="mt-2 font-display text-sm font-bold text-slate-900">
                      Tuyệt vời! Con đã hoàn thành hết tất cả BTVN.
                    </p>
                  </div>
                ) : (
                  <div className="mt-4 space-y-3">
                    {pendingAssignments.map((sa) => {
                      const asg = assignmentsMap[sa.assignmentId];
                      if (!asg) return null;
                      return (
                        <div
                          key={sa.id}
                          className="flex flex-col justify-between gap-3 rounded-2xl border-2 border-slate-900 bg-amber-50/60 p-4 sm:flex-row sm:items-center"
                        >
                          <div>
                            <div className="text-xs font-bold text-amber-900">
                              {sa.status === 'returned'
                                ? 'Cần sửa lại theo nhận xét giáo viên'
                                : sa.status === 'in_progress'
                                ? 'Đang làm dở (Đã lưu nháp)'
                                : 'Bài tập mới chưa làm'}{' '}
                              · Hạn nộp:{' '}
                              <span className="font-mono">{asg.dueAt}</span>
                            </div>
                            <h3 className="mt-1 font-display text-base font-extrabold text-slate-900">
                              {asg.title}
                            </h3>
                          </div>
                          <button
                            type="button"
                            onClick={() =>
                              openAssignmentWorkspace(sa.assignmentId)
                            }
                            className="cartoon-button min-h-[44px] rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white whitespace-nowrap shrink-0"
                          >
                            Vào làm bài ngay
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {/* Recent Grades & Latest Teacher Comment */}
              <div className="space-y-6 lg:col-span-5">
                <div className="cartoon-card bg-white p-5">
                  <h2 className="font-display text-base font-extrabold text-slate-900">
                    Điểm Số Mới Công Bố
                  </h2>
                  {publishedScoreList.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Chưa có bài tập nào công bố điểm.
                    </p>
                  ) : (
                    <div className="mt-3 divide-y divide-slate-200">
                      {publishedScoreList.slice(0, 4).map((sa) => {
                        const asg = assignmentsMap[sa.assignmentId];
                        return (
                          <div
                            key={sa.id}
                            className="flex items-center justify-between py-2.5 text-xs"
                          >
                            <span className="font-bold text-slate-800">
                              {asg?.title || 'BTVN'}
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                openAssignmentWorkspace(sa.assignmentId)
                              }
                              className="font-mono text-sm font-black text-emerald-700 hover:underline"
                            >
                              {sa.score}/{sa.maxScore}đ →
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="cartoon-card bg-white p-5">
                  <div className="flex items-center justify-between">
                    <h2 className="font-display text-base font-extrabold text-slate-900">
                      Nhận Xét Mới Từ Giáo Viên
                    </h2>
                    <button
                      type="button"
                      onClick={() => setActiveTab('comments')}
                      className="text-xs font-bold text-blue-700 hover:underline"
                    >
                      Xem sổ nhận xét →
                    </button>
                  </div>
                  {comments.length === 0 ? (
                    <p className="mt-3 text-xs text-slate-500">
                      Chưa có nhận xét tháng nào được công bố.
                    </p>
                  ) : (
                    <div className="mt-3 rounded-xl border border-slate-200 bg-sky-50/70 p-3.5 text-xs">
                      <div className="font-mono font-bold text-blue-800">
                        Nhận xét Tháng {comments[0].month}/{comments[0].year}
                      </div>
                      <p className="mt-1.5 text-slate-800">
                        <strong>Điểm mạnh:</strong> {comments[0].strengths}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 2: BÀI TẬP & GIAO DIỆN LÀM BÀI                               */}
        {/* ================================================================ */}
        {activeTab === 'homework' && (
          <div>
            {currentExamAssignment && currentStudentAssignment ? (
              /* Active Exam Interface */
              <div className="mx-auto max-w-3xl space-y-5">
                <div className="cartoon-card flex flex-wrap items-center justify-between gap-3 bg-white p-4">
                  <button
                    type="button"
                    onClick={() => setActiveAssignmentId(null)}
                    className="cartoon-button flex min-h-[44px] items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-extrabold text-slate-800"
                  >
                    <ArrowLeft className="h-4 w-4" />
                    Quay lại danh sách
                  </button>

                  <div className="flex items-center gap-3">
                    {lastSavedText && !isReadOnlyExam && (
                      <span className="text-xs font-semibold text-slate-500">
                        {lastSavedText}
                      </span>
                    )}
                    {!isReadOnlyExam && (
                      <>
                        <button
                          type="button"
                          disabled={savingDraft}
                          onClick={() => handleSaveOrSubmit(false)}
                          className="cartoon-button flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-slate-900"
                        >
                          <Save className="h-4 w-4 text-blue-600" />
                          {savingDraft ? 'Đang lưu...' : 'Lưu nháp'}
                        </button>
                        <button
                          type="button"
                          disabled={submittingExam}
                          onClick={() => setConfirmSubmitModal(true)}
                          className="cartoon-button flex min-h-[44px] items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white"
                        >
                          <Send className="h-4 w-4" />
                          Nộp bài
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {examFeedbackBanner && (
                  <div className="cartoon-card bg-emerald-100 p-4 text-sm font-extrabold text-emerald-950">
                    {examFeedbackBanner}
                  </div>
                )}

                {/* Exam Info Header */}
                <div className="cartoon-card bg-amber-50 p-5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <span>Giao ngày: {currentExamAssignment.assignedAt}</span>
                    <span>·</span>
                    <span className="font-bold text-rose-700">
                      Hạn nộp: {currentExamAssignment.dueAt}
                    </span>
                    <span>·</span>
                    <span className="font-mono font-bold">
                      Tổng điểm: {currentExamAssignment.maxScore}đ
                    </span>
                  </div>
                  <h1 className="mt-2 font-display text-xl font-extrabold text-slate-900">
                    {currentExamAssignment.title}
                  </h1>
                  {currentExamAssignment.instructions && (
                    <p className="mt-1 text-sm text-slate-700">
                      {currentExamAssignment.instructions}
                    </p>
                  )}

                  {/* Published Score & Overall Comment if graded */}
                  {currentStudentAssignment.status === 'graded' &&
                    currentStudentAssignment.isScorePublished && (
                      <div className="mt-4 rounded-2xl border-2 border-slate-900 bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-display text-sm font-extrabold text-slate-900">
                            KẾT QUẢ CHẤM BÀI CHÍNH THỨC:
                          </span>
                          <span className="font-mono text-2xl font-black text-emerald-700">
                            {currentStudentAssignment.score} /{' '}
                            {currentStudentAssignment.maxScore} điểm
                          </span>
                        </div>
                        {currentSubmission?.teacherOverallComment && (
                          <p className="mt-2 border-t border-slate-200 pt-2 text-xs text-slate-700">
                            <strong>Nhận xét của Giáo viên:</strong>{' '}
                            {currentSubmission.teacherOverallComment}
                          </p>
                        )}
                      </div>
                    )}
                </div>

                {/* Questions List */}
                {(currentExamAssignment.publicQuestionsSnapshot || []).map(
                  (q, idx) => {
                    const currentAns = answersMap[q.id];
                    const qResult = currentSubmission?.questionResults?.find(
                      (r) => r.questionId === q.id
                    );
                    const keyQuestionWithSolution =
                      currentExamAssignment.gradingKeySnapshot?.find(
                        (kq) => kq.id === q.id
                      );

                    return (
                      <div key={q.id} className="cartoon-card bg-white p-5">
                        <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                          <span className="font-display text-sm font-extrabold text-blue-700">
                            Câu {idx + 1} ({q.points} điểm)
                          </span>
                          {qResult && (
                            <span className="font-mono text-xs font-black text-emerald-700">
                              Đạt: {qResult.score}/{qResult.maxScore}đ
                            </span>
                          )}
                        </div>

                        <RichContentRenderer content={q.prompt} />

                        {/* 1. Single Choice (Radio) */}
                        {q.type === 'single_choice' && (
                          <div className="mt-4 space-y-2.5">
                            {(q.options || []).map((opt) => {
                              const selected =
                                currentAns?.selectedOptionId === opt.id;
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2.5 transition-colors ${
                                    selected
                                      ? 'border-slate-900 bg-sky-100'
                                      : 'border-slate-300 bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="radio"
                                    name={`q_${q.id}`}
                                    disabled={isReadOnlyExam}
                                    checked={selected}
                                    onChange={() =>
                                      updateQuestionAnswer(q, {
                                        selectedOptionId: opt.id,
                                      })
                                    }
                                    className="h-5 w-5"
                                  />
                                  <span className="font-display text-sm font-extrabold text-slate-900">
                                    {opt.label}.
                                  </span>
                                  <div className="flex-1">
                                    <RichContentRenderer
                                      content={opt.content}
                                    />
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* 2. Multiple Choice (Checkbox) */}
                        {q.type === 'multiple_choice' && (
                          <div className="mt-4 space-y-2.5">
                            {(q.options || []).map((opt) => {
                              const selectedList =
                                currentAns?.selectedOptionIds || [];
                              const checked = selectedList.includes(opt.id);
                              return (
                                <label
                                  key={opt.id}
                                  className={`flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl border-2 px-4 py-2.5 transition-colors ${
                                    checked
                                      ? 'border-slate-900 bg-sky-100'
                                      : 'border-slate-300 bg-white hover:bg-slate-50'
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    disabled={isReadOnlyExam}
                                    checked={checked}
                                    onChange={() => {
                                      const next = checked
                                        ? selectedList.filter(
                                            (id) => id !== opt.id
                                          )
                                        : [...selectedList, opt.id];
                                      updateQuestionAnswer(q, {
                                        selectedOptionIds: next,
                                      });
                                    }}
                                    className="h-5 w-5 rounded"
                                  />
                                  <span className="font-display text-sm font-extrabold text-slate-900">
                                    {opt.label}.
                                  </span>
                                  <div className="flex-1">
                                    <RichContentRenderer
                                      content={opt.content}
                                    />
                                  </div>
                                </label>
                              );
                            })}
                          </div>
                        )}

                        {/* 3. True / False Multi */}
                        {q.type === 'true_false_multi' && (
                          <div className="mt-4 space-y-2.5">
                            {(q.statements || []).map((st) => {
                              const currentVal =
                                currentAns?.statementAnswers?.[st.id];
                              return (
                                <div
                                  key={st.id}
                                  className="flex flex-col justify-between gap-3 rounded-xl border-2 border-slate-300 bg-slate-50 p-3.5 sm:flex-row sm:items-center"
                                >
                                  <div className="flex items-start gap-2">
                                    <span className="font-display text-sm font-extrabold text-slate-900">
                                      {st.label})
                                    </span>
                                    <RichContentRenderer
                                      content={st.statement}
                                    />
                                  </div>

                                  <div className="flex shrink-0 items-center gap-2">
                                    <button
                                      type="button"
                                      disabled={isReadOnlyExam}
                                      onClick={() =>
                                        updateQuestionAnswer(q, {
                                          statementAnswers: {
                                            ...(currentAns?.statementAnswers ||
                                              {}),
                                            [st.id]: true,
                                          },
                                        })
                                      }
                                      className={`min-h-[40px] rounded-xl border-2 px-3.5 py-1.5 text-xs font-extrabold ${
                                        currentVal === true
                                          ? 'border-slate-900 bg-emerald-500 text-white'
                                          : 'border-slate-300 bg-white text-slate-700'
                                      }`}
                                    >
                                      Đúng
                                    </button>
                                    <button
                                      type="button"
                                      disabled={isReadOnlyExam}
                                      onClick={() =>
                                        updateQuestionAnswer(q, {
                                          statementAnswers: {
                                            ...(currentAns?.statementAnswers ||
                                              {}),
                                            [st.id]: false,
                                          },
                                        })
                                      }
                                      className={`min-h-[40px] rounded-xl border-2 px-3.5 py-1.5 text-xs font-extrabold ${
                                        currentVal === false
                                          ? 'border-slate-900 bg-rose-500 text-white'
                                          : 'border-slate-300 bg-white text-slate-700'
                                      }`}
                                    >
                                      Sai
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}

                        {/* 4. Short Answer */}
                        {q.type === 'short_answer' && (
                          <div className="mt-4">
                            <label className="mb-1 block text-xs font-bold text-slate-700">
                              Nhập đáp số của con:
                            </label>
                            <input
                              type="text"
                              disabled={isReadOnlyExam}
                              value={currentAns?.shortAnswerText || ''}
                              onChange={(e) =>
                                updateQuestionAnswer(q, {
                                  shortAnswerText: e.target.value,
                                })
                              }
                              placeholder="Nhập số hoặc câu trả lời ngắn..."
                              className="min-h-[48px] w-full rounded-xl border-2 border-slate-800 bg-amber-50/40 px-4 py-2.5 font-mono text-base font-bold focus:bg-white focus:outline-none"
                            />
                          </div>
                        )}

                        {/* 5. Essay (Rich-Text Math & Geometry Editor) */}
                        {q.type === 'essay' && (
                          <div className="mt-4">
                            {isReadOnlyExam ? (
                              <div className="rounded-xl border-2 border-slate-300 bg-slate-50 p-4">
                                <div className="mb-1 text-xs font-bold text-slate-600">
                                  Bài làm tự luận đã nộp:
                                </div>
                                <RichContentRenderer
                                  content={currentAns?.essayContent}
                                />
                              </div>
                            ) : (
                              <MathRichEditor
                                label="Trình bày lời giải tự luận (hỗ trợ gõ công thức Toán, vẽ hình và chèn ảnh bài vở):"
                                value={
                                  currentAns?.essayContent ||
                                  createRichTextFromPlain('')
                                }
                                onChange={(nextEssay) =>
                                  updateQuestionAnswer(q, {
                                    essayContent: nextEssay,
                                  })
                                }
                              />
                            )}
                          </div>
                        )}

                        {/* Teacher Feedback & Published Solution for this Question */}
                        {(qResult?.teacherComment || keyQuestionWithSolution) && (
                          <div className="mt-4 space-y-2 rounded-xl border-2 border-emerald-700 bg-emerald-50 p-3.5 text-xs">
                            {qResult?.teacherComment && (
                              <div>
                                <strong className="text-emerald-950">
                                  Nhận xét của thầy/cô:
                                </strong>{' '}
                                {qResult.teacherComment}
                              </div>
                            )}
                            {keyQuestionWithSolution?.sampleSolution && (
                              <div>
                                <strong className="text-emerald-950">
                                  Lời giải tham khảo:
                                </strong>
                                <div className="mt-1">
                                  <RichContentRenderer
                                    content={
                                      keyQuestionWithSolution.sampleSolution
                                    }
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  }
                )}
              </div>
            ) : (
              /* Homework List View */
              <div className="space-y-5">
                <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
                  <div>
                    <h1 className="font-display text-2xl font-extrabold text-slate-900">
                      Danh Sách Bài Tập Về Nhà
                    </h1>
                    <p className="text-xs text-slate-600">
                      Bấm vào từng bài tập để làm bài, lưu nháp hoặc xem điểm và
                      lời giải sau khi chấm.
                    </p>
                  </div>

                  <div className="flex items-center gap-1 rounded-xl border-2 border-slate-900 bg-white p-1">
                    {(
                      [
                        { id: 'all', label: 'Tất cả' },
                        { id: 'pending', label: 'Cần hoàn thành' },
                        { id: 'completed', label: 'Đã nộp / Đã chấm' },
                      ] as const
                    ).map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setHwFilter(f.id)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-extrabold whitespace-nowrap ${
                          hwFilter === f.id
                            ? 'bg-slate-900 text-white'
                            : 'text-slate-700'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-4">
                  {studentAssignments
                    .filter((sa) => {
                      if (hwFilter === 'pending') {
                        return (
                          sa.status === 'assigned' ||
                          sa.status === 'in_progress' ||
                          sa.status === 'returned'
                        );
                      }
                      if (hwFilter === 'completed') {
                        return (
                          sa.status === 'submitted' || sa.status === 'graded'
                        );
                      }
                      return true;
                    })
                    .sort((a, b) => {
                      const dueA = assignmentsMap[a.assignmentId]?.dueAt || '';
                      const dueB = assignmentsMap[b.assignmentId]?.dueAt || '';
                      return dueA.localeCompare(dueB);
                    })
                    .map((sa) => {
                      const asg = assignmentsMap[sa.assignmentId];
                      if (!asg) return null;

                      return (
                        <div
                          key={sa.id}
                          className="cartoon-card flex flex-col justify-between gap-4 bg-white p-5 sm:flex-row sm:items-center"
                        >
                          <div>
                            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                              <span>Ngày giao: {asg.assignedAt}</span>
                              <span>·</span>
                              <span className="font-mono font-bold text-rose-700">
                                Hạn nộp: {asg.dueAt}
                              </span>
                              <span>·</span>
                              <span className="font-bold text-slate-800">
                                {sa.status === 'assigned' && 'Chưa làm'}
                                {sa.status === 'in_progress' && 'Đang làm dở'}
                                {sa.status === 'submitted' &&
                                  'Đã nộp (Chờ chấm)'}
                                {sa.status === 'graded' &&
                                  (sa.isScorePublished
                                    ? `Đã chấm: ${sa.score}/${sa.maxScore}đ`
                                    : 'Đã chấm')}
                                {sa.status === 'returned' && 'Cần làm lại'}
                              </span>
                            </div>

                            <h3 className="mt-1.5 font-display text-lg font-extrabold text-slate-900">
                              {asg.title}
                            </h3>
                            {asg.instructions && (
                              <p className="mt-1 text-xs text-slate-600">
                                {asg.instructions}
                              </p>
                            )}
                          </div>

                          <button
                            type="button"
                            onClick={() =>
                              openAssignmentWorkspace(sa.assignmentId)
                            }
                            className={`cartoon-button min-h-[44px] rounded-xl px-5 py-2.5 text-xs font-extrabold whitespace-nowrap shrink-0 ${
                              sa.status === 'submitted' ||
                              sa.status === 'graded'
                                ? 'bg-sky-100 text-slate-900'
                                : 'bg-blue-600 text-white'
                            }`}
                          >
                            {sa.status === 'submitted' || sa.status === 'graded'
                              ? 'Xem bài làm & Kết quả'
                              : 'Vào làm bài'}
                          </button>
                        </div>
                      );
                    })}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 3: NHẬN XÉT (PUBLISHED MONTHLY & SUBMISSION COMMENTS)        */}
        {/* ================================================================ */}
        {activeTab === 'comments' && (
          <div className="space-y-6">
            <div>
              <h1 className="font-display text-2xl font-extrabold text-slate-900">
                Sổ Nhận Xét Của Giáo Viên
              </h1>
              <p className="text-xs text-slate-600">
                Tổng hợp nhận xét định kỳ hàng tháng và phản hồi học tập đã
                công bố.
              </p>
            </div>

            {comments.length === 0 ? (
              <div className="cartoon-card bg-white p-12 text-center text-sm text-slate-500">
                Hiện chưa có nhận xét tháng nào được công bố cho học sinh.
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {comments.map((cmt) => (
                  <div
                    key={cmt.id}
                    className="cartoon-card space-y-3 bg-white p-5"
                  >
                    <div className="flex items-center justify-between border-b border-slate-200 pb-2.5">
                      <span className="font-display text-base font-extrabold text-blue-700">
                        Phiếu Nhận Xét Tháng {cmt.month}/{cmt.year}
                      </span>
                      <span className="text-xs text-slate-500">
                        Công bố:{' '}
                        {cmt.publishedAt
                          ? cmt.publishedAt.slice(0, 10)
                          : cmt.updatedAt.slice(0, 10)}
                      </span>
                    </div>

                    <div className="space-y-2.5 text-sm text-slate-800">
                      <div className="rounded-xl bg-emerald-50 p-3">
                        <strong className="block text-xs font-extrabold text-emerald-900">
                          ĐIỂM MẠNH TRONG THÁNG:
                        </strong>
                        <p className="mt-1 text-xs leading-relaxed">
                          {cmt.strengths}
                        </p>
                      </div>

                      {cmt.improvements && (
                        <div className="rounded-xl bg-amber-50 p-3">
                          <strong className="block text-xs font-extrabold text-amber-900">
                            NỘI DUNG CẦN CẢI THIỆN:
                          </strong>
                          <p className="mt-1 text-xs leading-relaxed">
                            {cmt.improvements}
                          </p>
                        </div>
                      )}

                      {cmt.completionRate && (
                        <div className="text-xs">
                          <strong>Mức độ hoàn thành BTVN:</strong>{' '}
                          {cmt.completionRate}
                        </div>
                      )}

                      {cmt.practiceSuggestions && (
                        <div className="rounded-xl bg-sky-50 p-3">
                          <strong className="block text-xs font-extrabold text-blue-900">
                            GỢI Ý LUYỆN TẬP THÊM:
                          </strong>
                          <p className="mt-1 text-xs leading-relaxed">
                            {cmt.practiceSuggestions}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 4: KHO TRÒ CHƠI TOÁN HỌC                                     */}
        {/* ================================================================ */}
        {activeTab === 'games' && (
          <div className="space-y-6">
            <GamePortalBannerIllustration />

            {/* Category Filter Buttons */}
            <div className="flex flex-wrap items-center gap-2">
              {(
                [
                  'all',
                  'Số học',
                  'Phép tính',
                  'Hình học',
                  'Tư duy logic',
                  'Ôn tập kiến thức',
                ] as const
              ).map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat)}
                  className={`min-h-[40px] rounded-xl border-2 border-slate-900 px-3.5 py-1.5 text-xs font-extrabold transition-colors whitespace-nowrap ${
                    selectedCategory === cat
                      ? 'bg-blue-600 text-white shadow-[0_2px_0_0_#1E293B]'
                      : 'bg-white text-slate-800 hover:bg-amber-50'
                  }`}
                >
                  {cat === 'all' ? 'Tất cả danh mục' : cat}
                </button>
              ))}
            </div>

            {playingGame ? (
              <div className="cartoon-card overflow-hidden bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b-2 border-slate-900 bg-amber-100 px-4 py-3">
                  <div>
                    <h3 className="font-display text-base font-extrabold text-slate-900">
                      {playingGame.title}
                    </h3>
                    <p className="text-xs text-slate-600">
                      Danh mục: {playingGame.category}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={playingGame.embedUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="cartoon-button flex items-center gap-1 rounded-xl bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
                    >
                      Mở toàn màn hình <ExternalLink className="h-3.5 w-3.5" />
                    </a>
                    <button
                      type="button"
                      onClick={() => setPlayingGame(null)}
                      className="cartoon-button rounded-xl bg-rose-500 px-3.5 py-1.5 text-xs font-extrabold text-white"
                    >
                      Đóng trò chơi
                    </button>
                  </div>
                </div>

                <div className="h-[68vh] w-full bg-slate-900">
                  <iframe
                    src={playingGame.embedUrl}
                    title={playingGame.title}
                    sandbox="allow-scripts allow-same-origin allow-forms"
                    className="h-full w-full border-0"
                    allowFullScreen
                  />
                </div>

                <div className="flex items-center gap-2 bg-amber-50 px-4 py-2.5 text-xs text-slate-700">
                  <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    Nếu trò chơi không hiển thị do trình duyệt chặn nhúng, con
                    hãy nhấn nút &ldquo;Mở toàn màn hình&rdquo; phía trên nhé!
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
                {games
                  .filter((g) =>
                    selectedCategory === 'all'
                      ? true
                      : g.category === selectedCategory
                  )
                  .map((g) => (
                    <div
                      key={g.id}
                      className="cartoon-card flex flex-col justify-between bg-white p-5"
                    >
                      <div>
                        <span className="text-xs font-extrabold text-blue-700">
                          {g.category}
                        </span>
                        <h3 className="mt-1 font-display text-lg font-extrabold text-slate-900">
                          {g.title}
                        </h3>
                        {g.description && (
                          <p className="mt-1.5 text-xs leading-relaxed text-slate-600">
                            {g.description}
                          </p>
                        )}
                      </div>

                      <button
                        type="button"
                        onClick={() => setPlayingGame(g)}
                        className="cartoon-button mt-5 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-amber-400 px-4 py-2.5 font-display text-xs font-extrabold text-slate-900"
                      >
                        <Gamepad2 className="h-4 w-4" />
                        Chơi Ngay
                      </button>
                    </div>
                  ))}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* TAB 5: HỒ SƠ & LỚP HỌC                                           */}
        {/* ================================================================ */}
        {activeTab === 'profile' && (
          <div className="mx-auto max-w-3xl space-y-6">
            <div className="cartoon-card bg-white p-6">
              <h1 className="font-display text-xl font-extrabold text-slate-900">
                Hồ Sơ Học Sinh
              </h1>
              <div className="mt-4 grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
                <div>
                  <span className="text-xs text-slate-500">Họ và tên:</span>
                  <div className="font-display font-bold text-slate-900">
                    {student.fullName}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500">
                    Tên gọi thân mật:
                  </span>
                  <div className="font-bold text-slate-900">
                    {student.nickname || '—'}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Khối lớp:</span>
                  <div className="font-bold text-slate-900">
                    {student.grade}
                  </div>
                </div>
                <div>
                  <span className="text-xs text-slate-500">Ngày sinh:</span>
                  <div className="font-mono font-bold text-slate-900">
                    {student.dob || '—'}
                  </div>
                </div>
              </div>

              {/* Access Code Box with Privacy Warning */}
              <div className="mt-6 rounded-2xl border-2 border-slate-900 bg-amber-50 p-4">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-xs font-extrabold text-slate-900">
                      Mã Truy Cập Cổng Học Sinh Của Con:
                    </div>
                    <div className="mt-1 font-mono text-2xl font-black tracking-widest text-blue-700">
                      {student.accessCode}
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(student.accessCode);
                      setCopiedMyCode(true);
                      setTimeout(() => setCopiedMyCode(false), 2000);
                    }}
                    className="cartoon-button flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-slate-900"
                  >
                    {copiedMyCode ? (
                      <>
                        <Check className="h-4 w-4 text-emerald-600" />
                        Đã sao chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        Lưu / Sao chép mã
                      </>
                    )}
                  </button>
                </div>
                <div className="mt-3 flex items-start gap-2 text-xs text-amber-900">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <span>
                    Lưu ý bảo mật: Phụ huynh và học sinh dùng chung mã này để
                    xem bài tập. Vui lòng không chia sẻ mã công khai cho người
                    lạ.
                  </span>
                </div>
              </div>
            </div>

            {/* Enrolled Classes */}
            <div className="cartoon-card bg-white p-6">
              <h2 className="font-display text-lg font-extrabold text-slate-900">
                Danh Sách Lớp Toán Đang Theo Học
              </h2>
              <div className="mt-4 space-y-3">
                {classes.map((cls) => (
                  <div
                    key={cls.id}
                    className="rounded-2xl border-2 border-slate-800 bg-sky-50/50 p-4"
                  >
                    <div className="flex items-center justify-between text-xs text-slate-500">
                      <span className="font-mono font-bold text-blue-700">
                        Mã lớp: {cls.code}
                      </span>
                      <span>Năm học: {cls.schoolYear}</span>
                    </div>
                    <h3 className="mt-1 font-display text-base font-extrabold text-slate-900">
                      {cls.name}
                    </h3>
                    {cls.scheduleText && (
                      <div className="mt-1 flex items-center gap-1.5 text-xs font-bold text-slate-700">
                        <Clock className="h-3.5 w-3.5 text-amber-700" />
                        Lịch học: {cls.scheduleText}
                      </div>
                    )}
                    {cls.description && (
                      <p className="mt-1 text-xs text-slate-600">
                        {cls.description}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </main>

      {/* Confirm Final Submission Modal */}
      {confirmSubmitModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
          <div className="cartoon-card w-full max-w-md bg-white p-6">
            <h3 className="font-display text-lg font-extrabold text-slate-900">
              Xác nhận nộp bài tập?
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              Con hãy kiểm tra kỹ lại tất cả các câu trả lời trước khi nộp nhé.
              Sau khi nộp, hệ thống sẽ chấm điểm các câu trắc nghiệm và gửi bài
              cho thầy/cô.
            </p>
            <div className="mt-6 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setConfirmSubmitModal(false)}
                className="cartoon-button min-h-[44px] rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
              >
                Kiểm tra lại
              </button>
              <button
                type="button"
                disabled={submittingExam}
                onClick={() => handleSaveOrSubmit(true)}
                className="cartoon-button min-h-[44px] rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white"
              >
                {submittingExam ? 'Đang nộp bài...' : 'Chắc chắn nộp bài'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Fixed Mobile Bottom Navigation Bar (5 Mandatory Tabs, <= 64px height) */}
      <nav className="fixed right-0 bottom-0 left-0 z-40 grid h-16 grid-cols-5 items-center border-t-2 border-slate-900 bg-white/95 px-2 backdrop-blur-md md:hidden">
        {(
          [
            { id: 'overview', label: 'Tổng quan', icon: Home },
            {
              id: 'homework',
              label: `Bài tập${
                pendingAssignments.length > 0
                  ? ` (${pendingAssignments.length})`
                  : ''
              }`,
              icon: BookOpen,
            },
            { id: 'comments', label: 'Nhận xét', icon: MessageSquareHeart },
            { id: 'games', label: 'Trò chơi', icon: Gamepad2 },
            { id: 'profile', label: 'Hồ sơ', icon: User },
          ] as const
        ).map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => {
                setActiveTab(tab.id);
                if (tab.id !== 'homework') setActiveAssignmentId(null);
              }}
              className={`flex min-h-[44px] flex-col items-center justify-center rounded-xl py-1 transition-colors ${
                isActive ? 'text-blue-600 font-extrabold' : 'text-slate-600'
              }`}
            >
              <Icon className="h-5 w-5" />
              <span className="mt-0.5 text-[10px] leading-none whitespace-nowrap">
                {tab.label}
              </span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};
