/**
 * Saves / restores the Firestore emulator data of the app's named database.
 * `firebase emulators:export` only covers the (default) database, so the app's
 * own database would otherwise be lost when the emulator restarts.
 *
 *   npm run emulator:save   → emulator-data/firestore.json (old file kept as .bak)
 *   npm run emulator:load   → restores it into an EMPTY emulator database
 *   npm run emulators       → scripts/startEmulators.mjs does both automatically
 *
 * Refuses to run unless FIRESTORE_EMULATOR_HOST is set (never touches real Firebase).
 */
import fs from 'fs';
import path from 'path';
import { DocumentReference, Firestore, Timestamp } from 'firebase-admin/firestore';
import { getAdminDb, isUsingFirebaseEmulator } from '../api/firebaseAdmin';

const FILE = path.resolve('emulator-data/firestore.json');

type Dump = Record<string, Record<string, unknown>>; // full document path → data

const encode = (v: unknown): unknown => {
  if (v instanceof Timestamp) return { __timestamp: v.toMillis() };
  if (Array.isArray(v)) return v.map(encode);
  if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
};
const decode = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(decode);
  if (v && typeof v === 'object') {
    if ('__timestamp' in v) return Timestamp.fromMillis((v as { __timestamp: number }).__timestamp);
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
};

async function dumpRef(ref: DocumentReference, out: Dump) {
  const snap = await ref.get();
  if (snap.exists) out[ref.path] = encode(snap.data()) as Record<string, unknown>;
  for (const sub of await ref.listCollections()) {
    for (const child of await sub.listDocuments()) await dumpRef(child, out);
  }
}

async function save(db: Firestore) {
  const out: Dump = {};
  for (const col of await db.listCollections()) {
    for (const ref of await col.listDocuments()) await dumpRef(ref, out);
  }
  if (Object.keys(out).length === 0 && fs.existsSync(FILE)) {
    throw new Error('Emulator đang trống – không lưu đè lên bản sao lưu đã có.');
  }
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  if (fs.existsSync(FILE)) fs.copyFileSync(FILE, FILE + '.bak');
  fs.writeFileSync(FILE, JSON.stringify(out));
  console.log(`Đã lưu ${Object.keys(out).length} bản ghi vào ${path.relative(process.cwd(), FILE)}`);
}

async function load(db: Firestore) {
  if (!fs.existsSync(FILE)) throw new Error(`Chưa có tệp ${FILE}. Hãy chạy "npm run emulator:save" trước.`);
  if ((await db.listCollections()).length > 0) {
    throw new Error('Emulator đã có dữ liệu – không nạp đè. Khởi động lại Emulator trống rồi chạy lại.');
  }
  const data = JSON.parse(fs.readFileSync(FILE, 'utf8')) as Dump;
  const entries = Object.entries(data);
  for (let i = 0; i < entries.length; i += 400) {
    const batch = db.batch();
    for (const [p, d] of entries.slice(i, i + 400)) batch.set(db.doc(p), decode(d) as Record<string, unknown>);
    await batch.commit();
  }
  console.log(`Đã nạp lại ${entries.length} bản ghi vào Emulator.`);
}

async function main() {
  if (!isUsingFirebaseEmulator()) {
    throw new Error('Chỉ chạy được với Firebase Emulator (thiếu FIRESTORE_EMULATOR_HOST).');
  }
  const db = getAdminDb();
  if (!db) throw new Error('Không khởi tạo được Firestore emulator.');
  const cmd = process.argv[2];
  if (cmd === 'save') await save(db);
  else if (cmd === 'load') await load(db);
  else throw new Error('Dùng: emulatorData.ts save | load');
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
