import React from 'react';

/**
 * Original flat illustrations for MimoEDU teaching tools (MimoEDU palette:
 * navy #071A63, blue #1267E9, sky #54C8FF, yellow #FFD34E, pink #FF76B5, violet #7B5CFF).
 */

const Frame: React.FC<{ bg: string; children: React.ReactNode }> = ({ bg, children }) => (
  <svg viewBox="0 0 160 110" className="h-full w-full" aria-hidden="true">
    <rect width="160" height="110" rx="18" fill={bg} />
    <circle cx="138" cy="18" r="3" fill="#FFFFFF" opacity="0.8" />
    <circle cx="20" cy="92" r="2" fill="#FFFFFF" opacity="0.8" />
    <path d="M24 16 l2 5 5 2 -5 2 -2 5 -2 -5 -5 -2 5 -2z" fill="#FFD34E" />
    {children}
  </svg>
);

export const RandomPickerArt = () => (
  <Frame bg="#EAF5FF">
    {/* spinning wheel */}
    <g transform="translate(58 56)">
      {['#1267E9', '#54C8FF', '#FFD34E', '#FF76B5', '#7B5CFF', '#22C38E'].map((c, i) => (
        <path key={c} d="M0 0 L0 -34 A34 34 0 0 1 29.4 -17 Z" fill={c} transform={`rotate(${i * 60})`} />
      ))}
      <circle r="8" fill="#FFFFFF" stroke="#071A63" strokeWidth="3" />
      <path d="M-5 -40 L5 -40 L0 -30 Z" fill="#071A63" />
    </g>
    {/* group bubbles */}
    {[[118, 40, '#FF76B5'], [134, 60, '#1267E9'], [112, 76, '#FFD34E']].map(([x, y, c]) => (
      <g key={`${x}`} transform={`translate(${x} ${y})`}>
        <circle r="10" fill={c as string} />
        <circle cy="-3" r="3.5" fill="#FFFFFF" />
        <path d="M-6 6 a6 5 0 0 1 12 0" fill="#FFFFFF" />
      </g>
    ))}
  </Frame>
);

export const CountdownArt = () => (
  <Frame bg="#FFF6DC">
    <g transform="translate(80 58)">
      <rect x="-8" y="-46" width="16" height="9" rx="3" fill="#071A63" />
      <circle r="36" fill="#FFFFFF" stroke="#071A63" strokeWidth="5" />
      <path d="M0 0 L0 -31 A31 31 0 0 1 26.8 15.5 Z" fill="#FFD34E" />
      <circle r="4" fill="#071A63" />
      <path d="M0 0 L0 -22" stroke="#071A63" strokeWidth="4" strokeLinecap="round" />
      <path d="M0 0 L14 8" stroke="#FF76B5" strokeWidth="4" strokeLinecap="round" />
    </g>
    <path d="M128 34 q8 6 0 14 M136 28 q14 12 0 26" fill="none" stroke="#FF76B5" strokeWidth="3" strokeLinecap="round" />
  </Frame>
);

export const QuickQuizArt = () => (
  <Frame bg="#F3EFFF">
    <rect x="30" y="20" width="100" height="44" rx="10" fill="#FFFFFF" stroke="#7B5CFF" strokeWidth="3" />
    <text x="80" y="49" textAnchor="middle" fontSize="20" fontWeight="800" fill="#071A63" fontFamily="system-ui">7 × 8 = ?</text>
    {[['A', 30, '#1267E9'], ['B', 56, '#FF76B5'], ['C', 82, '#FFD34E'], ['D', 108, '#22C38E']].map(([l, x, c]) => (
      <g key={l as string} transform={`translate(${x} 72)`}>
        <rect width="22" height="22" rx="6" fill={c as string} />
        <text x="11" y="16" textAnchor="middle" fontSize="13" fontWeight="800" fill="#FFFFFF" fontFamily="system-ui">{l}</text>
      </g>
    ))}
  </Frame>
);

export const PuzzleArt = () => (
  <Frame bg="#FFEDF6">
    <g transform="translate(36 18)">
      {[0, 1, 2].map((r) =>
        [0, 1, 2, 3].map((c) => {
          const open = (r + c) % 3 === 0;
          return (
            <rect
              key={`${r}-${c}`}
              x={c * 23}
              y={r * 25}
              width="21"
              height="23"
              rx="5"
              fill={open ? '#54C8FF' : '#7B5CFF'}
              opacity={open ? 0.55 : 1}
            />
          );
        })
      )}
      <text x="46" y="48" textAnchor="middle" fontSize="22" fontWeight="900" fill="#FFD34E" fontFamily="system-ui">?</text>
    </g>
  </Frame>
);

export const ScoreboardArt = () => (
  <Frame bg="#E7F7F0">
    {[[34, 50, '#1267E9', 'A'], [70, 34, '#FFD34E', 'B'], [106, 62, '#FF76B5', 'C']].map(([x, h, c, l]) => (
      <g key={l as string}>
        <rect x={x as number} y={96 - (h as number)} width="26" height={h as number} rx="6" fill={c as string} />
        <text x={(x as number) + 13} y={92} textAnchor="middle" fontSize="12" fontWeight="800" fill="#FFFFFF" fontFamily="system-ui">{l}</text>
      </g>
    ))}
    <path d="M76 14 h14 v8 a7 7 0 0 1 -14 0z" fill="#FFD34E" stroke="#071A63" strokeWidth="2" />
    <rect x="80" y="29" width="6" height="4" fill="#071A63" />
  </Frame>
);

export const GamesArt = () => (
  <Frame bg="#EAF5FF">
    <rect x="34" y="34" width="92" height="46" rx="23" fill="#1267E9" />
    <path d="M58 50 v14 M51 57 h14" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" />
    <circle cx="100" cy="51" r="5" fill="#FFD34E" />
    <circle cx="110" cy="62" r="5" fill="#FF76B5" />
  </Frame>
);

export const Geometry3DArt = () => (
  <Frame bg="#F3EFFF">
    <g transform="translate(80 60)">
      <path d="M0 -36 L32 -18 L32 18 L0 36 L-32 18 L-32 -18 Z" fill="#7B5CFF" />
      <path d="M0 -36 L32 -18 L0 0 L-32 -18 Z" fill="#B49CFF" />
      <path d="M0 0 L32 -18 L32 18 L0 36 Z" fill="#5B3FD1" />
    </g>
  </Frame>
);

export const PracticeArt = () => (
  <Frame bg="#071A63">
    <circle cx="120" cy="28" r="14" fill="#FFD34E" />
    <path d="M52 84 L62 42 Q70 22 78 42 L88 84 Z" fill="#FFFFFF" />
    <circle cx="70" cy="50" r="6" fill="#54C8FF" />
    <path d="M60 84 L70 98 L80 84 Z" fill="#FF76B5" />
  </Frame>
);

export const TugOfWarArt = () => (
  <Frame bg="#EAF5FF">
    <path d="M18 70 C 60 74, 100 66, 142 70" stroke="#B7790A" strokeWidth="5" fill="none" strokeLinecap="round" />
    {[[34, '#1267E9'], [54, '#1267E9'], [106, '#E5484D'], [126, '#E5484D']].map(([x, c]) => (
      <g key={`${x}`} transform={`translate(${x} 0)`}>
        <rect x="-7" y="62" width="14" height="22" rx="5" fill={c as string} />
        <circle cy="54" r="9" fill="#FFFFFF" stroke={c as string} strokeWidth="3" />
      </g>
    ))}
    <rect x="78" y="44" width="3" height="30" fill="#071A63" />
    <path d="M81 44 L98 50 L81 56 Z" fill="#FF76B5" />
  </Frame>
);

export const MindMapArt = () => (
  <Frame bg="#FFF6DC">
    {[[34, 30, '#1267E9'], [126, 30, '#FF76B5'], [34, 84, '#7B5CFF'], [126, 84, '#22C38E']].map(([x, y, c]) => (
      <g key={`${x}-${y}`}>
        <path d={`M80 57 Q ${(80 + (x as number)) / 2} ${y} ${x} ${y}`} stroke={c as string} strokeWidth="4" fill="none" />
        <rect x={(x as number) - 16} y={(y as number) - 9} width="32" height="18" rx="9" fill={c as string} />
      </g>
    ))}
    <rect x="58" y="44" width="44" height="26" rx="13" fill="#071A63" />
    <circle cx="80" cy="57" r="5" fill="#FFD34E" />
  </Frame>
);
