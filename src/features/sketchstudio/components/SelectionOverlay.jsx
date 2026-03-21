import { normalizeSelectionBox } from '../utils/selectionUtils';

export default function SelectionOverlay({ selectionBox }) {
  if (!selectionBox.isActive || !selectionBox.start || !selectionBox.current) {
    return null;
  }

  const box = normalizeSelectionBox(selectionBox.start, selectionBox.current);

  return (
    <g className="sketchStudioSelectionOverlay" pointerEvents="none">
      <rect
        className="sketchStudioSelectionBox"
        x={box.x}
        y={box.y}
        width={box.width}
        height={box.height}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}
