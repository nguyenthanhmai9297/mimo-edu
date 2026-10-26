import React, { useMemo } from 'react';
import qrcode from 'qrcode-generator';

/** A QR code of a link, drawn as SVG in the page (no image service involved). */
export const QrCode: React.FC<{ text: string; size: number; className?: string }> = ({ text, size, className }) => {
  const svg = useMemo(() => {
    const qr = qrcode(0, 'M');
    qr.addData(text);
    qr.make();
    // The library's own markup: built from the link text only
    return qr.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
  }, [text]);
  return <div role="img" aria-label={`Mã QR: ${text}`} className={className} style={{ width: size, height: size }} dangerouslySetInnerHTML={{ __html: svg }} />;
};
