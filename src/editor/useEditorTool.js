import { useMemo, useRef } from 'react';
import { TOOLS } from './tools';
import { createWallDrawHandler } from './handlers/wallDrawHandler';
import { createSelectHandler } from './handlers/selectHandler';
import { createDimensionPlaceHandler } from './handlers/dimensionPlaceHandler';
import { createDoorPlaceHandler } from './handlers/doorPlaceHandler';
import { createWindowPlaceHandler } from './handlers/windowPlaceHandler';
import { createColumnPlaceHandler } from './handlers/columnPlaceHandler';
import { createRoomPlaceHandler } from './handlers/roomPlaceHandler';
import { createBeamPlaceHandler } from './handlers/beamPlaceHandler';
import { createSlabPlaceHandler } from './handlers/slabPlaceHandler';
import { createStairPlaceHandler } from './handlers/stairPlaceHandler';
import { createSectionPlaceHandler } from './handlers/sectionPlaceHandler';
import { createLandingPlaceHandler } from './handlers/landingPlaceHandler';
import { createFixturePlaceHandler } from './handlers/fixturePlaceHandler';
import { createRailingPlaceHandler } from './handlers/railingPlaceHandler';
import { createElevationSelectHandler } from './handlers/elevationSelectHandler';
import { createRoofSelectHandler } from './handlers/roofSelectHandler';
import { createRoofParapetPlaceHandler } from './handlers/roofParapetPlaceHandler';
import { createRoofDrainPlaceHandler } from './handlers/roofDrainPlaceHandler';
import { createRoofOpeningPlaceHandler } from './handlers/roofOpeningPlaceHandler';
import { createTrussSelectHandler } from './handlers/trussSelectHandler';
import { createTrussDrawHandler } from './handlers/trussDrawHandler';

function createReadOnlyHandler() {
  return {
    onMouseDown() {},
    onMouseMove() {},
    onMouseUp() {},
    onDoubleClick() {},
    onKeyDown() {},
    getCursor() {
      return 'default';
    },
  };
}

export function useEditorTool({ activeTool, dispatch, editorDispatch, project, getFloor, activeFloorId, roofSystem, trussSystems, modelTarget, viewport, snapEnabled, selectedId, selectedType, toolState, viewMode, activePhaseId }) {
  const getFloorRef = useRef(getFloor);
  getFloorRef.current = getFloor;

  const handler = useMemo(() => {
    if (modelTarget === 'truss') {
      if (viewMode !== 'plan') {
        return createReadOnlyHandler();
      }

      const trussCtx = {
        dispatch,
        editorDispatch,
        getFloor: (...args) => getFloorRef.current(...args),
        activeFloorId,
        trussSystems,
        viewport,
        selectedId,
        selectedType,
        viewMode,
        activePhaseId,
      };

      switch (activeTool) {
        case TOOLS.TRUSS_DRAW:
          return createTrussDrawHandler(trussCtx);
        case TOOLS.SELECT:
        default:
          return createTrussSelectHandler(trussCtx);
      }
    }

    if (modelTarget === 'roof') {
      if (viewMode !== 'plan') {
        return createReadOnlyHandler();
      }

      const roofCtx = {
        dispatch,
        editorDispatch,
        roofSystem,
        viewport,
      };

      switch (activeTool) {
        case TOOLS.ROOF_PARAPET:
          return createRoofParapetPlaceHandler(roofCtx);
        case TOOLS.ROOF_DRAIN:
          return createRoofDrainPlaceHandler(roofCtx);
        case TOOLS.ROOF_OPENING:
          return createRoofOpeningPlaceHandler(roofCtx);
        case TOOLS.SELECT:
        default:
          return createRoofSelectHandler(roofCtx);
      }
    }

    if (viewMode?.startsWith('elevation_')) {
      return createElevationSelectHandler({
        dispatch,
        editorDispatch,
        project,
        getFloor: (...args) => getFloorRef.current(...args),
        activeFloorId,
        viewport,
        snapEnabled,
        viewMode,
      });
    }

    if (viewMode !== 'plan') {
      return createReadOnlyHandler();
    }

    const ctx = {
      dispatch, editorDispatch,
      getFloor: (...args) => getFloorRef.current(...args),
      activeFloorId, viewport, snapEnabled, activePhaseId,
    };

    switch (activeTool) {
      case TOOLS.DIMENSION:
        return createDimensionPlaceHandler(ctx);
      case TOOLS.WALL:
        return createWallDrawHandler(ctx);
      case TOOLS.BEAM:
        return createBeamPlaceHandler(ctx);
      case TOOLS.STAIR:
        return createStairPlaceHandler(ctx);
      case TOOLS.SECTION:
        return createSectionPlaceHandler(ctx);
      case TOOLS.SLAB:
        return createSlabPlaceHandler(ctx);
      case TOOLS.ROOM:
        return createRoomPlaceHandler(ctx);
      case TOOLS.SELECT:
        return createSelectHandler(ctx);
      case TOOLS.DOOR:
        return createDoorPlaceHandler(ctx);
      case TOOLS.WINDOW:
        return createWindowPlaceHandler(ctx);
      case TOOLS.COLUMN:
        return createColumnPlaceHandler(ctx);
      case TOOLS.LANDING:
        return createLandingPlaceHandler(ctx);
      case TOOLS.FIXTURE:
        return createFixturePlaceHandler(ctx);
      case TOOLS.RAILING:
        return createRailingPlaceHandler(ctx);
      default:
        return null;
    }
  }, [activeTool, activeFloorId, project, roofSystem, trussSystems, modelTarget, viewport.zoom, snapEnabled, viewMode, activePhaseId, selectedId, selectedType]);

  return {
    onMouseDown: (modelPos, e) => handler?.onMouseDown?.(modelPos, e, toolState),
    onMouseMove: (modelPos, e) => handler?.onMouseMove?.(modelPos, e, toolState, selectedId, selectedType),
    onMouseUp: (modelPos, e) => handler?.onMouseUp?.(modelPos, e, toolState),
    onDoubleClick: (modelPos, e) => handler?.onDoubleClick?.(modelPos, e, toolState),
    onKeyDown: (e) => handler?.onKeyDown?.(e, toolState, selectedId, selectedType),
    getCursor: () => handler?.getCursor?.(toolState) || 'default',
  };
}
