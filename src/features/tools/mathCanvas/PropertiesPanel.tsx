import React, { useState } from 'react';
import { ArrowDownToLine, ArrowUpToLine, Copy, Eye, EyeOff, Lock, Minus, Plus, RotateCcw, RotateCw, Trash2, Unlock } from 'lucide-react';
import { BAR_TEMPLATES, SOLID_NAMES } from './objects';
import { defaultNames, type BarRow } from './solids';
import {
  addAltitude,
  addCornerMarks,
  addDiagonals,
  addDiameter,
  addMedian,
  addPoint,
  addRadius,
  COLORS,
  connect,
  divideSegment,
  FILLS,
  type CanvasDoc,
  type GObject,
  type GPoint,
  type Stroke,
} from './geometry';

export const MATH_SYMBOLS = ['+', '−', '×', ':', '=', '<', '>', '≤', '≥', '≠', '½', '⅓', '¼', '°', '⊥', '∥', '∠', '△', 'cm', 'cm²', 'm', 'mm', 'dm', 'km', 'kg', 'g', 'l', 'ml', '?'];

const SHAPE_NAMES: Record<string, string> = {
  polygon: 'Đa giác',
  triangle: 'Tam giác',
  'right-triangle': 'Tam giác vuông',
  isosceles: 'Tam giác cân',
  equilateral: 'Tam giác đều',
  square: 'Hình vuông',
  rectangle: 'Hình chữ nhật',
  parallelogram: 'Hình bình hành',
  rhombus: 'Hình thoi',
  trapezoid: 'Hình thang',
};

export function describePoint(p: GPoint, doc: CanvasDoc): string {
  const n = (id: string) => doc.points.find((x) => x.id === id)?.name ?? '?';
  const d = p.def;
  switch (d.kind) {
    case 'free':
      return 'Điểm tự do – kéo để di chuyển';
    case 'onSegment':
      return `Điểm nằm trên đoạn ${n(d.a)}${n(d.b)} – kéo để trượt trên cạnh`;
    case 'onCircle':
      return 'Điểm nằm trên đường tròn – kéo để di chuyển trên đường tròn';
    case 'intersection':
      return `Giao điểm của ${n(d.a)}${n(d.b)} và ${n(d.c)}${n(d.d)}`;
    case 'foot':
      return `Chân đường vuông góc hạ từ ${n(d.p)} xuống ${n(d.a)}${n(d.b)}`;
    case 'midpoint':
      return `Trung điểm của ${n(d.a)}${n(d.b)}`;
    case 'perp':
      return d.fixed ? 'Đỉnh tự tính theo hình (kéo các đỉnh đầu tiên để đổi hình)' : 'Đỉnh giữ góc vuông – kéo để đổi độ dài cạnh';
    case 'rotate':
      return d.free === 'angle' ? 'Đỉnh giữ độ dài cạnh – kéo để đổi góc' : 'Đỉnh tự tính theo hình (kéo các đỉnh khác để đổi hình)';
    case 'translate':
      return 'Đỉnh tự tính để các cạnh đối song song';
    case 'apex':
      return 'Đỉnh của tam giác cân – kéo để đổi chiều cao';
    case 'along':
      return 'Đỉnh giữ cạnh song song – kéo để đổi độ dài đáy';
    case 'opposite':
      return 'Đầu kia của đường kính';
  }
}

const Section: React.FC<{ title: string; children: React.ReactNode }> = ({ title, children }) => (
  <div>
    <div className="mb-1.5 text-[11px] font-bold uppercase tracking-wide text-[#5E6C84]">{title}</div>
    {children}
  </div>
);

const Swatches: React.FC<{ colors: string[]; value: string; onPick: (c: string) => void; label: string }> = ({ colors, value, onPick, label }) => (
  <div className="flex flex-wrap gap-1.5">
    {colors.map((c) => (
      <button
        key={c}
        type="button"
        aria-label={`${label} ${c === 'none' ? 'không tô' : c}`}
        aria-pressed={value === c}
        onClick={() => onPick(c)}
        className={`h-7 w-7 rounded-full ring-1 ring-[#DCE7F3] ${value === c ? 'ring-4 ring-[#FFD34E] ring-offset-1' : ''}`}
        style={c === 'none' ? { background: 'linear-gradient(135deg,#fff 45%,#E5484D 45%,#E5484D 55%,#fff 55%)' } : { background: c }}
      />
    ))}
  </div>
);

export const StrokeEditor: React.FC<{ style: Stroke; onChange: (patch: Partial<Stroke>) => void; fill?: boolean }> = ({ style, onChange, fill = true }) => (
  <div className="space-y-3">
    <Section title="Màu nét">
      <Swatches colors={COLORS} value={style.stroke} onPick={(c) => onChange({ stroke: c })} label="Màu nét" />
    </Section>
    <Section title="Độ dày và kiểu nét">
      <div className="flex flex-wrap items-center gap-1.5">
        {[1.5, 2.5, 4, 6].map((w) => (
          <button
            key={w}
            type="button"
            aria-pressed={style.width === w}
            onClick={() => onChange({ width: w })}
            className={`flex h-8 w-10 items-center justify-center rounded-lg ${style.width === w ? 'bg-[#1267E9]' : 'bg-[#F6FAFF] ring-1 ring-[#DCE7F3]'}`}
            aria-label={`Nét dày ${w}`}
          >
            <span className="block w-6 rounded-full" style={{ height: w, background: style.width === w ? '#fff' : '#071A63' }} />
          </button>
        ))}
        {(['solid', 'dashed'] as const).map((d) => (
          <button
            key={d}
            type="button"
            aria-pressed={style.dash === d}
            onClick={() => onChange({ dash: d })}
            className={`h-8 rounded-lg px-2.5 text-xs font-bold ${style.dash === d ? 'bg-[#071A63] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}
          >
            {d === 'solid' ? 'Nét liền' : 'Nét đứt'}
          </button>
        ))}
      </div>
    </Section>
    {fill && (
      <Section title="Màu tô">
        <Swatches colors={FILLS} value={style.fill} onPick={(c) => onChange({ fill: c })} label="Màu tô" />
        {style.fill !== 'none' && (
          <label className="mt-2 flex items-center gap-2 text-xs font-bold text-[#5E6C84]">
            Độ đậm
            <input type="range" min={0.1} max={1} step={0.05} value={style.fillOpacity} onChange={(e) => onChange({ fillOpacity: Number(e.target.value) })} className="flex-1 accent-[#1267E9]" />
          </label>
        )}
      </Section>
    )}
  </div>
);

interface PanelProps {
  doc: CanvasDoc;
  selected: string[];
  /** Records one undo step. */
  apply: (next: CanvasDoc) => void;
  /** Live change while typing (joins the next undo step). */
  live: (next: CanvasDoc) => void;
  commit: () => void;
  onSelect: (ids: string[]) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onOrder: (front: boolean) => void;
  textRef: React.RefObject<HTMLTextAreaElement | null>;
  nameRef: React.RefObject<HTMLInputElement | null>;
  ink: Stroke;
  setInk: (patch: Partial<Stroke>) => void;
  orbit: boolean;
  setOrbit: (on: boolean) => void;
  paintColor: string;
  setPaintColor: (c: string) => void;
  onPaintTool: () => void;
}

const Toggle: React.FC<{ on: boolean; onChange: (v: boolean) => void; children: React.ReactNode }> = ({ on, onChange, children }) => (
  <label className="flex items-center gap-2 text-sm font-bold text-[#172B4D]">
    <input type="checkbox" checked={on} onChange={(e) => onChange(e.target.checked)} className="h-4 w-4 accent-[#1267E9]" />
    {children}
  </label>
);

const Slider: React.FC<{ label: string; value: number; min: number; max: number; step?: number; unit?: string; onChange: (v: number) => void }> = ({ label, value, min, max, step = 1, unit = '', onChange }) => (
  <label className="block text-xs font-bold text-[#5E6C84]">
    <span className="flex justify-between">
      {label}
      <span className="text-[#071A63]">
        {String(value).replace('.', ',')}
        {unit}
      </span>
    </span>
    <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full accent-[#1267E9]" />
  </label>
);

const Stepper: React.FC<{ label: string; value: number; min: number; max: number; onChange: (v: number) => void }> = ({ label, value, min, max, onChange }) => (
  <div className="flex items-center justify-between gap-2 text-sm font-bold text-[#172B4D]">
    {label}
    <span className="flex items-center gap-1">
      <button type="button" aria-label={`Bớt ${label}`} disabled={value <= min} onClick={() => onChange(value - 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F6FAFF] ring-1 ring-[#DCE7F3] disabled:opacity-40">
        <Minus className="h-3.5 w-3.5" />
      </button>
      <span className="w-6 text-center">{value}</span>
      <button type="button" aria-label={`Thêm ${label}`} disabled={value >= max} onClick={() => onChange(value + 1)} className="flex h-7 w-7 items-center justify-center rounded-lg bg-[#F6FAFF] ring-1 ring-[#DCE7F3] disabled:opacity-40">
        <Plus className="h-3.5 w-3.5" />
      </button>
    </span>
  </div>
);

const SOLID_COLORS = ['#54C8FF', '#1267E9', '#FFD34E', '#FF76B5', '#7B5CFF', '#22C38E', '#FFFFFF', '#E5484D'];
const PAINT = ['#FFD34E', '#54C8FF', '#FF76B5', '#22C38E', '#7B5CFF', '#E5484D', '#1267E9', '#FFB800'];

/** Right-hand panel: properties of the selection, or defaults for new shapes. */
export const PropertiesPanel: React.FC<PanelProps> = ({
  doc,
  selected,
  apply,
  live,
  commit,
  onSelect,
  onDuplicate,
  onDelete,
  onOrder,
  textRef,
  nameRef,
  ink,
  setInk,
  orbit,
  setOrbit,
  paintColor,
  setPaintColor,
  onPaintTool,
}) => {
  const [parts, setParts] = useState(2);
  const [removeCubes, setRemoveCubes] = useState(false);
  const objs = doc.objects.filter((o) => selected.includes(o.id));
  const pts = doc.points.filter((p) => selected.includes(p.id));
  const name = (id: string) => doc.points.find((p) => p.id === id)?.name ?? '?';
  const patchObj = (id: string, patch: Partial<GObject>, record = true) => {
    const next = { ...doc, objects: doc.objects.map((o) => (o.id === id ? ({ ...o, ...patch } as GObject) : o)) };
    if (record) apply(next);
    else live(next);
  };
  const patchStyle = (patch: Partial<Stroke>) =>
    apply({ ...doc, objects: doc.objects.map((o) => (selected.includes(o.id) && 'style' in o ? ({ ...o, style: { ...o.style, ...patch } } as GObject) : o)) });
  const patchPoint = (id: string, patch: Partial<GPoint>, record = true) => {
    const next = { ...doc, points: doc.points.map((p) => (p.id === id ? { ...p, ...patch } : p)) };
    if (record) apply(next);
    else live(next);
  };

  const actions = (
    <div className="grid grid-cols-2 gap-1.5">
      <button type="button" onClick={onDuplicate} className="studio-btn studio-btn-secondary min-h-[36px] px-2 text-sm">
        <Copy className="h-4 w-4" /> Nhân bản
      </button>
      <button type="button" onClick={onDelete} className="studio-btn studio-btn-danger min-h-[36px] px-2 text-sm">
        <Trash2 className="h-4 w-4" /> Xóa
      </button>
      {objs.length > 0 && (
        <>
          <button type="button" onClick={() => onOrder(true)} className="studio-btn studio-btn-secondary min-h-[36px] px-2 text-sm">
            <ArrowUpToLine className="h-4 w-4" /> Lên trước
          </button>
          <button type="button" onClick={() => onOrder(false)} className="studio-btn studio-btn-secondary min-h-[36px] px-2 text-sm">
            <ArrowDownToLine className="h-4 w-4" /> Ra sau
          </button>
          <button
            type="button"
            onClick={() => {
              const lock = !objs.every((o) => o.locked);
              apply({ ...doc, objects: doc.objects.map((o) => (selected.includes(o.id) ? ({ ...o, locked: lock || undefined } as GObject) : o)) });
            }}
            className="studio-btn studio-btn-secondary col-span-2 min-h-[36px] px-2 text-sm"
          >
            {objs.every((o) => o.locked) ? <Unlock className="h-4 w-4" /> : <Lock className="h-4 w-4" />} {objs.every((o) => o.locked) ? 'Mở khóa' : 'Khóa (không kéo nhầm)'}
          </button>
        </>
      )}
    </div>
  );

  // ---- nothing selected: defaults for new shapes
  if (selected.length === 0) {
    return (
      <div className="space-y-4">
        <p className="font-display text-base font-extrabold text-[#071A63]">Kiểu nét cho hình mới</p>
        <StrokeEditor style={ink} onChange={setInk} />
        <ul className="list-disc space-y-1 pl-4 text-xs leading-relaxed text-[#5E6C84]">
          <li>Chọn công cụ bên trái rồi bấm hoặc kéo trên vùng vẽ.</li>
          <li>Bấm gần cạnh để đặt điểm trên cạnh; gần chỗ hai đoạn cắt nhau để lấy giao điểm.</li>
          <li>Kéo điểm để đổi hình; các đoạn nối luôn đi theo.</li>
          <li>Cuộn chuột hoặc chụm hai ngón để phóng to/thu nhỏ.</li>
        </ul>
      </div>
    );
  }

  // ---- one point
  if (selected.length === 1 && pts.length === 1) {
    const p = pts[0];
    return (
      <div className="space-y-4">
        <p className="font-display text-base font-extrabold text-[#071A63]">Điểm {p.name}</p>
        <p className="rounded-xl bg-[#F6FAFF] px-3 py-2 text-xs text-[#5E6C84]">{describePoint(p, doc)}</p>
        <Section title="Tên điểm">
          <div className="flex gap-1.5">
            <input
              ref={nameRef}
              value={p.name}
              maxLength={6}
              aria-label="Tên điểm"
              onChange={(e) => patchPoint(p.id, { name: e.target.value }, false)}
              onBlur={commit}
              className="w-24 rounded-lg border-2 border-[#DCE7F3] px-2 py-1.5 text-lg font-bold italic text-[#071A63] focus:border-[#1267E9] focus:outline-none"
            />
            <button
              type="button"
              onClick={() => patchPoint(p.id, { showName: !p.showName })}
              className="studio-btn studio-btn-secondary min-h-[38px] px-3 text-sm"
              aria-pressed={p.showName}
            >
              {p.showName ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />} {p.showName ? 'Đang hiện tên' : 'Đang ẩn tên'}
            </button>
          </div>
        </Section>
        <Section title="Màu điểm">
          <Swatches colors={COLORS} value={p.color} onPick={(c) => patchPoint(p.id, { color: c })} label="Màu điểm" />
        </Section>
        {actions}
      </div>
    );
  }

  // ---- one object
  if (selected.length === 1 && objs.length === 1) {
    const o = objs[0];
    if (o.type === 'solid') {
      const sp = o.spec;
      const setSpec = (patch: Partial<typeof sp>) => patchObj(o.id, { spec: { ...sp, ...patch } });
      const box = sp.kind === 'cuboid';
      const round = sp.kind === 'cylinder' || sp.kind === 'cone' || sp.kind === 'sphere';
      return (
        <div className="space-y-4">
          <p className="font-display text-base font-extrabold text-[#071A63]">{SOLID_NAMES[sp.kind]}</p>
          <Section title="Kích thước">
            <div className="space-y-1.5">
              <Slider label={sp.kind === 'cube' ? 'Cạnh' : round ? 'Đường kính' : 'Chiều dài'} value={sp.w} min={1} max={8} step={0.5} onChange={(v) => setSpec({ w: v, ...(sp.kind === 'pyramid' ? { d: v } : {}) })} />
              {sp.kind !== 'cube' && sp.kind !== 'sphere' && <Slider label="Chiều cao" value={sp.h} min={1} max={8} step={0.5} onChange={(v) => setSpec({ h: v })} />}
              {box && <Slider label="Chiều rộng" value={sp.d} min={1} max={8} step={0.5} onChange={(v) => setSpec({ d: v })} />}
              <Slider label="Cỡ hiển thị" value={sp.size} min={15} max={100} onChange={(v) => setSpec({ size: v })} />
            </div>
          </Section>
          <Section title="Góc nhìn">
            <div className="space-y-1.5">
              <Slider label="Xoay ngang" value={((sp.yaw % 360) + 540) % 360 - 180} min={-180} max={180} unit="°" onChange={(v) => setSpec({ yaw: v })} />
              <Slider label="Nghiêng" value={sp.pitch} min={-80} max={80} unit="°" onChange={(v) => setSpec({ pitch: v })} />
              <div className="flex flex-wrap gap-1.5">
                {(
                  [
                    ['Chính diện', 0, 0],
                    ['Nghiêng', 32, 18],
                    ['Nhìn từ trên', 20, 60],
                  ] as const
                ).map(([l, yaw, pitch]) => (
                  <button key={l} type="button" onClick={() => setSpec({ yaw, pitch })} className="h-8 rounded-lg bg-[#F6FAFF] px-2.5 text-xs font-bold text-[#071A63] ring-1 ring-[#DCE7F3]">
                    {l}
                  </button>
                ))}
              </div>
              <Toggle on={orbit} onChange={setOrbit}>
                Kéo khối trên vùng vẽ để xoay
              </Toggle>
            </div>
          </Section>
          <Section title="Hiển thị">
            <div className="space-y-1.5">
              <Toggle on={o.showEdges} onChange={(v) => patchObj(o.id, { showEdges: v })}>
                Hiện cạnh
              </Toggle>
              <Toggle on={o.showHidden} onChange={(v) => patchObj(o.id, { showHidden: v })}>
                Hiện cạnh khuất (nét đứt)
              </Toggle>
              <Toggle on={o.showVertices} onChange={(v) => patchObj(o.id, { showVertices: v })}>
                {round ? 'Hiện tâm' : 'Hiện đỉnh'}
              </Toggle>
              <Toggle on={o.showLabels} onChange={(v) => patchObj(o.id, { showLabels: v })}>
                Hiện nhãn {round ? 'tâm / đỉnh' : 'đỉnh'}
              </Toggle>
            </div>
          </Section>
          {o.showLabels && (
            <Section title={`Nhãn (${defaultNames(sp.kind).join(', ')})`}>
              <input
                value={o.labels.join(' ')}
                aria-label="Nhãn đỉnh, cách nhau bởi dấu cách"
                onChange={(e) => patchObj(o.id, { labels: e.target.value.split(/[\s,;]+/) }, false)}
                onBlur={commit}
                className="w-full rounded-lg border-2 border-[#DCE7F3] px-2 py-1.5 text-sm font-bold italic text-[#071A63] focus:border-[#1267E9] focus:outline-none"
              />
            </Section>
          )}
          <Section title="Màu khối">
            <Swatches colors={SOLID_COLORS} value={o.color} onPick={(c) => patchObj(o.id, { color: c })} label="Màu khối" />
            <div className="mt-2">
              <Slider label="Độ đậm màu" value={o.opacity} min={0} max={1} step={0.05} onChange={(v) => patchObj(o.id, { opacity: v })} />
            </div>
          </Section>
          {actions}
        </div>
      );
    }
    if (o.type === 'cubes') {
      const setH = (i: number, h: number) => patchObj(o.id, { heights: o.heights.map((x, j) => (j === i ? Math.max(0, Math.min(6, h)) : x)) });
      const resize = (cols: number, rows: number) => {
        const heights = Array.from({ length: cols * rows }, (_, i) => {
          const r = Math.floor(i / cols);
          const c = i % cols;
          return r < o.rows && c < o.cols ? o.heights[r * o.cols + c] ?? 0 : 0;
        });
        patchObj(o.id, { cols, rows, heights });
      };
      const total = o.heights.reduce((a, b) => a + b, 0);
      return (
        <div className="space-y-4">
          <p className="font-display text-base font-extrabold text-[#071A63]">Xếp khối lập phương · {total} khối</p>
          <Section title="Bấm vào ô để thêm khối (số = số khối chồng lên)">
            <div className="inline-grid gap-1" style={{ gridTemplateColumns: `repeat(${o.cols}, 2.25rem)` }}>
              {o.heights.map((h, i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => setH(i, h + (removeCubes ? -1 : 1))}
                  aria-label={`Ô hàng ${Math.floor(i / o.cols) + 1} cột ${(i % o.cols) + 1}: ${h} khối`}
                  className={`h-9 rounded-lg text-sm font-extrabold ${h ? 'bg-[#1267E9] text-white' : 'bg-[#F6FAFF] text-[#5E6C84] ring-1 ring-[#DCE7F3]'}`}
                >
                  {h}
                </button>
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <button type="button" aria-pressed={!removeCubes} onClick={() => setRemoveCubes(false)} className={`h-8 rounded-lg px-2.5 text-xs font-bold ${!removeCubes ? 'bg-[#071A63] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}>
                <Plus className="mr-1 inline h-3.5 w-3.5" />Thêm khối
              </button>
              <button type="button" aria-pressed={removeCubes} onClick={() => setRemoveCubes(true)} className={`h-8 rounded-lg px-2.5 text-xs font-bold ${removeCubes ? 'bg-[#D93B5B] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}>
                <Minus className="mr-1 inline h-3.5 w-3.5" />Bớt khối
              </button>
              <button type="button" onClick={() => patchObj(o.id, { heights: o.heights.map(() => 0) })} className="h-8 rounded-lg bg-[#F6FAFF] px-2.5 text-xs font-bold text-[#071A63] ring-1 ring-[#DCE7F3]">
                Xóa hết khối
              </button>
            </div>
          </Section>
          <div className="space-y-1.5">
            <Stepper label="Số cột" value={o.cols} min={1} max={6} onChange={(v) => resize(v, o.rows)} />
            <Stepper label="Số hàng" value={o.rows} min={1} max={6} onChange={(v) => resize(o.cols, v)} />
          </div>
          <Section title="Góc nhìn">
            <div className="flex gap-1.5">
              <button type="button" onClick={() => patchObj(o.id, { view: (o.view + 3) % 4 })} className="studio-btn studio-btn-secondary min-h-[34px] flex-1 px-2 text-sm">
                <RotateCcw className="h-4 w-4" /> Xoay trái
              </button>
              <button type="button" onClick={() => patchObj(o.id, { view: (o.view + 1) % 4 })} className="studio-btn studio-btn-secondary min-h-[34px] flex-1 px-2 text-sm">
                <RotateCw className="h-4 w-4" /> Xoay phải
              </button>
            </div>
          </Section>
          <Slider label="Cỡ khối" value={o.size} min={15} max={80} onChange={(v) => patchObj(o.id, { size: v })} />
          <Toggle on={o.showCount} onChange={(v) => patchObj(o.id, { showCount: v })}>
            Hiện số khối (đáp án)
          </Toggle>
          <Section title="Màu khối">
            <Swatches colors={SOLID_COLORS} value={o.color} onPick={(c) => patchObj(o.id, { color: c })} label="Màu khối" />
          </Section>
          {actions}
        </div>
      );
    }
    if (o.type === 'cellGrid') {
      const count = Object.keys(o.fills).filter((k) => {
        const [r, c] = k.split(',').map(Number);
        return r < o.rows && c < o.cols;
      }).length;
      return (
        <div className="space-y-4">
          <p className="font-display text-base font-extrabold text-[#071A63]">
            Lưới {o.cols} × {o.rows} ô · đã tô {count} ô
          </p>
          <div className="space-y-1.5">
            <Stepper label="Số cột" value={o.cols} min={1} max={30} onChange={(v) => patchObj(o.id, { cols: v })} />
            <Stepper label="Số hàng" value={o.rows} min={1} max={30} onChange={(v) => patchObj(o.id, { rows: v })} />
            <Slider label="Cỡ ô" value={o.cell} min={16} max={100} unit=" px" onChange={(v) => patchObj(o.id, { cell: v })} />
          </div>
          <Section title="Màu tô ô">
            <Swatches colors={PAINT} value={paintColor} onPick={setPaintColor} label="Màu tô ô" />
            <button type="button" onClick={onPaintTool} className="studio-btn studio-btn-primary mt-2 min-h-[34px] w-full text-sm">
              Tô màu từng ô
            </button>
          </Section>
          <button type="button" disabled={count === 0} onClick={() => patchObj(o.id, { fills: {} })} className="studio-btn studio-btn-secondary min-h-[34px] w-full text-sm">
            Bỏ tô tất cả
          </button>
          <Toggle on={o.showCount} onChange={(v) => patchObj(o.id, { showCount: v })}>
            Hiện số ô đã tô (đáp án)
          </Toggle>
          <p className="rounded-xl bg-[#F6FAFF] px-3 py-2 text-xs text-[#5E6C84]">Số đếm là số ô vuông đơn vị đã tô, không phải số hình vuông mọi kích thước.</p>
          <Swatches colors={COLORS} value={o.stroke} onPick={(c) => patchObj(o.id, { stroke: c })} label="Màu đường lưới" />
          {actions}
        </div>
      );
    }
    if (o.type === 'bars') {
      const setRows = (rows: BarRow[], record = true) => patchObj(o.id, { rows }, record);
      const setRow = (i: number, patch: Partial<BarRow>, record = true) => setRows(o.rows.map((r, j) => (j === i ? { ...r, ...patch } : r)), record);
      return (
        <div className="space-y-4">
          <p className="font-display text-base font-extrabold text-[#071A63]">Sơ đồ đoạn thẳng</p>
          <Section title="Áp dụng mẫu bài toán">
            <select
              value=""
              onChange={(e) => {
                const t = BAR_TEMPLATES.find((x) => x.id === e.target.value);
                if (t) setRows(t.rows.map((r) => ({ ...r, braces: r.braces.map((b) => ({ ...b })) })));
              }}
              className="w-full rounded-lg border-2 border-[#DCE7F3] bg-white px-2 py-1.5 text-sm font-bold text-[#071A63]"
              aria-label="Mẫu sơ đồ đoạn thẳng"
            >
              <option value="">Chọn mẫu…</option>
              {BAR_TEMPLATES.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </Section>
          {o.rows.map((row, i) => (
            <div key={i} className="space-y-2 rounded-xl bg-[#F6FAFF] p-2.5 ring-1 ring-[#DCE7F3]">
              <div className="flex items-center gap-1.5">
                <input
                  value={row.label}
                  aria-label={`Tên thanh ${i + 1}`}
                  onChange={(e) => setRow(i, { label: e.target.value }, false)}
                  onBlur={commit}
                  className="min-w-0 flex-1 rounded-lg border-2 border-[#DCE7F3] px-2 py-1 text-sm font-bold"
                />
                <button type="button" aria-label={`Xóa thanh ${i + 1}`} disabled={o.rows.length === 1} onClick={() => setRows(o.rows.filter((_, j) => j !== i))} className="rounded-lg p-1 text-[#D93B5B] disabled:opacity-30">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
              <Slider label="Độ dài" value={row.length} min={1} max={16} step={0.5} onChange={(v) => setRow(i, { length: v })} />
              <Stepper label="Chia thành số phần bằng nhau" value={row.parts} min={1} max={12} onChange={(v) => setRow(i, { parts: v, braces: row.braces.map((b) => ({ ...b, from: Math.min(b.from, v - 1), to: Math.min(b.to, v) })) })} />
              <Swatches colors={['#1267E9', '#E5484D', '#22C38E', '#7B5CFF', '#FFB800', '#071A63']} value={row.color} onPick={(c) => setRow(i, { color: c })} label="Màu thanh" />
              {row.braces.map((br, j) => (
                <div key={j} className="flex flex-wrap items-center gap-1 text-xs font-bold text-[#5E6C84]">
                  Ngoặc từ phần
                  <select value={br.from} onChange={(e) => setRow(i, { braces: row.braces.map((b, k) => (k === j ? { ...b, from: Number(e.target.value), to: Math.max(Number(e.target.value) + 1, b.to) } : b)) })} className="rounded border border-[#DCE7F3] bg-white px-1" aria-label="Từ phần">
                    {Array.from({ length: row.parts }, (_, k) => (
                      <option key={k} value={k}>
                        {k + 1}
                      </option>
                    ))}
                  </select>
                  đến
                  <select value={br.to} onChange={(e) => setRow(i, { braces: row.braces.map((b, k) => (k === j ? { ...b, to: Number(e.target.value) } : b)) })} className="rounded border border-[#DCE7F3] bg-white px-1" aria-label="Đến phần">
                    {Array.from({ length: row.parts }, (_, k) => k + 1)
                      .filter((k) => k > br.from)
                      .map((k) => (
                        <option key={k} value={k}>
                          {k}
                        </option>
                      ))}
                  </select>
                  <input
                    value={br.text}
                    aria-label="Chữ trên ngoặc"
                    onChange={(e) => setRow(i, { braces: row.braces.map((b, k) => (k === j ? { ...b, text: e.target.value } : b)) }, false)}
                    onBlur={commit}
                    className="w-20 rounded border border-[#DCE7F3] px-1.5 py-0.5 text-sm text-[#071A63]"
                  />
                  <label className="flex items-center gap-1">
                    <input type="checkbox" checked={!!br.below} onChange={(e) => setRow(i, { braces: row.braces.map((b, k) => (k === j ? { ...b, below: e.target.checked || undefined } : b)) })} className="accent-[#1267E9]" />
                    dưới
                  </label>
                  <button type="button" aria-label="Xóa ngoặc" onClick={() => setRow(i, { braces: row.braces.filter((_, k) => k !== j) })} className="text-[#D93B5B]">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
              <button type="button" onClick={() => setRow(i, { braces: [...row.braces, { from: 0, to: row.parts, text: '?' }] })} className="text-xs font-bold text-[#1267E9]">
                + Thêm ngoặc / dấu hỏi
              </button>
            </div>
          ))}
          <button
            type="button"
            onClick={() => setRows([...o.rows, { label: `Thanh ${o.rows.length + 1}:`, length: 4, parts: 1, color: '#22C38E', braces: [] }])}
            className="studio-btn studio-btn-secondary min-h-[34px] w-full text-sm"
          >
            <Plus className="h-4 w-4" /> Thêm thanh
          </button>
          <Slider label="Độ dài 1 phần (px)" value={o.unit} min={12} max={80} onChange={(v) => patchObj(o.id, { unit: v })} />
          {actions}
        </div>
      );
    }
    if (o.type === 'text') {
      return (
        <div className="space-y-4">
          <p className="font-display text-base font-extrabold text-[#071A63]">Chữ / chú thích</p>
          <textarea
            ref={textRef}
            value={o.text}
            rows={3}
            maxLength={400}
            aria-label="Nội dung chữ"
            onChange={(e) => patchObj(o.id, { text: e.target.value }, false)}
            onBlur={commit}
            className="w-full rounded-xl border-2 border-[#DCE7F3] px-3 py-2 text-base text-[#172B4D] focus:border-[#1267E9] focus:outline-none"
          />
          <div className="flex flex-wrap gap-1">
            {MATH_SYMBOLS.map((s) => (
              <button key={s} type="button" onClick={() => patchObj(o.id, { text: o.text + s })} className="min-h-[30px] min-w-[30px] rounded-lg bg-[#F6FAFF] px-1.5 text-sm font-bold text-[#071A63] ring-1 ring-[#DCE7F3]">
                {s}
              </button>
            ))}
          </div>
          <Section title="Cỡ chữ">
            <div className="flex flex-wrap gap-1.5">
              {[14, 18, 24, 32, 44].map((s) => (
                <button key={s} type="button" aria-pressed={o.fontSize === s} onClick={() => patchObj(o.id, { fontSize: s })} className={`h-8 min-w-[38px] rounded-lg px-2 text-sm font-bold ${o.fontSize === s ? 'bg-[#1267E9] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}>
                  {s}
                </button>
              ))}
              <button type="button" aria-pressed={o.bold} onClick={() => patchObj(o.id, { bold: !o.bold })} className={`h-8 rounded-lg px-3 text-sm font-extrabold ${o.bold ? 'bg-[#071A63] text-white' : 'bg-[#F6FAFF] text-[#071A63] ring-1 ring-[#DCE7F3]'}`}>
                Đậm
              </button>
            </div>
          </Section>
          <Section title="Màu chữ">
            <Swatches colors={COLORS} value={o.color} onPick={(c) => patchObj(o.id, { color: c })} label="Màu chữ" />
          </Section>
          {actions}
        </div>
      );
    }

    const title =
      o.type === 'segment'
        ? `Đoạn thẳng ${name(o.a)}${name(o.b)}`
        : o.type === 'line'
          ? `Đường thẳng ${name(o.a)}${name(o.b)}`
          : o.type === 'ray'
            ? `Tia ${name(o.a)}${name(o.b)}`
            : o.type === 'polygon'
              ? `${SHAPE_NAMES[o.shape] ?? 'Đa giác'} ${o.pts.map(name).join('')}`
              : o.type === 'circle'
                ? `Hình tròn tâm ${name(o.c)}`
                : o.type === 'rightMark'
                  ? `Ký hiệu góc vuông tại ${name(o.o)}`
                  : '';

    return (
      <div className="space-y-4">
        <p className="font-display text-base font-extrabold text-[#071A63]">{title}</p>

        {o.type === 'segment' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-[#172B4D]">
              <input type="checkbox" checked={!!o.showLength} onChange={(e) => patchObj(o.id, { showLength: e.target.checked || undefined })} className="h-4 w-4 accent-[#1267E9]" />
              Hiện độ dài
            </label>
            <div className="flex items-center gap-1.5">
              <span className="text-sm font-bold text-[#172B4D]">Chia đều thành</span>
              <input type="number" min={2} max={12} value={parts} onChange={(e) => setParts(Math.max(2, Math.min(12, Number(e.target.value) || 2)))} className="w-14 rounded-lg border-2 border-[#DCE7F3] px-2 py-1 text-sm font-bold" aria-label="Số phần" />
              <span className="text-sm font-bold text-[#172B4D]">phần</span>
              <button type="button" onClick={() => apply(divideSegment(doc, o.a, o.b, parts))} className="studio-btn studio-btn-secondary min-h-[34px] px-3 text-sm">
                Chia
              </button>
            </div>
            <button
              type="button"
              onClick={() => apply(addPoint(doc, { kind: 'midpoint', a: o.a, b: o.b }).doc)}
              className="studio-btn studio-btn-secondary min-h-[34px] w-full text-sm"
            >
              Thêm trung điểm
            </button>
          </div>
        )}

        {o.type === 'polygon' && (
          <div className="space-y-2">
            <label className="flex items-center gap-2 text-sm font-bold text-[#172B4D]">
              <input type="checkbox" checked={!!o.showLengths} onChange={(e) => patchObj(o.id, { showLengths: e.target.checked || undefined })} className="h-4 w-4 accent-[#1267E9]" />
              Hiện độ dài các cạnh
            </label>
            <Section title="Tên các đỉnh">
              <div className="flex flex-wrap gap-1.5">
                {o.pts.map((id) => (
                  <button key={id} type="button" onClick={() => onSelect([id])} className="h-8 min-w-[34px] rounded-lg bg-[#F6FAFF] px-2 text-sm font-bold italic text-[#071A63] ring-1 ring-[#DCE7F3]">
                    {name(id)}
                  </button>
                ))}
              </div>
            </Section>
            {o.pts.length >= 4 && (
              <button type="button" onClick={() => apply(addDiagonals(doc, o.id))} className="studio-btn studio-btn-secondary min-h-[34px] w-full text-sm">
                Thêm các đường chéo
              </button>
            )}
            {(o.shape === 'square' || o.shape === 'rectangle') && (
              <button type="button" onClick={() => apply(addCornerMarks(doc, o.id))} className="studio-btn studio-btn-secondary min-h-[34px] w-full text-sm">
                Thêm ký hiệu góc vuông ở 4 góc
              </button>
            )}
            {o.pts.length === 3 && (
              <Section title="Đường trong tam giác">
                <div className="grid grid-cols-3 gap-1">
                  {o.pts.map((id, i) => (
                    <button key={`h${id}`} type="button" onClick={() => apply(addAltitude(doc, o.id, i))} className="min-h-[34px] rounded-lg bg-[#F6FAFF] px-1 text-xs font-bold text-[#071A63] ring-1 ring-[#DCE7F3]">
                      Đường cao từ {name(id)}
                    </button>
                  ))}
                  {o.pts.map((id, i) => (
                    <button key={`m${id}`} type="button" onClick={() => apply(addMedian(doc, o.id, i))} className="min-h-[34px] rounded-lg bg-[#F6FAFF] px-1 text-xs font-bold text-[#071A63] ring-1 ring-[#DCE7F3]">
                      Trung tuyến từ {name(id)}
                    </button>
                  ))}
                </div>
              </Section>
            )}
            <Section title="Chia một cạnh thành các phần bằng nhau">
              <div className="flex flex-wrap items-center gap-1.5">
                {o.pts.map((id, i) => {
                  const next = o.pts[(i + 1) % o.pts.length];
                  return (
                    <button
                      key={`d${id}`}
                      type="button"
                      onClick={() => apply(divideSegment(doc, id, next, parts))}
                      className="h-8 rounded-lg bg-[#F6FAFF] px-2 text-xs font-bold text-[#071A63] ring-1 ring-[#DCE7F3]"
                    >
                      {name(id)}
                      {name(next)}
                    </button>
                  );
                })}
                <span className="text-xs font-bold text-[#5E6C84]">thành</span>
                <input type="number" min={2} max={12} value={parts} onChange={(e) => setParts(Math.max(2, Math.min(12, Number(e.target.value) || 2)))} className="w-14 rounded-lg border-2 border-[#DCE7F3] px-2 py-1 text-sm font-bold" aria-label="Số phần chia cạnh" />
              </div>
            </Section>
          </div>
        )}

        {o.type === 'circle' && (
          <div className="grid grid-cols-2 gap-1.5">
            <button type="button" onClick={() => apply(addRadius(doc, o.id))} className="studio-btn studio-btn-secondary min-h-[34px] px-2 text-sm">
              Thêm bán kính
            </button>
            <button type="button" onClick={() => apply(addDiameter(doc, o.id))} className="studio-btn studio-btn-secondary min-h-[34px] px-2 text-sm">
              Thêm đường kính
            </button>
          </div>
        )}

        {o.type === 'rightMark' ? (
          <Section title="Cỡ ký hiệu">
            <input type="range" min={6} max={30} value={o.size} onChange={(e) => patchObj(o.id, { size: Number(e.target.value) })} className="w-full accent-[#1267E9]" />
            <Swatches colors={COLORS} value={o.style.stroke} onPick={(c) => patchStyle({ stroke: c })} label="Màu" />
          </Section>
        ) : (
          'style' in o && <StrokeEditor style={o.style} onChange={patchStyle} fill={o.type === 'polygon' || o.type === 'circle'} />
        )}
        {actions}
      </div>
    );
  }

  // ---- several items
  const segs = objs.filter((o): o is Extract<GObject, { type: 'segment' }> => o.type === 'segment');
  const styled = objs.find((o) => 'style' in o) as Extract<GObject, { style: Stroke }> | undefined;
  return (
    <div className="space-y-4">
      <p className="font-display text-base font-extrabold text-[#071A63]">Đang chọn {selected.length} đối tượng</p>
      {segs.length === 2 && (
        <button
          type="button"
          onClick={() => apply(addPoint(doc, { kind: 'intersection', a: segs[0].a, b: segs[0].b, c: segs[1].a, d: segs[1].b }).doc)}
          className="studio-btn studio-btn-primary min-h-[36px] w-full text-sm"
        >
          Thêm giao điểm của hai đoạn
        </button>
      )}
      {pts.length === 2 && objs.length === 0 && (
        <button type="button" onClick={() => apply(connect(doc, 'segment', pts[0].id, pts[1].id).doc)} className="studio-btn studio-btn-primary min-h-[36px] w-full text-sm">
          Nối {pts[0].name}
          {pts[1].name} bằng đoạn thẳng
        </button>
      )}
      {styled && <StrokeEditor style={styled.style} onChange={patchStyle} />}
      {actions}
    </div>
  );
};
