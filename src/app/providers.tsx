import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
} from 'react';
import type { User } from 'firebase/auth';
import {
  clearStudentToken,
  getSavedStudentToken,
} from '../services/studentPortalService';
import {
  Assignment,
  ClassRoom,
  CommentReport,
  Homework,
  MathGame,
  Student,
  StudentAssignment,
  Submission,
} from '../types/domain';

/**
 * The Firebase SDK (auth + Firestore, ~170 KB gzipped) is only needed by
 * teachers. It is loaded on demand, and never on the student pages, which
 * talk to the API with their own session token.
 */
const loadTeacherFirebase = async () => {
  const [fbAuth, config, repo] = await Promise.all([
    import('firebase/auth'),
    import('../lib/firebase/config'),
    import('../services/firestoreRepository'),
  ]);
  return { fbAuth, config, repo };
};

/** Student-only pages: the teacher login is not started there. */
const isStudentOnlyPath = (path: string) => /^\/(portal|quiz)(\/|$)/.test(path);

interface AppContextValue {
  // Admin Auth
  user: User | null;
  /** Starts the teacher sign-in check (loads Firebase) if not started yet. */
  ensureTeacherAuth: () => void;
  authReady: boolean;
  isAdminAuthorized: boolean;
  adminCheckLoading: boolean;
  /** The allowlist could not be read (network/server), which is not the same as "no access". */
  adminCheckFailed: boolean;
  authError: string | null;
  loginAdminWithGoogle: () => Promise<boolean>;
  logoutAdmin: () => Promise<void>;

  // Admin Real-time Firestore Data
  classes: ClassRoom[];
  students: Student[];
  homeworkList: Homework[];
  assignments: Assignment[];
  studentAssignments: StudentAssignment[];
  submissions: Submission[];
  comments: CommentReport[];
  games: MathGame[];
  /** Kho trò chơi: true until the first snapshot arrives. */
  gamesLoading: boolean;
  gamesError: string | null;
  adminDataLoading: boolean;

  // Student Portal Token State
  hasStudentSession: boolean;
  refreshStudentSessionState: () => void;
  logoutStudentPortal: () => void;
}

const AppContext = createContext<AppContextValue | undefined>(undefined);

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isAdminAuthorized, setIsAdminAuthorized] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(false);
  const [adminCheckFailed, setAdminCheckFailed] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);

  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [students, setStudents] = useState<Student[]>([]);
  const [homeworkList, setHomeworkList] = useState<Homework[]>([]);
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [studentAssignments, setStudentAssignments] = useState<
    StudentAssignment[]
  >([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [comments, setComments] = useState<CommentReport[]>([]);
  const [games, setGames] = useState<MathGame[]>([]);
  const [gamesLoading, setGamesLoading] = useState(false);
  const [gamesError, setGamesError] = useState<string | null>(null);
  const [adminDataLoading, setAdminDataLoading] = useState(false);

  const [hasStudentSession, setHasStudentSession] = useState<boolean>(() =>
    Boolean(getSavedStudentToken())
  );
  const [teacherAuthWanted, setTeacherAuthWanted] = useState(
    () => !isStudentOnlyPath(window.location.pathname)
  );
  const ensureTeacherAuth = useCallback(() => setTeacherAuthWanted(true), []);

  useEffect(() => {
    if (!teacherAuthWanted) return;
    let cancelled = false;
    let unsub: (() => void) | undefined;
    void loadTeacherFirebase().then(({ fbAuth, config, repo }) => {
      if (cancelled) return;
      // Reads the allowlist; a failed read is retried once, then reported as a connection problem
      const checkAdmin = async (firebaseUser: User, attempt = 1): Promise<void> => {
        setAdminCheckLoading(true);
        setAdminCheckFailed(false);
        try {
          const allowed = await repo.verifyAdminAccess(firebaseUser.email);
          if (cancelled) return;
          setIsAdminAuthorized(allowed);
          setAuthError(
            allowed
              ? null
              : `Tài khoản (${firebaseUser.email}) chưa nằm trong danh sách Admin Allowlist. Chỉ giáo viên được cấp quyền mới có thể truy cập quản trị.`
          );
          setAdminCheckLoading(false);
        } catch (err) {
          console.error('Admin verification error:', err);
          if (cancelled) return;
          if (attempt === 1) {
            await new Promise((r) => setTimeout(r, 1500));
            if (!cancelled) return checkAdmin(firebaseUser, 2);
            return;
          }
          setIsAdminAuthorized(false);
          setAdminCheckFailed(true);
          setAdminCheckLoading(false);
        }
      };
      unsub = fbAuth.onAuthStateChanged(config.auth, async (firebaseUser) => {
          setUser(firebaseUser);
          if (firebaseUser) {
            await checkAdmin(firebaseUser);
          } else {
            setIsAdminAuthorized(false);
            setAdminCheckFailed(false);
            setAdminCheckLoading(false);
          }
          setAuthReady(true);
      });
    });
    return () => {
      cancelled = true;
      unsub?.();
    };
  }, [teacherAuthWanted]);

  useEffect(() => {
    if (!authReady || !user || !isAdminAuthorized) {
      setClasses([]);
      setStudents([]);
      setHomeworkList([]);
      setAssignments([]);
      setStudentAssignments([]);
      setSubmissions([]);
      setComments([]);
      setGames([]);
      setGamesLoading(false);
      setGamesError(null);
      return;
    }

    setAdminDataLoading(true);
    setGamesLoading(true);
    setGamesError(null);
    let cancelled = false;
    let unsubs: (() => void)[] = [];
    void loadTeacherFirebase().then(({ repo }) => {
      if (cancelled) return;
      const {
        subscribeAssignments,
        subscribeClasses,
        subscribeComments,
        subscribeHomeworkList,
        subscribeMathGames,
        subscribeStudentAssignments,
        subscribeStudents,
        subscribeSubmissions,
      } = repo;
      unsubs = [
      subscribeClasses((c) => {
        setClasses(c);
        setAdminDataLoading(false);
      }),
      subscribeStudents(setStudents),
      subscribeHomeworkList(setHomeworkList),
      subscribeAssignments(setAssignments),
      subscribeStudentAssignments(setStudentAssignments),
      subscribeSubmissions(setSubmissions),
      subscribeComments(setComments),
      subscribeMathGames(
        (g) => {
          setGames(g);
          setGamesLoading(false);
          setGamesError(null);
        },
        (message) => {
          setGamesLoading(false);
          setGamesError(message);
        }
      ),
      ];
    });

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, isAdminAuthorized]);

  const loginAdminWithGoogle = async (): Promise<boolean> => {
    setAuthError(null);
    try {
      setTeacherAuthWanted(true);
      const { fbAuth, config, repo } = await loadTeacherFirebase();
      const cred = await fbAuth.signInWithPopup(config.auth, config.googleProvider);
      const allowed = await repo.verifyAdminAccess(cred.user.email);
      setIsAdminAuthorized(allowed);
      if (!allowed) {
        setAuthError(
          `Email ${cred.user.email} chưa được cấp quyền Quản trị (Admin Allowlist).`
        );
      }
      return allowed;
    } catch (error) {
      const msg =
        error instanceof Error
          ? error.message
          : 'Không thể đăng nhập bằng Google lúc này.';
      setAuthError(msg);
      return false;
    }
  };

  const logoutAdmin = async () => {
    const { fbAuth, config } = await loadTeacherFirebase();
    await fbAuth.signOut(config.auth);
    setIsAdminAuthorized(false);
    setAuthError(null);
  };

  const refreshStudentSessionState = () => {
    setHasStudentSession(Boolean(getSavedStudentToken()));
  };

  const logoutStudentPortal = () => {
    clearStudentToken();
    setHasStudentSession(false);
  };

  return (
    <AppContext.Provider
      value={{
        user,
        ensureTeacherAuth,
        authReady,
        isAdminAuthorized,
        adminCheckLoading,
        adminCheckFailed,
        authError,
        loginAdminWithGoogle,
        logoutAdmin,
        classes,
        students,
        homeworkList,
        assignments,
        studentAssignments,
        submissions,
        comments,
        games,
        gamesLoading,
        gamesError,
        adminDataLoading,
        hasStudentSession,
        refreshStudentSessionState,
        logoutStudentPortal,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export function useAppContext(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) {
    throw new Error('useAppContext must be used inside AppProvider');
  }
  return ctx;
}
