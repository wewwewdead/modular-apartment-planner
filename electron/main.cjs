const { app, BrowserWindow, dialog, shell } = require('electron');
const path = require('node:path');

/*
 * Pin the profile directory to one name no matter how the shell is launched
 * (installed exe, desktop shortcut into node_modules electron, `npm run app`),
 * so saved projects live in one place: %APPDATA%\Apartment Planner.
 */
app.setName('Apartment Planner');
// The override exists for instrumentation: the single-instance lock is keyed
// on this directory, so a profiling/measurement instance pointed at a scratch
// profile can run beside the real app instead of silently quitting into it.
app.setPath(
  'userData',
  process.env.APARTMENT_PLANNER_USER_DATA || path.join(app.getPath('appData'), 'Apartment Planner'),
);

/*
 * GPU posture. A browser assumes it might be sharing a battery-powered machine
 * with twenty other tabs; this shell is a dedicated CAD tool and wants the
 * dedicated GPU. Must be set before app ready.
 *
 * - ignore-gpu-blocklist: Chromium keeps a deny-list of driver/OS combos and
 *   quietly software-renders on a match; a tool pinned to one known machine
 *   would rather use the GPU it has.
 * - gpu-rasterization / zero-copy: rasterize 2D content (the SVG floorplan!) on
 *   the GPU and share those buffers with the compositor without a CPU copy.
 * - force_high_performance_gpu: on dual-GPU machines, prefer the discrete chip
 *   for the whole process, not just contexts that ask nicely.
 */
app.commandLine.appendSwitch('ignore-gpu-blocklist');
app.commandLine.appendSwitch('enable-gpu-rasterization');
app.commandLine.appendSwitch('enable-zero-copy');
app.commandLine.appendSwitch('force_high_performance_gpu');

/*
 * Two instances sharing one profile directory corrupt localStorage's backing
 * store (Chromium holds a LevelDB lock), so a second launch just focuses the
 * window that already exists.
 */
const hasLock = app.requestSingleInstanceLock();
if (!hasLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    const [win] = BrowserWindow.getAllWindows();
    if (win) {
      if (win.isMinimized()) win.restore();
      win.focus();
    }
  });

  app.whenReady().then(createWindow);
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    show: false,
    autoHideMenuBar: true,
    // The app's page background (--color-background), so the frame shown before
    // the first paint is the paper the UI draws on, not a navy flash.
    backgroundColor: '#fafaf8',
    // The installed exe has the icon baked in; launches out of node_modules
    // (desktop shortcut, `npm run app`) need it set explicitly or the window
    // and taskbar show Electron's default.
    icon: app.isPackaged ? undefined : path.join(__dirname, '..', 'build', 'icon.ico'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // Anything targeting a new window (external docs links etc.) goes to the
  // system browser instead of spawning chromeless Electron windows — web and
  // mail links only: openExternal hands any other scheme (file:, a custom
  // protocol handler) to the OS to run.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (isExternalLink(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  // The page cancels unload while it has unsaved changes. A browser asks the
  // user about that; Electron just keeps the window open, so the close button
  // seemed to do nothing. Ask here instead — Stay is the default.
  win.webContents.on('will-prevent-unload', (event) => {
    const choice = dialog.showMessageBoxSync(win, {
      type: 'question',
      buttons: ['Leave', 'Stay'],
      defaultId: 1,
      cancelId: 1,
      title: 'Unsaved changes',
      message: 'This project has unsaved changes.',
      detail: 'Leave without saving? Your changes will be lost.',
    });
    // preventDefault here overrides the page's veto: the window unloads.
    if (choice === 0) event.preventDefault();
  });

  // A file dropped on the window would otherwise be navigated to, replacing
  // the app. Only moves within the app itself go through.
  win.webContents.on('will-navigate', (event, url) => {
    if (!isSameApp(win.webContents.getURL(), url)) event.preventDefault();
  });

  // A crashed or killed renderer leaves a blank window; bring the app back.
  // A renderer that dies again and again (a crash on load) is not reloaded
  // forever: after three crashes inside a minute the window stays as it is.
  const recentCrashes = [];
  win.webContents.on('render-process-gone', (_event, details) => {
    if (details.reason === 'clean-exit' || win.isDestroyed()) return;
    const now = Date.now();
    while (recentCrashes.length && now - recentCrashes[0] > 60000) recentCrashes.shift();
    recentCrashes.push(now);
    if (recentCrashes.length <= 3) win.reload();
  });

  // ELECTRON_START_URL points the shell at the Vite dev server for hot reload
  // (start `npm run dev`, then set ELECTRON_START_URL to its URL and run
  // `npm run app`); otherwise the shell loads the built bundle.
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

function isExternalLink(url) {
  try {
    return ['http:', 'https:', 'mailto:'].includes(new URL(url).protocol);
  } catch {
    return false;
  }
}

// The built app is one file:// document (a hash router moves within it);
// the dev server's routes are paths on one origin.
function isSameApp(currentUrl, targetUrl) {
  try {
    const current = new URL(currentUrl);
    const target = new URL(targetUrl);
    if (current.protocol === 'file:') return target.protocol === 'file:' && target.pathname === current.pathname;
    return target.origin === current.origin;
  } catch {
    return false;
  }
}

app.on('window-all-closed', () => {
  app.quit();
});
