import React, { useRef, useState } from 'react';
import { Box, Check, X, Camera, RotateCcw } from 'lucide-react';
import {
  Geometry3DSettings,
  Geometry3DStudio,
  SolidShapeType,
} from './Geometry3DStudio';

interface Geometry3DModalProps {
  isOpen: boolean;
  onClose: () => void;
  onInsertImage: (dataUrl: string, caption?: string) => void;
}

const SHAPES: { type: SolidShapeType; label: string; short: string }[] = [
  { type: 'LP', label: 'Lập phương', short: 'LP' },
  { type: 'HCN', label: 'Hộp chữ nhật', short: 'HCN' },
  { type: 'CHOP', label: 'Chóp tứ giác', short: 'CHÓP' },
  { type: 'TRU', label: 'Hình trụ', short: 'TRỤ' },
  { type: 'CAU', label: 'Hình cầu', short: 'CẦU' },
  { type: 'NON', label: 'Hình nón', short: 'NÓN' },
  { type: 'TU', label: 'Tứ diện đều', short: 'TỨ' },
  { type: 'LANG_TRU', label: 'Lăng trụ', short: 'TRÒN' },
];

export const Geometry3DModal: React.FC<Geometry3DModalProps> = ({
  isOpen,
  onClose,
  onInsertImage,
}) => {
  const [settings, setSettings] = useState<Geometry3DSettings>({
    shapeType: 'HCN',
    showVertices: true,
    showEdges: true,
    showFaces: true,
    showLabels: true,
    mode: 'explore',
    opacity: 0.45,
    length: 5,
    width: 4,
    height: 3,
    radius: 4,
    unfoldProgress: 0,
    fillProgress: 50,
  });

  const [isDarkTheme, setIsDarkTheme] = useState(false);
  const studioContainerRef = useRef<HTMLDivElement>(null);

  if (!isOpen) return null;

  const handleCaptureAndInsert = () => {
    const canvas = studioContainerRef.current?.querySelector('canvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const shapeLabel = SHAPES.find((s) => s.type === settings.shapeType)?.label || 'Hình 3D';
    onInsertImage(dataUrl, `Hình minh họa 3D: ${shapeLabel}`);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-3 sm:p-4 backdrop-blur-xs">
      <div className="flex h-[90vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border-3 border-slate-900 bg-white shadow-2xl">
        {/* Modal Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-900 bg-indigo-50 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-600 text-white shadow-sm">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <h2 className="font-display text-base font-extrabold text-slate-900">
                Chèn Hình Học Không Gian 3D Vào Câu Hỏi
              </h2>
              <p className="text-xs text-slate-600">
                Xoay góc nhìn 3D trực quan, tùy chỉnh kích thước rồi ấn chèn vào bài tập
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-200 hover:text-slate-900 transition-colors"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="flex flex-1 flex-col overflow-hidden md:flex-row">
          {/* Controls Sidebar */}
          <div className="w-full border-b-2 border-slate-900 bg-slate-50 p-4 overflow-y-auto md:w-80 md:border-b-0 md:border-r-2 shrink-0">
            {/* Shapes selection */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-700">
                1. Chọn Khối Hình 3D
              </label>
              <div className="grid grid-cols-4 gap-1.5">
                {SHAPES.map((shape) => {
                  const isActive = settings.shapeType === shape.type;
                  return (
                    <button
                      key={shape.type}
                      type="button"
                      onClick={() =>
                        setSettings((prev) => ({ ...prev, shapeType: shape.type }))
                      }
                      className={`flex flex-col items-center justify-center rounded-xl border-2 py-2 px-1 text-center transition-all ${
                        isActive
                          ? 'border-indigo-600 bg-indigo-600 font-extrabold text-white shadow-md'
                          : 'border-slate-300 bg-white font-bold text-slate-700 hover:border-slate-400'
                      }`}
                    >
                      <span className="text-[11px] leading-tight">{shape.short}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Display Toggles */}
            <div className="mb-4">
              <label className="mb-2 block text-xs font-black uppercase tracking-wider text-slate-700">
                2. Thành Phần Hiển Thị
              </label>
              <div className="grid grid-cols-2 gap-2">
                {[
                  { key: 'showVertices' as const, label: 'Đỉnh' },
                  { key: 'showEdges' as const, label: 'Cạnh viền' },
                  { key: 'showFaces' as const, label: 'Mặt khối' },
                  { key: 'showLabels' as const, label: 'Nhãn A, B, C' },
                ].map((item) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() =>
                      setSettings((prev) => ({
                        ...prev,
                        [item.key]: !prev[item.key],
                      }))
                    }
                    className={`flex items-center justify-between rounded-lg border-2 px-2.5 py-1.5 text-xs font-bold transition-all ${
                      settings[item.key]
                        ? 'border-indigo-500 bg-indigo-50 text-indigo-900'
                        : 'border-slate-200 bg-white text-slate-400'
                    }`}
                  >
                    <span>{item.label}</span>
                    <span
                      className={`flex h-4 w-4 items-center justify-center rounded text-[10px] ${
                        settings[item.key]
                          ? 'bg-indigo-600 text-white'
                          : 'bg-slate-200 text-transparent'
                      }`}
                    >
                      ✓
                    </span>
                  </button>
                ))}
              </div>
            </div>

            {/* Sliders */}
            <div className="space-y-3">
              <label className="block text-xs font-black uppercase tracking-wider text-slate-700">
                3. Kích Thước
              </label>

              {(settings.shapeType === 'LP' ||
                settings.shapeType === 'HCN' ||
                settings.shapeType === 'CHOP' ||
                settings.shapeType === 'TU' ||
                settings.shapeType === 'LANG_TRU') && (
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>{settings.shapeType === 'LP' || settings.shapeType === 'TU' ? 'Cạnh' : 'Chiều dài (a)'}</span>
                    <span className="font-mono text-indigo-600">{settings.length}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="0.5"
                    value={settings.length}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, length: Number(e.target.value) }))
                    }
                    className="h-2 w-full cursor-pointer accent-indigo-600"
                  />
                </div>
              )}

              {settings.shapeType === 'HCN' && (
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Chiều rộng (b)</span>
                    <span className="font-mono text-indigo-600">{settings.width}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="0.5"
                    value={settings.width}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, width: Number(e.target.value) }))
                    }
                    className="h-2 w-full cursor-pointer accent-indigo-600"
                  />
                </div>
              )}

              {(settings.shapeType === 'HCN' ||
                settings.shapeType === 'CHOP' ||
                settings.shapeType === 'TRU' ||
                settings.shapeType === 'NON' ||
                settings.shapeType === 'LANG_TRU') && (
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Chiều cao (h)</span>
                    <span className="font-mono text-indigo-600">{settings.height}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="0.5"
                    value={settings.height}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, height: Number(e.target.value) }))
                    }
                    className="h-2 w-full cursor-pointer accent-indigo-600"
                  />
                </div>
              )}

              {(settings.shapeType === 'TRU' ||
                settings.shapeType === 'CAU' ||
                settings.shapeType === 'NON') && (
                <div>
                  <div className="flex justify-between text-xs font-bold text-slate-700">
                    <span>Bán kính (r)</span>
                    <span className="font-mono text-indigo-600">{settings.radius}</span>
                  </div>
                  <input
                    type="range"
                    min="1"
                    max="8"
                    step="0.5"
                    value={settings.radius}
                    onChange={(e) =>
                      setSettings((prev) => ({ ...prev, radius: Number(e.target.value) }))
                    }
                    className="h-2 w-full cursor-pointer accent-indigo-600"
                  />
                </div>
              )}

              <div>
                <div className="flex justify-between text-xs font-bold text-slate-700">
                  <span>Độ trong suốt</span>
                  <span className="font-mono text-indigo-600">
                    {Math.round(settings.opacity * 100)}%
                  </span>
                </div>
                <input
                  type="range"
                  min="0.1"
                  max="1.0"
                  step="0.05"
                  value={settings.opacity}
                  onChange={(e) =>
                    setSettings((prev) => ({ ...prev, opacity: Number(e.target.value) }))
                  }
                  className="h-2 w-full cursor-pointer accent-indigo-600"
                />
              </div>

              <div>
                <label className="flex items-center gap-2 cursor-pointer pt-1 text-xs font-bold text-slate-700">
                  <input
                    type="checkbox"
                    checked={isDarkTheme}
                    onChange={(e) => setIsDarkTheme(e.target.checked)}
                    className="rounded border-slate-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Nền tối (Dark background)</span>
                </label>
              </div>
            </div>
          </div>

          {/* 3D Canvas Preview */}
          <div
            ref={studioContainerRef}
            className="relative flex-1 bg-slate-900 min-h-[300px] flex items-center justify-center overflow-hidden"
          >
            <Geometry3DStudio
              settings={settings}
              isDarkTheme={isDarkTheme}
              className="h-full w-full"
            />
            <div className="pointer-events-none absolute bottom-3 left-3 rounded-lg bg-black/60 px-3 py-1.5 text-[11px] font-semibold text-white/90 backdrop-blur-xs">
              💡 Dùng chuột kéo để xoay 360°, cuộn để phóng to / thu nhỏ
            </div>
          </div>
        </div>

        {/* Modal Footer */}
        <div className="flex items-center justify-between border-t-2 border-slate-900 bg-slate-100 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border-2 border-slate-300 bg-white px-4 py-2 text-xs font-bold text-slate-700 hover:bg-slate-50 transition-colors"
          >
            Hủy bỏ
          </button>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCaptureAndInsert}
              className="flex items-center gap-2 rounded-xl border-2 border-slate-900 bg-indigo-600 px-5 py-2 text-xs font-extrabold text-white shadow-[2px_2px_0px_#0f172a] hover:bg-indigo-700 active:translate-y-0.5 transition-all"
            >
              <Camera className="h-4 w-4" />
              Chèn Vào Câu Hỏi
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
