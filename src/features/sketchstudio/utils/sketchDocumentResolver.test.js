import { describe, expect, it } from 'vitest';
import { resolveSketchDocument } from './sketchDocumentResolver';
import { createSketchJoint } from './sketchJoineryUtils';

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

describe('sketchDocumentResolver', () => {
  it('combines variables and constraints into resolved geometry', () => {
    const { document, constraintDiagnostics } = resolveSketchDocument({
      version: 1,
      id: 'doc-constraint',
      name: 'Constraint Test',
      units: 'mm',
      metadata: {},
      objectDefinition: {},
      layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
      variables: [
        { id: 'var-width', name: 'width', value: 1200, unit: 'mm' },
        { id: 'var-thickness', name: 'thickness', value: 18, unit: 'mm' },
      ],
      constraints: [
        {
          id: 'constraint-1',
          type: 'equal_width',
          driverEntityId: 'rect-1',
          drivenEntityId: 'rect-2',
          label: 'Match shelf widths',
          enabled: true,
        },
      ],
      entities: [
        {
          id: 'rect-1',
          type: 'rect',
          x: 0,
          y: 0,
          width: 100,
          height: 300,
          rotation: 0,
          layerId: 'default',
          meta: {},
          parametricExpressions: {
            width: '=width - 2 * thickness',
          },
        },
        {
          id: 'rect-2',
          type: 'rect',
          x: 0,
          y: 400,
          width: 200,
          height: 300,
          rotation: 0,
          layerId: 'default',
          meta: {},
        },
      ],
    });

    expect(document.variables).toHaveLength(2);
    expect(document.entities.find((entity) => entity.id === 'rect-1').width).toBe(1164);
    expect(document.entities.find((entity) => entity.id === 'rect-2').width).toBe(1164);
    expect(constraintDiagnostics[0]).toMatchObject({ status: 'applied' });
  });

  it('regenerates automatic dado depth from source overlap when geometry changes', () => {
    const joint = createSketchJoint({
      id: 'joint-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
    });

    const baseDocument = {
      version: 1,
      id: 'doc-joinery',
      name: 'Joinery Test',
      units: 'mm',
      metadata: {},
      objectDefinition: {},
      layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
      variables: [],
      constraints: [],
      joints: [joint],
      entities: [
        {
          id: 'panel',
          type: 'rect',
          x: 0,
          y: 0,
          width: 200,
          height: 120,
          rotation: 0,
          thickness: 18,
          layerId: 'default',
          meta: {},
        },
        {
          id: 'shelf',
          type: 'rect',
          x: 40,
          y: -13,
          width: 60,
          height: 18,
          rotation: 0,
          thickness: 18,
          layerId: 'default',
          meta: {},
        },
      ],
    };

    const firstResolution = resolveSketchDocument(baseDocument);
    const secondResolution = resolveSketchDocument({
      ...baseDocument,
      entities: baseDocument.entities.map((entity) =>
        entity.id === 'shelf'
          ? {
              ...entity,
              y: -8,
            }
          : entity,
      ),
    });

    expect(firstResolution.document.joints).toHaveLength(1);
    expect(firstResolution.document.joints[0]).toMatchObject({
      id: 'joint-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      placementMode: 'auto_contact',
      sourceEdgeRef: { entityId: 'shelf', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceKey: 'top' },
    });
    expect(firstResolution.jointDiagnostics[0]).toMatchObject({ status: 'applied' });
    expect(firstResolution.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      width: 60,
      depth: 5,
    });
    expect(secondResolution.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      width: 60,
      depth: 10,
    });
  });

  it('keeps thicknessless joints as draft previews and promotes them when thickness is assigned', () => {
    const joint = createSketchJoint({
      id: 'joint-draft-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
    });

    const baseDocument = {
      version: 1,
      id: 'doc-draft-joinery',
      name: 'Draft Joinery Test',
      units: 'mm',
      metadata: {},
      objectDefinition: {},
      layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
      variables: [],
      constraints: [],
      joints: [joint],
      entities: [
        {
          id: 'panel',
          type: 'rect',
          x: 0,
          y: 0,
          width: 200,
          height: 120,
          rotation: 0,
          thickness: null,
          layerId: 'default',
          meta: {},
        },
        {
          id: 'shelf',
          type: 'rect',
          x: 40,
          y: -13,
          width: 60,
          height: 18,
          rotation: 0,
          thickness: null,
          layerId: 'default',
          meta: {},
        },
      ],
    };

    const draftResolution = resolveSketchDocument(baseDocument);
    const fabricationReadyResolution = resolveSketchDocument({
      ...baseDocument,
      entities: baseDocument.entities.map((entity) => ({
        ...entity,
        thickness: 18,
      })),
    });

    expect(draftResolution.document.joints[0].validationState).toMatchObject({
      status: 'warning',
      canApply: true,
    });
    expect(draftResolution.jointDiagnostics[0]).toMatchObject({
      status: 'warning',
      canApply: true,
    });
    expect(draftResolution.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      depth: 5,
    });
    expect(draftResolution.manufacturingExportEntities).toHaveLength(2);

    expect(fabricationReadyResolution.document.joints[0].validationState).toMatchObject({
      status: 'valid',
      canApply: true,
    });
    expect(fabricationReadyResolution.jointDiagnostics[0]).toMatchObject({
      status: 'applied',
      canApply: true,
    });
    expect(fabricationReadyResolution.manufacturingExportEntities.some((entity) => entity.type === 'feature')).toBe(true);
  });

  it('recomputes automatic tab-slot depth from source overlap when geometry changes', () => {
    const joint = createSketchJoint({
      id: 'joint-tab-slot',
      type: 'tab_slot',
      sourcePartId: 'divider',
      targetPartId: 'panel',
    });

    const baseDocument = {
      version: 1,
      id: 'doc-tab-slot-joinery',
      name: 'Tab Slot Joinery Test',
      units: 'mm',
      metadata: {},
      objectDefinition: {},
      layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
      variables: [],
      constraints: [],
      joints: [joint],
      entities: [
        {
          id: 'panel',
          type: 'rect',
          x: 0,
          y: 0,
          width: 200,
          height: 120,
          rotation: 0,
          thickness: 18,
          layerId: 'default',
          meta: {},
        },
        {
          id: 'divider',
          type: 'rect',
          x: 40,
          y: -13,
          width: 60,
          height: 18,
          rotation: 0,
          thickness: 18,
          layerId: 'default',
          meta: {},
        },
      ],
    };

    const firstResolution = resolveSketchDocument(baseDocument);
    const secondResolution = resolveSketchDocument({
      ...baseDocument,
      entities: baseDocument.entities.map((entity) =>
        entity.id === 'divider'
          ? {
              ...entity,
              y: -8,
            }
          : entity,
      ),
    });

    expect(firstResolution.document.joints[0]).toMatchObject({
      id: 'joint-tab-slot',
      sourceEdgeRef: { entityId: 'divider', sourceKey: 'bottom' },
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
    expect(firstResolution.jointDiagnostics[0]).toMatchObject({ status: 'applied' });
    expect(firstResolution.manufacturingPreviewEntities.filter((entity) => entity.type === 'polyline')).toHaveLength(2);

    expect(secondResolution.document.joints[0]).toMatchObject({
      parameters: {
        depth: 10,
      },
      resolvedContact: {
        kind: 'penetration',
        penetrationDepth: 10,
      },
    });
  });

  it('persists the reversed source-target direction when it is the only valid automatic overlap resolution', () => {
    const joint = createSketchJoint({
      id: 'joint-front-view',
      type: 'tab_slot',
      sourcePartId: 'upright',
      targetPartId: 'shelf',
    });

    const resolution = resolveSketchDocument({
      version: 1,
      id: 'doc-front-view-joinery',
      name: 'Front View Joinery Test',
      units: 'mm',
      metadata: {},
      objectDefinition: {},
      layers: [{ id: 'default', name: 'Default', visible: true, locked: false }],
      variables: [],
      constraints: [],
      joints: [joint],
      entities: [
        {
          id: 'upright',
          type: 'rect',
          x: 0,
          y: 0,
          width: 18,
          height: 200,
          rotation: 0,
          thickness: 18,
          layerId: 'default',
          meta: {},
        },
        {
          id: 'shelf',
          type: 'rect',
          x: 9,
          y: 40,
          width: 120,
          height: 60,
          rotation: 0,
          thickness: 18,
          layerId: 'default',
          meta: {},
        },
      ],
    });
    const sourceProfile = resolution.manufacturingPreviewEntities.find((entity) => entity.id === 'joinery-profile-shelf');

    expect(resolution.document.joints[0]).toMatchObject({
      id: 'joint-front-view',
      sourcePartId: 'shelf',
      targetPartId: 'upright',
      sourceEdgeRef: { entityId: 'shelf', sourceKey: 'left' },
      targetEdgeRef: { entityId: 'upright', sourceKey: 'right' },
      resolvedContact: {
        kind: 'penetration',
        penetrationDepth: 9,
        autoFlipped: true,
      },
    });
    expect(resolution.jointDiagnostics[0]).toMatchObject({
      jointId: 'joint-front-view',
      status: 'applied',
    });
    expect(getPolylineBounds(sourceProfile)).toMatchObject({
      minX: 9,
      maxX: 129,
    });
    expect(sourceProfile.points.some((point) => point.x === 18)).toBe(true);
  });
});
