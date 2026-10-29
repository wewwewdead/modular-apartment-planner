const { app, BrowserWindow } = require('electron');
const path = require('node:path');
app.setPath('userData', path.join(__dirname, '..', 'artifacts', 'sketch-cad', 'electron-profile'));
app.whenReady().then(() => {
  const window = new BrowserWindow({
    width: 1366,
    height: 768,
    show: false,
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true },
  });
  window.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
});
app.on('window-all-closed', () => app.quit());
