/**
 * The standard PDF fonts (Helvetica, Times, Courier) encode WinAnsi only.
 * pdf-lib throws on any character outside it, so one arrow or emoji in a
 * module title, an employee name or an AI-written sentence aborts the whole
 * document. For a certificate that means the employee loses both the PDF and
 * the email that carries it, so text is sanitised rather than trusted.
 *
 * Non-Latin scripts cannot be represented at all by these fonts. Supporting
 * them means embedding a Unicode font through fontkit; until then those
 * characters become '?' rather than an exception.
 */

/** WinAnsi's 0x80–0x9F block: punctuation that is common in generated prose. */
const WIN_ANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';

/** Readable stand-ins for symbols that would otherwise be lost. */
const SUBSTITUTIONS: Record<string, string> = {
  '→': '>',
  '←': '<',
  '⇒': '=>',
  '⟶': '>',
  '✓': 'Yes',
  '✔': 'Yes',
  '✗': 'No',
  '✘': 'No',
  '≥': '>=',
  '≤': '<=',
  '≈': '~',
  '₦': 'NGN ',
  '﻿': '',
};

export function winAnsi(text: string): string {
  let out = '';
  for (const char of String(text ?? '')) {
    if (Object.prototype.hasOwnProperty.call(SUBSTITUTIONS, char)) {
      out += SUBSTITUTIONS[char];
    } else if (char.charCodeAt(0) <= 0xff || WIN_ANSI_EXTRA.includes(char)) {
      out += char;
    } else {
      out += '?';
    }
  }
  return out;
}
