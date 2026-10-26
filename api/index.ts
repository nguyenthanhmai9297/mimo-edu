import crypto from 'crypto';
import dotenv from 'dotenv';
import express, { NextFunction, Request, Response } from 'express';
import { getApps, initializeApp } from 'firebase/app';
import {
  collection,
  connectFirestoreEmulator,
  doc,
  getDoc,
  getDocs,
  getFirestore,
  query,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { EMULATOR_PROJECT_ID, getAdminAuth, getAdminDb, isUsingFirebaseEmulator } from './firebaseAdmin.js';
import { AIJobLog, createAIRouter } from './aiRoutes.js';
import { cloudinaryConfigFromEnv, createMediaRouter } from './mediaRoutes.js';
import { checkEmbeddable } from './gameEmbed.js';
import { createBellGameRouter } from './bellGame.js';
import { BellGameStore, createFirestoreBellStore } from './bellGameStore.js';
import { createLiveQuizRouter } from './liveQuiz.js';
import { createFirestoreLiveQuizStore, LiveQuizStore } from './liveQuizStore.js';
import { createPracticeRouter } from './practice.js';
import { createFirestorePracticeStore, PracticeStore } from './practiceStore.js';
import { createRequireTeacher } from './teacherAuth.js';
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
} from '../src/types/domain.js';
import {
  createPublicQuestionsSnapshot,
  createRandom6CharCode,
  gradeFullSubmission,
} from '../src/utils/gradingEngine.js';

// Local secrets live in .env.local (git-ignored); on Vercel they come from Environment Variables
dotenv.config({ path: ['.env.local', '.env'], quiet: true });

// The AI SDKs are large: load them only when an AI endpoint is used, so the
// student endpoints start faster on a cold serverless instance.
const loadAIAdapter = async () => (await import('../src/services/aiAdapter.js')).getAIAdapter();
// Mirrors isAIConfigured() in aiAdapter.ts without loading the SDKs
const isAIConfigured = () =>
  Boolean(process.env.AI_PROVIDER === 'gemini' ? process.env.GEMINI_API_KEY : process.env.ANTHROPIC_API_KEY);

// Embedded Firebase Configuration to guarantee zero file-resolution crashes on Vercel Serverless
const firebaseConfig = {
  projectId: 'mimoedu-3b862',
  appId: '1:791665221556:web:c3c33acb0fd4703df69ce1',
  apiKey: 'AIzaSyDpvsPl-2XXwDICad157PXRdUWYBpbxFKE',
  authDomain: 'mimoedu-3b862.firebaseapp.com',
  firestoreDatabaseId: '(default)',
  storageBucket: 'mimoedu-3b862.firebasestorage.app',
  messagingSenderId: '791665221556',
  measurementId: 'G-44762WLNWH',
  oAuthClientId: '',
  recaptchaSiteKey: '',
};

let serverDbInstance: ReturnType<typeof getFirestore> | null = null;
function getServerDb() {
  if (!serverDbInstance) {
    const existing = getApps().find((a) => a.name === 'server-firebase-app');
    // Local testing: point at the Firestore emulator under a demo-* project so
    // nothing can reach the real database.
    const emulatorHost = process.env.FIRESTORE_EMULATOR_HOST;
    const app =
      existing ||
      initializeApp(
        emulatorHost ? { ...firebaseConfig, projectId: EMULATOR_PROJECT_ID } : firebaseConfig,
        'server-firebase-app'
      );
    serverDbInstance = getFirestore(app, firebaseConfig.firestoreDatabaseId);
    if (emulatorHost && !existing) {
      const [host, port] = emulatorHost.split(':');
      connectFirestoreEmulator(serverDbInstance, host, Number(port));
    }
  }
  return serverDbInstance;
}

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

// aiJobs is written by this server only, through the Admin SDK (Security Rules
// deny every browser write). Without server credentials the log is skipped.
async function logAIJob(job: AIJobLog) {
  try {
    const adminDb = getAdminDb();
    if (!adminDb) return;
    const jobId = `aijob_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    await adminDb.collection('aiJobs').doc(jobId).set({ ...job, createdAt: new Date().toISOString() });
  } catch (err) {
    console.warn('Non-fatal: Could not record aiJob log:', err);
  }
}

export function createApiApp() {
  const app = express();

  // The frontend is served from Firebase Hosting, so the browser calls this
  // API cross-origin. Extra origins can be listed in CORS_ALLOWED_ORIGINS.
  const allowedOrigins = new Set([
    'https://mimoedu-3b862.web.app',
    'https://mimoedu-3b862.firebaseapp.com',
    ...(process.env.CORS_ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim())
      .filter(Boolean),
  ]);
  app.use((req, res, next) => {
    const origin = req.headers.origin;
    if (origin && allowedOrigins.has(origin)) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Authorization,Content-Type');
      res.setHeader('Access-Control-Max-Age', '86400');
    }
    if (req.method === 'OPTIONS') {
      res.status(204).end();
      return;
    }
    next();
  });

  app.use(express.json({ limit: '15mb' }));

  // Middleware to support both /api/... and direct /... routes when rewritten by Vercel
  app.use((req, _res, next) => {
    if (req.url.startsWith('/api/')) {
      // already prefixed
    }
    next();
  });

  // 1. Server-side unique 6-character student code generation
  const handleGenerateStudentCode = async (req: Request, res: Response) => {
    try {
      const db = getServerDb();
      const { studentId } = req.body as { studentId?: string };
      if (!studentId || typeof studentId !== 'string') {
        res.status(400).json({ error: 'Thiếu studentId hợp lệ.' });
        return;
      }

      let uniqueCode = '';
      for (let attempt = 0; attempt < 15; attempt++) {
        const candidate = createRandom6CharCode();
        const codeDoc = await getDoc(
          doc(db, 'studentCodeIndex', candidate)
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
      await setDoc(doc(db, 'studentCodeIndex', uniqueCode), {
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
  };
  app.post('/api/admin/generate-student-code', handleGenerateStudentCode);
  app.post('/admin/generate-student-code', handleGenerateStudentCode);

  // 2. Parent / Student 6-character code login
  const handleStudentLogin = async (req: Request, res: Response) => {
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

    const rawCode = (req.body?.code as string | undefined)?.trim().toUpperCase() || '';
    if (!/^[A-Z0-9]{6}$/.test(rawCode)) {
      res.status(400).json({
        error: 'Mã truy cập phải gồm đúng 6 ký tự chữ hoặc số.',
      });
      return;
    }

    try {
      const db = getServerDb();
      const indexSnap = await getDoc(doc(db, 'studentCodeIndex', rawCode));
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
        doc(db, 'students', indexData.studentId)
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
  };
  app.post('/api/student-auth/login', handleStudentLogin);
  app.post('/student-auth/login', handleStudentLogin);

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

  // Luyện Toán cùng Mimo: served through the Admin SDK so answer keys stay server-side
  let practiceStore: PracticeStore | null | undefined;
  const practiceRouter = createPracticeRouter({
    requireStudentAuth,
    getStore: () => {
      if (practiceStore === undefined) {
        try {
          const adminDb = getAdminDb();
          practiceStore = adminDb ? createFirestorePracticeStore(adminDb) : null;
        } catch (error) {
          console.error('Firebase Admin init failed (FIREBASE_SERVICE_ACCOUNT?):', error);
          practiceStore = null;
        }
      }
      return practiceStore;
    },
  });
  app.use(['/api/practice', '/practice'], practiceRouter);

  // Teacher-only APIs (Mimo Quiz, AI) check the Firebase ID token on the server
  const requireTeacher = createRequireTeacher(() => {
    const auth = getAdminAuth();
    const adminDb = getAdminDb();
    return {
      verifyIdToken: auth && adminDb ? (token: string) => auth.verifyIdToken(token) : null,
      isAllowlisted: async (email: string) => (await adminDb!.collection('adminAllowlist').doc(email).get()).exists,
    };
  });
  let liveQuizStore: LiveQuizStore | null | undefined;
  const liveQuizRouter = createLiveQuizRouter({
    enabled: () => isUsingFirebaseEmulator() || process.env.LIVE_QUIZ_ENABLED === 'true',
    requireTeacher,
    requireStudentAuth,
    getStore: () => {
      if (liveQuizStore === undefined) {
        try {
          const adminDb = getAdminDb();
          liveQuizStore = adminDb ? createFirestoreLiveQuizStore(adminDb) : null;
        } catch (error) {
          console.error('Firebase Admin init failed (live quiz):', error);
          liveQuizStore = null;
        }
      }
      return liveQuizStore;
    },
    getStudentName: async (studentId) => {
      const snap = await getAdminDb()?.collection('students').doc(studentId).get();
      const data = snap?.data() as { fullName?: string; nickname?: string } | undefined;
      return data?.nickname || data?.fullName || 'Học sinh';
    },
  });
  app.use(['/api/live-quiz', '/live-quiz'], liveQuizRouter);

  // Rung chuông vàng: pupils join without an account, with a player token for one game
  let bellStore: BellGameStore | null | undefined;
  const bellRouter = createBellGameRouter({
    requireTeacher,
    sign: (data) => crypto.createHmac('sha256', `bell:${SESSION_SECRET}`).update(data).digest('base64url'),
    getStore: () => {
      if (bellStore === undefined) {
        try {
          const adminDb = getAdminDb();
          bellStore = adminDb ? createFirestoreBellStore(adminDb) : null;
        } catch (error) {
          console.error('Firebase Admin init failed (bell game):', error);
          bellStore = null;
        }
      }
      return bellStore;
    },
  });
  app.use(['/api/bell', '/bell'], bellRouter);

  // 3. Student Portal Data Endpoint
  const handleStudentPortalData = async (req: Request, res: Response) => {
    try {
      const db = getServerDb();
      const session = (
        req as Request & { studentSession: StudentTokenPayload }
      ).studentSession;
      const studentSnap = await getDoc(
        doc(db, 'students', session.studentId)
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

      // Every read below is independent: run them together instead of one by one
      const [classes, studentAssignments, comments, games] = await Promise.all([
        Promise.all(
          (student.classIds || []).map(async (classId) => {
            const cSnap = await getDoc(doc(db, 'classes', classId));
            return cSnap.exists() ? ({ id: cSnap.id, ...(cSnap.data() as Omit<ClassRoom, 'id'>) } as ClassRoom) : null;
          })
        ).then((list) => list.filter((c): c is ClassRoom => c !== null)),
        getDocs(query(collection(db, 'studentAssignments'), where('studentId', '==', student.id))).then((snap) =>
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<StudentAssignment, 'id'>) }))
        ),
        // Only this student's published comments (was: every published comment, filtered here)
        getDocs(
          query(collection(db, 'comments'), where('status', '==', 'published'), where('studentId', '==', student.id))
        ).then((snap) => snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<CommentReport, 'id'>) }))),
        getDocs(query(collection(db, 'games'), where('status', '==', 'published'))).then((snap) =>
          snap.docs.map((d) => ({ id: d.id, ...(d.data() as Omit<MathGame, 'id'>) })).sort((a, b) => a.order - b.order)
        ),
      ]);

      const assignmentsMap: Record<string, Assignment> = {};
      const submissionsMap: Record<string, Submission> = {};

      await Promise.all(
        studentAssignments.map(async (sa) => {
          const [assignSnap, subSnap] = await Promise.all([
            getDoc(doc(db, 'assignments', sa.assignmentId)),
            getDoc(doc(db, 'submissions', `${sa.assignmentId}_${student.id}`)),
          ]);
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
        })
      );

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
  };
  app.get('/api/student-portal/data', requireStudentAuth, handleStudentPortalData);
  app.get('/student-portal/data', requireStudentAuth, handleStudentPortalData);

  // Trò chơi Toán: published games of the teachers' Kho trò chơi, for every
  // signed-in student (with or without a class), plus whether each game site
  // lets MimoEDU show it in an iframe or it must open in a new tab.
  const handleStudentGames = async (req: Request, res: Response) => {
    try {
      const db = getServerDb();
      const snap = await getDocs(query(collection(db, 'games'), where('status', '==', 'published')));
      const games = snap.docs
        .map((d) => ({ id: d.id, ...(d.data() as Omit<MathGame, 'id'>) }))
        .sort((a, b) => a.order - b.order);
      const sent = req.headers.origin || (req.headers.referer ? new URL(req.headers.referer).origin : '');
      const parentOrigin = sent || 'https://mimoedu-3b862.web.app';
      const embeddable = await Promise.all(games.map((g) => checkEmbeddable(g.embedUrl, parentOrigin)));
      res.json({ games: games.map((g, i) => ({ ...g, embeddable: embeddable[i] })) });
    } catch (error) {
      console.error('Error in student-portal/games:', error);
      res.status(500).json({ error: 'Không tải được danh sách trò chơi. Con thử lại nhé!' });
    }
  };
  app.get('/api/student-portal/games', requireStudentAuth, handleStudentGames);
  app.get('/student-portal/games', requireStudentAuth, handleStudentGames);

  // 4. Student Portal Save Draft / Submit Homework
  const handleStudentSubmit = async (req: Request, res: Response) => {
    try {
      const db = getServerDb();
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
        getDoc(doc(db, 'studentAssignments', saId)),
        getDoc(doc(db, 'assignments', assignmentId)),
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
      const subRef = doc(db, 'submissions', saId);
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
        await updateDoc(doc(db, 'studentAssignments', saId), {
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
      await updateDoc(doc(db, 'studentAssignments', saId), {
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
  };
  app.post('/api/student-portal/submit', requireStudentAuth, handleStudentSubmit);
  app.post('/student-portal/submit', requireStudentAuth, handleStudentSubmit);

  // 5. AI endpoints (teacher only, rate-limited; see api/aiRoutes.ts)
  const aiRouter = createAIRouter({
    requireTeacher,
    isConfigured: isAIConfigured,
    loadAdapter: loadAIAdapter,
    logJob: logAIJob,
  });
  app.use(['/api/ai', '/ai'], aiRouter);

  // 6. Homework images on Cloudinary (teacher only; off until the CLOUDINARY_* variables are set)
  const mediaRouter = createMediaRouter({
    requireTeacher,
    getConfig: () => cloudinaryConfigFromEnv(),
    isImageInUse: async (publicId) => {
      const adminDb = getAdminDb();
      if (!adminDb) throw new Error('Firestore Admin is not configured');
      for (const name of ['homework', 'assignments']) {
        const snap = await adminDb.collection(name).get();
        if (snap.docs.some((d) => JSON.stringify(d.data()).includes(publicId))) return true;
      }
      return false;
    },
  });
  app.use(['/api/media', '/media'], mediaRouter);

  return app;
}

const vercelApp = createApiApp();
export default function handler(req: Request, res: Response) {
  return vercelApp(req, res);
}
