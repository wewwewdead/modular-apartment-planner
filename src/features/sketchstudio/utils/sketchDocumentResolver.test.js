import { describe, expect, it } from 'vitest';
import { resolveSketchDocument } from './sketchDocumentResolver';
import { createSketchJoint } from './sketchJoineryUtils';

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

  it('generates joinery artifacts and regenerates them when source geometry changes', () => {
    const joint = createSketchJoint({
      id: 'joint-dado',
      type: 'dado',
      primaryEntityId: 'panel',
      secondaryEntityId: 'shelf',
      primaryEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      secondaryEdgeRef: { entityId: 'shelf', sourceType: 'segment', sourceKey: 'bottom' },
      parameters: {
        depth: 6,
      },
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
          y: -18,
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
              width: 90,
            }
          : entity,
      ),
    });

    expect(firstResolution.document.joints).toHaveLength(1);
    expect(firstResolution.jointDiagnostics[0]).toMatchObject({ status: 'applied' });
    expect(firstResolution.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      width: 60,
      depth: 6,
    });
    expect(secondResolution.manufacturingPreviewEntities[0]).toMatchObject({
      type: 'feature',
      width: 90,
      depth: 6,
    });
  });
});
