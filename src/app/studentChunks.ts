/**
 * Code chunks of the student side, loaded once and shared, so a page can
 * warm up the next ones while the browser is idle (no fake delays: it only
 * starts downloads earlier).
 */
function once<T>(load: () => Promise<T>): () => Promise<T> {
  let pending: Promise<T> | null = null;
  return () =>
    (pending ??= load().catch((error) => {
      pending = null; // a failed download can be retried
      throw error;
    }));
}

export const loadStudentPortal = once(() => import('../features/student-portal/StudentPortalPage'));
export const loadPracticePortal = once(() => import('../features/practice/student/PracticePortal'));
export const loadStudentGames = once(() => import('../features/student-portal/StudentGames'));
export const loadMathRichEditor = once(() => import('../components/editor/MathRichEditor'));

/** Starts the given downloads when the browser has nothing better to do. */
export function prefetchWhenIdle(...loaders: (() => Promise<unknown>)[]): () => void {
  const run = () => loaders.forEach((load) => void load().catch(() => undefined));
  if (typeof window.requestIdleCallback === 'function') {
    const id = window.requestIdleCallback(run, { timeout: 3000 });
    return () => window.cancelIdleCallback(id);
  }
  const id = window.setTimeout(run, 1200);
  return () => window.clearTimeout(id);
}
