import React, {
  createContext,
  useContext,
  useEffect,
  useState,
} from 'react';
import { onAuthStateChanged, signInWithPopup, signOut, User } from 'firebase/auth';
import { auth, googleProvider } from '../lib/firebase/config';
import {
  subscribeAssignments,
  subscribeClasses,
  subscribeComments,
  subscribeHomeworkList,
  subscribeMathGames,
  subscribeStudentAssignments,
  subscribeStudents,
  subscribeSubmissions,
  verifyAdminAccess,
} from '../services/firestoreRepository';
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

interface AppContextValue {
  // Admin Auth
  user: User | null;
  authReady: boolean;
  isAdminAuthorized: boolean;
  adminCheckLoading: boolean;
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

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);
      if (firebaseUser) {
        setAdminCheckLoading(true);
        try {
          const allowed = await verifyAdminAccess(firebaseUser.email);
          setIsAdminAuthorized(allowed);
          if (!allowed) {
            setAuthError(
              `Tài khoản (${firebaseUser.email}) chưa nằm trong danh sách Admin Allowlist. Chỉ giáo viên được cấp quyền mới có thể truy cập quản trị.`
            );
          } else {
            setAuthError(null);
          }
        } catch (err) {
          console.error('Admin verification error:', err);
          setIsAdminAuthorized(false);
        } finally {
          setAdminCheckLoading(false);
        }
      } else {
        setIsAdminAuthorized(false);
        setAdminCheckLoading(false);
      }
      setAuthReady(true);
    });
    return () => unsub();
  }, []);

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
    const unsubs = [
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

    return () => {
      unsubs.forEach((u) => u());
    };
  }, [authReady, user, isAdminAuthorized]);

  const loginAdminWithGoogle = async (): Promise<boolean> => {
    setAuthError(null);
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      const allowed = await verifyAdminAccess(cred.user.email);
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
    await signOut(auth);
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
        authReady,
        isAdminAuthorized,
        adminCheckLoading,
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
