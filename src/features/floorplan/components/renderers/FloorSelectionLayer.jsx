import { memo } from 'react';
import ClipboardPreviewLayer from './ClipboardPreviewLayer';
import RegionSelectionOverlay from './RegionSelectionOverlay';
import SelectionOverlay from './SelectionOverlay';

const FloorSelectionLayer = memo(function FloorSelectionLayer({
  previewContent,
  marqueeBounds,
  selectionBounds,
  selectedId,
  selectedType,
  floor,
  zoom,
}) {
  if (!floor) return null;

  return (
    <>
      <ClipboardPreviewLayer content={previewContent} />
      <RegionSelectionOverlay marqueeBounds={marqueeBounds} selectionBounds={selectionBounds} />
      <SelectionOverlay selectedId={selectedId} selectedType={selectedType} floor={floor} zoom={zoom} />
    </>
  );
});

export default FloorSelectionLayer;
