import { PDFDocument, PDFFont, PDFPage, StandardFonts, rgb } from 'pdf-lib';
import { winAnsi } from '../../common/pdf/win-ansi';
import type { EmployeeRisk } from './risk.service';

/** A4 portrait: this is a table document, not a certificate. */
const W = 595;
const H = 842;
const MARGIN = 44;

const GREEN = rgb(0.043, 0.486, 0.341);
const INK = rgb(0.059, 0.106, 0.086);
const MUTED = rgb(0.361, 0.42, 0.396);
const HAIRLINE = rgb(0.863, 0.898, 0.882);
const BAND = rgb(0.945, 0.961, 0.957);
const AMBER = rgb(0.71, 0.4, 0.05);
const RED = rgb(0.72, 0.11, 0.11);

export interface RiskReportInput {
  tenantName: string;
  employees: EmployeeRisk[];
  advice?: {
    summary: string;
    actions: string[];
    assignments: Array<{ employeeName: string; moduleTitle: string; reason: string }>;
  } | null;
  generatedAt: Date;
}

function wrap(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of String(text).split(/\s+/)) {
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

function levelColor(level: string) {
  if (level === 'critical') return RED;
  if (level === 'high') return AMBER;
  if (level === 'moderate') return AMBER;
  return GREEN;
}

export async function renderRiskReportPdf(raw: RiskReportInput): Promise<Buffer> {
  // Everything here is caller data: employee names, a client name, AI-written
  // prose. Sanitise once at the boundary — sanitising at the draw call is not
  // enough, because text is measured for wrapping and alignment first and the
  // measurement throws on the same characters.
  const input: RiskReportInput = {
    ...raw,
    tenantName: winAnsi(raw.tenantName),
    employees: raw.employees.map((e) => ({
      ...e,
      name: winAnsi(e.name),
      department: e.department ? winAnsi(e.department) : null,
    })),
    advice: raw.advice
      ? {
          summary: winAnsi(raw.advice.summary),
          actions: raw.advice.actions.map(winAnsi),
          assignments: raw.advice.assignments.map((a) => ({
            employeeName: winAnsi(a.employeeName),
            moduleTitle: winAnsi(a.moduleTitle),
            reason: winAnsi(a.reason),
          })),
        }
      : null,
  };

  const doc = await PDFDocument.create();
  const sans = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  let page = doc.addPage([W, H]);
  let y = 0;

  const newPage = () => {
    page = doc.addPage([W, H]);
    y = H - MARGIN;
  };

  /** Reserves vertical space, starting a page when the current one is full. */
  const need = (space: number) => {
    if (y - space < MARGIN + 30) newPage();
  };

  const text = (
    value: string,
    x: number,
    size: number,
    font: PDFFont,
    color = INK,
    atY = y,
  ) => page.drawText(value, { x, y: atY, size, font, color });

  // ---- header -------------------------------------------------------------
  y = H - MARGIN;
  page.drawRectangle({ x: 0, y: H - 4, width: W, height: 4, color: GREEN });
  text('Employee risk report', MARGIN, 20, bold);
  y -= 22;
  text(input.tenantName, MARGIN, 12, sans, MUTED);
  const stamp = input.generatedAt.toLocaleDateString('en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });
  text(stamp, W - MARGIN - sans.widthOfTextAtSize(stamp, 10), 10, sans, MUTED, y);
  y -= 24;

  // ---- at a glance --------------------------------------------------------
  const scored = input.employees.length;
  const repeat = input.employees.filter((e) => e.repeatClicker).length;
  const creds = input.employees.filter((e) => e.credentialSubmissions > 0).length;
  const average = scored
    ? Math.round(input.employees.reduce((sum, e) => sum + e.riskScore, 0) / scored)
    : 0;

  page.drawRectangle({ x: MARGIN, y: y - 46, width: W - MARGIN * 2, height: 46, color: BAND });
  const stats: Array<[string, string]> = [
    ['People scored', String(scored)],
    ['Average score', `${average}/100`],
    ['Repeat clickers', String(repeat)],
    ['Submitted credentials', String(creds)],
  ];
  stats.forEach(([label, value], i) => {
    const x = MARGIN + 14 + i * ((W - MARGIN * 2 - 28) / stats.length);
    text(label.toUpperCase(), x, 7, sans, MUTED, y - 17);
    text(value, x, 15, bold, INK, y - 36);
  });
  y -= 64;

  // ---- what the assistant advised ----------------------------------------
  if (input.advice) {
    need(80);
    text('Recommendation', MARGIN, 13, bold, INK, y);
    y -= 8;
    text('Vlumeaware AI', W - MARGIN - sans.widthOfTextAtSize('Vlumeaware AI', 8), 8, sans, MUTED, y + 8);
    y -= 10;

    for (const line of wrap(input.advice.summary, sans, 10, W - MARGIN * 2)) {
      need(14);
      text(line, MARGIN, 10, sans, INK, y);
      y -= 14;
    }

    if (input.advice.actions.length) {
      y -= 8;
      need(16);
      text('WHAT TO DO', MARGIN, 8, bold, MUTED, y);
      y -= 14;
      for (const action of input.advice.actions) {
        const lines = wrap(action, sans, 10, W - MARGIN * 2 - 14);
        need(lines.length * 13 + 4);
        page.drawCircle({ x: MARGIN + 3, y: y + 3, size: 1.7, color: GREEN });
        lines.forEach((line, i) => {
          text(line, MARGIN + 14, 10, sans, INK, y - i * 13);
        });
        y -= lines.length * 13 + 4;
      }
    }

    if (input.advice.assignments.length) {
      y -= 8;
      need(16);
      text('TRAINING TO ASSIGN', MARGIN, 8, bold, MUTED, y);
      y -= 14;
      for (const a of input.advice.assignments) {
        const heading = `${a.employeeName}: ${a.moduleTitle}`;
        const reason = wrap(a.reason, sans, 9, W - MARGIN * 2 - 14);
        need(14 + reason.length * 11 + 6);
        text(heading, MARGIN + 14, 10, bold, INK, y);
        y -= 12;
        reason.forEach((line) => {
          text(line, MARGIN + 14, 9, sans, MUTED, y);
          y -= 11;
        });
        y -= 6;
      }
    }
    y -= 10;
  }

  // ---- the table ----------------------------------------------------------
  const cols: Array<{ label: string; x: number; align?: 'right' }> = [
    { label: 'Employee', x: MARGIN },
    { label: 'Dept', x: MARGIN + 150 },
    { label: 'Score', x: MARGIN + 250, align: 'right' },
    { label: 'Level', x: MARGIN + 270 },
    { label: 'Sends', x: MARGIN + 360, align: 'right' },
    { label: 'Clicks', x: MARGIN + 405, align: 'right' },
    { label: 'Reports', x: MARGIN + 455, align: 'right' },
    { label: 'Passes', x: MARGIN + 505, align: 'right' },
  ];

  const header = () => {
    need(26);
    page.drawLine({
      start: { x: MARGIN, y: y + 12 },
      end: { x: W - MARGIN, y: y + 12 },
      thickness: 1,
      color: HAIRLINE,
    });
    for (const c of cols) {
      const label = c.label.toUpperCase();
      const x = c.align === 'right' ? c.x - bold.widthOfTextAtSize(label, 7) : c.x;
      text(label, x, 7, bold, MUTED, y);
    }
    y -= 6;
    page.drawLine({
      start: { x: MARGIN, y },
      end: { x: W - MARGIN, y },
      thickness: 1,
      color: HAIRLINE,
    });
    y -= 14;
  };

  need(40);
  text('All employees by risk', MARGIN, 13, bold, INK, y);
  y -= 20;
  header();

  for (const e of input.employees) {
    if (y - 16 < MARGIN + 30) {
      newPage();
      header();
    }
    const cell = (value: string, col: (typeof cols)[number], font = sans, color = INK, size = 9) => {
      const x = col.align === 'right' ? col.x - font.widthOfTextAtSize(value, size) : col.x;
      text(value, x, size, font, color, y);
    };
    const name = e.name.length > 26 ? `${e.name.slice(0, 25)}…` : e.name;
    cell(name, cols[0], e.repeatClicker ? bold : sans);
    cell(e.department ?? '—', cols[1], sans, MUTED);
    cell(String(e.riskScore), cols[2], bold);
    cell(e.riskLevel, cols[3], sans, levelColor(e.riskLevel));
    cell(String(e.sends), cols[4]);
    cell(String(e.clicks), cols[5]);
    cell(String(e.reports), cols[6]);
    cell(String(e.quizPasses), cols[7]);
    y -= 16;
  }

  // ---- footer on every page ----------------------------------------------
  const pages = doc.getPages();
  pages.forEach((p, i) => {
    p.drawText('Vlume', { x: MARGIN, y: 26, size: 8, font: bold, color: INK });
    p.drawText('aware', {
      x: MARGIN + bold.widthOfTextAtSize('Vlume', 8),
      y: 26,
      size: 8,
      font: bold,
      color: GREEN,
    });
    const label = `Page ${i + 1} of ${pages.length}`;
    p.drawText(label, {
      x: W - MARGIN - sans.widthOfTextAtSize(label, 8),
      y: 26,
      size: 8,
      font: sans,
      color: MUTED,
    });
  });

  return Buffer.from(await doc.save());
}
