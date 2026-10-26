/** Reads a class list (Excel, Word or CSV) into pupils' names. Only text is read: macros and embedded objects are never run. */

export const ROSTER_ACCEPT = '.xlsx,.xls,.csv,.docx';
export const MAX_ROSTER_FILE = 2 * 1024 * 1024;
const MAX_ROWS = 300;

export interface RosterFile {
  names: string[];
  /** The class written in the file ("Lớp" column), if any. */
  className: string;
}

const norm = (s: string) =>
  s
    .normalize('NFC')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
const clean = (s: unknown) => String(s ?? '').replace(/\s+/g, ' ').trim();

const isFull = (h: string) => /^(họ (và )?tên|họ tên học sinh|họ và tên học sinh|tên học sinh|full ?name|name|ho va ten|ho ten)$/.test(h);
const isFamily = (h: string) => /^(họ|họ (và )?(tên )?đệm|họ lót)$/.test(h);
const isGiven = (h: string) => /^(tên|ten)$/.test(h);
const isClass = (h: string) => /^(lớp|lop|class)$/.test(h);
/** Numbering written before a name: "1.", "2)", "3 -". */
const stripNo = (s: string) => s.replace(/^\d{1,3}\s*[.)\-–:]\s*/, '').trim();
const looksLikeName = (s: string) => /\p{L}/u.test(s) && !/^\d+([.,]\d+)?$/.test(s) && s.length <= 60;

/** Rows of cells → names, using the header (STT, Họ và tên / Họ + Tên, Lớp) when there is one. */
export function rosterFromRows(rows: string[][]): RosterFile {
  const cells = rows.slice(0, MAX_ROWS + 10).map((r) => r.map(clean));
  const headAt = cells.slice(0, 10).findIndex((r) => r.some((c) => isFull(norm(c)) || isGiven(norm(c))));
  let className = '';
  let names: string[];
  if (headAt >= 0) {
    const head = cells[headAt].map(norm);
    const full = head.findIndex(isFull);
    const family = head.findIndex(isFamily);
    const given = head.findIndex(isGiven);
    const cls = head.findIndex(isClass);
    const body = cells.slice(headAt + 1);
    names = body.map((r) => (full >= 0 ? r[full] ?? '' : [family >= 0 ? r[family] : '', r[given] ?? ''].join(' ')).replace(/\s+/g, ' ').trim());
    if (cls >= 0) className = body.map((r) => r[cls] ?? '').find(Boolean) ?? '';
  } else {
    // No header: the column with the most name-like cells (a number column is the STT)
    const width = Math.max(0, ...cells.map((r) => r.length));
    let best = 0;
    let bestCount = -1;
    for (let c = 0; c < width; c++) {
      const n = cells.filter((r) => looksLikeName(stripNo(r[c] ?? ''))).length;
      if (n > bestCount) [best, bestCount] = [c, n];
    }
    names = cells.map((r) => stripNo(r[best] ?? ''));
  }
  return { names: names.map(stripNo).filter(looksLikeName).slice(0, MAX_ROWS), className };
}

const W = 'http://schemas.openxmlformats.org/wordprocessingml/2006/main';
const textOf = (el: Element) =>
  [...el.getElementsByTagNameNS(W, 't')]
    .map((t) => t.textContent ?? '')
    .join('');

/** Word: the first table with several rows, otherwise one name per paragraph. */
async function docxRows(buf: ArrayBuffer): Promise<string[][]> {
  const { default: JSZip } = await import('jszip');
  const zip = await JSZip.loadAsync(buf);
  const xml = await zip.file('word/document.xml')?.async('string');
  if (!xml) throw new Error('bad');
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  const table = [...doc.getElementsByTagNameNS(W, 'tbl')].find((t) => t.getElementsByTagNameNS(W, 'tr').length > 1);
  if (table) {
    return [...table.getElementsByTagNameNS(W, 'tr')].map((tr) => [...tr.getElementsByTagNameNS(W, 'tc')].map(textOf));
  }
  return [...doc.getElementsByTagNameNS(W, 'p')].map((p) => [textOf(p)]);
}

async function sheetRows(buf: ArrayBuffer, csv: boolean): Promise<string[][]> {
  const XLSX = await import('xlsx');
  const wb = csv
    ? XLSX.read(new TextDecoder('utf-8').decode(buf), { type: 'string', raw: true })
    : XLSX.read(buf, { type: 'array', cellFormula: false, cellHTML: false, sheetRows: MAX_ROWS + 10 });
  const ws = wb.Sheets[wb.SheetNames[0]];
  if (!ws) return [];
  return XLSX.utils.sheet_to_json<string[]>(ws, { header: 1, raw: false, defval: '', blankrows: false });
}

export async function readRosterFile(file: File): Promise<RosterFile> {
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  if (!['xlsx', 'xls', 'csv', 'docx'].includes(ext)) throw new Error('Chọn tệp Excel (.xlsx, .xls), Word (.docx) hoặc CSV.');
  if (file.size > MAX_ROSTER_FILE) throw new Error('Tệp quá lớn (tối đa 2 MB).');
  let rows: string[][];
  try {
    const buf = await file.arrayBuffer();
    const head = new Uint8Array(buf.slice(0, 2));
    // .xlsx and .docx are zip packages
    if ((ext === 'xlsx' || ext === 'docx') && !(head[0] === 0x50 && head[1] === 0x4b)) throw new Error('bad');
    rows = ext === 'docx' ? await docxRows(buf) : await sheetRows(buf, ext === 'csv');
  } catch {
    throw new Error('Không đọc được tệp này. Hãy mở và lưu lại rồi thử lại.');
  }
  const out = rosterFromRows(rows);
  if (!out.names.length) throw new Error('Không tìm thấy tên học sinh trong tệp.');
  return out;
}

/** An Excel file to fill in: STT, Họ và tên, Lớp. */
export async function downloadRosterTemplate() {
  const XLSX = await import('xlsx');
  const ws = XLSX.utils.aoa_to_sheet([
    ['STT', 'Họ và tên', 'Lớp'],
    [1, 'Nguyễn Văn An', '3A'],
    [2, 'Trần Thị Bình', '3A'],
    [3, 'Lê Minh Châu', '3A'],
  ]);
  ws['!cols'] = [{ wch: 6 }, { wch: 32 }, { wch: 8 }];
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Danh sách');
  XLSX.writeFile(wb, 'Mau_danh_sach_hoc_sinh.xlsx');
}

/** Same name written twice (case and spacing ignored): shown to the teacher, never removed. */
export function duplicateNames(names: { seat: number; name: string }[]): { name: string; seats: number[] }[] {
  const by = new Map<string, { name: string; seats: number[] }>();
  for (const n of names) {
    const k = norm(n.name);
    if (!k) continue;
    const e = by.get(k) ?? { name: n.name, seats: [] };
    e.seats.push(n.seat);
    by.set(k, e);
  }
  return [...by.values()].filter((e) => e.seats.length > 1);
}
