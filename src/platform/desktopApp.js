/**
 * True when the app is running inside its Electron desktop shell rather than a
 * browser tab.
 *
 * The shell keeps the default user agent, which Electron stamps with its own
 * token — no preload script or IPC needed for a boolean this coarse. Renderers
 * use this to pick heavier quality defaults: the desktop app owns the whole
 * GPU and the machine was chosen by the user, where a browser tab has to
 * assume it is sharing an unknown one.
 */
export const IS_DESKTOP_APP = typeof navigator !== 'undefined' && navigator.userAgent.includes('Electron/');
