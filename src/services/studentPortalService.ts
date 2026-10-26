/** Students talk to the API only: Firestore is closed to browsers without a teacher account. */
import {
  Assignment,
  ClassRoom,
  CommentReport,
  MathGame,
  PublicStudentProfile,
  StudentAssignment,
  StudentQuestionAnswer,
  Submission,
} from '../types/domain';
import { apiUrl } from '../lib/apiUrl';
import { cachedRequest, clearStudentCache, peekCached } from './studentCache';

const TOKEN_STORAGE_KEY = 'lop_chung_toi_student_session_token';
const STUDENT_PROFILE_STORAGE_KEY = 'lop_chung_toi_student_profile';

export interface StudentPortalBundle {
  student: PublicStudentProfile;
  classes: ClassRoom[];
  studentAssignments: StudentAssignment[];
  assignmentsMap: Record<string, Assignment>;
  submissionsMap: Record<string, Submission>;
  comments: CommentReport[];
  games: MathGame[];
}

export function getSavedStudentToken(): string | null {
  return (
    sessionStorage.getItem(TOKEN_STORAGE_KEY) ||
    localStorage.getItem(TOKEN_STORAGE_KEY)
  );
}

export function saveStudentToken(
  token: string,
  student?: PublicStudentProfile
): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
  if (student) {
    sessionStorage.setItem(STUDENT_PROFILE_STORAGE_KEY, JSON.stringify(student));
    localStorage.setItem(STUDENT_PROFILE_STORAGE_KEY, JSON.stringify(student));
  }
}

export function getSavedStudentProfile(): PublicStudentProfile | null {
  const raw =
    sessionStorage.getItem(STUDENT_PROFILE_STORAGE_KEY) ||
    localStorage.getItem(STUDENT_PROFILE_STORAGE_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as PublicStudentProfile;
  } catch {
    return null;
  }
}

export function clearStudentToken(): void {
  clearStudentCache();
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(STUDENT_PROFILE_STORAGE_KEY);
  localStorage.removeItem(STUDENT_PROFILE_STORAGE_KEY);
}

/**
 * 1. Student 6-Character Code Login
 * Primary: Server API /api/student-auth/login
 * (Firestore is closed to browsers, so there is no direct fallback.)
 */
export async function loginWithStudentCode(rawCode: string): Promise<{
  token: string;
  student: PublicStudentProfile;
}> {
  const code = rawCode.trim().toUpperCase();
  if (!/^[A-Z0-9]{6}$/.test(code)) {
    throw new Error('Mã truy cập phải gồm đúng 6 ký tự chữ hoặc số.');
  }

  // Attempt Server API
  try {
    const response = await fetch(apiUrl('/api/student-auth/login'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code }),
    });

    const rawText = await response.text();
    let data: { token?: string; student?: PublicStudentProfile; error?: string } =
      {};
    try {
      data = JSON.parse(rawText);
    } catch {
      // Non-JSON response (e.g., FUNCTION_INVOCATION_FAILED from Vercel) -> trigger fallback below
      console.warn('API returned non-JSON, falling back to direct Firestore verification');
    }

    if (response.ok && data.token && data.student) {
      saveStudentToken(data.token, data.student);
      return { token: data.token, student: data.student };
    }

    // A rejection from the server (wrong code, too many tries) is shown as it is
    if (data.error && response.status < 500) {
      throw new Error(data.error);
    }
  } catch (err) {
    // Our own rejection from above; a network failure falls through
    if (err instanceof Error && !(err instanceof TypeError)) {
      throw err;
    }
    console.warn('Server login API error, falling back to direct Firestore:', err);
  }

  // Student data is only reachable through the server (Firestore is closed to browsers)
  throw new Error('Chưa kết nối được máy chủ. Con kiểm tra mạng rồi thử lại sau ít phút nhé.');
}

/**
 * 2. Fetch Student Portal Data Bundle
 * Primary: Server API /api/student-portal/data
 * (Firestore is closed to browsers, so there is no direct fallback.)
 */
export async function fetchStudentPortalData(): Promise<StudentPortalBundle> {
  const token = getSavedStudentToken();
  if (!token) {
    throw new Error('UNAUTHENTICATED');
  }

  // Attempt Server API
  try {
    const response = await fetch(apiUrl('/api/student-portal/data'), {
      method: 'GET',
      headers: { Authorization: `Bearer ${token}` },
    });

    if (response.status === 401 || response.status === 403) {
      clearStudentToken();
      throw new Error('UNAUTHENTICATED');
    }

    const rawText = await response.text();
    let data: StudentPortalBundle & { error?: string };
    try {
      data = JSON.parse(rawText);
      if (response.ok && data.student) {
        saveStudentToken(token, data.student);
        return data;
      }
    } catch {
      console.warn('API returned non-JSON, falling back to direct Firestore data fetch');
    }
  } catch (err) {
    if (err instanceof Error && err.message === 'UNAUTHENTICATED') {
      throw err;
    }
    console.warn('Server data API error, falling back to direct Firestore:', err);
  }

  // Student data is only reachable through the server (Firestore is closed to browsers)
  throw new Error('Chưa kết nối được máy chủ. Con kiểm tra mạng rồi thử lại sau ít phút nhé.');
}

/**
 * 3. Save Draft or Submit Homework
 * Primary: Server API /api/student-portal/submit
 * (Firestore is closed to browsers, so there is no direct fallback.)
 */
export async function submitStudentHomework(params: {
  assignmentId: string;
  answers: StudentQuestionAnswer[];
  isFinalSubmit: boolean;
}): Promise<{
  status: string;
  isPublished?: boolean;
  totalScore?: number;
  maxScore?: number;
  submittedAt?: string;
  savedAt?: string;
}> {
  const token = getSavedStudentToken();
  if (!token) {
    throw new Error(
      'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại bằng mã 6 ký tự.'
    );
  }

  // Attempt Server API
  try {
    const response = await fetch(apiUrl('/api/student-portal/submit'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    const rawText = await response.text();
    let data: { status?: string; error?: string } | null = null;
    try {
      data = JSON.parse(rawText);
    } catch {
      // non-JSON (proxy error page)
    }
    if (response.ok && data?.status) return data as { status: string };
    if (data?.error) throw Object.assign(new Error(data.error), { fromServer: true });
  } catch (err) {
    if ((err as { fromServer?: boolean }).fromServer) throw err;
    console.warn('Server submit API error:', err);
  }

  // Student data is only reachable through the server (Firestore is closed to browsers)
  throw new Error('Chưa kết nối được máy chủ. Con kiểm tra mạng rồi thử lại sau ít phút nhé.');
}

/** A published game from the teachers' Kho trò chơi. embeddable: null = the site could not be checked. */
export type StudentGame = MathGame & { embeddable: boolean | null };

const GAMES_TTL = 60_000;

export const peekStudentGames = () => peekCached<StudentGame[]>(getSavedStudentToken(), 'games', GAMES_TTL);

/** Trò chơi Toán for the signed-in student (any student, with or without a class); reused for a minute. */
export function fetchStudentGames(): Promise<StudentGame[]> {
  const token = getSavedStudentToken();
  if (!token) return Promise.reject(new Error('UNAUTHENTICATED'));
  return cachedRequest(token, 'games', GAMES_TTL, () => loadStudentGames(token));
}

async function loadStudentGames(token: string): Promise<StudentGame[]> {
  const response = await fetch(apiUrl('/api/student-portal/games'), {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 401 || response.status === 403) {
    clearStudentToken();
    throw new Error('UNAUTHENTICATED');
  }
  let data: { games?: StudentGame[]; error?: string } = {};
  try {
    data = await response.json();
  } catch {
    // non-JSON (e.g. proxy error page)
  }
  if (!response.ok || !Array.isArray(data.games)) {
    throw new Error(data.error || 'Không tải được danh sách trò chơi. Con thử lại nhé!');
  }
  return data.games;
}
