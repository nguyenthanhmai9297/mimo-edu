import type {
  PracticeCatalogAvailability,
  PracticeLevel,
  PracticePublicQuestion,
  PracticeStartResponse,
  PracticeSubmitResponse,
} from '../types/practice';
import { getSavedStudentToken } from './studentPortalService';

/** Student-side calls to the practice API; answers only ever arrive after submitting. */

export interface PracticeHistoryItem {
  id: string;
  topicId: string;
  skillId: string | null;
  level: PracticeLevel;
  status: 'in_progress' | 'submitted';
  score: number | null;
  total: number;
  startedAt: string;
  submittedAt: string | null;
}

export type PracticeAttemptDetail =
  | ({ status: 'submitted' } & PracticeSubmitResponse)
  | {
      status: 'in_progress';
      attemptId: string;
      topicId: string;
      skillId: string | null;
      level: PracticeLevel;
      questions: PracticePublicQuestion[];
    };

async function practiceRequest<T>(path: string, body?: unknown): Promise<T> {
  const token = getSavedStudentToken();
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn, con hãy nhập lại mã nhé.');
  const res = await fetch(`/api/practice${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!res.ok) {
    const message = (data as { error?: string } | null)?.error;
    throw new Error(message || `Không kết nối được máy chủ (HTTP ${res.status}).`);
  }
  return data as T;
}

export const fetchPracticeCatalog = () => practiceRequest<PracticeCatalogAvailability>('/catalog');

export const startPractice = (params: { topicId: string; level: PracticeLevel; skillId: string | null }) =>
  practiceRequest<PracticeStartResponse>('/start', params);

export const submitPractice = (attemptId: string, answers: Record<string, number[]>) =>
  practiceRequest<PracticeSubmitResponse>('/submit', { attemptId, answers });

export const fetchPracticeHistory = () => practiceRequest<PracticeHistoryItem[]>('/attempts');

export const fetchPracticeAttempt = (id: string) =>
  practiceRequest<PracticeAttemptDetail>(`/attempts/${encodeURIComponent(id)}`);
