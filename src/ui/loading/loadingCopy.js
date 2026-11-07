/**
 * Every word a loading state says, in one place (docs/loading-states.md §7).
 *
 * Verb first, sentence case, the real ellipsis, no "please", and numbers with
 * thousands separators — so copy is reviewed here rather than hunted for
 * across thirty screens.
 */

const numberFormat = new Intl.NumberFormat('en-US');

/** 2414 → "2,414". Non-numbers pass through as text. */
export function formatCount(value) {
  const number = Number(value);
  return Number.isFinite(number) ? numberFormat.format(number) : String(value ?? '');
}

/** "1 board", "38 boards", "2,414 screws". */
export function countOf(count, singular, plural = `${singular}s`) {
  return `${formatCount(count)} ${Number(count) === 1 ? singular : plural}`;
}

/** The thresholds every state times itself against (§3 rule 5). */
export const LOADING_TIMING = Object.freeze({
  /** Words appear from here; before it the region shows only its paper. */
  wordsDelayMs: 300,
  /** Once words are up they stay at least this long, so nothing flickers. */
  minVisibleMs: 400,
  /** The second, smaller line — what the wait is actually on. */
  detailDelayMs: 2000,
  /** The point a wait admits it is slow and offers a way out. */
  slowDelayMs: 10000,
  /** Fade-out of any loading state. Matches --duration-smooth. */
  exitMs: 300,
});

const ROUTE_LABELS = Object.freeze({
  '/floorplan': 'Opening the floor plan…',
  '/sketch': 'Opening Sketch Studio…',
  '/playground': 'Opening the playground…',
});

export const LOADING_COPY = Object.freeze({
  // Routes and the app itself
  opening: 'Opening…',
  // Not in the §7 table: a destination the table does not name keeps the
  // indicator's original words rather than claiming a specific one.
  openingWorkspace: 'Opening workspace…',
  appName: 'Modular Apartment Planner',

  // Projects
  draftCard: 'Opening…',
  unpackingArchive: 'Unpacking archive…',
  badProjectFile: "This isn't a project file (.json) or archive (.apz).",

  // 3D previews
  mainPreview: 'Building the model…',
  catchingUp: 'Catching up…',
  livePreview: 'Preparing live preview…',
  compilingCeiling: 'Compiling ceiling materials…',
  compilingWall: 'Compiling wall materials…',
  mainThreadCompile: 'This GPU compiles on the main thread',
  previewFailed: 'The 3D preview could not start on this device.',
  refining: 'Refining…',
  refiningTooltip: 'Save image — available once the picture has finished refining',

  // Assembly editors
  ceilingEditor: 'Preparing the ceiling editor…',
  wallEditor: 'Preparing the wall editor…',

  // Sheets
  sheetThumbnail: 'Rendering preview…',
  // A sheet viewport's settled states keep the words they had before the kit.
  sheetPreviewEmpty: 'No 3D geometry available.',
  sheetPreviewFailed: '3D preview failed to render.',
  exchangeZip: 'Rendering complete PDF and DXFs…',

  // Sketch Studio
  workshopChunk: 'Opening the workshop…',
  kernelBoot: 'Waking the solid kernel…',
  kernelRebuild: 'Rebuilding solids…',
  kernelFailed: 'The solid kernel could not start.',
  templateCard: 'Opening…',
  workshopZip: 'Packing workshop ZIP…',
  sheetPdfWorkshop: 'Rendering sheet PDF…',

  // Section and elevation views
  cuttingSection: 'Cutting section…',
  cuttingSectionDetail: 'Working out what the cut can see',

  // Analyses
  recomputing: 'Recomputing…',
  recomputingMap: 'Recomputing… showing the previous map',
  recomputingRun: 'Recomputing… showing the previous run',
  analysisPreparing: 'Preparing…',
  analysisBuildingModel: 'Building the model…',

  // Lifecycle generators
  generatingPackage: 'Generating…',
  regeneratingPackage: 'Regenerating…',

  // Long waits and failures
  slow: 'This is taking longer than expected.',
  goBack: 'Go back',
  cancel: 'Cancel',
  tryAgain: 'Try again',
});

/** The pill's words for a pending navigation to `pathname`. */
export function routeLabel(pathname) {
  if (!pathname || pathname === '/') return LOADING_COPY.opening;
  return ROUTE_LABELS[pathname] || LOADING_COPY.openingWorkspace;
}

/** "Reading Apartment 3.apz…" */
export function readingFile(name) {
  return name ? `Reading ${name}…` : 'Reading file…';
}

/**
 * "Cutting section A-A…" — the cut's own label, or the plain words without
 * one. Cuts are usually labelled "Section A-A" already; that word is not said
 * twice.
 */
export function cuttingSection(label) {
  const name = String(label ?? '')
    .replace(/^section\s+/i, '')
    .trim();
  return name ? `Cutting section ${name}…` : LOADING_COPY.cuttingSection;
}

/** "Drawing the front elevation…" */
export function drawingElevation(side) {
  return `Drawing the ${side} elevation…`;
}

/** "Compiling materials for 3 floors" */
export function mainPreviewDetail(floorCount) {
  return `Compiling materials for ${countOf(floorCount, 'floor')}`;
}

/** "Laying out 38 boards and 2,414 screws" */
export function ceilingEditorDetail(boardCount, screwCount) {
  return `Laying out ${countOf(boardCount, 'board')} and ${countOf(screwCount, 'screw')}`;
}

/** "Laying out 12 boards" */
export function wallEditorDetail(boardCount) {
  return `Laying out ${countOf(boardCount, 'board')}`;
}

/** "Rendering A3 PDF…" */
export function sheetPdf(size) {
  return `Rendering ${size || 'sheet'} PDF…`;
}

/** "Rendering PNG at 600 DPI…" */
export function sheetPng(dpi) {
  return `Rendering PNG at ${formatCount(dpi)} DPI…`;
}

/** "Building 3 parts…" */
export function kernelBuilding(partCount) {
  return `Building ${countOf(partCount, 'part')}…`;
}

/** Existing daylight copy: "Sampling Living room — 3 of 12". */
export function daylightSampling(roomName, done, total) {
  return `Sampling ${roomName} — ${formatCount(done)} of ${formatCount(total)}`;
}

/** Existing solar access copy: "Tracing 40 of 120 sensors". */
export function solarTracing(done, total) {
  return `Tracing ${formatCount(done)} of ${formatCount(total)} sensors`;
}
