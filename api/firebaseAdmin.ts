import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Auth, getAuth } from 'firebase-admin/auth';
import { DocumentData, Firestore, getFirestore, Query, WhereFilterOp } from 'firebase-admin/firestore';

/**
 * Firebase Admin SDK for features that must keep data away from browsers
 * ("Luyện Toán cùng Mimo"). Admin access bypasses security rules, so the
 * practice collections can be closed to every client except teachers.
 *
 * - Emulator: set FIRESTORE_EMULATOR_HOST; only `demo-*` project ids are allowed,
 *   which Firebase guarantees can never reach a real project.
 * - Production: FIREBASE_SERVICE_ACCOUNT holds the service-account JSON
 *   (raw or base64). Without it the practice API reports "not configured".
 */

export const EMULATOR_PROJECT_ID = 'demo-lop-chung-minh';
const DEFAULT_DATABASE_ID = '(default)';
const APP_NAME = 'practice-admin';

let cachedDb: Firestore | null | undefined;

export function isUsingFirebaseEmulator(): boolean {
  return Boolean(process.env.FIRESTORE_EMULATOR_HOST);
}

function parseServiceAccount(raw: string): Record<string, string> {
  const text = raw.trim().startsWith('{') ? raw : Buffer.from(raw, 'base64').toString('utf8');
  return JSON.parse(text);
}

function initAdminApp(): App | null {
  const existing = getApps().find((a) => a.name === APP_NAME);
  if (existing) return existing;

  if (isUsingFirebaseEmulator()) {
    const projectId = process.env.GCLOUD_PROJECT || EMULATOR_PROJECT_ID;
    if (!projectId.startsWith('demo-')) {
      throw new Error(`Emulator chỉ được dùng project "demo-*", nhận "${projectId}".`);
    }
    return initializeApp({ projectId }, APP_NAME);
  }

  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (!raw) return null;
  const serviceAccount = parseServiceAccount(raw);
  return initializeApp(
    { credential: cert(serviceAccount), projectId: serviceAccount.project_id },
    APP_NAME
  );
}

/** Admin Auth (verifies teachers' Firebase ID tokens), or null without credentials. */
export function getAdminAuth(): Auth | null {
  const app = initAdminApp();
  return app ? getAuth(app) : null;
}

/** Returns the Admin Firestore, or null when the server has no credentials. */
export function getAdminDb(): Firestore | null {
  if (cachedDb !== undefined) return cachedDb;
  const app = initAdminApp();
  cachedDb = app
    ? getFirestore(app, process.env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID)
    : null;
  return cachedDb;
}

// Kept in this file: every .ts under api/ is its own Vercel function, and the plan allows 12.
/**
 * The student endpoints read and write through the Admin SDK (server
 * credentials), so Security Rules can stay closed to anonymous browsers.
 * These helpers keep the names of the browser SDK calls they replace.
 */

export interface ServerSnap {
  id: string;
  exists: () => boolean;
  data: () => DocumentData | undefined;
}

type Ref = FirebaseFirestore.DocumentReference;
type Filter = { field: string; op: WhereFilterOp; value: unknown };

export const doc = (db: Firestore, path: string, id: string): Ref => db.collection(path).doc(id);
export const collection = (db: Firestore, path: string): Query => db.collection(path);
export const where = (field: string, op: WhereFilterOp, value: unknown): Filter => ({ field, op, value });
export const query = (q: Query, ...filters: Filter[]): Query => filters.reduce((acc, f) => acc.where(f.field, f.op, f.value), q);

export async function getDoc(ref: Ref): Promise<ServerSnap> {
  const s = await ref.get();
  return { id: s.id, exists: () => s.exists, data: () => s.data() };
}

export async function getDocs(q: Query): Promise<{ docs: { id: string; data: () => DocumentData }[] }> {
  const s = await q.get();
  return { docs: s.docs.map((d) => ({ id: d.id, data: () => d.data() })) };
}

export const setDoc = (ref: Ref, data: DocumentData) => ref.set(data);
export const updateDoc = (ref: Ref, data: DocumentData) => ref.update(data);
