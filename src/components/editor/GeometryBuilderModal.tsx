import React, { useState } from 'react';
import {
  Circle,
  Compass,
  Plus,
  RotateCcw,
  Trash2,
  Triangle,
  X,
} from 'lucide-react';
import {
  GeometryDrawingData,
  GeometryElement,
  GeometryElementType,
  GeometryPoint,
} from '../../types/domain';
import { GeometryRenderer } from './GeometryRenderer';

interface GeometryBuilderModalProps {
  initialDrawing?: GeometryDrawingData;
  onSave: (drawing: GeometryDrawingData) => void;
  onClose: () => void;
}

const DEFAULT_DRAWING: GeometryDrawingData = {
  width: 360,
  height: 220,
  points: [
    { id: 'pt_A', label: 'A', x: 70, y: 175 },
    { id: 'pt_B', label: 'B', x: 70, y: 45 },
    { id: 'pt_C', label: 'C', x: 260, y: 175 },
  ],
  elements: [
    {
      id: 'el_1',
      type: 'triangle',
      pointIds: ['pt_A', 'pt_B', 'pt_C'],
      color: '#2563EB',
    },
    {
      id: 'el_2',
      type: 'angle',
      pointIds: ['pt_B', 'pt_A', 'pt_C'],
      angleValue: '90°',
    },
  ],
  caption: 'Tam giác ABC vuông tại A',
};

export const GeometryBuilderModal: React.FC<GeometryBuilderModalProps> = ({
  initialDrawing,
  onSave,
  onClose,
}) => {
  const [drawing, setDrawing] = useState<GeometryDrawingData>(
    initialDrawing || DEFAULT_DRAWING
  );
  const [newPointLabel, setNewPointLabel] = useState('D');
  const [newPointX, setNewPointX] = useState(180);
  const [newPointY, setNewPointY] = useState(100);

  const [newElType, setNewElType] = useState<GeometryElementType>('segment');
  const [selectedPtIds, setSelectedPtIds] = useState<string[]>([]);
  const [angleText, setAngleText] = useState('60°');
  const [isDashed, setIsDashed] = useState(false);

  const applyPreset = (
    preset: 'right_triangle' | 'rectangle' | 'circle_center'
  ) => {
    if (preset === 'right_triangle') {
      setDrawing(DEFAULT_DRAWING);
    } else if (preset === 'rectangle') {
      setDrawing({
        width: 360,
        height: 220,
        points: [
          { id: 'pt_A', label: 'A', x: 70, y: 55 },
          { id: 'pt_B', label: 'B', x: 270, y: 55 },
          { id: 'pt_C', label: 'C', x: 270, y: 175 },
          { id: 'pt_D', label: 'D', x: 70, y: 175 },
        ],
        elements: [
          {
            id: 'el_rect',
            type: 'quadrilateral',
            pointIds: ['pt_A', 'pt_B', 'pt_C', 'pt_D'],
            color: '#2563EB',
          },
          {
            id: 'el_diag',
            type: 'segment',
            pointIds: ['pt_A', 'pt_C'],
            color: '#F97316',
            dashed: true,
          },
        ],
        caption: 'Hình chữ nhật ABCD và đường chéo AC',
      });
    } else if (preset === 'circle_center') {
      setDrawing({
        width: 360,
        height: 220,
        points: [
          { id: 'pt_O', label: 'O', x: 180, y: 110 },
          { id: 'pt_A', label: 'A', x: 255, y: 110 },
          { id: 'pt_B', label: 'B', x: 180, y: 35 },
        ],
        elements: [
          {
            id: 'el_cir',
            type: 'circle',
            pointIds: ['pt_O', 'pt_A'],
            color: '#059669',
          },
          {
            id: 'el_rad1',
            type: 'segment',
            pointIds: ['pt_O', 'pt_A'],
            color: '#1E293B',
          },
          {
            id: 'el_rad2',
            type: 'segment',
            pointIds: ['pt_O', 'pt_B'],
            color: '#1E293B',
          },
        ],
        caption: 'Đường tròn tâm O bán kính OA, OB',
      });
    }
    setSelectedPtIds([]);
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = Math.round(
      ((e.clientX - rect.left) / rect.width) * drawing.width
    );
    const y = Math.round(
      ((e.clientY - rect.top) / rect.height) * drawing.height
    );
    setNewPointX(Math.max(15, Math.min(drawing.width - 15, x)));
    setNewPointY(Math.max(15, Math.min(drawing.height - 15, y)));
  };

  const addPoint = () => {
    const label = newPointLabel.trim().toUpperCase() || 'P';
    const pt: GeometryPoint = {
      id: `pt_${Date.now()}`,
      label,
      x: newPointX,
      y: newPointY,
    };
    setDrawing((prev) => ({
      ...prev,
      points: [...prev.points, pt],
    }));
    const nextChar = String.fromCharCode(
      Math.min(90, label.charCodeAt(0) + 1)
    );
    setNewPointLabel(nextChar);
  };

  const removePoint = (ptId: string) => {
    setDrawing((prev) => ({
      ...prev,
      points: prev.points.filter((p) => p.id !== ptId),
      elements: prev.elements.filter((el) => !el.pointIds.includes(ptId)),
    }));
    setSelectedPtIds((prev) => prev.filter((id) => id !== ptId));
  };

  const toggleSelectPoint = (ptId: string) => {
    setSelectedPtIds((prev) =>
      prev.includes(ptId) ? prev.filter((id) => id !== ptId) : [...prev, ptId]
    );
  };

  const addElement = () => {
    const minRequired =
      newElType === 'triangle' || newElType === 'angle'
        ? 3
        : newElType === 'quadrilateral'
        ? 4
        : 2;

    if (selectedPtIds.length < minRequired) {
      return;
    }

    const newEl: GeometryElement = {
      id: `el_${Date.now()}`,
      type: newElType,
      pointIds: selectedPtIds.slice(0, minRequired),
      color: '#2563EB',
      dashed: isDashed,
      ...(newElType === 'angle' ? { angleValue: angleText } : {}),
    };

    setDrawing((prev) => ({
      ...prev,
      elements: [...prev.elements, newEl],
    }));
    setSelectedPtIds([]);
  };

  const removeElement = (elId: string) => {
    setDrawing((prev) => ({
      ...prev,
      elements: prev.elements.filter((e) => e.id !== elId),
    }));
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-xs">
      <div className="cartoon-card flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden bg-[#FFFDF7]">
        {/* Header */}
        <div className="flex items-center justify-between border-b-2 border-slate-800 bg-amber-100 px-6 py-4">
          <div className="flex items-center gap-2.5">
            <Compass className="h-6 w-6 text-slate-900" />
            <h3 className="font-display text-lg font-extrabold text-slate-900">
              Bảng Vẽ Hình Học Phẳng
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border-2 border-slate-800 bg-white p-1.5 text-slate-700 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Body */}
        <div className="grid flex-1 grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-12">
          {/* Left Stage: Interactive Canvas Preview */}
          <div className="flex flex-col gap-4 lg:col-span-6">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-slate-600">
                Mẫu nhanh:
              </span>
              <button
                type="button"
                onClick={() => applyPreset('right_triangle')}
                className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-800"
              >
                <Triangle className="h-3.5 w-3.5 text-blue-600" />
                Tam giác vuông
              </button>
              <button
                type="button"
                onClick={() => applyPreset('rectangle')}
                className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-800"
              >
                Hình chữ nhật
              </button>
              <button
                type="button"
                onClick={() => applyPreset('circle_center')}
                className="cartoon-button flex items-center gap-1 rounded-lg bg-white px-2.5 py-1 text-xs font-bold text-slate-800"
              >
                <Circle className="h-3.5 w-3.5 text-emerald-600" />
                Đường tròn tâm O
              </button>
            </div>

            <div
              onClick={handleCanvasClick}
              className="cursor-crosshair"
              title="Nhấn vào vùng vẽ để lấy tọa độ (X, Y) cho điểm mới"
            >
              <GeometryRenderer drawing={drawing} className="w-full" />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold text-slate-700">
                Chú thích hình vẽ
              </label>
              <input
                type="text"
                value={drawing.caption || ''}
                onChange={(e) =>
                  setDrawing((prev) => ({ ...prev, caption: e.target.value }))
                }
                placeholder="Ví dụ: Hình 1 - Tam giác ABC vuông tại A"
                className="w-full rounded-xl border-2 border-slate-800 bg-white px-3 py-2 text-sm focus:outline-none"
              />
            </div>
          </div>

          {/* Right Deck: Point & Shape Controls */}
          <div className="flex flex-col gap-4 lg:col-span-6">
            {/* Step 1: Points */}
            <div className="rounded-2xl border-2 border-slate-800 bg-white p-4">
              <h4 className="font-display text-sm font-bold text-slate-900">
                1. Quản lý Điểm (Nhấn lên hình để chọn tọa độ)
              </h4>
              <div className="mt-2.5 grid grid-cols-4 gap-2">
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">
                    Tên điểm
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={newPointLabel}
                    onChange={(e) => setNewPointLabel(e.target.value)}
                    className="w-full rounded-lg border-2 border-slate-800 px-2 py-1.5 text-sm font-bold"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">
                    Tọa độ X
                  </label>
                  <input
                    type="number"
                    value={newPointX}
                    onChange={(e) => setNewPointX(Number(e.target.value))}
                    className="w-full rounded-lg border-2 border-slate-800 px-2 py-1.5 font-mono text-sm"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold text-slate-600">
                    Tọa độ Y
                  </label>
                  <input
                    type="number"
                    value={newPointY}
                    onChange={(e) => setNewPointY(Number(e.target.value))}
                    className="w-full rounded-lg border-2 border-slate-800 px-2 py-1.5 font-mono text-sm"
                  />
                </div>
                <div className="flex items-end">
                  <button
                    type="button"
                    onClick={addPoint}
                    className="cartoon-button flex w-full items-center justify-center gap-1 rounded-lg bg-blue-600 px-2 py-1.5 text-xs font-bold text-white"
                  >
                    <Plus className="h-4 w-4" />
                    Thêm
                  </button>
                </div>
              </div>

              {/* Point chips to select for connecting */}
              <div className="mt-3">
                <p className="mb-1.5 text-xs text-slate-600">
                  Chọn các điểm theo thứ tự để nối hình ({selectedPtIds.length}{' '}
                  điểm đang chọn):
                </p>
                <div className="flex flex-wrap gap-1.5">
                  {drawing.points.map((pt) => {
                    const selectedIdx = selectedPtIds.indexOf(pt.id);
                    const isSelected = selectedIdx !== -1;
                    return (
                      <div
                        key={pt.id}
                        className={`flex items-center gap-1 rounded-lg border-2 border-slate-800 px-2 py-1 text-xs font-bold ${
                          isSelected
                            ? 'bg-amber-300 text-slate-900'
                            : 'bg-slate-50 text-slate-700'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleSelectPoint(pt.id)}
                          className="font-mono"
                        >
                          {pt.label} ({pt.x},{pt.y})
                          {isSelected ? ` [#${selectedIdx + 1}]` : ''}
                        </button>
                        <button
                          type="button"
                          onClick={() => removePoint(pt.id)}
                          className="ml-1 text-rose-600 hover:text-rose-800"
                          title="Xóa điểm"
                        >
                          ×
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* Step 2: Elements */}
            <div className="rounded-2xl border-2 border-slate-800 bg-white p-4">
              <h4 className="font-display text-sm font-bold text-slate-900">
                2. Dựng Đối Tượng Hình Học Từ Các Điểm Đã Chọn
              </h4>
              <div className="mt-2.5 grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-600">
                    Loại hình học
                  </label>
                  <select
                    value={newElType}
                    onChange={(e) =>
                      setNewElType(e.target.value as GeometryElementType)
                    }
                    className="mt-1 w-full rounded-lg border-2 border-slate-800 bg-white px-2.5 py-1.5 text-sm font-medium"
                  >
                    <option value="segment">Đoạn thẳng (2 điểm)</option>
                    <option value="line">Đường thẳng (2 điểm)</option>
                    <option value="ray">Tia (2 điểm: gốc → hướng)</option>
                    <option value="angle">Góc (3 điểm: cạnh - đỉnh - cạnh)</option>
                    <option value="triangle">Tam giác (3 điểm)</option>
                    <option value="quadrilateral">Tứ giác (4 điểm)</option>
                    <option value="circle">Đường tròn (2 điểm: tâm → bán kính)</option>
                  </select>
                </div>

                <div className="flex flex-col justify-end gap-2">
                  {newElType === 'angle' && (
                    <input
                      type="text"
                      value={angleText}
                      onChange={(e) => setAngleText(e.target.value)}
                      placeholder="Số đo góc, VD: 90°"
                      className="w-full rounded-lg border-2 border-slate-800 px-2.5 py-1 text-sm"
                    />
                  )}
                  <label className="flex items-center gap-2 text-xs font-semibold text-slate-700">
                    <input
                      type="checkbox"
                      checked={isDashed}
                      onChange={(e) => setIsDashed(e.target.checked)}
                      className="h-4 w-4 rounded border-slate-800"
                    />
                    Nét đứt (đường phụ / đường cao)
                  </label>
                </div>
              </div>

              <button
                type="button"
                onClick={addElement}
                className="cartoon-button mt-3 w-full rounded-xl bg-emerald-600 px-3 py-2 text-xs font-bold text-white"
              >
                + Vẽ đối tượng từ các điểm đang chọn
              </button>

              {/* Existing Elements List */}
              <div className="mt-3 max-h-32 space-y-1 overflow-y-auto">
                {drawing.elements.map((el, idx) => {
                  const labels = el.pointIds
                    .map(
                      (pid) =>
                        drawing.points.find((p) => p.id === pid)?.label || '?'
                    )
                    .join('');
                  return (
                    <div
                      key={el.id}
                      className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs"
                    >
                      <span>
                        {idx + 1}. <strong>{el.type}</strong> ({labels})
                        {el.dashed ? ' · nét đứt' : ''}
                        {el.angleValue ? ` · ${el.angleValue}` : ''}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeElement(el.id)}
                        className="text-rose-600 hover:text-rose-800"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between border-t-2 border-slate-800 bg-white px-6 py-4">
          <button
            type="button"
            onClick={() =>
              setDrawing({ width: 360, height: 220, points: [], elements: [] })
            }
            className="cartoon-button flex items-center gap-1.5 rounded-xl bg-slate-100 px-3.5 py-2 text-xs font-bold text-slate-700"
          >
            <RotateCcw className="h-4 w-4" />
            Làm mới trống
          </button>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onClose}
              className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-slate-700"
            >
              Hủy
            </button>
            <button
              type="button"
              onClick={() => onSave(drawing)}
              className="cartoon-button rounded-xl bg-blue-600 px-5 py-2 text-xs font-bold text-white"
            >
              Chèn hình vào nội dung
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
