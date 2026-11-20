// The press brake's side view (docs/sketch-studio-fab-shop.md §9 SM-2, SM-2b):
// an NC-controller style section of the hit, as a card over the viewport —
// the punch, the die, the ram and the backgauge finger from the catalogue
// sections at true proportion, the sheet's cross-section through the bend in
// the die (pressBrake.js sheetSection, exact: true thickness and inside
// radius) with the rest of the part cut at the same plane (brakeCollisions.js
// partSection: what earlier bends made of it), and live readouts of the angle
// and the punch tip.
//
// It draws the very pose the 3D scene shows: the shop layer hands every pose
// (each stroke frame, a pick, a shown collision) to `subscribe`'s listener,
// and the SVG is rewritten in place — no React render per frame. Machine Y–Z
// millimetres throughout: the backgauge (+Y) to the right, Z up (the SVG's y
// is −Z).
import { useEffect, useId, useRef } from 'react';
import { hornWords } from './shopCatalog.js';

const fmt = (value, digits = 1) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const signed = (value, digits = 2) => `${value < -1e-9 ? '−' : value > 1e-9 ? '+' : ''}${fmt(Math.abs(value), digits)}`;
const ringPath = (ring) => `M ${ring.map(([y, z]) => `${fmt(y, 3)} ${fmt(-z, 3)}`).join(' L ')} Z`;
const box = ({ y0, y1, z0, z1 }) =>
  ringPath([
    [y0, z0],
    [y1, z0],
    [y1, z1],
    [y0, z1],
  ]);
// 'turn': the sheet turning over on the die (docs/sketch-studio-brake-flip-tooling.md §5.1), the ram parked;
// 'around': turned around, its side up kept (docs/sketch-studio-brake-hands-on.md §5.3).
const PHASES = {
  approach: 'Coming down',
  bend: 'Bending',
  return: 'Going back up',
  turn: 'Turning the sheet over',
  around: 'Turning the sheet around',
};
const TOOL_NAMES = {
  punch: 'punch',
  holder: 'punch holder',
  ram: 'ram',
  die: 'die',
  bed: 'bed',
  self: 'part itself',
};
// The tools drawn, back to front (the punch holder, shop floor §6.2, between the punch and the ram).
const TOOLS = ['bed', 'die', 'ram', 'holder', 'punch'];

// A drafting break mark across the sheet at a cut wing: a short Z over its thickness.
function breakPath({ at, direction, normal, thickness }, size) {
  const reach = thickness / 2 + size * 0.6,
    lean = size * 0.35;
  const point = (n, d) => [at[0] + normal[0] * n + direction[0] * d, at[1] + normal[1] * n + direction[1] * d];
  const points = [point(-reach, 0), point(-thickness / 6, lean), point(thickness / 6, -lean), point(reach, 0)];
  return `M ${points.map(([y, z]) => `${fmt(y, 3)} ${fmt(-z, 3)}`).join(' L ')}`;
}

/** Rewrite the card for one pose (null: nothing on the brake). */
function draw(nodes, pose) {
  const { svg } = nodes;
  if (!svg) return;
  nodes.root.dataset.state = pose ? (pose.collision ? 'collision' : pose.phase || 'rest') : 'empty';
  if (!pose) return;
  const { window, tools, sheet, finger, collision } = pose;
  const width = window.y1 - window.y0,
    height = window.z1 - window.z0;
  svg.setAttribute('viewBox', `${fmt(window.y0, 3)} ${fmt(-window.z1, 3)} ${fmt(width, 3)} ${fmt(height, 3)}`);
  for (const [key, value] of Object.entries({ x: window.y0, y: -window.z1, width, height }))
    nodes.clip.setAttribute(key, fmt(value, 3));
  for (const tool of TOOLS) {
    nodes[tool].setAttribute('d', tools[tool] ? ringPath(tools[tool].ring) : '');
    nodes[tool].classList.toggle('is-hit', collision?.tool === tool);
  }
  nodes.sheet.setAttribute('d', ringPath(sheet.outline));
  // What earlier bends made of the part: its mid-surface cut, a sheet thick.
  nodes.context.setAttribute(
    'd',
    (pose.context || [])
      .map(([a, b]) => `M ${fmt(a[0], 3)} ${fmt(-a[1], 3)} L ${fmt(b[0], 3)} ${fmt(-b[1], 3)}`)
      .join(' '),
  );
  nodes.context.setAttribute('stroke-width', fmt(sheet.thickness, 3));
  // The part against itself: on the mid-surface ('self') or at the sheet's thickness at the end ('part', corner gaps §5).
  const itself = collision?.tool === 'self' || collision?.tool === 'part';
  nodes.context.classList.toggle('is-hit', itself);
  nodes.sheet.classList.toggle('is-hit', itself);
  nodes.breaks.setAttribute('d', sheet.breaks.map((b) => breakPath(b, width * 0.045)).join(' '));
  // The part taken off the punch along a slant (docs/sketch-studio-shop-punches.md §5.3): during the
  // return the sheet slides along Y with the ram's lift, as the 3D stage draws it.
  const slide = pose.slide ? `translate(${fmt(pose.slide, 3)} 0)` : null;
  for (const node of [nodes.sheet, nodes.context, nodes.breaks])
    if (slide) node.setAttribute('transform', slide);
    else node.removeAttribute('transform');
  // The punch line: the punch's centre, through the V.
  nodes.axis.setAttribute('d', `M 0 ${fmt(-window.z1, 3)} L 0 ${fmt(-window.z0, 3)}`);
  // The backgauge finger at L, or a pointer to it beyond the card's edge.
  const inside = finger && finger.y0 < window.y1 - width * 0.04;
  nodes.finger.setAttribute('d', inside ? box(finger) : '');
  nodes.finger.toggleAttribute('hidden', !inside);
  const pointer = finger && !inside;
  nodes.pointer.toggleAttribute('hidden', !pointer);
  if (pointer) {
    const tip = window.y1 - width * 0.02,
      size = width * 0.035,
      z = (finger.z0 + finger.z1) / 2;
    nodes.pointerMark.setAttribute(
      'd',
      `M ${fmt(tip, 3)} ${fmt(-z, 3)} L ${fmt(tip - size, 3)} ${fmt(-z - size * 0.6, 3)} L ${fmt(tip - size, 3)} ${fmt(-z + size * 0.6, 3)} Z`,
    );
    nodes.pointerText.setAttribute('x', fmt(tip - size * 1.3, 3));
    nodes.pointerText.setAttribute('y', fmt(-z - size * 1.1, 3));
    nodes.pointerText.setAttribute('font-size', fmt(width * 0.045, 3));
    nodes.pointerText.textContent = `Finger at L ${fmt(pose.gaugeDistance)}`;
  }
  nodes.angle.textContent = `${fmt(pose.angle)}°`;
  nodes.target.textContent = pose.target ? ` of ${fmt(pose.target)}°` : '';
  nodes.tip.textContent = `${signed(pose.tipZ)} mm`;
  // A round bend (docs/sketch-studio-round-bend.md §6) names the hit in the die while it bumps.
  const bump = pose.bump && pose.phase ? ` · hit ${pose.bump.hit} of ${pose.bump.hits}` : '';
  nodes.phase.textContent = collision
    ? `Stopped at the hit`
    : pose.phase
      ? `${PHASES[pose.phase]}${bump}`
      : // A bend bent on waits part-bent, short of its target (tight bends §4.4): not made yet.
        pose.angle > 1e-6 && !(pose.target && pose.angle < pose.target - 1e-6)
        ? 'Parked: the bend is made'
        : 'Parked above the sheet';
  // Horn sections at the punch's ends (docs/sketch-studio-punch-library.md §4.4).
  nodes.tooling.textContent = `${pose.punch} punch${pose.reverse ? ' (reversed)' : ''} · ${pose.die} die${hornWords(pose.horns) ? ` · ${hornWords(pose.horns)}` : ''}`;
  // Which side of the sheet is up (§5.1): a bend down is made with it turned over.
  nodes.side.textContent = pose.flipped ? 'Flipped over' : 'This side up';
  nodes.side.classList.toggle('is-flipped', Boolean(pose.flipped));
  nodes.hit.hidden = !collision;
  nodes.hit.textContent = collision
    ? `Hits the ${TOOL_NAMES[collision.tool] || collision.tool} at ${fmt(collision.angle)}°`
    : '';
}

/**
 * `subscribe(listener)` → unsubscribe: the viewport's station poses, the
 * current one at once (null while the station is closed).
 */
export default function BrakeSideView({ subscribe }) {
  const nodes = useRef({});
  const clipId = `cad-brake-side-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`;
  const keep = (name) => (node) => {
    nodes.current[name] = node;
  };
  useEffect(() => subscribe((pose) => draw(nodes.current, pose)), [subscribe]);
  return (
    <figure ref={keep('root')} className="cad-brake-side" aria-label="Side view" data-state="empty">
      <figcaption>
        Side view
        <span ref={keep('side')} className="cad-side-up" aria-label="Side up" />
        <small ref={keep('tooling')} />
      </figcaption>
      <svg ref={keep('svg')} role="img" aria-label="Bend section" preserveAspectRatio="xMidYMid meet">
        <defs>
          <clipPath id={clipId}>
            <rect ref={keep('clip')} />
          </clipPath>
        </defs>
        <g clipPath={`url(#${clipId})`}>
          <path ref={keep('axis')} className="cad-side-axis" />
          {TOOLS.map((tool) => (
            <path key={tool} ref={keep(tool)} className={`cad-side-tool cad-side-${tool}`} data-tool={tool} />
          ))}
          <path ref={keep('finger')} className="cad-side-finger" aria-label="Backgauge finger" hidden />
          <path ref={keep('context')} className="cad-side-context" aria-label="Part section" />
          <path ref={keep('sheet')} className="cad-side-sheet" aria-label="Sheet section" />
          <path ref={keep('breaks')} className="cad-side-break" />
        </g>
        <g ref={keep('pointer')} className="cad-side-pointer" hidden>
          <path ref={keep('pointerMark')} />
          <text ref={keep('pointerText')} textAnchor="end" />
        </g>
      </svg>
      <dl className="cad-side-readouts">
        <div>
          <dt>Angle</dt>
          <dd>
            <span ref={keep('angle')} aria-label="Side view angle" />
            <small ref={keep('target')} />
          </dd>
        </div>
        <div>
          <dt>Punch tip</dt>
          <dd
            ref={keep('tip')}
            aria-label="Punch tip from the die top"
            title="The punch tip's height above the die top"
          />
        </div>
        <div>
          <dt>Ram</dt>
          <dd ref={keep('phase')} aria-label="Ram" />
        </div>
      </dl>
      <p ref={keep('hit')} className="cad-side-hit" role="status" aria-label="Side view collision" hidden />
    </figure>
  );
}
