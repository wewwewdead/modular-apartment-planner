/**
 * Top-down furniture for the presentation plan.
 *
 * Drawn in each fixture's own frame — x across its width, y along its depth,
 * the back (headboard, sofa back, cistern) at -y — so every symbol stays
 * parametric in width and depth. Flat fills, small consistent radii, one warm
 * ink for edges and a soft white for highlights; the depth comes from the one
 * shared drop shadow on the group, not from gradients.
 */
import { PRESENTATION_GRAPHICS } from '@/sheets/standards';

const G = PRESENTATION_GRAPHICS.plan;
const INK = G.fixtureInk;
const INK_SOFT = G.fixtureInkSoft;
const NSS = 'non-scaling-stroke';

const TONES = {
  linen: '#fbfaf7',
  linenShade: '#efebe4',
  frame: '#e7e2d9',
  headboard: '#8c8273',
  duvet: '#c9cdd3',
  duvetFold: '#aeb4bc',
  fabric: '#cbc3b6',
  fabricDeep: '#b2a898',
  cushion: '#d9d2c6',
  cushionLight: '#e4ded4',
  counter: '#f3f1ec',
  counterEdge: '#ffffff',
  hob: '#3a3e44',
  hobRing: '#8d939a',
  ceramic: '#ffffff',
  ceramicEdge: '#98a2ac',
  water: G.glazingFill,
  waterEdge: '#8fa9bb',
  metal: '#7d858e',
  wood: '#dcc3a0',
  woodLight: '#e7d4b8',
  woodDark: '#b08d64',
  screen: '#2f3338',
  screenGlint: '#5b6168',
  leafLight: '#6aa35a',
  leafDeep: '#4f8a45',
  leafGlow: '#9cc77f',
  pot: '#6b6b6b',
  potRim: '#8a8a8a',
  glass: '#8fb3cc',
};

function radiusFor(width, depth, factor = 0.06) {
  return Math.max(12, Math.min(60, Math.min(width, depth) * factor));
}

/** A rounded rectangle that can never go negative, whatever the fixture's size. */
function Box({ x, y, w, h, r = 0, ...rest }) {
  const width = Math.max(1, w);
  const height = Math.max(1, h);
  const radius = Math.max(0, Math.min(r, width / 2, height / 2));
  return <rect x={x} y={y} width={width} height={height} rx={radius} ry={radius} {...rest} />;
}

const edge = (stroke = INK, width = G.fixtureEdgeWidth) => ({ stroke, strokeWidth: width, vectorEffect: NSS });
const detail = (stroke = INK_SOFT) => edge(stroke, G.fixtureDetailWidth);

function Bed({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = radiusFor(W, D, 0.04);
  const headH = D * 0.06;
  const pillowTop = -hd + headH + D * 0.025;
  const pillowH = D * 0.13;
  const gap = W * 0.04;
  const pillowW = (W * 0.86 - gap) / 2;
  const sheetTop = pillowTop + pillowH + D * 0.035;
  const sheetH = D * 0.07;
  const duvetTop = sheetTop + sheetH;
  return (
    <>
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill={TONES.frame} {...edge()} />
      <Box x={-hw} y={-hd} w={W} h={headH} r={r} fill={TONES.headboard} stroke="none" />
      {[-1, 1].map((side) => {
        const x = side < 0 ? -gap / 2 - pillowW : gap / 2;
        return (
          <g key={side}>
            <Box x={x} y={pillowTop} w={pillowW} h={pillowH} r={pillowH * 0.32} fill={TONES.linen} {...detail()} />
            {/* The top highlight: the plump upper half of the pillow catching the light. */}
            <Box
              x={x + pillowW * 0.08}
              y={pillowTop + pillowH * 0.12}
              w={pillowW * 0.84}
              h={pillowH * 0.36}
              r={pillowH * 0.18}
              fill="#ffffff"
              stroke="none"
            />
          </g>
        );
      })}
      <Box x={-hw + W * 0.025} y={sheetTop} w={W * 0.95} h={sheetH} r={r * 0.5} fill={TONES.linen} {...detail()} />
      <Box
        x={-hw + W * 0.025}
        y={duvetTop}
        w={W * 0.95}
        h={hd - duvetTop - D * 0.02}
        r={r}
        fill={TONES.duvet}
        {...detail(TONES.duvetFold)}
      />
      {/* A soft fold across the duvet, and the turned-down corner it ends in. */}
      <path
        d={`M ${-hw + W * 0.06} ${duvetTop + D * 0.2} Q ${0} ${duvetTop + D * 0.15} ${hw - W * 0.06} ${duvetTop + D * 0.22}`}
        fill="none"
        {...detail(TONES.duvetFold)}
      />
      <path
        d={`M ${hw - W * 0.025} ${hd - D * 0.2} L ${hw - W * 0.2} ${hd - D * 0.02} L ${hw - W * 0.025} ${hd - D * 0.02} Z`}
        fill={TONES.linenShade}
        stroke="none"
      />
    </>
  );
}

function Sofa({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = radiusFor(W, D, 0.07);
  const backH = D * 0.24;
  const armW = Math.min(W * 0.1, D * 0.22);
  const seats = W >= 1600 ? 3 : W >= 1000 ? 2 : 1;
  const seatX0 = -hw + armW;
  const seatW = (W - armW * 2) / seats;
  const seatTop = -hd + backH;
  const seatH = D - backH - D * 0.04;
  return (
    <>
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill={TONES.fabric} {...edge()} />
      <Box x={-hw} y={-hd} w={W} h={backH + r} r={r} fill={TONES.fabricDeep} stroke="none" />
      <Box x={-hw} y={-hd} w={armW} h={D} r={r} fill={TONES.fabricDeep} stroke="none" />
      <Box x={hw - armW} y={-hd} w={armW} h={D} r={r} fill={TONES.fabricDeep} stroke="none" />
      {Array.from({ length: seats }, (_, i) => {
        const x = seatX0 + i * seatW + W * 0.006;
        const w = seatW - W * 0.012;
        return (
          <g key={i}>
            <Box x={x} y={seatTop} w={w} h={seatH} r={r * 0.7} fill={TONES.cushion} {...detail()} />
            <Box
              x={x + w * 0.1}
              y={seatTop + seatH * 0.1}
              w={w * 0.8}
              h={seatH * 0.4}
              r={r * 0.5}
              fill={TONES.cushionLight}
              stroke="none"
            />
          </g>
        );
      })}
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill="none" {...edge()} />
    </>
  );
}

function KitchenTop({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = radiusFor(W, D, 0.04);
  const hobW = Math.min(W * 0.3, D * 1.0);
  const hobH = D * 0.74;
  const hobX = -hw + W * 0.07;
  const hobY = -hobH / 2;
  const ringR = Math.min(hobW, hobH) * 0.17;
  const sinkW = Math.min(W * 0.26, D * 1.05);
  const sinkH = D * 0.6;
  const sinkX = hw - W * 0.07 - sinkW;
  const sinkY = -sinkH / 2 + D * 0.04;
  return (
    <>
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill={TONES.counter} {...edge()} />
      {/* The thin lit edge along the front of the worktop. */}
      <line
        x1={-hw + r}
        y1={hd - D * 0.06}
        x2={hw - r}
        y2={hd - D * 0.06}
        stroke={TONES.counterEdge}
        strokeWidth={1}
        vectorEffect={NSS}
      />
      <Box x={hobX} y={hobY} w={hobW} h={hobH} r={r * 0.6} fill={TONES.hob} stroke="none" />
      {[
        [0.28, 0.28, 1],
        [0.72, 0.28, 0.8],
        [0.28, 0.72, 0.8],
        [0.72, 0.72, 1],
      ].map(([fx, fy, k], i) => (
        <g key={i}>
          <circle
            cx={hobX + hobW * fx}
            cy={hobY + hobH * fy}
            r={ringR * k}
            fill="none"
            stroke={TONES.hobRing}
            strokeWidth={0.6}
            vectorEffect={NSS}
          />
          <circle cx={hobX + hobW * fx} cy={hobY + hobH * fy} r={ringR * k * 0.4} fill="#555a61" stroke="none" />
        </g>
      ))}
      <Box x={sinkX} y={sinkY} w={sinkW} h={sinkH} r={r} fill={TONES.ceramic} {...detail(TONES.ceramicEdge)} />
      <Box
        x={sinkX + sinkW * 0.08}
        y={sinkY + sinkH * 0.1}
        w={sinkW * 0.84}
        h={sinkH * 0.8}
        r={r * 0.8}
        fill={TONES.water}
        {...detail(TONES.waterEdge)}
      />
      <circle cx={sinkX + sinkW / 2} cy={sinkY + sinkH / 2} r={Math.max(8, D * 0.025)} fill={TONES.metal} />
      <circle cx={sinkX + sinkW / 2} cy={-hd + D * 0.08} r={Math.max(9, D * 0.028)} fill={TONES.metal} />
    </>
  );
}

function Toilet({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = radiusFor(W, D, 0.08);
  const cisternH = D * 0.3;
  const bowlCy = hd * 0.32;
  const bowlRx = W * 0.34;
  const bowlRy = D * 0.34;
  return (
    <>
      <Box
        x={-hw + W * 0.08}
        y={-hd}
        w={W * 0.84}
        h={cisternH}
        r={r}
        fill={TONES.ceramic}
        {...edge(TONES.ceramicEdge)}
      />
      <Box
        x={-W * 0.08}
        y={-hd + cisternH * 0.3}
        w={W * 0.16}
        h={cisternH * 0.4}
        r={r * 0.4}
        fill={TONES.linenShade}
        {...detail(TONES.ceramicEdge)}
      />
      <ellipse cx={0} cy={bowlCy} rx={bowlRx} ry={bowlRy} fill={TONES.ceramic} {...edge(TONES.ceramicEdge)} />
      <ellipse
        cx={0}
        cy={bowlCy + bowlRy * 0.06}
        rx={bowlRx * 0.66}
        ry={bowlRy * 0.66}
        fill={TONES.water}
        {...detail(TONES.waterEdge)}
      />
    </>
  );
}

function Lavatory({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = radiusFor(W, D, 0.12);
  const basinRx = W * 0.34;
  const basinRy = D * 0.3;
  const basinCy = D * 0.06;
  return (
    <>
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill={TONES.ceramic} {...edge(TONES.ceramicEdge)} />
      <ellipse cx={0} cy={basinCy} rx={basinRx} ry={basinRy} fill={TONES.water} {...detail(TONES.waterEdge)} />
      <circle cx={0} cy={basinCy} r={Math.max(6, W * 0.018)} fill={TONES.metal} />
      <circle cx={0} cy={-hd + D * 0.12} r={Math.max(8, W * 0.03)} fill={TONES.metal} />
      <line
        x1={0}
        y1={-hd + D * 0.12}
        x2={0}
        y2={basinCy - basinRy * 0.75}
        stroke={TONES.metal}
        strokeWidth={1}
        vectorEffect={NSS}
      />
    </>
  );
}

function Table({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = radiusFor(W, D, 0.05);
  const inset = Math.min(W, D) * 0.06;
  const legR = Math.max(14, Math.min(W, D) * 0.035);
  const lx = hw - Math.min(W, D) * 0.1;
  const ly = hd - Math.min(W, D) * 0.1;
  return (
    <>
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill={TONES.wood} {...edge()} />
      <Box
        x={-hw + inset}
        y={-hd + inset}
        w={W - inset * 2}
        h={D - inset * 2}
        r={r * 0.7}
        fill={TONES.woodLight}
        stroke="none"
      />
      {[
        [-lx, -ly],
        [lx, -ly],
        [-lx, ly],
        [lx, ly],
      ].map(([cx, cy], i) => (
        <circle key={i} cx={cx} cy={cy} r={legR} fill={TONES.woodDark} stroke="none" />
      ))}
    </>
  );
}

function Tv({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = Math.min(radiusFor(W, D, 0.3), D / 2);
  const glint = Math.min(W, D) * 0.18;
  return (
    <>
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill={TONES.screen} stroke="none" />
      <Box
        x={-hw + glint}
        y={-hd + glint}
        w={W - glint * 2}
        h={Math.max(1, D * 0.18)}
        r={0}
        fill={TONES.screenGlint}
        stroke="none"
      />
    </>
  );
}

function Shower({ width: W, depth: D }) {
  const hw = W / 2;
  const hd = D / 2;
  const r = radiusFor(W, D, 0.05);
  const inset = Math.min(W, D) * 0.07;
  const drainR = Math.max(18, Math.min(W, D) * 0.05);
  return (
    <>
      <Box x={-hw} y={-hd} w={W} h={D} r={r} fill={TONES.ceramic} {...edge(TONES.ceramicEdge)} />
      <Box
        x={-hw + inset}
        y={-hd + inset}
        w={W - inset * 2}
        h={D - inset * 2}
        r={r * 0.7}
        fill={TONES.water}
        {...detail(TONES.waterEdge)}
      />
      <circle cx={0} cy={0} r={drainR} fill="#ffffff" stroke={TONES.metal} strokeWidth={0.6} vectorEffect={NSS} />
      <line
        x1={-drainR * 0.6}
        y1={0}
        x2={drainR * 0.6}
        y2={0}
        stroke={TONES.metal}
        strokeWidth={0.5}
        vectorEffect={NSS}
      />
      <line
        x1={0}
        y1={-drainR * 0.6}
        x2={0}
        y2={drainR * 0.6}
        stroke={TONES.metal}
        strokeWidth={0.5}
        vectorEffect={NSS}
      />
      {/* The shower rose against the back wall. */}
      <circle cx={-hw + inset * 2.2} cy={-hd + inset * 2.2} r={Math.max(22, W * 0.04)} fill={TONES.metal} />
      {/* Glass screen on the open side. */}
      <line
        data-shower-glass=""
        x1={-hw}
        y1={hd}
        x2={hw - W * 0.32}
        y2={hd}
        stroke={TONES.glass}
        strokeWidth={1.4}
        strokeLinecap="round"
        vectorEffect={NSS}
      />
    </>
  );
}

// A real plant is not a rosette: fixed, deterministic variation in how far each
// leaf reaches and how it is turned, so every plant is the same plant but none
// looks stamped.
const OUTER_REACH = [1, 0.86, 0.95, 0.9, 1, 0.84, 0.97, 0.9];
const LEAF_JITTER = [0, 7, -5, 4, -8, 3, 6, -4];

/** A rounded leaf from the plant's centre out to `length`, `width` at its widest. */
function leafPath(length, width) {
  return `M 0 0 C ${length * 0.22} ${-width} ${length * 0.78} ${-width} ${length} 0 C ${length * 0.78} ${width} ${
    length * 0.22
  } ${width} 0 0 Z`;
}

/**
 * A potted plant from above: a dark pot, a ring of broad leaves in the deeper
 * green, a ring of shorter ones in the lighter green set between them, and a
 * pale crown where they meet. Reads as a plant at the default zoom because the
 * silhouette is a lobed, overlapping bush rather than a disc or a star.
 */
function Plant({ width: W, depth: D }) {
  const size = Math.min(W, D);
  const large = size >= 650;
  const outer = large ? 8 : 7;
  const inner = large ? 6 : 5;
  const outerLen = size * 0.5;
  const innerLen = size * 0.36;
  const twist = 11;
  return (
    <>
      <circle cx={0} cy={0} r={size * 0.32} fill={TONES.pot} stroke="none" />
      <circle cx={0} cy={0} r={size * 0.32} fill="none" stroke={TONES.potRim} strokeWidth={0.8} vectorEffect={NSS} />
      {Array.from({ length: outer }, (_, i) => (
        <path
          key={`o${i}`}
          d={leafPath(outerLen * OUTER_REACH[i % OUTER_REACH.length], size * 0.17)}
          transform={`rotate(${(360 / outer) * i + twist + LEAF_JITTER[i % LEAF_JITTER.length]})`}
          fill={TONES.leafDeep}
          stroke="#3d7036"
          strokeWidth={0.4}
          vectorEffect={NSS}
        />
      ))}
      {Array.from({ length: inner }, (_, i) => (
        <path
          key={`i${i}`}
          d={leafPath(innerLen * OUTER_REACH[(i + 2) % OUTER_REACH.length], size * 0.15)}
          transform={`rotate(${(360 / inner) * i + 180 / inner + twist - LEAF_JITTER[i % LEAF_JITTER.length]})`}
          fill={TONES.leafLight}
          stroke="#538d48"
          strokeWidth={0.4}
          vectorEffect={NSS}
        />
      ))}
      <circle cx={0} cy={0} r={size * 0.075} fill={TONES.leafGlow} stroke="none" />
    </>
  );
}

const SYMBOLS = {
  bed: Bed,
  sofa: Sofa,
  kitchenTop: KitchenTop,
  toilet: Toilet,
  lavatory: Lavatory,
  table: Table,
  tv: Tv,
  shower: Shower,
  plant: Plant,
};

export function hasPresentationSymbol(fixtureType) {
  return Boolean(SYMBOLS[fixtureType]);
}

export function PresentationFixtureSymbol({ fixture }) {
  const Symbol = SYMBOLS[fixture.fixtureType];
  const { x, y, width, depth, rotation } = fixture;
  const transform = `translate(${x},${y}) rotate(${rotation || 0})`;
  if (!Symbol) {
    const r = radiusFor(width, depth);
    return (
      <g transform={transform}>
        <Box x={-width / 2} y={-depth / 2} w={width} h={depth} r={r} fill={TONES.counter} {...edge()} />
      </g>
    );
  }
  return (
    <g transform={transform} data-fixture-symbol={fixture.fixtureType}>
      <Symbol width={Math.max(1, width)} depth={Math.max(1, depth)} />
    </g>
  );
}
