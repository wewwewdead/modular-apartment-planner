import { describe, expect, it } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createBeam, createColumn, createFloor } from '@/domain/models';
import { TOOLS } from '@/editor/tools';
import FloorPreviewLayer from './FloorPreviewLayer';

/**
 * The ceiling pick is the one preview here that can be armed against a storey
 * other than the one on screen: a plate's ceiling hangs on the floor BELOW it,
 * and so do the beams that carry it. Plan coordinates are shared across the
 * stack, so the other floor's frame outlines over this drawing exactly where it
 * will be clicked — but only if the layer hands the overlay that floor.
 */

function floorWithBeam(id, beamId, level, columnX) {
  const columns = [
    { ...createColumn(columnX, 0, 300, 300, { height: level }), id: `${id}_a` },
    { ...createColumn(columnX, 4000, 300, 300, { height: level }), id: `${id}_b` },
  ];
  return Object.assign(createFloor(id, 0, { elevation: 0, floorToFloorHeight: 2800 }), {
    id,
    columns,
    beams: [
      {
        ...createBeam({ kind: 'column', id: `${id}_a` }, { kind: 'column', id: `${id}_b` }, 250, 450, level),
        id: beamId,
      },
    ],
  });
}

function render(props) {
  return renderToStaticMarkup(
    <svg>
      <FloorPreviewLayer activeTool={TOOLS.CEILING_BEAM_PICK} toolState={{}} {...props} />
    </svg>,
  );
}

describe('FloorPreviewLayer — the ceiling pick floor', () => {
  const onScreen = floorWithBeam('floor_upper', 'beam_upper', 3200, 1000);
  const below = floorWithBeam('floor_ground', 'beam_ground', 3200, 5000);

  it('outlines the beams of the floor being picked on, not the plan on screen', () => {
    const markup = render({ floor: onScreen, pickFloor: below });

    expect(markup).toContain('ceiling-beam-pick-overlay');
    // The ground beam runs at x = 5000; the one on the plan on screen at 1000.
    expect(markup).toContain('points="4875,150');
    expect(markup).not.toContain('points="875,150');
  });

  it('falls back to the floor on screen when nothing armed another one', () => {
    const markup = render({ floor: onScreen });

    expect(markup).toContain('ceiling-beam-pick-overlay');
    expect(markup).toContain('points="875,150');
    expect(markup).not.toContain('4875');
  });
});
