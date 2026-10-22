import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import { studentCodeLoginSchema } from '../src/schemas/validation';
import { getAIAdapter } from '../src/services/aiAdapter';
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
} from '../src/types/domain';
import {
  createPublicQuestionsSnapshot,
  createRandom6CharCode,
  gradeFullSubmission,
} from '../src/utils/gradingEngine';

dotenv.config();

const existingApp = getApps().find((a) => a.name === 'server-firebase-app');
const firebaseApp =
  existingApp || initializeApp(firebaseConfig, 'server-firebase-app');
const serverDb = getFirestore(firebaseApp, firebaseConfig.firestoreDatabaseId);

const SESSION_SECRET =
  process.env.STUDENT_SESSION_SECRET ||
  'lop-chung-toi-demo-hmac-secret-key-2026';

export interface StudentTokenPayload {
  studentId: string;
  code: string;
  exp: number;
}

function signStudentToken(payload: StudentTokenPayload): string {
  const data = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  return `${data}.${sig}`;
}

function verifyStudentToken(token: string): StudentTokenPayload | null {
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  const [data, sig] = parts;
  const expectedSig = crypto
    .createHmac('sha256', SESSION_SECRET)
    .update(data)
    .digest('base64url');
  if (sig !== expectedSig) return null;
  try {
    const payload = JSON.parse(
      Buffer.from(data, 'base64url').toString('utf8')
    ) as StudentTokenPayload;
    if (Date.now() > payload.exp) return null;
    return payload;
  } catch {
    return null;
  }
}

interface RateLimitRecord {
  failedAttempts: number;
  cooldownUntil: number;
}
const loginAttemptsByIp = new Map<string, RateLimitRecord>();
const MAX_FAILED_ATTEMPTS = 5;
const COOLDOWN_MS = 60 * 1000;

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

async function logAIJob(jobData: {
  taskType: 'ocr_parse' | 'solve_math' | 'essay_grade';
  provider: string;
  model: string;
  status: 'processing' | 'completed' | 'failed';
  durationMs?: number;
  estimatedCostUsd?: number;
}) {
  try {
    const jobId = `aijob_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
    await setDoc(doc(serverDb, 'aiJobs', jobId), {
      ...jobData,
      createdAt: new Date().toISOString(),
    });
  } catch (err) {
    console.warn('Non-fatal: Could not record aiJob log:', err);
  }
}

export function createApiApp() {
  const app = express();
  app.use(express.json({ limit: '15mb' }));

  // 1. Server-side unique 6-character student code generation
  app.post(
    '/api/admin/generate-student-code',
    async (req: Request, res: Response) => {
      try {
        const { studentId } = req.body as { studentId?: string };
        if (!studentId || typeof studentId !== 'string') {
          res.status(400).json({ error: 'Thiếu studentId hợp lệ.' });
          return;
        }

        let uniqueCode = '';
        for (let attempt = 0; attempt < 15; attempt++) {
          const candidate = createRandom6CharCode();
          const codeDoc = await getDoc(
            doc(serverDb, 'studentCodeIndex', candidate)
          );
          if (!codeDoc.exists()) {
            uniqueCode = candidate;
            break;
          }
        }

        if (!uniqueCode) {
          res.status(500).json({
            error: 'Không thể tạo mã học sinh duy nhất, vui lòng thử lại.',
          });
          return;
        }

        const nowIso = new Date().toISOString();
        await setDoc(doc(serverDb, 'studentCodeIndex', uniqueCode), {
          code: uniqueCode,
          studentId,
          status: 'active',
          createdAt: nowIso,
        });

        res.json({ code: uniqueCode, createdAt: nowIso });
      } catch (error) {
        console.error('Error generating student code:', error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Lỗi máy chủ khi cấp mã học sinh.',
        });
      }
    }
  );

  // 2. Parent / Student 6-character code login with rate-limiting & cooldown
  app.post('/api/student-auth/login', async (req: Request, res: Response) => {
    const clientIp =
      (req.headers['x-forwarded-for'] as string)?.split(',')[0]?.trim() ||
      req.socket?.remoteAddress ||
      'unknown';

    const rateRecord = loginAttemptsByIp.get(clientIp) || {
      failedAttempts: 0,
      cooldownUntil: 0,
    };

    if (Date.now() < rateRecord.cooldownUntil) {
      const waitSeconds = Math.ceil(
        (rateRecord.cooldownUntil - Date.now()) / 1000
      );
      res.status(429).json({
        error: `Bạn đã nhập sai quá nhiều lần. Vui lòng thử lại sau ${waitSeconds} giây.`,
        cooldownSeconds: waitSeconds,
      });
      return;
    }

    const parsed = studentCodeLoginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        error: 'Mã truy cập phải gồm đúng 6 ký tự chữ hoặc số.',
      });
      return;
    }

    const code = parsed.data.code;

    try {
      const indexSnap = await getDoc(doc(serverDb, 'studentCodeIndex', code));
      if (!indexSnap.exists()) {
        rateRecord.failedAttempts += 1;
        if (rateRecord.failedAttempts >= MAX_FAILED_ATTEMPTS) {
          rateRecord.cooldownUntil = Date.now() + COOLDOWN_MS;
          rateRecord.failedAttempts = 0;
        }
        loginAttemptsByIp.set(clientIp, rateRecord);
        res.status(401).json({
          error:
            'Mã truy cập không hợp lệ hoặc đã ngừng hoạt động. Vui lòng kiểm tra lại.',
        });
        return;
      }

      const indexData = indexSnap.data() as {
        studentId: string;
        status: string;
      };
      const studentSnap = await getDoc(
        doc(serverDb, 'students', indexData.studentId)
      );

      if (!studentSnap.exists()) {
        res.status(401).json({
          error:
            'Mã truy cập không hợp lệ hoặc đã ngừng hoạt động. Vui lòng kiểm tra lại.',
        });
        return;
      }

      const student = {
        id: studentSnap.id,
        ...(studentSnap.data() as Omit<Student, 'id'>),
      };

      if (student.status !== 'active' || indexData.status !== 'active') {
        res.status(401).json({
          error:
            'Mã truy cập không hợp lệ hoặc đã ngừng hoạt động. Vui lòng kiểm tra lại.',
        });
        return;
      }

      loginAttemptsByIp.delete(clientIp);

      const token = signStudentToken({
        studentId: student.id,
        code: student.accessCode,
        exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
      });

      res.json({
        token,
        student: toPublicStudent(student),
      });
    } catch (error) {
      console.error('Error in student-auth/login:', error);
      res.status(500).json({
        error: 'Không thể xác thực mã học sinh lúc này. Vui lòng thử lại.',
      });
    }
  });

  const requireStudentAuth = (
    req: Request,
    res: Response,
    next: NextFunction
  ) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Phiên đăng nhập học sinh không hợp lệ.' });
      return;
    }
    const token = authHeader.slice(7);
    const payload = verifyStudentToken(token);
    if (!payload) {
      res
        .status(401)
        .json({ error: 'Phiên đăng nhập đã hết hạn, vui lòng nhập lại mã.' });
      return;
    }
    (req as Request & { studentSession?: StudentTokenPayload }).studentSession =
      payload;
    next();
  };

  // 3. Student Portal Data Endpoint
  app.get(
    '/api/student-portal/data',
    requireStudentAuth,
    async (req: Request, res: Response) => {
      try {
        const session = (
          req as Request & { studentSession: StudentTokenPayload }
        ).studentSession;
        const studentSnap = await getDoc(
          doc(serverDb, 'students', session.studentId)
        );
        if (!studentSnap.exists()) {
          res.status(404).json({ error: 'Không tìm thấy hồ sơ học sinh.' });
          return;
        }

        const student = {
          id: studentSnap.id,
          ...(studentSnap.data() as Omit<Student, 'id'>),
        };

        if (student.status !== 'active') {
          res
            .status(403)
            .json({ error: 'Hồ sơ học sinh hiện không hoạt động.' });
          return;
        }

        const classes: ClassRoom[] = [];
        for (const classId of student.classIds || []) {
          const cSnap = await getDoc(doc(serverDb, 'classes', classId));
          if (cSnap.exists()) {
            classes.push({
              id: cSnap.id,
              ...(cSnap.data() as Omit<ClassRoom, 'id'>),
            });
          }
        }

        const saQuery = query(
          collection(serverDb, 'studentAssignments'),
          where('studentId', '==', student.id)
        );
        const saSnap = await getDocs(saQuery);
        const studentAssignments: StudentAssignment[] = saSnap.docs.map(
          (d) => ({
            id: d.id,
            ...(d.data() as Omit<StudentAssignment, 'id'>),
          })
        );

        const assignmentsMap: Record<string, Assignment> = {};
        const submissionsMap: Record<string, Submission> = {};

        for (const sa of studentAssignments) {
          const assignSnap = await getDoc(
            doc(serverDb, 'assignments', sa.assignmentId)
          );
          if (assignSnap.exists()) {
            const rawAssign = {
              id: assignSnap.id,
              ...(assignSnap.data() as Omit<Assignment, 'id'>),
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
          const subSnap = await getDoc(doc(serverDb, 'submissions', subId));
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

        const commentsQuery = query(
          collection(serverDb, 'comments'),
          where('status', '==', 'published')
        );
        const commentsSnap = await getDocs(commentsQuery);
        const comments: CommentReport[] = commentsSnap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<CommentReport, 'id'>),
          }))
          .filter((c) => c.studentId === student.id);

        const gamesQuery = query(
          collection(serverDb, 'games'),
          where('status', '==', 'published')
        );
        const gamesSnap = await getDocs(gamesQuery);
        const games: MathGame[] = gamesSnap.docs
          .map((d) => ({
            id: d.id,
            ...(d.data() as Omit<MathGame, 'id'>),
          }))
          .sort((a, b) => a.order - b.order);

        res.json({
          student: toPublicStudent(student),
          classes,
          studentAssignments: studentAssignments.filter(
            (sa) => Boolean(assignmentsMap[sa.assignmentId])
          ),
          assignmentsMap,
          submissionsMap,
          comments,
          games,
        });
      } catch (error) {
        console.error('Error fetching student portal data:', error);
        res
          .status(500)
          .json({ error: 'Lỗi tải dữ liệu cổng học sinh. Vui lòng thử lại.' });
      }
    }
  );

  // 4. Student Portal Save Draft / Submit Homework
  app.post(
    '/api/student-portal/submit',
    requireStudentAuth,
    async (req: Request, res: Response) => {
      try {
        const session = (
          req as Request & { studentSession: StudentTokenPayload }
        ).studentSession;
        const { assignmentId, answers, isFinalSubmit } = req.body as {
          assignmentId: string;
          answers: StudentQuestionAnswer[];
          isFinalSubmit: boolean;
        };

        if (!assignmentId || !Array.isArray(answers)) {
          res.status(400).json({ error: 'Dữ liệu bài nộp không hợp lệ.' });
          return;
        }

        const saId = `${assignmentId}_${session.studentId}`;
        const [saSnap, assignSnap] = await Promise.all([
          getDoc(doc(serverDb, 'studentAssignments', saId)),
          getDoc(doc(serverDb, 'assignments', assignmentId)),
        ]);

        if (!saSnap.exists() || !assignSnap.exists()) {
          res
            .status(404)
            .json({ error: 'Không tìm thấy bài tập được giao cho bạn.' });
          return;
        }

        const assignment = {
          id: assignSnap.id,
          ...(assignSnap.data() as Omit<Assignment, 'id'>),
        };
        if (assignment.status !== 'active') {
          res
            .status(400)
            .json({ error: 'Bài tập này đã đóng hoặc bị thu hồi.' });
          return;
        }

        const nowIso = new Date().toISOString();
        const subRef = doc(serverDb, 'submissions', saId);
        const existingSubSnap = await getDoc(subRef);

        if (!isFinalSubmit) {
          const draftPayload: Omit<Submission, 'id'> = {
            assignmentId,
            studentId: session.studentId,
            answers,
            maxScore: assignment.maxScore,
            status: 'in_progress',
            isPublished: false,
            updatedAt: nowIso,
          };
          await setDoc(subRef, draftPayload);
          await updateDoc(doc(serverDb, 'studentAssignments', saId), {
            status: 'in_progress',
            updatedAt: nowIso,
          });
          res.json({ status: 'in_progress', savedAt: nowIso });
          return;
        }

        const gradingKey =
          assignment.gradingKeySnapshot || assignment.publicQuestionsSnapshot;
        const existingResults = existingSubSnap.exists()
          ? (existingSubSnap.data() as Submission).questionResults || []
          : [];

        const graded = gradeFullSubmission(gradingKey, answers, existingResults);
        const finalStatus = graded.allAutoGradable ? 'graded' : 'submitted';
        const isPublished = graded.allAutoGradable;

        const submissionData: Omit<Submission, 'id'> = {
          assignmentId,
          studentId: session.studentId,
          answers,
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
        await updateDoc(doc(serverDb, 'studentAssignments', saId), {
          status: finalStatus,
          score: graded.totalScore,
          isScorePublished: isPublished,
          submittedAt: nowIso,
          ...(graded.allAutoGradable ? { gradedAt: nowIso } : {}),
          updatedAt: nowIso,
        });

        res.json({
          status: finalStatus,
          isPublished,
          totalScore: isPublished ? graded.totalScore : undefined,
          maxScore: graded.maxScore,
          submittedAt: nowIso,
        });
      } catch (error) {
        console.error('Error submitting homework:', error);
        res.status(500).json({
          error:
            error instanceof Error
              ? error.message
              : 'Lỗi khi nộp bài tập. Vui lòng thử lại.',
        });
      }
    }
  );

  // 5. AI Endpoint: Parse PDF/Image into Structured Homework
  app.post('/api/ai/parse-homework', async (req: Request, res: Response) => {
    const adapter = getAIAdapter();
    try {
      const { mimeType, base64Data, solveWithAI, preferredModel } = req.body as {
        mimeType?: string;
        base64Data?: string;
        solveWithAI?: boolean;
        preferredModel?: string;
      };

      const allowedMimeTypes = [
        'image/png',
        'image/jpeg',
        'image/webp',
        'application/pdf',
      ];
      if (!mimeType || !allowedMimeTypes.includes(mimeType)) {
        res.status(400).json({
          error:
            'Định dạng file không hỗ trợ. Chỉ chấp nhận PNG, JPG, WEBP hoặc PDF.',
        });
        return;
      }

      if (!base64Data || base64Data.length > 14_000_000) {
        res.status(400).json({
          error: 'File rỗng hoặc vượt quá giới hạn dung lượng 10MB.',
        });
        return;
      }

      const result = await adapter.parseHomeworkFromMedia({
        mimeType,
        base64Data,
        solveWithAI: Boolean(solveWithAI),
        preferredModel,
      });

      await logAIJob({
        taskType: solveWithAI ? 'solve_math' : 'ocr_parse',
        provider: result.provider,
        model: result.model,
        status: 'completed',
        durationMs: result.durationMs,
        estimatedCostUsd: result.estimatedCostUsd,
      });

      res.json(result);
    } catch (error) {
      console.error('AI parse-homework error:', error);
      await logAIJob({
        taskType: 'ocr_parse',
        provider: adapter.providerName,
        model: 'gemini-3.8-flash',
        status: 'failed',
      });
      res.status(500).json({
        error:
          error instanceof Error
            ? `AI không thể chuyển đổi đề: ${error.message}`
            : 'Lỗi xử lý AI khi phân tích đề Toán. Vui lòng thử lại.',
      });
    }
  });

  // 6. AI Endpoint: Suggest Essay Grading
  app.post('/api/ai/suggest-grading', async (req: Request, res: Response) => {
    const adapter = getAIAdapter();
    try {
      const {
        questionPrompt,
        maxPoints,
        rubric,
        sampleSolution,
        studentEssayText,
        preferredModel,
      } = req.body as {
        questionPrompt?: string;
        maxPoints?: number;
        rubric?: string;
        sampleSolution?: string;
        studentEssayText?: string;
        preferredModel?: string;
      };

      if (
        !questionPrompt ||
        typeof maxPoints !== 'number' ||
        !studentEssayText
      ) {
        res.status(400).json({
          error:
            'Thiếu đề bài, thang điểm hoặc nội dung bài làm của học sinh.',
        });
        return;
      }

      const result = await adapter.suggestEssayGrading({
        questionPrompt,
        maxPoints,
        rubric,
        sampleSolution,
        studentEssayText,
        preferredModel,
      });

      await logAIJob({
        taskType: 'essay_grade',
        provider: result.provider,
        model: result.model,
        status: 'completed',
        durationMs: result.durationMs,
        estimatedCostUsd: 0.0005,
      });

      res.json(result);
    } catch (error) {
      console.error('AI suggest-grading error:', error);
      await logAIJob({
        taskType: 'essay_grade',
        provider: adapter.providerName,
        model: 'gemini-3.8-flash',
        status: 'failed',
      });
      res.status(500).json({
        error:
          error instanceof Error
            ? error.message
            : 'Không thể lấy gợi ý chấm điểm từ AI lúc này.',
      });
    }
  });

  return app;
}

const vercelApp = createApiApp();
export default vercelApp;
