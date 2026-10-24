import React from 'react';
import {
  BookOpen,
  ChevronRight,
  ClipboardList,
  Gamepad2,
  KeyRound,
  MessageSquareHeart,
  PartyPopper,
  Rocket,
  School,
  Sparkles,
  Star,
  TriangleAlert,
  UserRound,
} from 'lucide-react';
import { MimoMascot } from '../practice/student/practiceTheme';
import type { Assignment, ClassRoom, CommentReport, StudentAssignment } from '../../types/domain';
import { Avatar, EmptyState, INK, MUTED, SectionTitle, StatusBadge, StatusKind, StudentCard, studentButton, Tone, TONE } from './studentUi';

/**
 * Student portal home: greeting, class and code, four counters, four big doors
 * into the portal, then homework to do, new scores and the latest comment.
 */

export type HomeTarget = 'homework' | 'practice' | 'comments' | 'games' | 'profile';

export const NO_CLASS_MESSAGE = 'Con chưa được ghép vào lớp. Hãy liên hệ giáo viên.';

/** Shown wherever homework would be listed for a student without a class. */
export const NoClassNotice: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-start gap-3 rounded-2xl bg-[#FFF3C4] p-4 text-[#7A5600] ring-1 ring-[#F5D77A] ${className}`}>
    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
    <div>
      <p className="text-sm font-extrabold sm:text-base">{NO_CLASS_MESSAGE}</p>
      <p className="mt-0.5 text-sm">Trong lúc chờ, con vẫn luyện Toán cùng Mimo được nhé!</p>
    </div>
  </div>
);

/** Local date as YYYY-MM-DD, the format teachers pick due dates in. */
const today = () => {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** Status a student sees for one assignment; unfinished work past its due date is "Quá hạn". */
export function homeworkStatus(sa: StudentAssignment, asg: Assignment | undefined): StatusKind {
  if (sa.status === 'graded') return 'graded';
  if (sa.status === 'submitted') return 'submitted';
  if (asg?.dueAt && /^\d{4}-\d{2}-\d{2}/.test(asg.dueAt) && asg.dueAt.slice(0, 10) < today()) return 'overdue';
  if (sa.status === 'returned') return 'returned';
  if (sa.status === 'in_progress') return 'in_progress';
  return 'todo';
}

/** 2026-10-30 → 30/10/2026; anything else is shown as typed. */
export function formatDate(value: string | undefined): string {
  const m = value?.match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[3]}/${m[2]}/${m[1]}` : value || '—';
}

const DOORS: { id: HomeTarget; title: string; icon: React.ElementType; tone: Tone }[] = [
  { id: 'homework', title: 'Bài tập của con', icon: BookOpen, tone: 'blue' },
  { id: 'practice', title: 'Luyện Toán cùng Mimo', icon: Rocket, tone: 'purple' },
  { id: 'games', title: 'Trò chơi Toán', icon: Gamepad2, tone: 'teal' },
  { id: 'profile', title: 'Hồ sơ & lớp học', icon: UserRound, tone: 'pink' },
];

interface StudentHomeProps {
  name: string;
  accessCode: string;
  grade?: string;
  classes: ClassRoom[];
  pending: StudentAssignment[];
  scored: StudentAssignment[];
  assignmentsMap: Record<string, Assignment>;
  /** Practice attempts kept by the server (latest 20), null while loading. */
  practiceCount: number | null;
  practiceLimit: number;
  /** null while the practice catalogue is loading or unavailable */
  openTopics: number | null;
  totalTopics: number;
  comments: CommentReport[];
  gamesCount: number;
  onNavigate: (target: HomeTarget) => void;
  onOpenAssignment: (assignmentId: string) => void;
}

export const StudentHome: React.FC<StudentHomeProps> = ({
  name,
  accessCode,
  grade,
  classes,
  pending,
  scored,
  assignmentsMap,
  practiceCount,
  practiceLimit,
  openTopics,
  totalTopics,
  comments,
  gamesCount,
  onNavigate,
  onOpenAssignment,
}) => {
  const hasClass = classes.length > 0;
  const stats: { label: string; value: React.ReactNode; icon: React.ElementType; tone: Tone; to: HomeTarget }[] = [
    { label: 'BTVN cần làm', value: hasClass ? pending.length : '–', icon: ClipboardList, tone: 'yellow', to: 'homework' },
    { label: 'Bài đã có điểm', value: hasClass ? scored.length : '–', icon: Star, tone: 'green', to: 'homework' },
    {
      label: 'Lượt luyện tập',
      value: practiceCount === null ? '…' : practiceCount >= practiceLimit ? `${practiceLimit}+` : practiceCount,
      icon: Sparkles,
      tone: 'purple',
      to: 'practice',
    },
    { label: 'Nhận xét của cô', value: comments.length, icon: MessageSquareHeart, tone: 'pink', to: 'comments' },
  ];
  const doorNote: Record<HomeTarget, string> = {
    homework: !hasClass ? 'Chưa ghép lớp' : pending.length > 0 ? `${pending.length} bài cần làm` : 'Đã làm hết bài 🎉',
    practice: openTopics === null ? `${totalTopics} chuyên đề` : `${openTopics}/${totalTopics} chuyên đề đã mở`,
    comments: '',
    games: gamesCount > 0 ? `${gamesCount} trò chơi` : 'Sắp ra mắt',
    profile: hasClass ? `Lớp ${classes[0].name}` : 'Xem mã của con',
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Greeting */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1E40AF] via-[#2563EB] to-[#38BDF8] p-5 text-white shadow-[0_20px_44px_-24px_rgba(37,99,235,0.9)] sm:p-8">
        <div className="pointer-events-none absolute -top-16 -right-10 h-56 w-56 rounded-full bg-white/15" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-20 left-1/4 h-44 w-44 rounded-full bg-[#FFD34E]/30 blur-xl" aria-hidden="true" />
        <span className="pointer-events-none absolute top-6 left-1/2 text-2xl opacity-70" aria-hidden="true">✨</span>
        <div className="relative flex flex-col gap-5 md:flex-row md:items-center">
          <div className="flex min-w-0 flex-1 items-start gap-4">
            <Avatar name={name} size={64} className="shadow-sm" />
            <div className="min-w-0">
              <h1 className="font-display text-2xl leading-tight font-extrabold text-white sm:text-4xl">Chào con, {name}! 👋</h1>
              <p className="mt-1 text-base font-bold text-[#FFE08A] sm:text-lg">Sẵn sàng học Toán cùng Mimo chưa?</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {hasClass && (
                  <span className="inline-flex max-w-full items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 text-sm font-bold text-[#1F2A55]">
                    <School className="h-4 w-4 shrink-0 text-[#2563EB]" />
                    <span className="truncate">Lớp {classes.map((c) => c.name).join(', ')}</span>
                  </span>
                )}
                {grade && <span className="rounded-full bg-white/85 px-3 py-1.5 text-sm font-bold text-[#1F2A55]">{grade}</span>}
                <span className="inline-flex items-center gap-1.5 rounded-full bg-white/85 px-3 py-1.5 font-mono text-sm font-bold text-[#5B3FB8]">
                  <KeyRound className="h-4 w-4" /> {accessCode}
                </span>
              </div>
            </div>
          </div>
          <div className="hidden shrink-0 md:block">
            <MimoMascot size={132} eager className="mimo-float" />
          </div>
        </div>
        {!hasClass && <NoClassNotice className="relative mt-5" />}
        <div className="relative mt-5 flex flex-wrap gap-3">
          <button type="button" onClick={() => onNavigate('practice')} className={studentButton('accent')}>
            <Rocket className="h-5 w-5" /> Luyện Toán ngay
          </button>
          {hasClass && pending.length > 0 && (
            <button type="button" onClick={() => onNavigate('homework')} className={studentButton('quiet')}>
              <BookOpen className="h-5 w-5" /> Làm bài tập ({pending.length})
            </button>
          )}
        </div>
      </section>

      {/* Counters */}
      <section aria-label="Thống kê" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <button
              key={s.label}
              type="button"
              onClick={() => onNavigate(s.to)}
              className={`flex items-center gap-3 rounded-3xl p-4 text-left ring-1 transition hover:-translate-y-0.5 sm:p-5 ${TONE[s.tone].soft} ${TONE[s.tone].ring}`}
            >
              <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-white ${TONE[s.tone].text}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="min-w-0">
                <span className={`block font-display text-3xl leading-none font-extrabold tabular-nums ${TONE[s.tone].text}`}>{s.value}</span>
                <span className={`mt-1 block text-sm leading-tight font-bold ${INK}`}>{s.label}</span>
              </span>
            </button>
          );
        })}
      </section>

      {/* Quick doors */}
      <section aria-label="Đi tới" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {DOORS.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onNavigate(d.id)}
              className={`group flex min-h-[150px] flex-col items-start rounded-[1.75rem] bg-white p-4 text-left ring-1 ring-[#EFE9DA] shadow-[0_10px_28px_-18px_rgba(31,42,85,0.45)] transition duration-200 hover:-translate-y-1 hover:shadow-[0_18px_36px_-18px_rgba(31,42,85,0.5)] sm:min-h-[170px] sm:p-5`}
            >
              <span className={`flex h-14 w-14 items-center justify-center rounded-2xl text-white transition group-hover:scale-110 group-hover:-rotate-6 ${TONE[d.tone].solid} ${TONE[d.tone].shadow}`}>
                <Icon className="h-7 w-7" />
              </span>
              <span className={`mt-4 font-display text-base leading-snug font-extrabold sm:text-lg ${INK}`}>{d.title}</span>
              <span className={`mt-auto flex w-full items-center justify-between pt-2 text-sm font-bold ${TONE[d.tone].text}`}>
                {doorNote[d.id]}
                <ChevronRight className="h-5 w-5 shrink-0 transition group-hover:translate-x-1" />
              </span>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* Homework to do */}
        <StudentCard className="lg:col-span-7">
          <SectionTitle
            icon={ClipboardList}
            tone="yellow"
            title="Bài tập cần hoàn thành"
            action={
              hasClass && pending.length > 0 ? (
                <button type="button" onClick={() => onNavigate('homework')} className="min-h-[44px] text-sm font-extrabold text-[#1E40AF] hover:underline">
                  Xem tất cả →
                </button>
              ) : undefined
            }
          />
          <div className="mt-4">
            {!hasClass ? (
              <EmptyState compact tone="yellow" icon={School} title="Con chưa có lớp" text="Khi cô ghép con vào lớp, bài tập sẽ hiện ở đây." />
            ) : pending.length === 0 ? (
              <EmptyState compact tone="green" icon={PartyPopper} title="Tuyệt vời! Con đã làm hết bài tập." text="Hãy ghé Luyện Toán cùng Mimo để giỏi hơn nữa nhé!" />
            ) : (
              <ul className="space-y-3">
                {pending.slice(0, 4).map((sa) => {
                  const asg = assignmentsMap[sa.assignmentId];
                  const status = homeworkStatus(sa, asg);
                  return (
                    <li key={sa.id}>
                      <button
                        type="button"
                        onClick={() => onOpenAssignment(sa.assignmentId)}
                        className="group flex min-h-[72px] w-full items-center gap-3 rounded-2xl bg-[#FFFBF2] px-4 py-3 text-left ring-1 ring-[#F1E6C8] transition hover:bg-[#FFF3C4]"
                      >
                        <span className="min-w-0 flex-1">
                          <span className={`block truncate font-display text-base font-extrabold sm:text-lg ${INK}`}>{asg.title}</span>
                          <span className="mt-1 flex flex-wrap items-center gap-2">
                            <StatusBadge status={status} />
                            <span className={`text-sm font-bold ${status === 'overdue' ? 'text-[#C2364F]' : MUTED}`}>Hạn nộp {formatDate(asg.dueAt)}</span>
                          </span>
                        </span>
                        <span className={studentButton('primary', 'blue', 'min-h-[44px] shrink-0 px-4 text-sm')}>Làm bài</span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </StudentCard>

        <div className="space-y-5 lg:col-span-5">
          {/* New scores */}
          <StudentCard>
            <SectionTitle icon={Star} tone="green" title="Điểm số mới công bố" />
            <div className="mt-4">
              {scored.length === 0 ? (
                <EmptyState compact tone="green" icon={Star} title="Chưa có điểm mới" text="Làm bài thật tốt, điểm sẽ hiện ở đây nhé!" />
              ) : (
                <ul className="space-y-2">
                  {scored.slice(0, 4).map((sa) => (
                    <li key={sa.id}>
                      <button
                        type="button"
                        onClick={() => onOpenAssignment(sa.assignmentId)}
                        className="flex min-h-[56px] w-full items-center gap-3 rounded-2xl bg-[#F3FBF6] px-4 py-2.5 text-left transition hover:bg-[#E3F7EA]"
                      >
                        <span className={`min-w-0 flex-1 truncate text-base font-bold ${INK}`}>{assignmentsMap[sa.assignmentId]?.title || 'Bài tập'}</span>
                        <span className="shrink-0 rounded-full bg-[#34B36F] px-3 py-1 font-display text-base font-extrabold text-white tabular-nums">
                          {sa.score}/{sa.maxScore}
                        </span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </StudentCard>

          {/* Latest teacher comment */}
          <StudentCard>
            <SectionTitle
              icon={MessageSquareHeart}
              tone="pink"
              title="Nhận xét mới từ cô"
              action={
                comments.length > 0 ? (
                  <button type="button" onClick={() => onNavigate('comments')} className="min-h-[44px] text-sm font-extrabold text-[#B83270] hover:underline">
                    Xem thêm →
                  </button>
                ) : undefined
              }
            />
            <div className="mt-4">
              {comments.length === 0 ? (
                <EmptyState compact tone="pink" icon={MessageSquareHeart} title="Cô chưa gửi nhận xét" text="Con cứ cố gắng mỗi ngày nhé!" />
              ) : (
                <div className="rounded-2xl bg-[#FFF3F8] p-4">
                  <div className="text-sm font-extrabold text-[#B83270]">
                    {comments[0].month ? `Tháng ${comments[0].month}/${comments[0].year}` : 'Nhận xét mới'}
                  </div>
                  <p className={`mt-1.5 line-clamp-4 text-base leading-relaxed ${INK}`}>
                    <span aria-hidden="true">🌟 </span>
                    {comments[0].strengths}
                  </p>
                </div>
              )}
            </div>
          </StudentCard>
        </div>
      </div>
    </div>
  );
};
