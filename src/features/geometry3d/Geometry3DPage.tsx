import React, { useRef, useState } from 'react';
import {
  Box,
  Camera,
  Check,
  Compass,
  Copy,
  Download,
  Eye,
  Layers,
  Moon,
  RotateCcw,
  Sparkles,
  Sun,
  Volume2,
} from 'lucide-react';
import {
  Geometry3DSettings,
  Geometry3DStudio,
  SolidShapeType,
} from '../../components/geometry3d/Geometry3DStudio';

const SHAPE_BUTTONS: { type: SolidShapeType; label: string; short: string; title: string }[] = [
  { type: 'LP', label: 'Lập Phương', short: 'LP', title: 'HÌNH LẬP PHƯƠNG' },
  { type: 'HCN', label: 'Hộp Chữ Nhật', short: 'HCN', title: 'HÌNH HỘP CHỮ NHẬT' },
  { type: 'CHOP', label: 'Hình Chóp', short: 'CHÓP', title: 'HÌNH CHÓP TỨ GIÁC' },
  { type: 'TRU', label: 'Hình Trụ', short: 'TRỤ', title: 'HÌNH TRỤ TRÒN XOAY' },
  { type: 'CAU', label: 'Hình Cầu', short: 'CẦU', title: 'HÌNH CẦU' },
  { type: 'NON', label: 'Hình Nón', short: 'NÓN', title: 'HÌNH NÓN TRÒN XOAY' },
  { type: 'TU', label: 'Tứ Diện', short: 'TỨ', title: 'HÌNH TỨ DIỆN ĐỀU' },
  { type: 'LANG_TRU', label: 'Lăng Trụ', short: 'TRÒN', title: 'HÌNH LĂNG TRỤ TAM GIÁC' },
];

export const Geometry3DPage: React.FC = () => {
  const [isDarkTheme, setIsDarkTheme] = useState(true);
  const [copied, setCopied] = useState(false);
  const [snapshotToast, setSnapshotToast] = useState<string | null>(null);

  const [settings, setSettings] = useState<Geometry3DSettings>({
    shapeType: 'HCN',
    showVertices: true,
    showEdges: true,
    showFaces: true,
    showLabels: true,
    mode: 'volume',
    opacity: 0.35,
    length: 5,
    width: 4,
    height: 3,
    radius: 4,
    unfoldProgress: 0,
    fillProgress: 40,
  });

  const activeShapeMeta =
    SHAPE_BUTTONS.find((b) => b.type === settings.shapeType) || SHAPE_BUTTONS[1];

  // Mathematical Calculations
  const calculateMetrics = () => {
    const { shapeType, length, width, height, radius } = settings;
    let sXq = 0;
    let sTp = 0;
    let volume = 0;
    let formulaStr = '';

    if (shapeType === 'LP') {
      const a = length;
      sXq = 4 * a * a;
      sTp = 6 * a * a;
      volume = a * a * a;
      formulaStr = `V = a³ = ${a}³ = ${volume}`;
    } else if (shapeType === 'HCN') {
      const a = length;
      const b = width;
      const c = height;
      sXq = 2 * (a + b) * c;
      sTp = sXq + 2 * a * b;
      volume = a * b * c;
      formulaStr = `V = a × b × c = ${a} × ${b} × ${c} = ${volume}`;
    } else if (shapeType === 'CHOP') {
      const a = length;
      const h = height;
      const sDay = a * a;
      const trungDoan = Math.sqrt((a / 2) ** 2 + h ** 2);
      sXq = 4 * (0.5 * a * trungDoan);
      sTp = sXq + sDay;
      volume = (1 / 3) * sDay * h;
      formulaStr = `V = ⅓ × S_đáy × h = ⅓ × ${sDay} × ${h} = ${volume.toFixed(1)}`;
    } else if (shapeType === 'TRU') {
      const r = radius * 0.7;
      const h = height;
      sXq = 2 * Math.PI * r * h;
      sTp = sXq + 2 * Math.PI * r * r;
      volume = Math.PI * r * r * h;
      formulaStr = `V = π × r² × h = π × ${r.toFixed(1)}² × ${h} ≈ ${volume.toFixed(1)}`;
    } else if (shapeType === 'CAU') {
      const r = radius * 0.8;
      sTp = 4 * Math.PI * r * r;
      sXq = sTp;
      volume = (4 / 3) * Math.PI * r * r * r;
      formulaStr = `V = ⁴⁄₃ × π × r³ = ⁴⁄₃ × π × ${r.toFixed(1)}³ ≈ ${volume.toFixed(1)}`;
    } else if (shapeType === 'NON') {
      const r = radius * 0.7;
      const h = height;
      const l = Math.sqrt(r * r + h * h);
      sXq = Math.PI * r * l;
      sTp = sXq + Math.PI * r * r;
      volume = (1 / 3) * Math.PI * r * r * h;
      formulaStr = `V = ⅓ × π × r² × h ≈ ${volume.toFixed(1)}`;
    } else if (shapeType === 'TU') {
      const a = length;
      sTp = Math.sqrt(3) * a * a;
      sXq = sTp * 0.75;
      volume = (Math.sqrt(2) / 12) * a * a * a;
      formulaStr = `V = (√2 / 12) × a³ ≈ ${volume.toFixed(1)}`;
    } else if (shapeType === 'LANG_TRU') {
      const a = length;
      const h = height;
      const sDay = (Math.sqrt(3) / 4) * a * a;
      sXq = 3 * a * h;
      sTp = sXq + 2 * sDay;
      volume = sDay * h;
      formulaStr = `V = S_đáy × h ≈ ${volume.toFixed(1)}`;
    }

    return {
      sXq: Number(sXq.toFixed(1)),
      sTp: Number(sTp.toFixed(1)),
      volume: Number(volume.toFixed(1)),
      formulaStr,
    };
  };

  const metrics = calculateMetrics();

  const handleCaptureSnapshot = () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    const dataUrl = canvas.toDataURL('image/png');
    const a = document.createElement('a');
    a.href = dataUrl;
    a.download = `hinh-3d-${settings.shapeType.toLowerCase()}-${Date.now()}.png`;
    a.click();
    setSnapshotToast('Đã tải ảnh 3D PNG về máy!');
    setTimeout(() => setSnapshotToast(null), 3000);
  };

  const handleCopyImageToClipboard = async () => {
    const canvas = document.querySelector('canvas');
    if (!canvas) return;
    try {
      canvas.toBlob(async (blob) => {
        if (!blob) return;
        await navigator.clipboard.write([
          new ClipboardItem({ 'image/png': blob }),
        ]);
        setCopied(true);
        setSnapshotToast('Đã sao chép ảnh 3D vào bộ nhớ tạm (Clipboard)!');
        setTimeout(() => {
          setCopied(false);
          setSnapshotToast(null);
        }, 3000);
      });
    } catch {
      handleCaptureSnapshot();
    }
  };

  return (
    <div
      className={`relative flex min-h-[calc(100vh-5rem)] flex-col lg:flex-row ${
        isDarkTheme ? 'bg-[#0b1120] text-slate-100' : 'bg-slate-100 text-slate-900'
      }`}
    >
      {/* ==================================================================== */}
      {/* LEFT CONTROL PANEL (Designed exactly as in the user screenshot)      */}
      {/* ==================================================================== */}
      <aside
        className={`w-full shrink-0 border-r-2 p-5 lg:w-84 xl:w-96 ${
          isDarkTheme
            ? 'border-slate-800 bg-[#111827]/95 text-slate-100'
            : 'border-slate-300 bg-white text-slate-900'
        }`}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-slate-700/60 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-white shadow-md">
              <Box className="h-5 w-5" />
            </div>
            <div>
              <h1 className="font-display text-base font-extrabold tracking-tight">
                Học Hình Học 3D
              </h1>
              <p className="text-[11px] text-slate-400">
                Mô phỏng hình học không gian
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setIsDarkTheme(!isDarkTheme)}
            className={`rounded-xl border p-2 transition-colors ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-800 text-amber-400 hover:bg-slate-700'
                : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
            }`}
            title="Đổi giao diện Sáng / Tối"
          >
            {isDarkTheme ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </button>
        </div>

        {/* Top 3D Shapes Grid (8 icons as in the screenshot) */}
        <div className="mt-4 grid grid-cols-4 gap-2">
          {SHAPE_BUTTONS.map((btn) => {
            const isSelected = settings.shapeType === btn.type;
            return (
              <button
                key={btn.type}
                type="button"
                onClick={() =>
                  setSettings((prev) => ({
                    ...prev,
                    shapeType: btn.type,
                  }))
                }
                className={`flex flex-col items-center justify-center rounded-xl border-2 p-2.5 text-center transition-all ${
                  isSelected
                    ? 'border-blue-500 bg-blue-600/20 text-blue-400 shadow-[0_0_12px_rgba(59,130,246,0.3)]'
                    : isDarkTheme
                    ? 'border-slate-800 bg-slate-900/60 text-slate-400 hover:border-slate-700 hover:text-slate-200'
                    : 'border-slate-200 bg-slate-50 text-slate-600 hover:border-slate-300 hover:text-slate-900'
                }`}
              >
                <div className="font-display text-xs font-black tracking-wider">
                  {btn.short}
                </div>
                <div className="mt-1 line-clamp-1 text-[10px] font-semibold">
                  {btn.label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Current Solid Name Header */}
        <div className="mt-5 flex items-center gap-2 text-xs font-extrabold tracking-wider text-slate-400 uppercase">
          <Layers className="h-4 w-4 text-blue-400" />
          <span>{activeShapeMeta.title}</span>
        </div>

        {/* 4 Feature Toggles: ĐỈNH, CẠNH, MẶT, NHÃN */}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({ ...prev, showVertices: !prev.showVertices }))
            }
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2 text-xs font-black transition-all ${
              settings.showVertices
                ? 'border-rose-500/80 bg-rose-500/20 text-rose-400'
                : 'border-slate-700/60 bg-transparent text-slate-500 opacity-60'
            }`}
          >
            <span>⦿ ĐỈNH</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({ ...prev, showEdges: !prev.showEdges }))
            }
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2 text-xs font-black transition-all ${
              settings.showEdges
                ? 'border-cyan-500/80 bg-cyan-500/20 text-cyan-400'
                : 'border-slate-700/60 bg-transparent text-slate-500 opacity-60'
            }`}
          >
            <span>⎔ CẠNH</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({ ...prev, showFaces: !prev.showFaces }))
            }
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2 text-xs font-black transition-all ${
              settings.showFaces
                ? 'border-blue-500/80 bg-blue-500/20 text-blue-400'
                : 'border-slate-700/60 bg-transparent text-slate-500 opacity-60'
            }`}
          >
            <span>▨ MẶT</span>
          </button>

          <button
            type="button"
            onClick={() =>
              setSettings((prev) => ({ ...prev, showLabels: !prev.showLabels }))
            }
            className={`flex items-center justify-center gap-2 rounded-xl border-2 py-2 text-xs font-black transition-all ${
              settings.showLabels
                ? 'border-amber-500/80 bg-amber-500/20 text-amber-400'
                : 'border-slate-700/60 bg-transparent text-slate-500 opacity-60'
            }`}
          >
            <span>Ⓐ NHÃN</span>
          </button>
        </div>

        {/* 2 Main Action Modes: KHÁM PHÁ vs THỂ TÍCH */}
        <div className="mt-4 grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, mode: 'explore' }))}
            className={`rounded-xl py-2 text-xs font-black tracking-wide transition-all ${
              settings.mode === 'explore'
                ? 'bg-blue-600 text-white shadow-md'
                : isDarkTheme
                ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            KHÁM PHÁ
          </button>

          <button
            type="button"
            onClick={() => setSettings((prev) => ({ ...prev, mode: 'volume' }))}
            className={`rounded-xl py-2 text-xs font-black tracking-wide transition-all ${
              settings.mode === 'volume'
                ? 'bg-fuchsia-600 text-white shadow-md'
                : isDarkTheme
                ? 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                : 'bg-slate-200 text-slate-700 hover:bg-slate-300'
            }`}
          >
            THỂ TÍCH
          </button>
        </div>

        {/* Sliders Area (Matches exact labels from the user screenshot) */}
        <div className="mt-5 space-y-4 text-xs font-bold text-slate-300">
          {/* ĐỘ TRONG SUỐT */}
          <div>
            <div className="flex justify-between">
              <span className="text-[11px] text-slate-400">ĐỘ TRONG SUỐT:</span>
              <span className="font-mono text-blue-400">
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
                setSettings((prev) => ({
                  ...prev,
                  opacity: parseFloat(e.target.value),
                }))
              }
              className="mt-1 w-full accent-blue-500"
            />
          </div>

          {/* DÀI / CẠNH */}
          <div>
            <div className="flex justify-between">
              <span className="text-[11px] text-slate-400">DÀI / CẠNH ĐÁY:</span>
              <span className="font-mono text-cyan-400">{settings.length}</span>
            </div>
            <input
              type="range"
              min="1"
              max="8"
              step="1"
              value={settings.length}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  length: parseInt(e.target.value, 10),
                }))
              }
              className="mt-1 w-full accent-cyan-500"
            />
          </div>

          {/* RỘNG (chỉ hiển thị với HCN) */}
          {settings.shapeType === 'HCN' && (
            <div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">RỘNG:</span>
                <span className="font-mono text-cyan-400">{settings.width}</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={settings.width}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    width: parseInt(e.target.value, 10),
                  }))
                }
                className="mt-1 w-full accent-cyan-500"
              />
            </div>
          )}

          {/* CHIỀU CAO (cho HCN, LP, Chóp, Trụ, Nón, Lăng Trụ) */}
          {settings.shapeType !== 'CAU' && (
            <div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">CHIỀU CAO:</span>
                <span className="font-mono text-blue-400">{settings.height}</span>
              </div>
              <input
                type="range"
                min="1"
                max="8"
                step="1"
                value={settings.height}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    height: parseInt(e.target.value, 10),
                  }))
                }
                className="mt-1 w-full accent-blue-500"
              />
            </div>
          )}

          {/* BÁN KÍNH (cho Trụ, Nón, Cầu) */}
          {['TRU', 'CAU', 'NON'].includes(settings.shapeType) && (
            <div>
              <div className="flex justify-between">
                <span className="text-[11px] text-slate-400">BÁN KÍNH ĐÁY / CẦU (R):</span>
                <span className="font-mono text-emerald-400">{settings.radius}</span>
              </div>
              <input
                type="range"
                min="1"
                max="6"
                step="1"
                value={settings.radius}
                onChange={(e) =>
                  setSettings((prev) => ({
                    ...prev,
                    radius: parseInt(e.target.value, 10),
                  }))
                }
                className="mt-1 w-full accent-emerald-500"
              />
            </div>
          )}

          {/* MÔ PHỎNG LẮP ĐẦY KHỐI / THỂ TÍCH */}
          <div>
            <div className="flex justify-between">
              <span className="text-[11px] text-slate-400">
                LẮP ĐẦY KHỐI ĐƠN VỊ:
              </span>
              <span className="font-mono text-fuchsia-400">
                {settings.fillProgress}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              step="5"
              value={settings.fillProgress}
              onChange={(e) =>
                setSettings((prev) => ({
                  ...prev,
                  fillProgress: parseInt(e.target.value, 10),
                }))
              }
              className="mt-1 w-full accent-fuchsia-500"
            />
          </div>
        </div>

        {/* THỐNG SỐ TÍNH TOÁN BOX (Matches screenshot footer) */}
        <div
          className={`mt-6 rounded-2xl border-2 p-4 ${
            isDarkTheme
              ? 'border-slate-800 bg-[#0d1527]'
              : 'border-slate-200 bg-slate-50'
          }`}
        >
          <div className="flex items-center gap-2 text-xs font-extrabold uppercase text-slate-400">
            <Compass className="h-4 w-4 text-emerald-400" />
            <span>THỐNG SỐ TÍNH TOÁN</span>
          </div>

          <div className="mt-3 space-y-2 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-slate-400">DIỆN TÍCH TP:</span>
              <span className="font-mono text-sm font-black text-emerald-400">
                {metrics.sTp}{' '}
                <span className="text-[10px] text-slate-400">đvdt</span>
              </span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-slate-400">THỂ TÍCH (V):</span>
              <span className="font-mono text-base font-black text-fuchsia-400">
                {metrics.volume}{' '}
                <span className="text-[10px] text-slate-400">đvtt</span>
              </span>
            </div>

            <div className="border-t border-slate-700/60 pt-2 text-[11px] font-semibold text-slate-400">
              {metrics.formulaStr}
            </div>
          </div>
        </div>
      </aside>

      {/* ==================================================================== */}
      {/* RIGHT 3D CANVAS & TOP TOOLBAR                                        */}
      {/* ==================================================================== */}
      <main className="relative flex flex-1 flex-col overflow-hidden">
        {/* Floating Top Teacher Action Bar */}
        <div className="absolute top-4 right-4 z-20 flex flex-wrap items-center gap-2">
          {snapshotToast && (
            <div className="animate-fade-in rounded-xl border border-emerald-500/50 bg-emerald-950/80 px-3 py-1.5 text-xs font-bold text-emerald-300 backdrop-blur-md shadow-lg">
              {snapshotToast}
            </div>
          )}

          <button
            type="button"
            onClick={handleCopyImageToClipboard}
            className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-extrabold backdrop-blur-md transition-all shadow-md ${
              isDarkTheme
                ? 'border-slate-700 bg-slate-900/80 text-slate-200 hover:bg-slate-800'
                : 'border-slate-300 bg-white/90 text-slate-800 hover:bg-slate-100'
            }`}
            title="Sao chép ảnh vào Clipboard để dán vào Word, Zalo hoặc Đề thi"
          >
            {copied ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span>Đã chép</span>
              </>
            ) : (
              <>
                <Copy className="h-4 w-4 text-blue-400" />
                <span>Sao chép ảnh</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleCaptureSnapshot}
            className="flex items-center gap-1.5 rounded-xl border-2 border-slate-900 bg-blue-600 px-3.5 py-2 text-xs font-black text-white shadow-[0_3px_0_0_#1E293B] hover:bg-blue-500"
            title="Tải ảnh PNG về máy"
          >
            <Download className="h-4 w-4" />
            <span>Tải Ảnh PNG</span>
          </button>
        </div>

        {/* 3D WebGL Canvas */}
        <div className="h-full min-h-[550px] w-full flex-1">
          <Geometry3DStudio
            settings={settings}
            isDarkTheme={isDarkTheme}
            className="h-full w-full"
          />
        </div>
      </main>
    </div>
  );
};
