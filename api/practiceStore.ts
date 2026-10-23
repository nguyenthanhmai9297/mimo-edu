import type { Firestore } from 'firebase-admin/firestore';
import type { PracticeAttempt, PracticeQuestion, PracticeSet } from '../src/types/practice';
import { servableQuestions } from '../src/utils/practiceEngine';

/** Storage used by the practice API; Firestore in the app, in-memory in unit tests. */
export interface PracticeStore {
  /** Approved questions of published sets for one topic. */
  listServableQuestions(topicId: string): Promise<PracticeQuestion[]>;
  /** Approved questions of published sets, all topics (catalog availability). */
  listAllServableQuestions(): Promise<PracticeQuestion[]>;
  getQuestions(ids: string[]): Promise<PracticeQuestion[]>;
  createAttempt(attempt: PracticeAttempt): Promise<void>;
  getAttempt(id: string): Promise<PracticeAttempt | null>;
  /** Saves the graded result only if the attempt is still in progress. */
  completeAttempt(id: string, patch: Partial<PracticeAttempt>): Promise<boolean>;
  listAttempts(studentId: string, limit: number): Promise<PracticeAttempt[]>;
}

const SETS = 'practiceSets';
const QUESTIONS = 'practiceQuestions';
const ATTEMPTS = 'practiceAttempts';

export function createFirestorePracticeStore(db: Firestore): PracticeStore {
  const publishedSetIds = async (topicId?: string) => {
    let q = db.collection(SETS).where('status', '==', 'published');
    if (topicId) q = q.where('topicId', '==', topicId);
    return (await q.get()).docs.map((d) => d.id);
  };
  const approvedQuestions = async (topicId?: string) => {
    let q = db.collection(QUESTIONS).where('status', '==', 'approved');
    if (topicId) q = q.where('topicId', '==', topicId);
    return (await q.get()).docs.map((d) => ({ ...(d.data() as PracticeQuestion), id: d.id }));
  };

  return {
    async listServableQuestions(topicId) {
      const [sets, questions] = await Promise.all([publishedSetIds(topicId), approvedQuestions(topicId)]);
      return servableQuestions(questions, sets);
    },
    async listAllServableQuestions() {
      const [sets, questions] = await Promise.all([publishedSetIds(), approvedQuestions()]);
      return servableQuestions(questions, sets);
    },
    async getQuestions(ids) {
      if (ids.length === 0) return [];
      const snaps = await db.getAll(...ids.map((id) => db.collection(QUESTIONS).doc(id)));
      return snaps
        .filter((s) => s.exists)
        .map((s) => ({ ...(s.data() as PracticeQuestion), id: s.id }));
    },
    async createAttempt(attempt) {
      const { id, ...data } = attempt;
      await db.collection(ATTEMPTS).doc(id).create(data);
    },
    async getAttempt(id) {
      const snap = await db.collection(ATTEMPTS).doc(id).get();
      return snap.exists ? { ...(snap.data() as PracticeAttempt), id: snap.id } : null;
    },
    async completeAttempt(id, patch) {
      const ref = db.collection(ATTEMPTS).doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists || snap.data()?.status !== 'in_progress') return false;
        tx.update(ref, patch);
        return true;
      });
    },
    async listAttempts(studentId, limit) {
      const snap = await db
        .collection(ATTEMPTS)
        .where('studentId', '==', studentId)
        .orderBy('startedAt', 'desc')
        .limit(limit)
        .get();
      return snap.docs.map((d) => ({ ...(d.data() as PracticeAttempt), id: d.id }));
    },
  };
}

/** In-memory store for unit tests. */
export function createMemoryPracticeStore(seed: {
  sets?: PracticeSet[];
  questions?: PracticeQuestion[];
} = {}): PracticeStore & { attempts: Map<string, PracticeAttempt> } {
  const sets = seed.sets ?? [];
  const questions = seed.questions ?? [];
  const attempts = new Map<string, PracticeAttempt>();
  const published = () => sets.filter((s) => s.status === 'published').map((s) => s.id);
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));

  return {
    attempts,
    async listServableQuestions(topicId) {
      return servableQuestions(questions.filter((q) => q.topicId === topicId), published());
    },
    async listAllServableQuestions() {
      return servableQuestions(questions, published());
    },
    async getQuestions(ids) {
      return questions.filter((q) => ids.includes(q.id));
    },
    async createAttempt(attempt) {
      attempts.set(attempt.id, clone(attempt));
    },
    async getAttempt(id) {
      const a = attempts.get(id);
      return a ? clone(a) : null;
    },
    async completeAttempt(id, patch) {
      const a = attempts.get(id);
      if (!a || a.status !== 'in_progress') return false;
      attempts.set(id, { ...a, ...clone(patch) });
      return true;
    },
    async listAttempts(studentId, limit) {
      return [...attempts.values()]
        .filter((a) => a.studentId === studentId)
        .sort((a, b) => b.startedAt.localeCompare(a.startedAt))
        .slice(0, limit)
        .map(clone);
    },
  };
}
