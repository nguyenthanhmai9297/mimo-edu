import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, ExternalLink, Gamepad2, Maximize2, RefreshCw, TriangleAlert } from 'lucide-react';
import { MimoLoading } from '../../components/ui/MimoLoading';
import { fetchStudentGames, peekStudentGames, StudentGame } from '../../services/studentPortalService';
import type { GameCategory } from '../../types/domain';
import { EmptyState, INK, MUTED, StudentCard, studentButton, Tone, TONE } from './studentUi';
import { GameCover } from '../games/gameCovers';

/**
 * Trò chơi Toán: the games teachers publish in Kho trò chơi (MimoEDU Studio).
 * Sites that allow framing play inside MimoEDU; the others open in a new tab.
 */

const CATEGORIES: GameCategory[] = ['Số học', 'Phép tính', 'Hình học', 'Tư duy logic', 'Ôn tập kiến thức'];

export const GAME_STYLE: Record<GameCategory, { tone: Tone; emoji: string }> = {
  'Số học': { tone: 'blue', emoji: '🔢' },
  'Phép tính': { tone: 'purple', emoji: '➗' },
  'Hình học': { tone: 'yellow', emoji: '📐' },
  'Tư duy logic': { tone: 'pink', emoji: '🧩' },
  'Ôn tập kiến thức': { tone: 'teal', emoji: '📚' },
};
const styleOf = (c: GameCategory) => GAME_STYLE[c] ?? { tone: 'teal' as Tone, emoji: '🎲' };

const NewTabLink: React.FC<{ game: StudentGame; className: string; children?: React.ReactNode }> = ({ game, className, children }) => (
  <a href={game.embedUrl} target="_blank" rel="noopener noreferrer" className={className}>
    {children ?? 'Chơi trên trang trò chơi'} <ExternalLink className="h-4 w-4" />
  </a>
);

/** The game playing inside MimoEDU, with a way back and a new-tab fallback always in sight. */
const GamePlayer: React.FC<{ game: StudentGame; onBack: () => void }> = ({ game, onBack }) => {
  const frameRef = useRef<HTMLDivElement>(null);
  const unsure = game.embeddable === null;
  return (
    <StudentCard padded={false} className="overflow-hidden">
      <div className="flex flex-wrap items-center gap-3 bg-[#DDF7F3] px-4 py-3 sm:px-5">
        <button type="button" onClick={onBack} className={studentButton('quiet', 'blue', 'min-h-[44px] px-4 text-sm')}>
          <ArrowLeft className="h-4 w-4" /> Quay lại Kho trò chơi
        </button>
        <div className="min-w-0 flex-1">
          <h2 className={`truncate font-display text-lg font-extrabold ${INK}`}>{game.title}</h2>
          <p className={`text-sm ${MUTED}`}>{game.category}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => void frameRef.current?.requestFullscreen?.().catch(() => undefined)}
            className={studentButton('soft', 'teal', 'min-h-[44px] px-4 text-sm')}
          >
            <Maximize2 className="h-4 w-4" /> Toàn màn hình
          </button>
          <NewTabLink game={game} className={studentButton(unsure ? 'accent' : 'quiet', 'blue', 'min-h-[44px] px-4 text-sm')} />
        </div>
      </div>
      <div ref={frameRef} className="h-[70vh] min-h-[420px] w-full bg-[#1F2A55]">
        <iframe
          src={game.embedUrl}
          title={game.title}
          sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
          allow="fullscreen; autoplay"
          allowFullScreen
          className="h-full w-full border-0 bg-white"
        />
      </div>
      <p className={`flex items-center gap-2 px-5 py-3 text-sm ${unsure ? 'bg-[#FFF3C4] text-[#7A5600]' : `bg-[#FFFBF2] ${MUTED}`}`}>
        <TriangleAlert className="h-4 w-4 shrink-0" />
        Nếu trò chơi không hiện ra, con bấm “Chơi trên trang trò chơi” nhé!
      </p>
    </StudentCard>
  );
};

export const StudentGames: React.FC<{ onUnauthenticated: () => void }> = ({ onUnauthenticated }) => {
  const [games, setGames] = useState<StudentGame[] | null>(() => peekStudentGames() ?? null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(() => !peekStudentGames());
  const [category, setCategory] = useState<'all' | GameCategory>('all');
  const [playing, setPlaying] = useState<StudentGame | null>(null);

  const load = useCallback(async () => {
    if (!peekStudentGames()) setLoading(true);
    setError(null);
    try {
      setGames(await fetchStudentGames());
    } catch (e) {
      if (e instanceof Error && e.message === 'UNAUTHENTICATED') onUnauthenticated();
      else setError(e instanceof Error ? e.message : 'Không tải được danh sách trò chơi.');
    } finally {
      setLoading(false);
    }
  }, [onUnauthenticated]);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = (games ?? []).filter((g) => category === 'all' || g.category === category);

  return (
    <div className="space-y-6">
      <section className="relative overflow-hidden rounded-[2rem] bg-gradient-to-br from-[#DDF7F3] via-[#E3F1FF] to-[#FFF3C4] p-5 sm:p-7">
        <span className="pointer-events-none absolute -top-6 right-8 text-6xl opacity-60" aria-hidden="true">🎲</span>
        <span className="pointer-events-none absolute right-40 bottom-2 hidden text-4xl opacity-50 sm:block" aria-hidden="true">🧩</span>
        <div className="relative flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[#14B8A6] text-white shadow-[0_4px_0_0_#0F766E]">
            <Gamepad2 className="h-7 w-7" />
          </span>
          <div>
            <h1 className={`font-display text-2xl font-extrabold sm:text-3xl ${INK}`}>Trò chơi Toán</h1>
            <p className={`text-base ${MUTED}`}>Vừa chơi vừa học – chọn một trò chơi con thích nhé!</p>
          </div>
        </div>
      </section>

      {playing ? (
        <GamePlayer game={playing} onBack={() => setPlaying(null)} />
      ) : loading && !games ? (
        <MimoLoading text="Mimo đang mở Kho trò chơi..." />
      ) : error ? (
        <EmptyState
          tone="red"
          icon={TriangleAlert}
          title="Ôi, chưa tải được trò chơi"
          text={error}
          action={
            <button type="button" onClick={() => void load()} className={studentButton('primary', 'blue')}>
              <RefreshCw className="h-5 w-5" /> Thử lại
            </button>
          }
        />
      ) : !games || games.length === 0 ? (
        <EmptyState mascot tone="teal" title="Trò chơi sắp ra mắt!" text="Cô đang chuẩn bị những trò chơi Toán thật vui cho con. Con quay lại sau nhé!" />
      ) : (
        <>
          <div role="tablist" aria-label="Danh mục trò chơi" className="flex gap-2 overflow-x-auto pb-1">
            {(['all', ...CATEGORIES] as const).map((c) => {
              const on = category === c;
              const count = c === 'all' ? games.length : games.filter((g) => g.category === c).length;
              return (
                <button
                  key={c}
                  type="button"
                  role="tab"
                  aria-selected={on}
                  onClick={() => setCategory(c)}
                  className={`flex min-h-[44px] shrink-0 items-center gap-2 rounded-full px-4 text-sm font-extrabold whitespace-nowrap transition ${
                    on ? 'bg-[#14B8A6] text-white' : `bg-white ${MUTED} ring-1 ring-[#EFE9DA] hover:bg-[#DDF7F3]`
                  }`}
                >
                  {c === 'all' ? 'Tất cả' : `${styleOf(c).emoji} ${c}`}
                  <span className={`rounded-full px-2 py-0.5 text-xs ${on ? 'bg-white/25' : 'bg-[#DDF7F3] text-[#0F766E]'}`}>{count}</span>
                </button>
              );
            })}
          </div>

          {shown.length === 0 ? (
            <EmptyState compact tone="gray" icon={Gamepad2} title="Mục này chưa có trò chơi" text="Con chọn mục khác hoặc quay lại sau nhé!" />
          ) : (
            <div className="grid grid-cols-1 gap-5 sm:grid-cols-2 lg:grid-cols-3">
              {shown.map((g) => {
                const s = styleOf(g.category);
                const newTab = g.embeddable === false;
                return (
                  <StudentCard key={g.id} padded={false} className="flex flex-col gap-3 p-4 transition hover:-translate-y-1">
                    <GameCover game={g} className="aspect-[16/10] rounded-2xl" />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${TONE[s.tone].soft} ${TONE[s.tone].text}`}>
                        {s.emoji} {g.category}
                      </span>
                      {newTab && (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F1F3FA] px-2.5 py-1 text-xs font-bold text-[#5A6B9A]">
                          <ExternalLink className="h-3 w-3" /> Mở trang mới
                        </span>
                      )}
                    </div>
                    <h3 className={`font-display text-lg leading-snug font-extrabold ${INK}`}>{g.title}</h3>
                    {g.description && <p className={`line-clamp-3 text-sm leading-relaxed ${MUTED}`}>{g.description}</p>}
                    <div className="mt-auto pt-1">
                      {newTab ? (
                        <NewTabLink game={g} className={studentButton('accent', 'yellow', 'w-full')} />
                      ) : (
                        <button type="button" onClick={() => setPlaying(g)} className={studentButton('accent', 'yellow', 'w-full')}>
                          <Gamepad2 className="h-5 w-5" /> Chơi ngay
                        </button>
                      )}
                    </div>
                  </StudentCard>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
};
