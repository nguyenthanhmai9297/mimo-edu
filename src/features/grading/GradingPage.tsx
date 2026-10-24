import React, { useState } from 'react';
import {
  CheckCircle2,
  ClipboardCheck,
  Clock,
  EyeOff,
  Inbox,
  MousePointerClick,
  RotateCcw,
  Search,
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
import { apiUrl } from '../../lib/apiUrl';
import { auth } from '../../lib/firebase/config';
import {
  EmptyState,
  ErrorState,
  PageHeader,
  SearchInput,
  SegmentedFilter,
  StatCard,
  StatusBadge,
  STUDIO_INPUT,
  STUDIO_LABEL,
  STUDIO_TONE,
} from '../../components/studio/StudioUi';

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
  const [listFilter, setListFilter] = useState<'waiting' | 'done' | 'all'>('waiting');
  const [listSearch, setListSearch] = useState('');

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
      const token = await auth.currentUser?.getIdToken();
      if (!token) throw new Error('Phiên đăng nhập đã hết hạn, vui lòng tải lại trang và đăng nhập lại.');
      const res = await fetch(apiUrl('/api/ai/suggest-grading'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
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
          `Máy chủ AI trả về phản hồi không hợp lệ (HTTP ${res.status}). Vui lòng thử lại sau.`
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

  const subStatus: Record<Submission['status'], { kind: 'warning' | 'success' | 'danger' | 'neutral'; label: string }> = {
    submitted: { kind: 'warning', label: 'Chờ chấm' },
    graded: { kind: 'success', label: 'Đã chấm' },
    returned: { kind: 'danger', label: 'Yêu cầu sửa lại' },
    in_progress: { kind: 'neutral', label: 'Đang làm' },
  };
  const waitingCount = submissions.filter((s) => s.status === 'submitted').length;
  const gradedCount = submissions.filter((s) => s.status === 'graded').length;
  const unpublishedCount = submissions.filter((s) => s.status === 'graded' && !s.isPublished).length;
  const shownSubmissions = submissions
    .filter((s) => listFilter === 'all' || (listFilter === 'waiting' ? s.status === 'submitted' : s.status !== 'submitted'))
    .filter((s) => {
      const q = listSearch.trim().toLowerCase();
      if (!q) return true;
      const st = students.find((x) => x.id === s.studentId);
      const asg = assignments.find((a) => a.id === s.assignmentId);
      return (st?.fullName || '').toLowerCase().includes(q) || (asg?.title || '').toLowerCase().includes(q) || (st?.accessCode || '').toLowerCase().includes(q);
    });
  const statusOk = statusMessage?.startsWith('Đã') ?? false;

  return (
    <div className="studio-skin space-y-6">
      <PageHeader
        icon={ClipboardCheck}
        tone="pink"
        title="Chấm bài nộp"
        description="Câu trắc nghiệm, đúng/sai và trả lời ngắn được hệ thống tự chấm theo đáp án. Cô chấm câu tự luận (có thể nhờ AI gợi ý điểm theo rubric), viết nhận xét rồi công bố điểm."
      />

      {submissions.length > 0 && (
        <section className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
          <StatCard icon={Clock} tone="yellow" label="Chờ chấm" value={waitingCount} note="Có câu tự luận cần cô chấm" />
          <StatCard icon={CheckCircle2} tone="green" label="Đã chấm" value={gradedCount} />
          <StatCard icon={EyeOff} tone="pink" label="Đã chấm, chưa công bố" value={unpublishedCount} />
          <StatCard icon={Inbox} tone="blue" label="Tổng bài nộp" value={submissions.length} />
        </section>
      )}

      {submissions.length === 0 ? (
        <EmptyState
          icon={Inbox}
          tone="pink"
          title="Chưa có bài nộp nào"
          text="Khi học sinh nộp bài ở cổng học sinh, bài sẽ hiện ở đây. Bài chỉ có câu tự động chấm sẽ được chấm và công bố ngay."
        />
      ) : (
        <div className="grid grid-cols-1 items-start gap-6 lg:grid-cols-12">
          {/* Left: submissions */}
          <aside className="studio-card overflow-hidden lg:sticky lg:top-20 lg:col-span-4">
            <div className="space-y-3 border-b border-[#DCE7F3] p-4">
              <h2 className="flex items-center justify-between font-display text-base font-extrabold text-[#172B4D]">
                Bài nộp
                <span className="text-xs font-bold text-[#5E6C84]">{shownSubmissions.length}</span>
              </h2>
              <SearchInput value={listSearch} onChange={setListSearch} placeholder="Tìm học sinh, mã hoặc bài tập…" />
              <SegmentedFilter
                label="Lọc bài nộp"
                value={listFilter}
                onChange={setListFilter}
                options={[
                  { id: 'waiting', label: 'Chờ chấm', count: waitingCount },
                  { id: 'done', label: 'Đã xử lý', count: submissions.length - waitingCount },
                  { id: 'all', label: 'Tất cả', count: submissions.length },
                ]}
              />
            </div>
            {shownSubmissions.length === 0 ? (
              <EmptyState bare icon={listFilter === 'waiting' ? CheckCircle2 : Search} tone={listFilter === 'waiting' ? 'green' : 'gray'} title={listFilter === 'waiting' ? 'Đã chấm hết bài!' : 'Không có bài phù hợp'} />
            ) : (
              <ul className="max-h-[65vh] divide-y divide-[#EEF3F9] overflow-y-auto">
                {shownSubmissions.map((sub) => {
                  const st = students.find((s) => s.id === sub.studentId);
                  const asg = assignments.find((a) => a.id === sub.assignmentId);
                  const isSelected = sub.id === selectedSubId;
                  const b = subStatus[sub.status] ?? subStatus.in_progress;
                  return (
                    <li key={sub.id}>
                      <button
                        type="button"
                        onClick={() => selectSubmission(sub)}
                        aria-current={isSelected ? 'true' : undefined}
                        className={`flex w-full items-start gap-3 border-l-4 px-4 py-3 text-left transition-colors ${
                          isSelected ? 'border-[#1267E9] bg-[#EAF5FF]' : 'border-transparent hover:bg-[#F6FAFF]'
                        }`}
                      >
                        <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-extrabold ${STUDIO_TONE.blue}`}>
                          {(st?.fullName || '?').slice(0, 1).toUpperCase()}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="flex items-center justify-between gap-2">
                            <span className="truncate text-sm font-bold text-[#172B4D]">{st?.fullName || sub.studentId}</span>
                            <span className="shrink-0 font-mono text-xs font-bold text-[#1267E9]">
                              {sub.totalScore ?? '—'}/{sub.maxScore}
                            </span>
                          </span>
                          <span className="block truncate text-xs text-[#5E6C84]">{asg?.title || 'Bài tập'}</span>
                          <span className="mt-1.5 flex flex-wrap gap-1.5">
                            <StatusBadge kind={b.kind}>{b.label}</StatusBadge>
                            {sub.status === 'graded' && <StatusBadge kind={sub.isPublished ? 'info' : 'neutral'}>{sub.isPublished ? 'Đã công bố' : 'Chưa công bố'}</StatusBadge>}
                          </span>
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </aside>

          {/* Right: grading workspace */}
          <div className="lg:col-span-8">
            {!activeSubmission || !activeAssignment ? (
              <EmptyState
                icon={MousePointerClick}
                title="Chọn một bài nộp để chấm"
                text="Bấm vào bài nộp ở cột bên trái để xem bài làm, chỉnh điểm từng câu, nhờ AI gợi ý chấm tự luận và công bố kết quả."
              />
            ) : (
              <div className="space-y-5">
                {/* Summary */}
                <section className="studio-card flex flex-wrap items-center justify-between gap-4 p-5">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl text-lg font-extrabold ${STUDIO_TONE.blue}`}>
                      {(activeStudent?.fullName || '?').slice(0, 1).toUpperCase()}
                    </span>
                    <div className="min-w-0">
                      <div className="text-xs font-bold text-[#1267E9]">
                        {activeStudent?.fullName} · Mã {activeStudent?.accessCode}
                      </div>
                      <h2 className="truncate font-display text-lg font-extrabold text-[#172B4D]">{activeAssignment.title}</h2>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-[#FFF6DC] px-5 py-2 text-right">
                    <div className="text-[11px] font-bold text-[#B7790A] uppercase">Tổng điểm</div>
                    <div className="font-display text-2xl font-extrabold text-[#172B4D] [font-variant-numeric:tabular-nums]">
                      {currentTotalScore} / {activeSubmission.maxScore}
                    </div>
                  </div>
                </section>

                {statusMessage &&
                  (statusOk ? (
                    <div role="status" className="flex items-center gap-2 rounded-2xl border border-[#BFE8D4] bg-[#E7F7F0] p-4 text-sm font-bold text-[#1F7A55]">
                      <CheckCircle2 className="h-4 w-4 shrink-0" />
                      {statusMessage}
                    </div>
                  ) : (
                    <ErrorState message={statusMessage} />
                  ))}

                {/* Questions */}
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
                  const essay = q.type === 'essay';

                  return (
                    <section key={q.id} className="studio-card p-5">
                      <div className="mb-3 flex flex-wrap items-center justify-between gap-2 border-b border-[#EEF3F9] pb-3">
                        <span className="flex items-center gap-2">
                          <span className="font-display text-sm font-extrabold text-[#172B4D]">Câu {idx + 1}</span>
                          <StatusBadge kind={essay ? 'warning' : 'info'}>{essay ? 'Tự luận · cô chấm' : 'Tự động chấm'}</StatusBadge>
                        </span>
                        <label className="flex items-center gap-2 text-xs font-bold text-[#5E6C84]">
                          Điểm
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
                            className={`${STUDIO_INPUT} w-20 text-center font-mono font-extrabold`}
                          />
                          <span className="font-mono">/ {q.points}</span>
                        </label>
                      </div>

                      <RichContentRenderer content={q.prompt} />

                      {/* Student answer */}
                      <div className="mt-3 rounded-xl bg-[#F6FAFF] p-3.5 text-sm text-[#172B4D]">
                        <div className="mb-1 text-xs font-bold text-[#5E6C84]">Bài làm của học sinh</div>
                        {q.type === 'single_choice' && (
                          <div>
                            Đã chọn:{' '}
                            <strong>
                              {q.options?.find(
                                (o) => o.id === stuAns?.selectedOptionId
                              )?.label || 'Chưa chọn'}
                            </strong>{' '}
                            <span className="text-[#5E6C84]">
                              (đáp án đúng:{' '}
                              <strong className="text-[#1F9D6B]">
                                {q.options?.find((o) => o.id === q.correctOptionId)
                                  ?.label || '—'}
                              </strong>
                              )
                            </span>
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
                                Ý {st.label}): học sinh chọn{' '}
                                <strong>
                                  {stuAns?.statementAnswers?.[st.id] === true
                                    ? 'Đúng'
                                    : stuAns?.statementAnswers?.[st.id] === false
                                    ? 'Sai'
                                    : 'Chưa chọn'}
                                </strong>{' '}
                                <span className="text-[#5E6C84]">(đáp án: {st.isTrue ? 'Đúng' : 'Sai'})</span>
                              </div>
                            ))}
                          </div>
                        )}

                        {q.type === 'short_answer' && (
                          <div>
                            Trả lời: <strong className="font-mono">{stuAns?.shortAnswerText || '(Trống)'}</strong>{' '}
                            <span className="text-[#5E6C84]">
                              · Đáp án chuẩn: <span className="font-mono">{(q.acceptableAnswers || []).join(' / ')}</span>
                            </span>
                          </div>
                        )}

                        {essay && (
                          <div className="mt-2 rounded-lg bg-white p-3 ring-1 ring-[#DCE7F3]">
                            <RichContentRenderer content={stuAns?.essayContent} />
                          </div>
                        )}
                      </div>

                      {/* AI essay assistant */}
                      {essay && (
                        <div className="mt-3 rounded-xl border border-[#FFE7A3] bg-[#FFFBEB] p-3.5">
                          <div className="flex flex-wrap items-center justify-between gap-2">
                            <span className="flex items-center gap-1.5 text-sm font-bold text-[#7A5200]">
                              <Sparkles className="h-4 w-4" />
                              Trợ lý AI gợi ý chấm theo rubric
                            </span>
                            <button
                              type="button"
                              onClick={() => handleRequestAISuggestion(q)}
                              disabled={aiLoadingQuestionId === q.id}
                              className="studio-btn studio-btn-accent"
                            >
                              <Sparkles className="h-4 w-4" />
                              {aiLoadingQuestionId === q.id ? 'AI đang đọc bài…' : 'AI gợi ý điểm & nhận xét'}
                            </button>
                          </div>

                          {qRes?.aiExplanation && (
                            <div className="mt-2.5 space-y-1 text-sm text-[#172B4D]">
                              <div>
                                <strong>Điểm AI gợi ý:</strong>{' '}
                                <span className="font-mono font-bold text-[#1267E9]">
                                  {qRes.aiSuggestedScore}/{q.points}
                                </span>
                              </div>
                              <div>
                                <strong>Giải thích cho cô:</strong> {qRes.aiExplanation}
                              </div>
                            </div>
                          )}
                        </div>
                      )}

                      {/* Per-question comment */}
                      <div className="mt-3">
                        <label className={STUDIO_LABEL}>Nhận xét cho câu {idx + 1}</label>
                        <input
                          type="text"
                          value={qRes?.teacherComment || ''}
                          onChange={(e) =>
                            updateSingleResult(q.id, {
                              teacherComment: e.target.value,
                            })
                          }
                          placeholder="Lời khen hoặc hướng dẫn sửa sai cho học sinh…"
                          className={STUDIO_INPUT}
                        />
                      </div>
                    </section>
                  );
                })}

                {/* Overall comment & publish */}
                <section className="studio-card p-5 lg:sticky lg:bottom-4">
                  <label className={STUDIO_LABEL}>Nhận xét toàn bài</label>
                  <textarea
                    rows={3}
                    value={overallComment}
                    onChange={(e) => setOverallComment(e.target.value)}
                    placeholder="Lời khen và dặn dò chung cho bài làm của học sinh…"
                    className={`${STUDIO_INPUT} py-2`}
                  />
                  <div className="mt-4 flex flex-wrap justify-end gap-2">
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSaveGrading(false, true)}
                      className="studio-btn studio-btn-danger"
                    >
                      <RotateCcw className="h-4 w-4" />
                      Trả bài, yêu cầu sửa lại
                    </button>
                    <button
                      type="button"
                      disabled={saving}
                      onClick={() => handleSaveGrading(true, false)}
                      className="studio-btn bg-[#1F9D6B] text-white hover:bg-[#188A5D]"
                    >
                      <CheckCircle2 className="h-4 w-4" />
                      {saving ? 'Đang lưu…' : 'Hoàn tất chấm & công bố điểm'}
                    </button>
                  </div>
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
