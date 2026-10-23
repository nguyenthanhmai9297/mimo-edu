import React from 'react';
import { formatClock } from './toolUtils';

/** Shared look of Mimo Quiz answer tiles and countdown (presentation and join modes). */
export const TILE = [
  { bg: 'bg-[#1267E9]', shape: '▲' },
  { bg: 'bg-[#FF4F9A]', shape: '◆' },
  { bg: 'bg-[#F5A800]', shape: '●' },
  { bg: 'bg-[#7B5CFF]', shape: '■' },
  { bg: 'bg-[#13B5C9]', shape: '★' },
  { bg: 'bg-[#22C38E]', shape: '✚' },
];
export const LETTERS = 'ABCDEF';

export const TimerRing: React.FC<{ left: number; total: number; big: boolean }> = ({ left, total, big }) => {
  const r = 34;
  const c = 2 * Math.PI * r;
  const frac = total > 0 ? left / total : 0;
  const warn = left <= 5;
  return (
    <div className={`relative ${big ? 'h-28 w-28' : 'h-20 w-20'}`} role="timer" aria-label={`Còn ${left} giây`}>
      <svg viewBox="0 0 80 80" className="h-full w-full -rotate-90">
        <circle cx="40" cy="40" r={r} fill="none" stroke="#EAF5FF" strokeWidth="8" />
        <circle
          cx="40"
          cy="40"
          r={r}
          fill="none"
          stroke={warn ? '#E5484D' : '#1267E9'}
          strokeWidth="8"
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - frac)}
          style={{ transition: 'stroke-dashoffset 0.3s linear' }}
        />
      </svg>
      <span
        className={`absolute inset-0 flex items-center justify-center font-display font-extrabold [font-variant-numeric:tabular-nums] ${warn ? 'text-[#E5484D]' : 'text-[#071A63]'} ${
          big ? (left >= 60 ? 'text-2xl' : 'text-4xl') : left >= 60 ? 'text-base' : 'text-2xl'
        }`}
      >
        {left >= 60 ? formatClock(left) : left}
      </span>
    </div>
  );
};

