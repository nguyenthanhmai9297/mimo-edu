/**
 * Whether an AI conversion holds every question of the exam. The AI states
 * how many questions it counted on the paper and each question's printed
 * number; any gap, a lower count than stated, or a reply that did not end
 * normally means questions may be missing, and the teacher must be told.
 */
export interface AICompleteness {
  /** Questions returned (after splitting "a)/b)" parts). */
  received: number;
  /** Questions the AI said the paper has, when it said so. */
  declared?: number;
  /** Printed question numbers that are absent, e.g. [9, 10]. */
  missingNumbers: number[];
  /** True when the reply stopped early (output limit, refusal…). */
  cutOff: boolean;
}

export function checkCompleteness(
  sourceNumbers: (string | undefined)[],
  declared: number | undefined,
  cutOff: boolean
): AICompleteness {
  const seen = new Set<number>();
  for (const label of sourceNumbers) {
    const n = Number(/^\s*(?:câu\s*)?(\d{1,3})/i.exec(label ?? '')?.[1]);
    if (Number.isInteger(n) && n > 0) seen.add(n);
  }
  const validDeclared = declared !== undefined && Number.isInteger(declared) && declared > 0 && declared <= 200 ? declared : undefined;
  const last = Math.max(validDeclared ?? 0, ...seen);
  const missingNumbers =
    seen.size > 0 ? Array.from({ length: last }, (_, i) => i + 1).filter((n) => !seen.has(n)) : [];
  return {
    received: sourceNumbers.length,
    ...(validDeclared !== undefined ? { declared: validDeclared } : {}),
    missingNumbers,
    cutOff,
  };
}

/** Whether the teacher must be warned before trusting the conversion as complete. */
export function isIncomplete(c: AICompleteness | undefined | null): boolean {
  if (!c) return false;
  const distinctMissing = c.missingNumbers.length > 0;
  const fewerThanDeclared = c.declared !== undefined && c.received < c.declared;
  return c.cutOff || distinctMissing || fewerThanDeclared;
}

/** Teacher-facing warning, or null when nothing looks missing. */
export function incompletenessMessage(c: AICompleteness | undefined | null): string | null {
  if (!c || !isIncomplete(c)) return null;
  const parts: string[] = [];
  if (c.missingNumbers.length) parts.push(`không thấy câu ${c.missingNumbers.join(', ')}`);
  if (c.declared !== undefined && c.received < c.declared) parts.push(`AI đếm được ${c.declared} câu trên đề nhưng chỉ chép ${c.received} câu`);
  if (c.cutOff) parts.push('AI dừng trước khi chép xong');
  return `AI có thể đã bỏ sót câu hỏi (${parts.join('; ')}). Hãy đối chiếu với đề gốc và bổ sung câu còn thiếu trước khi xuất bản.`;
}
