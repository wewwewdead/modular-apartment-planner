const PAGE_WIDTH = 11800;
const PADDING_X = 360;
const PADDING_Y = 320;
const SECTION_GAP = 260;
const TITLE_HEIGHT = 320;
const TITLE_GAP = 180;
const METRIC_COLUMNS = 2;
const METRIC_GAP_X = 220;
const METRIC_GAP_Y = 200;
const METRIC_HEIGHT = 760;
const NOTE_LINE_HEIGHT = 220;
const NOTE_SECTION_PADDING = 80;
const TABLE_HEADER_HEIGHT = 360;
const TABLE_ROW_HEIGHT = 320;

function metricCardsWidth() {
  return PAGE_WIDTH - (PADDING_X * 2);
}

function buildMetricCards(schedule) {
  return [
    { key: 'net-surface-area', label: 'Net Roof Area', value: schedule.netSurfaceArea, kind: 'area', emphasis: true },
    { key: 'net-plan-area', label: 'Projected Area', value: schedule.netPlanArea, kind: 'area' },
    { key: 'parapet-length', label: 'Parapet Length', value: schedule.parapetLengthTotal, kind: 'length' },
    { key: 'gutter-length', label: 'Gutter Length', value: schedule.gutterLengthTotal, kind: 'length', meta: schedule.gutterSource === 'derived_roof_edges' ? 'derived' : null },
    { key: 'downspouts', label: 'Downspouts', value: schedule.downspoutCount, kind: 'count', meta: schedule.downspoutSource === 'derived_from_gutters' ? 'derived' : null },
    { key: 'drains', label: 'Drains', value: schedule.drainCount, kind: 'count' },
    { key: 'skylights', label: 'Skylights', value: schedule.skylightCount, kind: 'count' },
    { key: 'access-openings', label: 'Roof Hatches', value: schedule.accessOpeningCount || 0, kind: 'count' },
    { key: 'openings', label: 'Other Openings', value: schedule.roofOpeningCount, kind: 'count' },
  ];
}

function buildOpeningColumns() {
  return [
    { key: 'name', label: 'Item', width: 3080 },
    { key: 'type', label: 'Type', width: 1680 },
    { key: 'size', label: 'Size', width: 2440 },
    { key: 'area', label: 'Area', width: 1460 },
    { key: 'curb', label: 'Curb', width: 1420 },
  ];
}

export function buildRoofScheduleLayout(schedule, options = {}) {
  const showTitle = options.showTitle ?? true;
  const width = PAGE_WIDTH;
  const metrics = buildMetricCards(schedule);
  const cardWidth = (metricCardsWidth() - METRIC_GAP_X) / METRIC_COLUMNS;

  let cursorY = PADDING_Y;

  const title = showTitle
    ? {
        x: PADDING_X,
        y: cursorY + TITLE_HEIGHT,
        fontSize: 240,
      }
    : null;

  if (showTitle) {
    cursorY += TITLE_HEIGHT + TITLE_GAP;
  }

  const metricCards = metrics.map((metric, index) => {
    const column = index % METRIC_COLUMNS;
    const row = Math.floor(index / METRIC_COLUMNS);
    return {
      ...metric,
      x: PADDING_X + column * (cardWidth + METRIC_GAP_X),
      y: cursorY + row * (METRIC_HEIGHT + METRIC_GAP_Y),
      width: cardWidth,
      height: METRIC_HEIGHT,
    };
  });
  const metricRows = Math.ceil(metrics.length / METRIC_COLUMNS);
  cursorY += (metricRows * METRIC_HEIGHT) + (Math.max(0, metricRows - 1) * METRIC_GAP_Y);

  const notesSection = {
    title: { x: PADDING_X, y: cursorY + SECTION_GAP, fontSize: 180 },
    rows: schedule.notes.map((note, index) => ({
      id: `note-${index}`,
      text: note,
      x: PADDING_X,
      y: cursorY + SECTION_GAP + NOTE_SECTION_PADDING + ((index + 1) * NOTE_LINE_HEIGHT),
    })),
  };
  if (schedule.notes.length) {
    cursorY = notesSection.rows[notesSection.rows.length - 1].y + NOTE_SECTION_PADDING;
  } else {
    notesSection.title = null;
  }

  cursorY += SECTION_GAP;

  const columns = buildOpeningColumns();
  let columnX = PADDING_X;
  const tableColumns = columns.map((column) => {
    const nextColumn = { ...column, x: columnX };
    columnX += column.width;
    return nextColumn;
  });
  const tableRows = (schedule.openings.length ? schedule.openings : [
    {
      id: 'no-openings',
      name: 'No roof openings scheduled',
      type: '-',
      length: 0,
      width: 0,
      planArea: 0,
      curbHeight: 0,
      placeholder: true,
    },
  ]).map((row, index) => ({
    ...row,
    y: cursorY + TABLE_HEADER_HEIGHT + (index * TABLE_ROW_HEIGHT),
    height: TABLE_ROW_HEIGHT,
  }));

  const table = {
    title: { x: PADDING_X, y: cursorY - 60, fontSize: 180 },
    x: PADDING_X,
    y: cursorY,
    width: tableColumns.reduce((sum, column) => sum + column.width, 0),
    columns: tableColumns,
    headerHeight: TABLE_HEADER_HEIGHT,
    rowHeight: TABLE_ROW_HEIGHT,
    rows: tableRows,
  };

  cursorY += TABLE_HEADER_HEIGHT + (tableRows.length * TABLE_ROW_HEIGHT);

  const bounds = {
    minX: 0,
    maxX: width,
    minY: 0,
    maxY: cursorY + PADDING_Y,
  };

  return {
    title,
    metricCards,
    notesSection,
    table,
    bounds,
  };
}
