import { memo } from 'react';
import RoofRenderer from './RoofRenderer';
import RoofSelectionOverlay from './RoofSelectionOverlay';
import RoofPreviewLayer from './RoofPreviewLayer';
import RoofSectionRenderer from './RoofSectionRenderer';
import RoofElevationRenderer from './RoofElevationRenderer';

const RoofScene = memo(function RoofScene({
  roofSystem,
  roofHiddenByPhase,
  viewMode,
  selectedId,
  selectedType,
  activeTool,
  toolState,
  viewport,
  filteredProject,
  activeFloorId,
  activeSectionCutId,
}) {
  if (roofSystem || (viewMode === 'section_view' && roofHiddenByPhase)) {
    return (
      <>
        {viewMode === 'plan' ? (
          roofSystem ? (
            <>
              <RoofRenderer roofSystem={roofSystem} selectedId={selectedId} selectedType={selectedType} />
              <RoofSelectionOverlay
                roofSystem={roofSystem}
                selectedId={selectedId}
                selectedType={selectedType}
                zoom={viewport.zoom}
              />
              <RoofPreviewLayer activeTool={activeTool} toolState={toolState} roofSystem={roofSystem} />
            </>
          ) : (
            <g className="roof-empty-view">
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-text-secondary)"
                fontSize={180}
                fontFamily="var(--font-blueprint)"
              >
                Roof is hidden in the current phase view.
              </text>
            </g>
          )
        ) : viewMode === 'section_view' ? (
          <RoofSectionRenderer
            project={filteredProject}
            preferredFloorId={activeFloorId}
            activeSectionCutId={activeSectionCutId}
            roofHiddenByPhase={roofHiddenByPhase}
          />
        ) : viewMode.startsWith('elevation_') ? (
          roofSystem ? (
            <RoofElevationRenderer
              roofSystem={roofSystem}
              viewMode={viewMode}
              selectedId={selectedId}
              selectedType={selectedType}
            />
          ) : (
            <g className="roof-empty-view">
              <text
                x={0}
                y={0}
                textAnchor="middle"
                dominantBaseline="middle"
                fill="var(--color-text-secondary)"
                fontSize={180}
                fontFamily="var(--font-blueprint)"
              >
                Roof is hidden in the current phase view.
              </text>
            </g>
          )
        ) : (
          <g className="roof-empty-view">
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-text-secondary)"
              fontSize={180}
              fontFamily="var(--font-blueprint)"
            >
              Roof mode supports plan, elevation, and section views.
            </text>
          </g>
        )}
      </>
    );
  }

  return (
    <g className="roof-empty-view">
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text-secondary)"
        fontSize={180}
        fontFamily="var(--font-blueprint)"
      >
        {roofHiddenByPhase ? 'Roof is hidden in the current phase view.' : 'Create a roof to edit roof geometry.'}
      </text>
    </g>
  );
});

export default RoofScene;
