import React, { Suspense, lazy, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  ArrowDown,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Download,
  Copy,
  Edit3,
  Eye,
  ArrowLeft,
  Bell,
  FileText,
  Gamepad2,
  History,
  Info,
  Loader2,
  PenLine,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { MathRichEditor } from '../../components/editor/MathRichEditor';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import {
  AIImportModal,
  ExtractedHomework,
  FigureCropInfo,
  SourceFile,
} from './AIImportModal';
import { FigureRecropModal } from './FigureRecropModal';
import { useAutoFigureRedraw } from './useAutoFigureRedraw';
import { bellQuestionsOf } from '../games/bell/bellQuestions';
import { cropFigure, NormalizedBox } from './figureCrop';
import {
  FigureCropContext,
  FigureCropContextValue,
} from '../../components/editor/FigureCropContext';
import { SourceDocumentPanel } from './SourceDocumentPanel';

// The Word builder is large; it loads only when a teacher opens the export
const WordExportModal = lazy(() => import('./WordExportModal').then((m) => ({ default: m.WordExportModal })));
import {
  deleteDraftHomework,
  duplicateHomework,
  reserveHomeworkRef,
  saveHomework,
} from '../../services/firestoreRepository';
import { mediaStoreEnabled, releaseImages, storeInlineImages, storedImageIds } from '../../services/mediaService';
import {
  ChoiceOption,
  Homework,
  HomeworkQuestion,
  PRACTICE_LEVEL_LABELS,
  PracticeLevel,
  QuestionType,
  RichTextContent,
  TrueFalseStatement,
} from '../../types/domain';
import { createRichTextFromPlain } from '../../utils/gradingEngine';
import { DEFAULT_GRADE, normalizeGrade } from '../../utils/grade';
import { incompletenessMessage } from '../../utils/aiCompleteness';
import { homeworkImportSchema } from '../../schemas/validation';
import { buildHomeworkFromMimo, isMimoDataset, MimoDataset } from './mimoImport';
import { MimoImportModal } from './MimoImportModal';
import { changeQuestionType, isPlainContent, TypeChange } from './questionConvert';
import {
  clearLocalDraft,
  gameReadiness,
  HOMEWORK_FORMAT_LABELS,
  HOMEWORK_FORMATS,
  HomeworkFormat,
  homeworkPath,
  listLocalDraftKeys,
  LocalHomeworkDraft,
  NEW_HOMEWORK,
  parseHomeworkPath,
  readLocalDraft,
  SaveTimeoutError,
  saveErrorMessage,
  withSaveTimeout,
  writeLocalDraft,
} from './homeworkFlow';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
  LoadingState,
  PageHeader,
  SearchInput,
  SectionHeading,
  SegmentedFilter,
  StatusBadge,
  STUDIO_TONE,
  Toolbar,
} from '../../components/studio/StudioUi';

const QUESTION_TYPE_LABELS: Record<QuestionType, string> = {
  single_choice: '1. Trắc nghiệm 1 đáp án',
  multiple_choice: '2. Trắc nghiệm nhiều đáp án',
  true_false_multi: '3. Đúng / Sai nhiều ý',
  short_answer: '4. Trả lời ngắn',
  essay: '5. Tự luận Toán học',
};

function createDefaultQuestion(
  type: QuestionType,
  order: number
): HomeworkQuestion {
  const qId = `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
  const basePrompt = createRichTextFromPlain('');

  if (type === 'single_choice' || type === 'multiple_choice') {
    const options: ChoiceOption[] = ['A', 'B', 'C', 'D'].map((label, idx) => ({
      id: `${qId}_opt_${idx + 1}`,
      label,
      content: createRichTextFromPlain(`Phương án ${label}`),
    }));
    return {
      id: qId,
      order,
      type,
      prompt: basePrompt,
      points: 2,
      options,
      ...(type === 'single_choice'
        ? { correctOptionId: options[0].id }
        : { correctOptionIds: [options[0].id] }),
    };
  }

  if (type === 'true_false_multi') {
    const statements: TrueFalseStatement[] = ['a', 'b', 'c', 'd'].map(
      (label, idx) => ({
        id: `${qId}_st_${idx + 1}`,
        label,
        statement: createRichTextFromPlain(`Mệnh đề ${label}`),
        isTrue: idx % 2 === 0,
        points: 0.5,
      })
    );
    return {
      id: qId,
      order,
      type,
      prompt: basePrompt,
      points: 2,
      statements,
    };
  }

  if (type === 'short_answer') {
    return {
      id: qId,
      order,
      type,
      prompt: basePrompt,
      points: 2,
      acceptableAnswers: [''],
    };
  }

  return {
    id: qId,
    order,
    type: 'essay',
    prompt: basePrompt,
    points: 2,
    rubric: '',
    sampleSolution: createRichTextFromPlain(''),
  };
}

type EditorFields = Omit<LocalHomeworkDraft, 'savedAt'>;

const withOrder = (f: EditorFields): EditorFields => ({
  ...f,
  questions: f.questions.map((q, i) => ({ ...q, order: i + 1 })),
});

const blankFields = (): EditorFields => ({
  title: '',
  description: '',
  grade: DEFAULT_GRADE,
  answerSource: 'teacher',
  aiSolverEnabled: true,
  questions: [createDefaultQuestion('single_choice', 1)],
  missingQuestionsWarning: null,
});

const fieldsOfHomework = (hw: Homework): EditorFields =>
  withOrder({
    title: hw.title,
    description: hw.description || '',
    grade: hw.grade || DEFAULT_GRADE,
    answerSource: hw.answerSource,
    aiSolverEnabled: hw.aiSolverEnabled,
    questions: hw.questions || [],
    missingQuestionsWarning: null,
  });

const timeLabel = (iso: string) =>
  new Date(iso).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });

const otherFormat = (f: HomeworkFormat): HomeworkFormat => (f === 'word' ? 'game' : 'word');

export const HomeworkPage: React.FC = () => {
  const { homeworkList, adminDataLoading, user } = useAppContext();
  // Unsaved work on this device belongs to the signed-in teacher
  const owner = user?.email ?? 'unknown';
  const navigate = useNavigate();
  const { format, target } = parseHomeworkPath(useParams()['*']);
  // Homework id or "new" when the URL points at the editor
  const editorKey = format && target ? target : null;

  const [studentPreviewMode, setStudentPreviewMode] = useState(false);
  // The saved homework being edited; null until a new one is first saved
  const [editingRef, setEditingRef] = useState<{ id: string; createdAt: string } | null>(null);
  // Which editor target the form currently holds, so the URL can change (Word ⇄ Game) without reloading it
  const [loadedKey, setLoadedKey] = useState<string | null>(null);
  // The form as last saved to the system; anything else is unsaved work
  const [baseline, setBaseline] = useState('');
  const [restoredAt, setRestoredAt] = useState<string | null>(null);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const [localSaveFailed, setLocalSaveFailed] = useState(false);
  const [draftsVersion, setDraftsVersion] = useState(0);

  // Homework Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [grade, setGrade] = useState(DEFAULT_GRADE);
  const [answerSource, setAnswerSource] = useState<'teacher' | 'ai'>('teacher');
  const [aiSolverEnabled, setAiSolverEnabled] = useState(true);
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([]);
  // On for a homework just converted from exam pictures: its figures are redrawn without being chosen
  const [autoRedraw, setAutoRedraw] = useState(false);
  const [saving, setSaving] = useState(false);
  const [wordExportOpen, setWordExportOpen] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // AI Upload Modal State
  const [aiModalOpen, setAiModalOpen] = useState(false);
  // Original exam pages shown beside the editor while reviewing AI output
  const [sourceFiles, setSourceFiles] = useState<SourceFile[]>([]);
  const [showSource, setShowSource] = useState(true);

  // Figures cropped from source pages during AI import, keyed by image URL
  const [figureCrops, setFigureCrops] = useState<Record<string, FigureCropInfo>>({});
  const [recropRequest, setRecropRequest] = useState<{
    url: string;
    resolve: (newUrl: string | null) => void;
  } | null>(null);
  const [confirmPublish, setConfirmPublish] = useState(false);
  // Set when an AI conversion may have skipped questions; cleared once the teacher has compared with the paper
  const [missingQuestionsWarning, setMissingQuestionsWarning] = useState<string | null>(null);

  // Homework list filters and delete confirmation
  const [hwSearch, setHwSearch] = useState('');
  const [hwStatus, setHwStatus] = useState<'all' | 'draft' | 'published'>('all');
  const [deletingHw, setDeletingHw] = useState<Homework | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const clearSourceFiles = () => {
    sourceFiles.forEach((f) => URL.revokeObjectURL(f.objectUrl));
    setSourceFiles([]);
    setFigureCrops({});
  };

  /** Fills the form for one editor target; `savedSnapshot` is what counts as already saved. */
  // Id kept for a new homework whose save got no answer, so saving again never makes a second copy
  const reservedRef = useRef<{ id: string; createdAt: string } | null>(null);
  const loadEditor = (
    key: string,
    fields: EditorFields,
    ref: { id: string; createdAt: string } | null,
    savedSnapshot: string,
    restoredFrom: string | null = null
  ) => {
    const f = withOrder(fields);
    reservedRef.current = null;
    setLoadedKey(key);
    setEditingRef(ref);
    setTitle(f.title);
    setDescription(f.description);
    setGrade(f.grade);
    setAnswerSource(f.answerSource);
    setAiSolverEnabled(f.aiSolverEnabled);
    setQuestions(f.questions);
    setAutoRedraw(false);
    setMissingQuestionsWarning(f.missingQuestionsWarning);
    setBaseline(savedSnapshot);
    setRestoredAt(restoredFrom);
    setSavedAt(null);
    setStudentPreviewMode(false);
    setConfirmPublish(false);
    setErrorMsg(null);
  };

  const homeworkById = (id: string) => homeworkList.find((h) => h.id === id);

  /** Opens the target named by the URL: unsaved work kept on this device wins over the saved copy. */
  const loadTarget = (key: string, ignoreLocal = false) => {
    const local = ignoreLocal ? null : readLocalDraft(owner, key);
    if (key === NEW_HOMEWORK) {
      const fresh = blankFields();
      if (local) loadEditor(key, local, null, '', local.savedAt);
      else loadEditor(key, fresh, null, JSON.stringify(withOrder(fresh)));
      return true;
    }
    const hw = homeworkById(key);
    if (!hw) return false;
    const saved = fieldsOfHomework(hw);
    loadEditor(key, local ?? saved, { id: hw.id, createdAt: hw.createdAt }, JSON.stringify(saved), local?.savedAt ?? null);
    return true;
  };

  // Work handed to the editor (from a file, AI or a first save) waits here until the URL
  // has switched: the router applies navigations as transitions, a render after our own state
  const handoff = useRef<{ key: string; run: () => void } | null>(null);
  const openInEditor = (key: string, run: () => void, replace = false) => {
    handoff.current = { key, run };
    navigate(homeworkPath(format ?? 'word', key), { replace });
  };

  useEffect(() => {
    if (!editorKey) {
      if (loadedKey && !handoff.current) {
        clearSourceFiles();
        setLoadedKey(null);
      }
      return;
    }
    if (editorKey === loadedKey) return;
    if (handoff.current?.key === editorKey) {
      const { run } = handoff.current;
      handoff.current = null;
      run();
      return;
    }
    loadTarget(editorKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editorKey, loadedKey, homeworkList]);

  const currentSnapshot = useMemo(
    () => JSON.stringify({ title, description, grade, answerSource, aiSolverEnabled, questions, missingQuestionsWarning }),
    [title, description, grade, answerSource, aiSolverEnabled, questions, missingQuestionsWarning]
  );
  const editorReady = Boolean(editorKey) && loadedKey === editorKey;
  const dirty = editorReady && currentSnapshot !== baseline;

  // Keep unsaved work on this device (written shortly after each change, and when the page closes)
  const pendingDraftWrite = useRef<(() => void) | null>(null);
  useEffect(() => {
    if (!editorReady || !loadedKey) return;
    const key = loadedKey;
    const write = () => {
      pendingDraftWrite.current = null;
      if (dirty) {
        const fields = JSON.parse(currentSnapshot) as EditorFields;
        setLocalSaveFailed(!writeLocalDraft(owner, key, { ...fields, savedAt: new Date().toISOString() }));
      } else {
        clearLocalDraft(owner, key);
        setLocalSaveFailed(false);
      }
    };
    pendingDraftWrite.current = write;
    const timer = window.setTimeout(write, 400);
    return () => window.clearTimeout(timer);
  }, [editorReady, loadedKey, dirty, currentSnapshot, owner]);
  useEffect(() => () => pendingDraftWrite.current?.(), []);

  // Changes not yet in the system: closing or reloading the tab asks first
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => {
      pendingDraftWrite.current?.();
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  // ...and so does leaving through a link or the Đóng button (BrowserRouter has no route blocker)
  const [leaveTo, setLeaveTo] = useState<string | null>(null);
  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = (e.target as Element | null)?.closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, window.location.href);
      if (url.origin !== window.location.origin) return;
      const to = url.pathname + url.search + url.hash;
      if (url.pathname === window.location.pathname) return;
      e.preventDefault();
      e.stopPropagation();
      setLeaveTo(to);
    };
    window.addEventListener('click', onClick, true);
    return () => window.removeEventListener('click', onClick, true);
  }, [dirty]);

  const localDraftKeys = useMemo(
    () => new Set(listLocalDraftKeys(owner)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draftsVersion, editorKey, homeworkList, owner]
  );

  const figureCropContext: FigureCropContextValue = {
    canRecrop: (url) => {
      const info = figureCrops[url];
      return Boolean(info && sourceFiles.some((f) => f.id === info.sourceId));
    },
    recrop: (url) =>
      new Promise((resolve) => setRecropRequest({ url, resolve })),
  };

  const finishRecrop = async (box: NormalizedBox | null) => {
    if (!recropRequest) return;
    const { url, resolve } = recropRequest;
    setRecropRequest(null);
    const info = figureCrops[url];
    const page = info && sourceFiles.find((f) => f.id === info.sourceId);
    if (!box || !info || !page) {
      resolve(null);
      return;
    }
    try {
      const newUrl = await cropFigure(page.objectUrl, box);
      setFigureCrops((prev) => ({ ...prev, [newUrl]: { sourceId: info.sourceId, box } }));
      resolve(newUrl);
    } catch {
      resolve(null);
    }
  };

  const pendingReviewCount = questions.filter((q) => q.aiReviewNote).length;

  const markQuestionReviewed = (idx: number) => {
    setQuestions((prev) =>
      prev.map((q, i) => {
        if (i !== idx) return q;
        const { aiReviewNote: _reviewed, ...rest } = q;
        return rest;
      })
    );
  };

  const activeFormat: HomeworkFormat = format ?? 'word';
  // Word editor: figures never tried are redrawn as soon as the homework is open (right after
  // AI recognition, or an older homework), never waiting for the Word export window
  const figureRedrawProgress = useAutoFigureRedraw(
    questions,
    setQuestions,
    (autoRedraw || activeFormat === 'word') && Boolean(editorKey) && editorKey === loadedKey
  );

  const startNewHomework = () => {
    clearSourceFiles();
    navigate(homeworkPath(activeFormat, NEW_HOMEWORK));
  };

  const openHomework = (hw: Homework, inFormat: HomeworkFormat) => navigate(homeworkPath(inFormat, hw.id));

  const closeEditor = () => (dirty ? setLeaveTo(homeworkPath(activeFormat)) : navigate(homeworkPath(activeFormat)));
  const leaveEditor = () => {
    const to = leaveTo;
    setLeaveTo(null);
    pendingDraftWrite.current?.();
    if (to) navigate(to);
  };

  /** Throws away unsaved work on this device and shows the saved copy (or a blank form). */
  const discardLocalChanges = () => {
    if (!loadedKey) return;
    clearLocalDraft(owner, loadedKey);
    pendingDraftWrite.current = null;
    loadTarget(loadedKey, true);
    setDraftsVersion((v) => v + 1);
  };

  const addQuestion = (type: QuestionType) => {
    setQuestions((prev) => [
      ...prev,
      createDefaultQuestion(type, prev.length + 1),
    ]);
  };

  const duplicateQuestionAt = (idx: number) => {
    const target = questions[idx];
    if (!target) return;
    const copy: HomeworkQuestion = {
      ...JSON.parse(JSON.stringify(target)),
      id: `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
      order: questions.length + 1,
    };
    setQuestions((prev) => [...prev, copy]);
  };

  const removeQuestionAt = (idx: number) => {
    setQuestions((prev) =>
      prev
        .filter((_, i) => i !== idx)
        .map((q, newIdx) => ({ ...q, order: newIdx + 1 }))
    );
  };

  const moveQuestion = (idx: number, direction: -1 | 1) => {
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= questions.length) return;
    const copy = [...questions];
    const temp = copy[idx];
    copy[idx] = copy[targetIdx];
    copy[targetIdx] = temp;
    setQuestions(copy.map((q, i) => ({ ...q, order: i + 1 })));
  };

  const updateQuestionAt = (idx: number, updated: HomeworkQuestion) => {
    const copy = [...questions];
    copy[idx] = updated;
    setQuestions(copy);
  };

  // Changing a question's type never drops content silently: anything the new type cannot keep is confirmed first
  const [pendingTypeChange, setPendingTypeChange] = useState<{ idx: number; change: TypeChange } | null>(null);
  const [lastTypeChange, setLastTypeChange] = useState<{ questionId: string; before: HomeworkQuestion; notes: string[] } | null>(null);
  const applyTypeChange = (idx: number, change: TypeChange) => {
    const before = questions[idx];
    updateQuestionAt(idx, { ...change.question, order: before.order });
    setLastTypeChange({ questionId: before.id, before, notes: change.notes });
    setPendingTypeChange(null);
  };
  const requestTypeChange = (idx: number, to: QuestionType) => {
    const change = changeQuestionType(questions[idx], to);
    if (change.losses.length === 0 && change.notes.length === 0) applyTypeChange(idx, change);
    else setPendingTypeChange({ idx, change });
  };
  const undoTypeChange = () => {
    if (!lastTypeChange) return;
    setQuestions((prev) => prev.map((q) => (q.id === lastTypeChange.questionId ? { ...lastTypeChange.before, order: q.order } : q)));
    setLastTypeChange(null);
  };

  const handleSave = async (status: 'draft' | 'published') => {
    setErrorMsg(null);
    if (status === 'published' && missingQuestionsWarning) {
      setErrorMsg('Chưa thể xuất bản: AI có thể đã bỏ sót câu hỏi. Hãy đối chiếu với đề gốc rồi bấm "Đã đối chiếu đủ câu".');
      return;
    }
    if (status === 'published' && pendingReviewCount > 0 && !confirmPublish) {
      setConfirmPublish(true);
      setErrorMsg(
        `Còn ${pendingReviewCount} câu AI đánh dấu "Cần kiểm tra". Hãy soát lại, hoặc bấm "Xuất Bản Đề" lần nữa để vẫn xuất bản.`
      );
      return;
    }
    setConfirmPublish(false);
    if (!title.trim()) {
      setErrorMsg('Vui lòng nhập tiêu đề bài tập về nhà.');
      return;
    }
    if (questions.length === 0) {
      setErrorMsg('Bài tập phải có ít nhất 1 câu hỏi.');
      return;
    }

    const totalPoints = Number(
      questions.reduce((s, q) => s + (Number(q.points) || 0), 0).toFixed(2)
    );

    setSaving(true);
    try {
      const target = editingRef ?? (reservedRef.current ??= reserveHomeworkRef());
      // With the image store on, images go to Cloudinary first; if that fails nothing is saved
      let toSave = questions;
      let replaced = new Map<string, string>();
      if (mediaStoreEnabled) {
        try {
          ({ questions: toSave, replaced } = await withSaveTimeout(storeInlineImages(target.id, questions), 120_000));
        } catch (err) {
          console.error('Image upload failed:', err);
          pendingDraftWrite.current?.();
          setErrorMsg(
            `Chưa lưu: ${err instanceof Error && !(err instanceof SaveTimeoutError) ? err.message : 'không tải được ảnh lên kho ảnh.'} Bài và ảnh vẫn được giữ tạm trên máy này.`
          );
          return;
        }
      }
      const saved = await withSaveTimeout(saveHomework(
        {
          title,
          description,
          subject: 'Toán',
          grade,
          questions: toSave,
          answerSource,
          aiSolverEnabled,
          totalPoints,
          status,
        },
        target
      ));
      // The system now holds this version: drop the copy kept on this device
      pendingDraftWrite.current = null;
      if (loadedKey) clearLocalDraft(owner, loadedKey);
      clearLocalDraft(owner, saved.id);
      setDraftsVersion((v) => v + 1);
      setEditingRef(saved);
      if (mediaStoreEnabled) {
        const before = storedImageIds((JSON.parse(baseline || '{}') as Partial<EditorFields>).questions ?? []);
        const now = storedImageIds(toSave);
        void releaseImages([...before].filter((id) => !now.has(id)));
      }
      if (toSave !== questions) {
        setQuestions(toSave);
        setFigureCrops((prev) => {
          const next = { ...prev };
          for (const [from, to] of replaced) if (prev[from]) next[to] = prev[from];
          return next;
        });
        setBaseline(JSON.stringify({ title, description, grade, answerSource, aiSolverEnabled, questions: toSave, missingQuestionsWarning }));
      } else {
        setBaseline(currentSnapshot);
      }
      setRestoredAt(null);
      if (status === 'published') {
        navigate(homeworkPath(activeFormat));
      } else {
        // Stay in the editor; later saves update this same homework
        setSavedAt(new Date().toISOString());
        if (loadedKey !== saved.id) openInEditor(saved.id, () => setLoadedKey(saved.id), true);
      }
    } catch (err) {
      console.error('Save homework failed:', err);
      pendingDraftWrite.current?.();
      setErrorMsg(saveErrorMessage(err, !localSaveFailed));
    } finally {
      setSaving(false);
    }
  };

  const [importError, setImportError] = useState<string | null>(null);

  const [mimoDataset, setMimoDataset] = useState<MimoDataset | null>(null);

  /** Opens content that came from a file or from AI as a new, unsaved homework. */
  const openImportedDraft = (draft: {
    title: string;
    description?: string;
    grade?: string;
    answerSource: 'teacher' | 'ai';
    aiSolverEnabled: boolean;
    questions: HomeworkQuestion[];
    missingQuestionsWarning?: string | null;
  }, notice?: string, autoRedrawFigures = false) => {
    const fields: EditorFields = {
      title: draft.title,
      description: draft.description || '',
      grade: draft.grade || DEFAULT_GRADE,
      answerSource: draft.answerSource,
      aiSolverEnabled: draft.aiSolverEnabled,
      questions: draft.questions,
      missingQuestionsWarning: draft.missingQuestionsWarning ?? null,
    };
    // Not saved yet, so it counts as unsaved work from the start
    openInEditor(NEW_HOMEWORK, () => {
      loadEditor(NEW_HOMEWORK, fields, null, '');
      if (autoRedrawFigures) setAutoRedraw(true);
      if (notice) setErrorMsg(notice);
    });
  };

  const openDataFile = async (file: File) => {
    setImportError(null);
    clearSourceFiles();
    let json: unknown;
    try {
      json = JSON.parse(await file.text());
    } catch {
      setImportError('Không đọc được file. Hãy chọn đúng file đề .json.');
      return;
    }
    // MimoEDU question sets: let the teacher choose levels first
    if (isMimoDataset(json)) {
      setMimoDataset(json);
      return;
    }
    const parsed = homeworkImportSchema.safeParse(json);
    if (!parsed.success) {
      setImportError('File không đúng định dạng đề của hệ thống hoặc bộ câu hỏi MimoEDU.');
      return;
    }
    openImportedDraft({
      ...parsed.data,
      questions: parsed.data.questions as unknown as HomeworkQuestion[],
    });
  };

  const handleMimoConfirm = (levels: PracticeLevel[]) => {
    if (!mimoDataset) return;
    const draft = buildHomeworkFromMimo(mimoDataset, levels);
    setMimoDataset(null);
    if (draft.questions.length === 0) {
      setImportError('Không có câu hỏi nào thuộc dạng hệ thống hỗ trợ trong các mức đã chọn.');
      return;
    }
    openImportedDraft(
      { ...draft, answerSource: 'teacher', aiSolverEnabled: false },
      draft.skippedIds.length > 0
        ? `Đã bỏ qua ${draft.skippedIds.length} câu thuộc dạng chưa hỗ trợ: ${draft.skippedIds.join(', ')}.`
        : undefined
    );
  };

  const handleExtracted = (
    data: ExtractedHomework,
    solveWithAI: boolean,
    sources: SourceFile[],
    crops: Record<string, FigureCropInfo>
  ) => {
    // Open extracted homework in the editor for teacher verification before saving
    clearSourceFiles();
    setSourceFiles(sources);
    setFigureCrops(crops);
    setShowSource(true);
    openImportedDraft({
      title: data.title || 'Đề Toán trích xuất từ AI',
      description: data.description || '',
      grade: normalizeGrade(data.grade),
      answerSource: solveWithAI ? 'ai' : 'teacher',
      aiSolverEnabled: solveWithAI,
      questions: data.questions || [],
      missingQuestionsWarning: incompletenessMessage(data.completeness),
    }, undefined, format !== 'game');
  };

  const modals = (
    <>
      <ConfirmDialog
        open={deletingHw !== null}
        danger
        busy={deletingBusy}
        title="Xóa bản nháp?"
        message={
          <>
            Bản nháp <b className="text-[#172B4D]">{deletingHw?.title}</b> sẽ bị xóa và không khôi phục được.
          </>
        }
        confirmLabel="Xóa bản nháp"
        onCancel={() => setDeletingHw(null)}
        onConfirm={async () => {
          if (!deletingHw) return;
          setDeletingBusy(true);
          try {
            await deleteDraftHomework(deletingHw.id);
            if (mediaStoreEnabled) void releaseImages(storedImageIds(deletingHw.questions));
            clearLocalDraft(owner, deletingHw.id);
            setDraftsVersion((v) => v + 1);
            setDeletingHw(null);
          } finally {
            setDeletingBusy(false);
          }
        }}
      />

      {mimoDataset && (
        <MimoImportModal
          dataset={mimoDataset}
          onCancel={() => setMimoDataset(null)}
          onConfirm={handleMimoConfirm}
        />
      )}

      <AIImportModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onManual={startNewHomework}
        onDataFile={(file) => void openDataFile(file)}
        onExtracted={handleExtracted}
      />
    </>
  );

  if (editorKey && !editorReady) {
    return (
      <div className="studio-skin space-y-6">
        {adminDataLoading || editorKey === NEW_HOMEWORK ? (
          <LoadingState label="Đang mở bài tập…" />
        ) : (
          <EmptyState
            icon={Search}
            tone="gray"
            title="Không tìm thấy bài tập này"
            text="Bài tập có thể đã bị xóa. Hãy chọn lại trong danh sách bài tập đã soạn."
            action={
              <Link to={homeworkPath(activeFormat)} className="studio-btn studio-btn-primary">
                <ArrowLeft className="h-4 w-4" />
                Về danh sách
              </Link>
            }
          />
        )}
      </div>
    );
  }

  const editorMode = editorReady;

  if (editorMode) {
    const totalPoints = Number(
      questions.reduce((s, q) => s + (Number(q.points) || 0), 0).toFixed(2)
    );

    return (
      <FigureCropContext.Provider value={figureCropContext}>
      <div className="studio-skin space-y-6">
        {/* Top Editor Action Bar */}
        <div className="cartoon-card sticky top-16 z-10 flex flex-wrap items-center justify-between gap-4 bg-white/95 p-4 backdrop-blur">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="font-display text-lg font-extrabold text-[#172B4D]">
                {editingRef ? 'Chỉnh sửa bài tập' : 'Soạn bài tập mới'}
              </h1>
              {/* Same homework in either format: switching only changes the URL */}
              <div role="group" aria-label="Hình thức" className="flex rounded-xl border border-[#DCE7F3] bg-[#F6FAFF] p-0.5 text-xs font-extrabold">
                {HOMEWORK_FORMATS.map((f) => (
                  <button
                    key={f}
                    type="button"
                    aria-pressed={f === format}
                    onClick={() => loadedKey && navigate(homeworkPath(f, loadedKey), { replace: true })}
                    className={`rounded-lg px-2.5 py-1 ${f === format ? 'bg-[#2563EB] text-white' : 'text-[#3B4A66] hover:bg-white'}`}
                  >
                    {f === 'word' ? 'Word' : 'Game'}
                  </button>
                ))}
              </div>
            </div>
            <p className="text-xs font-bold" aria-live="polite">
              {saving ? (
                <span className="text-[#5E6C84]">Đang lưu…</span>
              ) : dirty ? (
                localSaveFailed ? (
                  <span className="text-rose-700">Có thay đổi chưa lưu – máy này không giữ tạm được, hãy bấm Lưu Bản Nháp</span>
                ) : (
                  <span className="text-amber-700">Có thay đổi chưa lưu vào hệ thống (đã giữ tạm trên máy này)</span>
                )
              ) : editingRef ? (
                <span className="text-[#1F9D6B]">{savedAt ? `Đã lưu vào hệ thống lúc ${timeLabel(savedAt)}` : 'Đã lưu vào hệ thống'}</span>
              ) : (
                <span className="text-[#5E6C84]">Chưa lưu</span>
              )}
            </p>
            <p className="text-xs text-[#3B4A66]">
              Tổng số câu:{' '}
              <span className="font-mono font-bold">{questions.length}</span> ·
              Tổng điểm:{' '}
              <span className="font-mono font-bold">{totalPoints} điểm</span> ·
              {pendingReviewCount > 0 && (
                <>
                  {' '}
                  <span className="font-bold text-amber-700">
                    {pendingReviewCount} câu cần kiểm tra
                  </span>{' '}
                  ·
                </>
              )}
              Nguồn đáp án:{' '}
              <span className="font-bold">
                {answerSource === 'ai' ? 'AI Đề xuất (Giáo viên duyệt)' : 'Giáo viên biên soạn'}
              </span>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {sourceFiles.length > 0 && !showSource && (
              <button
                type="button"
                onClick={() => setShowSource(true)}
                className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-[#172B4D]"
              >
                <FileText className="h-4 w-4" />
                Hiện đề gốc
              </button>
            )}
            <button
              type="button"
              onClick={() => setStudentPreviewMode((p) => !p)}
              className={`cartoon-button flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-extrabold ${
                studentPreviewMode
                  ? 'bg-purple-600 text-white'
                  : 'bg-white text-[#172B4D]'
              }`}
            >
              <Eye className="h-4 w-4" />
              {studentPreviewMode
                ? 'Thoát Xem Trước Học Sinh'
                : 'Xem Trước Giao Diện Học Sinh'}
            </button>

            {format === 'word' && (
              <button
                type="button"
                onClick={() => setWordExportOpen(true)}
                disabled={!questions.length}
                title={questions.length ? 'Tải đề về máy dạng tệp Word (.docx)' : 'Đề chưa có câu hỏi'}
                className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-[#172B4D] disabled:opacity-50"
              >
                <Download className="h-4 w-4" />
                Tải Word (.docx)
              </button>
            )}

            <button
              type="button"
              onClick={() => handleSave('draft')}
              disabled={saving}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-[#172B4D]"
            >
              <Save className="h-4 w-4" />
              Lưu Bản Nháp
            </button>

            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={saving}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-[#2563EB] px-4 py-2 text-xs font-extrabold text-white"
            >
              Xuất Bản Đề
            </button>

            <button
              type="button"
              onClick={closeEditor}
              className="cartoon-button rounded-xl bg-[#F6FAFF] px-3 py-2 text-xs font-bold text-[#3B4A66]"
            >
              Đóng
            </button>
          </div>
        </div>

        {errorMsg && (
          <div role="alert" className="cartoon-card bg-rose-50 p-4 text-xs font-bold text-rose-700">
            {errorMsg}
          </div>
        )}

        {restoredAt && (
          <div role="status" className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
            <History className="h-5 w-5 shrink-0 text-amber-600" />
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">Đã mở lại phần đang soạn dở lúc {timeLabel(restoredAt)}</div>
              <div className="text-xs">Phần này chưa được lưu vào hệ thống. Bấm Lưu Bản Nháp để lưu, hoặc bỏ để quay về bản đã lưu.</div>
            </div>
            <button type="button" onClick={discardLocalChanges} className="studio-btn studio-btn-secondary">
              {editingRef ? 'Bỏ thay đổi chưa lưu' : 'Bỏ bản này, soạn mới'}
            </button>
          </div>
        )}

        {format === 'game' ? (
          <GameReadinessBar questions={questions} />
        ) : (
          <div className="flex flex-wrap items-center gap-2 rounded-2xl border border-[#DCE7F3] bg-[#F6FAFF] px-4 py-2.5 text-xs text-[#3B4A66]">
            <FileText className="h-4 w-4 text-[#2563EB]" />
            <span>
              <b>Phiếu bài tập Word.</b> Lưu nháp, xuất bản rồi giao về nhà ở mục{' '}
              <Link to="/admin/assignments" className="font-bold text-[#2563EB] hover:underline">Giao bài tập</Link>.
            </span>
            <span className="text-[#5E6C84]">Bấm <b>Tải Word (.docx)</b> để in đề, đề kèm đáp án hoặc file đáp án riêng.</span>
          </div>
        )}

        {figureRedrawProgress && (
          <div role="status" className="flex items-center gap-2 rounded-2xl border border-[#DCE7F3] bg-[#F6FAFF] px-4 py-2.5 text-xs font-bold text-[#2563EB]" data-testid="auto-redraw-progress">
            <Loader2 className="h-4 w-4 animate-spin" />
            AI đang tự vẽ lại hình minh họa ({figureRedrawProgress.done}/{figureRedrawProgress.total})… Thầy cô vẫn soạn tiếp được.
          </div>
        )}

        {missingQuestionsWarning && (
          <div role="alert" className="flex flex-wrap items-start gap-3 rounded-2xl border-2 border-rose-400 bg-rose-50 p-4 text-sm text-rose-800">
            <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-rose-600" />
            <div className="min-w-0 flex-1">
              <div className="font-extrabold">Đề có thể chưa đủ câu</div>
              <div className="mt-0.5">{missingQuestionsWarning}</div>
            </div>
            <button
              type="button"
              onClick={() => {
                setMissingQuestionsWarning(null);
                setErrorMsg(null);
              }}
              className="shrink-0 rounded-xl border border-rose-400 bg-white px-3 py-1.5 text-xs font-extrabold text-rose-700 hover:bg-rose-100"
            >
              Đã đối chiếu đủ câu
            </button>
          </div>
        )}

        {/* Student Preview Mode */}
        {studentPreviewMode ? (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="cartoon-card bg-sky-50 p-5">
              <div className="text-xs font-extrabold text-[#2563EB]">
                CHẾ ĐỘ XEM TRƯỚC GIAO DIỆN HỌC SINH (ĐÃ ẨN ĐÁP ÁN CHUẨN)
              </div>
              <h2 className="mt-1 font-display text-xl font-extrabold text-[#172B4D]">
                {title || 'Chưa đặt tiêu đề'}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-[#3B4A66]">{description}</p>
              )}
            </div>

            {questions.map((q, idx) => (
              <div key={q.id} className="cartoon-card p-5">
                <div className="mb-3 flex items-center justify-between border-b border-[#EEF3F9] pb-2">
                  <span className="font-display text-sm font-extrabold text-[#2563EB]">
                    Câu {idx + 1} ({q.points} điểm)
                  </span>
                  <span className="text-xs text-[#5E6C84]">
                    {QUESTION_TYPE_LABELS[q.type]}
                  </span>
                </div>
                <RichContentRenderer content={q.prompt} />

                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  <div className="mt-4 space-y-2">
                    {(q.options || []).map((opt) => (
                      <div
                        key={opt.id}
                        className="flex items-center gap-3 rounded-xl border border-[#DCE7F3] bg-[#F6FAFF] px-3.5 py-2.5"
                      >
                        <input
                          type={
                            q.type === 'single_choice' ? 'radio' : 'checkbox'
                          }
                          disabled
                          className="h-4 w-4"
                        />
                        <span className="font-display text-sm font-bold text-[#172B4D]">
                          {opt.label}.
                        </span>
                        <RichContentRenderer content={opt.content} />
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'true_false_multi' && (
                  <div className="mt-4 space-y-2">
                    {(q.statements || []).map((st) => (
                      <div
                        key={st.id}
                        className="flex items-center justify-between gap-4 rounded-xl border border-[#DCE7F3] bg-[#F6FAFF] px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-[#172B4D]">
                            {st.label})
                          </span>
                          <RichContentRenderer content={st.statement} />
                        </div>
                        <div className="flex items-center gap-3 text-xs font-bold">
                          <span>[ ] Đúng</span>
                          <span>[ ] Sai</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {q.type === 'short_answer' && (
                  <div className="mt-4">
                    <input
                      type="text"
                      disabled
                      placeholder="Học sinh nhập đáp số ngắn tại đây..."
                      className="w-full rounded-xl border border-[#DCE7F3] bg-[#F6FAFF] px-3.5 py-2 text-sm"
                    />
                  </div>
                )}

                {q.type === 'essay' && (
                  <div className="mt-4 rounded-xl border-2 border-dashed border-[#DCE7F3] bg-[#F6FAFF] p-4 text-xs text-[#5E6C84]">
                    Khu vực học sinh trình bày lời giải tự luận (Rich-text, công
                    thức LaTeX, vẽ hình học hoặc tải ảnh bài làm).
                  </div>
                )}
              </div>
            ))}
          </div>
        ) : (
          /* Teacher Authoring Mode */
          <div
            className={
              sourceFiles.length > 0 && showSource
                ? 'grid grid-cols-1 items-start gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]'
                : ''
            }
          >
          {sourceFiles.length > 0 && showSource && (
            <SourceDocumentPanel
              files={sourceFiles}
              onHide={() => setShowSource(false)}
            />
          )}
          <div className="min-w-0 space-y-6">
            {/* Metadata Card */}
            <div className="cartoon-card p-6">
              <div className="grid grid-cols-1 gap-4 md:grid-cols-12">
                <div className="md:col-span-6">
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Tiêu đề BTVN *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ví dụ: Phiếu BTVN Tuần 8: Phân Số & Diện Tích Tam Giác"
                    className="w-full rounded-xl border border-[#DCE7F3] px-3.5 py-2 text-sm font-bold"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                    Khối lớp / Mức độ
                  </label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                  >
                    {[
                      'Khối 1',
                      'Khối 2',
                      'Khối 3',
                      'Khối 4',
                      'Khối 5',
                      'Khối 6',
                      'Khối 7',
                      'Khối 8',
                      'Khối 9',
                    ].map((g) => (
                      <option key={g} value={g}>
                        {g}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="flex items-end md:col-span-3">
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border border-[#DCE7F3] bg-amber-50 px-3 py-2 text-xs font-bold text-[#172B4D] w-full">
                    <input
                      type="checkbox"
                      checked={aiSolverEnabled}
                      onChange={(e) => setAiSolverEnabled(e.target.checked)}
                      className="h-4 w-4"
                    />
                    Cho phép AI hỗ trợ giải & chấm
                  </label>
                </div>
              </div>

              <div className="mt-4">
                <label className="mb-1 block text-xs font-bold text-[#3B4A66]">
                  Mô tả / Hướng dẫn làm bài chung
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Lời dặn dò cho học sinh trước khi làm bài..."
                  className="w-full rounded-xl border border-[#DCE7F3] px-3.5 py-2 text-sm"
                />
              </div>
            </div>

            {/* Question List */}
            {questions.map((q, qIdx) => (
              <div
                key={q.id}
                className={`cartoon-card p-6 ${q.aiReviewNote ? 'ring-4 ring-amber-300' : ''}`}
              >
                {q.aiReviewNote && (
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-3 rounded-xl border-2 border-amber-400 bg-amber-50 px-3.5 py-2.5">
                    <div className="flex items-start gap-2 text-xs text-amber-900">
                      <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                      <div>
                        <div className="font-extrabold">Cần kiểm tra</div>
                        <div>{q.aiReviewNote}</div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => markQuestionReviewed(qIdx)}
                      className="flex items-center gap-1 rounded-lg border-2 border-amber-500 bg-white px-2.5 py-1 text-xs font-extrabold text-amber-800 hover:bg-amber-100"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5" />
                      Đã kiểm tra
                    </button>
                  </div>
                )}
                {lastTypeChange?.questionId === q.id && (
                  <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-[#BFDBFE] bg-[#EFF6FF] px-3 py-2 text-xs text-[#1E3A8A]">
                    <span className="flex-1">
                      Đã đổi từ <b>{QUESTION_TYPE_LABELS[lastTypeChange.before.type]}</b>.
                      {lastTypeChange.notes.length > 0 && <> {lastTypeChange.notes.join(' ')}</>}
                    </span>
                    <button type="button" onClick={undoTypeChange} className="studio-btn studio-btn-secondary px-3 py-1 text-xs">
                      Hoàn tác đổi dạng
                    </button>
                  </div>
                )}
                {/* Question Header */}
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-[#EEF3F9] pb-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-xl border border-[#DCE7F3] bg-amber-300 px-3 py-1 font-display text-sm font-extrabold text-[#172B4D]">
                      Câu {qIdx + 1}
                    </span>

                    {(q.level || q.skillId) && (
                      <span
                        className="rounded-lg bg-indigo-50 px-2 py-1 text-[11px] font-bold text-indigo-800"
                        title={[q.topicName, q.skillId, q.sourceId].filter(Boolean).join(' · ')}
                      >
                        {[q.level && PRACTICE_LEVEL_LABELS[q.level], q.skillId].filter(Boolean).join(' · ')}
                      </span>
                    )}

                    <select
                      aria-label={`Dạng câu ${qIdx + 1}`}
                      value={q.type}
                      onChange={(e) => requestTypeChange(qIdx, e.target.value as QuestionType)}
                      className="rounded-xl border border-[#DCE7F3] bg-white px-3 py-1.5 text-xs font-bold text-[#172B4D]"
                    >
                      {(
                        Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]
                      ).map((t) => (
                        <option key={t} value={t}>
                          {QUESTION_TYPE_LABELS[t]}
                        </option>
                      ))}
                    </select>

                    <div className="flex items-center gap-1.5">
                      <span className="text-xs font-bold text-[#3B4A66]">
                        Điểm:
                      </span>
                      <input
                        type="number"
                        step="0.25"
                        min="0.25"
                        value={q.points}
                        onChange={(e) =>
                          updateQuestionAt(qIdx, {
                            ...q,
                            points: Number(e.target.value) || 1,
                          })
                        }
                        className="w-20 rounded-xl border border-[#DCE7F3] px-2.5 py-1 font-mono text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveQuestion(qIdx, -1)}
                      disabled={qIdx === 0}
                      className="rounded-lg border border-[#DCE7F3] p-1.5 hover:bg-[#F6FAFF] disabled:opacity-40"
                      title="Chuyển lên"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(qIdx, 1)}
                      disabled={qIdx === questions.length - 1}
                      className="rounded-lg border border-[#DCE7F3] p-1.5 hover:bg-[#F6FAFF] disabled:opacity-40"
                      title="Chuyển xuống"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateQuestionAt(qIdx)}
                      className="rounded-lg border border-[#DCE7F3] px-2.5 py-1 text-xs font-bold text-[#3B4A66] hover:bg-[#F6FAFF]"
                    >
                      <Copy className="mr-1 inline h-3.5 w-3.5" />
                      Nhân bản
                    </button>
                    {questions.length > 1 && (
                      <button
                        type="button"
                        onClick={() => removeQuestionAt(qIdx)}
                        className="rounded-lg border border-rose-200 bg-rose-50 p-1.5 text-rose-600 hover:bg-rose-100"
                        title="Xóa câu hỏi"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Rich Prompt Editor */}
                <MathRichEditor
                  label="Nội dung đề bài Câu hỏi:"
                  value={q.prompt}
                  onChange={(nextPrompt) =>
                    updateQuestionAt(qIdx, { ...q, prompt: nextPrompt })
                  }
                />

                {/* Answer Key Section separated cleanly for Teacher */}
                <div className="mt-4 rounded-2xl border border-[#DCE7F3] bg-emerald-50/60 p-4">
                  <div className="mb-2 text-xs font-extrabold text-emerald-950">
                    CẤU HÌNH ĐÁP ÁN CHUẨN (CHỈ GIÁO VIÊN & MÁY CHỦ CHẤM ĐIỂM ĐƯỢC XEM)
                  </div>

                  {/* Type 1 & 2: Single / Multiple Choice */}
                  {(q.type === 'single_choice' ||
                    q.type === 'multiple_choice') && (
                    <div className="space-y-2.5">
                      {(q.options || []).map((opt, oIdx) => {
                        const isChecked =
                          q.type === 'single_choice'
                            ? q.correctOptionId === opt.id
                            : (q.correctOptionIds || []).includes(opt.id);

                        return (
                          <div
                            key={opt.id}
                            className="flex flex-col gap-2 rounded-xl border border-[#DCE7F3] bg-white p-3 sm:flex-row sm:items-center"
                          >
                            <label className="flex shrink-0 cursor-pointer items-center gap-2 font-display text-sm font-extrabold text-[#172B4D]">
                              <input
                                type={
                                  q.type === 'single_choice'
                                    ? 'radio'
                                    : 'checkbox'
                                }
                                name={`correct_${q.id}`}
                                checked={isChecked}
                                onChange={() => {
                                  if (q.type === 'single_choice') {
                                    updateQuestionAt(qIdx, {
                                      ...q,
                                      correctOptionId: opt.id,
                                    });
                                  } else {
                                    const current = q.correctOptionIds || [];
                                    const nextIds = current.includes(opt.id)
                                      ? current.filter((id) => id !== opt.id)
                                      : [...current, opt.id];
                                    updateQuestionAt(qIdx, {
                                      ...q,
                                      correctOptionIds: nextIds,
                                    });
                                  }
                                }}
                                className="h-4 w-4"
                              />
                              <span>Đáp án {opt.label}</span>
                            </label>

                            <ContentField
                              value={opt.content}
                              onChange={(content) => {
                                const nextOpts = [...(q.options || [])];
                                nextOpts[oIdx] = { ...opt, content };
                                updateQuestionAt(qIdx, {
                                  ...q,
                                  options: nextOpts,
                                });
                              }}
                              placeholder={`Nội dung phương án ${opt.label} (hỗ trợ $LaTeX$)`}
                            />
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {/* Type 3: True / False Multi */}
                  {q.type === 'true_false_multi' && (
                    <div className="space-y-2.5">
                      {(q.statements || []).map((st, sIdx) => (
                        <div
                          key={st.id}
                          className="flex flex-col gap-2 rounded-xl border border-[#DCE7F3] bg-white p-3 sm:flex-row sm:items-center"
                        >
                          <span className="font-display text-sm font-extrabold text-[#172B4D]">
                            Ý {st.label})
                          </span>
                          <ContentField
                            value={st.statement}
                            onChange={(statement) => {
                              const nextSt = [...(q.statements || [])];
                              nextSt[sIdx] = { ...st, statement };
                              updateQuestionAt(qIdx, {
                                ...q,
                                statements: nextSt,
                              });
                            }}
                            placeholder="Nhập mệnh đề Toán học..."
                          />
                          <div className="flex items-center gap-3">
                            <select
                              value={st.isTrue === undefined ? '' : st.isTrue ? 'true' : 'false'}
                              onChange={(e) => {
                                const nextSt = [...(q.statements || [])];
                                nextSt[sIdx] = {
                                  ...st,
                                  isTrue: e.target.value === 'true',
                                };
                                updateQuestionAt(qIdx, {
                                  ...q,
                                  statements: nextSt,
                                });
                              }}
                              className="rounded-lg border border-[#DCE7F3] bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-[#172B4D]"
                            >
                              {st.isTrue === undefined && <option value="" disabled>Chọn…</option>}
                              <option value="true">ĐÚNG</option>
                              <option value="false">SAI</option>
                            </select>

                            <div className="flex items-center gap-1 text-xs">
                              <span>Điểm ý:</span>
                              <input
                                type="number"
                                step="0.25"
                                value={st.points}
                                onChange={(e) => {
                                  const nextSt = [...(q.statements || [])];
                                  nextSt[sIdx] = {
                                    ...st,
                                    points: Number(e.target.value) || 0.5,
                                  };
                                  updateQuestionAt(qIdx, {
                                    ...q,
                                    statements: nextSt,
                                  });
                                }}
                                className="w-16 rounded-lg border border-[#DCE7F3] px-2 py-1 font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Type 4: Short Answer */}
                  {q.type === 'short_answer' && (
                    <div>
                      <label className="mb-1 block text-xs font-semibold text-[#3B4A66]">
                        Các đáp án tương đương được chấp nhận (phân cách bằng dấu
                        phẩy `;`, hệ thống tự chuẩn hóa khoảng trắng & dấu thập
                        phân):
                      </label>
                      <input
                        type="text"
                        value={(q.acceptableAnswers || []).join('; ')}
                        onChange={(e) =>
                          updateQuestionAt(qIdx, {
                            ...q,
                            acceptableAnswers: e.target.value
                              .split(';')
                              .map((s) => s.trim())
                              .filter(Boolean),
                          })
                        }
                        placeholder="Ví dụ: 41; 41m; 41 m; 41,0"
                        className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3.5 py-2 font-mono text-sm"
                      />
                      <p className="mt-1 text-[11px] text-[#5E6C84]">
                        Tự chấp nhận: 1000 = 1 000 = 1.000 · 3/4 = 3 / 4 · 42cm = 42 cm. Đơn vị khác nhau luôn bị chấm sai.
                      </p>
                      <div className="mt-2 flex flex-col gap-1.5 text-xs text-[#3B4A66] sm:flex-row sm:gap-5">
                        {(
                          [
                            ['unitMode', 'Cho phép bỏ đơn vị (đề đã ghi sẵn đơn vị)'],
                            ['acceptEquivalentFractions', 'Chấp nhận phân số bằng nhau (6/8 = 3/4)'],
                          ] as const
                        ).map(([field, label]) => {
                          const checked = field === 'unitMode' ? q.unitMode === 'optional' : Boolean(q.acceptEquivalentFractions);
                          return (
                            <label key={field} className="flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={(e) => {
                                  // Firestore rejects undefined, so an option that is off is removed
                                  const next = { ...q };
                                  delete next[field];
                                  if (e.target.checked) Object.assign(next, field === 'unitMode' ? { unitMode: 'optional' } : { acceptEquivalentFractions: true });
                                  updateQuestionAt(qIdx, next);
                                }}
                                className="h-4 w-4 rounded border-[#DCE7F3]"
                              />
                              {label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  {/* Type 5: Essay */}
                  {q.type === 'essay' && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-[#3B4A66]">
                          Hướng dẫn chấm / Biểu điểm thành phần (Rubric cho Giáo
                          viên & AI):
                        </label>
                        <textarea
                          rows={2}
                          value={q.rubric || ''}
                          onChange={(e) =>
                            updateQuestionAt(qIdx, {
                              ...q,
                              rubric: e.target.value,
                            })
                          }
                          placeholder="Ví dụ: Tìm được số phần bể chảy trong 1 giờ (1 điểm); Tính đúng thời gian vòi 2 chảy riêng (1 điểm)..."
                          className="w-full rounded-xl border border-[#DCE7F3] bg-white px-3 py-2 text-sm"
                        />
                      </div>
                      <MathRichEditor
                        compact
                        label="Lời giải mẫu / Đáp án tham khảo:"
                        value={
                          q.sampleSolution || createRichTextFromPlain('')
                        }
                        onChange={(nextSol) =>
                          updateQuestionAt(qIdx, {
                            ...q,
                            sampleSolution: nextSol,
                          })
                        }
                      />
                    </div>
                  )}

                  {/* Explanation for auto-graded questions, released with solutions */}
                  {q.type !== 'essay' && (
                    <div className="mt-3">
                      <MathRichEditor
                        compact
                        label="Lời giải (học sinh xem sau khi chấm):"
                        placeholder="Không bắt buộc – giải thích vì sao chọn đáp án này"
                        value={q.sampleSolution || createRichTextFromPlain('')}
                        onChange={(nextSol) =>
                          updateQuestionAt(qIdx, { ...q, sampleSolution: nextSol })
                        }
                      />
                    </div>
                  )}
                </div>
              </div>
            ))}

            {/* Add Question Bar */}
            <div className="cartoon-card bg-white p-4">
              <div className="mb-2 text-xs font-extrabold text-[#3B4A66]">
                + THÊM CÂU HỎI MỚI VÀO ĐỀ (ĐỦ 5 LOẠI CÂU HỎI BẮT BUỘC):
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addQuestion(t)}
                      className="cartoon-button flex items-center gap-1.5 rounded-xl bg-amber-100 px-3.5 py-2 text-xs font-extrabold text-[#172B4D]"
                    >
                      <Plus className="h-3.5 w-3.5" />
                      {QUESTION_TYPE_LABELS[t]}
                    </button>
                  )
                )}
              </div>
            </div>
          </div>
          </div>
        )}
      </div>
      <ConfirmDialog
        open={pendingTypeChange !== null}
        danger={Boolean(pendingTypeChange?.change.losses.length)}
        title={pendingTypeChange ? `Đổi Câu ${pendingTypeChange.idx + 1} sang “${QUESTION_TYPE_LABELS[pendingTypeChange.change.question.type].replace(/^\d+\. /, '')}”?` : ''}
        message={
          pendingTypeChange && (
            <div className="space-y-2 text-left">
              <p>Đề bài, công thức, hình ảnh, điểm và lời giải được giữ nguyên.</p>
              {pendingTypeChange.change.losses.length > 0 && (
                <div>
                  <b className="text-[#9F2B47]">Dạng mới không giữ được:</b>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {pendingTypeChange.change.losses.map((l) => <li key={l}>{l}</li>)}
                  </ul>
                </div>
              )}
              {pendingTypeChange.change.notes.length > 0 && (
                <div>
                  <b>Sau khi đổi:</b>
                  <ul className="mt-1 list-disc space-y-0.5 pl-5">
                    {pendingTypeChange.change.notes.map((n) => <li key={n}>{n}</li>)}
                  </ul>
                </div>
              )}
              <p className="text-xs">Có thể bấm “Hoàn tác đổi dạng” ngay sau khi đổi.</p>
            </div>
          )
        }
        confirmLabel="Đổi dạng"
        onCancel={() => setPendingTypeChange(null)}
        onConfirm={() => pendingTypeChange && applyTypeChange(pendingTypeChange.idx, pendingTypeChange.change)}
      />
      {wordExportOpen && (
        <Suspense fallback={null}>
          <WordExportModal
            open
            onClose={() => setWordExportOpen(false)}
            homework={{ title: title.trim() || 'Bài tập', description, grade, questions }}
            unsaved={dirty}
            autoRedrawing={Boolean(figureRedrawProgress)}
          />
        </Suspense>
      )}
      {recropRequest && (() => {
        const info = figureCrops[recropRequest.url];
        const page = info && sourceFiles.find((f) => f.id === info.sourceId);
        return page ? (
          <FigureRecropModal
            pageUrl={page.objectUrl}
            initialBox={info.box}
            onConfirm={(box) => void finishRecrop(box)}
            onCancel={() => void finishRecrop(null)}
          />
        ) : null;
      })()}
      <ConfirmDialog
        open={leaveTo !== null}
        title="Rời trang khi chưa lưu?"
        message={
          localSaveFailed ? (
            <>Các thay đổi <b className="text-[#9F2B47]">chưa được lưu</b> và máy này cũng không giữ tạm được. Nếu rời trang, các thay đổi sẽ mất.</>
          ) : (
            <>Các thay đổi <b className="text-[#172B4D]">chưa được lưu vào hệ thống</b>, nên trên máy khác hoặc tài khoản khác sẽ không thấy. Máy này vẫn giữ tạm để mở lại. Hãy bấm Ở lại rồi Lưu Bản Nháp nếu muốn lưu.</>
          )
        }
        danger={localSaveFailed}
        confirmLabel="Vẫn rời trang"
        cancelLabel="Ở lại"
        onCancel={() => setLeaveTo(null)}
        onConfirm={leaveEditor}
      />
      </FigureCropContext.Provider>
    );
  }

  const hwCounts = {
    all: homeworkList.length,
    draft: homeworkList.filter((h) => h.status === 'draft').length,
    published: homeworkList.filter((h) => h.status === 'published').length,
  };
  const shownHomework = homeworkList.filter((hw) => {
    if (hwStatus !== 'all' && hw.status !== hwStatus) return false;
    const q = hwSearch.trim().toLowerCase();
    return !q || hw.title.toLowerCase().includes(q) || (hw.description || '').toLowerCase().includes(q) || (hw.grade || '').toLowerCase().includes(q);
  });
  const unsavedNew = localDraftKeys.has(NEW_HOMEWORK) ? readLocalDraft(owner, NEW_HOMEWORK) : null;

  const homeworkSection = (openIn: HomeworkFormat) => (
    <>
      <SectionHeading icon={FileText} title="Bài tập đã soạn" note={`${hwCounts.all} bài · ${hwCounts.published} đã xuất bản · ${hwCounts.draft} bản nháp`} />

      {unsavedNew && (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border-2 border-dashed border-amber-400 bg-amber-50 p-4 text-sm text-amber-900">
          <History className="h-5 w-5 shrink-0 text-amber-600" />
          <div className="min-w-0 flex-1">
            <div className="font-extrabold">Bài đang soạn dở, chưa lưu vào hệ thống</div>
            <div className="text-xs">
              {unsavedNew.title || 'Chưa đặt tiêu đề'} · {unsavedNew.questions.length} câu · giữ tạm trên máy này lúc {timeLabel(unsavedNew.savedAt)}
            </div>
          </div>
          <button type="button" onClick={() => navigate(homeworkPath(openIn, NEW_HOMEWORK))} className="studio-btn studio-btn-primary">
            Tiếp tục soạn
          </button>
          <button
            type="button"
            onClick={() => {
              clearLocalDraft(owner, NEW_HOMEWORK);
              setDraftsVersion((v) => v + 1);
            }}
            className="studio-btn studio-btn-secondary"
          >
            Bỏ bản này
          </button>
        </div>
      )}

      {homeworkList.length > 0 && (
        <Toolbar>
          <SearchInput value={hwSearch} onChange={setHwSearch} placeholder="Tìm theo tên bài, mô tả hoặc khối…" />
          <SegmentedFilter
            label="Trạng thái bài tập"
            value={hwStatus}
            onChange={setHwStatus}
            options={[
              { id: 'all', label: 'Tất cả', count: hwCounts.all },
              { id: 'published', label: 'Đã xuất bản', count: hwCounts.published },
              { id: 'draft', label: 'Bản nháp', count: hwCounts.draft },
            ]}
          />
        </Toolbar>
      )}

      {adminDataLoading && homeworkList.length === 0 ? (
        <LoadingState label="Đang tải bài tập đã soạn…" />
      ) : homeworkList.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Chưa có bài tập nào"
          text="Bài soạn xong có thể lưu nháp để sửa tiếp, hoặc xuất bản để giao cho lớp."
        />
      ) : shownHomework.length === 0 ? (
        <EmptyState icon={Search} tone="gray" title="Không có bài tập phù hợp" text="Thử từ khóa hoặc trạng thái khác." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shownHomework.map((hw) => {
            const published = hw.status === 'published';
            const game = openIn === 'game' ? gameReadiness(hw.questions) : null;
            return (
              <article key={hw.id} className="studio-card flex flex-col p-5 transition hover:shadow-[var(--studio-shadow-hover)]">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusBadge kind={published ? 'success' : hw.status === 'draft' ? 'warning' : 'neutral'}>
                    {published ? 'Đã xuất bản' : hw.status === 'draft' ? 'Bản nháp' : 'Lưu trữ'}
                  </StatusBadge>
                  <StatusBadge kind="info">{hw.grade || 'Toán'}</StatusBadge>
                  {hw.answerSource === 'ai' && (
                    <StatusBadge kind="neutral" icon={Sparkles}>
                      Đáp án AI
                    </StatusBadge>
                  )}
                  {localDraftKeys.has(hw.id) && (
                    <StatusBadge kind="danger" icon={History}>
                      Có thay đổi chưa lưu
                    </StatusBadge>
                  )}
                </div>
                <h3 className="mt-3 font-display text-lg leading-snug font-extrabold text-[#172B4D]">{hw.title}</h3>
                {hw.description && <p className="mt-1 line-clamp-2 text-sm text-[#5E6C84]">{hw.description}</p>}
                <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-[#5E6C84]">
                  <span>
                    <b className="text-[#172B4D]">{hw.questions.length}</b> câu hỏi
                  </span>
                  <span>
                    <b className="text-[#172B4D]">{hw.totalPoints}</b> điểm
                  </span>
                  {game && (
                    <span>
                      <b className="text-[#172B4D]">{game.playable}/{hw.questions.length}</b> câu chơi được
                    </span>
                  )}
                  <span>Cập nhật {hw.updatedAt.slice(0, 10).split('-').reverse().join('/')}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EEF3F9] pt-4">
                  <button type="button" onClick={() => openHomework(hw, openIn)} className="studio-btn studio-btn-primary flex-1">
                    <Edit3 className="h-4 w-4" />
                    Mở / chỉnh sửa
                  </button>
                  <button type="button" onClick={() => duplicateHomework(hw)} className="studio-btn studio-btn-secondary px-3" title="Nhân bản bài tập">
                    <Copy className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Nhân bản</span>
                  </button>
                  {openIn === 'game' && bellQuestionsOf(hw.questions).usable.length > 0 && (
                    <Link to={`/admin/homework/game/rung-chuong-vang?homework=${hw.id}`} className="studio-btn studio-btn-secondary px-3" title="Chơi Rung chuông vàng với đề này">
                      <Bell className="h-4 w-4" />
                      <span className="sr-only sm:not-sr-only">Rung chuông vàng</span>
                    </Link>
                  )}
                  {hw.status === 'draft' && (
                    <button type="button" onClick={() => setDeletingHw(hw)} className="studio-btn studio-btn-danger px-3" title="Xóa bản nháp">
                      <Trash2 className="h-4 w-4" />
                      <span className="sr-only">Xóa nháp</span>
                    </button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );

  // Step 1: choose Word or Game
  if (!format) {
    return (
      <div className="studio-skin space-y-6">
        <PageHeader
          icon={BookOpen}
          title="Soạn bài tập"
          description="Chọn hình thức trước khi soạn. Word và Game dùng chung một bộ câu hỏi: một đề soạn xong mở được ở cả hai hình thức."
        />

        <section aria-label="Chọn hình thức bài tập" className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {HOMEWORK_FORMATS.map((f) => {
            const look = FORMAT_LOOK[f];
            const Icon = look.icon;
            return (
              <Link
                key={f}
                to={homeworkPath(f)}
                className={`group relative flex min-h-[220px] flex-col overflow-hidden rounded-[28px] bg-gradient-to-br ${look.gradient} p-6 text-white shadow-[0_18px_40px_-18px_rgba(30,58,138,0.55)] transition hover:-translate-y-1 focus-visible:ring-4 focus-visible:ring-[#54C8FF]/50 focus-visible:outline-none sm:p-7`}
              >
                <span className="pointer-events-none absolute -top-12 -right-10 h-40 w-40 rounded-full bg-white/15" aria-hidden="true" />
                <span className="pointer-events-none absolute -bottom-14 right-16 h-28 w-28 rounded-full bg-[#FFD34E]/35 blur-lg" aria-hidden="true" />
                <span className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-white/20 ring-1 ring-white/40">
                  <Icon className="h-7 w-7" />
                </span>
                <span className="relative mt-4 font-display text-xl font-extrabold tracking-wide sm:text-2xl">
                  {HOMEWORK_FORMAT_LABELS[f].toUpperCase()}
                </span>
                <span className="relative mt-1.5 max-w-md text-sm leading-relaxed text-white/90">{look.description}</span>
                <span className="relative mt-auto inline-flex items-center gap-1.5 pt-5 text-sm font-extrabold text-[#FFE08A] transition group-hover:gap-2.5">
                  Chọn {f === 'word' ? 'Word' : 'Game'} <ArrowRight className="h-4 w-4" />
                </span>
              </Link>
            );
          })}
        </section>

        {importError && <ErrorState message={importError} />}
        {homeworkSection('word')}
        {modals}
      </div>
    );
  }

  // Step 2: from a file or by hand, inside the chosen format
  const look = FORMAT_LOOK[format];
  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={look.icon}
        eyebrow={
          <Link to={homeworkPath()} className="inline-flex items-center gap-1 hover:underline">
            <ArrowLeft className="h-3.5 w-3.5" />
            Soạn bài tập
          </Link>
        }
        title={HOMEWORK_FORMAT_LABELS[format]}
        description={look.description}
        actions={
          <Link to={homeworkPath(otherFormat(format))} className="studio-btn studio-btn-secondary">
            Chuyển sang {format === 'word' ? 'Game' : 'Word'}
          </Link>
        }
      />

      {format === 'game' && (
        <section aria-label="Trò chơi" className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <Link
            to="/admin/homework/game/rung-chuong-vang"
            data-testid="bell-game-card"
            className="studio-card group flex h-full flex-col bg-gradient-to-br from-[#FFF4C2] to-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--studio-shadow-hover)] focus-visible:ring-4 focus-visible:ring-[#FFD34E]/40 focus-visible:outline-none"
          >
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#FFD34E] text-[#5A3A00]">
              <Bell className="h-6 w-6" />
            </span>
            <span className="mt-4 block font-display text-base font-extrabold text-[#172B4D]">🔔 Rung chuông vàng</span>
            <span className="mt-1 block text-sm leading-relaxed text-[#5E6C84]">
              Cả lớp cùng trả lời từ bộ đề đã lưu: Online trên điện thoại (mã phòng, QR) hoặc Offline với bảng con. Có cứu trợ, theo dõi từng học sinh và lưu kết quả.
            </span>
            <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-[#2563EB] transition group-hover:gap-2">
              Tạo phòng chơi <ArrowRight className="h-4 w-4" />
            </span>
          </Link>
        </section>
      )}

      {format === 'game' && <GameStatus />}

      <section aria-label="Cách soạn bài tập" className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {[
          {
            key: 'file',
            icon: Upload,
            tone: 'yellow' as const,
            title: 'Tạo bài tập từ tệp',
            text: 'Ảnh chụp hoặc PDF đề bài: AI nhận diện thành câu hỏi để thầy cô soát lại. Tệp đề .json có sẵn: mở ngay, không dùng AI.',
            cta: 'Chọn tệp',
            onClick: () => setAiModalOpen(true),
          },
          {
            key: 'manual',
            icon: PenLine,
            tone: 'blue' as const,
            title: 'Soạn bài tập thủ công',
            text: 'Soạn từng câu với công thức Toán, hình vẽ, bảng và 5 dạng câu hỏi.',
            cta: 'Bắt đầu soạn',
            onClick: startNewHomework,
          },
        ].map((t) => {
          const Icon = t.icon;
          const wash = t.tone === 'yellow' ? 'from-[#FFF8E1]' : 'from-[#EFF6FF]';
          return (
            <button
              key={t.key}
              type="button"
              onClick={t.onClick}
              className={`studio-card group flex h-full flex-col bg-gradient-to-br ${wash} to-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--studio-shadow-hover)] focus-visible:ring-4 focus-visible:ring-[#54C8FF]/30 focus-visible:outline-none`}
            >
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${STUDIO_TONE[t.tone]}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="mt-4 block font-display text-base font-extrabold text-[#172B4D]">{t.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-[#5E6C84]">{t.text}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-[#2563EB] transition group-hover:gap-2">
                {t.cta} <ArrowRight className="h-4 w-4" />
              </span>
            </button>
          );
        })}
      </section>

      {importError && <ErrorState message={importError} />}
      {homeworkSection(format)}
      {modals}
    </div>
  );
};

/**
 * An option or statement: a one-line box for plain text, the full editor once it holds
 * formulas, images or several paragraphs, so editing never drops them.
 */
const ContentField: React.FC<{ value: RichTextContent; onChange: (next: RichTextContent) => void; placeholder: string }> = ({
  value,
  onChange,
  placeholder,
}) => {
  const [rich, setRich] = useState(() => !isPlainContent(value));
  if (rich || !isPlainContent(value)) {
    return (
      <div className="min-w-0 flex-1">
        <MathRichEditor compact value={value} onChange={onChange} placeholder={placeholder} />
      </div>
    );
  }
  const block = value.blocks[0];
  return (
    <div className="flex min-w-0 flex-1 items-center gap-1.5">
      <input
        type="text"
        value={block?.type === 'paragraph' ? block.text : ''}
        onChange={(e) =>
          onChange({ ...value, blocks: [{ ...(block?.type === 'paragraph' ? block : { type: 'paragraph' as const, align: 'left' as const }), text: e.target.value }] })
        }
        placeholder={placeholder}
        className="min-w-0 flex-1 rounded-lg border border-[#DCE7F3] px-3 py-1.5 text-sm"
      />
      <button
        type="button"
        onClick={() => setRich(true)}
        title="Mở trình soạn đầy đủ để chèn hình, công thức"
        className="shrink-0 rounded-lg border border-[#DCE7F3] px-2 py-1.5 text-[11px] font-bold text-[#3B4A66] hover:bg-[#F6FAFF]"
      >
        + Hình/công thức
      </button>
    </div>
  );
};

/** In the Game format: how many questions the classroom games can actually play. */
const GameReadinessBar: React.FC<{ questions: HomeworkQuestion[] }> = ({ questions }) => {
  const { playable, notPlayable } = gameReadiness(questions);
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 rounded-2xl border border-[#E9D5FF] bg-[#FAF5FF] px-4 py-2.5 text-xs text-[#4C1D95]">
      <Gamepad2 className="h-4 w-4 text-[#7C3AED]" />
      <span>
        <b>{playable}/{questions.length} câu chơi được</b> trong Mimo Quiz và Đoàn tàu kiến thức (trắc nghiệm, Đúng/Sai có đáp án).
      </span>
      {notPlayable > 0 && (
        <span className="font-bold text-[#9D174D]">
          {notPlayable} câu chưa chơi được: trả lời ngắn, tự luận hoặc chưa chọn đáp án.
        </span>
      )}
      <span className="text-[#6B21A8]">Lưu đề rồi chọn trong trò chơi, nguồn “Kho học liệu Toán 3”.</span>
    </div>
  );
};

const FORMAT_LOOK: Record<HomeworkFormat, { icon: typeof FileText; gradient: string; description: string }> = {
  word: {
    icon: FileText,
    gradient: 'from-[#1E3A8A] via-[#2563EB] to-[#38BDF8]',
    description: 'Tạo phiếu bài tập, đề ôn tập, đề kiểm tra để chỉnh sửa, tải xuống và in.',
  },
  game: {
    icon: Gamepad2,
    gradient: 'from-[#6D28D9] via-[#C026D3] to-[#FB7185]',
    description: 'Tạo câu hỏi và chuyển thành trò chơi tương tác để tổ chức dạy học hoặc giao bài.',
  },
};

/** What the Game format can really do today, so nothing looks finished when it is not. */
const GameStatus: React.FC = () => {
  const ready = [
    <>Câu trắc nghiệm và Đúng/Sai dùng được ngay trong trò chơi</>,
    <>
      <Link to="/admin/homework/game/rung-chuong-vang" className="font-bold text-[#2563EB] hover:underline">
        Rung chuông vàng
      </Link>
      : cả lớp chơi trực tiếp từ đề đã lưu, trả lời trên điện thoại hoặc bảng con (dùng được cả câu trả lời ngắn)
    </>,
    <>
      Chơi trên lớp: mở{' '}
      <Link to="/admin/tools/mimo-quiz" className="font-bold text-[#2563EB] hover:underline">
        Mimo Quiz
      </Link>{' '}
      hoặc{' '}
      <Link to="/admin/tools/doan-tau" className="font-bold text-[#2563EB] hover:underline">
        Đoàn tàu kiến thức
      </Link>
      , chọn nguồn “Kho học liệu Toán 3” rồi chọn đề này
    </>,
  ];
  const notYet = ['Câu tự luận chưa chơi được trong trò chơi', 'Câu trả lời ngắn chưa chơi được trong Mimo Quiz và Đoàn tàu'];
  return (
    <section aria-label="Chức năng hiện có" className="grid grid-cols-1 gap-3 md:grid-cols-2">
      <div className="rounded-2xl border border-[#BFE3D0] bg-[#F0FBF5] p-4 text-sm text-[#14532D]">
        <div className="mb-1.5 flex items-center gap-1.5 font-extrabold">
          <CheckCircle2 className="h-4 w-4 text-[#1F9D6B]" />
          Đã dùng được
        </div>
        <ul className="list-disc space-y-1 pl-5">
          {ready.map((item, i) => (
            <li key={i}>{item}</li>
          ))}
        </ul>
      </div>
      <div className="rounded-2xl border border-[#DCE7F3] bg-[#F6FAFF] p-4 text-sm text-[#3B4A66]">
        <div className="mb-1.5 flex items-center gap-1.5 font-extrabold">
          <Info className="h-4 w-4 text-[#5E6C84]" />
          Chưa có trong phiên bản này
        </div>
        <ul className="list-disc space-y-1 pl-5">
          {notYet.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </div>
    </section>
  );
};
