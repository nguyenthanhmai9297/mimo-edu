import {
  collection,
  doc,
  documentId,
  getDoc,
  getDocs,
  query,
  where,
  writeBatch,
} from 'firebase/firestore';
import { db, handleFirestoreError, OperationType } from '../lib/firebase/config';
import type { PracticeQuestion, PracticeSet } from '../types/practice';
import { ImportValidation, validatePracticeQuestionEdit } from '../utils/practiceEngine';

/**
 * Teacher-side access to the practice bank. Runs in the teacher's browser with
 * their Google session; firestore.rules allow these collections to admins only.
 */

const SETS = 'practiceSets';
const QUESTIONS = 'practiceQuestions';
const BATCH_SIZE = 400;

const withId = <T>(snap: { id: string; data: () => unknown }) => ({ ...(snap.data() as T), id: snap.id });

export async function listPracticeSets(): Promise<PracticeSet[]> {
  try {
    return (await getDocs(collection(db, SETS))).docs.map((d) => withId<PracticeSet>(d));
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, SETS);
    throw error;
  }
}

export async function listPracticeQuestions(topicId?: string): Promise<PracticeQuestion[]> {
  try {
    const q = topicId ? query(collection(db, QUESTIONS), where('topicId', '==', topicId)) : collection(db, QUESTIONS);
    return (await getDocs(q)).docs
      .map((d) => withId<PracticeQuestion>(d))
      .sort((a, b) => a.datasetId.localeCompare(b.datasetId) || a.order - b.order);
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, QUESTIONS);
    throw error;
  }
}

/** Which of these question ids already exist (Firestore `in` takes 30 ids per query). */
export async function findExistingQuestionIds(ids: string[]): Promise<string[]> {
  const found: string[] = [];
  for (let i = 0; i < ids.length; i += 30) {
    const chunk = ids.slice(i, i + 30);
    const snap = await getDocs(query(collection(db, QUESTIONS), where(documentId(), 'in', chunk)));
    found.push(...snap.docs.map((d) => d.id));
  }
  return found;
}

/**
 * Imports a validated file as a draft set with draft questions. Existing
 * questions with the same id are only replaced when the teacher asks to.
 */
export async function importPracticeSet(
  validation: ImportValidation,
  options: { teacherEmail: string; replaceConflicts: boolean }
): Promise<void> {
  const { dataset, questions, errors, conflictIds } = validation;
  if (!dataset || errors.length > 0) throw new Error('Tệp còn lỗi, chưa thể nhập.');
  if (conflictIds.length > 0 && !options.replaceConflicts) {
    throw new Error(`${conflictIds.length} câu đã có trên hệ thống. Hãy chọn thay thế hoặc đổi mã câu.`);
  }
  const setRef = doc(db, SETS, dataset.id);
  if ((await getDoc(setRef)).exists() && !options.replaceConflicts) {
    throw new Error(`Bộ "${dataset.id}" đã được nhập trước đó.`);
  }

  const now = new Date().toISOString();
  const setDoc: Omit<PracticeSet, 'id'> = {
    topicId: dataset.topicId,
    title: dataset.title,
    schemaVersion: dataset.schemaVersion,
    questionCount: questions.length,
    status: 'draft',
    ...(dataset.notes ? { notes: dataset.notes.slice(0, 2000) } : {}),
    importedAt: now,
    importedBy: options.teacherEmail,
    updatedAt: now,
  };

  try {
    for (let i = 0; i < questions.length; i += BATCH_SIZE) {
      const batch = writeBatch(db);
      for (const { id, ...q } of questions.slice(i, i + BATCH_SIZE)) {
        batch.set(doc(db, QUESTIONS, id), { ...q, updatedAt: now, updatedBy: options.teacherEmail });
      }
      if (i === 0) batch.set(setRef, setDoc);
      await batch.commit();
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, SETS);
    throw error;
  }
}

export async function updatePracticeQuestion(q: PracticeQuestion, teacherEmail: string): Promise<void> {
  const issues = validatePracticeQuestionEdit(q);
  if (issues.length > 0) throw new Error(issues.map((i) => i.message).join(' '));
  const { id, ...data } = q;
  const batch = writeBatch(db);
  batch.set(doc(db, QUESTIONS, id), {
    ...data,
    // Two or more correct options make it a multi-answer question
    type: data.correctAnswers.length > 1 ? 'multiple_choice' : 'single_choice',
    updatedAt: new Date().toISOString(),
    updatedBy: teacherEmail,
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${QUESTIONS}/${id}`);
    throw error;
  }
}

export async function setPracticeQuestionStatus(
  questions: PracticeQuestion[],
  status: PracticeQuestion['status'],
  teacherEmail: string
): Promise<void> {
  const now = new Date().toISOString();
  for (let i = 0; i < questions.length; i += BATCH_SIZE) {
    const batch = writeBatch(db);
    for (const { id, ...data } of questions.slice(i, i + BATCH_SIZE)) {
      batch.set(doc(db, QUESTIONS, id), { ...data, status, updatedAt: now, updatedBy: teacherEmail });
    }
    try {
      await batch.commit();
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, QUESTIONS);
      throw error;
    }
  }
}

export async function setPracticeSetStatus(set: PracticeSet, status: PracticeSet['status']): Promise<void> {
  const { id, ...data } = set;
  const now = new Date().toISOString();
  const batch = writeBatch(db);
  batch.set(doc(db, SETS, id), {
    ...data,
    status,
    ...(status === 'published' ? { publishedAt: now } : {}),
    updatedAt: now,
  });
  try {
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `${SETS}/${id}`);
    throw error;
  }
}
