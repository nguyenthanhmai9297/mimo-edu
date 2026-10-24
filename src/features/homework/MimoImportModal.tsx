import React, { useState } from 'react';
import { AlertTriangle, FileJson, X } from 'lucide-react';
import { PRACTICE_LEVEL_LABELS, PracticeLevel } from '../../types/domain';
import { countByLevel, MimoDataset } from './mimoImport';

interface MimoImportModalProps {
  dataset: MimoDataset;
  onCancel: () => void;
  onConfirm: (levels: PracticeLevel[]) => void;
}

const LEVEL_ORDER: PracticeLevel[] = ['nhan_biet', 'thong_hieu', 'van_dung', 'thu_thach'];

/** Lets the teacher pick which levels of a MimoEDU set become one homework draft. */
export const MimoImportModal: React.FC<MimoImportModalProps> = ({
  dataset,
  onCancel,
  onConfirm,
}) => {
  const counts = countByLevel(dataset);
  const available = LEVEL_ORDER.filter((l) => counts[l] > 0);
  const [selected, setSelected] = useState<PracticeLevel[]>(available);
  const unreviewed = dataset.questions.filter((q) => q.status && q.status !== 'approved').length;
  const selectedCount = selected.reduce((sum, l) => sum + counts[l], 0);

  const toggle = (level: PracticeLevel) =>
    setSelected((prev) =>
      prev.includes(level) ? prev.filter((l) => l !== level) : LEVEL_ORDER.filter((l) => l === level || prev.includes(l))
    );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#071A63]/40 backdrop-blur-[2px] p-4">
      <div className="cartoon-card w-full max-w-lg bg-white">
        <div className="flex items-center justify-between border-b border-[#EEF3F9] px-5 py-3">
          <div className="flex items-center gap-2">
            <FileJson className="h-5 w-5 text-[#1267E9]" />
            <h2 className="font-display text-base font-extrabold text-[#172B4D]">Nhập bộ câu hỏi MimoEDU</h2>
          </div>
          <button
            type="button"
            onClick={onCancel}
            aria-label="Đóng"
            className="rounded-lg border border-[#DCE7F3] p-1 hover:bg-[#F6FAFF]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-4 px-5 py-4">
          <div>
            <div className="font-display text-sm font-extrabold text-[#172B4D]">{dataset.title}</div>
            <div className="text-xs text-[#5E6C84]">
              {dataset.datasetId} · {dataset.questions.length} câu
            </div>
          </div>

          {unreviewed > 0 && (
            <div className="flex gap-2 rounded-xl border-2 border-amber-400 bg-amber-50 p-3 text-xs text-amber-900">
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
              <div>
                {unreviewed} câu chưa ở trạng thái đã duyệt
                {dataset.notes ? ` – ${dataset.notes}` : '.'} Hãy soát lại trước khi xuất bản đề.
              </div>
            </div>
          )}

          <div>
            <div className="mb-2 text-xs font-extrabold text-[#3B4A66]">Chọn mức độ đưa vào đề này:</div>
            <div className="grid grid-cols-2 gap-2">
              {available.map((level) => (
                <label
                  key={level}
                  className={`flex cursor-pointer items-center justify-between gap-2 rounded-xl border-2 px-3 py-2 text-xs font-bold ${
                    selected.includes(level)
                      ? 'border-blue-600 bg-blue-50 text-blue-900'
                      : 'border-[#DCE7F3] text-[#5E6C84]'
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={selected.includes(level)}
                      onChange={() => toggle(level)}
                      className="h-4 w-4"
                    />
                    {PRACTICE_LEVEL_LABELS[level]}
                  </span>
                  <span className="font-mono">{counts[level]} câu</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[11px] text-[#5E6C84]">
              Muốn mỗi mức độ thành một đề riêng: nhập lần lượt từng mức, lưu đề rồi nhập lại file.
              Điểm được chia đều để tổng là 10.
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-[#EEF3F9] px-5 py-3">
          <button
            type="button"
            onClick={onCancel}
            className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]"
          >
            Hủy
          </button>
          <button
            type="button"
            disabled={selected.length === 0}
            onClick={() => onConfirm(selected)}
            className="cartoon-button rounded-xl bg-[#1267E9] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
          >
            Mở {selectedCount} câu trong trình soạn
          </button>
        </div>
      </div>
    </div>
  );
};
