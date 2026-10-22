import React, { useState } from 'react';
import {
  CheckCircle2,
  RotateCcw,
  Sparkles,
} from 'lucide-react';
import { useAppContext } from '../../app/providers';
import { RichContentRenderer } from '../../components/editor/RichContentRenderer';
import { finalizeTeacherGrading } from '../../services/firestoreRepository';
import {
  HomeworkQuestion,
  QuestionGradingResult,
  Submission,
} from '../../types/domain';
import { gradeFullSubmission } from '../../utils/gradingEngine';

export const GradingPage: React.FC = () => {
  const { submissions, assignments, students } = useAppContext();

  const [selectedSubId, setSelectedSubId] = useState<string | null>(null);
  const [questionResults, setQuestionResults] = useState<
    QuestionGradingResult[]
  >([]);
  const [overallComment, setOverallComment] = useState('');
  const [aiLoadingQuestionId, setAiLoadingQuestionId] = useState<string | null>(
    null
  );
  const [saving, setSaving] = useState(false);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const activeSubmission = submissions.find((s) => s.id === selectedSubId);
  const activeAssignment = activeSubmission
    ? assignments.find((a) => a.id === activeSubmission.assignmentId)
    : undefined;
  const activeStudent = activeSubmission
    ? students.find((st) => st.id === activeSubmission.studentId)
    : undefined;

  const selectSubmission = (sub: Submission) => {
    setSelectedSubId(sub.id);
    setStatusMessage(null);
    const asg = assignments.find((a) => a.id === sub.assignmentId);
    const keyQuestions =
      asg?.gradingKeySnapshot || asg?.publicQuestionsSnapshot || [];
    const computed = gradeFullSubmission(
      keyQuestions,
      sub.answers || [],
      sub.questionResults || []
    );
    setQuestionResults(computed.questionResults);
    setOverallComment(sub.teacherOverallComment || '');
  };

  const updateSingleResult = (
    questionId: string,
    patch: Partial<QuestionGradingResult>
  ) => {
    setQuestionResults((prev) =>
      prev.map((r) => (r.questionId === questionId ? { ...r, ...patch } : r))
    );
  };

  const handleRequestAISuggestion = async (question: HomeworkQuestion) => {
    if (!activeSubmission) return;
    const studentAns = activeSubmission.answers.find(
      (a) => a.questionId === question.id
    );
    const essayText =
      studentAns?.essayContent?.blocks
        .map((b) =>
          b.type === 'paragraph'
            ? b.text
            : b.type === 'math'
            ? b.latex
            : ''
        )
        .join('\n') || 'Học sinh chưa nhập nội dung.';

    const promptText = question.prompt.blocks
      .map((b) => (b.type === 'paragraph' ? b.text : ''))
      .join(' ');

    const sampleSolutionText = question.sampleSolution?.blocks
      .map((b) => (b.type === 'paragraph' ? b.text : ''))
      .join(' ');

    setAiLoadingQuestionId(question.id);
    try {
      const res = await fetch('/api/ai/suggest-grading', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          questionPrompt: promptText || 'Bài toán tự luận',
          maxPoints: question.points,
          rubric: question.rubric,
          sampleSolution: sampleSolutionText,
          studentEssayText: essayText,
        }),
      });
      const rawText = await res.text();
      let data: {
        error?: string;
        suggestedScore: number;
        explanation: string;
        improvementFeedback: string;
      };
      try {
        data = JSON.parse(rawText);
      } catch {
        throw new Error(
          `Máy chủ AI trả về phản hồi không hợp lệ (HTTP ${res.status}). Hãy kiểm tra cấu hình /api và GEMINI_API_KEY.`
        );
      }
      if (!res.ok) {
        throw new Error(data.error || 'Không thể lấy gợi ý chấm từ AI.');
      }

      updateSingleResult(question.id, {
        score: data.suggestedScore,
        aiSuggestedScore: data.suggestedScore,
        aiExplanation: data.explanation,
        aiImprovementFeedback: data.improvementFeedback,
        teacherComment: data.improvementFeedback,
      });
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : 'Lỗi gọi AI chấm tự luận.'
      );
    } finally {
      setAiLoadingQuestionId(null);
    }
  };

  const handleSaveGrading = async (
    publishResult: boolean,
    returnForRevision = false
  ) => {
    if (!activeSubmission) return;
    setSaving(true);
    setStatusMessage(null);
    try {
      await finalizeTeacherGrading({
        submission: activeSubmission,
        questionResults,
        teacherOverallComment: overallComment,
        publishResult,
        returnForRevision,
      });
      setStatusMessage(
        returnForRevision
          ? 'Đã trả bài để học sinh làm lại!'
          : publishResult
          ? 'Đã lưu điểm và công bố kết quả cho Phụ huynh/Học sinh!'
          : 'Đã lưu nháp kết quả chấm!'
      );
    } catch (err) {
      setStatusMessage(
        err instanceof Error ? err.message : 'Không thể lưu kết quả chấm.'
      );
    } finally {
      setSaving(false);
    }
  };

  const currentTotalScore = Number(
    questionResults
      .reduce((acc, r) => acc + (Number(r.score) || 0), 0)
      .toFixed(2)
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-slate-900">
          Bàn Chấm Bài & Gợi Ý Chấm Tự Luận Bằng AI
        </h1>
        <p className="text-sm text-slate-600">
          Các câu khách quan được hệ thống tự chấm theo đáp án chuẩn. Giáo viên
          chấm câu tự luận, sử dụng AI đề xuất điểm theo rubric và công bố kết
          quả.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
        {/* Left List of Submissions */}
        <div className="cartoon-card overflow-hidden bg-white lg:col-span-4">
          <div className="border-b-2 border-slate-900 bg-amber-100 px-4 py-3 font-display text-sm font-extrabold text-slate-900">
            Danh Sách Bài Làm ({submissions.length})
          </div>

          {submissions.length === 0 ? (
            <div className="p-8 text-center text-xs text-slate-500">
              Chưa có bài nộp nào từ học sinh.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {submissions.map((sub) => {
                const st = students.find((s) => s.id === sub.studentId);
                const asg = assignments.find((a) => a.id === sub.assignmentId);
                const isSelected = sub.id === selectedSubId;

                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => selectSubmission(sub)}
                    className={`flex w-full flex-col gap-1 p-4 text-left transition-colors ${
                      isSelected ? 'bg-sky-100' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-display text-sm font-extrabold text-slate-900">
                        {st?.fullName || sub.studentId}
                      </span>
                      <span className="font-mono text-xs font-bold text-blue-700">
                        {sub.totalScore ?? '—'}/{sub.maxScore}đ
                      </span>
                    </div>
                    <div className="text-xs text-slate-600">
                      {asg?.title || 'Bài tập'}
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[11px] text-slate-500">
                      <span>
                        Trạng thái:{' '}
                        <strong>
                          {sub.status === 'submitted'
                            ? 'Chờ chấm'
                            : sub.status === 'graded'
                            ? 'Đã chấm'
                            : sub.status === 'returned'
                            ? 'Yêu cầu sửa lại'
                            : 'Đang làm'}
                        </strong>
                      </span>
                      <span>
                        {sub.isPublished ? 'Đã công bố' : 'Chưa công bố'}
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Detailed Grading Workspace */}
        <div className="lg:col-span-8">
          {!activeSubmission || !activeAssignment ? (
            <div className="cartoon-card flex h-72 items-center justify-center bg-white p-8 text-center text-sm text-slate-500">
              Chọn một bài nộp bên trái để xem chi tiết câu trả lời, chấm tự
              luận hoặc yêu cầu AI đề xuất điểm.
            </div>
          ) : (
            <div className="space-y-5">
              {/* Summary Header */}
              <div className="cartoon-card flex flex-wrap items-center justify-between gap-4 bg-white p-5">
                <div>
                  <div className="text-xs font-bold text-blue-700">
                    HỌC SINH: {activeStudent?.fullName} (Mã:{' '}
                    {activeStudent?.accessCode})
                  </div>
                  <h2 className="font-display text-lg font-extrabold text-slate-900">
                    {activeAssignment.title}
                  </h2>
                </div>
                <div className="rounded-2xl border-2 border-slate-900 bg-amber-200 px-4 py-2 text-right">
                  <div className="text-[11px] font-bold text-slate-700">
                    TỔNG ĐIỂM CHÍNH THỨC
                  </div>
                  <div className="font-mono text-2xl font-black text-slate-900 tabular-nums">
                    {currentTotalScore} / {activeSubmission.maxScore}
                  </div>
                </div>
              </div>

              {statusMessage && (
                <div className="cartoon-card bg-emerald-50 p-4 text-xs font-extrabold text-emerald-900">
                  {statusMessage}
                </div>
              )}

              {/* Questions Breakdown */}
              {(
                activeAssignment.gradingKeySnapshot ||
                activeAssignment.publicQuestionsSnapshot ||
                []
              ).map((q, idx) => {
                const stuAns = activeSubmission.answers.find(
                  (a) => a.questionId === q.id
                );
                const qRes = questionResults.find(
                  (r) => r.questionId === q.id
                );

                return (
                  <div key={q.id} className="cartoon-card bg-white p-5">
                    <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 pb-2.5">
                      <span className="font-display text-sm font-extrabold text-slate-900">
                        Câu {idx + 1} · {q.type === 'essay' ? 'Tự luận' : 'Tự động chấm'}
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-700">
                          Điểm câu này:
                        </span>
                        <input
                          type="number"
                          step="0.25"
                          min="0"
                          max={q.points}
                          value={qRes?.score ?? 0}
                          onChange={(e) =>
                            updateSingleResult(q.id, {
                              score: Math.min(
                                q.points,
                                Math.max(0, Number(e.target.value) || 0)
                              ),
                            })
                          }
                          className="w-20 rounded-xl border-2 border-slate-800 px-2.5 py-1 font-mono text-xs font-extrabold"
                        />
                        <span className="font-mono text-xs text-slate-500">
                          / {q.points}đ
                        </span>
                      </div>
                    </div>

                    <RichContentRenderer content={q.prompt} />

                    {/* Student Answer Display */}
                    <div className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs">
                      <div className="mb-1 font-extrabold text-slate-700">
                        Bài làm của học sinh:
                      </div>
                      {q.type === 'single_choice' && (
                        <div>
                          Đã chọn:{' '}
                          <strong>
                            {q.options?.find(
                              (o) => o.id === stuAns?.selectedOptionId
                            )?.label || 'Chưa chọn'}
                          </strong>{' '}
                          (Đáp án đúng:{' '}
                          <strong>
                            {q.options?.find((o) => o.id === q.correctOptionId)
                              ?.label || '—'}
                          </strong>
                          )
                        </div>
                      )}

                      {q.type === 'multiple_choice' && (
                        <div>
                          Đã chọn:{' '}
                          <strong>
                            {(stuAns?.selectedOptionIds || [])
                              .map(
                                (id) =>
                                  q.options?.find((o) => o.id === id)?.label
                              )
                              .join(', ') || 'Chưa chọn'}
                          </strong>
                        </div>
                      )}

                      {q.type === 'true_false_multi' && (
                        <div className="space-y-1">
                          {(q.statements || []).map((st) => (
                            <div key={st.id}>
                              Ý {st.label}): Học sinh chọn{' '}
                              <strong>
                                {stuAns?.statementAnswers?.[st.id] === true
                                  ? 'Đúng'
                                  : stuAns?.statementAnswers?.[st.id] === false
                                  ? 'Sai'
                                  : 'Chưa chọn'}
                              </strong>{' '}
                              (Đáp án chuẩn: {st.isTrue ? 'Đúng' : 'Sai'})
                            </div>
                          ))}
                        </div>
                      )}

                      {q.type === 'short_answer' && (
                        <div>
                          Trả lời:{' '}
                          <strong className="font-mono">
                            {stuAns?.shortAnswerText || '(Trống)'}
                          </strong>{' '}
                          · Đáp án chuẩn:{' '}
                          <span className="font-mono">
                            {(q.acceptableAnswers || []).join(' / ')}
                          </span>
                        </div>
                      )}

                      {q.type === 'essay' && (
                        <div className="mt-2 rounded-lg bg-white p-3">
                          <RichContentRenderer content={stuAns?.essayContent} />
                        </div>
                      )}
                    </div>

                    {/* AI Essay Grading Assistant */}
                    {q.type === 'essay' && (
                      <div className="mt-3 rounded-xl border-2 border-slate-800 bg-amber-50 p-3.5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs font-extrabold text-slate-900">
                            Trợ lý AI gợi ý chấm tự luận theo Rubric
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRequestAISuggestion(q)}
                            disabled={aiLoadingQuestionId === q.id}
                            className="cartoon-button flex items-center gap-1.5 rounded-xl bg-amber-300 px-3 py-1.5 text-xs font-extrabold text-slate-900"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            {aiLoadingQuestionId === q.id
                              ? 'AI đang phân tích lời giải...'
                              : 'AI Đề Xuất Điểm & Nhận Xét'}
                          </button>
                        </div>

                        {qRes?.aiExplanation && (
                          <div className="mt-2.5 space-y-1 text-xs text-slate-800">
                            <div>
                              <strong>Điểm AI đề xuất:</strong>{' '}
                              <span className="font-mono font-bold text-blue-700">
                                {qRes.aiSuggestedScore}/{q.points}đ
                              </span>
                            </div>
                            <div>
                              <strong>Giải thích cho giáo viên:</strong>{' '}
                              {qRes.aiExplanation}
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Per-question Teacher Comment */}
                    <div className="mt-3">
                      <label className="mb-1 block text-xs font-bold text-slate-700">
                        Nhận xét của giáo viên cho câu {idx + 1}:
                      </label>
                      <input
                        type="text"
                        value={qRes?.teacherComment || ''}
                        onChange={(e) =>
                          updateSingleResult(q.id, {
                            teacherComment: e.target.value,
                          })
                        }
                        placeholder="Nhận xét hoặc hướng dẫn sửa sai cho học sinh..."
                        className="w-full rounded-xl border border-slate-300 px-3 py-1.5 text-xs"
                      />
                    </div>
                  </div>
                );
              })}

              {/* Overall Feedback & Publish Bar */}
              <div className="cartoon-card bg-white p-5">
                <label className="mb-1.5 block text-xs font-bold text-slate-700">
                  Nhận xét toàn bài của Giáo viên:
                </label>
                <textarea
                  rows={3}
                  value={overallComment}
                  onChange={(e) => setOverallComment(e.target.value)}
                  placeholder="Lời khen và dặn dò chung cho bài làm của học sinh..."
                  className="w-full rounded-xl border-2 border-slate-800 px-3.5 py-2 text-sm"
                />

                <div className="mt-4 flex flex-wrap justify-end gap-3">
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveGrading(false, true)}
                    className="cartoon-button flex items-center gap-1.5 rounded-xl bg-rose-100 px-4 py-2 text-xs font-extrabold text-rose-900"
                  >
                    <RotateCcw className="h-4 w-4" />
                    Trả Bài Yêu Cầu Sửa Lại
                  </button>

                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => handleSaveGrading(true, false)}
                    className="cartoon-button flex items-center gap-1.5 rounded-xl bg-emerald-600 px-5 py-2 text-xs font-extrabold text-white"
                  >
                    <CheckCircle2 className="h-4 w-4" />
                    {saving
                      ? 'Đang lưu...'
                      : 'Hoàn Tất Chấm & Công Bố Điểm'}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
