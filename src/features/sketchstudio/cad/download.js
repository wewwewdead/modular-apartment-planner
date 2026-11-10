// Hands a file to the browser's download (the fallback where the Save dialog
// API is missing; Electron shows its own save dialog for it). Its own module
// so the sheet PDF path does not load the workshop exports for it.
export function download(blob, filename) {
  const url = URL.createObjectURL(blob),
    a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
