/** At most this many Word pages are sent to the AI (same limit as an exam's pictures). */
const MAX_PAGES = 20;

/**
 * Lays out a Word (.docx) exam page by page, as Word would print it, and
 * returns one JPEG per page: the AI then reads it like a photographed exam,
 * figures and tables included.
 */
export async function docxToPageImages(file: Blob): Promise<Blob[]> {
  const [{ renderAsync }, { toJpeg }] = await Promise.all([import('docx-preview'), import('html-to-image')]);
  const host = document.createElement('div');
  // Laid out off screen at full size; never shown
  host.style.cssText = 'position:fixed;left:-20000px;top:0;background:#fff;';
  document.body.appendChild(host);
  try {
    try {
      await renderAsync(await file.arrayBuffer(), host, undefined, {
        inWrapper: false,
        breakPages: true,
        ignoreLastRenderedPageBreak: false,
        renderHeaders: true,
        renderFooters: true,
        experimental: true,
      });
    } catch {
      throw new Error('Không đọc được tệp Word này. Hãy lưu lại dạng .docx hoặc xuất ra PDF rồi thử lại.');
    }
    await Promise.all([...host.querySelectorAll('img')].map((img) => img.decode().catch(() => undefined)));
    const pages = [...host.querySelectorAll<HTMLElement>('section.docx')].slice(0, MAX_PAGES);
    if (!pages.length) throw new Error('Tệp Word không có nội dung.');
    const out: Blob[] = [];
    for (const page of pages) {
      const dataUrl = await toJpeg(page, { backgroundColor: '#ffffff', pixelRatio: 1.6, quality: 0.85 });
      out.push(await (await fetch(dataUrl)).blob());
    }
    return out;
  } finally {
    host.remove();
  }
}
