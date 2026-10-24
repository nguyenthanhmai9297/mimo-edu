import type {
  PracticeCatalogAvailability,
  PracticeLevel,
  PracticePublicQuestion,
  PracticeStartResponse,
  PracticeSubmitResponse,
} from '../types/practice';
import { getSavedStudentToken } from './studentPortalService';
import { apiUrl } from '../lib/apiUrl';
import { cachedRequest, invalidateCached, peekCached } from './studentCache';

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
  const res = await fetch(apiUrl(`/api/practice${path}`), {
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

// Catalogue (the server caches it for 60 s too) and history are reused between
// portal tabs; history is dropped whenever an attempt starts or is submitted.
const CATALOG_TTL = 60_000;
const HISTORY_TTL = 30_000;

const cached = <T,>(name: string, ttl: number, path: string) => {
  const token = getSavedStudentToken();
  return token ? cachedRequest(token, name, ttl, () => practiceRequest<T>(path)) : practiceRequest<T>(path);
};

export const fetchPracticeCatalog = () => cached<PracticeCatalogAvailability>('practice-catalog', CATALOG_TTL, '/catalog');
export const peekPracticeCatalog = () => peekCached<PracticeCatalogAvailability>(getSavedStudentToken(), 'practice-catalog', CATALOG_TTL);

export const startPractice = (params: { topicId: string; level: PracticeLevel; skillId: string | null }) => {
  invalidateCached('practice-history');
  return practiceRequest<PracticeStartResponse>('/start', params);
};

export const submitPractice = (attemptId: string, answers: Record<string, number[]>) =>
  practiceRequest<PracticeSubmitResponse>('/submit', { attemptId, answers }).finally(() => invalidateCached('practice-history'));

export const fetchPracticeHistory = () => cached<PracticeHistoryItem[]>('practice-history', HISTORY_TTL, '/attempts');
export const peekPracticeHistory = () => peekCached<PracticeHistoryItem[]>(getSavedStudentToken(), 'practice-history', HISTORY_TTL);

export const fetchPracticeAttempt = (id: string) =>
  practiceRequest<PracticeAttemptDetail>(`/attempts/${encodeURIComponent(id)}`);
