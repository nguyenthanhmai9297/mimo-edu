import type { DocumentData, Firestore, Query, WhereFilterOp } from 'firebase-admin/firestore';

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
