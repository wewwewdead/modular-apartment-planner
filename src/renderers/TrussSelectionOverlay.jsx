import { buildFloorTrussGeometry } from '@/geometry/trussGeometry';
import { TRUSS_SUPPORT_MODES } from '@/domain/trussModels';
import { deriveBeamSupportedInstanceGeometry } from '@/truss/beamSupports';

const HANDLE_SIZE = 8;
const HANDLE_OFFSET = 28;
const MOVE_HANDLE_SIZE = 10;
const RESIZE_HANDLE_SIZE = 9;

function findSelectedInstance(trussSystems, selectedId) {
  for (const trussSystem of trussSystems) {
    const trussInstance = (trussSystem.trussInstances || []).find((entry) => entry.id === selectedId) || null;
    if (trussInstance) {
      return { trussSystem, trussInstance };
    }
  }
  return { trussSystem: null, trussInstance: null };
}

function getSelectedSystemId(trussSystems, selectedId, selectedType) {
  if (selectedType === 'trussSystem') return selectedId;
  return findSelectedInstance(trussSystems, selectedId).trussSystem?.id || null;
}

function buildPreviewTrussSystems(trussSystems, toolState) {
  return trussSystems.map((trussSystem) => {
    let nextSystem = {
      ...trussSystem,
    };

    if (toolState.trussRotateSystemId === trussSystem.id && toolState.trussRotateCurrentOffsetDegrees != null) {
      nextSystem = {
        ...nextSystem,
        planRotationOffsetDegrees: toolState.trussRotateCurrentOffsetDegrees,
      };
    }

    if (toolState.trussMoveSystemId === trussSystem.id && toolState.trussMoveCurrentOffset) {
      nextSystem = {
        ...nextSystem,
        planOffset: toolState.trussMoveCurrentOffset,
      };
    }

    if (toolState.trussResizeSystemId === trussSystem.id) {
      nextSystem = {
        ...nextSystem,
        planOffset: toolState.trussResizeCurrentOffset || nextSystem.planOffset,
        planLengthScale: toolState.trussResizeCurrentLengthScale ?? nextSystem.planLengthScale,
      };
    }

    if (toolState.trussDragInstanceId && toolState.trussDragCurrentOffset != null) {
      const hasDraggedInstance = (nextSystem.trussInstances || []).some((entry) => entry.id === toolState.trussDragInstanceId);
      if (hasDraggedInstance) {
        nextSystem = {
          ...nextSystem,
          trussInstances: (nextSystem.trussInstances || []).map((entry) => (
            entry.id === toolState.trussDragInstanceId
              ? { ...entry, supportOffsetAlongAxis: toolState.trussDragCurrentOffset }
              : entry
          )),
        };
      }
    }

    return nextSystem;
  });
}

function renderRotationHandle(systemGeometry, zoom) {
  if (!systemGeometry) return null;

  const handleR = HANDLE_SIZE / zoom;
  const handleOffset = HANDLE_OFFSET / zoom;
  const handlePoint = {
    x: (systemGeometry.planBounds.minX + systemGeometry.planBounds.maxX) / 2,
    y: systemGeometry.planBounds.minY - handleOffset,
  };

  return (
    <g>
      <line
        x1={systemGeometry.transform.pivot.x}
        y1={systemGeometry.transform.pivot.y}
        x2={handlePoint.x}
        y2={handlePoint.y}
        stroke="var(--color-selection)"
        strokeWidth={1.5}
        strokeDasharray="4 3"
        vectorEffect="non-scaling-stroke"
      />
      <circle
        data-handle="truss-rotate"
        data-system-id={systemGeometry.trussSystem.id}
        cx={handlePoint.x}
        cy={handlePoint.y}
        r={handleR}
        fill="white"
        stroke="var(--color-selection)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'grab' }}
      />
    </g>
  );
}

function renderMoveHandle(systemGeometry, zoom) {
  if (!systemGeometry?.transform?.pivot) return null;

  const halfSize = MOVE_HANDLE_SIZE / zoom;
  const pivot = systemGeometry.transform.pivot;

  return (
    <g>
      <rect
        data-handle="truss-move-system"
        data-system-id={systemGeometry.trussSystem.id}
        x={pivot.x - halfSize}
        y={pivot.y - halfSize}
        width={halfSize * 2}
        height={halfSize * 2}
        fill="white"
        stroke="var(--color-selection)"
        strokeWidth={2}
        vectorEffect="non-scaling-stroke"
        style={{ cursor: 'grab' }}
      />
      <line
        x1={pivot.x - halfSize * 0.7}
        y1={pivot.y}
        x2={pivot.x + halfSize * 0.7}
        y2={pivot.y}
        stroke="var(--color-selection)"
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
      <line
        x1={pivot.x}
        y1={pivot.y - halfSize * 0.7}
        x2={pivot.x}
        y2={pivot.y + halfSize * 0.7}
        stroke="var(--color-selection)"
        strokeWidth={1.4}
        vectorEffect="non-scaling-stroke"
      />
    </g>
  );
}

function renderResizeHandles(systemGeometry, zoom) {
  if (!systemGeometry?.transform?.resizable) return null;

  const halfSize = RESIZE_HANDLE_SIZE / zoom;
  const handlePoints = [
    { side: 'start', point: systemGeometry.transform.startHandlePoint },
    { side: 'end', point: systemGeometry.transform.endHandlePoint },
  ];

  return handlePoints.map(({ side, point }) => (
    <rect
      key={`${systemGeometry.trussSystem.id}_${side}`}
      data-handle="truss-resize-system"
      data-side={side}
      data-system-id={systemGeometry.trussSystem.id}
      x={point.x - halfSize}
      y={point.y - halfSize}
      width={halfSize * 2}
      height={halfSize * 2}
      fill="white"
      stroke="var(--color-selection)"
      strokeWidth={2}
      vectorEffect="non-scaling-stroke"
      style={{ cursor: 'ew-resize' }}
    />
  ));
}

export default function TrussSelectionOverlay({
  floor = null,
  trussSystems = [],
  selectedId,
  selectedType,
  toolState = {},
  zoom = 1,
}) {
  if (!selectedId || !selectedType) return null;

  const previewTrussSystems = buildPreviewTrussSystems(trussSystems, toolState);
  const floorGeometry = buildFloorTrussGeometry(previewTrussSystems);
  const selectedSystemId = getSelectedSystemId(trussSystems, selectedId, selectedType);
  const selectedSystemGeometry = selectedSystemId
    ? floorGeometry.systems.find((entry) => entry.trussSystem.id === selectedSystemId) || null
    : null;

  if (selectedType === 'trussSystem') {
    const systemGeometry = selectedSystemGeometry;
    if (!systemGeometry) return null;
    const bounds = systemGeometry.planBounds;

    return (
      <g>
        {systemGeometry.instances.flatMap((instanceGeometry) => (
          instanceGeometry.copies.map((copy) => (
            <line
              key={copy.id}
              x1={copy.overallStartPoint.x}
              y1={copy.overallStartPoint.y}
              x2={copy.overallEndPoint.x}
              y2={copy.overallEndPoint.y}
              stroke="var(--color-selection)"
              strokeWidth={2}
              strokeDasharray="6 3"
              vectorEffect="non-scaling-stroke"
            />
          ))
        ))}
        <rect
          x={bounds.minX}
          y={bounds.minY}
          width={Math.max(bounds.maxX - bounds.minX, 1)}
          height={Math.max(bounds.maxY - bounds.minY, 1)}
          fill="var(--color-selection-fill)"
          stroke="var(--color-selection)"
          strokeWidth={2}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {renderMoveHandle(systemGeometry, zoom)}
        {renderResizeHandles(systemGeometry, zoom)}
        {renderRotationHandle(systemGeometry, zoom)}
      </g>
    );
  }

  if (selectedType === 'trussInstance') {
    const { trussSystem, trussInstance } = findSelectedInstance(trussSystems, selectedId);
    const instanceGeometry = selectedSystemGeometry?.instances.find((entry) => entry.instance.id === selectedId) || null;
    if (!instanceGeometry || !selectedSystemGeometry) return null;

    const isBeamSupported = trussInstance?.supportMode === TRUSS_SUPPORT_MODES.BEAM_PAIR;
    const support = isBeamSupported && floor
      ? deriveBeamSupportedInstanceGeometry(trussInstance, floor)
      : null;

    return (
      <g>
        <rect
          x={selectedSystemGeometry.planBounds.minX}
          y={selectedSystemGeometry.planBounds.minY}
          width={Math.max(selectedSystemGeometry.planBounds.maxX - selectedSystemGeometry.planBounds.minX, 1)}
          height={Math.max(selectedSystemGeometry.planBounds.maxY - selectedSystemGeometry.planBounds.minY, 1)}
          fill="none"
          stroke="var(--color-selection)"
          strokeOpacity={0.4}
          strokeWidth={1.25}
          strokeDasharray="6 3"
          vectorEffect="non-scaling-stroke"
        />
        {support?.valid && (
          <line
            x1={support.startPoint.x}
            y1={support.startPoint.y}
            x2={support.endPoint.x}
            y2={support.endPoint.y}
            stroke="var(--color-selection)"
            strokeOpacity={0.45}
            strokeWidth={1.25}
            strokeDasharray="4 4"
            vectorEffect="non-scaling-stroke"
          />
        )}
        {instanceGeometry.copies.map((copy) => (
          <line
            key={copy.id}
            x1={copy.overallStartPoint.x}
            y1={copy.overallStartPoint.y}
            x2={copy.overallEndPoint.x}
            y2={copy.overallEndPoint.y}
            stroke="var(--color-selection)"
            strokeWidth={2}
            strokeDasharray="6 3"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {renderMoveHandle(selectedSystemGeometry, zoom)}
        {renderResizeHandles(selectedSystemGeometry, zoom)}
        {renderRotationHandle(selectedSystemGeometry, zoom)}
      </g>
    );
  }

  return null;
}
