import React, { lazy, Suspense, useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowLeft,
  BookOpen,
  Check,
  Copy,
  Gamepad2,
  Home,
  KeyRound,
  LogOut,
  MessageSquareHeart,
  PartyPopper,
  RefreshCw,
  Rocket,
  Save,
  School,
  Send,
  ShieldAlert,
  User,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { MimoLoading } from '../../components/ui/MimoLoading';
import { loadMathRichEditor, loadPracticePortal, loadStudentGames, prefetchWhenIdle } from '../../app/studentChunks';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { MimoMascot } from '../practice/student/practiceTheme';
import { formatDate, homeworkStatus, NoClassNotice, StudentHome } from './StudentHome';
import { Avatar, EmptyState, INK, MUTED, SectionTitle, StatusBadge, StudentCard, studentButton, TONE, Tone } from './studentUi';
import { PRACTICE_CATALOG } from '../../data/practiceCatalog';
import { usingFirebaseEmulator } from '../../lib/firebase/config';
import { fetchPracticeCatalog, fetchPracticeHistory } from '../../services/practiceService';
import {
  clearStudentToken,
  fetchStudentGames,
  fetchStudentPortalData,
  getSavedStudentProfile,
  loginWithStudentCode,
  StudentPortalBundle,
  submitStudentHomework,
} from '../../services/studentPortalService';
import {
  HomeworkQuestion,
  PublicStudentProfile,
  RichTextContent,
  StudentQuestionAnswer,
} from '../../types/domain';
import { createRichTextFromPlain } from '../../utils/gradingEngine';

type PortalTab = 'overview' | 'homework' | 'practice' | 'comments' | 'games' | 'profile';
const PORTAL_TABS: PortalTab[] = ['overview', 'homework', 'practice', 'comments', 'games', 'profile'];

/** Portal sections, shared by the desktop tabs and the mobile bottom bar. */
const PORTAL_NAV: { id: PortalTab; label: string; short: string; icon: React.ElementType; tone: Tone }[] = [
  { id: 'overview', label: 'Trang chủ', short: 'Trang chủ', icon: Home, tone: 'blue' },
  { id: 'homework', label: 'Bài tập', short: 'Bài tập', icon: BookOpen, tone: 'blue' },
  { id: 'practice', label: 'Luyện Toán cùng Mimo', short: 'Luyện Toán', icon: Rocket, tone: 'purple' },
  { id: 'comments', label: 'Nhận xét', short: 'Nhận xét', icon: MessageSquareHeart, tone: 'pink' },
  { id: 'games', label: 'Trò chơi Toán', short: 'Trò chơi', icon: Gamepad2, tone: 'teal' },
  { id: 'profile', label: 'Hồ sơ & lớp học', short: 'Hồ sơ', icon: User, tone: 'pink' },
];

/** Latest attempts the practice API keeps per student (api/practice.ts HISTORY_LIMIT). */
const PRACTICE_HISTORY_LIMIT = 20;

// Local testing only: /portal?demo=1 signs in the emulator's test student
const EMULATOR_DEMO_STUDENT_CODE = 'MIMO03';

const TOTAL_PRACTICE_TOPICS = PRACTICE_CATALOG.reduce((n, g) => n + g.topics.length, 0);

/** True when rich content has something to show (not just an empty paragraph). */
function hasRichContent(content?: RichTextContent): boolean {
  return Boolean(
    content?.blocks.some((b) =>
      b.type === 'paragraph' ? b.text.trim() !== '' : b.type === 'list' ? b.items.some((i) => i.trim()) : true
    )
  );
}

/**
 * Header, tabs and mobile bottom bar of the portal. Rendered around the
 * content, and already while the portal data is loading, so moving between
 * sections never blanks the whole page.
 */
const PortalChrome: React.FC<{
  student: Pick<PublicStudentProfile, 'fullName' | 'nickname' | 'accessCode'>;
  classLabel: string;
  activeTab: PortalTab;
  onSelectTab: (tab: PortalTab) => void;
  pendingCount: number;
  refreshing: boolean;
  onRefresh: () => void;
  onExit: () => void;
  children: React.ReactNode;
}> = ({ student, classLabel, activeTab, onSelectTab, pendingCount, refreshing, onRefresh, onExit, children }) => (
  <div className="student-skin min-h-screen bg-[#FFFBF2] bg-[radial-gradient(ellipse_at_top_left,#E3F1FF_0%,transparent_45%),radial-gradient(ellipse_at_top_right,#FFE6F0_0%,transparent_40%)] pb-28 md:pb-12">
    {/* Compact sticky top bar (<= 64px) */}
    <header className="sticky top-0 z-30 bg-white/85 backdrop-blur-md">
      {/* Same Mimo gradient line as the teacher Studio header */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 h-[3px] bg-gradient-to-r from-[#2563EB] via-[#38BDF8] via-50% to-[#FF76B5]" aria-hidden="true" />
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <a href="/" className="flex shrink-0 items-center gap-2" aria-label="MimoEDU – Trang chủ">
            <MimoMascot size={38} eager className="ring-2" />
            <span className="hidden font-display text-lg font-extrabold text-[#1F2A55] sm:inline">
              Mimo<span className="text-[#2563EB]">EDU</span>
            </span>
          </a>
          <span className="hidden h-8 w-px bg-[#EFE9DA] sm:block" aria-hidden="true" />
          <Avatar name={student.nickname || student.fullName} size={38} className="ring-2" />
          <div className="min-w-0">
            <div className="truncate font-display text-sm font-extrabold text-[#1F2A55] sm:text-base">{student.fullName}</div>
            <div className="truncate text-xs font-bold text-[#56608A]">
              {classLabel} · Mã {student.accessCode}
            </div>
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <button
            type="button"
            onClick={onRefresh}
            className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#E3F1FF] text-[#1E40AF] transition hover:bg-[#D3E8FF]"
            title="Làm mới"
            aria-label="Làm mới dữ liệu"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? 'animate-spin' : ''}`} />
          </button>
          <button
            type="button"
            onClick={onExit}
            className="flex h-11 items-center gap-1.5 rounded-2xl bg-white px-3.5 text-sm font-extrabold text-[#56608A] ring-1 ring-[#EFE9DA] transition hover:bg-[#FFF3F8] hover:text-[#B83270]"
          >
            <LogOut className="h-4 w-4" />
            <span className="hidden sm:inline">Thoát</span>
          </button>
        </div>
      </div>
    </header>

    <main className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      {/* Desktop / tablet tabs */}
      <nav aria-label="Mục của cổng học sinh" className="mb-7 hidden md:block">
        <div className="flex items-center gap-1.5 overflow-x-auto rounded-[1.5rem] bg-white p-2 ring-1 ring-[#EFE9DA] shadow-[0_10px_28px_-20px_rgba(31,42,85,0.45)]">
          {PORTAL_NAV.map((t) => {
            const Icon = t.icon;
            const isActive = activeTab === t.id;
            const badge = t.id === 'homework' && pendingCount > 0 ? pendingCount : null;
            return (
              <button
                key={t.id}
                type="button"
                aria-current={isActive ? 'page' : undefined}
                onClick={() => onSelectTab(t.id)}
                onPointerEnter={() => prefetchTab(t.id)}
                className={`flex min-h-[48px] items-center gap-2 rounded-2xl px-4 font-display text-[15px] font-extrabold whitespace-nowrap transition ${
                  isActive ? `${TONE[t.tone].solid} text-white ${TONE[t.tone].shadow}` : 'text-[#56608A] hover:bg-[#F4F7FF] hover:text-[#1F2A55]'
                }`}
              >
                <Icon className="h-5 w-5" />
                <span className="lg:hidden">{t.short}</span>
                <span className="hidden lg:inline">{t.label}</span>
                {badge !== null && (
                  <span className={`rounded-full px-2 py-0.5 text-xs ${isActive ? 'bg-white/25' : 'bg-[#FFF3C4] text-[#7A5600]'}`}>{badge}</span>
                )}
              </button>
            );
          })}
        </div>
      </nav>

      {children}
    </main>

    {/* Mobile bottom bar (<= 72px) */}
    <nav
      aria-label="Mục của cổng học sinh"
      className="fixed right-0 bottom-0 left-0 z-40 grid grid-cols-6 gap-0.5 border-t border-[#EFE9DA] bg-white/95 px-1 pt-1.5 pb-[max(0.375rem,env(safe-area-inset-bottom))] backdrop-blur-md md:hidden"
    >
      {PORTAL_NAV.map((tab) => {
        const Icon = tab.icon;
        const isActive = activeTab === tab.id;
        const badge = tab.id === 'homework' && pendingCount > 0 ? pendingCount : null;
        return (
          <button
            key={tab.id}
            type="button"
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onSelectTab(tab.id)}
            onTouchStart={() => prefetchTab(tab.id)}
            className={`relative flex min-h-[52px] flex-col items-center justify-center rounded-2xl transition ${
              isActive ? `${TONE[tab.tone].soft} ${TONE[tab.tone].text} font-extrabold` : 'text-[#56608A]'
            }`}
          >
            <Icon className={`h-[22px] w-[22px] ${isActive ? 'scale-110' : ''}`} />
            <span className="mt-1 text-[11px] leading-none whitespace-nowrap">{tab.short}</span>
            {badge !== null && (
              <span className="absolute top-0.5 right-1.5 min-w-[18px] rounded-full bg-[#F0506E] px-1 text-center text-[10px] leading-[18px] font-extrabold text-white">
                {badge}
              </span>
            )}
          </button>
        );
      })}
    </nav>
  </div>
);

/** Starts loading a tab's code (and its data) as soon as the finger or mouse gets near it. */
function prefetchTab(tab: PortalTab) {
  if (tab === 'practice') {
    void loadPracticePortal().catch(() => undefined);
    void fetchPracticeCatalog().catch(() => undefined);
  } else if (tab === 'games') {
    void loadStudentGames().catch(() => undefined);
    void fetchStudentGames().catch(() => undefined);
  }
}

const PracticePortal = lazy(() => loadPracticePortal().then((m) => ({ default: m.PracticePortal })));
const StudentGames = lazy(() => loadStudentGames().then((m) => ({ default: m.StudentGames })));
const MathRichEditor = lazy(() => loadMathRichEditor().then((m) => ({ default: m.MathRichEditor })));

export const StudentPortalPage: React.FC = () => {
  const navigate = useNavigate();
  const {
    hasStudentSession,
    refreshStudentSessionState,
    logoutStudentPortal,
  } = useAppContext();

  // ?tab=practice opens a tab directly (used by shared links)
  const [activeTab, setActiveTab] = useState<PortalTab>(() => {
    const requested = new URLSearchParams(window.location.search).get('tab');
    return PORTAL_TABS.includes(requested as PortalTab) ? (requested as PortalTab) : 'overview';
  });
  const [bundle, setBundle] = useState<StudentPortalBundle | null>(null);
  const [loading, setLoading] = useState(hasStudentSession);
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

  const demoLoginStarted = useRef(false);
  useEffect(() => {
    if (
      !usingFirebaseEmulator ||
      demoLoginStarted.current ||
      new URLSearchParams(window.location.search).get('demo') !== '1'
    ) {
      return;
    }
    demoLoginStarted.current = true;
    // A session left over from a real student code would not exist in the emulator
    if (hasStudentSession && getSavedStudentProfile()?.accessCode === EMULATOR_DEMO_STUDENT_CODE) return;
    clearStudentToken();
    loginWithStudentCode(EMULATOR_DEMO_STUDENT_CODE)
      .then(() => refreshStudentSessionState())
      .catch((err) => setLoginError(err instanceof Error ? err.message : 'Đăng nhập thử không thành công.'));
  }, [hasStudentSession, refreshStudentSessionState]);

  useEffect(() => {
    if (hasStudentSession) {
      loadPortalData();
    } else {
      setBundle(null);
    }
  }, [hasStudentSession, loadPortalData]);

  // Once the portal is on screen, fetch the other sections' code (and the games list) while idle
  useEffect(() => {
    if (!bundle) return;
    return prefetchWhenIdle(loadPracticePortal, loadStudentGames, fetchStudentGames);
  }, [bundle]);

  // Home counters: practice topics with published questions and practice attempts
  const [openTopics, setOpenTopics] = useState<number | null>(null);
  const [practiceCount, setPracticeCount] = useState<number | null>(null);
  useEffect(() => {
    if (!bundle) return;
    let cancelled = false;
    fetchPracticeCatalog()
      .then((c) => {
        if (cancelled) return;
        setOpenTopics(
          Object.values(c.topics).filter((t) =>
            Object.values(t.levels).some((n) => n > 0)
          ).length
        );
      })
      .catch(() => undefined);
    fetchPracticeHistory()
      .then((h) => {
        if (!cancelled) setPracticeCount(h.length);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [bundle]);

  const selectTab = (tab: PortalTab) => {
    setActiveTab(tab);
    if (tab !== 'homework') setActiveAssignmentId(null);
  };

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
      <div className="student-skin flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#DDF0FF] via-[#FFFBF2] to-[#FFE6F0] p-4">
        <StudentCard className="relative w-full max-w-md overflow-hidden sm:p-8">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => navigate('/')}
              className={`flex min-h-[44px] items-center gap-1.5 text-sm font-bold ${MUTED} hover:text-[#1F2A55]`}
            >
              <ArrowLeft className="h-4 w-4" />
              Trang chủ
            </button>
            <span className="font-display text-base font-extrabold text-[#1F2A55]">
              Mimo<span className="text-[#2563EB]">EDU</span>
            </span>
          </div>

          <div className="mt-4 flex flex-col items-center text-center">
            <MimoMascot size={104} eager className="mimo-float" />
            <h1 className={`mt-4 font-display text-2xl font-extrabold sm:text-3xl ${INK}`}>Chào con! 👋</h1>
            <p className={`mt-1.5 text-base ${MUTED}`}>
              Nhập mã 6 ký tự cô đã gửi để vào góc học tập: làm bài tập, luyện Toán cùng Mimo và chơi trò chơi.
            </p>
          </div>

          <form onSubmit={handleLoginSubmit} className="mt-6 space-y-4">
            <label className="block">
              <span className="mb-2 flex items-center justify-center gap-1.5 text-sm font-extrabold text-[#5B3FB8]">
                <KeyRound className="h-4 w-4" /> Mã học sinh
              </span>
              <input
                type="text"
                maxLength={6}
                autoComplete="off"
                autoCapitalize="characters"
                value={codeInput}
                onChange={(e) =>
                  setCodeInput(
                    e.target.value.toUpperCase().replace(/[^A-Z0-9]/g, '')
                  )
                }
                placeholder="8K9P2A"
                className="w-full rounded-2xl border-2 border-[#D7C8FF] bg-[#F7F3FF] py-4 text-center font-mono text-3xl font-black tracking-[0.35em] text-[#1F2A55] uppercase placeholder:text-[#C9BDF0] focus:border-[#8B6CF0] focus:bg-white focus:outline-none"
              />
            </label>

            {loginError && (
              <div className="rounded-2xl bg-[#FFE9EC] p-3 text-center text-sm font-bold text-[#C2364F]">
                {loginError}
              </div>
            )}

            <button type="submit" disabled={loginLoading} className={studentButton('primary', 'blue', 'w-full text-lg')}>
              {loginLoading ? 'Mimo đang kiểm tra mã…' : 'Vào góc học tập 🚀'}
            </button>
          </form>

          <p className={`mt-5 text-center text-sm ${MUTED}`}>
            Quên mã? Bố mẹ nhắn cô giáo để nhận lại mã nhé.
          </p>
        </StudentCard>
      </div>
    );
  }

  // ==========================================================================
  // LOADING OR ERROR STATES
  // ==========================================================================
  // Header and tabs stay on screen (from the profile saved at sign-in) while data loads
  const savedProfile = getSavedStudentProfile();
  const chromeWhileWaiting = (content: React.ReactNode) =>
    savedProfile ? (
      <PortalChrome
        student={savedProfile}
        classLabel={savedProfile.grade}
        activeTab={activeTab}
        onSelectTab={selectTab}
        pendingCount={0}
        refreshing={loading}
        onRefresh={loadPortalData}
        onExit={handleExitPortal}
      >
        {content}
      </PortalChrome>
    ) : (
      <div className="student-skin min-h-screen bg-[#FFFBF2]">{content}</div>
    );

  if (loading && !bundle) {
    return chromeWhileWaiting(<MimoLoading variant={savedProfile ? 'section' : 'page'} />);
  }

  if (error || !bundle) {
    return chromeWhileWaiting(
      <div className="flex justify-center p-4">
        <StudentCard className="w-full max-w-md text-center">
          <MimoMascot size={88} eager className="mx-auto" />
          <h2 className={`mt-3 font-display text-xl font-extrabold ${INK}`}>Ôi, chưa tải được dữ liệu</h2>
          <p className={`mt-1 text-base ${MUTED}`}>{error || 'Phiên làm việc đã gián đoạn.'}</p>
          <div className="mt-5 flex flex-wrap justify-center gap-3">
            <button type="button" onClick={loadPortalData} className={studentButton('primary', 'blue')}>
              <RefreshCw className="h-5 w-5" /> Thử lại
            </button>
            <button type="button" onClick={handleExitPortal} className={studentButton('quiet')}>
              Thoát
            </button>
          </div>
        </StudentCard>
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

  // The server leaves revoked assignments out of assignmentsMap; counting their
  // studentAssignments too made the badge disagree with the list.
  const visibleAssignments = studentAssignments.filter(
    (sa) => assignmentsMap[sa.assignmentId]
  );
  const pendingAssignments = visibleAssignments.filter(
    (sa) =>
      sa.status === 'assigned' ||
      sa.status === 'in_progress' ||
      sa.status === 'returned'
  );
  const completedAssignments = visibleAssignments.filter(
    (sa) => sa.status === 'submitted' || sa.status === 'graded'
  );
  const scoredAssignments = visibleAssignments.filter(
    (sa) => sa.status === 'graded' && sa.isScorePublished
  );
  const hasClass = classes.length > 0;
  const filteredAssignments =
    hwFilter === 'pending'
      ? pendingAssignments
      : hwFilter === 'completed'
        ? completedAssignments
        : visibleAssignments;

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
    <PortalChrome
      student={student}
      classLabel={classes[0] ? `Lớp ${classes[0].name}` : student.grade}
      activeTab={activeTab}
      onSelectTab={selectTab}
      pendingCount={pendingAssignments.length}
      refreshing={loading}
      onRefresh={loadPortalData}
      onExit={handleExitPortal}
    >
        {/* ================================================================ */}
        {/* TAB 1: TỔNG QUAN (OVERVIEW)                                      */}
        {/* ================================================================ */}
        {activeTab === 'overview' && (
          <StudentHome
            name={student.nickname || student.fullName}
            accessCode={student.accessCode}
            grade={student.grade}
            classes={classes}
            pending={pendingAssignments}
            scored={scoredAssignments}
            assignmentsMap={assignmentsMap}
            practiceCount={practiceCount}
            practiceLimit={PRACTICE_HISTORY_LIMIT}
            openTopics={openTopics}
            totalTopics={TOTAL_PRACTICE_TOPICS}
            comments={comments}
            gamesCount={games.length}
            onNavigate={(target) => {
              setActiveTab(target);
              window.scrollTo({ top: 0, behavior: 'smooth' });
            }}
            onOpenAssignment={openAssignmentWorkspace}
          />
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
                          className="cartoon-button flex min-h-[44px] items-center gap-1.5 rounded-xl bg-white px-4 py-2 text-xs font-extrabold text-[#1F2A55]"
                        >
                          <Save className="h-4 w-4 text-blue-600" />
                          {savingDraft ? 'Đang lưu...' : 'Lưu nháp'}
                        </button>
                        <button
                          type="button"
                          disabled={submittingExam}
                          onClick={() => setConfirmSubmitModal(true)}
                          className="cartoon-button flex min-h-[44px] items-center gap-1.5 rounded-xl bg-[#34B36F] px-5 py-2 text-xs font-extrabold text-white"
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
                <div className="cartoon-card bg-[#FFF8E1] p-5">
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
                  <h1 className="mt-2 font-display text-xl font-extrabold text-[#1F2A55]">
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
                      <div className="mt-4 rounded-2xl border-2 border-[#BDE8CB] bg-white p-4">
                        <div className="flex items-center justify-between">
                          <span className="font-display text-sm font-extrabold text-[#1F2A55]">
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
                                      ? 'border-[#2563EB] bg-[#E3F1FF]'
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
                                  <span className="font-display text-sm font-extrabold text-[#1F2A55]">
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
                                      ? 'border-[#2563EB] bg-[#E3F1FF]'
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
                                  <span className="font-display text-sm font-extrabold text-[#1F2A55]">
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
                                    <span className="font-display text-sm font-extrabold text-[#1F2A55]">
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
                                          ? 'border-[#34B36F] bg-[#34B36F] text-white'
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
                                          ? 'border-[#F0506E] bg-[#F0506E] text-white'
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
                              className="min-h-[48px] w-full rounded-xl border-2 border-[#D7C8FF] bg-[#F7F3FF] px-4 py-2.5 font-mono text-base font-bold focus:bg-white focus:outline-none"
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
                              <Suspense fallback={<p className="rounded-xl bg-[#F7F3FF] p-4 text-sm font-bold text-[#5B3FB8]">Đang mở khung trình bày lời giải…</p>}>
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
                              </Suspense>
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
                            {hasRichContent(keyQuestionWithSolution?.sampleSolution) && (
                              <div>
                                <strong className="text-emerald-950">
                                  Lời giải tham khảo:
                                </strong>
                                <div className="mt-1">
                                  <RichContentRenderer
                                    content={
                                      keyQuestionWithSolution!.sampleSolution
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
              <div className="space-y-6">
                <SectionTitle
                  as="h1"
                  icon={BookOpen}
                  tone="blue"
                  title="Bài tập của con"
                  subtitle="Bấm vào bài để làm, lưu nháp hoặc xem điểm và lời giải sau khi cô chấm."
                />

                {hasClass && visibleAssignments.length > 0 && (
                  <div role="tablist" aria-label="Lọc bài tập" className="flex gap-2 overflow-x-auto pb-1">
                    {(
                      [
                        { id: 'all', label: 'Tất cả', count: visibleAssignments.length, tone: 'blue' },
                        { id: 'pending', label: 'Cần hoàn thành', count: pendingAssignments.length, tone: 'yellow' },
                        { id: 'completed', label: 'Đã nộp / đã chấm', count: completedAssignments.length, tone: 'green' },
                      ] as const
                    ).map((f) => {
                      const on = hwFilter === f.id;
                      return (
                        <button
                          key={f.id}
                          type="button"
                          role="tab"
                          aria-selected={on}
                          onClick={() => setHwFilter(f.id)}
                          className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-extrabold whitespace-nowrap transition ${
                            on ? `${TONE[f.tone].solid} text-white` : `bg-white ${MUTED} ring-1 ring-[#EFE9DA] hover:bg-[#FFFBF2]`
                          }`}
                        >
                          {f.label}
                          <span className={`rounded-full px-2 py-0.5 text-xs ${on ? 'bg-white/25' : `${TONE[f.tone].soft} ${TONE[f.tone].text}`}`}>{f.count}</span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {!hasClass ? (
                  <NoClassNotice />
                ) : visibleAssignments.length === 0 ? (
                  <EmptyState
                    mascot
                    tone="blue"
                    title="Cô chưa giao bài tập nào cho con."
                    text="Trong lúc chờ, con vào Luyện Toán cùng Mimo để luyện thêm nhé!"
                    action={
                      <button type="button" onClick={() => setActiveTab('practice')} className={studentButton('accent')}>
                        <Rocket className="h-5 w-5" /> Luyện Toán cùng Mimo
                      </button>
                    }
                  />
                ) : filteredAssignments.length === 0 ? (
                  <EmptyState
                    compact
                    tone={hwFilter === 'pending' ? 'green' : 'gray'}
                    icon={hwFilter === 'pending' ? PartyPopper : BookOpen}
                    title={hwFilter === 'pending' ? 'Con đã làm hết bài cần hoàn thành rồi! 🎉' : 'Chưa có bài nào trong mục này.'}
                  />
                ) : (
                  <ul className="grid gap-4 lg:grid-cols-2">
                    {[...filteredAssignments]
                      .sort((a, b) => {
                        const dueA = assignmentsMap[a.assignmentId]?.dueAt || '';
                        const dueB = assignmentsMap[b.assignmentId]?.dueAt || '';
                        return dueA.localeCompare(dueB);
                      })
                      .map((sa) => {
                        const asg = assignmentsMap[sa.assignmentId];
                        const status = homeworkStatus(sa, asg);
                        const finished = sa.status === 'submitted' || sa.status === 'graded';
                        const accent: Tone =
                          status === 'overdue' ? 'red' : status === 'graded' ? 'green' : status === 'submitted' ? 'teal' : status === 'returned' ? 'pink' : status === 'in_progress' ? 'blue' : 'yellow';
                        return (
                          <li key={sa.id}>
                            <StudentCard padded={false} className="flex h-full flex-col gap-4 overflow-hidden">
                              <div className={`h-2 ${TONE[accent].solid}`} aria-hidden="true" />
                              <div className="flex flex-1 flex-col gap-3 px-5 pb-5">
                                <div className="flex flex-wrap items-center gap-2">
                                  <StatusBadge status={status} />
                                  {status === 'overdue' && sa.status === 'in_progress' && <StatusBadge status="in_progress" />}
                                  {sa.status === 'graded' && sa.isScorePublished && (
                                    <span className="rounded-full bg-[#34B36F] px-3 py-1 font-display text-sm font-extrabold text-white tabular-nums">
                                      {sa.score}/{sa.maxScore} điểm
                                    </span>
                                  )}
                                </div>
                                <h3 className={`font-display text-lg leading-snug font-extrabold sm:text-xl ${INK}`}>{asg.title}</h3>
                                {asg.instructions && <p className={`line-clamp-2 text-sm ${MUTED}`}>{asg.instructions}</p>}
                                <div className={`mt-auto flex flex-wrap items-center justify-between gap-3 text-sm font-bold ${MUTED}`}>
                                  <span>
                                    Giao {formatDate(asg.assignedAt)} ·{' '}
                                    <span className={status === 'overdue' ? 'text-[#C2364F]' : INK}>Hạn nộp {formatDate(asg.dueAt)}</span>
                                  </span>
                                  <button
                                    type="button"
                                    onClick={() => openAssignmentWorkspace(sa.assignmentId)}
                                    className={finished ? studentButton('soft', 'teal', 'min-h-[44px] text-sm') : studentButton('primary', accent === 'red' ? 'red' : 'blue', 'min-h-[44px] text-sm')}
                                  >
                                    {finished ? 'Xem bài & kết quả' : sa.status === 'in_progress' ? 'Làm tiếp' : sa.status === 'returned' ? 'Sửa bài' : 'Làm bài'}
                                  </button>
                                </div>
                              </div>
                            </StudentCard>
                          </li>
                        );
                      })}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ================================================================ */}
        {/* NHẬN XÉT                                                           */}
        {/* ================================================================ */}
        {activeTab === 'comments' && (
          <div className="space-y-6">
            <SectionTitle
              as="h1"
              icon={MessageSquareHeart}
              tone="pink"
              title="Nhận xét của cô"
              subtitle="Những lời nhận xét hằng tháng cô gửi cho con."
            />
            {comments.length === 0 ? (
              <EmptyState
                mascot
                tone="pink"
                title="Cô chưa gửi nhận xét nào."
                text="Con cứ chăm chỉ mỗi ngày, cô sẽ gửi lời nhận xét sớm thôi!"
              />
            ) : (
              <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
                {comments.map((cmt) => (
                  <StudentCard key={cmt.id} className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className={`font-display text-lg font-extrabold ${INK}`}>
                        {cmt.month ? `Tháng ${cmt.month}/${cmt.year}` : 'Nhận xét của cô'}
                      </span>
                      <span className={`text-sm font-bold ${MUTED}`}>
                        {formatDate((cmt.publishedAt || cmt.updatedAt).slice(0, 10))}
                      </span>
                    </div>
                    <div className="rounded-2xl bg-[#E3F7EA] p-4">
                      <div className="text-sm font-extrabold text-[#1F7A4F]">🌟 Con đã làm tốt</div>
                      <p className={`mt-1 text-base leading-relaxed ${INK}`}>{cmt.strengths}</p>
                    </div>
                    {cmt.improvements && (
                      <div className="rounded-2xl bg-[#FFF3C4] p-4">
                        <div className="text-sm font-extrabold text-[#7A5600]">💪 Con cần cố gắng thêm</div>
                        <p className={`mt-1 text-base leading-relaxed ${INK}`}>{cmt.improvements}</p>
                      </div>
                    )}
                    {cmt.practiceSuggestions && (
                      <div className="rounded-2xl bg-[#E3F1FF] p-4">
                        <div className="text-sm font-extrabold text-[#1E40AF]">📚 Gợi ý luyện tập thêm</div>
                        <p className={`mt-1 text-base leading-relaxed ${INK}`}>{cmt.practiceSuggestions}</p>
                      </div>
                    )}
                    {cmt.completionRate && (
                      <p className={`text-sm ${MUTED}`}>
                        <b className={INK}>Mức độ hoàn thành bài tập:</b> {cmt.completionRate}
                      </p>
                    )}
                  </StudentCard>
                ))}
              </div>
            )}
          </div>
        )}

        {activeTab === 'practice' && (
          <Suspense fallback={<MimoLoading />}>
            <PracticePortal />
          </Suspense>
        )}

        {/* ================================================================ */}
        {/* TRÒ CHƠI TOÁN                                                      */}
        {/* ================================================================ */}
        {activeTab === 'games' && (
          <Suspense fallback={<MimoLoading text="Mimo đang mở Kho trò chơi..." />}>
            <StudentGames
              onUnauthenticated={() => {
                refreshStudentSessionState();
                setBundle(null);
              }}
            />
          </Suspense>
        )}

        {/* ================================================================ */}
        {/* HỒ SƠ & LỚP HỌC                                                    */}
        {/* ================================================================ */}
        {activeTab === 'profile' && (
          <div className="mx-auto max-w-3xl space-y-6">
            <StudentCard className="space-y-5">
              <div className="flex items-center gap-4">
                <Avatar name={student.nickname || student.fullName} size={72} />
                <div className="min-w-0">
                  <h1 className={`truncate font-display text-2xl font-extrabold ${INK}`}>{student.fullName}</h1>
                  {student.nickname && <p className={`text-base ${MUTED}`}>Tên ở nhà: {student.nickname}</p>}
                </div>
              </div>
              <dl className="grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-[#E3F1FF] p-4">
                  <dt className="text-sm font-bold text-[#1E40AF]">Khối lớp</dt>
                  <dd className={`font-display text-lg font-extrabold ${INK}`}>{student.grade || '—'}</dd>
                </div>
                <div className="rounded-2xl bg-[#EFE7FF] p-4">
                  <dt className="text-sm font-bold text-[#5B3FB8]">Ngày sinh</dt>
                  <dd className={`font-display text-lg font-extrabold ${INK}`}>{formatDate(student.dob)}</dd>
                </div>
              </dl>

              <div className="rounded-3xl bg-[#FFF3C4] p-5">
                <div className="flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-sm font-extrabold text-[#7A5600]">
                      <KeyRound className="h-4 w-4" /> Mã vào cổng học sinh của con
                    </div>
                    <div className="mt-1 font-mono text-3xl font-black tracking-[0.2em] text-[#5B3FB8]">{student.accessCode}</div>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      navigator.clipboard.writeText(student.accessCode);
                      setCopiedMyCode(true);
                      setTimeout(() => setCopiedMyCode(false), 2000);
                    }}
                    className={studentButton('quiet', 'blue', 'min-h-[44px] text-sm')}
                  >
                    {copiedMyCode ? (
                      <>
                        <Check className="h-4 w-4 text-[#34B36F]" /> Đã sao chép
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" /> Sao chép mã
                      </>
                    )}
                  </button>
                </div>
                <p className="mt-3 flex items-start gap-2 text-sm text-[#7A5600]">
                  <ShieldAlert className="mt-0.5 h-4 w-4 shrink-0" />
                  Con và bố mẹ dùng chung mã này. Đừng cho người lạ biết mã nhé!
                </p>
              </div>
            </StudentCard>

            <StudentCard className="space-y-4">
              <SectionTitle icon={School} tone="blue" title="Lớp của con" />
              {classes.length === 0 ? (
                <NoClassNotice />
              ) : (
                <ul className="space-y-3">
                  {classes.map((cls) => (
                    <li key={cls.id} className="rounded-2xl bg-[#E3F1FF] p-4">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-sm font-bold text-[#1E40AF]">
                        <span>{cls.grade}</span>
                        <span>Năm học {cls.schoolYear}</span>
                      </div>
                      <h3 className={`mt-1 font-display text-xl font-extrabold ${INK}`}>{cls.name}</h3>
                      {cls.description && <p className={`mt-1 text-sm ${MUTED}`}>{cls.description}</p>}
                    </li>
                  ))}
                </ul>
              )}
            </StudentCard>
          </div>
        )}
        {/* Confirm Final Submission Modal */}
        {confirmSubmitModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4">
            <div className="cartoon-card w-full max-w-md bg-white p-6">
              <h3 className="font-display text-lg font-extrabold text-[#1F2A55]">
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
                  className="cartoon-button min-h-[44px] rounded-xl bg-[#34B36F] px-5 py-2 text-xs font-extrabold text-white"
                >
                  {submittingExam ? 'Đang nộp bài...' : 'Chắc chắn nộp bài'}
                </button>
              </div>
            </div>
          </div>
        )}

    </PortalChrome>
  );
};
