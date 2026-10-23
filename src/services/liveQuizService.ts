import { auth } from '../lib/firebase/config';
import type { LiveQuizHostView, LiveQuizPlayView } from '../types/liveQuiz';
import type { ToolQuestion } from '../features/tools/toolQuestions';
import { getSavedStudentToken } from './studentPortalService';
import { apiUrl } from '../lib/apiUrl';

/** Calls to the Mimo Quiz join-mode API (prototype; enabled on the Firebase Emulator only). */

async function request<T>(path: string, token: string | null | undefined, body?: unknown): Promise<T> {
  if (!token) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại.');
  const res = await fetch(apiUrl(`/api/live-quiz${path}`), {
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
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error || `Không kết nối được máy chủ (HTTP ${res.status}).`);
  return data as T;
}

const teacher = async <T>(path: string, body?: unknown) => request<T>(path, await auth.currentUser?.getIdToken(), body);
const student = <T>(path: string, body?: unknown) => request<T>(path, getSavedStudentToken(), body);

export const createLiveQuiz = (questions: ToolQuestion[], perQuestionSec: number | null, title: string) =>
  teacher<LiveQuizHostView>('/sessions', {
    title,
    perQuestionSec,
    questions: questions.map(({ prompt, options, correct, multi, explanation }) => ({ prompt, options, correct, multi, explanation })),
  });
export const getLiveQuiz = (id: string) => teacher<LiveQuizHostView>(`/sessions/${id}`);
export const openLiveQuestion = (id: string, index: number) => teacher<LiveQuizHostView>(`/sessions/${id}/open`, { index });
export const closeLiveQuestion = (id: string) => teacher<LiveQuizHostView>(`/sessions/${id}/close`, {});
export const endLiveQuiz = (id: string) => teacher<LiveQuizHostView>(`/sessions/${id}/end`, {});

export const joinLiveQuiz = (code: string) => student<{ sessionId: string }>('/join', { code });
export const getLivePlay = (id: string) => student<LiveQuizPlayView>(`/play/${id}`);
export const answerLiveQuestion = (id: string, index: number, chosen: number[]) => student<{ ok: true }>(`/play/${id}/answer`, { index, chosen });
