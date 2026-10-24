import React, { useState } from 'react';
import {
  BarChart3,
  BookOpenText,
  Brain,
  Calculator,
  Crown,
  Lightbulb,
  LucideIcon,
  Rocket,
  Ruler,
  Sprout,
} from 'lucide-react';
import type { PracticeLevel } from '../../../types/practice';

/**
 * MimoEDU space theme for "Luyện Toán cùng Mimo".
 * Palette: space #1E3A8A · blue #2563EB · sky #54C8FF · yellow #FFD34E · pink #FF76B5 · white.
 */
export const SPACE = {
  navy: '#1E3A8A',
  blue: '#2563EB',
  sky: '#54C8FF',
  yellow: '#FFD34E',
  pink: '#FF76B5',
};

export interface GroupTheme {
  icon: LucideIcon;
  /** Gradient for the icon badge and accents. */
  gradient: string;
  text: string;
  ring: string;
  soft: string;
}

export const GROUP_THEMES: Record<string, GroupTheme> = {
  I: { icon: Calculator, gradient: 'from-[#2563EB] to-[#54C8FF]', text: 'text-[#2563EB]', ring: 'ring-[#54C8FF]', soft: 'bg-[#EAF6FF]' },
  II: { icon: BookOpenText, gradient: 'from-[#FF76B5] to-[#FFB3D6]', text: 'text-[#D9468C]', ring: 'ring-[#FF76B5]', soft: 'bg-[#FFF0F7]' },
  III: { icon: Ruler, gradient: 'from-[#FFB800] to-[#FFD34E]', text: 'text-[#B7790A]', ring: 'ring-[#FFD34E]', soft: 'bg-[#FFF8E1]' },
  IV: { icon: BarChart3, gradient: 'from-[#13B5C9] to-[#54C8FF]', text: 'text-[#0E8FA3]', ring: 'ring-[#54C8FF]', soft: 'bg-[#E8FAFC]' },
  V: { icon: Brain, gradient: 'from-[#7B5CFF] to-[#FF76B5]', text: 'text-[#6A4BE6]', ring: 'ring-[#B49CFF]', soft: 'bg-[#F3EFFF]' },
};

export interface LevelTheme {
  icon: LucideIcon;
  gradient: string;
  soft: string;
  text: string;
  hint: string;
}

export const LEVEL_THEMES: Record<PracticeLevel, LevelTheme> = {
  nhan_biet: { icon: Sprout, gradient: 'from-[#22C38E] to-[#54C8FF]', soft: 'bg-[#EAFBF4]', text: 'text-[#119468]', hint: 'Làm quen kiến thức' },
  thong_hieu: { icon: Lightbulb, gradient: 'from-[#2563EB] to-[#54C8FF]', soft: 'bg-[#EAF6FF]', text: 'text-[#2563EB]', hint: 'Hiểu sâu hơn' },
  van_dung: { icon: Rocket, gradient: 'from-[#FFB800] to-[#FFD34E]', soft: 'bg-[#FFF8E1]', text: 'text-[#B7790A]', hint: 'Áp dụng vào bài toán' },
  thu_thach: { icon: Crown, gradient: 'from-[#FF76B5] to-[#7B5CFF]', soft: 'bg-[#FFF0F7]', text: 'text-[#D9468C]', hint: 'Dành cho nhà vô địch' },
};

/** The Mimo mascot supplied by the school; white backdrop matches the artwork. */
export const MimoMascot: React.FC<{ size: number; className?: string; eager?: boolean }> = ({
  size,
  className = '',
  eager = false,
}) => (
  <div
    className={`shrink-0 overflow-hidden rounded-full bg-white shadow-[0_12px_30px_-10px_rgba(84,200,255,0.7)] ring-4 ring-white/90 ${className}`}
    style={{ width: size, height: size }}
  >
    <img
      src="/assets/mimo/mimo-480.jpg"
      srcSet="/assets/mimo/mimo-240.jpg 240w, /assets/mimo/mimo-480.jpg 480w, /assets/mimo/mimo-720.jpg 720w"
      sizes={`${size}px`}
      width={size}
      height={size}
      alt="Linh vật Mimo"
      loading={eager ? 'eager' : 'lazy'}
      decoding="async"
      className="h-full w-full scale-[1.08] object-cover"
    />
  </div>
);

/** Small speech bubble next to Mimo. */
export const MimoSays: React.FC<{ children: React.ReactNode; size?: number }> = ({ children, size = 64 }) => (
  <div className="flex items-center gap-3">
    <MimoMascot size={size} />
    <div className="relative rounded-2xl bg-white px-4 py-2.5 text-sm font-bold text-[#1E3A8A] shadow-sm ring-1 ring-[#54C8FF]/40">
      {children}
    </div>
  </div>
);

export const ProgressBar: React.FC<{ value: number; className?: string; track?: string; fill?: string }> = ({
  value,
  className = '',
  track = 'bg-[#EAF6FF]',
  fill = 'bg-gradient-to-r from-[#54C8FF] via-[#2563EB] to-[#FF76B5]',
}) => (
  <div className={`h-3 overflow-hidden rounded-full ${track} ${className}`}>
    <div
      className={`h-full rounded-full transition-[width] duration-500 ${fill}`}
      style={{ width: `${Math.round(Math.min(1, Math.max(0, value)) * 100)}%` }}
    />
  </div>
);

/** Light decorative layer: stars, planets, orbits and sparkles. Purely visual. */
export const SpaceDecor: React.FC = () => (
  <svg
    aria-hidden="true"
    className="pointer-events-none absolute inset-0 h-full w-full"
    preserveAspectRatio="xMidYMid slice"
    viewBox="0 0 1200 900"
  >
    <defs>
      <radialGradient id="mimo-planet-a" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#FFD34E" />
        <stop offset="100%" stopColor="#FF9F43" />
      </radialGradient>
      <radialGradient id="mimo-planet-b" cx="35%" cy="35%" r="70%">
        <stop offset="0%" stopColor="#FF9ACB" />
        <stop offset="100%" stopColor="#FF76B5" />
      </radialGradient>
    </defs>
    {/* orbits */}
    <path d="M-50 260 C 300 120, 700 420, 1250 180" fill="none" stroke="#54C8FF" strokeOpacity="0.18" strokeWidth="2" strokeDasharray="6 10" />
    <path d="M-50 760 C 400 620, 800 900, 1250 640" fill="none" stroke="#FF76B5" strokeOpacity="0.14" strokeWidth="2" strokeDasharray="4 12" />
    {/* planets */}
    <circle cx="1110" cy="120" r="34" fill="url(#mimo-planet-a)" opacity="0.85" />
    <ellipse cx="1110" cy="122" rx="56" ry="12" fill="none" stroke="#FFD34E" strokeOpacity="0.55" strokeWidth="3" />
    <circle cx="70" cy="560" r="22" fill="url(#mimo-planet-b)" opacity="0.7" />
    {/* geometry */}
    <polygon points="1080,520 1110,570 1050,570" fill="none" stroke="#54C8FF" strokeOpacity="0.35" strokeWidth="2.5" />
    <rect x="120" y="140" width="34" height="34" rx="6" fill="none" stroke="#FFD34E" strokeOpacity="0.35" strokeWidth="2.5" transform="rotate(18 137 157)" />
    <circle cx="980" cy="820" r="18" fill="none" stroke="#FF76B5" strokeOpacity="0.35" strokeWidth="2.5" />
    {/* sparkles */}
    {[
      [210, 70, 1], [480, 40, 0.7], [760, 90, 0.9], [940, 300, 0.6], [330, 380, 0.5],
      [1150, 420, 0.8], [60, 820, 0.7], [600, 860, 0.6], [880, 640, 0.5], [260, 650, 0.8],
    ].map(([x, y, s], i) => (
      <path
        key={i}
        className="mimo-twinkle"
        style={{ animationDelay: `${(i % 5) * 0.6}s` }}
        transform={`translate(${x} ${y}) scale(${s})`}
        d="M0 -12 C 2 -3, 3 -2, 12 0 C 3 2, 2 3, 0 12 C -2 3, -3 2, -12 0 C -3 -2, -2 -3, 0 -12 Z"
        fill={i % 3 === 0 ? '#FFD34E' : '#FFFFFF'}
        opacity="0.8"
      />
    ))}
    {Array.from({ length: 26 }, (_, i) => (
      <circle key={`d${i}`} cx={(i * 397) % 1200} cy={(i * 241) % 900} r={i % 4 === 0 ? 2.2 : 1.3} fill="#FFFFFF" opacity={0.25 + (i % 5) * 0.1} />
    ))}
  </svg>
);

export const HERO_IMAGE = '/images/mimo-hero-space.png';
/** [width, path] – generated from the PNG with cwebp (q85, sharp YUV). */
const HERO_IMAGE_WEBP: [number, string][] = [
  [800, '/images/mimo-hero-space-800.webp'],
  [1200, '/images/mimo-hero-space-1200.webp'],
  [1672, '/images/mimo-hero-space-1672.webp'],
];

/**
 * Hero banner from the school's artwork. The image already contains the title,
 * tagline and a "Bắt đầu ngay" visual, so nothing is drawn on top of it; the
 * whole banner acts as that button. Until the file exists a simple space panel
 * with the mascot is shown instead.
 */
export const HeroBanner: React.FC<{ onStart: () => void }> = ({ onStart }) => {
  const [missing, setMissing] = useState(false);

  if (missing) {
    return (
      <button
        type="button"
        onClick={onStart}
        className="relative flex w-full flex-col-reverse items-center gap-4 overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#0B2A8F] via-[#2563EB] to-[#54C8FF] p-6 text-center text-white shadow-[0_24px_60px_-30px_rgba(37,99,235,0.9)] sm:flex-row sm:justify-between sm:p-8 sm:text-left"
      >
        <div>
          <h1 className="font-display text-3xl font-extrabold sm:text-4xl">
            Luyện Toán cùng <span className="text-[#FFD34E]">Mimo</span>
          </h1>
          <p className="mt-2 text-base font-bold text-white/90 sm:text-lg">Mỗi bài toán là một khám phá thú vị!</p>
          <span className="mt-4 inline-flex min-h-[48px] items-center rounded-full bg-[#FFD34E] px-6 text-base font-extrabold text-[#1E3A8A] shadow-md">
            Bắt đầu ngay
          </span>
        </div>
        <div className="mimo-float">
          <MimoMascot size={168} eager />
        </div>
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onStart}
      aria-label="Bắt đầu ngay – chọn chuyên đề để luyện tập"
      className="group block w-full overflow-hidden rounded-[2rem] shadow-[0_24px_60px_-30px_rgba(84,200,255,0.9)] ring-1 ring-white/20 transition duration-300 hover:-translate-y-0.5 hover:shadow-[0_28px_70px_-28px_rgba(84,200,255,1)] focus-visible:ring-4 focus-visible:ring-[#FFD34E] focus-visible:outline-none"
    >
      {/* Natural aspect ratio: never stretched or cropped. Compressed WebP sizes
          are picked by screen width; the original PNG is the fallback. */}
      <picture>
        <source
          type="image/webp"
          srcSet={HERO_IMAGE_WEBP.map(([w, src]) => `${src} ${w}w`).join(', ')}
          sizes="(min-width: 1152px) 1060px, calc(100vw - 48px)"
        />
        <img
          src={HERO_IMAGE}
          width={1672}
          height={941}
          alt="Luyện Toán cùng Mimo – Học tập vui vẻ, khám phá tư duy, chinh phục Toán học. Bắt đầu ngay"
          className="block h-auto w-full"
          loading="eager"
          decoding="async"
          onError={() => setMissing(true)}
        />
      </picture>
    </button>
  );
};
