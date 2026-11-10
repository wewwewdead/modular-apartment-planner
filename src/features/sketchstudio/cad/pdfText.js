// What the sheet PDF's text can show (Phase T, docs/sketch-studio-sheet-pdf.md
// §4). svg2pdf draws `font-family="sans-serif"` in jsPDF's standard
// Helvetica, whose encoding is WinAnsi (cp1252): printable ASCII, Latin-1
// (0xA0–0xFF) and the 27 cp1252 extras in 0x80–0x9F. jsPDF writes all of
// those as the right single WinAnsi byte (Ø D8, × D7, ± B1, ° B0, — 97, · B7,
// – 96; sheetPdf.test.js checks every one). A string holding any other
// character is written as two bytes per character instead, which garbles the
// WHOLE text line in a single-byte font, so the PDF writer swaps each such
// character for a stand-in first (`winAnsiText`) and the preflight names them.
// No module here imports jsPDF: the preflight runs before the PDF chunk loads.

// Unicode code points of the cp1252 bytes 0x80–0x9F (0x81, 0x8D, 0x8F, 0x90, 0x9D are unassigned).
const CP1252_EXTRAS = new Set([
  0x20ac, 0x201a, 0x0192, 0x201e, 0x2026, 0x2020, 0x2021, 0x02c6, 0x2030, 0x0160, 0x2039, 0x0152, 0x017d, 0x2018,
  0x2019, 0x201c, 0x201d, 0x2022, 0x2013, 0x2014, 0x02dc, 0x2122, 0x0161, 0x203a, 0x0153, 0x017e, 0x0178,
]);

// Whether Helvetica (WinAnsi) can draw this character; tab and line breaks count as space.
export const isWinAnsi = (ch) => {
  const code = ch.codePointAt(0);
  return (
    (code >= 0x20 && code <= 0x7e) ||
    (code >= 0xa0 && code <= 0xff) ||
    CP1252_EXTRAS.has(code) ||
    code === 0x09 ||
    code === 0x0a ||
    code === 0x0d
  );
};

// Close WinAnsi stand-ins for a few symbols drawings are typed with; anything else prints as "?".
const STAND_INS = {
  '−': '-', // minus sign
  '‐': '-', // hyphen
  '‑': '-', // non-breaking hyphen
  '⌀': 'Ø', // diameter sign
  '≤': '<=',
  '≥': '>=',
  '≈': '~',
  '′': "'", // prime (feet, minutes)
  '″': '"', // double prime (inches, seconds)
  ' ': ' ', // figure space
  ' ': ' ', // thin space
  ' ': ' ', // narrow no-break space
};
export const winAnsiStandIn = (ch) => STAND_INS[ch] ?? '?';

// The text as the PDF prints it: every character Helvetica cannot draw swapped for its stand-in.
export function winAnsiText(text) {
  let out = '';
  for (const ch of String(text ?? '')) out += isWinAnsi(ch) ? ch : winAnsiStandIn(ch);
  return out;
}

const ENTITIES = { lt: '<', gt: '>', amp: '&', quot: '"', apos: "'" };
const decode = (text) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name) =>
    name[0] === '#'
      ? String.fromCodePoint(name[1] === 'x' || name[1] === 'X' ? parseInt(name.slice(2), 16) : Number(name.slice(1)))
      : (ENTITIES[name] ?? whole),
  );

// The text of every <text> element of a sheet SVG string, entities decoded.
export const svgTexts = (svg) =>
  [...String(svg).matchAll(/<text\b[^>]*>([\s\S]*?)<\/text>/g)].map((m) => decode(m[1].replace(/<[^>]*>/g, '')));

// The characters of a sheet's text the PDF cannot show, once each in reading
// order, with what prints instead: { title, chars, standIns } or null when
// every character prints as it is.
export function pdfTextIssues(svg, title = '') {
  const chars = [];
  for (const text of svgTexts(svg)) for (const ch of text) if (!isWinAnsi(ch) && !chars.includes(ch)) chars.push(ch);
  return chars.length ? { title, chars, standIns: chars.map(winAnsiStandIn) } : null;
}

// "‘Frame’: these characters can't be shown in the PDF: 日本 (they print as ?)".
export function pdfTextIssueMessage(issue) {
  const plain = issue.standIns.every((s) => s === '?');
  const printed = plain
    ? 'they print as ?'
    : `they print as ${issue.chars.map((ch, i) => `${ch} → ${issue.standIns[i]}`).join(', ')}`;
  return `‘${issue.title}’: these characters can't be shown in the PDF: ${issue.chars.join('')} (${printed})`;
}
