import { describe, expect, it } from 'vitest';
import {
  computeSketchJointDefaults,
  createSketchJoint,
  isSketchJointPairSupported,
  getSketchJointSummary,
  resolveSketchJoinery,
} from './sketchJoineryUtils';
import { rotatePointAroundPivot } from './transformUtils';

function createRectEntity(id, x, y, width, height, thickness = 18) {
  return {
    id,
    type: 'rect',
    x,
    y,
    width,
    height,
    rotation: 0,
    thickness,
    layerId: 'default',
    meta: {},
  };
}

function createEdgeRef(entityId, sourceKey) {
  return {
    entityId,
    sourceType: 'segment',
    sourceKey,
  };
}

function rotateRectEntityAroundPivot(entity, pivot, angleDegrees) {
  const angleRadians = (angleDegrees * Math.PI) / 180;
  const center = {
    x: entity.x + (entity.width / 2),
    y: entity.y + (entity.height / 2),
  };
  const rotatedCenter = rotatePointAroundPivot(center, pivot, angleRadians);

  return {
    ...entity,
    x: rotatedCenter.x - (entity.width / 2),
    y: rotatedCenter.y - (entity.height / 2),
    rotation: (entity.rotation ?? 0) + angleDegrees,
  };
}

function rotateAllEntities(entities, pivot, angleDegrees) {
  return entities.map((entity) => rotateRectEntityAroundPivot(entity, pivot, angleDegrees));
}

function getPolylineBounds(entity) {
  return entity.points.reduce((bounds, point) => ({
    minX: Math.min(bounds.minX, point.x),
    minY: Math.min(bounds.minY, point.y),
    maxX: Math.max(bounds.maxX, point.x),
    maxY: Math.max(bounds.maxY, point.y),
  }), {
    minX: Number.POSITIVE_INFINITY,
    minY: Number.POSITIVE_INFINITY,
    maxX: Number.NEGATIVE_INFINITY,
    maxY: Number.NEGATIVE_INFINITY,
  });
}

describe('sketchJoineryUtils', () => {
  it('computes stable default tab-and-slot parameters from thickness and overlap', () => {
    const entities = [
      createRectEntity('side-a', 0, 0, 100, 120, 18),
      createRectEntity('side-b', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      type: 'tab_slot',
      sourcePartId: 'side-a',
      targetPartId: 'side-b',
      sourceEdgeRef: createEdgeRef('side-a', 'right'),
      targetEdgeRef: createEdgeRef('side-b', 'left'),
    });

    const defaults = computeSketchJointDefaults(joint, entities);

    expect(defaults.count).toBeGreaterThanOrEqual(1);
    expect(defaults.tabWidth).toBeGreaterThan(0);
    expect(defaults.depth).toBeGreaterThan(0);
  });

  it('treats rotated rectangular pairs as supported joinery parts', () => {
    const entities = rotateAllEntities([
      createRectEntity('side-a', 0, 0, 100, 120, 18),
      createRectEntity('side-b', 100, 0, 100, 120, 18),
    ], { x: 100, y: 60 }, 30);

    expect(isSketchJointPairSupported(entities)).toBe(true);
  });

  it('auto-detects penetration contact for dado joints and derives depth from overlap', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('shelf', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-auto-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];

    expect(resolution.joints[0]).toMatchObject({
      id: 'joint-auto-dado',
      placementMode: 'auto_contact',
      sourceEdgeRef: { entityId: 'shelf', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceKey: 'top' },
      parameterModes: {
        depth: 'auto_overlap',
      },
      parameters: {
        width: 60,
        depth: 5,
      },
      resolvedContact: {
        kind: 'penetration',
        penetrationDepth: 5,
      },
    });
    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-auto-dado', status: 'applied' });
    expect(feature).toMatchObject({
      type: 'feature',
      shape: 'rect',
      x: 40,
      y: 0,
      width: 60,
      height: 5,
      depth: 5,
      targetPartId: 'panel',
    });
  });

  it('auto-detects penetration contact for rotated dado joints and emits rotated cut geometry', () => {
    const entities = rotateAllEntities([
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('shelf', 40, -13, 60, 18, 18),
    ], { x: 100, y: 60 }, 30);
    const joint = createSketchJoint({
      id: 'joint-rotated-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];

    expect(resolution.joints[0]).toMatchObject({
      id: 'joint-rotated-dado',
      sourceEdgeRef: { entityId: 'shelf', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceKey: 'top' },
      resolvedContact: {
        kind: 'penetration',
        penetrationDepth: 5,
      },
    });
    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-rotated-dado',
      status: 'applied',
    });
    expect(feature).toMatchObject({
      type: 'feature',
      shape: 'polygon',
      depth: 5,
      targetPartId: 'panel',
    });
    expect(feature.points).toHaveLength(4);
  });

  it('keeps thicknessless dado joints in draft mode without blocking overlap-driven geometry', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, null),
      createRectEntity('shelf', 40, -13, 60, 18, null),
    ];
    const joint = createSketchJoint({
      id: 'joint-draft-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];
    const exportFeature = resolution.exportEntities.find((entity) => entity.id === feature.id);

    expect(resolution.joints[0]).toMatchObject({
      id: 'joint-draft-dado',
      parameters: {
        width: 60,
        depth: 5,
      },
      validationState: {
        status: 'warning',
        canApply: true,
      },
    });
    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-draft-dado',
      status: 'warning',
      canApply: true,
    });
    expect(resolution.diagnostics[0].message).toContain('Draft joinery only.');
    expect(getSketchJointSummary(resolution.joints[0])).toBe('shelf → panel · 60mm × 5mm');
    expect(feature.meta?.joinery).toMatchObject({
      fabricationReady: false,
      previewOnly: true,
    });
    expect(exportFeature).toBeUndefined();
    expect(resolution.exportEntities).toHaveLength(2);
    expect(resolution.exportEntities.find((entity) => entity.id === 'panel')?.meta?.joineryConnections?.[0]).toMatchObject({
      jointId: 'joint-draft-dado',
      fabricationReady: false,
      previewOnly: true,
    });
  });

  it('auto-detects penetration contact for mortise-and-tenon joints and derives depth from overlap', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('rail', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-auto-mortise-tenon',
      type: 'mortise_tenon',
      sourcePartId: 'rail',
      targetPartId: 'panel',
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const sourceProfile = resolution.previewEntities.find((entity) => entity.id === 'joinery-profile-rail');

    expect(resolution.joints[0]).toMatchObject({
      id: 'joint-auto-mortise-tenon',
      placementMode: 'auto_contact',
      sourceEdgeRef: { entityId: 'rail', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceKey: 'top' },
      parameterModes: {
        depth: 'auto_overlap',
      },
      parameters: {
        depth: 5,
      },
      resolvedContact: {
        kind: 'penetration',
        penetrationDepth: 5,
      },
    });
    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-auto-mortise-tenon', status: 'applied' });
    expect(resolution.previewEntities.filter((entity) => entity.type === 'polyline')).toHaveLength(2);
    expect(getPolylineBounds(sourceProfile)).toMatchObject({
      minY: -13,
      maxY: 5,
    });
    expect(sourceProfile.points.some((point) => point.y === 0)).toBe(true);
  });

  it('auto-detects penetration contact for tab-slot joints and derives depth from overlap', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('divider', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-auto-tab-slot',
      type: 'tab_slot',
      sourcePartId: 'divider',
      targetPartId: 'panel',
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const sourceProfile = resolution.previewEntities.find((entity) => entity.id === 'joinery-profile-divider');

    expect(resolution.joints[0]).toMatchObject({
      id: 'joint-auto-tab-slot',
      placementMode: 'auto_contact',
      sourceEdgeRef: { entityId: 'divider', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceKey: 'top' },
      parameterModes: {
        depth: 'auto_overlap',
      },
      parameters: {
        count: 1,
        depth: 5,
      },
      resolvedContact: {
        kind: 'penetration',
        penetrationDepth: 5,
      },
    });
    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-auto-tab-slot', status: 'applied' });
    expect(getSketchJointSummary(resolution.joints[0])).toBe('divider → panel · 1 tabs × 5mm');
    expect(resolution.previewEntities.filter((entity) => entity.type === 'polyline')).toHaveLength(2);
    expect(getPolylineBounds(sourceProfile)).toMatchObject({
      minY: -13,
      maxY: 5,
    });
    expect(sourceProfile.points.some((point) => point.y === 0)).toBe(true);
  });

  it('auto-flips overlap-driven joints when the reverse direction yields the only valid penetration', () => {
    const entities = [
      createRectEntity('upright', 0, 0, 18, 200, 18),
      createRectEntity('shelf', 9, 40, 120, 60, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-front-view',
      type: 'tab_slot',
      sourcePartId: 'upright',
      targetPartId: 'shelf',
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.joints[0]).toMatchObject({
      id: 'joint-front-view',
      sourcePartId: 'shelf',
      targetPartId: 'upright',
      sourceEdgeRef: { entityId: 'shelf', sourceKey: 'left' },
      targetEdgeRef: { entityId: 'upright', sourceKey: 'right' },
      parameterModes: {
        depth: 'auto_overlap',
      },
      parameters: {
        depth: 9,
      },
      resolvedContact: {
        kind: 'penetration',
        penetrationDepth: 9,
        autoFlipped: true,
      },
    });
    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-front-view',
      status: 'applied',
    });
  });

  it('does not generate a redundant source profile when an overlap-driven mortise fills the full overlap width', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('rail', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-full-width-mortise-tenon',
      type: 'mortise_tenon',
      sourcePartId: 'rail',
      targetPartId: 'panel',
      parameters: {
        width: 60,
        depth: 5,
      },
      tolerance: {
        clearance: 0,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.previewEntities.find((entity) => entity.id === 'joinery-profile-rail')).toBeUndefined();
    expect(resolution.previewEntities.find((entity) => entity.id === 'joinery-profile-panel')).toBeDefined();
  });

  it('generates dado slot geometry on the target host part', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('shelf', 40, -18, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      sourceEdgeRef: createEdgeRef('shelf', 'bottom'),
      targetEdgeRef: createEdgeRef('panel', 'top'),
      parameters: {
        width: 60,
        depth: 6,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];

    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-dado', status: 'applied' });
    expect(feature).toMatchObject({
      type: 'feature',
      shape: 'rect',
      x: 40,
      y: 0,
      width: 60,
      height: 6,
      depth: 6,
      targetPartId: 'panel',
    });
    expect(resolution.exportEntities.find((entity) => entity.id === 'panel').meta?.manufacturingHidden).not.toBe(
      true,
    );
  });

  it('clips a dado slot to the inset overlap so inset stays visible on the drawing', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('shelf', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-dado-inset',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      parameters: {
        width: 60,
        depth: 5,
        inset: 10,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-dado-inset',
      status: 'applied',
    });
    expect(feature).toMatchObject({
      type: 'feature',
      x: 50,
      y: 0,
      width: 40,
      height: 5,
      depth: 5,
    });
  });

  it('widens a dado slot symmetrically when width offset is applied', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('shelf', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-dado-width-offset',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      parameters: {
        width: 60,
        depth: 5,
        offset: 0.5,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-dado-width-offset',
      status: 'applied',
    });
    expect(getSketchJointSummary(resolution.joints[0])).toBe('shelf → panel · 60.5mm × 5mm');
    expect(feature).toMatchObject({
      type: 'feature',
      x: 39.75,
      y: 0,
      width: 60.5,
      height: 5,
      depth: 5,
    });
  });

  it('applies width offset after inset so the dado widens on both sides equally', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('shelf', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-dado-offset-with-inset',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      parameters: {
        width: 40,
        depth: 5,
        inset: 10,
        offset: 0.5,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const feature = resolution.previewEntities[0];

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-dado-offset-with-inset',
      status: 'applied',
    });
    expect(feature).toMatchObject({
      type: 'feature',
      x: 49.75,
      y: 0,
      width: 40.5,
      height: 5,
      depth: 5,
    });
  });

  it('widens a rabbet symmetrically when width offset is applied', () => {
    const entities = [
      createRectEntity('source-side', 0, 0, 100, 120, 18),
      createRectEntity('target-side', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-rabbet-width-offset',
      type: 'rabbet',
      sourcePartId: 'source-side',
      targetPartId: 'target-side',
      sourceEdgeRef: createEdgeRef('source-side', 'right'),
      targetEdgeRef: createEdgeRef('target-side', 'left'),
      parameters: {
        width: 60,
        depth: 12,
        offset: 0.5,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const targetProfile = resolution.previewEntities.find((entity) => entity.id === 'joinery-profile-target-side');

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-rabbet-width-offset',
      status: 'applied',
    });
    expect(getSketchJointSummary(resolution.joints[0])).toBe('source-side → target-side · 60.5mm × 12mm');
    expect(targetProfile?.points).toEqual(expect.arrayContaining([
      { x: 112, y: 90.25 },
      { x: 112, y: 29.75 },
    ]));
  });

  it('widens only the receiving mortise when width offset is applied', () => {
    const entities = [
      createRectEntity('tenon-part', 0, 0, 100, 120, 18),
      createRectEntity('mortise-part', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-mortise-tenon-width-offset',
      type: 'mortise_tenon',
      sourcePartId: 'tenon-part',
      targetPartId: 'mortise-part',
      sourceEdgeRef: createEdgeRef('tenon-part', 'right'),
      targetEdgeRef: createEdgeRef('mortise-part', 'left'),
      parameters: {
        width: 60,
        depth: 18,
        offset: 0.5,
      },
      tolerance: {
        clearance: 0,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const sourceProfile = resolution.previewEntities.find((entity) => entity.id === 'joinery-profile-tenon-part');
    const targetProfile = resolution.previewEntities.find((entity) => entity.id === 'joinery-profile-mortise-part');

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-mortise-tenon-width-offset',
      status: 'applied',
    });
    expect(getSketchJointSummary(resolution.joints[0])).toBe('tenon-part → mortise-part · 60.5mm × 18mm');
    expect(sourceProfile?.points).toEqual(expect.arrayContaining([
      { x: 118, y: 30 },
      { x: 118, y: 90 },
    ]));
    expect(targetProfile?.points).toEqual(expect.arrayContaining([
      { x: 118, y: 90.25 },
      { x: 118, y: 29.75 },
    ]));
  });

  it('generates complementary mortise and tenon replacement profiles', () => {
    const entities = [
      createRectEntity('tenon-part', 0, 0, 100, 120, 18),
      createRectEntity('mortise-part', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-mortise-tenon',
      type: 'mortise_tenon',
      sourcePartId: 'tenon-part',
      targetPartId: 'mortise-part',
      sourceEdgeRef: createEdgeRef('tenon-part', 'right'),
      targetEdgeRef: createEdgeRef('mortise-part', 'left'),
      parameters: {
        width: 60,
        depth: 18,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const generatedProfiles = resolution.previewEntities.filter((entity) => entity.type === 'polyline');
    const hiddenBaseIds = resolution.exportEntities
      .filter((entity) => entity.meta?.manufacturingHidden)
      .map((entity) => entity.id)
      .sort();

    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-mortise-tenon', status: 'applied' });
    expect(generatedProfiles).toHaveLength(2);
    expect(hiddenBaseIds).toEqual(['mortise-part', 'tenon-part']);
  });

  it('generates paired dowel drilling features on both parts', () => {
    const entities = [
      createRectEntity('side-a', 0, 0, 100, 120, 18),
      createRectEntity('side-b', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-dowels',
      type: 'dowel',
      sourcePartId: 'side-a',
      targetPartId: 'side-b',
      sourceEdgeRef: createEdgeRef('side-a', 'right'),
      targetEdgeRef: createEdgeRef('side-b', 'left'),
      parameters: {
        dowelDiameter: 8,
        count: 2,
        spacing: 40,
        edgeOffset: 20,
        depth: 12,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);
    const circleFeatures = resolution.previewEntities.filter((entity) => entity.shape === 'circle');

    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-dowels', status: 'applied' });
    expect(circleFeatures).toHaveLength(4);
    expect(circleFeatures.every((feature) => feature.featureType === 'joinery')).toBe(true);
  });

  it('allows thicknessless dowel joints as draft previews when pattern parameters are valid', () => {
    const entities = [
      createRectEntity('side-a', 0, 0, 100, 120, null),
      createRectEntity('side-b', 100, 0, 100, 120, null),
    ];
    const joint = createSketchJoint({
      id: 'joint-draft-dowels',
      type: 'dowel',
      sourcePartId: 'side-a',
      targetPartId: 'side-b',
      parameters: {
        dowelDiameter: 8,
        count: 2,
        spacing: 40,
        edgeOffset: 20,
        depth: 12,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-draft-dowels',
      status: 'warning',
      canApply: true,
    });
    expect(resolution.previewEntities.filter((entity) => entity.shape === 'circle')).toHaveLength(4);
    expect(resolution.exportEntities).toHaveLength(2);
  });

  it('provides overlap-linked defaults for thicknessless automatic tab-slot joints', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, null),
      createRectEntity('divider', 40, -13, 60, 18, null),
    ];
    const joint = createSketchJoint({
      type: 'tab_slot',
      sourcePartId: 'divider',
      targetPartId: 'panel',
    });

    const defaults = computeSketchJointDefaults(joint, entities);

    expect(defaults.count).toBeGreaterThanOrEqual(1);
    expect(defaults.tabWidth).toBeGreaterThan(0);
    expect(defaults.depth).toBe(5);
  });

  it('auto-detects touching edges for non-penetrating joints', () => {
    const entities = [
      createRectEntity('side-a', 0, 0, 100, 120, 18),
      createRectEntity('side-b', 100, 0, 100, 120, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-auto-dowels',
      type: 'dowel',
      sourcePartId: 'side-a',
      targetPartId: 'side-b',
      parameters: {
        dowelDiameter: 8,
        count: 2,
        spacing: 40,
        edgeOffset: 20,
        depth: 12,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.joints[0]).toMatchObject({
      id: 'joint-auto-dowels',
      placementMode: 'auto_contact',
      sourceEdgeRef: { entityId: 'side-a', sourceKey: 'right' },
      targetEdgeRef: { entityId: 'side-b', sourceKey: 'left' },
      resolvedContact: {
        kind: 'touch',
      },
    });
    expect(resolution.diagnostics[0]).toMatchObject({ jointId: 'joint-auto-dowels', status: 'applied' });
  });

  it('keeps hardware joints touch-driven even when the parts overlap', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      createRectEntity('rail', 40, -13, 60, 18, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-overlap-dowels',
      type: 'dowel',
      sourcePartId: 'rail',
      targetPartId: 'panel',
      parameters: {
        dowelDiameter: 8,
        count: 2,
        spacing: 20,
        edgeOffset: 10,
        depth: 12,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-overlap-dowels',
      status: 'invalid',
    });
    expect(resolution.diagnostics[0].message).toContain('touching edge contact');
  });

  it('rejects automatic joints when multiple penetration contacts are possible', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 80, 80, 18),
      createRectEntity('insert', -20, -20, 60, 60, 18),
    ];
    const joint = createSketchJoint({
      id: 'joint-ambiguous',
      type: 'dado',
      sourcePartId: 'insert',
      targetPartId: 'panel',
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-ambiguous',
      status: 'invalid',
    });
    expect(resolution.diagnostics[0].message).toContain('Both directions remain ambiguous');
    expect(resolution.previewEntities).toEqual([]);
  });

  it('surfaces invalid geometry without emitting manufacturing entities', () => {
    const entities = [
      createRectEntity('panel', 0, 0, 200, 120, 18),
      {
        id: 'line-1',
        type: 'line',
        x1: 0,
        y1: 0,
        x2: 100,
        y2: 0,
        layerId: 'default',
        meta: {},
      },
    ];
    const joint = createSketchJoint({
      id: 'joint-invalid',
      type: 'rabbet',
      sourcePartId: 'line-1',
      targetPartId: 'panel',
      sourceEdgeRef: createEdgeRef('line-1', 'bottom'),
      targetEdgeRef: createEdgeRef('panel', 'top'),
      parameters: {
        width: 100,
        depth: 9,
      },
    });

    const resolution = resolveSketchJoinery(entities, [joint]);

    expect(resolution.diagnostics[0]).toMatchObject({
      jointId: 'joint-invalid',
      status: 'invalid',
    });
    expect(resolution.previewEntities).toEqual([]);
    expect(resolution.exportEntities).toHaveLength(2);
  });
});
