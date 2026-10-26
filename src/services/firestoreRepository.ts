import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocFromServer,
  getDocs,
  onSnapshot,
  setDoc,
  updateDoc,
} from 'firebase/firestore';
import {
  auth,
  db,
  handleFirestoreError,
  OperationType,
} from '../lib/firebase/config';
import {
  ClassFormValues,
  CommentFormValues,
  MathGameFormValues,
  StudentFormValues,
} from '../schemas/validation';
import {
  AdminAllowlistEntry,
  Assignment,
  ClassRoom,
  CommentReport,
  Homework,
  HomeworkQuestion,
  MathGame,
  QuestionGradingResult,
  Student,
  StudentAssignment,
  Submission,
} from '../types/domain';
import {
  createPublicQuestionsSnapshot,
  createRandom6CharCode,
  createRichTextFromPlain,
} from '../utils/gradingEngine';
import { apiUrl } from '../lib/apiUrl';

const BOOTSTRAP_ADMIN_EMAIL = 'nguyenthanhmai9297@gmail.com';

function makeId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Verifies if the currently signed-in Google user is authorized in the admin allowlist.
 */
export async function verifyAdminAccess(email?: string | null): Promise<boolean> {
  if (!email) return false;
  const cleanEmail = email.trim().toLowerCase();
  if (cleanEmail === BOOTSTRAP_ADMIN_EMAIL) {
    // Ensure bootstrap email is recorded in adminAllowlist if not present
    try {
      const ref = doc(db, 'adminAllowlist', cleanEmail);
      const snap = await getDoc(ref);
      if (!snap.exists()) {
        await setDoc(ref, {
          email: cleanEmail,
          role: 'admin',
          addedBy: auth.currentUser?.uid || 'system',
          createdAt: new Date().toISOString(),
        });
      }
    } catch {
      // Non-fatal if already exists or offline
    }
    return true;
  }

  try {
    const snap = await getDoc(doc(db, 'adminAllowlist', cleanEmail));
    return snap.exists();
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `adminAllowlist/${cleanEmail}`);
  }
}

export function subscribeAdminAllowlist(
  onData: (entries: AdminAllowlistEntry[]) => void
) {
  const path = 'adminAllowlist';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const list = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<AdminAllowlistEntry, 'id'>),
      }));
      onData(list);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function addAdminEmailToAllowlist(email: string): Promise<void> {
  const cleanEmail = email.trim().toLowerCase();
  const path = `adminAllowlist/${cleanEmail}`;
  try {
    await setDoc(doc(db, 'adminAllowlist', cleanEmail), {
      email: cleanEmail,
      role: 'admin',
      addedBy: auth.currentUser?.email || 'admin',
      createdAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
}

// ============================================================================
// CLASSES CRUD
// ============================================================================

export function subscribeClasses(onData: (classes: ClassRoom[]) => void) {
  const path = 'classes';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<ClassRoom, 'id'>),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createClassRoom(values: ClassFormValues): Promise<string> {
  const classId = makeId('cls');
  const now = new Date().toISOString();
  const payload: Omit<ClassRoom, 'id'> = {
    name: values.name.trim(),
    grade: values.grade.trim(),
    schoolYear: values.schoolYear.trim(),
    ...(values.description ? { description: values.description.trim() } : {}),
    status: values.status,
    createdAt: now,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'classes', classId), payload);
    return classId;
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `classes/${classId}`);
  }
}

export async function updateClassRoom(
  classId: string,
  existing: ClassRoom,
  values: ClassFormValues
): Promise<void> {
  const now = new Date().toISOString();
  const payload: Omit<ClassRoom, 'id'> = {
    name: values.name.trim(),
    grade: values.grade.trim(),
    schoolYear: values.schoolYear.trim(),
    ...(values.description ? { description: values.description.trim() } : {}),
    status: values.status,
    createdAt: existing.createdAt,
    updatedAt: now,
  };
  try {
    await setDoc(doc(db, 'classes', classId), payload);
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `classes/${classId}`);
  }
}

export async function toggleArchiveClassRoom(cls: ClassRoom): Promise<void> {
  const nextStatus = cls.status === 'active' ? 'archived' : 'active';
  try {
    await updateDoc(doc(db, 'classes', cls.id), {
      status: nextStatus,
      updatedAt: new Date().toISOString(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `classes/${cls.id}`);
  }
}

// ============================================================================
// STUDENTS CRUD & 6-CHAR SERVER CODE GENERATION
// ============================================================================

export function subscribeStudents(onData: (students: Student[]) => void) {
  const path = 'students';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Student, 'id'>),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createStudent(values: StudentFormValues): Promise<Student> {
  const studentId = makeId('stu');
  let code = '';

  try {
    const res = await fetch(apiUrl('/api/admin/generate-student-code'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ studentId }),
    });
    if (res.ok) {
      const data = (await res.json()) as { code?: string };
      if (data.code) code = data.code;
    }
  } catch (err) {
    console.warn('Server student code generation failed, using client generator:', err);
  }

  // Fallback direct 6-char code generation
  if (!code) {
    for (let i = 0; i < 15; i++) {
      const candidate = createRandom6CharCode();
      const snap = await getDoc(doc(db, 'studentCodeIndex', candidate));
      if (!snap.exists()) {
        code = candidate;
        await setDoc(doc(db, 'studentCodeIndex', candidate), {
          code: candidate,
          studentId,
          status: 'active',
          createdAt: new Date().toISOString(),
        });
        break;
      }
    }
  }

  if (!code) {
    throw new Error('Không thể cấp mã học sinh lúc này. Vui lòng thử lại.');
  }
  const now = new Date().toISOString();

  const payload: Omit<Student, 'id'> = {
    fullName: values.fullName.trim(),
    ...(values.nickname ? { nickname: values.nickname.trim() } : {}),
    ...(values.avatarUrl ? { avatarUrl: values.avatarUrl.trim() } : {}),
    grade: values.grade.trim(),
    classIds: values.classIds.slice(0, 20),
    ...(values.dob ? { dob: values.dob } : {}),
    ...(values.internalNotes
      ? { internalNotes: values.internalNotes.trim() }
      : {}),
    status: values.status,
    accessCode: code,
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'students', studentId), payload);
    return { id: studentId, ...payload };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `students/${studentId}`);
  }
}

export async function updateStudent(
  studentId: string,
  existing: Student,
  values: StudentFormValues
): Promise<void> {
  const now = new Date().toISOString();
  const payload: Omit<Student, 'id'> = {
    fullName: values.fullName.trim(),
    ...(values.nickname ? { nickname: values.nickname.trim() } : {}),
    ...(values.avatarUrl ? { avatarUrl: values.avatarUrl.trim() } : {}),
    grade: values.grade.trim(),
    classIds: values.classIds.slice(0, 20),
    ...(values.dob ? { dob: values.dob } : {}),
    ...(values.internalNotes
      ? { internalNotes: values.internalNotes.trim() }
      : {}),
    status: values.status,
    accessCode: existing.accessCode, // Immutable 6-char code
    createdAt: existing.createdAt,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'students', studentId), payload);
    if (values.status !== 'active') {
      await updateDoc(doc(db, 'studentCodeIndex', existing.accessCode), {
        status: 'archived',
      });
    } else {
      await updateDoc(doc(db, 'studentCodeIndex', existing.accessCode), {
        status: 'active',
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `students/${studentId}`);
  }
}

// ============================================================================
// HOMEWORK CRUD
// ============================================================================

export function subscribeHomeworkList(onData: (items: Homework[]) => void) {
  const path = 'homework';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Homework, 'id'>),
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

/** Creates or overwrites a homework; returns its id and creation time so the editor can keep saving into it. */
export async function saveHomework(
  homeworkData: Omit<Homework, 'id' | 'createdAt' | 'updatedAt'>,
  existing?: Pick<Homework, 'id' | 'createdAt'>
): Promise<{ id: string; createdAt: string }> {
  const hwId = existing?.id || makeId('hw');
  const now = new Date().toISOString();
  const totalPoints = Number(
    homeworkData.questions
      .reduce((acc, q) => acc + (Number(q.points) || 0), 0)
      .toFixed(2)
  );

  const payload: Omit<Homework, 'id'> = {
    title: homeworkData.title.trim(),
    ...(homeworkData.description
      ? { description: homeworkData.description.trim() }
      : {}),
    subject: homeworkData.subject || 'Toán',
    ...(homeworkData.grade ? { grade: homeworkData.grade } : {}),
    questions: homeworkData.questions,
    ...(homeworkData.attachments
      ? { attachments: homeworkData.attachments }
      : {}),
    answerSource: homeworkData.answerSource,
    aiSolverEnabled: homeworkData.aiSolverEnabled,
    totalPoints,
    status: homeworkData.status,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'homework', hwId), payload);
    return { id: hwId, createdAt: payload.createdAt };
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `homework/${hwId}`);
  }
}

export async function duplicateHomework(hw: Homework): Promise<string> {
  const { id } = await saveHomework({
    title: `${hw.title} (Bản sao)`,
    description: hw.description,
    subject: hw.subject,
    grade: hw.grade,
    questions: hw.questions,
    attachments: hw.attachments,
    answerSource: hw.answerSource,
    aiSolverEnabled: hw.aiSolverEnabled,
    totalPoints: hw.totalPoints,
    status: 'draft',
  });
  return id;
}

export async function deleteDraftHomework(hwId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'homework', hwId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `homework/${hwId}`);
  }
}

// ============================================================================
// ASSIGNMENTS & SNAPSHOT DELIVERY
// ============================================================================

export function subscribeAssignments(onData: (items: Assignment[]) => void) {
  const path = 'assignments';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<Assignment, 'id'>),
        }))
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export function subscribeStudentAssignments(
  onData: (items: StudentAssignment[]) => void
) {
  const path = 'studentAssignments';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<StudentAssignment, 'id'>),
      }));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function createAssignmentFromHomework(params: {
  homework: Homework;
  title: string;
  instructions?: string;
  targetType: 'class' | 'students';
  classIds: string[];
  studentIds: string[];
  allStudents: Student[];
  assignedAt: string;
  dueAt: string;
  publishSolutions: boolean;
}): Promise<string> {
  const assignmentId = makeId('asg');
  const now = new Date().toISOString();

  // Resolve target students
  const targetStudentIdSet = new Set<string>();
  if (params.targetType === 'class') {
    for (const st of params.allStudents) {
      if (
        st.status === 'active' &&
        st.classIds.some((cid) => params.classIds.includes(cid))
      ) {
        targetStudentIdSet.add(st.id);
      }
    }
  } else {
    for (const sid of params.studentIds) {
      targetStudentIdSet.add(sid);
    }
  }

  const resolvedStudentIds = Array.from(targetStudentIdSet);
  const publicQuestionsSnapshot = createPublicQuestionsSnapshot(
    params.homework.questions
  );

  const assignmentPayload: Omit<Assignment, 'id'> = {
    homeworkId: params.homework.id,
    title: params.title.trim() || params.homework.title,
    ...(params.instructions
      ? { instructions: params.instructions.trim() }
      : {}),
    targetType: params.targetType,
    classIds: params.classIds,
    studentIds: resolvedStudentIds,
    assignedAt: params.assignedAt || now,
    dueAt: params.dueAt,
    publicQuestionsSnapshot,
    gradingKeySnapshot: params.homework.questions,
    publishSolutions: params.publishSolutions,
    maxScore: params.homework.totalPoints,
    status: 'active',
    createdAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'assignments', assignmentId), assignmentPayload);

    for (const studentId of resolvedStudentIds) {
      const saId = `${assignmentId}_${studentId}`;
      const saPayload: Omit<StudentAssignment, 'id'> = {
        assignmentId,
        studentId,
        status: 'assigned',
        maxScore: params.homework.totalPoints,
        isScorePublished: false,
        updatedAt: now,
      };
      await setDoc(doc(db, 'studentAssignments', saId), saPayload);
    }
    return assignmentId;
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `assignments/${assignmentId}`
    );
  }
}

export async function updateAssignmentStatus(
  assignment: Assignment,
  nextStatus: 'active' | 'revoked' | 'closed',
  publishSolutions?: boolean
): Promise<void> {
  const now = new Date().toISOString();
  try {
    await setDoc(doc(db, 'assignments', assignment.id), {
      ...assignment,
      status: nextStatus,
      publishSolutions: publishSolutions ?? assignment.publishSolutions ?? false,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `assignments/${assignment.id}`
    );
  }
}

// ============================================================================
// SUBMISSIONS & TEACHER GRADING
// ============================================================================

export function subscribeSubmissions(onData: (items: Submission[]) => void) {
  const path = 'submissions';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs.map((d) => ({
        id: d.id,
        ...(d.data() as Omit<Submission, 'id'>),
      }));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function finalizeTeacherGrading(params: {
  submission: Submission;
  questionResults: QuestionGradingResult[];
  teacherOverallComment: string;
  publishResult: boolean;
  returnForRevision?: boolean;
}): Promise<void> {
  const now = new Date().toISOString();
  const totalScore = Number(
    params.questionResults
      .reduce((sum, r) => sum + (Number(r.score) || 0), 0)
      .toFixed(2)
  );

  const nextStatus = params.returnForRevision ? 'returned' : 'graded';
  const subId = `${params.submission.assignmentId}_${params.submission.studentId}`;

  const updatedSubmission: Omit<Submission, 'id'> = {
    assignmentId: params.submission.assignmentId,
    studentId: params.submission.studentId,
    answers: params.submission.answers,
    questionResults: params.questionResults,
    totalScore,
    maxScore: params.submission.maxScore,
    status: nextStatus,
    ...(params.teacherOverallComment.trim()
      ? { teacherOverallComment: params.teacherOverallComment.trim() }
      : {}),
    isPublished: params.publishResult,
    ...(params.submission.submittedAt
      ? { submittedAt: params.submission.submittedAt }
      : {}),
    gradedAt: now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'submissions', subId), updatedSubmission);
    await updateDoc(doc(db, 'studentAssignments', subId), {
      status: nextStatus,
      score: totalScore,
      isScorePublished: params.publishResult,
      gradedAt: now,
      updatedAt: now,
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `submissions/${subId}`);
  }
}

// ============================================================================
// MONTHLY & SUBMISSION COMMENTS
// ============================================================================

export function subscribeComments(onData: (items: CommentReport[]) => void) {
  const path = 'comments';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<CommentReport, 'id'>),
        }))
        .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
      onData(items);
    },
    (error) => handleFirestoreError(error, OperationType.LIST, path)
  );
}

export async function saveCommentReport(
  values: CommentFormValues,
  existing?: CommentReport
): Promise<string> {
  const commentId = existing?.id || makeId('cmt');
  const now = new Date().toISOString();
  const payload: Omit<CommentReport, 'id'> = {
    studentId: values.studentId,
    type: values.type,
    month: values.month,
    year: values.year,
    strengths: values.strengths.trim(),
    ...(values.improvements ? { improvements: values.improvements.trim() } : {}),
    ...(values.completionRate
      ? { completionRate: values.completionRate.trim() }
      : {}),
    ...(values.practiceSuggestions
      ? { practiceSuggestions: values.practiceSuggestions.trim() }
      : {}),
    status: values.status,
    ...(values.status === 'published' ? { publishedAt: now } : {}),
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'comments', commentId), payload);
    return commentId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `comments/${commentId}`);
  }
}

export async function deleteDraftComment(commentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'comments', commentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `comments/${commentId}`);
  }
}

// ============================================================================
// EDUCATIONAL MATH GAMES
// ============================================================================

export function subscribeMathGames(
  onData: (items: MathGame[]) => void,
  onError?: (message: string) => void
) {
  const path = 'games';
  return onSnapshot(
    collection(db, path),
    (snapshot) => {
      const items = snapshot.docs
        .map((d) => ({
          id: d.id,
          ...(d.data() as Omit<MathGame, 'id'>),
        }))
        .sort((a, b) => a.order - b.order);
      onData(items);
    },
    (error) => {
      // Let the Kho trò chơi page show the problem instead of an empty list
      onError?.(error.message);
      handleFirestoreError(error, OperationType.LIST, path);
    }
  );
}

export async function saveMathGame(
  values: MathGameFormValues,
  existing?: MathGame
): Promise<string> {
  const gameId = existing?.id || makeId('game');
  const now = new Date().toISOString();
  const payload: Omit<MathGame, 'id'> = {
    title: values.title.trim(),
    ...(values.description ? { description: values.description.trim() } : {}),
    embedUrl: values.embedUrl.trim(),
    category: values.category,
    ...(values.thumbnailUrl ? { thumbnailUrl: values.thumbnailUrl.trim() } : {}),
    order: Number(values.order) || 1,
    status: values.status,
    createdAt: existing?.createdAt || now,
    updatedAt: now,
  };

  try {
    await setDoc(doc(db, 'games', gameId), payload);
    // Only report success once the server really holds the game (read back, no cache)
    const saved = await getDocFromServer(doc(db, 'games', gameId));
    if (!saved.exists()) {
      throw new Error('Máy chủ chưa ghi nhận trò chơi. Vui lòng thử lại.');
    }
    return gameId;
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `games/${gameId}`);
  }
}

/** Teacher-readable message for a failed Kho trò chơi write (handleFirestoreError wraps the raw error in JSON). */
export function describeGameSaveError(err: unknown): string {
  let raw = err instanceof Error ? err.message : String(err);
  try {
    raw = (JSON.parse(raw) as { error?: string }).error ?? raw;
  } catch {
    // not wrapped
  }
  if (/permission|insufficient/i.test(raw)) {
    return 'Firestore từ chối lưu: tài khoản đang đăng nhập chưa có quyền quản trị Kho trò chơi, hoặc dữ liệu không hợp lệ. Trò chơi CHƯA được lưu.';
  }
  if (/offline|unavailable|network|failed to get document/i.test(raw)) {
    return 'Không kết nối được máy chủ nên trò chơi CHƯA được lưu. Kiểm tra mạng rồi bấm Lưu lại.';
  }
  return `Trò chơi CHƯA được lưu: ${raw}`;
}

export async function deleteMathGame(gameId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'games', gameId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `games/${gameId}`);
  }
}

// ============================================================================
// REAL FIRESTORE SAMPLE DATA SEEDER (OPTIONAL ONE-CLICK FOR TEACHER)
// ============================================================================

export async function seedSampleClassroomData(): Promise<{
  studentCode: string;
  studentName: string;
}> {
  const existingClasses = await getDocs(collection(db, 'classes'));
  if (!existingClasses.empty) {
    const existingStudents = await getDocs(collection(db, 'students'));
    if (!existingStudents.empty) {
      const firstStu = existingStudents.docs[0].data() as Student;
      return {
        studentCode: firstStu.accessCode,
        studentName: firstStu.fullName,
      };
    }
  }

  // 1. Create 2 sample Math classes
  const class5AId = await createClassRoom({
    name: 'Toán Tư Duy 5A',
    grade: 'Khối 5',
    schoolYear: '2026-2027',
    description:
      'Lớp bồi dưỡng Toán tư duy, phân số, số thập phân và hình học phẳng lớp 5.',
    status: 'active',
  });

  await createClassRoom({
    name: 'Toán Hình Học & Logic 6B',
    grade: 'Khối 6',
    schoolYear: '2026-2027',
    description: 'Lớp chuyên đề số nguyên, phân số và hình học trực quan lớp 6.',
    status: 'active',
  });

  // 2. Create 2 students with server-generated 6-char codes
  const student1 = await createStudent({
    fullName: 'Nguyễn Minh Khôi',
    nickname: 'Bé Khôi',
    grade: 'Khối 5',
    classIds: [class5AId],
    dob: '2015-04-12',
    internalNotes:
      'Tư duy hình học rất nhạy, cần rèn thêm tính cẩn thận khi rút gọn phân số.',
    status: 'active',
  });

  const student2 = await createStudent({
    fullName: 'Trần Bảo Ngọc',
    nickname: 'Bảo Ngọc',
    grade: 'Khối 5',
    classIds: [class5AId],
    dob: '2015-08-24',
    internalNotes: 'Trình bày tự luận sạch đẹp, chăm chỉ làm BTVN đúng hạn.',
    status: 'active',
  });

  // 3. Create a comprehensive 5-question Math Homework covering all 5 required question types
  const sampleQuestions: HomeworkQuestion[] = [
    {
      id: 'q_sample_1',
      order: 1,
      type: 'single_choice',
      points: 2,
      prompt: {
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            text: 'Tính giá trị của biểu thức phân số sau và chọn kết quả tối giản:',
          },
          {
            type: 'math',
            inline: false,
            latex: 'A = \\frac{3}{4} + \\frac{5}{8} \\times \\frac{2}{5}',
          },
        ],
      },
      options: [
        {
          id: 'opt_1a',
          label: 'A',
          content: createRichTextFromPlain('1', ['1']),
        },
        {
          id: 'opt_1b',
          label: 'B',
          content: createRichTextFromPlain('7/8', ['\\frac{7}{8}']),
        },
        {
          id: 'opt_1c',
          label: 'C',
          content: createRichTextFromPlain('5/4', ['\\frac{5}{4}']),
        },
        {
          id: 'opt_1d',
          label: 'D',
          content: createRichTextFromPlain('3/8', ['\\frac{3}{8}']),
        },
      ],
      correctOptionId: 'opt_1a',
    },
    {
      id: 'q_sample_2',
      order: 2,
      type: 'multiple_choice',
      points: 2,
      prompt: {
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            text: 'Những phân số nào dưới đây bằng với phân số 3/5? (Chọn tất cả đáp án đúng)',
          },
          {
            type: 'math',
            inline: false,
            latex: '\\frac{3}{5} = ?',
          },
        ],
      },
      options: [
        {
          id: 'opt_2a',
          label: 'A',
          content: createRichTextFromPlain('6/10', ['\\frac{6}{10}']),
        },
        {
          id: 'opt_2b',
          label: 'B',
          content: createRichTextFromPlain('9/20', ['\\frac{9}{20}']),
        },
        {
          id: 'opt_2c',
          label: 'C',
          content: createRichTextFromPlain('15/25', ['\\frac{15}{25}']),
        },
        {
          id: 'opt_2d',
          label: 'D',
          content: createRichTextFromPlain('0,6', ['0,6']),
        },
      ],
      correctOptionIds: ['opt_2a', 'opt_2c', 'opt_2d'],
    },
    {
      id: 'q_sample_3',
      order: 3,
      type: 'true_false_multi',
      points: 2,
      prompt: {
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            text: 'Cho tam giác vuông ABC vuông tại A có AB = 6 cm, AC = 8 cm như hình vẽ. Xét tính Đúng/Sai của các mệnh đề sau:',
          },
          {
            type: 'geometry',
            drawing: {
              width: 360,
              height: 220,
              points: [
                { id: 'pt_A', label: 'A', x: 70, y: 170 },
                { id: 'pt_B', label: 'B', x: 70, y: 50 },
                { id: 'pt_C', label: 'C', x: 260, y: 170 },
              ],
              elements: [
                {
                  id: 'el_tri',
                  type: 'triangle',
                  pointIds: ['pt_A', 'pt_B', 'pt_C'],
                  color: '#2563EB',
                },
                {
                  id: 'el_angA',
                  type: 'angle',
                  pointIds: ['pt_B', 'pt_A', 'pt_C'],
                  angleValue: '90°',
                },
              ],
              caption: 'Tam giác ABC vuông tại A (AB = 6 cm, AC = 8 cm)',
            },
          },
        ],
      },
      statements: [
        {
          id: 'st_3a',
          label: 'a',
          statement: createRichTextFromPlain(
            'Diện tích tam giác ABC bằng 24 cm².'
          ),
          isTrue: true,
          points: 0.5,
        },
        {
          id: 'st_3b',
          label: 'b',
          statement: createRichTextFromPlain(
            'Tổng hai góc nhọn B và C bằng 180°.'
          ),
          isTrue: false,
          points: 0.5,
        },
        {
          id: 'st_3c',
          label: 'c',
          statement: createRichTextFromPlain(
            'Nếu nối trung điểm M của BC thì diện tích tam giác ABM bằng 12 cm².'
          ),
          isTrue: true,
          points: 0.5,
        },
        {
          id: 'st_3d',
          label: 'd',
          statement: createRichTextFromPlain(
            'Chu vi tam giác ABC nhỏ hơn 14 cm.'
          ),
          isTrue: false,
          points: 0.5,
        },
      ],
    },
    {
      id: 'q_sample_4',
      order: 4,
      type: 'short_answer',
      points: 2,
      prompt: {
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            text: 'Một hình chữ nhật có chiều dài 12,5 m và chiều rộng 8 m. Chu vi của hình chữ nhật đó bằng bao nhiêu mét? (Chỉ điền số)',
          },
        ],
      },
      acceptableAnswers: ['41', '41m', '41 m', '41.0'],
    },
    {
      id: 'q_sample_5',
      order: 5,
      type: 'essay',
      points: 2,
      prompt: {
        version: 1,
        blocks: [
          {
            type: 'paragraph',
            text: 'Hai vòi nước cùng chảy vào một bể không có nước thì sau 6 giờ đầy bể. Nếu riêng vòi thứ nhất chảy thì sau 10 giờ đầy bể. Hỏi nếu riêng vòi thứ hai chảy thì sau bao nhiêu giờ đầy bể? Trình bày rõ lời giải.',
          },
        ],
      },
      rubric:
        '1 điểm: Tìm được trong 1 giờ cả hai vòi chảy được 1/6 bể và vòi 1 chảy được 1/10 bể. 1 điểm: Tính được 1 giờ vòi 2 chảy được 1/6 - 1/10 = 1/15 bể, suy ra vòi 2 chảy riêng mất 15 giờ.',
      sampleSolution: createRichTextFromPlain(
        'Trong 1 giờ cả hai vòi chảy được 1/6 bể. Trong 1 giờ vòi thứ nhất chảy được 1/10 bể. Vậy 1 giờ vòi thứ hai chảy được: 1/6 - 1/10 = 1/15 (bể). Thời gian vòi thứ hai chảy riêng đầy bể là: 1 : 1/15 = 15 (giờ).',
        ['\\frac{1}{6} - \\frac{1}{10} = \\frac{1}{15}']
      ),
    },
  ];

  const { id: hwId } = await saveHomework({
    title: 'Phiếu BTVN Tuần 8: Phân Số & Diện Tích Tam Giác',
    description:
      'Các con đọc kỹ đề, nháp cẩn thận trước khi chọn đáp án và trình bày rõ ràng câu tự luận số 5 nhé!',
    subject: 'Toán',
    grade: 'Khối 5',
    questions: sampleQuestions,
    answerSource: 'teacher',
    aiSolverEnabled: true,
    totalPoints: 10,
    status: 'published',
  });

  const savedHw: Homework = {
    id: hwId,
    title: 'Phiếu BTVN Tuần 8: Phân Số & Diện Tích Tam Giác',
    description:
      'Các con đọc kỹ đề, nháp cẩn thận trước khi chọn đáp án và trình bày rõ ràng câu tự luận số 5 nhé!',
    subject: 'Toán',
    grade: 'Khối 5',
    questions: sampleQuestions,
    answerSource: 'teacher',
    aiSolverEnabled: true,
    totalPoints: 10,
    status: 'published',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  // 4. Assign homework to Class 5A
  const dueDate = new Date(Date.now() + 5 * 24 * 60 * 60 * 1000)
    .toISOString()
    .slice(0, 10);

  await createAssignmentFromHomework({
    homework: savedHw,
    title: 'Phiếu BTVN Tuần 8: Phân Số & Diện Tích Tam Giác',
    instructions:
      'Hoàn thành đầy đủ 5 câu hỏi trước thứ Năm. Câu 5 nhớ ghi đủ lời giải và phép tính.',
    targetType: 'class',
    classIds: [class5AId],
    studentIds: [],
    allStudents: [student1, student2],
    assignedAt: new Date().toISOString().slice(0, 10),
    dueAt: dueDate,
    publishSolutions: true,
  });

  // 5. Create a published Monthly Comment for student1
  await saveCommentReport({
    studentId: student1.id,
    type: 'monthly',
    month: 10,
    year: 2026,
    strengths:
      'Minh Khôi nắm rất chắc kiến thức hình học phẳng, biết cách phân tích bài toán diện tích tam giác và tích cực phát biểu trên lớp.',
    improvements:
      'Cần kiểm tra kỹ bước quy đồng mẫu số ở các phép trừ phân số để tránh nhầm lẫn đáng tiếc.',
    completionRate: 'Hoàn thành 100% BTVN đúng hạn (4/4 phiếu trong tháng)',
    practiceSuggestions:
      'Mỗi ngày luyện thêm 2 bài tính nhanh phân số và chơi trò chơi Ghép Phân Số trên cổng học sinh 15 phút.',
    status: 'published',
  });

  // 6. Create interactive HTTPS educational Math Games (PhET Colorado HTML5 interactive simulations that allow iframe embedding)
  await saveMathGame({
    title: 'Khám Phá Phân Số (PhET Interactive)',
    description:
      'Trò chơi tương tác trực quan giúp học sinh ghép hình tròn, hình chữ nhật để hiểu bản chất phân số và hỗn số.',
    embedUrl:
      'https://phet.colorado.edu/sims/html/fractions-intro/latest/fractions-intro_vi.html',
    category: 'Số học',
    order: 1,
    status: 'published',
  });

  await saveMathGame({
    title: 'Ghép Cặp Phân Số Tương Đương',
    description:
      'Thử thách tìm các cặp phân số bằng nhau và biểu diễn trên trục số qua các cấp độ từ dễ đến khó.',
    embedUrl:
      'https://phet.colorado.edu/sims/html/fraction-matcher/latest/fraction-matcher_vi.html',
    category: 'Phép tính',
    order: 2,
    status: 'published',
  });

  await saveMathGame({
    title: 'Xây Dựng Diện Tích & Chu Vi Hình Học',
    description:
      'Vừa chơi vừa rèn luyện tư duy tính diện tích và chu vi các hình phẳng trên lưới ô vuông.',
    embedUrl:
      'https://phet.colorado.edu/sims/html/area-builder/latest/area-builder_vi.html',
    category: 'Hình học',
    order: 3,
    status: 'published',
  });

  await saveMathGame({
    title: 'Cân Bằng Biểu Thức & Tư Duy Logic',
    description:
      'Đặt các khối số và vật thể lên bàn cân để tìm ẩn số và hiểu quy tắc cân bằng phương trình.',
    embedUrl:
      'https://phet.colorado.edu/sims/html/equality-explorer-basics/latest/equality-explorer-basics_vi.html',
    category: 'Tư duy logic',
    order: 4,
    status: 'published',
  });

  return {
    studentCode: student1.accessCode,
    studentName: student1.fullName,
  };
}
