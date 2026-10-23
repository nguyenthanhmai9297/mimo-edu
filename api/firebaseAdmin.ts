import { App, cert, getApps, initializeApp } from 'firebase-admin/app';
import { Firestore, getFirestore } from 'firebase-admin/firestore';

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
const DEFAULT_DATABASE_ID = 'ai-studio-61c10e80-066b-4298-9fa9-96b167747f9a';
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

/** Returns the Admin Firestore, or null when the server has no credentials. */
export function getAdminDb(): Firestore | null {
  if (cachedDb !== undefined) return cachedDb;
  const app = initAdminApp();
  cachedDb = app
    ? getFirestore(app, process.env.FIRESTORE_DATABASE_ID || DEFAULT_DATABASE_ID)
    : null;
  return cachedDb;
}
