import { describe, expect, it } from 'vitest';
import {
  normalizeJoint,
  parseSerializedJointReference,
  serializeJointReference,
} from './jointSerializationUtils';

describe('jointSerializationUtils', () => {
  it('migrates legacy dado host/source fields into the new source-target schema', () => {
    const joint = normalizeJoint({
      id: 'joint-dado',
      type: 'dado',
      primaryEntityId: 'panel',
      secondaryEntityId: 'shelf',
      primaryEdgeRef: { entityId: 'panel', sourceType: 'segment', sourceKey: 'top' },
      secondaryEdgeRef: { entityId: 'shelf', sourceType: 'segment', sourceKey: 'bottom' },
      parameters: {
        width: 60,
        depth: 6,
      },
    });

    expect(joint).toMatchObject({
      id: 'joint-dado',
      type: 'dado',
      placementMode: 'manual_refs',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      sourceEdgeRef: { entityId: 'shelf', sourceKey: 'bottom' },
      targetEdgeRef: { entityId: 'panel', sourceKey: 'top' },
      parameterModes: {
        depth: 'manual',
      },
      parameters: {
        width: 60,
        depth: 6,
      },
    });
  });

  it('maps legacy finger joints to the tab-and-slot schema', () => {
    const joint = normalizeJoint({
      id: 'joint-finger',
      type: 'finger',
      primaryEntityId: 'box-a',
      secondaryEntityId: 'box-b',
      primaryEdgeRef: { entityId: 'box-a', sourceType: 'segment', sourceKey: 'right' },
      secondaryEdgeRef: { entityId: 'box-b', sourceType: 'segment', sourceKey: 'left' },
      parameters: {
        fingerCount: 5,
        fingerWidth: 24,
        depth: 12,
      },
    });

    expect(joint).toMatchObject({
      type: 'tab_slot',
      placementMode: 'manual_refs',
      sourcePartId: 'box-a',
      targetPartId: 'box-b',
      parameters: {
        count: 5,
        tabWidth: 24,
        depth: 12,
      },
    });
  });

  it('defaults new automatic dado joints to auto-contact and overlap-linked depth', () => {
    const joint = normalizeJoint({
      id: 'joint-auto-dado',
      type: 'dado',
      sourcePartId: 'shelf',
      targetPartId: 'panel',
    });

    expect(joint).toMatchObject({
      id: 'joint-auto-dado',
      type: 'dado',
      placementMode: 'auto_contact',
      parameterModes: {
        depth: 'auto_overlap',
      },
      sourcePartId: 'shelf',
      targetPartId: 'panel',
      sourceEdgeRef: null,
      targetEdgeRef: null,
    });
  });

  it('defaults new automatic mortise-and-tenon and tab-slot joints to overlap-linked depth', () => {
    const mortiseTenon = normalizeJoint({
      id: 'joint-auto-mortise',
      type: 'mortise_tenon',
      sourcePartId: 'rail',
      targetPartId: 'stile',
    });
    const tabSlot = normalizeJoint({
      id: 'joint-auto-tab-slot',
      type: 'tab_slot',
      sourcePartId: 'divider',
      targetPartId: 'panel',
    });

    expect(mortiseTenon).toMatchObject({
      id: 'joint-auto-mortise',
      placementMode: 'auto_contact',
      parameterModes: {
        depth: 'auto_overlap',
      },
    });
    expect(tabSlot).toMatchObject({
      id: 'joint-auto-tab-slot',
      placementMode: 'auto_contact',
      parameterModes: {
        depth: 'auto_overlap',
      },
    });
  });

  it('roundtrips serialized joint references', () => {
    const reference = {
      partId: 'panel',
      entityId: 'panel',
      sourceType: 'segment',
      sourceKey: 'top',
    };

    expect(parseSerializedJointReference(serializeJointReference(reference))).toEqual(reference);
  });
});
