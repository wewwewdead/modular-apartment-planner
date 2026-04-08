import { memo } from 'react';
import TrussRenderer from './TrussRenderer';
import TrussSelectionOverlay from './TrussSelectionOverlay';
import TrussDrawOverlay from './TrussDrawOverlay';
import TrussDetailRenderer from './TrussDetailRenderer';
import TrussSectionRenderer from './TrussSectionRenderer';

const TrussScene = memo(function TrussScene({
  filteredFloor,
  floorTrussSystems,
  hasProjectTrusses,
  trussesHiddenByPhase,
  viewMode,
  selectedId,
  selectedType,
  activeTool,
  toolState,
  viewport,
  activeTrussContext,
  filteredProject,
  activeSectionCutId,
}) {
  if (viewMode === 'plan') {
    return (
      <>
        <TrussRenderer
          floor={filteredFloor}
          trussSystems={floorTrussSystems}
          selectedId={selectedId}
          selectedType={selectedType}
        />
        <TrussSelectionOverlay
          floor={filteredFloor}
          trussSystems={floorTrussSystems}
          selectedId={selectedId}
          selectedType={selectedType}
          toolState={toolState}
          zoom={viewport.zoom}
        />
        <TrussDrawOverlay floor={filteredFloor} activeTool={activeTool} toolState={toolState} />
        {!floorTrussSystems.length && (
          <g className="truss-empty-view">
            <text
              x={0}
              y={0}
              textAnchor="middle"
              dominantBaseline="middle"
              fill="var(--color-text-secondary)"
              fontSize={180}
              fontFamily="var(--font-blueprint)"
            >
              {trussesHiddenByPhase
                ? 'Trusses on this floor are hidden in the current phase view.'
                : 'Draw a truss by selecting two support beams on the active floor.'}
            </text>
          </g>
        )}
      </>
    );
  }

  if (viewMode === 'truss_detail') {
    if (floorTrussSystems.length) {
      return (
        <TrussDetailRenderer
          trussSystem={activeTrussContext.trussSystem}
          trussInstanceId={activeTrussContext.trussInstanceId}
        />
      );
    }
    return (
      <g className="truss-empty-view">
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-secondary)"
          fontSize={180}
          fontFamily="var(--font-blueprint)"
        >
          Create at least one truss in plan view to show truss details.
        </text>
      </g>
    );
  }

  if (viewMode === 'section_view') {
    if (filteredFloor) {
      return (
        <TrussSectionRenderer project={filteredProject} floor={filteredFloor} activeSectionCutId={activeSectionCutId} />
      );
    }
    return (
      <g className="truss-empty-view">
        <text
          x={0}
          y={0}
          textAnchor="middle"
          dominantBaseline="middle"
          fill="var(--color-text-secondary)"
          fontSize={180}
          fontFamily="var(--font-blueprint)"
        >
          Select a floor to view trusses in section.
        </text>
      </g>
    );
  }

  return (
    <g className="truss-empty-view">
      <text
        x={0}
        y={0}
        textAnchor="middle"
        dominantBaseline="middle"
        fill="var(--color-text-secondary)"
        fontSize={180}
        fontFamily="var(--font-blueprint)"
      >
        {hasProjectTrusses
          ? 'Truss mode supports plan, detail, and section views in v1.'
          : 'Create at least one truss in plan view to show truss details.'}
      </text>
    </g>
  );
});

export default TrussScene;
