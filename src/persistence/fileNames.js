/**
 * A user-typed name as one part of a file name: filesystem-illegal and C0
 * control characters become "-", runs of whitespace and dashes collapse to one
 * "-", and an empty result falls back. Shared by project saves and the
 * Sketch Studio sheet PDF (docs/sketch-studio-sheet-pdf.md §5), which must
 * not pull the project persistence modules into its chunk.
 */
export function sanitizeFileNamePart(value, fallback = 'project') {
  return (
    String(value || fallback)
      .trim()
      // Strip filesystem-illegal characters and C0 control chars (U+0000-U+001F) from file names.
      // eslint-disable-next-line no-control-regex
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .replace(/\s+/g, '-')
      .replace(/-+/g, '-')
      .replace(/^-|-$/g, '') || fallback
  );
}
