import { apiUrl } from '../lib/apiUrl';
import type { BellHostView, BellMode, BellPlayView, BellQuestion, BellSummary } from '../features/games/bell/bellEngine';

/** Calls to the Rung chuông vàng API: the teacher's board (Firebase sign-in) and pupils' phones (player token). */

async function request<T>(path: string, token: string | null | undefined, body?: unknown, allowAnonymous = false): Promise<T> {
  if (!token && !allowAnonymous) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng tải lại trang.');
  const res = await fetch(apiUrl(`/api/bell${path}`), {
    method: body === undefined ? 'GET' : 'POST',
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let data: unknown = null;
  try {
    data = await res.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!res.ok) throw Object.assign(new Error((data as { error?: string } | null)?.error || `Không kết nối được máy chủ (HTTP ${res.status}).`), { status: res.status });
  return data as T;
}

// Firebase Auth loads on demand, so pupils' phones never download it
const teacherToken = async () => (await import('../lib/firebase/config')).auth.currentUser?.getIdToken();
const teacher = async <T>(path: string, body?: unknown) => request<T>(path, await teacherToken(), body);

export const createBellGame = (input: { title: string; homeworkId: string; mode: BellMode; perQuestionSec: number; questions: BellQuestion[]; players: string[] }) =>
  teacher<BellHostView>('/games', input);
export const listBellGames = () => teacher<BellSummary[]>('/games');
export const getBellGame = (id: string) => teacher<BellHostView>(`/games/${id}`);
export type BellAction = 'start' | 'pause' | 'resume' | 'close' | 'judge' | 'rescue' | 'field' | 'end';
export const bellAction = (id: string, action: BellAction, body: unknown = {}) => teacher<BellHostView>(`/games/${id}/${action}`, body);

/** The player token lives on this phone only, for this one game. */
const TOKEN_KEY = 'mimo.bell.player';
export const savedPlayer = (): { gameId: string; token: string } | null => {
  try {
    return JSON.parse(localStorage.getItem(TOKEN_KEY) ?? 'null');
  } catch {
    return null;
  }
};
export const forgetPlayer = () => {
  try {
    localStorage.removeItem(TOKEN_KEY);
  } catch {
    // storage blocked: nothing kept anyway
  }
};
export async function joinBellGame(code: string, name: string) {
  const r = await request<{ gameId: string; token: string }>('/join', null, { code, name }, true);
  try {
    localStorage.setItem(TOKEN_KEY, JSON.stringify(r));
  } catch {
    // private window: the phone stays in the game until the page is closed
  }
  return r;
}
export const getBellPlay = (token: string) => request<BellPlayView>('/play', token);
export const answerBell = (token: string, index: number, answer: { chosen?: number[]; text?: string }) => request<{ ok: true }>('/play/answer', token, { index, ...answer });
