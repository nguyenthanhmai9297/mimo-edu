import React, { useState } from 'react';
import { EyeOff, ZoomIn, ZoomOut } from 'lucide-react';
import { SourceFile } from './AIImportModal';

interface SourceDocumentPanelProps {
  files: SourceFile[];
  onHide: () => void;
}

/**
 * Sticky panel showing the original exam pages next to the editor so the
 * teacher can check AI-transcribed questions line by line.
 */
export const SourceDocumentPanel: React.FC<SourceDocumentPanelProps> = ({
  files,
  onHide,
}) => {
  const [activeIdx, setActiveIdx] = useState(0);
  const [zoom, setZoom] = useState(1);
  const active = files[Math.min(activeIdx, files.length - 1)];

  return (
    <aside className="cartoon-card flex flex-col bg-white lg:sticky lg:top-36 lg:max-h-[calc(100vh-10rem)]">
      <div className="flex items-center justify-between gap-2 border-b border-[#EEF3F9] px-4 py-2.5">
        <div className="text-xs font-extrabold text-[#172B4D]">
          ĐỀ GỐC · đối chiếu trước khi lưu
        </div>
        <div className="flex items-center gap-1">
          {active?.mimeType !== 'application/pdf' && (
            <>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, z - 0.25))}
                aria-label="Thu nhỏ"
                className="rounded p-1 hover:bg-[#F6FAFF]"
              >
                <ZoomOut className="h-4 w-4" />
              </button>
              <span className="w-10 text-center font-mono text-[11px] text-[#5E6C84]">
                {Math.round(zoom * 100)}%
              </span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(3, z + 0.25))}
                aria-label="Phóng to"
                className="rounded p-1 hover:bg-[#F6FAFF]"
              >
                <ZoomIn className="h-4 w-4" />
              </button>
            </>
          )}
          <button
            type="button"
            onClick={onHide}
            className="ml-1 flex items-center gap-1 rounded-lg border border-[#DCE7F3] px-2 py-1 text-[11px] font-bold text-[#3B4A66] hover:bg-[#F6FAFF]"
          >
            <EyeOff className="h-3.5 w-3.5" />
            Ẩn
          </button>
        </div>
      </div>

      {files.length > 1 && (
        <div className="flex gap-1.5 overflow-x-auto border-b border-[#EEF3F9] px-4 py-2">
          {files.map((f, idx) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setActiveIdx(idx)}
              title={f.name}
              className={`shrink-0 rounded-lg border-2 px-2.5 py-1 text-[11px] font-bold ${
                idx === activeIdx
                  ? 'border-blue-600 bg-blue-50 text-[#2563EB]'
                  : 'border-[#DCE7F3] text-[#5E6C84] hover:border-slate-500'
              }`}
            >
              Trang {idx + 1}
            </button>
          ))}
        </div>
      )}

      <div className="min-h-[60vh] flex-1 overflow-auto bg-[#F6FAFF] p-2">
        {active &&
          (active.mimeType === 'application/pdf' ? (
            <iframe
              key={active.id}
              src={active.objectUrl}
              title={active.name}
              className="h-[70vh] w-full rounded-lg bg-white lg:h-full"
            />
          ) : (
            <img
              key={active.id}
              src={active.objectUrl}
              alt={active.name}
              style={{ width: `${zoom * 100}%` }}
              className="mx-auto max-w-none rounded-lg bg-white shadow"
            />
          ))}
      </div>
    </aside>
  );
};
