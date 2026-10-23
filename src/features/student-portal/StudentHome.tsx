import React from 'react';
import {
  BookOpen,
  CheckCircle2,
  ChevronRight,
  Gamepad2,
  MessageSquareHeart,
  School,
  Sparkles,
  Star,
  TriangleAlert,
} from 'lucide-react';
import { MimoMascot } from '../practice/student/practiceTheme';
import type { Assignment, ClassRoom, CommentReport, StudentAssignment } from '../../types/domain';

/**
 * Student portal home: greeting, class, three counters and four big doors
 * into the portal. Pastel palette on a cream page, large tap targets.
 */

export type HomeTarget = 'homework' | 'practice' | 'comments' | 'games';

export const NO_CLASS_MESSAGE = 'Con chưa được ghép vào lớp. Hãy liên hệ giáo viên.';

/** Shown wherever homework would be listed for a student without a class. */
export const NoClassNotice: React.FC<{ className?: string }> = ({ className = '' }) => (
  <div className={`flex items-start gap-3 rounded-3xl bg-[#FFF3C4] p-4 text-[#7A5600] ring-1 ring-[#F5D77A] ${className}`}>
    <TriangleAlert className="mt-0.5 h-5 w-5 shrink-0" />
    <p className="text-sm font-extrabold sm:text-base">{NO_CLASS_MESSAGE}</p>
  </div>
);

const STAT_STYLES = {
  todo: 'bg-[#FFF3C4] text-[#7A5600]',
  done: 'bg-[#E3F7EA] text-[#1F7A4F]',
  topics: 'bg-[#EFE7FF] text-[#5B3FB8]',
};

const DOORS: {
  id: HomeTarget;
  title: string;
  icon: React.ElementType;
  card: string;
  badge: string;
}[] = [
  { id: 'homework', title: 'Bài tập của con', icon: BookOpen, card: 'bg-[#E3F4FF] ring-[#B9E2FB]', badge: 'bg-[#3BA4E8]' },
  { id: 'practice', title: 'Luyện Toán cùng Mimo', icon: Sparkles, card: 'bg-[#EFE7FF] ring-[#D7C8FF]', badge: 'bg-[#8B6CF0]' },
  { id: 'comments', title: 'Nhận xét của cô', icon: MessageSquareHeart, card: 'bg-[#FFF3C4] ring-[#F5D77A]', badge: 'bg-[#E9A800]' },
  { id: 'games', title: 'Trò chơi Toán học', icon: Gamepad2, card: 'bg-[#E3F7EA] ring-[#BDE8CB]', badge: 'bg-[#34B36F]' },
];

interface StudentHomeProps {
  name: string;
  classes: ClassRoom[];
  pending: StudentAssignment[];
  completedCount: number;
  assignmentsMap: Record<string, Assignment>;
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
  classes,
  pending,
  completedCount,
  assignmentsMap,
  openTopics,
  totalTopics,
  comments,
  gamesCount,
  onNavigate,
  onOpenAssignment,
}) => {
  const hasClass = classes.length > 0;
  const subtitles: Record<HomeTarget, string> = {
    homework: !hasClass ? 'Chưa ghép lớp' : pending.length > 0 ? `${pending.length} bài cần làm` : 'Đã làm hết bài',
    practice: openTopics === null ? `${totalTopics} chuyên đề` : `${openTopics}/${totalTopics} chuyên đề đã mở`,
    comments: comments.length > 0 ? `${comments.length} phiếu nhận xét` : 'Chưa có nhận xét',
    games: gamesCount > 0 ? `${gamesCount} trò chơi` : 'Sắp có trò chơi',
  };

  return (
    <div className="space-y-6">
      {/* Greeting */}
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#E3F4FF] via-[#F4EEFF] to-[#FFF3C4] p-5 ring-1 ring-[#D9ECFA] sm:p-7">
        <div className="pointer-events-none absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/50" aria-hidden="true" />
        <div className="pointer-events-none absolute -bottom-12 left-1/3 h-32 w-32 rounded-full bg-white/40" aria-hidden="true" />
        <div className="relative flex flex-col gap-5 sm:flex-row sm:items-center">
          <MimoMascot size={88} eager className="hidden ring-white sm:block" />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-extrabold text-[#3B7FC4]">Góc học tập của con</p>
            <h1 className="mt-1 font-display text-2xl leading-tight font-extrabold text-[#1F2A55] sm:text-3xl">
              Chào {name}! 👋
            </h1>
            {hasClass ? (
              <p className="mt-2 inline-flex max-w-full items-center gap-2 rounded-full bg-white/80 px-3.5 py-1.5 text-sm font-bold text-[#1F2A55]">
                <School className="h-4 w-4 shrink-0 text-[#3BA4E8]" />
                <span className="truncate">Lớp {classes.map((c) => c.name).join(', ')}</span>
              </p>
            ) : (
              <NoClassNotice className="mt-3" />
            )}
          </div>
        </div>

        <div className="relative mt-5 grid grid-cols-3 gap-2.5 sm:gap-4">
          {(
            [
              { key: 'todo', value: hasClass ? pending.length : '–', label: 'Bài cần làm' },
              { key: 'done', value: hasClass ? completedCount : '–', label: 'Bài đã hoàn thành' },
              { key: 'topics', value: openTopics ?? '…', label: 'Chuyên đề đang mở' },
            ] as const
          ).map((s) => (
            <div key={s.key} className={`rounded-2xl px-2 py-3 text-center sm:px-4 sm:py-4 ${STAT_STYLES[s.key]}`}>
              <div className="font-display text-2xl font-extrabold tabular-nums sm:text-3xl">{s.value}</div>
              <div className="mt-0.5 text-[11px] leading-tight font-bold sm:text-sm">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* Four doors */}
      <section aria-label="Đi tới" className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        {DOORS.map((d) => {
          const Icon = d.icon;
          return (
            <button
              key={d.id}
              type="button"
              onClick={() => onNavigate(d.id)}
              className={`group flex min-h-[148px] flex-col items-start rounded-3xl p-4 text-left ring-1 transition duration-200 hover:-translate-y-1 hover:shadow-[0_14px_30px_-16px_rgba(31,42,85,0.35)] focus-visible:ring-4 focus-visible:ring-[#3BA4E8] focus-visible:outline-none sm:min-h-[168px] sm:p-5 ${d.card}`}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl text-white shadow-sm transition group-hover:scale-110 sm:h-14 sm:w-14 ${d.badge}`}>
                <Icon className="h-6 w-6 sm:h-7 sm:w-7" />
              </span>
              <span className="mt-3 font-display text-base leading-snug font-extrabold text-[#1F2A55] sm:text-lg">{d.title}</span>
              <span className="mt-auto flex w-full items-center justify-between pt-2 text-xs font-bold text-[#56608A] sm:text-sm">
                {subtitles[d.id]}
                <ChevronRight className="h-4 w-4 shrink-0 transition group-hover:translate-x-1" />
              </span>
            </button>
          );
        })}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
        {/* Homework to do now */}
        <section className="rounded-3xl bg-white p-5 ring-1 ring-[#EFE9DA] lg:col-span-7">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold text-[#1F2A55]">Bài cần làm ngay</h2>
            {hasClass && (
              <button type="button" onClick={() => onNavigate('homework')} className="min-h-[40px] text-sm font-bold text-[#3B7FC4] hover:underline">
                Tất cả →
              </button>
            )}
          </div>
          {!hasClass ? (
            <p className="mt-3 text-sm text-[#56608A]">Khi cô ghép con vào lớp, bài tập sẽ hiện ở đây.</p>
          ) : pending.length === 0 ? (
            <div className="mt-4 flex items-center gap-3 rounded-2xl bg-[#E3F7EA] p-4 text-[#1F7A4F]">
              <CheckCircle2 className="h-6 w-6 shrink-0" />
              <p className="text-sm font-extrabold">Tuyệt vời! Con đã làm hết bài tập rồi.</p>
            </div>
          ) : (
            <ul className="mt-4 space-y-2.5">
              {pending.slice(0, 4).map((sa) => {
                const asg = assignmentsMap[sa.assignmentId];
                return (
                  <li key={sa.id}>
                    <button
                      type="button"
                      onClick={() => onOpenAssignment(sa.assignmentId)}
                      className="flex min-h-[64px] w-full items-center gap-3 rounded-2xl bg-[#FFFBF2] px-4 py-3 text-left ring-1 ring-[#F1E6C8] transition hover:bg-[#FFF3C4]"
                    >
                      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFE48A] text-[#7A5600]">
                        <BookOpen className="h-5 w-5" />
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-display text-base font-extrabold text-[#1F2A55]">{asg.title}</span>
                        <span className="block text-xs font-bold text-[#8A6A1F]">
                          {sa.status === 'returned' ? 'Cần sửa lại' : sa.status === 'in_progress' ? 'Đang làm dở' : 'Bài mới'} · Hạn {asg.dueAt}
                        </span>
                      </span>
                      <ChevronRight className="h-5 w-5 shrink-0 text-[#C9A13A]" />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        {/* Latest teacher comment */}
        <section className="rounded-3xl bg-white p-5 ring-1 ring-[#EFE9DA] lg:col-span-5">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-lg font-extrabold text-[#1F2A55]">Lời nhắn của cô</h2>
            {comments.length > 0 && (
              <button type="button" onClick={() => onNavigate('comments')} className="min-h-[40px] text-sm font-bold text-[#3B7FC4] hover:underline">
                Xem thêm →
              </button>
            )}
          </div>
          {comments.length === 0 ? (
            <p className="mt-3 text-sm text-[#56608A]">Cô chưa gửi nhận xét nào. Con cố gắng nhé!</p>
          ) : (
            <div className="mt-4 rounded-2xl bg-[#EFE7FF] p-4">
              <div className="flex items-center gap-1.5 text-xs font-extrabold text-[#5B3FB8]">
                <Star className="h-4 w-4 fill-[#FFD34E] text-[#E9A800]" />
                {comments[0].month ? `Tháng ${comments[0].month}/${comments[0].year}` : 'Nhận xét mới'}
              </div>
              <p className="mt-2 line-clamp-4 text-sm leading-relaxed text-[#1F2A55]">{comments[0].strengths}</p>
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
