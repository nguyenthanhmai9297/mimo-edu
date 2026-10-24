import React, { useState } from 'react';
import {
  ArrowDown,
  AlertTriangle,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  FileJson,
  FileText,
  PenLine,
  Plus,
  Save,
  Search,
  Sparkles,
  Trash2,
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
import { cropFigure, NormalizedBox } from './figureCrop';
import {
  FigureCropContext,
  FigureCropContextValue,
} from '../../components/editor/FigureCropContext';
import { SourceDocumentPanel } from './SourceDocumentPanel';
import {
  deleteDraftHomework,
  duplicateHomework,
  saveHomework,
} from '../../services/firestoreRepository';
import {
  ChoiceOption,
  Homework,
  HomeworkQuestion,
  PRACTICE_LEVEL_LABELS,
  PracticeLevel,
  QuestionType,
  TrueFalseStatement,
} from '../../types/domain';
import { createRichTextFromPlain } from '../../utils/gradingEngine';
import { DEFAULT_GRADE, normalizeGrade } from '../../utils/grade';
import { incompletenessMessage } from '../../utils/aiCompleteness';
import { homeworkImportSchema } from '../../schemas/validation';
import { buildHomeworkFromMimo, isMimoDataset, MimoDataset } from './mimoImport';
import { MimoImportModal } from './MimoImportModal';
import {
  ConfirmDialog,
  EmptyState,
  ErrorState,
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

export const HomeworkPage: React.FC = () => {
  const { homeworkList } = useAppContext();

  const [editorMode, setEditorMode] = useState(false);
  const [studentPreviewMode, setStudentPreviewMode] = useState(false);
  const [editingHw, setEditingHw] = useState<Homework | null>(null);

  // Homework Form State
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [grade, setGrade] = useState(DEFAULT_GRADE);
  const [answerSource, setAnswerSource] = useState<'teacher' | 'ai'>('teacher');
  const [aiSolverEnabled, setAiSolverEnabled] = useState(true);
  const [questions, setQuestions] = useState<HomeworkQuestion[]>([]);
  const [saving, setSaving] = useState(false);
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

  const startNewHomework = () => {
    setMissingQuestionsWarning(null);
    clearSourceFiles();
    setEditingHw(null);
    setTitle('');
    setDescription('');
    setGrade(DEFAULT_GRADE);
    setAnswerSource('teacher');
    setAiSolverEnabled(true);
    setQuestions([createDefaultQuestion('single_choice', 1)]);
    setStudentPreviewMode(false);
    setErrorMsg(null);
    setEditorMode(true);
  };

  const openEditHomework = (hw: Homework) => {
    clearSourceFiles();
    setEditingHw(hw);
    setMissingQuestionsWarning(null);
    setTitle(hw.title);
    setDescription(hw.description || '');
    setGrade(hw.grade || DEFAULT_GRADE);
    setAnswerSource(hw.answerSource);
    setAiSolverEnabled(hw.aiSolverEnabled);
    setQuestions(hw.questions || []);
    setStudentPreviewMode(false);
    setErrorMsg(null);
    setEditorMode(true);
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
      await saveHomework(
        {
          title,
          description,
          subject: 'Toán',
          grade,
          questions,
          answerSource,
          aiSolverEnabled,
          totalPoints,
          status,
        },
        editingHw || undefined
      );
      clearSourceFiles();
      setEditorMode(false);
    } catch (err) {
      setErrorMsg(
        err instanceof Error ? err.message : 'Không thể lưu bài tập về nhà.'
      );
    } finally {
      setSaving(false);
    }
  };

  const [importError, setImportError] = useState<string | null>(null);

  const [mimoDataset, setMimoDataset] = useState<MimoDataset | null>(null);

  const openImportedDraft = (draft: {
    title: string;
    description?: string;
    grade?: string;
    answerSource: 'teacher' | 'ai';
    aiSolverEnabled: boolean;
    questions: HomeworkQuestion[];
  }) => {
    clearSourceFiles();
    setMissingQuestionsWarning(null);
    setEditingHw(null);
    setTitle(draft.title);
    setDescription(draft.description || '');
    setGrade(draft.grade || DEFAULT_GRADE);
    setAnswerSource(draft.answerSource);
    setAiSolverEnabled(draft.aiSolverEnabled);
    setQuestions(draft.questions.map((q, i) => ({ ...q, order: i + 1 })));
    setStudentPreviewMode(false);
    setErrorMsg(null);
    setEditorMode(true);
  };

  const handleImportFile = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setImportError(null);
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
    openImportedDraft({ ...draft, answerSource: 'teacher', aiSolverEnabled: false });
    if (draft.skippedIds.length > 0) {
      setErrorMsg(
        `Đã bỏ qua ${draft.skippedIds.length} câu thuộc dạng chưa hỗ trợ: ${draft.skippedIds.join(', ')}.`
      );
    }
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
    setEditingHw(null);
    setTitle(data.title || 'Đề Toán trích xuất từ AI');
    setDescription(data.description || '');
    setGrade(normalizeGrade(data.grade));
    setMissingQuestionsWarning(incompletenessMessage(data.completeness));
    setAnswerSource(solveWithAI ? 'ai' : 'teacher');
    setAiSolverEnabled(solveWithAI);
    setQuestions(data.questions || []);
    setStudentPreviewMode(false);
    setErrorMsg(null);
    setEditorMode(true);
  };

  if (editorMode) {
    const totalPoints = Number(
      questions.reduce((s, q) => s + (Number(q.points) || 0), 0).toFixed(2)
    );

    return (
      <FigureCropContext.Provider value={figureCropContext}>
      <div className="studio-skin space-y-6">
        {/* Top Editor Action Bar */}
        <div className="cartoon-card sticky top-16 z-10 flex flex-wrap items-center justify-between gap-4 bg-white/95 p-4 backdrop-blur">
          <div>
            <h1 className="font-display text-lg font-extrabold text-[#172B4D]">
              {editingHw ? 'Chỉnh sửa bài tập' : 'Soạn bài tập mới'}
            </h1>
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
              onClick={() => {
                clearSourceFiles();
                setEditorMode(false);
              }}
              className="cartoon-button rounded-xl bg-[#F6FAFF] px-3 py-2 text-xs font-bold text-[#3B4A66]"
            >
              Đóng
            </button>
          </div>
        </div>

        {errorMsg && (
          <div className="cartoon-card bg-rose-50 p-4 text-xs font-bold text-rose-700">
            {errorMsg}
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
                      value={q.type}
                      onChange={(e) =>
                        updateQuestionAt(
                          qIdx,
                          createDefaultQuestion(
                            e.target.value as QuestionType,
                            qIdx + 1
                          )
                        )
                      }
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

                            <input
                              type="text"
                              value={
                                opt.content.blocks[0]?.type === 'paragraph'
                                  ? opt.content.blocks[0].text
                                  : ''
                              }
                              onChange={(e) => {
                                const nextOpts = [...(q.options || [])];
                                nextOpts[oIdx] = {
                                  ...opt,
                                  content: createRichTextFromPlain(
                                    e.target.value
                                  ),
                                };
                                updateQuestionAt(qIdx, {
                                  ...q,
                                  options: nextOpts,
                                });
                              }}
                              placeholder={`Nội dung phương án ${opt.label} (hỗ trợ $LaTeX$)`}
                              className="flex-1 rounded-lg border border-[#DCE7F3] px-3 py-1.5 text-sm"
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
                          <input
                            type="text"
                            value={
                              st.statement.blocks[0]?.type === 'paragraph'
                                ? st.statement.blocks[0].text
                                : ''
                            }
                            onChange={(e) => {
                              const nextSt = [...(q.statements || [])];
                              nextSt[sIdx] = {
                                ...st,
                                statement: createRichTextFromPlain(
                                  e.target.value
                                ),
                              };
                              updateQuestionAt(qIdx, {
                                ...q,
                                statements: nextSt,
                              });
                            }}
                            placeholder="Nhập mệnh đề Toán học..."
                            className="flex-1 rounded-lg border border-[#DCE7F3] px-3 py-1.5 text-sm"
                          />
                          <div className="flex items-center gap-3">
                            <select
                              value={st.isTrue ? 'true' : 'false'}
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
  const tools = [
    {
      key: 'ai',
      icon: Sparkles,
      tone: 'yellow' as const,
      title: 'Tạo bài tập bằng AI',
      text: 'Tải ảnh chụp hoặc PDF đề bài, AI chuyển thành câu hỏi có cấu trúc để cô xem lại.',
      cta: 'Tải ảnh / PDF',
    },
    {
      key: 'manual',
      icon: PenLine,
      tone: 'blue' as const,
      title: 'Soạn bài tập thủ công',
      text: 'Soạn từng câu với công thức Toán, hình vẽ và 5 dạng câu hỏi.',
      cta: 'Bắt đầu soạn',
    },
    {
      key: 'file',
      icon: FileJson,
      tone: 'teal' as const,
      title: 'Nhập bài tập từ tệp',
      text: 'Mở tệp .json đã soạn sẵn (định dạng MimoEDU hoặc bộ câu hỏi Mimo).',
      cta: 'Chọn tệp .json',
    },
  ];

  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={BookOpen}
        title="Soạn bài tập"
        description="Soạn bài tập Toán với công thức và hình học, tạo đề bằng AI từ ảnh/PDF, hoặc nhập từ tệp. Bài đã xuất bản dùng được ở mục Giao bài tập."
      />

      <section aria-label="Cách tạo bài tập" className="grid grid-cols-1 gap-4 md:grid-cols-3">
        {tools.map((t) => {
          const Icon = t.icon;
          const body = (
            <>
              <span className={`flex h-12 w-12 items-center justify-center rounded-2xl ${STUDIO_TONE[t.tone]}`}>
                <Icon className="h-6 w-6" />
              </span>
              <span className="mt-4 block font-display text-base font-extrabold text-[#172B4D]">{t.title}</span>
              <span className="mt-1 block text-sm leading-relaxed text-[#5E6C84]">{t.text}</span>
              <span className="mt-auto inline-flex items-center gap-1 pt-4 text-sm font-bold text-[#2563EB] transition group-hover:gap-2">
                {t.cta} <ArrowRight className="h-4 w-4" />
              </span>
            </>
          );
          const wash = { yellow: 'from-[#FFF8E1]', blue: 'from-[#EFF6FF]', teal: 'from-[#ECFEFF]' }[t.tone];
          const cls = `studio-card group flex h-full flex-col bg-gradient-to-br ${wash} to-white p-5 text-left transition hover:-translate-y-0.5 hover:shadow-[var(--studio-shadow-hover)] focus-within:ring-4 focus-within:ring-[#54C8FF]/30`;
          return t.key === 'file' ? (
            <label key={t.key} className={`${cls} cursor-pointer`}>
              {body}
              <input type="file" accept="application/json,.json" onChange={handleImportFile} className="sr-only" />
            </label>
          ) : (
            <button key={t.key} type="button" onClick={t.key === 'ai' ? () => setAiModalOpen(true) : startNewHomework} className={cls}>
              {body}
            </button>
          );
        })}
      </section>

      {importError && <ErrorState message={importError} />}

      <SectionHeading icon={FileText} title="Bài tập đã soạn" note={`${hwCounts.all} bài · ${hwCounts.published} đã xuất bản · ${hwCounts.draft} bản nháp`} />

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

      {homeworkList.length === 0 ? (
        <EmptyState
          icon={BookOpen}
          title="Chưa có bài tập nào"
          text="Chọn một trong ba cách ở trên để tạo bài tập đầu tiên. Bài soạn xong có thể lưu nháp hoặc xuất bản để giao cho lớp."
        />
      ) : shownHomework.length === 0 ? (
        <EmptyState icon={Search} tone="gray" title="Không có bài tập phù hợp" text="Thử từ khóa hoặc trạng thái khác." />
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 2xl:grid-cols-3">
          {shownHomework.map((hw) => {
            const published = hw.status === 'published';
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
                  <span>Cập nhật {hw.updatedAt.slice(0, 10).split('-').reverse().join('/')}</span>
                </div>
                <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-[#EEF3F9] pt-4">
                  <button type="button" onClick={() => openEditHomework(hw)} className="studio-btn studio-btn-primary flex-1">
                    <Edit3 className="h-4 w-4" />
                    Mở / chỉnh sửa
                  </button>
                  <button type="button" onClick={() => duplicateHomework(hw)} className="studio-btn studio-btn-secondary px-3" title="Nhân bản bài tập">
                    <Copy className="h-4 w-4" />
                    <span className="sr-only sm:not-sr-only">Nhân bản</span>
                  </button>
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
        onExtracted={handleExtracted}
      />
    </div>
  );
};
