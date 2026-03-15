import { createSelectHandler3d } from './selectHandler3d';
import { createDrawRectHandler3d } from './drawRectHandler3d';
import { createDrawProfileHandler3d } from './drawProfileHandler3d';
import { createPushPullHandler3d } from './pushPullHandler3d';
import { createDrawLineHandler3d } from './drawLineHandler3d';
import { createMoveHandler3d } from './moveHandler3d';
import { createRotateHandler3d } from './rotateHandler3d';
import { createEraserHandler3d } from './eraserHandler3d';
import { createMeasureHandler3d } from './measureHandler3d';
import { createDrawFreeformHandler3d } from './drawFreeformHandler3d';
import { createGuidePointHandler3d } from './guidePointHandler3d';
import { createGuideLineHandler3d } from './guideLineHandler3d';
import { createReferencePlaneHandler3d, createSectionPlaneHandler3d } from './referencePlaneHandler3d';

/**
 * Maps activeTool to the appropriate 3D handler constructor.
 */
export function create3dHandler(ctx) {
  const { activeTool, drawingPlane } = ctx;

  switch (activeTool) {
    case 'solid':
      return createDrawProfileHandler3d({ ...ctx, partType: activeTool, drawingPlane });

    case 'panel':
    case 'leg':
    case 'frame':
      return createDrawRectHandler3d({ ...ctx, partType: activeTool, drawingPlane });

    case 'pushpull':
      return createPushPullHandler3d(ctx);

    case 'line':
      return createDrawLineHandler3d({ ...ctx, drawingPlane });

    case 'guide_point':
      return createGuidePointHandler3d({ ...ctx, drawingPlane });

    case 'guide_line':
      return createGuideLineHandler3d({ ...ctx, drawingPlane });

    case 'reference_plane':
      return createReferencePlaneHandler3d({ ...ctx, drawingPlane });

    case 'section_plane':
      return createSectionPlaneHandler3d({ ...ctx, drawingPlane });

    case 'move':
      return createMoveHandler3d(ctx);

    case 'rotate':
      return createRotateHandler3d(ctx);

    case 'eraser':
      return createEraserHandler3d(ctx);

    case 'measure':
      return createMeasureHandler3d(ctx);

    case 'freeform':
      return createDrawFreeformHandler3d(ctx);

    case 'select':
    default:
      return createSelectHandler3d(ctx);
  }
}
