import type { Firestore } from 'firebase-admin/firestore';
import type { LiveQuizAnswer, LiveQuizPlayer, LiveQuizSession } from '../src/types/liveQuiz';

/** Storage for the Mimo Quiz join mode; Firestore (server-only collections) in the app, in-memory in tests. */
export interface LiveQuizStore {
  /** Claims a join code; false when an unexpired session already holds it. */
  reserveCode(code: string, sessionId: string, expiresAt: number, now: number): Promise<boolean>;
  findSessionIdByCode(code: string): Promise<string | null>;
  createSession(session: LiveQuizSession): Promise<void>;
  getSession(id: string): Promise<LiveQuizSession | null>;
  updateSession(id: string, patch: Partial<LiveQuizSession>): Promise<void>;
  upsertPlayer(player: LiveQuizPlayer): Promise<void>;
  getPlayer(sessionId: string, studentId: string): Promise<LiveQuizPlayer | null>;
  listPlayers(sessionId: string): Promise<LiveQuizPlayer[]>;
  /** Stores the first answer only; false when the student already answered this question. */
  createAnswer(answer: LiveQuizAnswer): Promise<boolean>;
  listAnswers(sessionId: string): Promise<LiveQuizAnswer[]>;
}

const SESSIONS = 'quizSessions';
const CODES = 'quizSessionCodes';
const PLAYERS = 'quizPlayers';
const ANSWERS = 'quizAnswers';

export const playerDocId = (sessionId: string, studentId: string) => `${sessionId}_${studentId}`;
export const answerDocId = (a: Pick<LiveQuizAnswer, 'sessionId' | 'index' | 'studentId'>) => `${a.sessionId}_${a.index}_${a.studentId}`;

export function createFirestoreLiveQuizStore(db: Firestore): LiveQuizStore {
  return {
    async reserveCode(code, sessionId, expiresAt, now) {
      const ref = db.collection(CODES).doc(code);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && (snap.data()?.expiresAt ?? 0) > now) return false;
        tx.set(ref, { sessionId, expiresAt });
        return true;
      });
    },
    async findSessionIdByCode(code) {
      const snap = await db.collection(CODES).doc(code).get();
      return snap.exists ? (snap.data()?.sessionId as string) : null;
    },
    async createSession(session) {
      const { id, ...data } = session;
      await db.collection(SESSIONS).doc(id).create(data);
    },
    async getSession(id) {
      const snap = await db.collection(SESSIONS).doc(id).get();
      return snap.exists ? ({ ...(snap.data() as Omit<LiveQuizSession, 'id'>), id: snap.id } as LiveQuizSession) : null;
    },
    async updateSession(id, patch) {
      const { id: _ignored, ...data } = patch;
      await db.collection(SESSIONS).doc(id).update(data);
    },
    async upsertPlayer(player) {
      await db.collection(PLAYERS).doc(playerDocId(player.sessionId, player.studentId)).set(player);
    },
    async getPlayer(sessionId, studentId) {
      const snap = await db.collection(PLAYERS).doc(playerDocId(sessionId, studentId)).get();
      return snap.exists ? (snap.data() as LiveQuizPlayer) : null;
    },
    async listPlayers(sessionId) {
      const snap = await db.collection(PLAYERS).where('sessionId', '==', sessionId).get();
      return snap.docs.map((d) => d.data() as LiveQuizPlayer);
    },
    async createAnswer(answer) {
      try {
        await db.collection(ANSWERS).doc(answerDocId(answer)).create(answer);
        return true;
      } catch (error) {
        // ALREADY_EXISTS: the deterministic id makes a second answer impossible
        if ((error as { code?: number }).code === 6) return false;
        throw error;
      }
    },
    async listAnswers(sessionId) {
      const snap = await db.collection(ANSWERS).where('sessionId', '==', sessionId).get();
      return snap.docs.map((d) => d.data() as LiveQuizAnswer);
    },
  };
}

/** In-memory store for unit tests. */
export function createMemoryLiveQuizStore(): LiveQuizStore & { sessions: Map<string, LiveQuizSession> } {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const sessions = new Map<string, LiveQuizSession>();
  const codes = new Map<string, { sessionId: string; expiresAt: number }>();
  const players = new Map<string, LiveQuizPlayer>();
  const answers = new Map<string, LiveQuizAnswer>();
  return {
    sessions,
    async reserveCode(code, sessionId, expiresAt, now) {
      const held = codes.get(code);
      if (held && held.expiresAt > now) return false;
      codes.set(code, { sessionId, expiresAt });
      return true;
    },
    async findSessionIdByCode(code) {
      return codes.get(code)?.sessionId ?? null;
    },
    async createSession(session) {
      if (sessions.has(session.id)) throw new Error('exists');
      sessions.set(session.id, clone(session));
    },
    async getSession(id) {
      const s = sessions.get(id);
      return s ? clone(s) : null;
    },
    async updateSession(id, patch) {
      const s = sessions.get(id);
      if (!s) throw new Error('not found');
      sessions.set(id, { ...s, ...clone(patch), id });
    },
    async upsertPlayer(player) {
      players.set(playerDocId(player.sessionId, player.studentId), clone(player));
    },
    async getPlayer(sessionId, studentId) {
      const p = players.get(playerDocId(sessionId, studentId));
      return p ? clone(p) : null;
    },
    async listPlayers(sessionId) {
      return [...players.values()].filter((p) => p.sessionId === sessionId).map(clone);
    },
    async createAnswer(answer) {
      const id = answerDocId(answer);
      if (answers.has(id)) return false;
      answers.set(id, clone(answer));
      return true;
    },
    async listAnswers(sessionId) {
      return [...answers.values()].filter((a) => a.sessionId === sessionId).map(clone);
    },
  };
}
