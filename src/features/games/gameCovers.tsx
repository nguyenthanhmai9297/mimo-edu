import React, { useState } from 'react';
import type { GameCategory, MathGame } from '../../types/domain';

/**
 * Cover images of Kho trò chơi, shared by the teacher Studio and the student
 * portal so both always show the same picture. The library lives in
 * public/game-covers (16:10 SVG, no text). A game stores the chosen path in
 * thumbnailUrl; without one it gets its category's first cover.
 */

export interface GameCoverOption {
  src: string;
  category: GameCategory;
  label: string;
}

export const GAME_COVERS: GameCoverOption[] = [
  { src: '/game-covers/so-hoc-1.svg', category: 'Số học', label: 'Số 1 2 3' },
  { src: '/game-covers/so-hoc-2.svg', category: 'Số học', label: 'Đếm chấm' },
  { src: '/game-covers/phep-tinh-1.svg', category: 'Phép tính', label: 'Bốn phép tính' },
  { src: '/game-covers/phep-tinh-2.svg', category: 'Phép tính', label: 'Tính nhẩm' },
  { src: '/game-covers/hinh-hoc-1.svg', category: 'Hình học', label: 'Các hình' },
  { src: '/game-covers/hinh-hoc-2.svg', category: 'Hình học', label: 'Thước & tam giác' },
  { src: '/game-covers/tu-duy-1.svg', category: 'Tư duy logic', label: 'Ghép hình' },
  { src: '/game-covers/tu-duy-2.svg', category: 'Tư duy logic', label: 'Ý tưởng' },
  { src: '/game-covers/on-tap-1.svg', category: 'Ôn tập kiến thức', label: 'Sách ôn tập' },
  { src: '/game-covers/on-tap-2.svg', category: 'Ôn tập kiến thức', label: 'Ngôi sao' },
];

export function defaultCover(category: GameCategory): string {
  return (GAME_COVERS.find((c) => c.category === category) ?? GAME_COVERS[0]).src;
}

export const isLibraryCover = (src: string | undefined): boolean => Boolean(src && GAME_COVERS.some((c) => c.src === src));

/** Image to show for a game: its own thumbnail, else the category cover. */
export function coverSrc(game: Pick<MathGame, 'category' | 'thumbnailUrl'>): string {
  return game.thumbnailUrl?.trim() || defaultCover(game.category);
}

/**
 * Cover box that fills its parent. Library covers are drawn for 16:10 with
 * safe margins, so they fill the box; a teacher's own picture is shown whole
 * (never stretched or cropped) over a soft blurred copy of itself. A picture
 * that fails to load falls back to the category cover.
 */
export const GameCover: React.FC<{ game: Pick<MathGame, 'category' | 'thumbnailUrl'>; className?: string }> = ({ game, className = '' }) => {
  const wanted = coverSrc(game);
  const [failed, setFailed] = useState<string | null>(null);
  const src = failed === wanted ? defaultCover(game.category) : wanted;
  const own = !isLibraryCover(src);
  // Callers may place the box themselves (absolute inset-0); otherwise it is the positioning parent
  const position = /\b(absolute|fixed)\b/.test(className) ? '' : 'relative';
  return (
    <div className={`${position} overflow-hidden bg-[#EAF5FF] ${className}`} aria-hidden="true">
      {own && <img src={src} alt="" className="absolute inset-0 h-full w-full scale-110 object-cover opacity-40 blur-xl" />}
      <img
        src={src}
        alt=""
        loading="lazy"
        decoding="async"
        onError={() => setFailed(wanted)}
        className={`absolute inset-0 h-full w-full ${own ? 'object-contain' : 'object-cover'}`}
      />
    </div>
  );
};
