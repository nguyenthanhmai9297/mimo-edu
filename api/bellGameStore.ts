import type { Firestore } from 'firebase-admin/firestore';
import type { BellGame } from '../src/features/games/bell/bellEngine.js';

/** One pupil's answer to one question (online mode), stored once and never changed. */
export interface BellAnswer {
  gameId: string;
  index: number;
  playerId: string;
  answer: string;
  at: number;
}

/**
 * Storage for Rung chuông vàng: server-only Firestore collections (browsers
 * only see what the API returns), in-memory in tests. The whole game is one
 * document; answers are separate documents so a class answering at the same
 * moment never queues on the game document.
 */
export interface BellGameStore {
  reserveCode(code: string, gameId: string, expiresAt: number, now: number): Promise<boolean>;
  findGameIdByCode(code: string): Promise<string | null>;
  create(game: BellGame): Promise<void>;
  get(id: string): Promise<BellGame | null>;
  /**
   * Changes a game atomically. `withAnswersOf` loads the answers of that
   * question for `change`; `change` returns the new game, or null to leave it as is.
   */
  mutate(
    id: string,
    change: (game: BellGame, answers: BellAnswer[]) => BellGame | null,
    withAnswersOf?: (game: BellGame) => number | null
  ): Promise<BellGame | null>;
  /** First answer only; false when this pupil already answered this question. */
  createAnswer(answer: BellAnswer): Promise<boolean>;
  getAnswer(gameId: string, index: number, playerId: string): Promise<BellAnswer | null>;
  listAnswers(gameId: string, index: number): Promise<BellAnswer[]>;
  listByTeacher(email: string, limit: number): Promise<BellGame[]>;
}

const GAMES = 'bellGames';
const CODES = 'bellGameCodes';
const ANSWERS = 'bellAnswers';
export const bellAnswerId = (gameId: string, index: number, playerId: string) => `${gameId}_${index}_${playerId}`;

export function createFirestoreBellStore(db: Firestore): BellGameStore {
  const answersOf = (gameId: string, index: number) => db.collection(ANSWERS).where('gameId', '==', gameId).where('index', '==', index);
  return {
    async reserveCode(code, gameId, expiresAt, now) {
      const ref = db.collection(CODES).doc(code);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (snap.exists && (snap.data()?.expiresAt ?? 0) > now) return false;
        tx.set(ref, { gameId, expiresAt });
        return true;
      });
    },
    async findGameIdByCode(code) {
      const snap = await db.collection(CODES).doc(code).get();
      return snap.exists ? (snap.data()?.gameId as string) : null;
    },
    async create(game) {
      const { id, ...data } = game;
      await db.collection(GAMES).doc(id).create(data);
    },
    async get(id) {
      const snap = await db.collection(GAMES).doc(id).get();
      return snap.exists ? ({ ...(snap.data() as Omit<BellGame, 'id'>), id: snap.id } as BellGame) : null;
    },
    async mutate(id, change, withAnswersOf) {
      const ref = db.collection(GAMES).doc(id);
      return db.runTransaction(async (tx) => {
        const snap = await tx.get(ref);
        if (!snap.exists) return null;
        const game = { ...(snap.data() as Omit<BellGame, 'id'>), id } as BellGame;
        const index = withAnswersOf?.(game) ?? null;
        const answers = index === null ? [] : (await tx.get(answersOf(id, index))).docs.map((d) => d.data() as BellAnswer);
        const next = change(game, answers);
        if (!next) return game;
        const { id: _id, ...data } = next;
        tx.set(ref, data);
        return next;
      });
    },
    async createAnswer(answer) {
      try {
        await db.collection(ANSWERS).doc(bellAnswerId(answer.gameId, answer.index, answer.playerId)).create(answer);
        return true;
      } catch (error) {
        // ALREADY_EXISTS: the fixed id allows one answer per pupil and question
        if ((error as { code?: number }).code === 6) return false;
        throw error;
      }
    },
    async getAnswer(gameId, index, playerId) {
      const snap = await db.collection(ANSWERS).doc(bellAnswerId(gameId, index, playerId)).get();
      return snap.exists ? (snap.data() as BellAnswer) : null;
    },
    async listAnswers(gameId, index) {
      return (await answersOf(gameId, index).get()).docs.map((d) => d.data() as BellAnswer);
    },
    async listByTeacher(email, limit) {
      const snap = await db.collection(GAMES).where('teacherEmail', '==', email).get();
      return snap.docs
        .map((d) => ({ ...(d.data() as Omit<BellGame, 'id'>), id: d.id }) as BellGame)
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
  };
}

/** In-memory store for unit tests. */
export function createMemoryBellStore(): BellGameStore {
  const clone = <T>(v: T): T => JSON.parse(JSON.stringify(v));
  const games = new Map<string, BellGame>();
  const codes = new Map<string, { gameId: string; expiresAt: number }>();
  const answers = new Map<string, BellAnswer>();
  const list = (gameId: string, index: number) => [...answers.values()].filter((a) => a.gameId === gameId && a.index === index).map(clone);
  return {
    async reserveCode(code, gameId, expiresAt, now) {
      const held = codes.get(code);
      if (held && held.expiresAt > now) return false;
      codes.set(code, { gameId, expiresAt });
      return true;
    },
    async findGameIdByCode(code) {
      return codes.get(code)?.gameId ?? null;
    },
    async create(game) {
      if (games.has(game.id)) throw new Error('exists');
      games.set(game.id, clone(game));
    },
    async get(id) {
      const g = games.get(id);
      return g ? clone(g) : null;
    },
    async mutate(id, change, withAnswersOf) {
      const g = games.get(id);
      if (!g) return null;
      const game = clone(g);
      const index = withAnswersOf?.(game) ?? null;
      const next = change(game, index === null ? [] : list(id, index));
      if (!next) return game;
      games.set(id, clone(next));
      return clone(next);
    },
    async createAnswer(answer) {
      const id = bellAnswerId(answer.gameId, answer.index, answer.playerId);
      if (answers.has(id)) return false;
      answers.set(id, clone(answer));
      return true;
    },
    async getAnswer(gameId, index, playerId) {
      const a = answers.get(bellAnswerId(gameId, index, playerId));
      return a ? clone(a) : null;
    },
    async listAnswers(gameId, index) {
      return list(gameId, index);
    },
    async listByTeacher(email, limit) {
      return [...games.values()].filter((g) => g.teacherEmail === email).sort((a, b) => b.createdAt - a.createdAt).slice(0, limit).map(clone);
    },
  };
}
