import React from 'react';
import {
  AlarmClock,
  CheckCircle2,
  CircleDot,
  Lock,
  LucideIcon,
  PencilLine,
  PlayCircle,
  RotateCcw,
  Send,
  Sparkles,
  Star,
  Trophy,
  Unlock,
} from 'lucide-react';
import { MimoMascot } from '../practice/student/practiceTheme';

/**
 * Shared look of the student portal: Mimo-blue banners and bright pastel tones on a sky-blue page,
 * big rounded cards with soft shadows, chunky buttons. Teacher pages don't use
 * any of this (see also `.student-skin` in index.css).
 */

export type Tone = 'blue' | 'teal' | 'yellow' | 'pink' | 'purple' | 'green' | 'red' | 'gray';

/** Full class strings so Tailwind keeps them. */
export const TONE: Record<Tone, { soft: string; text: string; solid: string; ring: string; shadow: string }> = {
  blue: { soft: 'bg-[#E3F1FF]', text: 'text-[#1E40AF]', solid: 'bg-[#2563EB]', ring: 'ring-[#B9DBFF]', shadow: 'shadow-[0_4px_0_0_#1E40AF]' },
  teal: { soft: 'bg-[#DDF7F3]', text: 'text-[#0F766E]', solid: 'bg-[#14B8A6]', ring: 'ring-[#A8E8DE]', shadow: 'shadow-[0_4px_0_0_#0F766E]' },
  yellow: { soft: 'bg-[#FFF3C4]', text: 'text-[#7A5600]', solid: 'bg-[#F5B700]', ring: 'ring-[#F5D77A]', shadow: 'shadow-[0_4px_0_0_#B98700]' },
  pink: { soft: 'bg-[#FFE6F0]', text: 'text-[#B83270]', solid: 'bg-[#FF6FA8]', ring: 'ring-[#FFC2DA]', shadow: 'shadow-[0_4px_0_0_#C2457E]' },
  purple: { soft: 'bg-[#EFE7FF]', text: 'text-[#5B3FB8]', solid: 'bg-[#8B6CF0]', ring: 'ring-[#D7C8FF]', shadow: 'shadow-[0_4px_0_0_#5B3FB8]' },
  green: { soft: 'bg-[#E3F7EA]', text: 'text-[#1F7A4F]', solid: 'bg-[#34B36F]', ring: 'ring-[#BDE8CB]', shadow: 'shadow-[0_4px_0_0_#1F7A4F]' },
  red: { soft: 'bg-[#FFE9EC]', text: 'text-[#C2364F]', solid: 'bg-[#F0506E]', ring: 'ring-[#FFC6D0]', shadow: 'shadow-[0_4px_0_0_#C2364F]' },
  gray: { soft: 'bg-[#F1F3FA]', text: 'text-[#5A6B9A]', solid: 'bg-[#8A9BC4]', ring: 'ring-[#DCE2F2]', shadow: 'shadow-[0_4px_0_0_#5A6B9A]' },
};

export const INK = 'text-[#1F2A55]';
export const MUTED = 'text-[#56608A]';
export const CARD = 'rounded-[1.75rem] bg-white ring-1 ring-[#DBE5F7] shadow-[0_10px_28px_-18px_rgba(30,64,175,0.45)]';
const FOCUS = 'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-[#2563EB]/40';

export const StudentCard: React.FC<React.HTMLAttributes<HTMLDivElement> & { padded?: boolean }> = ({
  className = '',
  padded = true,
  children,
  ...rest
}) => (
  <div className={`${CARD} ${padded ? 'p-5 sm:p-6' : ''} ${className}`} {...rest}>
    {children}
  </div>
);

/** Page banner of a portal tab: Mimo-blue gradient, white title, robot Mimo on the right. */
export const StudentBanner: React.FC<{
  icon: LucideIcon;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  children?: React.ReactNode;
}> = ({ icon: Icon, title, subtitle, children }) => (
  <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#1E40AF] via-[#2563EB] to-[#38BDF8] p-5 text-white shadow-[0_18px_40px_-22px_rgba(37,99,235,0.85)] sm:p-7">
    <div className="pointer-events-none absolute -top-16 -right-12 h-52 w-52 rounded-full bg-white/15" aria-hidden="true" />
    <div className="pointer-events-none absolute -bottom-16 left-1/3 h-36 w-36 rounded-full bg-[#FFD34E]/30 blur-xl" aria-hidden="true" />
    <span className="pointer-events-none absolute top-5 left-[55%] text-xl" aria-hidden="true">✨</span>
    <div className="relative flex items-center gap-4">
      <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/40">
        <Icon className="h-7 w-7" />
      </span>
      <div className="min-w-0 flex-1">
        <h1 className="font-display text-2xl leading-tight font-extrabold sm:text-3xl">{title}</h1>
        {subtitle && <p className="mt-1 text-base text-white/90">{subtitle}</p>}
      </div>
      <MimoMascot size={88} className="hidden sm:block" />
    </div>
    {children && <div className="relative mt-4">{children}</div>}
  </section>
);

export const SectionTitle: React.FC<{
  icon: LucideIcon;
  tone?: Tone;
  title: React.ReactNode;
  subtitle?: React.ReactNode;
  action?: React.ReactNode;
  as?: 'h1' | 'h2';
}> = ({ icon: Icon, tone = 'blue', title, subtitle, action, as: Tag = 'h2' }) => (
  <div className="flex flex-wrap items-center justify-between gap-3">
    <div className="flex min-w-0 items-center gap-3">
      <span className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl ${TONE[tone].soft} ${TONE[tone].text}`}>
        <Icon className="h-6 w-6" />
      </span>
      <div className="min-w-0">
        <Tag className={`font-display font-extrabold ${INK} ${Tag === 'h1' ? 'text-2xl sm:text-3xl' : 'text-lg sm:text-xl'}`}>{title}</Tag>
        {subtitle && <p className={`text-sm ${MUTED}`}>{subtitle}</p>}
      </div>
    </div>
    {action}
  </div>
);

export type StatusKind =
  | 'todo'
  | 'in_progress'
  | 'returned'
  | 'overdue'
  | 'submitted'
  | 'graded'
  | 'open'
  | 'learning'
  | 'done'
  | 'locked'
  | 'soon';

export const STATUS: Record<StatusKind, { label: string; tone: Tone; icon: LucideIcon }> = {
  todo: { label: 'Cần làm', tone: 'yellow', icon: CircleDot },
  in_progress: { label: 'Đang làm', tone: 'blue', icon: PencilLine },
  returned: { label: 'Cần làm lại', tone: 'pink', icon: RotateCcw },
  overdue: { label: 'Quá hạn', tone: 'red', icon: AlarmClock },
  submitted: { label: 'Đã nộp', tone: 'teal', icon: Send },
  graded: { label: 'Đã chấm', tone: 'green', icon: Star },
  open: { label: 'Đã mở', tone: 'green', icon: Unlock },
  learning: { label: 'Đang học', tone: 'purple', icon: PlayCircle },
  done: { label: 'Hoàn thành', tone: 'yellow', icon: Trophy },
  locked: { label: 'Chưa mở', tone: 'gray', icon: Lock },
  soon: { label: 'Sắp ra mắt', tone: 'purple', icon: Sparkles },
};

export const StatusBadge: React.FC<{ status: StatusKind; label?: string; className?: string }> = ({ status, label, className = '' }) => {
  const s = STATUS[status];
  const Icon = s.icon;
  return (
    <span className={`inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-xs font-extrabold whitespace-nowrap sm:text-[13px] ${TONE[s.tone].soft} ${TONE[s.tone].text} ${className}`}>
      <Icon className="h-3.5 w-3.5" /> {label ?? s.label}
    </span>
  );
};

type ButtonVariant = 'primary' | 'accent' | 'soft' | 'quiet';

/** Chunky "toy" button: presses down on click, clear focus ring. */
export function studentButton(variant: ButtonVariant = 'primary', tone: Tone = 'blue', extra = ''): string {
  const base = `inline-flex min-h-[48px] items-center justify-center gap-2 rounded-2xl px-5 font-display text-base font-extrabold transition duration-150 active:translate-y-0.5 disabled:cursor-not-allowed disabled:opacity-50 ${FOCUS}`;
  const look = {
    primary: `${TONE[tone].solid} text-white ${TONE[tone].shadow} hover:brightness-105 active:shadow-none`,
    accent: `bg-[#FFD34E] text-[#1F2A55] shadow-[0_4px_0_0_#C99A00] hover:brightness-105 active:shadow-none`,
    soft: `${TONE[tone].soft} ${TONE[tone].text} hover:brightness-[0.97]`,
    quiet: `bg-white ${INK} ring-1 ring-[#DBE5F7] hover:bg-[#EFF6FF]`,
  }[variant];
  return `${base} ${look} ${extra}`;
}

export const EmptyState: React.FC<{
  title: React.ReactNode;
  text?: React.ReactNode;
  icon?: LucideIcon;
  tone?: Tone;
  mascot?: boolean;
  action?: React.ReactNode;
  compact?: boolean;
}> = ({ title, text, icon: Icon = CheckCircle2, tone = 'blue', mascot = false, action, compact = false }) => (
  <div className={`flex flex-col items-center rounded-3xl text-center ${TONE[tone].soft} ${compact ? 'gap-2 p-5' : 'gap-3 p-8 sm:p-10'}`}>
    {mascot ? (
      <MimoMascot size={compact ? 64 : 88} className="mimo-float" />
    ) : (
      <span className={`flex items-center justify-center rounded-2xl bg-white ${TONE[tone].text} ${compact ? 'h-12 w-12' : 'h-16 w-16'}`}>
        <Icon className={compact ? 'h-6 w-6' : 'h-8 w-8'} />
      </span>
    )}
    <p className={`font-display font-extrabold ${INK} ${compact ? 'text-base' : 'text-lg sm:text-xl'}`}>{title}</p>
    {text && <p className={`max-w-md text-sm sm:text-base ${MUTED}`}>{text}</p>}
    {action}
  </div>
);

const AVATAR_TONES: Tone[] = ['blue', 'pink', 'purple', 'teal', 'yellow', 'green'];

/** Round initial in a tone picked from the name, so each child keeps the same colour. */
export const Avatar: React.FC<{ name: string; size?: number; className?: string }> = ({ name, size = 48, className = '' }) => {
  const tone = AVATAR_TONES[[...name].reduce((n, c) => n + c.charCodeAt(0), 0) % AVATAR_TONES.length];
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-display font-extrabold ring-4 ring-white ${TONE[tone].soft} ${TONE[tone].text} ${className}`}
      style={{ width: size, height: size, fontSize: size * 0.42 }}
      aria-hidden="true"
    >
      {name.trim().slice(0, 1).toUpperCase() || <Star className="h-1/2 w-1/2" />}
    </span>
  );
};
