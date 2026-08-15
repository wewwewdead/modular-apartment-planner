import { useEffect, useMemo, useRef } from 'react';
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
import { createCeilingPlaceHandler } from './handlers/ceilingPlaceHandler';
import { createCeilingBeamPickHandler } from './handlers/ceilingBeamPickHandler';
import { createStairPlaceHandler } from './handlers/stairPlaceHandler';
import { createSectionPlaceHandler } from './handlers/sectionPlaceHandler';
import { createLandingPlaceHandler } from './handlers/landingPlaceHandler';
import { createFixturePlaceHandler } from './handlers/fixturePlaceHandler';
import { createRailingPlaceHandler } from './handlers/railingPlaceHandler';
import { createElectricalPlaceHandler } from './handlers/electricalPlaceHandler';
import { createElevationSelectHandler } from './handlers/elevationSelectHandler';
import { createRoofSelectHandler } from './handlers/roofSelectHandler';
import { createRoofParapetPlaceHandler } from './handlers/roofParapetPlaceHandler';
import { createRoofDrainPlaceHandler } from './handlers/roofDrainPlaceHandler';
import { createRoofOpeningPlaceHandler } from './handlers/roofOpeningPlaceHandler';
import { createTrussSelectHandler } from './handlers/trussSelectHandler';
import { createTrussDrawHandler } from './handlers/trussDrawHandler';
import { createFilletPlaceHandler } from './handlers/filletPlaceHandler';

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

export function useEditorTool({
  activeTool,
  dispatch,
  editorDispatch,
  project,
  getFloor,
  activeFloorId,
  roofSystem,
  trussSystems,
  modelTarget,
  viewport,
  snapEnabled,
  selectedId,
  selectedType,
  toolState,
  viewMode,
  activePhaseId,
}) {
  const getFloorRef = useRef(getFloor);
  const projectRef = useRef(project);
  // Keep the ref pointing at the latest getFloor without reading/writing it during
  // render. Handlers are intentionally memoized without getFloor in their deps and
  // call getFloorRef.current(...) lazily at event time, so they always see fresh
  // floor data while staying referentially stable across renders.
  useEffect(() => {
    getFloorRef.current = getFloor;
    projectRef.current = project;
  });

  const callGetFloor = useMemo(
    () =>
      (...args) =>
        getFloorRef.current(...args),
    [],
  );
  const callGetProject = useMemo(() => () => projectRef.current, []);

  // eslint-disable react-hooks/refs -- callGetFloor is a stable wrapper that reads
  // getFloorRef.current lazily. The tool handlers below only STORE it in their ctx and
  // invoke it later inside event callbacks (onMouseDown/Move/Up), never during render.
  // The rule cannot prove this deferral, so passing callGetFloor into the handler
  // factories is flagged as a false positive. Behavior is unchanged.
  /* eslint-disable react-hooks/refs */
  const handler = useMemo(() => {
    if (modelTarget === 'truss') {
      if (viewMode !== 'plan') {
        return createReadOnlyHandler();
      }

      const trussCtx = {
        dispatch,
        editorDispatch,
        getFloor: callGetFloor,
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
        getFloor: callGetFloor,
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
      dispatch,
      editorDispatch,
      project,
      getProject: callGetProject,
      getFloor: (...args) => getFloorRef.current(...args),
      activeFloorId,
      viewport,
      snapEnabled,
      activePhaseId,
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
      case TOOLS.CEILING:
        return createCeilingPlaceHandler(ctx);
      case TOOLS.CEILING_BEAM_PICK:
        return createCeilingBeamPickHandler(ctx);
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
      case TOOLS.ELECTRICAL:
        return createElectricalPlaceHandler(ctx);
      case TOOLS.FILLET:
        return createFilletPlaceHandler(ctx);
      default:
        return null;
    }
  }, [
    callGetFloor,
    callGetProject,
    activeTool,
    activeFloorId,
    project,
    roofSystem,
    trussSystems,
    modelTarget,
    viewport.zoom,
    snapEnabled,
    viewMode,
    activePhaseId,
    selectedId,
    selectedType,
  ]);
  /* eslint-enable react-hooks/refs */

  return {
    onMouseDown: (modelPos, e) => handler?.onMouseDown?.(modelPos, e, toolState),
    onMouseMove: (modelPos, e) => handler?.onMouseMove?.(modelPos, e, toolState, selectedId, selectedType),
    onMouseUp: (modelPos, e) => handler?.onMouseUp?.(modelPos, e, toolState),
    onDoubleClick: (modelPos, e) => handler?.onDoubleClick?.(modelPos, e, toolState),
    onKeyDown: (e) => handler?.onKeyDown?.(e, toolState, selectedId, selectedType),
    getCursor: () => handler?.getCursor?.(toolState) || 'default',
  };
}
