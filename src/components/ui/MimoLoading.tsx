import React from 'react';
import { MimoMascot } from '../../features/practice/student/practiceTheme';

/**
 * Branded waiting screen: Mimo on a pastel sky background with gently bouncing
 * dots. Shown only while something is really loading (code chunk or data).
 * `page` fills the screen; `section` sits inside a page that is already shown.
 */
export const MIMO_LOADING_TEXT = 'Mimo đang chuẩn bị bài học cho con...';

export const MimoLoading: React.FC<{ variant?: 'page' | 'section'; text?: string }> = ({
  variant = 'section',
  text = MIMO_LOADING_TEXT,
}) => (
  <div
    role="status"
    aria-live="polite"
    className={`flex flex-col items-center justify-center gap-4 bg-gradient-to-b from-[#E3F1FF] to-[#F4EEFF] text-center ${
      variant === 'page' ? 'min-h-screen p-6' : 'min-h-[320px] rounded-[2rem] p-8'
    }`}
  >
    <MimoMascot size={variant === 'page' ? 120 : 96} eager className="mimo-float" />
    <p className="font-display text-lg font-extrabold text-[#1F2A55] sm:text-xl">{text}</p>
    <span className="flex gap-2" aria-hidden="true">
      {[0, 1, 2].map((i) => (
        <span key={i} className="mimo-dot h-3 w-3 rounded-full bg-[#2563EB]" style={{ animationDelay: `${i * 0.15}s` }} />
      ))}
    </span>
  </div>
);
