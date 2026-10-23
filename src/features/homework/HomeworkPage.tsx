import React, { useState } from 'react';
import {
  ArrowDown,
  AlertTriangle,
  ArrowUp,
  CheckCircle2,
  Copy,
  Edit3,
  Eye,
  FileJson,
  FileText,
  Plus,
  Save,
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
import { homeworkImportSchema } from '../../schemas/validation';
import { buildHomeworkFromMimo, isMimoDataset, MimoDataset } from './mimoImport';
import { MimoImportModal } from './MimoImportModal';

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
  const [grade, setGrade] = useState('Khối 5');
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
    clearSourceFiles();
    setEditingHw(null);
    setTitle('');
    setDescription('');
    setGrade('Khối 5');
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
    setTitle(hw.title);
    setDescription(hw.description || '');
    setGrade(hw.grade || 'Khối 5');
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
    setEditingHw(null);
    setTitle(draft.title);
    setDescription(draft.description || '');
    setGrade(draft.grade || 'Khối 5');
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
    setGrade(data.grade || 'Khối 5');
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
      <div className="space-y-6">
        {/* Top Editor Action Bar */}
        <div className="cartoon-card sticky top-16 z-10 flex flex-wrap items-center justify-between gap-4 bg-amber-100 p-4">
          <div>
            <h1 className="font-display text-lg font-extrabold text-slate-900">
              {editingHw ? 'Chỉnh Sửa BTVN Toán' : 'Soạn Bài Tập Về Nhà Mới'}
            </h1>
            <p className="text-xs text-slate-700">
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
                className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-slate-900"
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
                  : 'bg-white text-slate-900'
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
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-white px-3.5 py-2 text-xs font-extrabold text-slate-900"
            >
              <Save className="h-4 w-4" />
              Lưu Bản Nháp
            </button>

            <button
              type="button"
              onClick={() => handleSave('published')}
              disabled={saving}
              className="cartoon-button flex items-center gap-1.5 rounded-xl bg-blue-600 px-4 py-2 text-xs font-extrabold text-white"
            >
              Xuất Bản Đề
            </button>

            <button
              type="button"
              onClick={() => {
                clearSourceFiles();
                setEditorMode(false);
              }}
              className="cartoon-button rounded-xl bg-slate-100 px-3 py-2 text-xs font-bold text-slate-700"
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

        {/* Student Preview Mode */}
        {studentPreviewMode ? (
          <div className="mx-auto max-w-2xl space-y-5">
            <div className="cartoon-card bg-sky-50 p-5">
              <div className="text-xs font-extrabold text-blue-700">
                CHẾ ĐỘ XEM TRƯỚC GIAO DIỆN HỌC SINH (ĐÃ ẨN ĐÁP ÁN CHUẨN)
              </div>
              <h2 className="mt-1 font-display text-xl font-extrabold text-slate-900">
                {title || 'Chưa đặt tiêu đề'}
              </h2>
              {description && (
                <p className="mt-1 text-sm text-slate-700">{description}</p>
              )}
            </div>

            {questions.map((q, idx) => (
              <div key={q.id} className="cartoon-card p-5">
                <div className="mb-3 flex items-center justify-between border-b border-slate-200 pb-2">
                  <span className="font-display text-sm font-extrabold text-blue-700">
                    Câu {idx + 1} ({q.points} điểm)
                  </span>
                  <span className="text-xs text-slate-500">
                    {QUESTION_TYPE_LABELS[q.type]}
                  </span>
                </div>
                <RichContentRenderer content={q.prompt} />

                {(q.type === 'single_choice' || q.type === 'multiple_choice') && (
                  <div className="mt-4 space-y-2">
                    {(q.options || []).map((opt) => (
                      <div
                        key={opt.id}
                        className="flex items-center gap-3 rounded-xl border-2 border-slate-300 bg-slate-50 px-3.5 py-2.5"
                      >
                        <input
                          type={
                            q.type === 'single_choice' ? 'radio' : 'checkbox'
                          }
                          disabled
                          className="h-4 w-4"
                        />
                        <span className="font-display text-sm font-bold text-slate-800">
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
                        className="flex items-center justify-between gap-4 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5"
                      >
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-slate-800">
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
                      className="w-full rounded-xl border-2 border-slate-300 bg-slate-50 px-3.5 py-2 text-sm"
                    />
                  </div>
                )}

                {q.type === 'essay' && (
                  <div className="mt-4 rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 p-4 text-xs text-slate-500">
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
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Tiêu đề BTVN *
                  </label>
                  <input
                    type="text"
                    value={title}
                    onChange={(e) => setTitle(e.target.value)}
                    placeholder="Ví dụ: Phiếu BTVN Tuần 8: Phân Số & Diện Tích Tam Giác"
                    className="w-full rounded-xl border-2 border-slate-800 px-3.5 py-2 text-sm font-bold"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="mb-1 block text-xs font-bold text-slate-700">
                    Khối lớp / Mức độ
                  </label>
                  <select
                    value={grade}
                    onChange={(e) => setGrade(e.target.value)}
                    className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm"
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
                  <label className="flex cursor-pointer items-center gap-2 rounded-xl border-2 border-slate-800 bg-amber-50 px-3 py-2 text-xs font-bold text-slate-800 w-full">
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
                <label className="mb-1 block text-xs font-bold text-slate-700">
                  Mô tả / Hướng dẫn làm bài chung
                </label>
                <textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Lời dặn dò cho học sinh trước khi làm bài..."
                  className="w-full rounded-xl border-2 border-slate-800 px-3.5 py-2 text-sm"
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
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b-2 border-slate-200 pb-3">
                  <div className="flex flex-wrap items-center gap-3">
                    <span className="rounded-xl border-2 border-slate-900 bg-amber-300 px-3 py-1 font-display text-sm font-extrabold text-slate-900">
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
                      className="rounded-xl border-2 border-slate-800 bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
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
                      <span className="text-xs font-bold text-slate-700">
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
                        className="w-20 rounded-xl border-2 border-slate-800 px-2.5 py-1 font-mono text-xs font-bold"
                      />
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => moveQuestion(qIdx, -1)}
                      disabled={qIdx === 0}
                      className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-40"
                      title="Chuyển lên"
                    >
                      <ArrowUp className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveQuestion(qIdx, 1)}
                      disabled={qIdx === questions.length - 1}
                      className="rounded-lg border border-slate-300 p-1.5 hover:bg-slate-100 disabled:opacity-40"
                      title="Chuyển xuống"
                    >
                      <ArrowDown className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      onClick={() => duplicateQuestionAt(qIdx)}
                      className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-bold text-slate-700 hover:bg-slate-100"
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
                <div className="mt-4 rounded-2xl border-2 border-slate-800 bg-emerald-50/60 p-4">
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
                            className="flex flex-col gap-2 rounded-xl border border-slate-300 bg-white p-3 sm:flex-row sm:items-center"
                          >
                            <label className="flex shrink-0 cursor-pointer items-center gap-2 font-display text-sm font-extrabold text-slate-900">
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
                              className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
                          className="flex flex-col gap-2 rounded-xl border border-slate-300 bg-white p-3 sm:flex-row sm:items-center"
                        >
                          <span className="font-display text-sm font-extrabold text-slate-900">
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
                            className="flex-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm"
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
                              className="rounded-lg border border-slate-800 bg-amber-100 px-2.5 py-1 text-xs font-extrabold text-slate-900"
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
                                className="w-16 rounded-lg border border-slate-300 px-2 py-1 font-mono"
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
                      <label className="mb-1 block text-xs font-semibold text-slate-700">
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
                        className="w-full rounded-xl border border-slate-400 bg-white px-3.5 py-2 font-mono text-sm"
                      />
                    </div>
                  )}

                  {/* Type 5: Essay */}
                  {q.type === 'essay' && (
                    <div className="space-y-3">
                      <div>
                        <label className="mb-1 block text-xs font-semibold text-slate-700">
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
                          className="w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
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
              <div className="mb-2 text-xs font-extrabold text-slate-700">
                + THÊM CÂU HỎI MỚI VÀO ĐỀ (ĐỦ 5 LOẠI CÂU HỎI BẮT BUỘC):
              </div>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(QUESTION_TYPE_LABELS) as QuestionType[]).map(
                  (t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => addQuestion(t)}
                      className="cartoon-button flex items-center gap-1.5 rounded-xl bg-amber-100 px-3.5 py-2 text-xs font-extrabold text-slate-900"
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

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col justify-between gap-4 sm:flex-row sm:items-center">
        <div>
          <h1 className="font-display text-2xl font-extrabold text-slate-900">
            Kho học liệu Toán 3
          </h1>
          <p className="text-sm text-slate-600">
            Soạn đề Toán thủ công với công thức KaTeX và hình học phẳng, hoặc
            tải ảnh/PDF để AI chuyển đổi thành câu hỏi có cấu trúc.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={() => setAiModalOpen(true)}
            className="cartoon-button flex items-center gap-2 rounded-xl bg-amber-300 px-4 py-2.5 text-xs font-extrabold text-slate-900 whitespace-nowrap"
          >
            <Sparkles className="h-4 w-4" />
            Upload Ảnh/PDF Tạo Đề Bằng AI
          </button>

          <button
            type="button"
            onClick={startNewHomework}
            className="cartoon-button flex items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-xs font-extrabold text-white whitespace-nowrap"
          >
            <Plus className="h-4 w-4" />
            Soạn BTVN Thủ Công
          </button>

          <label
            className="cartoon-button flex cursor-pointer items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-xs font-extrabold text-slate-900 whitespace-nowrap"
            title="Mở đề đã soạn sẵn dạng file .json"
          >
            <FileJson className="h-4 w-4" />
            Nhập đề từ file
            <input
              type="file"
              accept="application/json,.json"
              onChange={handleImportFile}
              className="hidden"
            />
          </label>
        </div>
      </div>

      {importError && (
        <div className="cartoon-card bg-rose-50 p-4 text-xs font-bold text-rose-700">
          {importError}
        </div>
      )}

      {/* Homework List */}
      {homeworkList.length === 0 ? (
        <div className="cartoon-card p-12 text-center">
          <p className="font-display text-base font-bold text-slate-800">
            Kho học liệu Toán 3 chưa có đề nào
          </p>
          <p className="mt-1 text-xs text-slate-500">
            Hãy nhấn &ldquo;Soạn BTVN Thủ Công&rdquo; hoặc &ldquo;Upload Ảnh/PDF
            Tạo Đề Bằng AI&rdquo; để bắt đầu.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {homeworkList.map((hw) => (
            <div
              key={hw.id}
              className="cartoon-card flex flex-col justify-between bg-white p-5"
            >
              <div>
                <div className="flex items-center justify-between gap-2 text-xs text-slate-500">
                  <span className="font-bold text-blue-700">
                    {hw.grade || 'Toán'}
                  </span>
                  <span>·</span>
                  <span>
                    <strong className="font-mono">{hw.questions.length}</strong>{' '}
                    câu hỏi ({hw.totalPoints} điểm)
                  </span>
                  <span>·</span>
                  <span>
                    Đáp án: {hw.answerSource === 'ai' ? 'AI giải đề' : 'Giáo viên'}
                  </span>
                  <span>·</span>
                  <span
                    className={
                      hw.status === 'published'
                        ? 'font-bold text-emerald-700'
                        : 'font-bold text-amber-700'
                    }
                  >
                    {hw.status === 'published' ? 'Đã xuất bản' : 'Bản nháp'}
                  </span>
                </div>

                <h3 className="mt-2 font-display text-lg font-extrabold text-slate-900">
                  {hw.title}
                </h3>
                {hw.description && (
                  <p className="mt-1 line-clamp-2 text-xs text-slate-600">
                    {hw.description}
                  </p>
                )}
              </div>

              <div className="mt-5 flex flex-wrap items-center justify-end gap-2 border-t border-slate-200 pt-4">
                <button
                  type="button"
                  onClick={() => openEditHomework(hw)}
                  className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-3 py-1.5 text-xs font-bold text-slate-900"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                  Mở / Chỉnh sửa
                </button>
                <button
                  type="button"
                  onClick={() => duplicateHomework(hw)}
                  className="cartoon-button flex items-center gap-1 rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-bold text-slate-800"
                >
                  <Copy className="h-3.5 w-3.5" />
                  Nhân bản
                </button>
                {hw.status === 'draft' && (
                  <button
                    type="button"
                    onClick={() => deleteDraftHomework(hw.id)}
                    className="cartoon-button flex items-center gap-1 rounded-lg bg-rose-50 px-3 py-1.5 text-xs font-bold text-rose-700"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Xóa nháp
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

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
        onExtracted={handleExtracted}
      />
    </div>
  );
};
