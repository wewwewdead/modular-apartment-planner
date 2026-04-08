import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import DimensionRenderer from './DimensionRenderer';
import DraftRenderer from './DraftRenderer';
import EditHandles from './EditHandles';
import EntityRenderer from './EntityRenderer';
import PrecisionHud from './PrecisionHud';
import SelectionOverlay from './SelectionOverlay';
import SnapOverlay from './SnapOverlay';
import TransformOverlay from './TransformOverlay';
import { getGridLines } from '../utils/gridUtils';
import { getIsometricGridData } from '../utils/isometricUtils';
import { getTextMetrics } from '../utils/entityUtils';

export function getJoineryPreviewVisibleEntities(visibleEntities = [], manufacturingPreviewEntities = []) {
  const hiddenEntityIds = new Set(
    manufacturingPreviewEntities
      .filter((entity) => entity.meta?.manufacturingDetailType === 'profile')
      .flatMap((entity) => entity.meta?.manufacturingSourceEntityIds || []),
  );

  if (!hiddenEntityIds.size) {
    return visibleEntities;
  }

  return visibleEntities.filter((entity) => !hiddenEntityIds.has(entity.id));
}

function InlineTextEditor({ entity, viewport, onCommit, onCancel }) {
  const inputRef = useRef(null);
  const metrics = getTextMetrics(entity);

  useEffect(() => {
    const el = inputRef.current;
    if (el) {
      el.focus();
      el.select();
    }
  }, []);

  const handleKeyDown = useCallback(
    (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        onCommit(inputRef.current.value);
      }
      if (e.key === 'Escape') {
        e.preventDefault();
        onCancel();
      }
      e.stopPropagation();
    },
    [onCommit, onCancel],
  );

  const handleBlur = useCallback(() => {
    onCommit(inputRef.current.value);
  }, [onCommit]);

  // Position in screen space
  const screenX = entity.x * viewport.zoom + viewport.panX;
  const screenY = entity.y * viewport.zoom + viewport.panY;
  const fontSize = Math.max(entity.fontSize * viewport.zoom, 12);

  return (
    <div
      style={{
        position: 'absolute',
        left: screenX,
        top: screenY,
        zIndex: 100,
        transform: `rotate(${entity.rotation ?? 0}deg)`,
        transformOrigin: '0 0',
      }}
    >
      <input
        ref={inputRef}
        type="text"
        defaultValue={entity.text}
        onKeyDown={handleKeyDown}
        onBlur={handleBlur}
        style={{
          font: `${fontSize}px sans-serif`,
          background: 'rgba(21, 29, 40, 0.95)',
          color: '#f2f6ff',
          border: '1.5px solid rgba(104, 163, 255, 0.6)',
          borderRadius: 3,
          padding: '2px 4px',
          outline: 'none',
          minWidth: Math.max(metrics.width * viewport.zoom, 80),
          boxSizing: 'border-box',
        }}
      />
    </div>
  );
}

export default function DraftingCanvas(props) {
  const {
    document,
    visibleEntities,
    viewport,
    ui,
    interaction,
    selection,
    hover,
    draft,
    draftPreview,
    precisionHud,
    snap,
    manufacturingPreviewEntities = [],
    onJoineryClick,
    selectedHandles,
    selectionBounds,
    isPanning,
    canvasRef,
    onCanvasClick,
    onCanvasPointerDown,
    onCanvasPointerMove,
    onCanvasPointerUp,
    onCanvasPointerCancel,
    onCanvasPointerLeave,
    precisionBindings,
    handleBindings,
    onUpdateEntityField,
  } = props;

  const [editingTextId, setEditingTextId] = useState(null);
  const [dismissedAutoEditId, setDismissedAutoEditId] = useState(null);
  const transform = `translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`;
  const previewVisibleEntities = useMemo(
    () => getJoineryPreviewVisibleEntities(visibleEntities, manufacturingPreviewEntities),
    [visibleEntities, manufacturingPreviewEntities],
  );
  const grid = useMemo(
    () =>
      ui.viewMode === 'isometric'
        ? getIsometricGridData(viewport, interaction.canvasSize)
        : getGridLines(viewport, interaction.canvasSize),
    [interaction.canvasSize, ui.viewMode, viewport],
  );

  const handleJoineryEntityClick = useCallback(
    (entity) => {
      const jointId = entity.meta?.joinery?.jointId || entity.meta?.jointIds?.[0] || null;
      if (jointId && onJoineryClick) {
        onJoineryClick(jointId);
      }
    },
    [onJoineryClick],
  );

  const selectedTextEntity = useMemo(() => {
    if (selection.selectedIds.length !== 1) {
      return null;
    }

    const selectedId = selection.selectedIds[0];
    const entity = document.entities.find((item) => item.id === selectedId) || null;
    return entity?.type === 'text' ? entity : null;
  }, [document.entities, selection.selectedIds]);
  const suppressedAutoEditId =
    dismissedAutoEditId && selection.selectedIds.includes(dismissedAutoEditId) ? dismissedAutoEditId : null;
  const autoEditingTextId =
    selectedTextEntity?.text === 'Label' && selectedTextEntity.id !== suppressedAutoEditId
      ? selectedTextEntity.id
      : null;
  const activeEditingTextId =
    editingTextId && selection.selectedIds.includes(editingTextId) ? editingTextId : autoEditingTextId;
  const editingEntity = activeEditingTextId ? document.entities.find((e) => e.id === activeEditingTextId) : null;

  const handleDoubleClick = useCallback(
    (event) => {
      if (selection.selectedIds.length !== 1) return;
      const selectedId = selection.selectedIds[0];
      const entity = document.entities.find((e) => e.id === selectedId);
      if (entity?.type === 'text') {
        event.preventDefault();
        event.stopPropagation();
        setDismissedAutoEditId(null);
        setEditingTextId(entity.id);
      }
    },
    [selection.selectedIds, document.entities],
  );

  const handleTextCommit = useCallback(
    (newText) => {
      if (onUpdateEntityField && activeEditingTextId) {
        onUpdateEntityField('text', newText);
      }
      setEditingTextId(null);
      setDismissedAutoEditId(newText === 'Label' ? activeEditingTextId : null);
    },
    [activeEditingTextId, onUpdateEntityField],
  );

  const handleTextCancel = useCallback(() => {
    setEditingTextId(null);
    if (activeEditingTextId) {
      setDismissedAutoEditId(activeEditingTextId);
    }
  }, [activeEditingTextId]);

  return (
    <section className="sketchStudioCanvasPanel">
      <div className="sketchStudioCanvasFrame">
        <div className="sketchStudioCanvasChrome">
          <span>{ui.viewMode === 'isometric' ? `Isometric ${ui.isometricPlane}` : 'Drafting View'}</span>
          <span>{document.entities.length} entities</span>
        </div>

        <div className="sketchStudioCanvasViewport">
          <svg
            ref={canvasRef}
            className={`sketchStudioCanvas ${isPanning ? 'is-panning' : ''}`}
            onClick={onCanvasClick}
            onDoubleClick={handleDoubleClick}
            onPointerDown={onCanvasPointerDown}
            onPointerMove={onCanvasPointerMove}
            onPointerUp={onCanvasPointerUp}
            onPointerCancel={onCanvasPointerCancel}
            onPointerLeave={onCanvasPointerLeave}
            onDragStart={(event) => event.preventDefault()}
            onContextMenu={(event) => event.preventDefault()}
          >
            <rect className="sketchStudioCanvasBackdrop" x="0" y="0" width="100%" height="100%" pointerEvents="none" />

            <g transform={transform}>
              {ui.showGrid ? (
                <>
                  {ui.viewMode === 'isometric' ? (
                    <>
                      <g className="sketchStudioGrid sketchStudioGridMinor">
                        {grid.isoMinor.map((line) => (
                          <line
                            key={`iso-minor-${line.id}`}
                            x1={line.x1}
                            y1={line.y1}
                            x2={line.x2}
                            y2={line.y2}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                      <g className="sketchStudioGrid sketchStudioGridMajor">
                        {grid.isoMajor.map((line) => (
                          <line
                            key={`iso-major-${line.id}`}
                            x1={line.x1}
                            y1={line.y1}
                            x2={line.x2}
                            y2={line.y2}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    </>
                  ) : (
                    <>
                      <g className="sketchStudioGrid sketchStudioGridMinor">
                        {grid.xMinor.map((x) => (
                          <line
                            key={`minor-x-${x}`}
                            x1={x}
                            y1={grid.bounds.minY}
                            x2={x}
                            y2={grid.bounds.maxY}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                        {grid.yMinor.map((y) => (
                          <line
                            key={`minor-y-${y}`}
                            x1={grid.bounds.minX}
                            y1={y}
                            x2={grid.bounds.maxX}
                            y2={y}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                      <g className="sketchStudioGrid sketchStudioGridMajor">
                        {grid.xMajor.map((x) => (
                          <line
                            key={`major-x-${x}`}
                            x1={x}
                            y1={grid.bounds.minY}
                            x2={x}
                            y2={grid.bounds.maxY}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                        {grid.yMajor.map((y) => (
                          <line
                            key={`major-y-${y}`}
                            x1={grid.bounds.minX}
                            y1={y}
                            x2={grid.bounds.maxX}
                            y2={y}
                            vectorEffect="non-scaling-stroke"
                          />
                        ))}
                      </g>
                    </>
                  )}
                </>
              ) : null}

              <g className="sketchStudioGrid sketchStudioGridAxis">
                {ui.viewMode === 'isometric' ? (
                  grid.axis.map((line) => (
                    <line
                      key={`axis-${line.id}`}
                      x1={line.x1}
                      y1={line.y1}
                      x2={line.x2}
                      y2={line.y2}
                      vectorEffect="non-scaling-stroke"
                    />
                  ))
                ) : (
                  <>
                    <line x1={0} y1={grid.bounds.minY} x2={0} y2={grid.bounds.maxY} vectorEffect="non-scaling-stroke" />
                    <line x1={grid.bounds.minX} y1={0} x2={grid.bounds.maxX} y2={0} vectorEffect="non-scaling-stroke" />
                  </>
                )}
              </g>

              <EntityRenderer
                entities={previewVisibleEntities}
                hoveredId={hover.hoveredId}
                selectedIds={selection.selectedIds}
              />
              <DimensionRenderer
                entities={previewVisibleEntities}
                allEntities={document.entities}
                hoveredId={hover.hoveredId}
                selectedIds={selection.selectedIds}
              />
              {manufacturingPreviewEntities.length ? (
                <EntityRenderer
                  entities={manufacturingPreviewEntities}
                  hoveredId={null}
                  selectedIds={[]}
                  baseClassName="sketchStudioEntity sketchStudioEntityJoinery"
                  onEntityClick={onJoineryClick ? handleJoineryEntityClick : undefined}
                />
              ) : null}
              <DraftRenderer draft={draft} draftPreview={draftPreview} units={document.units} zoom={viewport.zoom} />
              <SelectionOverlay selectionBox={selection.selectionBox} />
              <TransformOverlay
                bounds={selectionBounds}
                selectedCount={selection.selectedIds.length}
                onTransformPointerDown={handleBindings.onTransformPointerDown}
                zoom={viewport.zoom}
              />
              <SnapOverlay snap={snap} />
              <EditHandles
                handles={selectedHandles}
                onHandlePointerDown={handleBindings.onHandlePointerDown}
                zoom={viewport.zoom}
              />
            </g>
          </svg>

          {editingEntity && (
            <InlineTextEditor
              entity={editingEntity}
              viewport={viewport}
              onCommit={handleTextCommit}
              onCancel={handleTextCancel}
            />
          )}

          <PrecisionHud
            precisionHud={precisionHud}
            cursorScreen={interaction.cursorScreen}
            onInputChange={precisionBindings.onInputChange}
            onSubmit={precisionBindings.onSubmit}
          />
        </div>
      </div>
    </section>
  );
}
