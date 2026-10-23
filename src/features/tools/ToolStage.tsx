import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Maximize2, Minimize2 } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { TeachingTool } from './toolCatalog';
import { TOOL_CATEGORIES } from './toolCatalog';

/**
 * Shared frame for a teaching tool. "Trình chiếu" puts the tool in fullscreen
 * (projector / interactive board) and tells it to use its large layout.
 * Falls back to a fixed full-window overlay when the Fullscreen API is blocked.
 */
export const ToolStage: React.FC<{
  tool: TeachingTool;
  children: (presenting: boolean) => React.ReactNode;
}> = ({ tool, children }) => {
  const stageRef = useRef<HTMLDivElement>(null);
  const [presenting, setPresenting] = useState(false);
  const category = TOOL_CATEGORIES.find((c) => c.id === tool.category);
  const Art = tool.art;

  useEffect(() => {
    const onChange = () => {
      if (!document.fullscreenElement) setPresenting(false);
    };
    document.addEventListener('fullscreenchange', onChange);
    return () => document.removeEventListener('fullscreenchange', onChange);
  }, []);

  useEffect(() => {
    if (!presenting) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.fullscreenElement) setPresenting(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [presenting]);

  const toggle = useCallback(async () => {
    if (presenting) {
      if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined);
      setPresenting(false);
      return;
    }
    setPresenting(true);
    await stageRef.current?.requestFullscreen?.().catch(() => undefined);
  }, [presenting]);

  return (
    <div className="space-y-4">
      {!presenting && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Link to="/admin/tools" className="studio-btn studio-btn-secondary px-3" aria-label="Về Công cụ dạy học">
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <span className="hidden h-12 w-16 overflow-hidden rounded-xl sm:block">
              <Art />
            </span>
            <div>
              <h1 className="font-display text-xl font-extrabold text-[#172B4D] sm:text-2xl">{tool.name}</h1>
              {category && <span className={`studio-badge ${category.badge}`}>{category.label}</span>}
            </div>
          </div>
          <button type="button" onClick={toggle} className="studio-btn studio-btn-primary">
            <Maximize2 className="h-4 w-4" /> Trình chiếu
          </button>
        </div>
      )}

      <div
        ref={stageRef}
        className={
          presenting
            ? 'fixed inset-0 z-[90] overflow-auto bg-gradient-to-br from-[#F6FAFF] via-white to-[#EAF5FF] p-6 sm:p-10'
            : 'studio-card p-4 sm:p-6'
        }
      >
        {presenting && (
          <div className="mb-6 flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="h-12 w-16 overflow-hidden rounded-xl">
                <Art />
              </span>
              <span className="font-display text-2xl font-extrabold text-[#071A63]">{tool.name}</span>
            </div>
            <button type="button" onClick={toggle} className="studio-btn studio-btn-secondary">
              <Minimize2 className="h-4 w-4" /> Thoát trình chiếu
            </button>
          </div>
        )}
        {children(presenting)}
      </div>
    </div>
  );
};
