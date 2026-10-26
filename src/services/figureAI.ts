import { z } from 'zod';
import {
  CELL_SHAPES,
  EMPTY_SPEC,
  FIGURE_FILLS,
  FIGURE_KINDS,
  LABEL_POSITIONS,
  cellsFromRows,
  figureSpecSchema,
  straightenSpec,
  SEGMENT_LABEL_SIDES,
  type FigureSpec,
  type FigureVerification,
} from '../features/homework/figureSpec.js';

/**
 * Requests and replies for redrawing one figure with Claude:
 *   1. read: the figure picture → a figure description (no drawing by the AI);
 *   2. compare: the original next to MimoEDU's drawing of that description →
 *      the differences, so a wrong redraw is caught before a teacher uses it.
 * Wire schemas list every field as required (optional fields made the API
 * reject a schema as "too complex"); numbers are bounded afterwards by
 * figureSpecSchema, never trusted as sent.
 */

const enumOr = <T extends readonly [string, ...string[]]>(values: T, fallback: T[number]) => z.enum(values).catch(fallback);
const num = z.number().catch(0);
const str = z.string().catch('');
const list = <T extends z.ZodTypeAny>(item: T) => z.array(z.unknown()).catch([]).transform((xs) => xs.flatMap((x) => {
  const r = item.safeParse(x);
  return r.success ? [r.data as z.infer<T>] : [];
}));

/**
 * The figure description inside the reply (specJson), read leniently: a
 * missing list is empty, an unknown word falls back to a default, a broken
 * entry is dropped. figureSpecFromWire then bounds every value.
 */
export const wireFigureSpecSchema = z.object({
  points: list(z.object({ id: z.string(), label: str, x: z.number(), y: z.number(), labelPos: enumOr(LABEL_POSITIONS, 'auto') })),
  segments: list(z.object({ from: z.string(), to: z.string(), dashed: z.boolean().catch(false), label: str, labelSide: enumOr(SEGMENT_LABEL_SIDES, 'auto') })),
  polygons: list(z.object({ points: z.array(z.string()), fill: enumOr(FIGURE_FILLS, 'none') })),
  circles: list(z.object({ center: z.string(), radius: z.number(), fill: enumOr(FIGURE_FILLS, 'none') })),
  rightAngles: list(z.object({ at: z.string(), from: z.string(), to: z.string() })),
  arrows: list(z.object({ x1: z.number(), y1: z.number(), x2: z.number(), y2: z.number() })),
  texts: list(z.object({ text: z.string(), x: z.number(), y: z.number() })),
  grid: z
    .object({
      x: num,
      y: num,
      cellSize: num,
      rows: z.array(z.string()).catch([]),
      cells: list(z.object({ row: z.number(), col: z.number(), shape: enumOr(CELL_SHAPES, 'square'), fill: enumOr(FIGURE_FILLS, 'none') })),
    })
    .catch({ x: 0, y: 0, cellSize: 0, rows: [], cells: [] }),
  clocks: list(z.object({ x: z.number(), y: z.number(), radius: z.number(), hour: z.number(), minute: z.number() })),
  fractions: list(z.object({ shape: enumOr(['bar', 'circle'] as const, 'bar'), x: z.number(), y: z.number(), size: z.number(), parts: z.number(), shaded: z.array(z.number()).catch([]) })),
  table: z.object({ header: z.boolean().catch(false), rows: list(z.object({ cells: z.array(z.string()) })) }).catch({ header: false, rows: [] }),
});

/**
 * Claude's reply. The figure itself comes as a JSON string (specJson): a
 * fully typed schema for it compiled to a grammar the API refuses as too
 * large (400), so only this small envelope is constrained.
 */
export const claudeFigureReadSchema = z.object({
  redrawable: z.boolean(),
  reason: z.string(),
  kind: z.enum(FIGURE_KINDS),
  readings: z.object({
    pointLabels: z.array(z.string()),
    measurements: z.array(z.string()),
    otherText: z.array(z.string()),
  }),
  uncertain: z.array(z.string()),
  specJson: z.string(),
});
export type ClaudeFigureRead = z.infer<typeof claudeFigureReadSchema>;
type WireSpec = z.infer<typeof wireFigureSpecSchema>;

export const claudeFigureCompareSchema = z.object({
  verdict: z.enum(['match', 'minor_differences', 'mismatch', 'cannot_tell']),
  differences: z.array(z.object({ kind: z.enum(['missing', 'extra', 'wrong']), detail: z.string() })),
  summary: z.string(),
});

export const FIGURE_READ_SYSTEM = `Bạn đọc một hình minh họa trong đề Toán tiểu học (cắt từ ảnh đề, có thể mờ, nghiêng, vỡ nét hoặc chụp từ sách cũ) và mô tả nó thành dữ liệu để phần mềm VẼ LẠI hình cho sắc nét. Bạn không vẽ; bạn chép lại cấu trúc của hình. Giáo viên sẽ đối chiếu hình vẽ lại với hình gốc trước khi dùng.

Chính xác là quan trọng nhất:
- Chỉ mô tả những gì THẤY trong hình gốc: đúng số điểm và nhãn điểm, đúng các cạnh/đường kẻ và cách nối, đúng số đo, đơn vị và ký hiệu như in (ví dụ "7 cm", "1 cm²"), đúng số ô, nửa ô, đường chéo và ô tô màu.
- KHÔNG thêm đường kẻ, đường cao, đường chéo, ký hiệu góc vuông, nhãn, số đo hay dữ kiện nào không có trong hình gốc, kể cả khi suy ra được. Chỉ khai báo rightAngles khi hình gốc có vẽ ký hiệu góc vuông.
- Câu hỏi đi kèm chỉ để hiểu ngữ cảnh; không lấy dữ kiện từ câu hỏi vẽ thêm vào hình.
- Chỗ nào mờ, bị che, bị cắt mất hoặc không đọc chắc chắn (nhãn, số đo, số ô, kim đồng hồ…): ghi từng chỗ vào uncertain, nói cụ thể (ví dụ "số đo cạnh EG đọc là 9 cm nhưng không rõ"). Không đoán mà không ghi. Hình rõ thì uncertain là [].
- Ảnh nghiêng: dựng lại thẳng (cạnh gần ngang vẽ ngang, cạnh gần đứng vẽ đứng).

specJson là MỘT chuỗi JSON (không có chữ nào khác) mô tả hình, đủ các khóa sau (khóa không dùng thì để mảng rỗng):
{"points":[{"id":"A","label":"A","x":0,"y":0,"labelPos":"auto"}],
 "segments":[{"from":"A","to":"B","dashed":false,"label":"7 cm","labelSide":"auto"}],
 "polygons":[{"points":["A","B","C"],"fill":"none"}],
 "circles":[{"center":"O","radius":50,"fill":"none"}],
 "rightAngles":[{"at":"B","from":"A","to":"C"}],
 "arrows":[{"x1":0,"y1":0,"x2":10,"y2":0}],
 "texts":[{"text":"Hình H","x":0,"y":0}],
 "grid":{"x":0,"y":0,"cellSize":0,"rows":["■◣..","■■■◣","▪■■■"],"cells":[]},
 "clocks":[{"x":0,"y":0,"radius":50,"hour":3,"minute":0}],
 "fractions":[{"shape":"bar","x":0,"y":0,"size":100,"parts":4,"shaded":[0]}],
 "table":{"header":true,"rows":[{"cells":["Bạn","Thanh"]}]}}
Giá trị cho phép: labelPos "auto","n","s","e","w","ne","nw","se","sw"; labelSide "auto","left","right","above","below"; fill "none","light","dark"; shape của ô "square","cut_tl","cut_tr","cut_bl","cut_br"; shape của phân số "bar","circle".

Tọa độ theo pixel của ảnh bạn nhìn (kích thước ghi kèm ảnh), x sang phải, y xuống dưới. Giữ đúng tỉ lệ tương đối như hình gốc thể hiện.

Chọn kind:
- geometry: hình học phẳng (tam giác, hình chữ nhật, hình ghép, hình tròn…). Mỗi đỉnh/điểm là một mục points: id ngắn không dấu ("A", "P1"); label đúng chữ in trên hình ("" nếu điểm không có nhãn); labelPos là hướng của nhãn so với điểm trong hình gốc ("auto" nếu nhãn nằm ngoài hình theo cách thông thường). Mỗi cạnh nhìn thấy là một mục segments; số đo ghi cạnh nào thì đặt vào label của đoạn đó, labelSide theo vị trí của số đo trong hình gốc. Vùng tô màu dùng polygons với fill "light" (tô nhạt, xám, màu) hoặc "dark" (tô đậm, đen).
- grid: hình ghép từ ô vuông. grid.x, grid.y là góc trên-trái của ô hàng 0 cột 0 (ô hàng trên cùng, cột ngoài cùng bên trái của lưới); cellSize là cạnh ô (pixel). Ghi các ô vào grid.rows: mỗi hàng ô (từ trên xuống) là một chuỗi, mỗi ký tự là một cột (từ trái sang), mọi hàng dài bằng nhau:
  "." không có ô; "■" ô nguyên; "▪" ô nguyên tô đậm; "▫" ô nguyên tô nhạt;
  nửa ô cắt chéo thì vẽ đúng phần tam giác CÒN LẠI: "◢" (còn tam giác dưới-phải), "◣" (còn dưới-trái), "◥" (còn trên-phải), "◤" (còn trên-trái).
  Cách làm: trước tiên đếm số cột của hàng dài nhất (thường là hàng dưới cùng) và xác định mỗi đường kẻ dọc của các hàng trên thẳng với đường kẻ dọc nào của hàng đó; rồi viết từng hàng. Ví dụ hình bậc thang: hàng dưới 4 ô, hàng giữa 3 ô nguyên và một nửa ô bên phải (còn tam giác dưới-trái), hàng trên 1 ô nguyên và một nửa ô: rows ["■◣..","■■■◣","■■■■"]. Khi dùng rows thì cells là [].
  Mũi tên và chú thích (ví dụ "1 cm²") dùng arrows và texts.
- clock: mặt đồng hồ kim: hour (1–12) và minute (0–59) đọc từ vị trí kim; x, y là tâm, radius là bán kính.
- fraction: hình biểu diễn phân số: shape "bar" (thanh chia phần bằng nhau; x, y là góc trên-trái, size là chiều dài) hoặc "circle" (x, y là tâm, size là đường kính); parts là số phần bằng nhau; shaded là chỉ số các phần được tô (đếm từ 0).
- diagram: sơ đồ đoạn thẳng, tia số, sơ đồ tóm tắt bài toán: dùng points, segments, texts, arrows.
- table: bảng số liệu: table.rows đúng từng hàng, từng cột và nội dung ô; header là true nếu hàng đầu là tiêu đề.
- Chữ khác trong hình (tên hình như "Hình H", chú thích) dùng texts, x, y là điểm bắt đầu của chữ.
- Phần không dùng để trống: mảng [], grid không dùng thì cellSize 0, rows [] và cells [], table không dùng thì header false và rows [].

redrawable = false (ghi reason) khi đây không phải hình Toán vẽ lại được bằng các thành phần trên (ảnh chụp, tranh vẽ con vật/đồ vật, biểu đồ phức tạp) hoặc mờ đến mức không xác định được dữ kiện; khi đó specJson là "{}". Hình vẽ lại được thì reason là "".
readings: liệt kê nhãn điểm, số đo và chữ khác đọc được trên hình gốc, để giáo viên đối chiếu.`;

export const FIGURE_COMPARE_SYSTEM = `Bạn kiểm tra một hình Toán được vẽ lại. Ảnh 1 là HÌNH GỐC cắt từ đề (có thể mờ, nghiêng, chụp từ sách cũ). Ảnh 2 là HÌNH VẼ LẠI do phần mềm vẽ từ dữ liệu AI đọc được. Hình vẽ lại phải giữ đúng nội dung toán học của hình gốc.

KHÔNG tính là khác biệt: nét vẽ, phông chữ, độ đậm nhạt, tô xám thay cho tô màu, nhãn lệch vị trí một chút, kích thước tổng thể, hình nghiêng đã được dựng thẳng, ảnh gốc mờ hay có vết bẩn.

Kiểm tra kỹ từng mục: số điểm và nhãn điểm; các cạnh, đường kẻ và cách nối; số đo, đơn vị, ký hiệu; số ô vuông, nửa ô, đường chéo, ô tô màu (hãy đếm); vị trí kim đồng hồ; số phần và phần được tô của hình phân số; hàng, cột và nội dung bảng; tỉ lệ tương đối khi hình gốc thể hiện rõ; và hình vẽ lại không được THÊM đường kẻ, góc vuông, nhãn hay dữ kiện nào.

verdict:
- match: không có khác biệt về nội dung.
- minor_differences: chỉ khác biệt nhỏ không làm đổi dữ kiện hay kết quả bài toán (ví dụ tỉ lệ hơi lệch).
- mismatch: thiếu, thừa hoặc sai bất kỳ dữ kiện nào (nhãn, số đo, số ô, đường kẻ, kim đồng hồ, phần tô, ô bảng…).
- cannot_tell: hình gốc quá mờ để so sánh.
differences: mỗi khác biệt một mục, kind "missing" (hình vẽ lại thiếu), "extra" (hình vẽ lại thêm), "wrong" (sai), detail viết cụ thể bằng tiếng Việt. Không có khác biệt thì [].
summary: một câu tiếng Việt ngắn cho giáo viên.`;

const cleanId = (raw: string, fallback: string) => {
  const s = raw
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D')
    .replace(/[^A-Za-z0-9_]/g, '_')
    .slice(0, 24);
  return s || fallback;
};
const clamp = (n: number, lo: number, hi: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo);
const cut = (s: string, max: number) => s.trim().slice(0, max);

/**
 * The figure description from Claude's reply, made to fit figureSpecSchema
 * (ids without spaces or accents, numbers in range, entries pointing nowhere
 * dropped). null when nothing usable is left.
 */
export function figureSpecFromWire(read: ClaudeFigureRead): FigureSpec | null {
  let raw: unknown;
  try {
    // Usually bare JSON; sometimes wrapped in a code fence or a sentence
    const text = read.specJson.trim();
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    raw = JSON.parse(start >= 0 && end > start ? text.slice(start, end + 1) : text);
  } catch (error) {
    console.warn('figure spec: specJson is not JSON', String(error).slice(0, 200));
    return null;
  }
  const parsed = wireFigureSpecSchema.safeParse(raw);
  if (!parsed.success) {
    console.warn('figure spec: wire shape rejected', parsed.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return null;
  }
  const w: WireSpec = parsed.data;
  const idMap = new Map<string, string>();
  const points = w.points.slice(0, 80).map((p, i) => {
    let pid = cleanId(p.id || p.label, `P${i + 1}`);
    while ([...idMap.values()].includes(pid)) pid = `${pid}_`.slice(-24);
    idMap.set(p.id, pid);
    return { id: pid, label: cut(p.label, 12), x: clamp(p.x, -5000, 5000), y: clamp(p.y, -5000, 5000), labelPos: p.labelPos };
  });
  const ref = (raw: string) => idMap.get(raw);
  const spec: FigureSpec = {
    ...EMPTY_SPEC,
    kind: read.kind,
    points,
    segments: w.segments
      .map((s) => ({ from: ref(s.from), to: ref(s.to), dashed: s.dashed, label: cut(s.label, 24), labelSide: s.labelSide }))
      .filter((s): s is FigureSpec['segments'][number] => Boolean(s.from && s.to))
      .slice(0, 200),
    polygons: w.polygons
      .map((p) => ({ points: p.points.map(ref).filter((x): x is string => Boolean(x)).slice(0, 40), fill: p.fill }))
      .filter((p) => p.points.length >= 3)
      .slice(0, 40),
    circles: w.circles
      .map((c) => ({ center: ref(c.center), radius: clamp(c.radius, 0.1, 5000), fill: c.fill }))
      .filter((c): c is FigureSpec['circles'][number] => Boolean(c.center))
      .slice(0, 20),
    rightAngles: w.rightAngles
      .map((r) => ({ at: ref(r.at), from: ref(r.from), to: ref(r.to) }))
      .filter((r): r is FigureSpec['rightAngles'][number] => Boolean(r.at && r.from && r.to))
      .slice(0, 40),
    arrows: w.arrows.slice(0, 30).map((a) => ({ x1: clamp(a.x1, -5000, 5000), y1: clamp(a.y1, -5000, 5000), x2: clamp(a.x2, -5000, 5000), y2: clamp(a.y2, -5000, 5000) })),
    texts: w.texts
      .map((t) => ({ text: cut(t.text, 60), x: clamp(t.x, -5000, 5000), y: clamp(t.y, -5000, 5000) }))
      .filter((t) => t.text)
      .slice(0, 40),
    grid: {
      x: clamp(w.grid.x, -5000, 5000),
      y: clamp(w.grid.y, -5000, 5000),
      cellSize: clamp(w.grid.cellSize, 0, 1000),
      cells: (w.grid.rows.length ? cellsFromRows(w.grid.rows) : w.grid.cells)
        .filter((c) => Number.isInteger(c.row) && Number.isInteger(c.col) && c.row >= 0 && c.col >= 0 && c.row <= 40 && c.col <= 40)
        .slice(0, 400),
    },
    clocks: w.clocks
      .filter((c) => c.radius > 0)
      .slice(0, 6)
      .map((c) => ({
        x: clamp(c.x, -5000, 5000),
        y: clamp(c.y, -5000, 5000),
        radius: clamp(c.radius, 1, 2000),
        hour: ((((Math.round(c.hour) - 1) % 12) + 12) % 12) + 1,
        minute: clamp(Math.round(c.minute), 0, 59),
      })),
    fractions: w.fractions
      .filter((f) => f.size > 0 && f.parts >= 1)
      .slice(0, 12)
      .map((f) => {
        const parts = clamp(Math.round(f.parts), 1, 24);
        return {
          shape: f.shape,
          x: clamp(f.x, -5000, 5000),
          y: clamp(f.y, -5000, 5000),
          size: clamp(f.size, 1, 2000),
          parts,
          shaded: [...new Set(f.shaded.map(Math.round))].filter((i) => i >= 0 && i < parts).slice(0, 24),
        };
      }),
    table: {
      header: w.table.header,
      rows: w.table.rows.slice(0, 30).map((r) => ({ cells: r.cells.slice(0, 12).map((c) => cut(c, 80)) })),
    },
  };
  const checked = figureSpecSchema.safeParse(spec);
  if (!checked.success) {
    console.warn('figure spec: rejected', checked.error.issues.slice(0, 5).map((i) => `${i.path.join('.')}: ${i.message}`).join('; '));
    return null;
  }
  return straightenSpec(checked.data);
}

export function verificationFromWire(v: z.infer<typeof claudeFigureCompareSchema>): FigureVerification {
  return {
    verdict: v.verdict,
    differences: v.differences.slice(0, 30).map((d) => ({ kind: d.kind, detail: cut(d.detail, 300) })),
    summary: cut(v.summary, 400),
  };
}
