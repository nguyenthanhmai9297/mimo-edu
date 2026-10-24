import React, { useState } from 'react';
import { AlertTriangle, CheckCircle2, FileJson, Loader2, X, XCircle } from 'lucide-react';
import { findPracticeTopic, practiceSkillLabel } from '../../../data/practiceCatalog';
import { PRACTICE_LEVEL_LABELS } from '../../../types/domain';
import { PRACTICE_LEVELS } from '../../../types/practice';
import { ImportValidation } from '../../../utils/practiceEngine';
import { PracticeText } from '../PracticeText';

interface PracticeImportModalProps {
  fileName: string;
  validation: ImportValidation;
  onCancel: () => void;
  onConfirm: (replaceConflicts: boolean) => Promise<void>;
}

/** Shows what a question file contains and every problem found, before anything is written. */
export const PracticeImportModal: React.FC<PracticeImportModalProps> = ({
  fileName,
  validation,
  onCancel,
  onConfirm,
}) => {
  const { dataset, questions, errors, warnings, conflictIds } = validation;
  const [replaceConflicts, setReplaceConflicts] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [previewIdx, setPreviewIdx] = useState(0);
  const topic = dataset ? findPracticeTopic(dataset.topicId) : undefined;
  const canImport = errors.length === 0 && (conflictIds.length === 0 || replaceConflicts);
  const preview = questions[previewIdx];

  const levelCounts = PRACTICE_LEVELS.map((l) => ({ level: l, count: questions.filter((q) => q.level === l).length }));
  const skills = [...new Set(questions.map((q) => q.skillId))];

  const confirm = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      await onConfirm(replaceConflicts);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : 'Không nhập được bộ câu hỏi.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071A63]/40 backdrop-blur-[2px] p-4">
      <div className="cartoon-card flex max-h-[92vh] w-full max-w-3xl flex-col bg-white">
        <div className="flex items-center justify-between border-b border-[#EEF3F9] px-5 py-3">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-[#1267E9]" />
            <h2 className="font-display text-base font-extrabold text-[#172B4D]">Kiểm tra tệp trước khi nhập</h2>
          </div>
          <button type="button" onClick={onCancel} aria-label="Đóng" className="rounded-lg border border-[#DCE7F3] p-1 hover:bg-[#F6FAFF]">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto px-5 py-4 text-sm">
          <div className="rounded-xl border border-[#DCE7F3] bg-amber-50 p-3">
            <div className="text-xs text-[#5E6C84]">{fileName}</div>
            <div className="font-display font-extrabold text-[#172B4D]">{dataset?.title || 'Không đọc được tiêu đề'}</div>
            <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-xs text-[#3B4A66]">
              <span>Mã bộ: <b className="font-mono">{dataset?.id || '—'}</b></span>
              <span>Chuyên đề: <b>{topic ? `${topic.id}. ${topic.name}` : dataset?.topicId || '—'}</b></span>
              <span>{questions.length} câu · {skills.length} kĩ năng</span>
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {levelCounts.map(({ level, count }) => (
                <span key={level} className="rounded-lg bg-white px-2 py-0.5 text-[11px] font-bold text-[#3B4A66]">
                  {PRACTICE_LEVEL_LABELS[level]}: {count}
                </span>
              ))}
            </div>
          </div>

          {errors.length === 0 ? (
            <div className="flex items-center gap-2 rounded-xl border-2 border-emerald-500 bg-emerald-50 p-3 text-xs font-bold text-emerald-800">
              <CheckCircle2 className="h-4 w-4" /> Không phát hiện lỗi dữ liệu.
            </div>
          ) : (
            <div className="rounded-xl border-2 border-rose-400 bg-rose-50 p-3 text-xs text-rose-800">
              <div className="mb-1 flex items-center gap-2 font-extrabold">
                <XCircle className="h-4 w-4" /> {errors.length} lỗi – cần sửa tệp trước khi nhập
              </div>
              <ul className="max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                {errors.map((e, i) => (
                  <li key={i}>{e.questionId ? <b>{e.questionId}: </b> : null}{e.message}</li>
                ))}
              </ul>
            </div>
          )}

          {warnings.length > 0 && (
            <div className="rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
              <div className="mb-1 flex items-center gap-2 font-extrabold">
                <AlertTriangle className="h-4 w-4" /> {warnings.length} lưu ý
              </div>
              <ul className="max-h-32 list-disc space-y-0.5 overflow-y-auto pl-5">
                {warnings.map((w, i) => (
                  <li key={i}>{w.questionId ? <b>{w.questionId}: </b> : null}{w.message}</li>
                ))}
              </ul>
            </div>
          )}

          {conflictIds.length > 0 && errors.length === 0 && (
            <label className="flex cursor-pointer items-start gap-2 rounded-xl border border-[#DCE7F3] p-3 text-xs">
              <input type="checkbox" checked={replaceConflicts} onChange={(e) => setReplaceConflicts(e.target.checked)} className="mt-0.5 h-4 w-4" />
              <span>
                <b>Thay thế {conflictIds.length} câu trùng mã bằng bản trong tệp.</b> Các câu này sẽ trở về trạng thái
                &ldquo;Chờ duyệt&rdquo; và học sinh không thấy cho tới khi được duyệt lại.
              </span>
            </label>
          )}

          {preview && (
            <div className="rounded-xl border-2 border-[#EEF3F9] p-3">
              <div className="mb-2 flex items-center justify-between text-xs">
                <span className="font-extrabold text-[#3B4A66]">
                  Xem trước: {preview.id} · {PRACTICE_LEVEL_LABELS[preview.level] ?? preview.level} · {practiceSkillLabel(preview.skillId)}
                </span>
                <span className="flex gap-1">
                  <button type="button" disabled={previewIdx === 0} onClick={() => setPreviewIdx((i) => i - 1)} className="rounded border px-2 disabled:opacity-30">‹</button>
                  <span className="font-mono">{previewIdx + 1}/{questions.length}</span>
                  <button type="button" disabled={previewIdx >= questions.length - 1} onClick={() => setPreviewIdx((i) => i + 1)} className="rounded border px-2 disabled:opacity-30">›</button>
                </span>
              </div>
              <PracticeText text={preview.prompt} />
              <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {preview.options.map((o) => (
                  <div key={o.id} className={`rounded-lg border px-2.5 py-1.5 text-xs ${preview.correctAnswers.includes(o.id) ? 'border-emerald-500 bg-emerald-50 font-bold' : 'border-[#EEF3F9]'}`}>
                    {o.id}. {o.text}
                  </div>
                ))}
              </div>
              {preview.explanation && (
                <div className="mt-2 rounded-lg bg-[#F6FAFF] p-2 text-xs text-[#3B4A66]"><b>Lời giải:</b> {preview.explanation}</div>
              )}
            </div>
          )}

          <p className="text-[11px] text-[#5E6C84]">
            Câu hỏi được nhập ở trạng thái <b>Chờ duyệt</b> trong bộ <b>Nháp</b>. Học sinh chỉ thấy câu đã duyệt trong bộ đã xuất bản.
          </p>
          {saveError && <div className="rounded-xl bg-rose-50 p-3 text-xs font-bold text-rose-700">{saveError}</div>}
        </div>

        <div className="flex justify-end gap-2 border-t border-[#EEF3F9] px-5 py-3">
          <button type="button" onClick={onCancel} className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]">Hủy</button>
          <button
            type="button"
            disabled={!canImport || saving}
            onClick={confirm}
            className="cartoon-button flex items-center gap-1.5 rounded-xl bg-[#1267E9] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Nhập {questions.length} câu (chờ duyệt)
          </button>
        </div>
      </div>
    </div>
  );
};
