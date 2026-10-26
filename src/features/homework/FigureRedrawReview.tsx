import React, { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2, Plus, RotateCcw, Trash2, X, XCircle } from 'lucide-react';
import { STUDIO_INPUT, STUDIO_LABEL } from '../../components/studio/StudioUi';
import {
  cellsFromRows,
  checkFigureSpec,
  EMPTY_SPEC,
  FIGURE_FILLS,
  GRID_SYMBOL_HELP,
  parseFigureSpec,
  redrawStatus,
  rowsFromCells,
  type FigureRedraw,
  type FigureSpec,
  type FigureVerification,
  type RedrawStatus,
} from './figureSpec';
import { FigureSvg } from './figureSvg';
import type { RedrawAttempt } from './figureRedrawService';

/**
 * Where the teacher decides about one figure: the original next to the
 * redraw, what the AI was unsure of, what the checks found, and the parts of
 * the drawing they can correct. Nothing is used until "Dùng hình vẽ lại".
 */

export interface ReviewFigure {
  key: string;
  url: string;
  /** "Câu 6" */
  label: string;
  questionText: string;
  redraw?: FigureRedraw;
  /** Why automatic redrawing kept the original. */
  skipped?: string;
}

interface Props {
  figure: ReviewFigure;
  /** AI attempts this session, oldest first. */
  attempts: RedrawAttempt[];
  running: boolean;
  error: string;
  onRedrawAgain: (hint: string) => void;
  /** Compare an edited drawing with the original again (AI). */
  onCompare: (spec: FigureSpec) => Promise<FigureVerification>;
  onApprove: (spec: FigureSpec, origin: FigureRedraw['origin']) => void;
  onKeepOriginal: () => void;
  onClose: () => void;
}

export const STATUS_TEXT: Record<RedrawStatus, { text: string; tone: string }> = {
  ok: { text: 'Khớp hình gốc – chờ thầy cô duyệt', tone: 'bg-emerald-50 text-emerald-800 border-emerald-300' },
  review: { text: 'Cần giáo viên kiểm tra', tone: 'bg-amber-50 text-amber-900 border-amber-300' },
  wrong: { text: 'Hình vẽ lại có chỗ sai – chưa dùng được', tone: 'bg-rose-50 text-rose-800 border-rose-300' },
  unsupported: { text: 'Không thể tái dựng chính xác, đang giữ hình gốc', tone: 'bg-slate-100 text-slate-700 border-slate-300' },
};

const FILL_TEXT: Record<(typeof FIGURE_FILLS)[number], string> = { none: 'Không tô', light: 'Tô nhạt', dark: 'Tô đậm' };
const VERDICT_TEXT: Record<FigureVerification['verdict'], string> = {
  match: 'AI so sánh: khớp hình gốc',
  minor_differences: 'AI so sánh: khác biệt nhỏ',
  mismatch: 'AI so sánh: KHÁC hình gốc',
  cannot_tell: 'AI so sánh: hình gốc quá mờ để so',
};
const DIFF_TEXT = { missing: 'Thiếu', extra: 'Thừa', wrong: 'Sai' } as const;

/** Starting points when the AI could not redraw a figure and the teacher builds it by hand. */
const STARTERS: { label: string; spec: FigureSpec }[] = [
  { label: 'Lưới ô vuông', spec: { ...EMPTY_SPEC, kind: 'grid', grid: { x: 0, y: 0, cellSize: 30, cells: cellsFromRows(['■■', '■■']) } } },
  {
    label: 'Hình học',
    spec: {
      ...EMPTY_SPEC,
      points: [
        { id: 'A', label: 'A', x: 0, y: 0, labelPos: 'auto' },
        { id: 'B', label: 'B', x: 200, y: 0, labelPos: 'auto' },
        { id: 'C', label: 'C', x: 200, y: 120, labelPos: 'auto' },
        { id: 'D', label: 'D', x: 0, y: 120, labelPos: 'auto' },
      ],
      segments: [
        { from: 'A', to: 'B', dashed: false, label: '', labelSide: 'auto' },
        { from: 'B', to: 'C', dashed: false, label: '', labelSide: 'auto' },
        { from: 'C', to: 'D', dashed: false, label: '', labelSide: 'auto' },
        { from: 'D', to: 'A', dashed: false, label: '', labelSide: 'auto' },
      ],
    },
  },
  { label: 'Bảng', spec: { ...EMPTY_SPEC, kind: 'table', table: { header: true, rows: [{ cells: ['', ''] }, { cells: ['', ''] }] } } },
  { label: 'Đồng hồ', spec: { ...EMPTY_SPEC, kind: 'clock', clocks: [{ x: 100, y: 100, radius: 90, hour: 12, minute: 0 }] } },
  { label: 'Phân số', spec: { ...EMPTY_SPEC, kind: 'fraction', fractions: [{ shape: 'bar', x: 0, y: 0, size: 240, parts: 4, shaded: [0] }] } },
];

const num = (v: string) => (Number.isFinite(Number(v)) ? Number(v) : 0);

interface Version {
  id: string;
  title: string;
  spec: FigureSpec;
}

export const FigureRedrawReview: React.FC<Props> = ({ figure, attempts, running, error, onRedrawAgain, onCompare, onApprove, onKeepOriginal, onClose }) => {
  const latest = attempts[attempts.length - 1];
  const versions = useMemo<Version[]>(() => {
    const list: Version[] = [];
    attempts.forEach((a, i) => a.spec && list.push({ id: `ai${i}`, title: `AI vẽ lần ${i + 1}`, spec: a.spec }));
    if (figure.redraw) list.push({ id: 'approved', title: `Bản đã duyệt${figure.redraw.active ? ', đang dùng' : ', chưa dùng'} (${new Date(figure.redraw.approvedAt).toLocaleString('vi-VN')})`, spec: figure.redraw.spec });
    figure.redraw?.history?.forEach((h, i) => list.push({ id: `h${i}`, title: `Bản duyệt trước (${new Date(h.approvedAt).toLocaleString('vi-VN')})`, spec: h.spec }));
    return list;
  }, [attempts, figure.redraw]);

  const start = latest?.spec ?? figure.redraw?.spec ?? null;
  const [baseId, setBaseId] = useState(latest?.spec ? `ai${attempts.length - 1}` : 'approved');
  const [draft, setDraft] = useState<FigureSpec | null>(start);
  const [edited, setEdited] = useState(false);
  const [recheck, setRecheck] = useState<FigureVerification | null>(null);
  const [checking, setChecking] = useState(false);
  const [checkError, setCheckError] = useState('');
  const [zoom, setZoom] = useState(1);
  const [hint, setHint] = useState('');
  const [confirmed, setConfirmed] = useState(false);
  const [gridText, setGridText] = useState(() => (start ? rowsFromCells(start.grid.cells).join('\n') : ''));

  // A new AI attempt arrives: show it
  const [seenAttempts, setSeenAttempts] = useState(attempts.length);
  if (attempts.length !== seenAttempts) {
    setSeenAttempts(attempts.length);
    if (latest?.spec) {
      setDraft(latest.spec);
      setGridText(rowsFromCells(latest.spec.grid.cells).join('\n'));
      setBaseId(`ai${attempts.length - 1}`);
      setEdited(false);
      setRecheck(null);
      setConfirmed(false);
    }
  }

  const fromAttempt = !edited && baseId.startsWith('ai') ? attempts[Number(baseId.slice(2))] : undefined;
  const issues = useMemo(() => (draft ? checkFigureSpec(draft, figure.questionText) : []), [draft, figure.questionText]);
  const verification = recheck ?? fromAttempt?.verification ?? null;
  const uncertain = fromAttempt?.uncertain ?? [];
  const status: RedrawStatus | null = draft ? redrawStatus(issues, uncertain, verification) : null;
  const hasError = issues.some((i) => i.level === 'error');
  const valid = draft ? parseFigureSpec(draft) !== null : false;
  const needsConfirm = status === 'wrong' || status === 'review';

  const update = (fn: (s: FigureSpec) => FigureSpec) => {
    setDraft((d) => (d ? fn(d) : d));
    setEdited(true);
    setRecheck(null);
    setConfirmed(false);
  };
  const restore = (v: Version) => {
    setDraft(v.spec);
    setGridText(rowsFromCells(v.spec.grid.cells).join('\n'));
    setBaseId(v.id);
    setEdited(false);
    setRecheck(null);
    setConfirmed(false);
  };
  const compareAgain = async () => {
    if (!draft) return;
    setChecking(true);
    setCheckError('');
    try {
      setRecheck(await onCompare(draft));
    } catch (err) {
      setCheckError(err instanceof Error ? err.message : String(err));
    } finally {
      setChecking(false);
    }
  };

  const startManual = (spec: FigureSpec) => {
    setDraft(spec);
    setGridText(rowsFromCells(spec.grid.cells).join('\n'));
    setBaseId('manual');
    setEdited(true);
    setRecheck(null);
    setConfirmed(false);
  };

  const ids = draft?.points.map((p) => p.id) ?? [];
  const nextId = () => {
    for (let i = 1; ; i++) if (!ids.includes(`P${i}`)) return `P${i}`;
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/60 p-3" role="dialog" aria-modal="true" aria-label={`Duyệt hình ${figure.label}`}>
      <div className="flex max-h-[96vh] w-full max-w-6xl flex-col overflow-hidden rounded-3xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-[#EEF3F9] px-5 py-3">
          <div>
            <h2 className="text-lg font-extrabold text-[#172B4D]">Duyệt hình vẽ lại – {figure.label}</h2>
            <p className="text-xs text-[#5E6C84]">So từng nhãn, số đo, đường kẻ, ô tô màu với hình gốc. Chỉ khi thầy cô bấm “Dùng hình vẽ lại” thì tệp Word mới dùng hình này.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Đóng" className="rounded-xl p-2 text-[#5E6C84] hover:bg-[#F6FAFF]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5 text-sm">
          <div className="mb-2 flex items-center gap-3 text-xs font-bold text-[#3B4A66]">
            <label htmlFor="fig-zoom">Phóng to</label>
            <input id="fig-zoom" type="range" min={0.5} max={3} step={0.25} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} />
            <span>{Math.round(zoom * 100)}%</span>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <figure className="rounded-2xl border border-[#DCE7F3] p-2">
              <figcaption className="mb-1 text-xs font-extrabold text-[#5E6C84]">Hình gốc</figcaption>
              <div className="h-72 overflow-auto bg-[#F8FAFC]" data-testid="fig-original">
                <img src={figure.url} alt={`Hình gốc ${figure.label}`} style={{ width: `${zoom * 100}%`, maxWidth: 'none' }} />
              </div>
            </figure>
            <figure className="rounded-2xl border border-[#DCE7F3] p-2">
              <figcaption className="mb-1 flex items-center gap-2 text-xs font-extrabold text-[#5E6C84]">
                Hình vẽ lại {edited && <span className="rounded bg-blue-50 px-1.5 text-[#2563EB]">đã chỉnh tay</span>}
              </figcaption>
              <div className="h-72 overflow-auto bg-white" data-testid="fig-redraw">
                {running ? (
                  <div className="flex h-full items-center justify-center gap-2 text-xs text-[#5E6C84]">
                    <Loader2 className="h-4 w-4 animate-spin" /> AI đang đọc và so sánh hình…
                  </div>
                ) : draft && valid ? (
                  <div style={{ width: `${zoom * 100}%` }}>
                    <FigureSvg spec={draft} className="h-auto w-full" />
                  </div>
                ) : (
                  <div className="flex h-full flex-col items-center justify-center gap-2 p-4 text-center text-xs text-[#5E6C84]">
                    <p>{latest && !latest.spec ? `Không thể tái dựng chính xác, đang giữ hình gốc. ${latest.reason}` : draft ? 'Dữ liệu hình chưa hợp lệ – hãy sửa các mục bên dưới.' : 'Chưa có hình vẽ lại.'}</p>
                    {!draft && (
                      <>
                        <p className="font-bold text-amber-800">Cần giáo viên kiểm tra. Thầy cô có thể giữ hình gốc, nhờ AI vẽ lại lần nữa, hoặc tự dựng hình:</p>
                        <div className="flex flex-wrap justify-center gap-1.5">
                          {STARTERS.map((st) => (
                            <button key={st.label} type="button" onClick={() => startManual(st.spec)} className="rounded-lg border border-[#DCE7F3] bg-white px-2 py-1 font-bold text-[#2563EB]">
                              {st.label}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>
                )}
              </div>
            </figure>
          </div>

          {error && (
            <div role="alert" className="mt-3 rounded-xl border border-rose-300 bg-rose-50 p-3 text-xs font-bold text-rose-700">
              {error}
            </div>
          )}

          {draft && status && (
            <div className="mt-3 space-y-2" data-testid="fig-findings">
              <div className={`rounded-xl border px-3 py-2 text-xs font-extrabold ${STATUS_TEXT[status].tone}`} data-testid="fig-status">
                {STATUS_TEXT[status].text}
              </div>
              {uncertain.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900">
                  <p className="font-extrabold">AI chưa đọc chắc chắn:</p>
                  <ul className="ml-4 list-disc">{uncertain.map((u) => <li key={u}>{u}</li>)}</ul>
                </div>
              )}
              {verification && (
                <div className={`rounded-xl border p-3 text-xs ${verification.verdict === 'mismatch' ? 'border-rose-300 bg-rose-50 text-rose-800' : 'border-[#DCE7F3] bg-[#F8FAFC] text-[#3B4A66]'}`}>
                  <p className="font-extrabold">{VERDICT_TEXT[verification.verdict]}{recheck ? ' (sau khi chỉnh)' : ''}</p>
                  {verification.summary && <p>{verification.summary}</p>}
                  {verification.differences.length > 0 && (
                    <ul className="ml-4 list-disc">{verification.differences.map((d, i) => <li key={i}><b>{DIFF_TEXT[d.kind]}:</b> {d.detail}</li>)}</ul>
                  )}
                </div>
              )}
              {!verification && !edited && fromAttempt?.verifyError && (
                <p className="text-xs text-amber-800">AI chưa so sánh được với hình gốc ({fromAttempt.verifyError}). Thầy cô cần tự so kỹ.</p>
              )}
              {edited && !recheck && <p className="text-xs text-[#5E6C84]">Hình đã chỉnh tay: kết quả AI so sánh trước đó không còn áp dụng.</p>}
              {issues.length > 0 && (
                <ul className="space-y-1 text-xs">
                  {issues.map((i, k) => (
                    <li key={k} className={`flex gap-1.5 ${i.level === 'error' ? 'text-rose-700' : i.level === 'warning' ? 'text-amber-800' : 'text-[#5E6C84]'}`}>
                      {i.level === 'error' ? <XCircle className="h-3.5 w-3.5 shrink-0" /> : i.level === 'warning' ? <AlertTriangle className="h-3.5 w-3.5 shrink-0" /> : <CheckCircle2 className="h-3.5 w-3.5 shrink-0" />}
                      {i.message}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {draft && (
            <details className="mt-4 rounded-2xl border border-[#DCE7F3] p-3" open={status !== 'ok'}>
              <summary className="cursor-pointer text-xs font-extrabold text-[#172B4D]">Chỉnh sửa hình vẽ lại</summary>
              <div className="mt-3 space-y-4">
                {(draft.points.length > 0 || draft.kind === 'geometry' || draft.kind === 'diagram') && (
                  <section>
                    <h3 className={STUDIO_LABEL}>Điểm và nhãn</h3>
                    <div className="space-y-1">
                      {draft.points.map((p, idx) => (
                        <div key={p.id} className="flex items-center gap-1.5 text-xs">
                          <span className="w-10 font-mono text-[#5E6C84]">{p.id}</span>
                          <input aria-label={`Nhãn điểm ${p.id}`} className={`${STUDIO_INPUT} w-20`} value={p.label} maxLength={12}
                            onChange={(e) => update((s) => ({ ...s, points: s.points.map((q, i) => (i === idx ? { ...q, label: e.target.value } : q)) }))} />
                          <input aria-label={`Hoành độ ${p.id}`} type="number" className={`${STUDIO_INPUT} w-20`} value={p.x}
                            onChange={(e) => update((s) => ({ ...s, points: s.points.map((q, i) => (i === idx ? { ...q, x: num(e.target.value) } : q)) }))} />
                          <input aria-label={`Tung độ ${p.id}`} type="number" className={`${STUDIO_INPUT} w-20`} value={p.y}
                            onChange={(e) => update((s) => ({ ...s, points: s.points.map((q, i) => (i === idx ? { ...q, y: num(e.target.value) } : q)) }))} />
                          <button type="button" aria-label={`Xóa điểm ${p.id}`} className="rounded p-1 text-rose-600 hover:bg-rose-50"
                            onClick={() => update((s) => ({
                              ...s,
                              points: s.points.filter((q) => q.id !== p.id),
                              segments: s.segments.filter((g) => g.from !== p.id && g.to !== p.id),
                              polygons: s.polygons.map((g) => ({ ...g, points: g.points.filter((x) => x !== p.id) })).filter((g) => g.points.length >= 3),
                              circles: s.circles.filter((c) => c.center !== p.id),
                              rightAngles: s.rightAngles.filter((r) => ![r.at, r.from, r.to].includes(p.id)),
                            }))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      <button type="button" className="flex items-center gap-1 text-xs font-bold text-[#2563EB]"
                        onClick={() => update((s) => ({ ...s, points: [...s.points, { id: nextId(), label: '', x: 0, y: 0, labelPos: 'auto' }] }))}>
                        <Plus className="h-3.5 w-3.5" /> Thêm điểm
                      </button>
                    </div>
                  </section>
                )}

                {(draft.segments.length > 0 || draft.points.length > 1) && (
                  <section>
                    <h3 className={STUDIO_LABEL}>Đường kẻ và số đo</h3>
                    <div className="space-y-1">
                      {draft.segments.map((g, idx) => (
                        <div key={idx} className="flex flex-wrap items-center gap-1.5 text-xs">
                          {(['from', 'to'] as const).map((end) => (
                            <select key={end} aria-label={end === 'from' ? `Đầu đoạn ${idx + 1}` : `Cuối đoạn ${idx + 1}`} className={`${STUDIO_INPUT} w-20`} value={g[end]}
                              onChange={(e) => update((s) => ({ ...s, segments: s.segments.map((q, i) => (i === idx ? { ...q, [end]: e.target.value } : q)) }))}>
                              {ids.map((id) => <option key={id} value={id}>{draft.points.find((p) => p.id === id)?.label || id}</option>)}
                            </select>
                          ))}
                          <input aria-label={`Số đo đoạn ${idx + 1}`} placeholder="Số đo (vd 7 cm)" className={`${STUDIO_INPUT} w-32`} value={g.label} maxLength={24}
                            onChange={(e) => update((s) => ({ ...s, segments: s.segments.map((q, i) => (i === idx ? { ...q, label: e.target.value } : q)) }))} />
                          <label className="flex items-center gap-1">
                            <input type="checkbox" checked={g.dashed}
                              onChange={(e) => update((s) => ({ ...s, segments: s.segments.map((q, i) => (i === idx ? { ...q, dashed: e.target.checked } : q)) }))} />
                            nét đứt
                          </label>
                          <button type="button" aria-label={`Xóa đoạn ${idx + 1}`} className="rounded p-1 text-rose-600 hover:bg-rose-50"
                            onClick={() => update((s) => ({ ...s, segments: s.segments.filter((_q, i) => i !== idx) }))}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      ))}
                      {ids.length > 1 && (
                        <button type="button" className="flex items-center gap-1 text-xs font-bold text-[#2563EB]"
                          onClick={() => update((s) => ({ ...s, segments: [...s.segments, { from: ids[0], to: ids[1], dashed: false, label: '', labelSide: 'auto' }] }))}>
                          <Plus className="h-3.5 w-3.5" /> Thêm đoạn thẳng
                        </button>
                      )}
                    </div>
                  </section>
                )}

                {(draft.polygons.length > 0 || draft.circles.length > 0) && (
                  <section>
                    <h3 className={STUDIO_LABEL}>Tô màu</h3>
                    {draft.polygons.map((g, idx) => (
                      <div key={`p${idx}`} className="flex items-center gap-2 text-xs">
                        <span>Vùng {g.points.map((id) => draft.points.find((p) => p.id === id)?.label || id).join('')}</span>
                        <select aria-label={`Tô vùng ${idx + 1}`} className={`${STUDIO_INPUT} w-28`} value={g.fill}
                          onChange={(e) => update((s) => ({ ...s, polygons: s.polygons.map((q, i) => (i === idx ? { ...q, fill: e.target.value as typeof g.fill } : q)) }))}>
                          {FIGURE_FILLS.map((f) => <option key={f} value={f}>{FILL_TEXT[f]}</option>)}
                        </select>
                        <button type="button" aria-label={`Xóa vùng ${idx + 1}`} className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => update((s) => ({ ...s, polygons: s.polygons.filter((_q, i) => i !== idx) }))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {draft.circles.map((c, idx) => (
                      <div key={`c${idx}`} className="flex items-center gap-2 text-xs">
                        <span>Hình tròn tâm {draft.points.find((p) => p.id === c.center)?.label || c.center}</span>
                        <select aria-label={`Tô hình tròn ${idx + 1}`} className={`${STUDIO_INPUT} w-28`} value={c.fill}
                          onChange={(e) => update((s) => ({ ...s, circles: s.circles.map((q, i) => (i === idx ? { ...q, fill: e.target.value as typeof c.fill } : q)) }))}>
                          {FIGURE_FILLS.map((f) => <option key={f} value={f}>{FILL_TEXT[f]}</option>)}
                        </select>
                      </div>
                    ))}
                  </section>
                )}

                {draft.rightAngles.length > 0 && (
                  <section>
                    <h3 className={STUDIO_LABEL}>Ký hiệu góc vuông</h3>
                    {draft.rightAngles.map((r, idx) => (
                      <div key={idx} className="flex items-center gap-2 text-xs">
                        <span>Góc vuông tại {draft.points.find((p) => p.id === r.at)?.label || r.at}</span>
                        <button type="button" aria-label={`Xóa góc vuông ${idx + 1}`} className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => update((s) => ({ ...s, rightAngles: s.rightAngles.filter((_q, i) => i !== idx) }))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </section>
                )}

                {(draft.kind === 'grid' || draft.grid.cells.length > 0) && (
                  <section>
                    <h3 className={STUDIO_LABEL}>Ô vuông (mỗi dòng là một hàng ô, từ trên xuống)</h3>
                    <textarea aria-label="Các hàng ô vuông" rows={Math.max(3, gridText.split('\n').length)} className={STUDIO_INPUT} style={{ fontSize: 26, lineHeight: 1.25, letterSpacing: '0.35em', fontFamily: '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif' }} value={gridText}
                      onChange={(e) => {
                        setGridText(e.target.value);
                        const cells = cellsFromRows(e.target.value.split('\n'));
                        update((s) => ({ ...s, grid: { ...s.grid, cellSize: s.grid.cellSize || 30, cells } }));
                      }} />
                    <p className="mt-1 flex flex-wrap gap-x-3 text-xs text-[#5E6C84]">
                      {GRID_SYMBOL_HELP.map(([ch, text]) => (
                        <button key={ch} type="button" className="hover:text-[#2563EB]" title="Chép ký hiệu" onClick={() => void navigator.clipboard?.writeText(ch)}>
                          <b style={{ fontSize: 18, fontFamily: '"Segoe UI Symbol", "Apple Symbols", "DejaVu Sans", sans-serif' }}>{ch}</b> {text}
                        </button>
                      ))}
                    </p>
                  </section>
                )}

                {draft.clocks.map((c, idx) => (
                  <section key={`clock${idx}`}>
                    <h3 className={STUDIO_LABEL}>Đồng hồ {draft.clocks.length > 1 ? idx + 1 : ''}</h3>
                    <div className="flex items-center gap-2 text-xs">
                      <input aria-label="Giờ" type="number" min={1} max={12} className={`${STUDIO_INPUT} w-20`} value={c.hour}
                        onChange={(e) => update((s) => ({ ...s, clocks: s.clocks.map((q, i) => (i === idx ? { ...q, hour: Math.round(num(e.target.value)) } : q)) }))} />
                      giờ
                      <input aria-label="Phút" type="number" min={0} max={59} className={`${STUDIO_INPUT} w-20`} value={c.minute}
                        onChange={(e) => update((s) => ({ ...s, clocks: s.clocks.map((q, i) => (i === idx ? { ...q, minute: Math.round(num(e.target.value)) } : q)) }))} />
                      phút
                    </div>
                  </section>
                ))}

                {draft.fractions.map((f, idx) => (
                  <section key={`frac${idx}`}>
                    <h3 className={STUDIO_LABEL}>Hình phân số {draft.fractions.length > 1 ? idx + 1 : ''}</h3>
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      Chia
                      <input aria-label="Số phần" type="number" min={1} max={24} className={`${STUDIO_INPUT} w-20`} value={f.parts}
                        onChange={(e) => update((s) => ({ ...s, fractions: s.fractions.map((q, i) => (i === idx ? { ...q, parts: Math.round(num(e.target.value)) } : q)) }))} />
                      phần, tô các phần số
                      <input aria-label="Phần được tô" className={`${STUDIO_INPUT} w-32`} value={f.shaded.map((i) => i + 1).join(', ')}
                        onChange={(e) => update((s) => ({
                          ...s,
                          fractions: s.fractions.map((q, i) => (i === idx ? { ...q, shaded: [...new Set(e.target.value.split(/[,\s]+/).filter(Boolean).map((x) => Math.round(num(x)) - 1).filter((x) => x >= 0))] } : q)),
                        }))} />
                    </div>
                  </section>
                ))}

                {draft.kind === 'table' && (
                  <section>
                    <h3 className={STUDIO_LABEL}>Bảng</h3>
                    <label className="mb-1 flex items-center gap-1 text-xs">
                      <input type="checkbox" checked={draft.table.header} onChange={(e) => update((s) => ({ ...s, table: { ...s.table, header: e.target.checked } }))} />
                      Hàng đầu là tiêu đề
                    </label>
                    <div className="overflow-x-auto">
                      <table className="text-xs">
                        <tbody>
                          {draft.table.rows.map((row, r) => (
                            <tr key={r}>
                              {row.cells.map((cell, c) => (
                                <td key={c} className="p-0.5">
                                  <input aria-label={`Ô hàng ${r + 1} cột ${c + 1}`} className={`${STUDIO_INPUT} w-28`} value={cell} maxLength={80}
                                    onChange={(e) => update((s) => ({ ...s, table: { ...s.table, rows: s.table.rows.map((q, i) => (i === r ? { cells: q.cells.map((x, j) => (j === c ? e.target.value : x)) } : q)) } }))} />
                                </td>
                              ))}
                              <td>
                                <button type="button" aria-label={`Xóa hàng ${r + 1}`} className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => update((s) => ({ ...s, table: { ...s.table, rows: s.table.rows.filter((_q, i) => i !== r) } }))}>
                                  <Trash2 className="h-3.5 w-3.5" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-1 flex gap-3 text-xs font-bold text-[#2563EB]">
                      <button type="button" onClick={() => update((s) => ({ ...s, table: { ...s.table, rows: [...s.table.rows, { cells: Array(Math.max(1, s.table.rows[0]?.cells.length ?? 1)).fill('') }] } }))}>+ Thêm hàng</button>
                      <button type="button" onClick={() => update((s) => ({ ...s, table: { ...s.table, rows: s.table.rows.map((q) => ({ cells: [...q.cells, ''] })) } }))}>+ Thêm cột</button>
                    </div>
                  </section>
                )}

                {(draft.texts.length > 0 || draft.arrows.length > 0) && (
                  <section>
                    <h3 className={STUDIO_LABEL}>Chữ và mũi tên trong hình</h3>
                    {draft.texts.map((t, idx) => (
                      <div key={`t${idx}`} className="flex items-center gap-1.5 text-xs">
                        <input aria-label={`Chữ ${idx + 1}`} className={`${STUDIO_INPUT} w-48`} value={t.text} maxLength={60}
                          onChange={(e) => update((s) => ({ ...s, texts: s.texts.map((q, i) => (i === idx ? { ...q, text: e.target.value } : q)) }))} />
                        <button type="button" aria-label={`Xóa chữ ${idx + 1}`} className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => update((s) => ({ ...s, texts: s.texts.filter((_q, i) => i !== idx) }))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                    {draft.arrows.map((_a, idx) => (
                      <div key={`a${idx}`} className="flex items-center gap-1.5 text-xs">
                        Mũi tên {idx + 1}
                        <button type="button" aria-label={`Xóa mũi tên ${idx + 1}`} className="rounded p-1 text-rose-600 hover:bg-rose-50" onClick={() => update((s) => ({ ...s, arrows: s.arrows.filter((_q, i) => i !== idx) }))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </section>
                )}

                {edited && (
                  <button type="button" disabled={checking || !valid} onClick={() => void compareAgain()} className="flex items-center gap-1.5 rounded-xl border border-[#DCE7F3] px-3 py-1.5 text-xs font-bold text-[#2563EB] disabled:opacity-50">
                    {checking && <Loader2 className="h-3.5 w-3.5 animate-spin" />} Nhờ AI so lại với hình gốc
                  </button>
                )}
                {checkError && <p className="text-xs text-rose-700">{checkError}</p>}
              </div>
            </details>
          )}

          <div className="mt-4 grid grid-cols-1 gap-3 md:grid-cols-2">
            <section className="rounded-2xl border border-[#DCE7F3] p-3">
              <h3 className={STUDIO_LABEL}>Vẽ lại lần nữa</h3>
              <textarea aria-label="Nhận xét cho AI" rows={2} className={STUDIO_INPUT} placeholder="Ví dụ: thiếu điểm C ở giữa cạnh DE; ô tô đậm ở cuối hàng dưới" value={hint} maxLength={500} onChange={(e) => setHint(e.target.value)} />
              <button type="button" disabled={running} onClick={() => onRedrawAgain(hint)} className="mt-1 flex items-center gap-1.5 rounded-xl border border-[#DCE7F3] px-3 py-1.5 text-xs font-bold text-[#2563EB] disabled:opacity-50">
                {running ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />} AI vẽ lại lần nữa
              </button>
            </section>
            {versions.length > 0 && (
              <section className="rounded-2xl border border-[#DCE7F3] p-3">
                <h3 className={STUDIO_LABEL}>Các phiên bản</h3>
                <ul className="space-y-1 text-xs">
                  {versions.map((v) => (
                    <li key={v.id} className="flex items-center justify-between gap-2">
                      <span className={v.id === baseId && !edited ? 'font-extrabold text-[#172B4D]' : ''}>{v.title}</span>
                      <button type="button" className="font-bold text-[#2563EB] disabled:opacity-40" disabled={v.id === baseId && !edited} onClick={() => restore(v)}>
                        Khôi phục
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-[#EEF3F9] px-5 py-3">
          {draft && needsConfirm && !hasError && (
            <label className="mr-auto flex items-center gap-2 text-xs font-bold text-[#3B4A66]">
              <input type="checkbox" checked={confirmed} onChange={(e) => setConfirmed(e.target.checked)} />
              {status === 'wrong' ? 'Tôi đã sửa và so kỹ: hình vẽ lại đúng như hình gốc' : 'Tôi đã so từng chi tiết với hình gốc'}
            </label>
          )}
          {hasError && <span className="mr-auto text-xs font-bold text-rose-700">Còn lỗi dữ liệu hình – sửa xong mới dùng được.</span>}
          <button type="button" onClick={onKeepOriginal} className="cartoon-button rounded-xl bg-white px-4 py-2 text-xs font-bold text-[#3B4A66]">
            Giữ hình gốc
          </button>
          <button
            type="button"
            disabled={!draft || !valid || hasError || running || (needsConfirm && !confirmed)}
            onClick={() => draft && onApprove(draft, edited || !baseId.startsWith('ai') ? 'edited' : 'ai')}
            className="cartoon-button flex items-center gap-1.5 rounded-xl bg-[#1F9D6B] px-5 py-2 text-xs font-extrabold text-white disabled:opacity-50"
          >
            <CheckCircle2 className="h-4 w-4" /> Dùng hình vẽ lại
          </button>
        </div>
      </div>
    </div>
  );
};
