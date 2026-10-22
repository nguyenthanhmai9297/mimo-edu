import {
  collection,
  doc,
  getDoc,
  getDocs,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { db } from '../lib/firebase/config';
import {
  Assignment,
  ClassRoom,
  CommentReport,
  MathGame,
  PublicStudentProfile,
  Student,
  StudentAssignment,
  StudentQuestionAnswer,
  Submission,
} from '../types/domain';
import {
  createPublicQuestionsSnapshot,
  gradeFullSubmission,
} from '../utils/gradingEngine';

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
  sessionStorage.removeItem(TOKEN_STORAGE_KEY);
  localStorage.removeItem(TOKEN_STORAGE_KEY);
  sessionStorage.removeItem(STUDENT_PROFILE_STORAGE_KEY);
  localStorage.removeItem(STUDENT_PROFILE_STORAGE_KEY);
}

function parseTokenStudentId(token: string): string | null {
  try {
    const dataPart = token.split('.')[0];
    if (!dataPart) return null;
    const jsonStr = atob(dataPart.replace(/-/g, '+').replace(/_/g, '/'));
    const parsed = JSON.parse(jsonStr) as { studentId?: string; exp?: number };
    return parsed.studentId || null;
  } catch {
    return null;
  }
}

function toPublicStudent(student: Student): PublicStudentProfile {
  return {
    id: student.id,
    fullName: student.fullName,
    nickname: student.nickname,
    avatarUrl: student.avatarUrl,
    grade: student.grade,
    classIds: student.classIds || [],
    dob: student.dob,
    status: student.status,
    accessCode: student.accessCode,
  };
}

/**
 * 1. Student 6-Character Code Login
 * Primary: Server API /api/student-auth/login
 * Fallback: Direct Firestore verification if Serverless Function is unavailable
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
    const response = await fetch('/api/student-auth/login', {
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

    // If server returned a business rejection like rate-limit cooldown, propagate that message
    if (data.error && response.status === 429) {
      throw new Error(data.error);
    }
  } catch (err) {
    if (
      err instanceof Error &&
      (err.message.includes('quá nhiều lần') || err.message.includes('Mã truy cập phải gồm đúng'))
    ) {
      throw err;
    }
    console.warn('Server login API error, falling back to direct Firestore:', err);
  }

  // Seamless Direct Firestore Fallback
  try {
    const indexSnap = await getDoc(doc(db, 'studentCodeIndex', code));
    if (!indexSnap.exists()) {
      throw new Error(
        'Mã truy cập không hợp lệ hoặc đã ngừng hoạt động. Vui lòng kiểm tra lại.'
      );
    }

    const indexData = indexSnap.data() as { studentId: string; status: string };
    if (indexData.status !== 'active') {
      throw new Error(
        'Mã truy cập không hợp lệ hoặc đã ngừng hoạt động. Vui lòng kiểm tra lại.'
      );
    }

    const studentSnap = await getDoc(doc(db, 'students', indexData.studentId));
    if (!studentSnap.exists()) {
      throw new Error(
        'Mã truy cập không hợp lệ hoặc đã ngừng hoạt động. Vui lòng kiểm tra lại.'
      );
    }

    const student = {
      id: studentSnap.id,
      ...(studentSnap.data() as Omit<Student, 'id'>),
    };

    if (student.status !== 'active') {
      throw new Error(
        'Hồ sơ học sinh hiện không hoạt động. Vui lòng liên hệ giáo viên.'
      );
    }

    const publicStudent = toPublicStudent(student);
    // Create client session token
    const tokenPayload = {
      studentId: student.id,
      code: student.accessCode,
      exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    };
    const localToken = `${btoa(JSON.stringify(tokenPayload))}.client-session`;
    saveStudentToken(localToken, publicStudent);

    return { token: localToken, student: publicStudent };
  } catch (firestoreErr) {
    if (firestoreErr instanceof Error && firestoreErr.message.includes('Mã truy cập')) {
      throw firestoreErr;
    }
    throw new Error(
      'Mã truy cập không hợp lệ hoặc không thể kết nối tới cơ sở dữ liệu.'
    );
  }
}

/**
 * 2. Fetch Student Portal Data Bundle
 * Primary: Server API /api/student-portal/data
 * Fallback: Direct Firestore queries scoped strictly to the authenticated student
 */
export async function fetchStudentPortalData(): Promise<StudentPortalBundle> {
  const token = getSavedStudentToken();
  if (!token) {
    throw new Error('UNAUTHENTICATED');
  }

  // Attempt Server API
  try {
    const response = await fetch('/api/student-portal/data', {
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

  // Direct Firestore Fallback
  const studentId =
    parseTokenStudentId(token) || getSavedStudentProfile()?.id;
  if (!studentId) {
    clearStudentToken();
    throw new Error('UNAUTHENTICATED');
  }

  const studentSnap = await getDoc(doc(db, 'students', studentId));
  if (!studentSnap.exists()) {
    clearStudentToken();
    throw new Error('UNAUTHENTICATED');
  }

  const student = {
    id: studentSnap.id,
    ...(studentSnap.data() as Omit<Student, 'id'>),
  };
  const publicStudent = toPublicStudent(student);

  // Fetch student classes
  const classes: ClassRoom[] = [];
  for (const cid of student.classIds || []) {
    const cSnap = await getDoc(doc(db, 'classes', cid));
    if (cSnap.exists()) {
      classes.push({
        id: cSnap.id,
        ...(cSnap.data() as Omit<ClassRoom, 'id'>),
      });
    }
  }

  // Fetch student assignments
  const saQuery = query(
    collection(db, 'studentAssignments'),
    where('studentId', '==', student.id)
  );
  const saSnap = await getDocs(saQuery);
  const studentAssignments: StudentAssignment[] = saSnap.docs.map((d) => ({
    id: d.id,
    ...(d.data() as Omit<StudentAssignment, 'id'>),
  }));

  const assignmentsMap: Record<string, Assignment> = {};
  const submissionsMap: Record<string, Submission> = {};

  for (const sa of studentAssignments) {
    const aSnap = await getDoc(doc(db, 'assignments', sa.assignmentId));
    if (aSnap.exists()) {
      const rawAssign = {
        id: aSnap.id,
        ...(aSnap.data() as Omit<Assignment, 'id'>),
      };
      if (rawAssign.status !== 'revoked') {
        const allowSolutions =
          Boolean(rawAssign.publishSolutions) &&
          Boolean(sa.isScorePublished) &&
          sa.status === 'graded';

        assignmentsMap[rawAssign.id] = {
          ...rawAssign,
          publicQuestionsSnapshot: createPublicQuestionsSnapshot(
            rawAssign.publicQuestionsSnapshot || []
          ),
          gradingKeySnapshot: allowSolutions
            ? rawAssign.gradingKeySnapshot
            : undefined,
        };
      }
    }

    const subId = `${sa.assignmentId}_${student.id}`;
    const subSnap = await getDoc(doc(db, 'submissions', subId));
    if (subSnap.exists()) {
      const rawSub = {
        id: subSnap.id,
        ...(subSnap.data() as Omit<Submission, 'id'>),
      };
      submissionsMap[sa.assignmentId] = rawSub.isPublished
        ? rawSub
        : {
            ...rawSub,
            totalScore: undefined,
            questionResults: undefined,
            teacherOverallComment: undefined,
          };
    }
  }

  // Fetch published comments
  const commentsQuery = query(
    collection(db, 'comments'),
    where('status', '==', 'published')
  );
  const commentsSnap = await getDocs(commentsQuery);
  const comments: CommentReport[] = commentsSnap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<CommentReport, 'id'>),
    }))
    .filter((c) => c.studentId === student.id);

  // Fetch published games
  const gamesQuery = query(
    collection(db, 'games'),
    where('status', '==', 'published')
  );
  const gamesSnap = await getDocs(gamesQuery);
  const games: MathGame[] = gamesSnap.docs
    .map((d) => ({
      id: d.id,
      ...(d.data() as Omit<MathGame, 'id'>),
    }))
    .sort((a, b) => a.order - b.order);

  const bundle: StudentPortalBundle = {
    student: publicStudent,
    classes,
    studentAssignments: studentAssignments.filter(
      (sa) => Boolean(assignmentsMap[sa.assignmentId])
    ),
    assignmentsMap,
    submissionsMap,
    comments,
    games,
  };

  saveStudentToken(token, publicStudent);
  return bundle;
}

/**
 * 3. Save Draft or Submit Homework
 * Primary: Server API /api/student-portal/submit
 * Fallback: Direct Firestore submission with client auto-grading
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
    const response = await fetch('/api/student-portal/submit', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(params),
    });

    const rawText = await response.text();
    try {
      const data = JSON.parse(rawText);
      if (response.ok && data.status) {
        return data;
      }
    } catch {
      console.warn('Submit API returned non-JSON, falling back to direct Firestore submit');
    }
  } catch (err) {
    console.warn('Server submit API error, falling back to direct Firestore:', err);
  }

  // Direct Firestore Fallback
  const studentId =
    parseTokenStudentId(token) || getSavedStudentProfile()?.id;
  if (!studentId) {
    throw new Error('Phiên đăng nhập không hợp lệ.');
  }

  const saId = `${params.assignmentId}_${studentId}`;
  const [saSnap, assignSnap] = await Promise.all([
    getDoc(doc(db, 'studentAssignments', saId)),
    getDoc(doc(db, 'assignments', params.assignmentId)),
  ]);

  if (!saSnap.exists() || !assignSnap.exists()) {
    throw new Error('Không tìm thấy bài tập được giao cho bạn.');
  }

  const assignment = {
    id: assignSnap.id,
    ...(assignSnap.data() as Omit<Assignment, 'id'>),
  };
  const nowIso = new Date().toISOString();
  const subRef = doc(db, 'submissions', saId);
  const existingSubSnap = await getDoc(subRef);

  if (!params.isFinalSubmit) {
    const draftPayload: Omit<Submission, 'id'> = {
      assignmentId: params.assignmentId,
      studentId,
      answers: params.answers,
      maxScore: assignment.maxScore,
      status: 'in_progress',
      isPublished: false,
      updatedAt: nowIso,
    };
    await setDoc(subRef, draftPayload);
    await updateDoc(doc(db, 'studentAssignments', saId), {
      status: 'in_progress',
      updatedAt: nowIso,
    });
    return { status: 'in_progress', savedAt: nowIso };
  }

  const gradingKey =
    assignment.gradingKeySnapshot || assignment.publicQuestionsSnapshot;
  const existingResults = existingSubSnap.exists()
    ? (existingSubSnap.data() as Submission).questionResults || []
    : [];

  const graded = gradeFullSubmission(
    gradingKey,
    params.answers,
    existingResults
  );
  const finalStatus = graded.allAutoGradable ? 'graded' : 'submitted';
  const isPublished = graded.allAutoGradable;

  const submissionData: Omit<Submission, 'id'> = {
    assignmentId: params.assignmentId,
    studentId,
    answers: params.answers,
    questionResults: graded.questionResults,
    totalScore: graded.totalScore,
    maxScore: graded.maxScore,
    status: finalStatus,
    isPublished,
    submittedAt: nowIso,
    ...(graded.allAutoGradable ? { gradedAt: nowIso } : {}),
    updatedAt: nowIso,
  };

  await setDoc(subRef, submissionData);
  await updateDoc(doc(db, 'studentAssignments', saId), {
    status: finalStatus,
    score: graded.totalScore,
    isScorePublished: isPublished,
    submittedAt: nowIso,
    ...(graded.allAutoGradable ? { gradedAt: nowIso } : {}),
    updatedAt: nowIso,
  });

  return {
    status: finalStatus,
    isPublished,
    totalScore: isPublished ? graded.totalScore : undefined,
    maxScore: graded.maxScore,
    submittedAt: nowIso,
  };
}
