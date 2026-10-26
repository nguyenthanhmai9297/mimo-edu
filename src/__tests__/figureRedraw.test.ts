import { describe, expect, it } from 'vitest';
import {
  cellsFromRows,
  checkFigureSpec,
  EMPTY_SPEC,
  gridArea,
  parseFigureRedraw,
  parseFigureSpec,
  pointNamesInText,
  redrawStatus,
  rowsFromCells,
  straightenSpec,
  type FigureSpec,
} from '../features/homework/figureSpec';
import { figureSvgMarkup } from '../features/homework/figureSvg';
import { docToRichText, richTextToDoc } from '../components/editor/richTextDoc';
import { figureSpecFromWire, type ClaudeFigureRead } from '../services/figureAI';
import { BANG_DOC_SACH, DONG_HO, HINH_H, LUOI_O, PHAN_SO } from './fixtures/figureSpecs';

const clone = <T,>(x: T): T => JSON.parse(JSON.stringify(x)) as T;
const Q6 = 'Hình H gồm hình vuông ABCD và hình chữ nhật DEGK như hình bên. Diện tích hình H là';

const wire = (spec: Record<string, unknown>, extra: Partial<ClaudeFigureRead> = {}): ClaudeFigureRead => ({
  redrawable: true,
  reason: '',
  kind: 'geometry',
  readings: { pointLabels: [], measurements: [], otherText: [] },
  uncertain: [],
  specJson: JSON.stringify(spec),
  ...extra,
});

describe('Mô tả hình: kiểm tra dữ liệu', () => {
  it('hình mẫu của đề lớp 3 (câu 4, 5, 6) và đồng hồ, phân số đều hợp lệ', () => {
    for (const spec of [HINH_H, LUOI_O, BANG_DOC_SACH, DONG_HO, PHAN_SO]) expect(parseFigureSpec(spec)).not.toBeNull();
  });

  it('từ chối mã điểm có ký tự lạ, số ngoài phạm vi, giờ sai', () => {
    expect(parseFigureSpec({ ...HINH_H, points: [{ ...HINH_H.points[0], id: '<script>' }] })).toBeNull();
    expect(parseFigureSpec({ ...HINH_H, points: [{ ...HINH_H.points[0], x: 1e9 }] })).toBeNull();
    expect(parseFigureSpec({ ...DONG_HO, clocks: [{ ...DONG_HO.clocks[0], hour: 13 }] })).toBeNull();
  });

  it('bản vẽ đã duyệt chỉ được đọc lại khi mô tả hình hợp lệ', () => {
    expect(parseFigureRedraw({ active: true, spec: HINH_H, approvedAt: '2026-10-26T00:00:00Z', origin: 'ai' })?.spec.points).toHaveLength(7);
    expect(parseFigureRedraw({ active: true, spec: { ...HINH_H, kind: 'virus' }, approvedAt: 'x', origin: 'ai' })).toBeNull();
    expect(parseFigureRedraw({ active: true, spec: HINH_H, origin: 'ai' })).toBeNull();
  });
});

describe('Kiểm tra tự động hình vẽ lại', () => {
  it('hình H đúng: không lỗi, không cảnh báo', () => {
    expect(checkFigureSpec(HINH_H, Q6).filter((i) => i.level !== 'info')).toEqual([]);
  });

  it('đọc tên điểm trong đề, không nhầm "Hình H" là điểm H', () => {
    expect(pointNamesInText(Q6)).toEqual(['A', 'B', 'C', 'D', 'E', 'G', 'K']);
    expect(pointNamesInText('Cho điểm M nằm trên cạnh BC')).toEqual(['B', 'C', 'M']);
  });

  it('đề nhắc điểm C mà hình vẽ lại mất C: cảnh báo, cần giáo viên kiểm tra', () => {
    const t = clone(HINH_H);
    t.points.find((p) => p.id === 'C')!.label = '';
    const issues = checkFigureSpec(t, Q6);
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('C'))).toBe(true);
    expect(redrawStatus(issues, [], { verdict: 'match', differences: [], summary: '' })).toBe('review');
  });

  it('đoạn thẳng nối tới điểm không có: lỗi', () => {
    const t = clone(HINH_H);
    t.segments.push({ from: 'A', to: 'Z', dashed: false, label: '', labelSide: 'auto' });
    expect(checkFigureSpec(t, Q6).some((i) => i.level === 'error')).toBe(true);
  });

  it('số đo không cân xứng với độ dài vẽ: cảnh báo', () => {
    const t = clone(HINH_H);
    t.segments.find((s) => s.label === '9 cm')!.label = '90 cm';
    expect(checkFigureSpec(t, Q6).some((i) => i.level === 'warning')).toBe(true);
  });

  it('lưới câu 4: 11 ô; ô trống bị các ô xung quanh khép kín thì cảnh báo', () => {
    expect(gridArea(LUOI_O)).toBe(11);
    const t = clone(LUOI_O);
    t.grid.cells = t.grid.cells.filter((c) => !(c.row === 1 && c.col === 2));
    const issues = checkFigureSpec(t, '');
    expect(issues.some((i) => i.level === 'warning' && i.message.includes('hàng 2, cột 3'))).toBe(true);
  });

  it('trạng thái: AI so sánh thấy khác → sai; AI còn chỗ chưa chắc → cần kiểm tra; khớp hết → ổn', () => {
    const match = { verdict: 'match' as const, differences: [], summary: '' };
    expect(redrawStatus([], [], { verdict: 'mismatch', differences: [{ kind: 'wrong', detail: '27 cm' }], summary: '' })).toBe('wrong');
    expect(redrawStatus([], ['số đo KG bị che'], match)).toBe('review');
    expect(redrawStatus([], [], null)).toBe('review');
    expect(redrawStatus([], [], { ...match, verdict: 'cannot_tell' })).toBe('review');
    expect(redrawStatus([], [], match)).toBe('ok');
  });
});

describe('Đọc kết quả AI thành mô tả hình', () => {
  it('mã điểm có dấu/khoảng trắng được làm sạch, các đoạn vẫn nối đúng', () => {
    const spec = figureSpecFromWire(
      wire({
        points: [
          { id: 'Đ 1', label: 'Đ', x: 0, y: 0, labelPos: 'auto' },
          { id: 'B', label: 'B', x: 100, y: 0, labelPos: 'kì lạ' },
        ],
        segments: [{ from: 'Đ 1', to: 'B', dashed: false, label: '5 cm', labelSide: 'above' }, { from: 'B', to: 'X' }],
      })
    )!;
    expect(spec.points.map((p) => p.id)).toEqual(['D_1', 'B']);
    expect(spec.points[1].labelPos).toBe('auto');
    expect(spec.segments).toEqual([{ from: 'D_1', to: 'B', dashed: false, label: '5 cm', labelSide: 'above' }]);
  });

  it('JSON hỏng hoặc không phải đối tượng: không có hình (không đoán)', () => {
    expect(figureSpecFromWire({ ...wire({}), specJson: '{points:' })).toBeNull();
    expect(figureSpecFromWire({ ...wire({}), specJson: '"abc"' })).toBeNull();
  });

  it('JSON bọc trong ``` hoặc có câu dẫn vẫn đọc được', () => {
    const spec = figureSpecFromWire({ ...wire({}), specJson: 'Đây là hình:\n```json\n{"points":[{"id":"A","label":"A","x":1,"y":2,"labelPos":"auto"}]}\n```' })!;
    expect(spec.points[0]).toMatchObject({ id: 'A', x: 1, y: 2 });
  });

  it('giờ âm hoặc lớn vẫn quy về 1–12', () => {
    const hours = [-13, -1, 0, 12, 13, 25].map((hour) => figureSpecFromWire(wire({ clocks: [{ x: 0, y: 0, radius: 50, hour, minute: 0 }] }, { kind: 'clock' }))!.clocks[0].hour);
    expect(hours).toEqual([11, 11, 12, 12, 1, 1]);
  });

  it('số ngoài phạm vi bị giới hạn; giờ đồng hồ quy về 1–12', () => {
    const spec = figureSpecFromWire(wire({ clocks: [{ x: 1e9, y: 0, radius: 50, hour: 14, minute: 75 }] }, { kind: 'clock' }))!;
    expect(spec.clocks[0]).toMatchObject({ x: 5000, hour: 2, minute: 59 });
  });

  it('lưới theo từng hàng ký hiệu: đúng hình câu 4', () => {
    const cells = cellsFromRows(['.◢■◣.', '◢■■■◣', '■■■■▪']);
    const spec = { ...EMPTY_SPEC, kind: 'grid' as const, grid: { x: 0, y: 0, cellSize: 20, cells } };
    expect(gridArea(spec)).toBe(11);
    const sorted = (s: FigureSpec) => [...s.grid.cells].sort((a, b) => a.row - b.row || a.col - b.col);
    expect(sorted(spec)).toEqual(sorted(LUOI_O));
    expect(rowsFromCells(LUOI_O.grid.cells)).toEqual(['.◢■◣.', '◢■■■◣', '■■■■▪']);
  });

  it('ảnh chụp nghiêng 8°: hình được dựng thẳng, cạnh ngang thành ngang', () => {
    const a = (8 * Math.PI) / 180;
    const turn = (x: number, y: number) => ({ x: x * Math.cos(a) - y * Math.sin(a) + 200, y: x * Math.sin(a) + y * Math.cos(a) + 50 });
    const tilted = clone(HINH_H);
    tilted.points = tilted.points.map((p) => ({ ...p, ...turn(p.x, p.y) }));
    const straight = straightenSpec(tilted);
    const by = (id: string) => straight.points.find((p) => p.id === id)!;
    expect(Math.abs(by('K').y - by('G').y)).toBeLessThan(0.5);
    expect(Math.abs(by('D').y - by('E').y)).toBeLessThan(0.5);
    expect(Math.abs(by('A').x - by('K').x)).toBeLessThan(0.5);
    // D, C, E stay on one line
    expect(Math.abs(by('C').y - by('D').y)).toBeLessThan(0.5);
  });

  it('hình chéo có chủ ý (tam giác) không bị bẻ thẳng', () => {
    const tri: FigureSpec = {
      ...EMPTY_SPEC,
      points: [
        { id: 'A', label: 'A', x: 0, y: 100, labelPos: 'auto' },
        { id: 'B', label: 'B', x: 100, y: 100, labelPos: 'auto' },
        { id: 'C', label: 'C', x: 30, y: 0, labelPos: 'auto' },
      ],
      segments: [
        { from: 'A', to: 'B', dashed: false, label: '', labelSide: 'auto' },
        { from: 'B', to: 'C', dashed: false, label: '', labelSide: 'auto' },
        { from: 'C', to: 'A', dashed: false, label: '', labelSide: 'auto' },
      ],
    };
    expect(straightenSpec(tri).points.map((p) => [p.x, p.y])).toEqual([
      [0, 100],
      [100, 100],
      [30, 0],
    ]);
  });
});

describe('Vẽ hình SVG', () => {
  it('hình H: đủ nhãn điểm, số đo, tên hình', () => {
    const { svg, width, height } = figureSvgMarkup(HINH_H);
    for (const t of ['A', 'B', 'C', 'D', 'E', 'G', 'K', '7 cm', '9 cm', '25 cm', 'Hình H']) expect(svg).toContain(`>${t}<`);
    expect(width).toBeGreaterThan(0);
    expect(height).toBeGreaterThan(0);
  });

  it('bảng câu 5: đủ nội dung ô', () => {
    const { svg } = figureSvgMarkup(BANG_DOC_SACH);
    for (const t of ['Bạn', 'Thanh', 'Hóa', 'Việt', 'Nam', 'Số giờ đọc sách', '8 giờ', '13 giờ', '14 giờ', '10 giờ']) expect(svg).toContain(t);
  });

  it('chữ do AI đọc được thoát ký tự: không chèn được thẻ hay mã', () => {
    const evil = clone(HINH_H);
    evil.texts = [{ text: '<script>alert(1)</script>', x: 10, y: 10 }];
    evil.points[0].label = '"><img';
    const { svg } = figureSvgMarkup(evil);
    expect(svg).not.toMatch(/<script|<img|onerror|href/i);
    expect(svg).toContain('&lt;script&gt;');
  });
});

describe('Lưu hình đã duyệt cùng câu hỏi', () => {
  it('đi qua trình soạn thảo (mở, sửa, lưu) không mất hình đã duyệt', () => {
    const redraw = { active: true, spec: HINH_H, approvedAt: '2026-10-26T08:00:00.000Z', origin: 'edited' as const, history: [] };
    const content = { version: 1 as const, blocks: [{ type: 'paragraph' as const, text: 'Hình H' }, { type: 'image' as const, url: 'https://x/h.png', redraw }] };
    const back = docToRichText(richTextToDoc(content));
    expect(back.blocks[1]).toEqual({ type: 'image', url: 'https://x/h.png', redraw });
    // Without a redraw nothing extra is written (Firestore rejects undefined)
    const plain = docToRichText(richTextToDoc({ version: 1, blocks: [{ type: 'image', url: 'https://x/h.png' }] }));
    expect(plain.blocks[0]).toEqual({ type: 'image', url: 'https://x/h.png' });
  });
});
