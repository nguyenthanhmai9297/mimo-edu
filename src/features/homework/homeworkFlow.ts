import type { HomeworkQuestion } from '../../types/domain';
import { fromHomeworkQuestion } from '../tools/toolQuestions';

/**
 * Soạn bài tập has two ways in: a Word worksheet or questions for a game.
 * Both edit the same homework document (same questions, same id), so the
 * format lives only in the URL and switching between them never copies data:
 *
 *   /admin/homework                  choose Word or Game
 *   /admin/homework/:format          from a file or by hand, plus the saved list
 *   /admin/homework/:format/new      editor, not saved yet
 *   /admin/homework/:format/:id      editor for a saved homework
 */
export type HomeworkFormat = 'word' | 'game';

export const HOMEWORK_FORMATS: HomeworkFormat[] = ['word', 'game'];

export const HOMEWORK_FORMAT_LABELS: Record<HomeworkFormat, string> = {
  word: 'Soạn bài tập Word',
  game: 'Soạn bài tập Game',
};

export const NEW_HOMEWORK = 'new';

export function homeworkPath(format?: HomeworkFormat, target?: string): string {
  if (!format) return '/admin/homework';
  return target ? `/admin/homework/${format}/${encodeURIComponent(target)}` : `/admin/homework/${format}`;
}

/** Reads the part of the URL after /admin/homework/. Unknown formats fall back to the chooser. */
export function parseHomeworkPath(splat: string | undefined): { format: HomeworkFormat | null; target: string | null } {
  const [format, target] = (splat ?? '').split('/').filter(Boolean);
  if (!HOMEWORK_FORMATS.includes(format as HomeworkFormat)) return { format: null, target: null };
  return { format: format as HomeworkFormat, target: target ? decodeURIComponent(target) : null };
}

/** How many of the questions classroom games (Mimo Quiz, Đoàn tàu kiến thức) can play. */
export function gameReadiness(questions: HomeworkQuestion[]): { playable: number; gameQuestions: number; notPlayable: number } {
  let playable = 0;
  let gameQuestions = 0;
  for (const q of questions) {
    const converted = fromHomeworkQuestion(q, '').length;
    if (converted > 0) playable += 1;
    gameQuestions += converted;
  }
  return { playable, gameQuestions, notPlayable: questions.length - playable };
}

// ---------------------------------------------------------------------------
// Unsaved work kept on this device, so leaving the page loses nothing.
// One slot per teacher and homework id (or "new"), so on a shared computer a
// teacher never sees another's unsaved work; it disappears once saved to the system.
// ---------------------------------------------------------------------------

export interface LocalHomeworkDraft {
  title: string;
  description: string;
  grade: string;
  answerSource: 'teacher' | 'ai';
  aiSolverEnabled: boolean;
  questions: HomeworkQuestion[];
  missingQuestionsWarning: string | null;
  /** ISO time the draft was last written. */
  savedAt: string;
}

const DRAFT_PREFIX = 'mimoedu.homeworkDraft.';
const slot = (owner: string, key: string) => `${DRAFT_PREFIX}${owner.toLowerCase()}/${key}`;

export function readLocalDraft(owner: string, key: string): LocalHomeworkDraft | null {
  try {
    const raw = localStorage.getItem(slot(owner, key));
    if (!raw) return null;
    const draft = JSON.parse(raw) as LocalHomeworkDraft;
    return Array.isArray(draft?.questions) && typeof draft.savedAt === 'string' ? draft : null;
  } catch {
    return null;
  }
}

/** Returns false when the browser refused (storage off or full). */
export function writeLocalDraft(owner: string, key: string, draft: LocalHomeworkDraft): boolean {
  try {
    localStorage.setItem(slot(owner, key), JSON.stringify(draft));
    return true;
  } catch {
    return false;
  }
}

export function clearLocalDraft(owner: string, key: string): void {
  try {
    localStorage.removeItem(slot(owner, key));
  } catch {
    // storage unavailable: nothing was kept
  }
}

/** Keys (homework ids or "new") with this teacher's unsaved work on this device. */
export function listLocalDraftKeys(owner: string): string[] {
  const prefix = slot(owner, '');
  try {
    return Object.keys(localStorage)
      .filter((k) => k.startsWith(prefix))
      .map((k) => k.slice(prefix.length));
  } catch {
    return [];
  }
}
