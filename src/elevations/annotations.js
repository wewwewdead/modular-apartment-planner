import { createAnnotationSettings } from '@/domain/models';
import { createDimensionFigure } from '@/annotations/dimensions';

const EPSILON = 5;
const OVERALL_WIDTH_OFFSET = 700;
const OVERALL_HEIGHT_OFFSET = -900;
const LEVEL_OFFSET_START = -1400;
const LEVEL_OFFSET_STEP = -350;
const OPENING_HEIGHT_OFFSET = 260;
const OPENING_SILL_OFFSET = 560;
const OPENING_HEAD_OFFSET = 860;

function toElevationPoint(x, z) {
  return { x, y: -z };
}

function sceneHasGeometry(scene) {
  return Boolean(scene?.elements?.length || scene?.polygonElements?.length || scene?.lineElements?.length);
}

function uniqueSortedValues(values = []) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted.filter((value, index) => (
    index === 0 || Math.abs(value - sorted[index - 1]) > EPSILON
  ));
}

function createVerticalDimension(id, x, startZ, endZ, offset, sourceType, sourceId) {
  return createDimensionFigure({
    id,
    startPoint: toElevationPoint(x, startZ),
    endPoint: toElevationPoint(x, endZ),
    mode: 'vertical',
    offset,
    source: 'derived',
    sourceType,
    sourceId,
  });
}

function buildOverallDimensions(scene) {
  if (!sceneHasGeometry(scene)) return [];

  const overallWidth = createDimensionFigure({
    id: `${scene.viewKey}-overall-width`,
    startPoint: toElevationPoint(scene.bounds.minX, scene.groundLevel),
    endPoint: toElevationPoint(scene.bounds.maxX, scene.groundLevel),
    mode: 'horizontal',
    offset: OVERALL_WIDTH_OFFSET,
    source: 'derived',
    sourceType: 'elevation-overall',
  });

  const overallHeight = createVerticalDimension(
    `${scene.viewKey}-overall-height`,
    scene.bounds.minX,
    scene.groundLevel,
    scene.bounds.maxZ,
    OVERALL_HEIGHT_OFFSET,
    'elevation-overall',
    null
  );

  return [overallWidth, overallHeight].filter(Boolean);
}

function buildLevelDimensions(scene) {
  if (!sceneHasGeometry(scene)) return [];

  const levelValues = [];
  for (const element of scene.elements) {
    if (element.category === 'slab' || element.category === 'beam') {
      levelValues.push(element.bottom, element.top);
    }
  }

  return uniqueSortedValues(levelValues)
    .filter((value) => Math.abs(value - scene.groundLevel) > EPSILON)
    .map((value, index) => createVerticalDimension(
      `${scene.viewKey}-level-${index}`,
      scene.bounds.minX,
      scene.groundLevel,
      value,
      LEVEL_OFFSET_START + (LEVEL_OFFSET_STEP * index),
      'elevation-level',
      null
    ))
    .filter(Boolean);
}

function buildOpeningDimensions(scene) {
  if (!scene?.elements?.length) return [];

  const figures = [];
  const openings = scene.elements.filter((element) => (
    element.category === 'door' || element.category === 'window'
  ));

  for (const opening of openings) {
    const idPrefix = `${scene.viewKey}-${opening.category}-${opening.sourceId || opening.id}`;

    const heightFigure = createVerticalDimension(
      `${idPrefix}-height`,
      opening.right,
      opening.bottom,
      opening.top,
      OPENING_HEIGHT_OFFSET,
      'elevation-opening-height',
      opening.sourceId
    );
    if (heightFigure) figures.push(heightFigure);

    if (Math.abs(opening.bottom - scene.groundLevel) > EPSILON) {
      const sillFigure = createVerticalDimension(
        `${idPrefix}-sill`,
        opening.left,
        scene.groundLevel,
        opening.bottom,
        OPENING_SILL_OFFSET,
        'elevation-opening-sill',
        opening.sourceId
      );
      if (sillFigure) figures.push(sillFigure);

      const headFigure = createVerticalDimension(
        `${idPrefix}-head`,
        opening.left,
        scene.groundLevel,
        opening.top,
        OPENING_HEAD_OFFSET,
        'elevation-opening-head',
        opening.sourceId
      );
      if (headFigure) figures.push(headFigure);
    }
  }

  return figures;
}

function resolveSettings(floor) {
  return createAnnotationSettings(floor?.annotationSettings || {});
}

export function buildElevationAnnotationScene(floor, scene) {
  if (!floor || !scene) {
    return {
      dimensions: [],
    };
  }

  const settings = resolveSettings(floor);
  const dimensions = [
    ...(settings.showElevationOverallDimensions ? buildOverallDimensions(scene) : []),
    ...(settings.showElevationLevelDimensions ? buildLevelDimensions(scene) : []),
    ...(settings.showElevationOpeningDimensions ? buildOpeningDimensions(scene) : []),
  ];

  return { dimensions };
}
