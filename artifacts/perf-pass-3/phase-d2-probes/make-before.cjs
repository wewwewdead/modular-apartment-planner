// Rebuilds the pre-D2.3 SheetCanvas / SheetRenderer as temporary siblings
// (SheetCanvasBefore.jsx / SheetRendererBefore.jsx) for the before numbers.
const fs = require('fs');
const dir = 'C:/Users/johnm/modular apartment planner/src/features/floorplan/components/renderers/';
let canvas = fs.readFileSync(dir + 'SheetCanvas.jsx', 'utf8').replace(/\r\n/g, '\n');
let renderer = fs.readFileSync(dir + 'SheetRenderer.jsx', 'utf8').replace(/\r\n/g, '\n');
function rep(name, s, a, b) {
  const i = s.indexOf(a);
  if (i < 0) throw new Error(name + ': ' + a.slice(0, 80));
  return s.slice(0, i) + b + s.slice(i + a.length);
}
renderer = rep('r1', renderer, "import { memo } from 'react';\n", '');
renderer = rep(
  'r2',
  renderer,
  renderer.slice(renderer.indexOf('/**\n * One sheet, drawn'), renderer.indexOf('  if (!scene) return null;')),
  'export default function SheetRenderer({ project, sheet, selectedId, selectedType, resolveSource }) {\n  const scene = buildSheetScene(project, sheet, resolveSource ? { resolveSource } : undefined);\n',
);
renderer = rep('r3', renderer, '\nexport default memo(SheetRenderer);\n', '');

canvas = rep('c0', canvas, "import SheetRenderer from './SheetRenderer';", "import SheetRenderer from './SheetRendererBefore';");
canvas = rep(
  'c1',
  canvas,
  canvas.slice(canvas.indexOf('  const getSheetPos = useCallback('), canvas.indexOf('  const updateViewport = useCallback(')),
  `  const getSheetPos = useCallback(
    (event) => {
      const rect = svgRef.current.getBoundingClientRect();
      return screenToSheet(event.clientX, event.clientY, viewport, rect);
    },
    [viewport],
  );

`,
);
canvas = rep(
  'c2',
  canvas,
  canvas.slice(canvas.indexOf('        const pending = pendingPan.current;'), canvas.indexOf('        lastPanPos.current = { x: event.clientX, y: event.clientY };', canvas.indexOf('        const pending = pendingPan.current;'))),
  "        editorDispatch({ type: 'PAN', dx, dy });\n",
);
canvas = canvas.replace(/\n\s*flushPan\(\);/g, '');
canvas = rep('c3', canvas, '[abandonDrag, flushPan, getSheetPos, sheet, updateViewport]', '[abandonDrag, editorDispatch, getSheetPos, sheet, updateViewport]');
canvas = canvas.replace(/\[flushPan, releasePointer\]/g, '[releasePointer]');
canvas = rep('c4', canvas, '[dispatch, flushPan, releasePointer]', '[dispatch, releasePointer]');
canvas = rep(
  'c5',
  canvas,
  canvas.slice(canvas.indexOf('  // Reads the view through a ref'), canvas.indexOf('  useEffect(() => {\n    const svg = svgRef.current;')),
  `  const handleWheel = useCallback(
    (event) => {
      event.preventDefault();
      const rect = svgRef.current.getBoundingClientRect();
      const mouseX = event.clientX - rect.left;
      const mouseY = event.clientY - rect.top;
      const direction = event.deltaY < 0 ? 1 : -1;
      const factor = direction > 0 ? ZOOM_FACTOR : 1 / ZOOM_FACTOR;
      const newZoom = Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, viewport.zoom * factor));
      const panX = mouseX - (mouseX - viewport.panX) * (newZoom / viewport.zoom);
      const panY = mouseY - (mouseY - viewport.panY) * (newZoom / viewport.zoom);
      editorDispatch({ type: 'ZOOM', zoom: newZoom, panX, panY });
    },
    [editorDispatch, viewport],
  );

`,
);
fs.writeFileSync(dir + 'SheetCanvasBefore.jsx', canvas);
fs.writeFileSync(dir + 'SheetRendererBefore.jsx', renderer);
console.log('ok');
