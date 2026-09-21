import { PDFFont, PDFPage, rgb } from 'pdf-lib';

/** Vlumeaware's own green, whoever the client is. */
const VLUME_GREEN = rgb(0.043, 0.486, 0.341);
const INK = rgb(0.059, 0.106, 0.086);

/**
 * The Vlumeaware mark: an open ring returning into itself, with the person at
 * its centre. Drawn as vector paths rather than an embedded image so it stays
 * crisp at any zoom and adds nothing to the file size.
 *
 * The path data is the same artwork as the SVG the console and website use,
 * with the y axis flipped, since SVG counts down from the top and PDF counts
 * up from the bottom.
 */
export function drawLogoMark(
  page: PDFPage,
  opts: { x: number; y: number; size: number; color?: ReturnType<typeof rgb> },
) {
  const { x, y, size } = opts;
  const scale = size / 48;
  const ring = opts.color ?? VLUME_GREEN;
  const dot = opts.color ?? INK;

  // Shared placement: pdf-lib positions an SVG path by its own top-left.
  const place = { x, y: y + size, scale };

  page.drawSvgPath('M24 7a17 17 0 1 1-12.02 4.98', {
    ...place,
    borderColor: ring,
    borderWidth: 6,
    borderLineCap: 1,
  });
  page.drawSvgPath('M11 4.5 L11.5 12.5 L19.5 12', {
    ...place,
    borderColor: ring,
    borderWidth: 6,
    borderLineCap: 1,
  });
  page.drawCircle({
    x: x + 24 * scale,
    y: y + size - 24 * scale,
    size: 7 * scale,
    color: dot,
  });
}

/**
 * Mark plus wordmark, laid out together. Returns the width drawn, so a caller
 * can right-align it. The wordmark keeps Vlumeaware's green on a client's
 * certificate: it identifies us, not them.
 */
export function drawLogoLockup(
  page: PDFPage,
  opts: { x: number; y: number; size: number; bold: PDFFont; inkColor?: ReturnType<typeof rgb> },
): number {
  const { x, y, size, bold } = opts;
  const mark = size * 1.45;
  const gap = size * 0.4;
  const ink = opts.inkColor ?? INK;

  drawLogoMark(page, { x, y: y - size * 0.18, size: mark });
  const textX = x + mark + gap;
  page.drawText('Vlume', { x: textX, y, size, font: bold, color: ink });
  page.drawText('aware', {
    x: textX + bold.widthOfTextAtSize('Vlume', size),
    y,
    size,
    font: bold,
    color: VLUME_GREEN,
  });
  return mark + gap + bold.widthOfTextAtSize('Vlumeaware', size);
}

export function logoLockupWidth(size: number, bold: PDFFont): number {
  return size * 1.45 + size * 0.4 + bold.widthOfTextAtSize('Vlumeaware', size);
}
