import { useMemo } from 'react';
import AnchorOverlay from './AnchorOverlay';
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
    selectedHandles,
    selectionBounds,
    objectDraft,
    activeAnchor,
    isPanning,
    canvasBindings,
    precisionBindings,
    handleBindings,
  } = props;
  const transform = `translate(${viewport.panX} ${viewport.panY}) scale(${viewport.zoom})`;
  const grid = useMemo(
    () => (ui.viewMode === 'isometric'
      ? getIsometricGridData(viewport, interaction.canvasSize)
      : getGridLines(viewport, interaction.canvasSize)),
    [interaction.canvasSize, ui.viewMode, viewport],
  );

  return (
    <section className="sketchStudioCanvasPanel">
      <div className="sketchStudioCanvasFrame">
        <div className="sketchStudioCanvasChrome">
          <span>{ui.viewMode === 'isometric' ? `Isometric ${ui.isometricPlane}` : 'Drafting View'}</span>
          <span>{document.entities.length} entities</span>
        </div>

        <div className="sketchStudioCanvasViewport">
          <svg
            ref={canvasBindings.ref}
            className={`sketchStudioCanvas ${isPanning ? 'is-panning' : ''}`}
            onClick={canvasBindings.onClick}
            onPointerDown={canvasBindings.onPointerDown}
            onPointerMove={canvasBindings.onPointerMove}
            onPointerUp={canvasBindings.onPointerUp}
            onPointerCancel={canvasBindings.onPointerCancel}
            onPointerLeave={canvasBindings.onPointerLeave}
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
                        {grid.xMinor.map((x) => <line key={`minor-x-${x}`} x1={x} y1={grid.bounds.minY} x2={x} y2={grid.bounds.maxY} vectorEffect="non-scaling-stroke" />)}
                        {grid.yMinor.map((y) => <line key={`minor-y-${y}`} x1={grid.bounds.minX} y1={y} x2={grid.bounds.maxX} y2={y} vectorEffect="non-scaling-stroke" />)}
                      </g>
                      <g className="sketchStudioGrid sketchStudioGridMajor">
                        {grid.xMajor.map((x) => <line key={`major-x-${x}`} x1={x} y1={grid.bounds.minY} x2={x} y2={grid.bounds.maxY} vectorEffect="non-scaling-stroke" />)}
                        {grid.yMajor.map((y) => <line key={`major-y-${y}`} x1={grid.bounds.minX} y1={y} x2={grid.bounds.maxX} y2={y} vectorEffect="non-scaling-stroke" />)}
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

              <EntityRenderer entities={visibleEntities} hoveredId={hover.hoveredId} selectedIds={selection.selectedIds} />
              <DimensionRenderer entities={visibleEntities} allEntities={document.entities} hoveredId={hover.hoveredId} selectedIds={selection.selectedIds} />
              <DraftRenderer draft={draft} draftPreview={draftPreview} units={document.units} zoom={viewport.zoom} />
              <SelectionOverlay selectionBox={selection.selectionBox} />
              <TransformOverlay bounds={selectionBounds} selectedCount={selection.selectedIds.length} onTransformPointerDown={handleBindings.onTransformPointerDown} zoom={viewport.zoom} />
              <SnapOverlay snap={snap} />
              <EditHandles handles={selectedHandles} onHandlePointerDown={handleBindings.onHandlePointerDown} />
              <AnchorOverlay anchors={objectDraft.anchors || []} activeAnchorId={activeAnchor?.id} onAnchorPointerDown={handleBindings.onAnchorPointerDown} />
            </g>
          </svg>

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
