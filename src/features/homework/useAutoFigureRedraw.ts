import { useEffect, useRef, useState } from 'react';
import type { HomeworkQuestion } from '../../types/domain';
import { collectFigures, withFigureRedraw, withFigureSkipped } from './figureRedrawApply';
import { redrawAutomatically, type RedrawAttempt } from './figureRedrawService';

/** Short reason shown as "Giữ hình gốc – …" when a redraw is not put in use. */
function skipReason(a: RedrawAttempt): string {
  if (a.status === 'unsupported') return a.reason || 'AI không vẽ lại được hình này';
  if (a.status === 'wrong') return 'hình vẽ lại chưa khớp hình gốc';
  return 'AI chưa chắc chắn';
}

/**
 * Redraws the figures of a freshly imported homework, one at a time, without
 * the teacher choosing them: a redraw goes into use only when the AI comparison
 * says it matches the original and no check found a problem (status "ok");
 * otherwise the original stays, with the reason, and an unsure drawing is kept
 * aside so the teacher can still switch to it.
 */
export function useAutoFigureRedraw(
  questions: HomeworkQuestion[],
  setQuestions: (update: (prev: HomeworkQuestion[]) => HomeworkQuestion[]) => void,
  enabled: boolean
) {
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const tried = useRef(new Set<string>());
  const busy = useRef(false);
  const enabledRef = useRef(enabled);
  enabledRef.current = enabled;

  useEffect(() => {
    if (!enabled) tried.current.clear();
  }, [enabled]);

  useEffect(() => {
    if (!enabled || busy.current) return;
    const todo = collectFigures(questions).filter((f) => !f.redraw && !f.skipped && !tried.current.has(f.key));
    if (!todo.length) return;
    busy.current = true;
    void (async () => {
      setProgress({ done: 0, total: todo.length });
      for (const [i, fig] of todo.entries()) {
        if (!enabledRef.current) break;
        tried.current.add(fig.key);
        let update: (prev: HomeworkQuestion[]) => HomeworkQuestion[];
        try {
          const a = await redrawAutomatically(fig.url, fig.questionText);
          const at = new Date().toISOString();
          update =
            a.status === 'ok' && a.spec
              ? (prev) => withFigureRedraw(prev, fig.key, { active: true, spec: a.spec!, approvedAt: at, origin: 'ai' })
              : a.spec
                ? (prev) => withFigureSkipped(withFigureRedraw(prev, fig.key, { active: false, spec: a.spec!, approvedAt: at, origin: 'ai' }), fig.key, skipReason(a))
                : (prev) => withFigureSkipped(prev, fig.key, skipReason(a));
        } catch (err) {
          const msg = err instanceof Error ? err.message : String(err);
          update = (prev) => withFigureSkipped(prev, fig.key, `không vẽ lại được (${msg})`);
        }
        // Left the editor meanwhile: nothing is written into another homework
        if (!enabledRef.current) break;
        setQuestions(update);
        setProgress({ done: i + 1, total: todo.length });
      }
      busy.current = false;
      setProgress(null);
    })();
  }, [enabled, questions, setQuestions]);

  return progress;
}
