import React, { useRef, useState } from 'react';
import { Check, Crop, X } from 'lucide-react';
import { NormalizedBox } from './figureCrop';

interface FigureRecropModalProps {
  pageUrl: string;
  initialBox: NormalizedBox;
  onConfirm: (box: NormalizedBox) => void;
  onCancel: () => void;
}

/** Shows the original exam page; the teacher drags a rectangle around the figure. */
export const FigureRecropModal: React.FC<FigureRecropModalProps> = ({
  pageUrl,
  initialBox,
  onConfirm,
  onCancel,
}) => {
  const imgRef = useRef<HTMLImageElement>(null);
  const [box, setBox] = useState<NormalizedBox>(initialBox);
  const dragStart = useRef<[number, number] | null>(null);

  const toNormalized = (e: React.PointerEvent): [number, number] => {
    const rect = imgRef.current!.getBoundingClientRect();
    const x = ((e.clientX - rect.left) / rect.width) * 1000;
    const y = ((e.clientY - rect.top) / rect.height) * 1000;
    return [Math.min(1000, Math.max(0, x)), Math.min(1000, Math.max(0, y))];
  };

  const onPointerDown = (e: React.PointerEvent) => {
    e.preventDefault();
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
    dragStart.current = toNormalized(e);
  };

  const onPointerMove = (e: React.PointerEvent) => {
    if (!dragStart.current) return;
    const [x0, y0] = dragStart.current;
    const [x1, y1] = toNormalized(e);
    setBox([Math.min(x0, x1), Math.min(y0, y1), Math.max(x0, x1), Math.max(y0, y1)]);
  };

  const onPointerUp = () => {
    dragStart.current = null;
  };

  const valid = box[2] - box[0] > 5 && box[3] - box[1] > 5;

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-[#071A63]/40 backdrop-blur-[2px] p-4">
      <div className="cartoon-card flex max-h-[94vh] w-full max-w-3xl flex-col bg-white">
        <div className="flex items-center justify-between border-b border-[#EEF3F9] px-5 py-3">
          <div className="flex items-center gap-2">
            <Crop className="h-5 w-5 text-[#1267E9]" />
            <h2 className="font-display text-base font-extrabold text-[#172B4D]">Cắt lại hình từ đề gốc</h2>
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
        <p className="px-5 pt-3 text-xs text-[#5E6C84]">
          Kéo chuột (hoặc ngón tay) để khoanh vùng hình cần dùng. Khung xanh là vùng sẽ được cắt.
        </p>
        <div className="flex-1 overflow-auto p-4">
          <div
            className="relative mx-auto w-fit touch-none select-none"
            onPointerDown={onPointerDown}
            onPointerMove={onPointerMove}
            onPointerUp={onPointerUp}
          >
            <img
              ref={imgRef}
              src={pageUrl}
              alt="Trang đề gốc"
              draggable={false}
              className="block max-h-[70vh] w-auto max-w-full cursor-crosshair rounded-lg"
            />
            <div
              className="pointer-events-none absolute border-2 border-blue-600 bg-blue-500/10 shadow-[0_0_0_9999px_rgba(15,23,42,0.35)]"
              style={{
                left: `${box[0] / 10}%`,
                top: `${box[1] / 10}%`,
                width: `${(box[2] - box[0]) / 10}%`,
                height: `${(box[3] - box[1]) / 10}%`,
              }}
            />
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
            disabled={!valid}
            onClick={() => onConfirm(box)}
            className="cartoon-button flex items-center gap-1.5 rounded-xl bg-[#1267E9] px-4 py-2 text-xs font-extrabold text-white disabled:opacity-50"
          >
            <Check className="h-4 w-4" />
            Dùng vùng này
          </button>
        </div>
      </div>
    </div>
  );
};
