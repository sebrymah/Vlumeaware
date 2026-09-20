import { PDFDocument, PDFFont, PDFImage, PDFPage, StandardFonts, degrees, rgb } from 'pdf-lib';
import { winAnsi } from '../../common/pdf/win-ansi';
import type { CertificateTemplate } from './certificate-templates';

/** A4 landscape in points — the size the certificate has always been. */
const W = 842;
const H = 595;

/** Vlumeaware's own mark keeps Vlumeaware's green whoever the client is. */
const VLUME_GREEN = rgb(0.043, 0.486, 0.341); // #0B7C57
const INK = rgb(0.059, 0.106, 0.086); // #0F1B16
const MUTED = rgb(0.361, 0.42, 0.396); // #5C6B65
const HAIRLINE = rgb(0.863, 0.898, 0.882); // #DCE5E1
const PANEL = rgb(0.945, 0.961, 0.957); // #F1F5F4
const WHITE = rgb(1, 1, 1);

export interface CertificateInput {
  template: CertificateTemplate;
  tenantName: string;
  employeeName: string;
  moduleTitle: string;
  /** Null for a module with no assessment attached. */
  quizTitle: string | null;
  scorePct: number;
  serial: string;
  issued: Date;
  verifyUrl: string;
  /** The client's brand colour; falls back to Vlumeaware green. */
  accentHex?: string | null;
  /** PNG or JPEG bytes. Anything else, or nothing, simply omits the logo. */
  clientLogo?: { bytes: Buffer; mimetype: string } | null;
}

/** #RRGGBB -> pdf-lib colour. Anything unparseable falls back to the brand. */
function hexColor(hex?: string | null) {
  const match = /^#?([0-9a-f]{6})$/i.exec((hex ?? '').trim());
  if (!match) return VLUME_GREEN;
  const n = parseInt(match[1], 16);
  return rgb(((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255);
}

/** PDF fonts have no letter-spacing, so tracked text is drawn per character. */
function trackedWidth(text: string, font: PDFFont, size: number, tracking: number) {
  const chars = [...text];
  if (!chars.length) return 0;
  return chars.reduce((w, c) => w + font.widthOfTextAtSize(c, size) + tracking, 0) - tracking;
}

function drawTracked(
  page: PDFPage,
  text: string,
  opts: { x: number; y: number; size: number; font: PDFFont; color: ReturnType<typeof rgb>; tracking: number },
) {
  let x = opts.x;
  for (const char of [...text]) {
    page.drawText(char, { x, y: opts.y, size: opts.size, font: opts.font, color: opts.color });
    x += opts.font.widthOfTextAtSize(char, opts.size) + opts.tracking;
  }
}

/** Greedy wrap so a long module title never runs off the page. */
function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const candidate = line ? `${line} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) > maxWidth && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

function formatDate(date: Date): string {
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
}

/**
 * Titles are often derived from a filename ("How_MFA_Stops_Stolen_Passwords"),
 * which reads as a database field on a printed certificate.
 */
export function humanizeTitle(title: string): string {
  return winAnsi(title).replace(/[_]+/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Draws the Vlumeaware wordmark: "Vlume" in ink, "aware" in Vlumeaware green. */
function drawWordmark(
  page: PDFPage,
  x: number,
  y: number,
  size: number,
  bold: PDFFont,
  inkColor = INK,
) {
  page.drawText('Vlume', { x, y, size, font: bold, color: inkColor });
  page.drawText('aware', {
    x: x + bold.widthOfTextAtSize('Vlume', size),
    y,
    size,
    font: bold,
    color: VLUME_GREEN,
  });
}

function wordmarkWidth(size: number, bold: PDFFont) {
  return bold.widthOfTextAtSize('Vlumeaware', size);
}

/** Places the client logo inside a box, preserving its aspect ratio. */
function drawLogo(
  page: PDFPage,
  image: PDFImage,
  box: { x: number; y: number; maxW: number; maxH: number },
) {
  const scale = Math.min(box.maxW / image.width, box.maxH / image.height, 1);
  const width = image.width * scale;
  const height = image.height * scale;
  page.drawImage(image, { x: box.x, y: box.y + (box.maxH - height) / 2, width, height });
  return width;
}

export async function renderCertificatePdf(input: CertificateInput): Promise<Buffer> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([W, H]);

  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const sansBold = await doc.embedFont(StandardFonts.HelveticaBold);
  const serif = await doc.embedFont(StandardFonts.TimesRoman);
  const serifBold = await doc.embedFont(StandardFonts.TimesRomanBold);
  const mono = await doc.embedFont(StandardFonts.Courier);

  let logo: PDFImage | null = null;
  if (input.clientLogo) {
    try {
      logo =
        input.clientLogo.mimetype === 'image/png'
          ? await doc.embedPng(input.clientLogo.bytes)
          : await doc.embedJpg(input.clientLogo.bytes);
    } catch {
      // A corrupt logo must not cost the recipient their certificate.
      logo = null;
    }
  }

  const ctx = { page, sans, sansBold, serif, serifBold, mono, logo, accent: hexColor(input.accentHex) };
  // Every string reaching the page is caller data: an employee's name, a
  // client's name, a title, a serial. One unencodable character would throw
  // and cost the recipient their certificate and its email.
  const data = {
    ...input,
    tenantName: winAnsi(input.tenantName),
    employeeName: winAnsi(input.employeeName),
    moduleTitle: humanizeTitle(input.moduleTitle),
    quizTitle: input.quizTitle ? winAnsi(input.quizTitle) : null,
    serial: winAnsi(input.serial),
    verifyUrl: winAnsi(input.verifyUrl),
  };

  if (input.template === 'formal') formal(ctx, data);
  else if (input.template === 'record') record(ctx, data);
  else branded(ctx, data);

  return Buffer.from(await doc.save());
}

interface Ctx {
  page: PDFPage;
  sans: PDFFont;
  sansBold: PDFFont;
  serif: PDFFont;
  serifBold: PDFFont;
  mono: PDFFont;
  logo: PDFImage | null;
  accent: ReturnType<typeof rgb>;
}

/** A — centred, double-ruled, the certificate someone frames. */
function formal(c: Ctx, d: CertificateInput) {
  const { page } = c;
  const centre = (text: string, font: PDFFont, size: number, y: number, color = INK) =>
    page.drawText(text, { x: (W - font.widthOfTextAtSize(text, size)) / 2, y, size, font, color });

  page.drawRectangle({ x: 26, y: 26, width: W - 52, height: H - 52, borderColor: c.accent, borderWidth: 1 });
  page.drawRectangle({ x: 32, y: 32, width: W - 64, height: H - 64, borderColor: c.accent, borderWidth: 3 });

  const left = 62;
  const top = H - 74;
  if (c.logo) {
    drawLogo(page, c.logo, { x: left, y: top - 4, maxW: 132, maxH: 30 });
  } else {
    drawTracked(page, d.tenantName.toUpperCase(), {
      x: left, y: top + 4, size: 10, font: c.sansBold, color: INK, tracking: 1.4,
    });
  }
  const header = 'SECURITY AWARENESS PROGRAMME';
  drawTracked(page, header, {
    x: W - 62 - trackedWidth(header, c.sans, 8, 1.6), y: top + 5, size: 8, font: c.sans, color: MUTED, tracking: 1.6,
  });

  const label = 'CERTIFICATE OF COMPLETION';
  drawTracked(page, label, {
    x: (W - trackedWidth(label, c.sansBold, 10, 3.2)) / 2, y: 430, size: 10, font: c.sansBold, color: c.accent, tracking: 3.2,
  });
  centre('This certifies that', c.sans, 11, 402, MUTED);
  centre(d.employeeName, c.serifBold, 40, 352);
  page.drawRectangle({ x: (W - 64) / 2, y: 336, width: 64, height: 2, color: c.accent });
  centre('has completed the security awareness module', c.sans, 11, 308, MUTED);

  let y = 288;
  for (const line of wrap(d.moduleTitle, c.serif, 19, 520)) {
    centre(line, c.serif, 19, y, c.accent);
    y -= 24;
  }
  // Which assessment was passed is the part that makes this evidence rather
  // than an attendance note, so it is named rather than alluded to.
  if (d.quizTitle) {
    y -= 6;
    for (const line of wrap(`and passed ${d.quizTitle}`, c.sans, 11, 520)) {
      centre(line, c.sans, 11, y, MUTED);
      y -= 16;
    }
  }
  centre(`with a score of ${d.scorePct}%`, c.sans, 11, y - 8, MUTED);

  page.drawLine({ start: { x: left, y: 122 }, end: { x: W - 62, y: 122 }, thickness: 1, color: HAIRLINE });
  footerField(c, left, 'ISSUED', formatDate(d.issued), c.sans);
  footerField(c, left + 170, 'SERIAL', d.serial, c.mono);

  const verify = d.verifyUrl.replace(/^https?:\/\//, '');
  drawTracked(page, 'VERIFY THIS CERTIFICATE', {
    x: W - 62 - trackedWidth('VERIFY THIS CERTIFICATE', c.sans, 7, 1.4), y: 100, size: 7, font: c.sans, color: MUTED, tracking: 1.4,
  });
  page.drawText(verify, {
    x: W - 62 - c.mono.widthOfTextAtSize(verify, 8), y: 84, size: 8, font: c.mono, color: c.accent,
  });

  page.drawText('Delivered via', { x: left, y: 52, size: 7, font: c.sans, color: MUTED });
  drawWordmark(page, left + c.sans.widthOfTextAtSize('Delivered via ', 7), 51, 8, c.sansBold);
}

function footerField(c: Ctx, x: number, label: string, value: string, valueFont: PDFFont) {
  drawTracked(c.page, label, { x, y: 100, size: 7, font: c.sans, color: MUTED, tracking: 1.4 });
  c.page.drawText(value, { x, y: 83, size: 10, font: valueFont, color: INK });
}

/** B — left brand bar, asymmetric, the modern credential. */
function branded(c: Ctx, d: CertificateInput) {
  const { page } = c;
  const bar = 58;
  const left = bar + 52;

  page.drawRectangle({ x: 0, y: 0, width: bar, height: H, color: c.accent });
  page.drawText('VLUMEAWARE', {
    x: bar / 2 + 5, y: 48, size: 9, font: c.mono, color: WHITE, rotate: degrees(90),
  });

  let top = H - 66;
  if (c.logo) {
    drawLogo(page, c.logo, { x: left, y: top - 10, maxW: 140, maxH: 34 });
  } else {
    page.drawText(d.tenantName, { x: left, y: top, size: 14, font: c.sansBold, color: INK });
  }
  page.drawText('Security awareness programme', {
    x: W - 56 - c.sans.widthOfTextAtSize('Security awareness programme', 9), y: top + 4, size: 9, font: c.sans, color: MUTED,
  });

  const label = 'CERTIFICATE OF COMPLETION';
  drawTracked(page, label, { x: left, y: 420, size: 9, font: c.sansBold, color: c.accent, tracking: 2.6 });
  page.drawText(d.employeeName, { x: left, y: 356, size: 46, font: c.serifBold, color: INK });

  let y = 316;
  const body = d.quizTitle
    ? `completed ${d.moduleTitle} and passed ${d.quizTitle} with a score of ${d.scorePct}%.`
    : `completed ${d.moduleTitle} with a score of ${d.scorePct}%.`;
  for (const line of wrap(body, c.sans, 12, W - left - 190)) {
    page.drawText(line, { x: left, y, size: 12, font: c.sans, color: MUTED });
    y -= 19;
  }

  drawTracked(page, 'ISSUED', { x: left, y: 128, size: 7, font: c.sans, color: MUTED, tracking: 1.4 });
  page.drawText(formatDate(d.issued), { x: left, y: 110, size: 11, font: c.sans, color: INK });

  const serialX = left + 168;
  page.drawRectangle({ x: serialX - 14, y: 106, width: 2, height: 30, color: c.accent });
  drawTracked(page, 'CERTIFICATE SERIAL', { x: serialX, y: 128, size: 7, font: c.sans, color: MUTED, tracking: 1.4 });
  page.drawText(d.serial, { x: serialX, y: 109, size: 12, font: c.mono, color: INK });

  const note = 'Anyone can confirm this certificate is genuine at';
  const verify = d.verifyUrl.replace(/^https?:\/\//, '');
  page.drawText(note, { x: W - 56 - c.sans.widthOfTextAtSize(note, 8.5), y: 124, size: 8.5, font: c.sans, color: MUTED });
  page.drawText(verify, { x: W - 56 - c.mono.widthOfTextAtSize(verify, 8), y: 108, size: 8, font: c.mono, color: c.accent });

  page.drawLine({ start: { x: left, y: 76 }, end: { x: W - 56, y: 76 }, thickness: 1, color: HAIRLINE });
  page.drawText('Delivered via', { x: left, y: 54, size: 7, font: c.sans, color: MUTED });
  drawWordmark(page, left + c.sans.widthOfTextAtSize('Delivered via ', 7), 53, 8, c.sansBold);
}

/** C — header band and labelled fields: evidence rather than a keepsake. */
function record(c: Ctx, d: CertificateInput) {
  const { page } = c;
  const left = 48;
  const bandH = 66;

  page.drawRectangle({ x: 0, y: H - bandH, width: W, height: bandH, color: c.accent });
  page.drawText('Training completion record', {
    x: left, y: H - 42, size: 15, font: c.sansBold, color: WHITE,
  });
  page.drawText(d.tenantName, {
    x: W - left - c.sans.widthOfTextAtSize(d.tenantName, 11), y: H - 40, size: 11, font: c.sans, color: WHITE,
  });

  if (c.logo) drawLogo(page, c.logo, { x: left, y: H - bandH - 56, maxW: 120, maxH: 34 });
  const nameY = c.logo ? H - bandH - 92 : H - bandH - 56;
  page.drawText(d.employeeName, { x: left, y: nameY, size: 28, font: c.serifBold, color: INK });
  page.drawText('completed the module below and passed its assessment.', {
    x: left, y: nameY - 22, size: 11, font: c.sans, color: MUTED,
  });

  const rows: Array<[string, string]> = [
    ['Module', d.moduleTitle],
    ...(d.quizTitle ? ([['Assessment', d.quizTitle]] as Array<[string, string]>) : []),
    ['Score', `${d.scorePct}%`],
    ['Date issued', formatDate(d.issued)],
    ['Issued by', `${d.tenantName}, via Vlumeaware`],
  ];
  let y = nameY - 58;
  for (const [label, value] of rows) {
    page.drawText(label, { x: left, y, size: 10.5, font: c.sans, color: MUTED });
    page.drawText(value, { x: left + 118, y, size: 10.5, font: c.sansBold, color: INK });
    y -= 20;
  }

  const panelX = W - 48 - 236;
  page.drawRectangle({ x: panelX, y: 128, width: 236, height: 224, color: PANEL });
  const centreIn = (text: string, font: PDFFont, size: number, ty: number, color: ReturnType<typeof rgb>) =>
    page.drawText(text, { x: panelX + (236 - font.widthOfTextAtSize(text, size)) / 2, y: ty, size, font, color });
  drawTracked(page, 'VERIFICATION', {
    x: panelX + (236 - trackedWidth('VERIFICATION', c.sans, 7, 1.5)) / 2, y: 326, size: 7, font: c.sans, color: MUTED, tracking: 1.5,
  });
  centreIn(d.serial, c.mono, 14, 286, INK);
  centreIn('Enter this serial at', c.sans, 9, 258, MUTED);
  const verifyBase = d.verifyUrl.replace(/^https?:\/\//, '').replace(/\/[^/]*$/, '');
  centreIn(verifyBase, c.mono, 8.5, 242, c.accent);
  centreIn('to confirm this record is genuine', c.sans, 9, 220, MUTED);

  page.drawLine({ start: { x: left, y: 92 }, end: { x: W - 48, y: 92 }, thickness: 1, color: HAIRLINE });
  for (const [i, line] of [
    'Completion evidence for NDPA and ISO audits. This record is verifiable independently of',
    'the recipient and of the organisation that issued it.',
  ].entries()) {
    page.drawText(line, { x: left, y: 74 - i * 13, size: 8.5, font: c.sans, color: MUTED });
  }
  drawWordmark(page, W - 48 - wordmarkWidth(9, c.sansBold), 60, 9, c.sansBold);
}
