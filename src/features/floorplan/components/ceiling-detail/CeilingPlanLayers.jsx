import { memo } from 'react';
import { CEILING_OPENING_TYPES } from '@/domain/ceilingModels';
import { CEILING_BOARD_MATERIALS } from '@/domain/ceilingProductProfiles';
import { getBulbType, getFixtureType } from '@/domain/lightingCatalog';
import { WallCanvasGrid } from '@/features/floorplan/components/wall-detail/WallCanvasChrome';
import styles from '@/features/floorplan/components/wall-detail/WallDetailEditor.module.css';

/*
 * The reflected ceiling plan's committed drawing, one memoised layer per
 * collection, plus the vocabulary those layers draw with (labels, colours, the
 * luminaire symbols). Split out of the editor so the editor only mounts them.
 */

export const OPENING_TYPE_LABELS = Object.freeze({
  [CEILING_OPENING_TYPES.ACCESS_HATCH]: 'Access hatch',
  [CEILING_OPENING_TYPES.DOWNLIGHT]: 'Downlight',
  [CEILING_OPENING_TYPES.DIFFUSER]: 'Air diffuser',
  [CEILING_OPENING_TYPES.CUSTOM]: 'Custom cut-out',
});

export const FRAMING_KIND_LABELS = Object.freeze({
  furring: 'Furring channel',
  carrier: 'Carrier',
  trimmer: 'Opening trimmer',
  wall_angle: 'Wall angle',
});

const FRAMING_COLORS = Object.freeze({
  furring: 'rgba(49, 129, 168, 0.35)',
  carrier: 'rgba(120, 96, 190, 0.42)',
  trimmer: 'rgba(214, 158, 74, 0.4)',
  wall_angle: 'rgba(86, 158, 130, 0.5)',
});

// Below this the wall angle would draw thinner than a line and disappear on a
// zoomed-out plan, so it is drawn at its real leg width or this, whichever is
// wider.
const MIN_MEMBER_LINE_PX = 1.5;

/**
 * One colour per board material, so a ceiling boarded in two of them reads as
 * two on the plan rather than as one flat field. A board answers for itself:
 * the ceiling's profile only decides what a board that never overrode it is.
 */
const BOARD_FILLS = Object.freeze({
  [CEILING_BOARD_MATERIALS.PLYWOOD]: '#dcc39b',
  [CEILING_BOARD_MATERIALS.FIBER_CEMENT]: '#dedbd1',
});

/**
 * Which RCP symbol each catalog luminaire draws. Grouped by what the drawing has
 * to tell apart at a glance — a plain can, something with a lens ring, something
 * hanging — rather than by the mount word: a semi-flush is surface-mounted and
 * still reads as a dome, and a wafer is recessed and still is not a can.
 */
const FIXTURE_SYMBOLS = Object.freeze({
  recessed_can_4: 'plain',
  recessed_can_6: 'plain',
  gimbal_recessed: 'plain',
  wafer_led: 'double',
  cylinder_downlight: 'double',
  surface_flush: 'cross',
  semi_flush: 'cross',
  pendant: 'dot',
  chandelier_5: 'arms',
  track_head: 'track',
  troffer_2x2: 'rect',
  troffer_2x4: 'rect',
});

/**
 * Fixtures are drawn at the size they really cover, so a 2 × 4 troffer reads as
 * the two ceiling tiles it displaces. Zoomed out that would shrink a 75 mm track
 * head to nothing, so `unitPx` sets a legibility floor the same way the hanger
 * and screw markers do: below it the symbol stops shrinking and the plan goes on
 * saying what kind of light is there.
 */
const FIXTURE_MIN_SYMBOL_PX = 7;
export const FIXTURE_SYMBOL_COLOR = '#ffd48a';
// The one orange every selected piece on this plan wears. The stylesheet holds
// it as --assembly-selected-line, which a presentation attribute cannot read,
// and these symbols carry their stroke as an attribute so the whole group can
// set it once.
const FIXTURE_SELECTED_COLOR = '#ffb45c';

function svgNumber(value) {
  return Math.round(value * 100) / 100;
}

/** Half-extents of a fixture symbol in UV, already floored to stay legible. */
export function fixtureSymbolExtent(type, unitPx) {
  const floor = FIXTURE_MIN_SYMBOL_PX * unitPx;
  return {
    halfU: Math.max(type.apertureMm / 2, floor),
    halfV: Math.max((type.apertureLengthMm ?? type.apertureMm) / 2, floor),
  };
}

/**
 * The arrow an aimable fixture points along. Azimuth is degrees CCW from +U in
 * the RCP frame, so the direction is built in UV and left to the layer's own
 * flip — a rotate() here would come out mirrored, because that transform is what
 * turns the V axis over.
 */
function fixtureAimPath(fixture, radius) {
  const angle = ((fixture.aim?.azimuthDeg || 0) * Math.PI) / 180;
  const tipU = fixture.u + Math.cos(angle) * radius * 1.7;
  const tipV = fixture.v + Math.sin(angle) * radius * 1.7;
  const barb = radius * 0.55;
  const segments = [`M ${svgNumber(fixture.u)} ${svgNumber(fixture.v)} L ${svgNumber(tipU)} ${svgNumber(tipV)}`];
  for (const sweep of [2.6, -2.6]) {
    segments.push(
      `M ${svgNumber(tipU)} ${svgNumber(tipV)} L ${svgNumber(tipU + Math.cos(angle + sweep) * barb)} ${svgNumber(
        tipV + Math.sin(angle + sweep) * barb,
      )}`,
    );
  }
  return segments.join(' ');
}

/** One luminaire as the industry draws it, in ceiling-local UV. */
export function fixtureSymbolNodes(fixture, unitPx, color) {
  const type = getFixtureType(fixture.fixtureType);
  const symbol = FIXTURE_SYMBOLS[type.id] || 'plain';
  const { halfU, halfV } = fixtureSymbolExtent(type, unitPx);
  const { u, v } = fixture;

  // Troffers are the only rectangular luminaire in the catalog, and a panel is a
  // tile: drawn as a circle it would claim the wrong footprint entirely.
  if (symbol === 'rect') {
    return [
      <rect
        key="body"
        x={u - halfU}
        y={v - halfV}
        width={halfU * 2}
        height={halfV * 2}
        vectorEffect="non-scaling-stroke"
      />,
      <line
        key="diagonal"
        x1={u - halfU}
        y1={v - halfV}
        x2={u + halfU}
        y2={v + halfV}
        vectorEffect="non-scaling-stroke"
      />,
    ];
  }

  const radius = halfU;
  const nodes = [<circle key="body" cx={u} cy={v} r={radius} vectorEffect="non-scaling-stroke" />];
  if (symbol === 'double') {
    nodes.push(<circle key="inner" cx={u} cy={v} r={radius * 0.62} vectorEffect="non-scaling-stroke" />);
  } else if (symbol === 'cross') {
    nodes.push(
      <path
        key="cross"
        d={`M ${svgNumber(u - radius)} ${svgNumber(v)} H ${svgNumber(u + radius)} M ${svgNumber(u)} ${svgNumber(
          v - radius,
        )} V ${svgNumber(v + radius)}`}
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else if (symbol === 'dot') {
    nodes.push(
      <circle
        key="lamp"
        cx={u}
        cy={v}
        r={Math.max(radius * 0.22, 1.5 * unitPx)}
        fill={color}
        vectorEffect="non-scaling-stroke"
      />,
    );
  } else if (symbol === 'arms') {
    // Five arms, five ticks: the count is the whole point of the symbol, which
    // is why a chandelier is not just a bigger circle.
    const arms = Array.from({ length: 5 }, (unused, index) => {
      const angle = Math.PI / 2 + (index * 2 * Math.PI) / 5;
      return `M ${svgNumber(u + Math.cos(angle) * radius * 0.45)} ${svgNumber(
        v + Math.sin(angle) * radius * 0.45,
      )} L ${svgNumber(u + Math.cos(angle) * radius)} ${svgNumber(v + Math.sin(angle) * radius)}`;
    });
    nodes.push(<path key="arms" d={arms.join(' ')} vectorEffect="non-scaling-stroke" />);
  } else if (symbol === 'track') {
    // The rail the head clamps to, drawn across the direction it throws.
    const angle = ((fixture.aim?.azimuthDeg || 0) * Math.PI) / 180 + Math.PI / 2;
    const reach = radius * 1.4;
    nodes.push(
      <line
        key="rail"
        x1={svgNumber(u - Math.cos(angle) * reach)}
        y1={svgNumber(v - Math.sin(angle) * reach)}
        x2={svgNumber(u + Math.cos(angle) * reach)}
        y2={svgNumber(v + Math.sin(angle) * reach)}
        vectorEffect="non-scaling-stroke"
      />,
    );
  }
  if (type.aimable) {
    nodes.push(<path key="aim" d={fixtureAimPath(fixture, radius)} vectorEffect="non-scaling-stroke" />);
  }
  return nodes;
}

function boardFillFor(material) {
  return BOARD_FILLS[material] || BOARD_FILLS[CEILING_BOARD_MATERIALS.FIBER_CEMENT];
}

export function formatMm(value) {
  const number = Number(value);
  return Number.isFinite(number) ? Math.round(number * 10) / 10 : 0;
}

function regionPath(region) {
  return [region.outline, ...(region.holes || [])]
    .filter((ring) => ring?.length)
    .map((ring) => `${ring.map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.u} ${point.v}`).join(' ')} Z`)
    .join(' ');
}

/*
 * Everything on the reflected ceiling plan that only moves when the ceiling
 * itself changes, as one memo per collection: snap grid, opening voids and
 * boards, framing, hangers, screws, lights, opening profiles, and the boundary
 * rings. A real ceiling is thousands of these nodes — a 12 × 10 m board grid
 * carries over two thousand screws, each a group, a title and a circle — and
 * panning re-renders the editor on every pointer move. Behind `memo` a pan
 * touches nothing here: the only viewport value a layer reads is `unitPx`,
 * which changes with zoom, never with pan.
 *
 * One memo per collection rather than one for the lot, because a single memo
 * holding every collection let go whenever any of them changed — placing a
 * light reconciled every screw on the ceiling. Each layer takes only its own
 * collection and the selected id of its own kind of thing (never the whole
 * selection object), and the assembly cache in `ceilingModels.js` hands the
 * collections back by reference across an edit that did not touch them, so a
 * light placement re-renders the light layer and nothing else.
 *
 * The handlers are the editor's stable forwarders (`stableCanvasHandlers`),
 * which is what lets the memo hold at all.
 *
 * The in-flight draw and trace previews and the light ghost deliberately stay
 * with the editor: those change every frame, and they are a handful of nodes.
 */

export const CeilingGridLayer = memo(function CeilingGridLayer({ bounds, snapStep, unitPx, active }) {
  return <WallCanvasGrid bounds={bounds} snapStep={snapStep} unitPx={unitPx} active={active} />;
});

/** Opening voids first, then the boards over them. */
export const CeilingBoardLayer = memo(function CeilingBoardLayer({
  panels,
  openings,
  showVoids,
  showBoards,
  disabledBoardFill,
  selectedId,
  onElementPointerDown,
}) {
  return (
    <g data-ceiling-layer="boards">
      {showVoids &&
        openings.map((opening) => (
          <rect
            key={`${opening.id}:void`}
            className={styles.openingVoid}
            x={opening.u0}
            y={opening.v0}
            width={opening.u1 - opening.u0}
            height={opening.v1 - opening.v0}
          />
        ))}

      {showBoards &&
        panels.flatMap((panel) =>
          panel.regions.map((region, index) => (
            <path
              key={`${panel.id}:region:${index}`}
              className={styles.panelShape}
              data-selected={selectedId === panel.localId ? 'true' : 'false'}
              d={regionPath(region)}
              fill={disabledBoardFill || boardFillFor(panel.material)}
              fillRule="evenodd"
              vectorEffect="non-scaling-stroke"
              onPointerDown={(event) => onElementPointerDown(event, 'panel', panel.localId, panel)}
            >
              <title>{`${panel.label} · ${formatMm(panel.width)} × ${formatMm(panel.height)} mm`}</title>
            </path>
          )),
        )}
    </g>
  );
});

export const CeilingStructureLayer = memo(function CeilingStructureLayer({
  members,
  unitPx,
  selectedId,
  isCustomMember,
  onElementPointerDown,
}) {
  return (
    <g data-ceiling-layer="structure">
      {members.map((member) =>
        member.kind === 'wall_angle' ? (
          // Drawn at the width of its own leg rather than as a profile line.
          // The angle is the edge framing of every ring the ceiling was traced
          // into — its perimeter, and the face of every beam, column and
          // partition cut out of it — and a hairline running 12.5 mm off the
          // ceiling outline reads as that outline rather than as a member. It
          // stays out of the way of the pointer: an angle is derived from the
          // area, so there is nothing to select on it, and a 25 mm band down
          // every edge would otherwise swallow clicks meant for the board.
          <line
            key={member.id}
            x1={member.start.u}
            y1={member.start.v}
            x2={member.end.u}
            y2={member.end.v}
            style={{
              stroke: FRAMING_COLORS.wall_angle,
              strokeWidth: Math.max(member.width || 0, MIN_MEMBER_LINE_PX * unitPx),
              pointerEvents: 'none',
            }}
          >
            <title>{FRAMING_KIND_LABELS.wall_angle}</title>
          </line>
        ) : (
          <rect
            key={member.id}
            className={styles.frameShape}
            data-selected={selectedId === member.id ? 'true' : 'false'}
            x={member.u0}
            y={member.v0}
            width={member.u1 - member.u0}
            height={member.v1 - member.v0}
            fill={FRAMING_COLORS[member.kind]}
            vectorEffect="non-scaling-stroke"
            onPointerDown={(event) =>
              onElementPointerDown(event, 'framing', member.id, member, isCustomMember(member.id))
            }
          >
            <title>
              {`${FRAMING_KIND_LABELS[member.kind] || member.kind} · U ${formatMm(member.u0)} → ${formatMm(
                member.u1,
              )} · V ${formatMm(member.v0)} → ${formatMm(member.v1)}`}
            </title>
          </rect>
        ),
      )}
    </g>
  );
});

export const CeilingHangerLayer = memo(function CeilingHangerLayer({ hangers, unitPx }) {
  return (
    <g data-ceiling-layer="hangers">
      {hangers.map((hanger) => (
        <circle
          key={hanger.id}
          cx={hanger.u}
          cy={hanger.v}
          r={4 * unitPx}
          fill="none"
          stroke="#8fd0f0"
          strokeWidth="1.25"
          vectorEffect="non-scaling-stroke"
        >
          <title>{`Hanger · U ${formatMm(hanger.u)} · V ${formatMm(hanger.v)}`}</title>
        </circle>
      ))}
    </g>
  );
});

/*
 * A screw is a 3 px dot among several hundred of them, so the one that is
 * selected is found by the ring around it, not by its own colour — the same
 * halo the wall elevation draws.
 */
export const CeilingScrewLayer = memo(function CeilingScrewLayer({
  fasteners,
  unitPx,
  selectedId,
  isManualFastener,
  onElementPointerDown,
}) {
  return (
    <g data-ceiling-layer="screws">
      {fasteners.map((fastener) => {
        const selected = selectedId === fastener.id;
        return (
          <g
            key={fastener.id}
            className={styles.fastenerGraphic}
            data-selected={selected ? 'true' : 'false'}
            onPointerDown={(event) =>
              onElementPointerDown(event, 'fastener', fastener.id, fastener, isManualFastener(fastener.id))
            }
          >
            <title>{`Screw · U ${formatMm(fastener.u)} · V ${formatMm(fastener.v)}`}</title>
            {selected ? (
              <circle
                className={styles.fastenerHalo}
                cx={fastener.u}
                cy={fastener.v}
                r={3 * unitPx + 7 * unitPx}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            <circle
              cx={fastener.u}
              cy={fastener.v}
              r={3 * unitPx}
              fill="#8a9298"
              stroke="#2b3238"
              strokeWidth="1"
              vectorEffect="non-scaling-stroke"
            />
          </g>
        );
      })}
    </g>
  );
});

/*
 * Over the screws and the plan underlay and under the opening profiles: a light
 * is read against the boards it sits in, but never over the cut lines those
 * boards stop at. Selection is the screw's halo again — a symbol that changed
 * weight would move the edge the drawing is measured against.
 */
export const CeilingFixtureLayer = memo(function CeilingFixtureLayer({
  fixtures,
  unitPx,
  selectedId,
  hiddenId = null,
  onElementPointerDown,
}) {
  return (
    <g data-ceiling-layer="fixtures">
      {fixtures.map((fixture) => {
        const selected = selectedId === fixture.id;
        const color = selected ? FIXTURE_SELECTED_COLOR : FIXTURE_SYMBOL_COLOR;
        const { halfU, halfV } = fixtureSymbolExtent(getFixtureType(fixture.fixtureType), unitPx);
        return (
          <g
            key={fixture.id}
            className={styles.fastenerGraphic}
            data-fixture-id={fixture.id}
            data-selected={selected ? 'true' : 'false'}
            // The light under a move is drawn by the editor's ghost at its new
            // spot; leaving the committed one at half strength keeps the place
            // it is leaving readable without two full symbols competing.
            opacity={hiddenId === fixture.id ? 0.35 : undefined}
            fill="none"
            stroke={color}
            strokeWidth="1.25"
            // The symbol is outlines only, so without this a press in the middle
            // of a can fell through its empty interior onto the board below and
            // dragged the board instead of the light.
            pointerEvents="bounding-box"
            onPointerDown={(event) => onElementPointerDown(event, 'fixture', fixture.id, fixture)}
          >
            <title>
              {`${getFixtureType(fixture.fixtureType).label} · ${getBulbType(fixture.bulbType).label} · ${Math.round(
                fixture.photometrics.lumens,
              )} lm · U ${formatMm(fixture.u)} · V ${formatMm(fixture.v)}`}
            </title>
            {selected ? (
              <circle
                className={styles.fastenerHalo}
                cx={fixture.u}
                cy={fixture.v}
                r={Math.max(halfU, halfV) + 6 * unitPx}
                fill="none"
                vectorEffect="non-scaling-stroke"
              />
            ) : null}
            {fixtureSymbolNodes(fixture, unitPx, color)}
          </g>
        );
      })}
    </g>
  );
});

export const CeilingOpeningProfileLayer = memo(function CeilingOpeningProfileLayer({
  openings,
  selectedId,
  onElementPointerDown,
}) {
  return (
    <g data-ceiling-layer="opening-profiles">
      {openings.map((opening) => (
        <rect
          key={`${opening.id}:profile`}
          className={styles.openingProfile}
          data-selected={selectedId === opening.id ? 'true' : 'false'}
          x={opening.u0}
          y={opening.v0}
          width={opening.u1 - opening.u0}
          height={opening.v1 - opening.v0}
          vectorEffect="non-scaling-stroke"
          onPointerDown={(event) => onElementPointerDown(event, 'opening', opening.id, opening)}
        >
          <title>
            {`${OPENING_TYPE_LABELS[opening.type] || opening.type} · U ${formatMm(opening.u0)} → ${formatMm(
              opening.u1,
            )} · V ${formatMm(opening.v0)} → ${formatMm(opening.v1)}`}
          </title>
        </rect>
      ))}
    </g>
  );
});

/** One ring per edge of the ceiling area: the perimeter, plus every wall, beam and column it was traced around. */
export const CeilingBoundaryLayer = memo(function CeilingBoundaryLayer({ regions }) {
  return (
    <g data-ceiling-layer="boundary">
      {regions.flatMap((region, regionIndex) =>
        [region.outline, ...region.holes]
          .filter((ring) => ring.length >= 3)
          .map((ring, ringIndex) => (
            <polyline
              key={`ceiling-edge-${regionIndex}-${ringIndex}`}
              className={styles.openingProfile}
              style={{ pointerEvents: 'none' }}
              points={[...ring, ring[0]].map((point) => `${point.u},${point.v}`).join(' ')}
              fill="none"
              vectorEffect="non-scaling-stroke"
            />
          )),
      )}
    </g>
  );
});
