const { app, BrowserWindow, shell } = require('electron');
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
    backgroundColor: '#1a1a2e',
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
  // system browser instead of spawning chromeless Electron windows.
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });

  // ELECTRON_START_URL lets `npm run app:dev` point the shell at the Vite dev
  // server for hot reload; the packaged app always loads the built bundle.
  const devUrl = process.env.ELECTRON_START_URL;
  if (devUrl) {
    win.loadURL(devUrl);
  } else {
    win.loadFile(path.join(__dirname, '..', 'dist', 'index.html'));
  }
}

app.on('window-all-closed', () => {
  app.quit();
});
