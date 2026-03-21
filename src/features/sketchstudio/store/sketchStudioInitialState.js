import sampleDocument from '../data/sampleDocument';

const emptySelectionBox = {
  start: null,
  current: null,
  isActive: false,
  hasMoved: false,
};

const emptyPrecisionInput = {
  length: '',
  width: '',
  height: '',
  radius: '',
  diameter: '',
  offset: '',
  activeField: null,
};

const emptyObjectDraft = {
  id: null,
  name: '',
  objectType: null,
  category: 'custom',
  units: sampleDocument.units,
  sourceDocumentId: sampleDocument.id,
  sourceEntityIds: [],
  profileEntityIds: [],
  defaults: {
    thickness: 18,
    material: 'plywood',
  },
  footprint: null,
  bounds: {
    width: 0,
    depth: 0,
    height: 900,
  },
  parts: [],
  features: [],
  anchors: [],
  activeAnchorId: null,
  anchor: { x: 0, y: 0, name: 'origin', kind: 'primary' },
  template: null,
  generator: {
    type: null,
    params: {},
  },
  bom: {
    rows: [],
    groupedRows: [],
  },
  constraints: [],
  patterns: [],
  metadata: { creationMode: 'blank' },
  isDirty: false,
};

const sketchStudioInitialState = {
  document: sampleDocument,
  viewport: {
    zoom: 1,
    panX: 0,
    panY: 0,
  },
  ui: {
    activeTool: 'select',
    showGrid: true,
    snapEnabled: true,
    orthoEnabled: false,
    viewMode: 'plan',
    isometricPlane: 'top',
    activeLayerId: 'default',
    activeObjectId: null,
  },
  interaction: {
    mode: 'idle',
    cursorScreen: { x: 0, y: 0 },
    cursorWorld: { x: 0, y: 0 },
    isPointerDown: false,
    pointerId: null,
    panStartScreen: null,
    panStartViewport: null,
    canvasSize: { width: 0, height: 0 },
    handleDrag: null,
    anchorDrag: null,
    transform: null,
    suppressNextClick: false,
  },
  selection: {
    selectedIds: [],
    selectionBox: emptySelectionBox,
  },
  hover: {
    hoveredId: null,
  },
  draft: {
    type: null,
    step: null,
    startPoint: null,
    currentPoint: null,
    points: [],
    sourceRefs: [],
    subtype: null,
    precisionInput: emptyPrecisionInput,
  },
  snap: {
    point: null,
    sourceEntityId: null,
    entityType: null,
    sourceType: null,
    sourceKey: null,
    snapType: null,
  },
  objectDraft: emptyObjectDraft,
  objectLibrary: {
    items: [],
  },
  history: {
    past: [],
    future: [],
  },
};

export default sketchStudioInitialState;
