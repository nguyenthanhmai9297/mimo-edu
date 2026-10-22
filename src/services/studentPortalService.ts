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

const TOKEN_STORAGE_KEY = 'lop_chung_toi_student_session_token';

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
  return sessionStorage.getItem(TOKEN_STORAGE_KEY) || localStorage.getItem(TOKEN_STORAGE_KEY);
}

export function saveStudentToken(token: string): void {
  sessionStorage.setItem(TOKEN_STORAGE_KEY, token);
  localStorage.setItem(TOKEN_STORAGE_KEY, token);
}

export function clearStudentToken(): void {
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
}

export async function loginWithStudentCode(code: string): Promise<{
  token: string;
  student: PublicStudentProfile;
}> {
  const response = await fetch('/api/student-auth/login', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code: code.trim().toUpperCase() }),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Mã truy cập không hợp lệ.');
  }

  saveStudentToken(data.token);
  return data;
}

export async function fetchStudentPortalData(): Promise<StudentPortalBundle> {
  const token = getSavedStudentToken();
  if (!token) {
    throw new Error('UNAUTHENTICATED');
  }

  const response = await fetch('/api/student-portal/data', {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    clearStudentToken();
    throw new Error('UNAUTHENTICATED');
  }

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Không thể tải dữ liệu cổng học sinh.');
  }

  return data as StudentPortalBundle;
}

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
    throw new Error('Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại bằng mã 6 ký tự.');
  }

  const response = await fetch('/api/student-portal/submit', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(params),
  });

  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.error || 'Không thể lưu hoặc nộp bài tập.');
  }

  return data;
}
