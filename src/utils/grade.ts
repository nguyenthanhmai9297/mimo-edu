/** Khối lớp used when an exam does not print one (MimoEDU is for grade 3). */
export const DEFAULT_GRADE = 'Khối 3';

/** "Lớp 3", "lớp 3", "Khối 3", "3" → "Khối 3"; empty → DEFAULT_GRADE; anything else kept. */
export function normalizeGrade(raw?: string | null): string {
  const text = (raw ?? '').trim();
  if (!text) return DEFAULT_GRADE;
  const m = /^(?:(?:lớp|khối)\s*)?(\d{1,2})$/i.exec(text.normalize('NFC'));
  return m ? `Khối ${Number(m[1])}` : text;
}
