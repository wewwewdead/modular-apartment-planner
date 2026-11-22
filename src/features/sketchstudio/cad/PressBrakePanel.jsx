// The press brake station's NC panel (docs/sketch-studio-fab-shop.md §9 SM-2
// items 4, 5, 8, 9): the machine, the line (a backgauge edge and L, or two
// points), the angle, Flip sheet and the tooling; what the hit will make (both
// outside legs, the force against the press) on show and the machine's
// numbers one click away (docs/sketch-studio-shop-floor.md §4.6); its
// refusals and collision as problem cards with their remedies; Bend (the
// pedal); and the sequence of hits already made. Every number comes from
// brakeStation.js, pressBrake.js and shopCatalog.js. The picks live in the
// workspace's brakeSession; only the machine and the bends are model edits.
import { useContext, useEffect, useMemo, useRef, useState } from 'react';
import { bendLabel, bendNumber, foldedBounds, hitSequence, isRoundBend, stepFold } from './sheetMetal.js';
import {
  DEFAULT_PUNCH,
  DIES,
  HORNS,
  HORN_KEYS,
  MACHINES,
  MACHINE_KEYS,
  PUNCHES,
  PUNCH_GROUPS,
  RADIUS_PUNCHES,
  dieSection,
  hornOf,
  hornWords,
  nearestRadiusPunch,
  punchSection,
  punchSymmetric,
  stockOf,
  suggestedDie,
} from './shopCatalog.js';
import {
  hornSetting,
  pieceChoice,
  pieceDefault,
  piecesTogether,
  punchChangeWords,
  punchChoice,
  turnAround,
} from './brakeStation.js';
import { toolEnds, toolLengths } from './pressBrake.js';
import { ValueField, numberFor } from './CadEditors.jsx';
import { ParameterContext } from './ExpressionInput.jsx';
import { MachineNumbers, PrimaryButton, ProblemCard, Readout, Result, StationShell } from './ShopFloor.jsx';
import { hitVerdict, legsText } from './brakeHands.js';
import NumericInput from '../components/NumericInput.jsx';
import FlangeGaps from './FlangeGaps.jsx';

const fmt = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;
const NONE = [];
const NO_PARAMS = {};
// Hits of the machine made on a part: one per step, a round bend's each (docs/sketch-studio-round-bend.md §7);
// a bend-on step is one hit (docs/sketch-studio-tight-bends.md §4.4).
const hitsMade = (fold, strokes) =>
  strokes.reduce((sum, s) => sum + (s.again ? 1 : fold.bends.find((b) => b.id === s.bendIds[0])?.steps || 1), 0);
const fmtAngle = (value) => `${fmt(value, 1)}°`;
// The Backgauge L readout (docs/sketch-studio-skin-gauge.md §4.7): what the
// fingers read and what they stop on; with an armed try whose order reads
// otherwise than the field, that order's reading and why.
function gaugeWords(station, session, armed) {
  const gauge = station.gauge;
  if (gauge?.distance == null) return 'no straight gauge';
  const off = gauge.stop ? ` · off bend ${gauge.stop.number}'s flange` : '';
  const differs = armed && Math.abs(gauge.distance - Number(session.distance)) > 1e-6;
  const why = !differs
    ? ''
    : armed.kind === 'partway'
      ? ` · bend ${armed.number} at ${fmtAngle(armed.angle)} then`
      : ` · made before bend ${armed.number}: the sheet is still flat there`;
  return `${fmt(gauge.distance)} mm${off}${why}`;
}
const gaugeTitle = (station) =>
  station.gauge?.stop
    ? `The fingers stop on the outside face of bend ${station.gauge.stop.number}'s flange, not on the blank's edge`
    : station.gauge?.reason || '';
// A step's row (tight bends §4.4): a bend's first step its label at the angle that step makes; a
// bend-on step "bend {n} on: {from}° → {to}°" (n: the step that first made the bend).
const stepText = (fold, step) => {
  const bend = fold.bends.find((b) => b.id === step.bendIds[0]);
  const count = step.bendIds.length;
  if (step.again)
    return `bend ${bendNumber(fold, bend.id)} on: ${fmtAngle(step.from[bend.id])} → ${fmtAngle(step.to[bend.id])}${count > 1 ? ` · ${count} flanges` : ''}`;
  const label =
    Math.abs(step.to[bend.id] - bend.angle) > 1e-9 ? bendLabel({ ...bend, angle: step.to[bend.id] }) : bend.label;
  return `${label}${count > 1 ? ` · ${count} flanges` : ''}`;
};
// An armed try's words (docs/sketch-studio-tight-bends.md §5.2): where the hit goes in, and what the view shows;
// the earlier bends made with another punch (docs/sketch-studio-shop-punches.md §6.2) said with it.
const armedText = (armed) =>
  armed.kind === 'partway'
    ? `Bend ${armed.number} goes to ${fmtAngle(armed.angle)} first and is finished after this hit: the view shows bend ${armed.number} at ${fmtAngle(armed.angle)}.`
    : `This hit goes in before ${armed.again ? 'step' : 'bend'} ${armed.number}${armed.changes ? `, and ${punchChangeWords(armed.changes, 'is')}` : ''}: the view shows the sheet as it is then.`;
// The line an armed try's commit leaves (§5.2): a step opened part-way, or (shop punches §6.2) a punch changed.
const noticeName = (notice) =>
  / is now made with | are now made with /.test(notice) ? 'Punch changed' : 'Part-way bend';
// A step's tooling line: its die, and the punch when it is a radius punch (round-bend spec §12.6);
// a punch or die set to its own length names it (docs/sketch-studio-brake-tool-length.md §3.4).
// A step made with horn sections says so last (docs/sketch-studio-punch-library.md §4.4).
const toolingLine = (bend, die, lengths = null) => {
  const punch = PUNCHES[bend.punch];
  const named = punch?.round || lengths?.punch;
  return `${named ? `${punch?.name || bend.punch} punch${lengths?.punch ? `, ${lengths.punch}` : ''} · ` : ''}${die}${lengths?.die ? ` die, ${lengths.die}` : ''}${hornWords(bend.horns) ? ` · ${hornWords(bend.horns)}` : ''}`;
};
// A step's custom lengths (pressBrake.js toolLengths), only when its record has a trim.
const lengthsOf = (fold, stroke, bed = null) =>
  stroke.punchTrim || stroke.dieTrim || stroke.slide
    ? toolLengths(stepFold(fold, stroke), stroke.bendIds, { bed })
    : null;

function Segmented({ label, options, value, onChange, disabled = false }) {
  return (
    <span className="cad-segmented" role="group" aria-label={label}>
      {options.map(([key, text]) => (
        <button key={key} type="button" aria-pressed={value === key} disabled={disabled} onClick={() => onChange(key)}>
          {text}
        </button>
      ))}
    </span>
  );
}

// Force against the press's capacity (and the tooling's limit) as a bar.
function TonnageBar({ force, capacity, limit }) {
  const ceiling = Math.min(capacity, limit);
  const share = ceiling > 0 ? force / ceiling : 1;
  return (
    <div className="cad-brake-tonnage">
      <div
        className={`cad-brake-bar ${share > 1 ? 'is-over' : share > 0.8 ? 'is-high' : ''}`}
        role="meter"
        aria-label="Tonnage against capacity"
        aria-valuemin={0}
        aria-valuemax={Math.round(ceiling * 100) / 100}
        aria-valuenow={Math.round(force * 100) / 100}
      >
        <span style={{ width: `${Math.min(100, share * 100)}%` }} />
      </div>
      <small>
        {fmt(force)} kN of {fmt(capacity, 0)} kN press · tooling {fmt(limit)} kN
      </small>
    </div>
  );
}

// ------------------------------------------------ the blades (docs/sketch-studio-brake-flip-tooling.md §4.1)
// A tool's silhouette: its section as the 3D scene and the collision check
// use it (shopCatalog.js punchSection / dieSection), in machine Y–Z mm (the
// operator to the left, the backgauge to the right, as the side view).
// `box`: [y0, z0, y1, z1], the view it is drawn in (one box for a common scale).
const boxOf = (rings, pad = 2) => {
  const points = rings.flat();
  const ys = points.map((p) => p[0]),
    zs = points.map((p) => p[1]);
  const reach = Math.max(...ys.map(Math.abs));
  return [-reach - pad, Math.min(...zs) - pad, reach + pad, Math.max(...zs) + pad];
};
function BladeShape({ ring, box }) {
  const [y0, z0, y1, z1] = box;
  return (
    <svg
      className="cad-blade-shape"
      viewBox={`${fmt(y0)} ${fmt(-z1)} ${fmt(y1 - y0)} ${fmt(z1 - z0)}`}
      preserveAspectRatio="xMidYMax meet"
      aria-hidden="true"
      focusable="false"
    >
      <path d={`M ${ring.map(([y, z]) => `${fmt(y)} ${fmt(-z)}`).join(' L ')} Z`} />
    </svg>
  );
}
const punchRing = (punch, reverse = false) => punchSection(punch, reverse);
const PUNCH_BOX = boxOf(Object.values(PUNCHES).map((p) => punchRing(p)));
const DIE_BOX = boxOf(Object.values(DIES).map((d) => dieSection(d)));
// The one fact on the Blades row, and the numbers on a picker card.
const punchFact = (punch) => (punch.round ? `nose R${punch.radius}` : `tip R${punch.radius}`);
const punchNumbers = (punch) =>
  [punch.angle != null ? `${punch.angle}°` : null, punchFact(punch), `H ${punch.height}`, `${punch.load} kN/m`]
    .filter(Boolean)
    .join(' · ');
const dieNumbers = (die) => `V ${die.v} · ${die.angle}° · shoulder R${die.shoulderRadius} · ${die.load} kN/m`;
// What the pending hit would say with this tool: clears, or its first refusal
// (the fact, not the remedy). One rule with the grip's chips (brakeHands.js).
const verdictOf = hitVerdict;

/**
 * The picker (§4.1): every punch or die as a card at one common scale, its
 * numbers, what it is for and, with a hit pending, whether this hit clears
 * with it (`options`: brakeStation.js bladeOptions). A refused tool stays
 * choosable. `onChoose(patch)`: the session patch the selects apply too.
 */
function BladePicker({ kind, session, auto, options, onChoose, onClose }) {
  const verdicts = new Map((options || NONE).map((o) => [o.key, verdictOf(o)]));
  const punchCard = (p) => ({
    key: p.key,
    name: p.name,
    ring: punchRing(p),
    numbers: punchNumbers(p),
    use: p.use,
    chosen: session.punch === p.key,
    patch: punchChoice(session, p.key),
  });
  // The punches in their two groups, the shop's own first (docs/sketch-studio-shop-punches.md §5.2).
  const groups =
    kind === 'punch'
      ? PUNCH_GROUPS.map((g) => ({ name: g.name, cards: g.keys.map((key) => punchCard(PUNCHES[key])) }))
      : [
          {
            name: null,
            cards: [
              {
                key: null,
                name: `Automatic (${auto.die.name})`,
                ring: dieSection(auto.die),
                numbers: dieNumbers(auto.die),
                use: 'Chosen for you: the narrowest V the sheet thickness (or a radius punch) asks for.',
                chosen: !session.die,
                patch: { die: null },
              },
              ...Object.values(DIES).map((d) => ({
                key: d.key,
                name: d.name,
                ring: dieSection(d),
                numbers: dieNumbers(d),
                use: d.use,
                chosen: session.die === d.key,
                patch: { die: d.key },
              })),
            ],
          },
        ];
  const title = kind === 'punch' ? 'Choose the punch' : 'Choose the die';
  return (
    <section className="cad-blade-picker" aria-label={kind === 'punch' ? 'Punches' : 'Dies'}>
      <header>
        <h4>{title}</h4>
        <button type="button" onClick={onClose}>
          Close
        </button>
      </header>
      {!options && <p className="cad-help">Pick the punch line and each card says whether this hit clears with it.</p>}
      {groups.map((group) => (
        <BladeGroup key={group.name || 'all'} name={group.name}>
          <ul className="cad-blade-cards" aria-label={group.name || undefined}>
            {group.cards.map((card) => {
              const verdict = verdicts.get(card.key);
              return (
                <li key={card.key ?? 'auto'}>
                  <button
                    type="button"
                    className="cad-blade-card"
                    aria-label={card.name}
                    aria-pressed={card.chosen}
                    onClick={() => onChoose(card.patch)}
                  >
                    <BladeShape ring={card.ring} box={kind === 'punch' ? PUNCH_BOX : DIE_BOX} />
                    <span className="cad-blade-card-text">
                      <strong>
                        {card.name}
                        {card.chosen ? <small className="cad-blade-in-use"> · in use</small> : null}
                      </strong>
                      <small>{card.numbers}</small>
                      <span className="cad-blade-use">{card.use}</span>
                      {verdict && (
                        <span className={`cad-blade-verdict ${verdict.ok ? 'is-ok' : 'is-refused'}`}>
                          {verdict.ok ? verdict.text : `Refused: ${verdict.text}`}
                        </span>
                      )}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </BladeGroup>
      ))}
    </section>
  );
}
// A group of the picker's cards under its heading (§5.2), or the cards alone.
function BladeGroup({ name, children }) {
  if (!name) return children;
  return (
    <div className="cad-blade-group">
      <h5>{name}</h5>
      {children}
    </div>
  );
}

const exactTrim = (value) => Math.round(value * 1e6) / 1e6;
/**
 * The take-off note (docs/sketch-studio-shop-punches.md §5.3) for a pending
 * hit that clears with the part drawn off the punch along a slant (an
 * offset's: either of its hits), or null.
 */
function takeOffNote(pending) {
  const slants = pending?.pair ? pending.pair.map((h) => h?.collision?.takeOff) : [pending?.collision?.takeOff];
  const slant = slants.find((s) => s != null && s !== 0);
  if (slant == null) return null;
  return `Comes off the punch toward ${slant < 0 ? 'you' : 'the backgauge'}: the part is drawn off along the nose as the ram lifts.`;
}
/**
 * A blade's length (docs/sketch-studio-brake-tool-length.md §3.4), one line
 * under its button, always in view: with one tooling run, `Length [391.8] mm`
 * (typing a length sets the trim per end, (fitted − length) / 2, kept on the
 * bed; emptying it or Fit to bend goes back to fitted) and what it is
 * against the bend; with several, `Shorter [0] mm` over `at each end · 2
 * sections`, the trim itself (the column is too narrow for the words on one
 * line). `tooling`: the pending hit's (brakeStation.js
 * `pending.tooling`), null with no line picked. The note and Fit to bend keep
 * their place, so the row never moves. `hold` (brake tool length §9.4): the
 * length the tool is held at; with no line picked the field shows it, "kept
 * for the next bend".
 */
// A tool's end as the Length note says it (docs/sketch-studio-sheet-slide.md §4): mm short of it,
// past it, or flush, in the words of "short at each end" and short enough for a line of the
// punch's column. `value`: toolEnds' (positive short).
const endWords = (value, side) =>
  value > 0.05
    ? `${fmt(value, 1)} mm short at the ${side}`
    : value < -0.05
      ? `${fmt(-value, 1)} mm past the ${side}`
      : `flush at the ${side}`;
function BladeLength({ kind, tooling, trim, hold = null, bed, disabled, onTrim, ends = null }) {
  const label = kind === 'punch' ? 'Punch length' : 'Die length';
  const Kind = kind === 'punch' ? 'Punch' : 'Die';
  const fitted = tooling?.fitted || null;
  const t = Number(trim) || 0;
  const several = Boolean(fitted) && fitted.length > 1;
  const span = fitted && !several ? fitted[0][1] - fitted[0][0] : null;
  const custom = Boolean(fitted) && t !== 0;
  // Several runs: the field is the trim itself, "Shorter [5] mm" over "at each end · 2 sections".
  const held = !fitted && Number.isFinite(hold) ? hold : null;
  // The sheet slid (sheet slide §4): the ends differ, so each is said, the operator's left first.
  const perEnd = Boolean(fitted) && !several && ends && Math.abs(ends.left - ends.right) >= 0.05;
  const note = !fitted
    ? held != null
      ? 'kept for the next bend'
      : 'fitted to the bend'
    : perEnd
      ? `${endWords(ends.left, 'left')}, ${endWords(ends.right, 'right')}`
      : several
        ? `at each end · ${fitted.length} sections${t ? (t < 0 ? ', past the bend' : '') : ', fitted'}`
        : !t
          ? 'fitted'
          : `${fmt(Math.abs(t), 1)} mm ${t > 0 ? 'short at' : 'past'} each end`;
  const commit = (value) => {
    if (value == null) return onTrim(null);
    if (several) return onTrim(value ? exactTrim(value) : null);
    // A length on the bed: a longer tool runs past the bend's ends, at most the bed's length.
    const length = Math.max(0, Math.min(value, bed || Infinity));
    const next = exactTrim((span - length) / 2);
    // The bend's own length typed (piece pick §5.2): fitted here, and that length held (the
    // punch stays in the machine when more pieces join the hit); Fit to bend and an empty box hold none.
    return Math.abs(next) < 1e-6 ? onTrim(null, length > 0 ? length : undefined) : onTrim(next);
  };
  return (
    <div className={`cad-blade-length is-${kind}`} role="group" aria-label={`${Kind} length setting`}>
      <label className="cad-blade-length-field">
        {several ? 'Shorter' : 'Length'}
        <NumericInput
          aria-label={label}
          step="5"
          allowEmpty
          disabled={disabled || !fitted}
          placeholder="fitted"
          value={
            fitted ? (several ? t : Number((span - 2 * t).toFixed(1))) : held != null ? Number(held.toFixed(1)) : ''
          }
          onCommit={commit}
        />
        mm
      </label>
      {/* Per end (the sheet slid): an end a line, each read whole; the punch's block keeps the room for both. */}
      <small
        className={`cad-blade-length-note${perEnd ? ' is-ends' : ''}`}
        aria-label={`${Kind} length note`}
        title={note}
      >
        {perEnd ? (
          <>
            <span>{endWords(ends.left, 'left')}, </span>
            <span>{endWords(ends.right, 'right')}</span>
          </>
        ) : (
          note
        )}
      </small>
      <button
        type="button"
        className={`cad-blade-fit${custom ? '' : ' is-idle'}`}
        aria-label={`Fit the ${kind} to the bend`}
        aria-hidden={custom ? undefined : true}
        tabIndex={custom ? undefined : -1}
        disabled={disabled || !custom}
        title={`The ${kind} set up over the bend's own length`}
        onClick={() => onTrim(null)}
      >
        Fit to bend
      </button>
    </div>
  );
}

/**
 * The sheet slid under the punch (docs/sketch-studio-sheet-slide.md §6.2), one
 * line under the punch's length: `Slide [9] mm · to the right`, the sheet's
 * move along the bed as the operator sees it (positive to the right: the
 * station's `tooling.right` turns it into the session's slide along its line),
 * and Centre when it is not 0 (kept in place, out of reach, when centred: the
 * row never moves). Disabled with no line, and on an offset bend (`offset`),
 * whose pair is made centred.
 */
function SheetSlide({ tooling, slide, offset = false, disabled, onSession }) {
  const right = tooling?.right ?? null;
  const value = right == null ? 0 : right * (Number(slide) || 0);
  const off = right != null && Math.abs(value) > 1e-9;
  const note = offset ? 'an offset stays centred' : !off ? 'centred' : `to the ${value > 0 ? 'right' : 'left'}`;
  return (
    <div className="cad-blade-length cad-sheet-slide" role="group" aria-label="Sheet slide setting">
      <label className="cad-blade-length-field">
        Slide
        <NumericInput
          aria-label="Sheet slide (mm)"
          step="1"
          disabled={disabled || right == null}
          value={right == null ? '' : Number(value.toFixed(1)) || 0}
          onCommit={(v) => onSession({ slide: right * (Number(v) || 0), scrub: null })}
        />
        mm
      </label>
      <small className="cad-blade-length-note" aria-label="Sheet slide note">
        {note}
      </small>
      <button
        type="button"
        className={`cad-slide-centre${off ? '' : ' is-idle'}`}
        aria-hidden={off ? undefined : true}
        tabIndex={off ? undefined : -1}
        disabled={disabled || !off}
        title="The sheet back under the middle of the punch"
        onClick={() => onSession({ slide: 0, scrub: null })}
      >
        Centre
      </button>
    </div>
  );
}

/**
 * The pieces on the line (docs/sketch-studio-piece-pick.md §5.5), shown only
 * when the line crosses more than one: a chip per piece, pressed while it is
 * in the hit (`1 · 82 mm`, a made one `· bent 90°`); a chip is a checkbox, so
 * its click puts that piece in or leaves it flat with no modifier
 * (brakeStation.js pieceChoice, `add`). Every piece when a piece is left flat
 * that the line's default (pieceDefault) has in; it keeps its place hidden
 * otherwise, so the row does not grow under the pointer. Pointing at or
 * focusing a chip names the piece (`onHover(index | null)`).
 */
function PiecesRow({ station, session, onSession, onHover = null }) {
  const pieces = station.segments || NONE;
  const fallback = pieceDefault(station);
  const every = pieces.some((p) => p.skipped && !fallback.includes(p.index));
  const hover = useRef(onHover);
  useEffect(() => {
    hover.current = onHover;
  }, [onHover]);
  // The row going (a line of one piece, the station closed) lets go of the piece it named.
  const named = useRef(false);
  useEffect(() => () => named.current && hover.current?.(null), []);
  const name = (index) => {
    named.current = index != null;
    hover.current?.(index);
  };
  const pick = (index) => {
    const skip = pieceChoice(pieces.length, session.skip || NONE, index, {
      add: true,
      together: piecesTogether(pieces),
    });
    if (skip) onSession({ skip, scrub: null });
  };
  return (
    <div className="cad-brake-pieces" role="group" aria-label="Pieces on the line">
      <div className="cad-brake-chips">
        {pieces.map((p) => (
          <button
            key={p.index}
            type="button"
            className="cad-brake-chip"
            aria-pressed={!p.skipped}
            title={`Piece ${p.index + 1} of ${pieces.length}: ${p.skipped ? 'left flat · click to put it in the hit' : 'in the hit · click to leave it flat'}`}
            onClick={() => pick(p.index)}
            onPointerEnter={() => name(p.index)}
            onPointerLeave={() => name(null)}
            onFocus={() => name(p.index)}
            onBlur={() => name(null)}
          >
            {p.index + 1} · {fmt(p.s1 - p.s0, 1)} mm{p.made != null ? ` · bent ${fmt(p.made, 1)}°` : ''}
          </button>
        ))}
        <button
          type="button"
          className={`cad-brake-chip is-every${every ? '' : ' is-idle'}`}
          aria-hidden={every ? undefined : true}
          tabIndex={every ? undefined : -1}
          disabled={!every}
          title="Every piece back in the hit (a piece already bent stays flat beside unbent ones)"
          onClick={() => onSession({ skip: fallback, scrub: null })}
        >
          Every piece
        </button>
      </div>
      <p className="cad-help cad-brake-hint">
        Click a piece on the sheet to bend only it. The sheet comes to the punch; the punch and die keep their lengths.
      </p>
    </div>
  );
}

/**
 * Horn sections at the ends (docs/sketch-studio-punch-library.md §4.4), under
 * the punch's length: a checkbox (off and disabled with a radius punch, which
 * has none) and, on, what they are for and their rating, half the punch's.
 * Horn lengths (§4.8): with the box on, the Horn length select beside it;
 * ticking the box chooses the standard. `horns`: the session's value.
 */
const hornOption = (horn) =>
  `${horn.reach} mm · ${horn.tip} high${horn === HORNS[20] ? ' (standard)' : /^Special/.test(horn.name) ? ' (special)' : ''}`;
function HornSections({ punch, horns, disabled, onSession }) {
  const round = Boolean(punch.round);
  const horn = round ? null : hornOf(horns);
  const checked = Boolean(horn);
  return (
    <div className="cad-blade-horns">
      <label className="cad-check" title={round ? 'A radius punch has no horn sections' : undefined}>
        <input
          type="checkbox"
          aria-label="Horn sections at the ends"
          checked={checked}
          disabled={disabled || round}
          onChange={(e) => onSession({ horns: e.target.checked, scrub: null })}
        />
        Horn sections at the ends
      </label>
      {checked && (
        <select
          aria-label="Horn length"
          value={horn.reach}
          disabled={disabled}
          onChange={(e) => onSession({ horns: hornSetting(HORNS[e.target.value]), scrub: null })}
        >
          {HORN_KEYS.map((key) => (
            <option key={key} value={key}>
              {hornOption(HORNS[key])}
            </option>
          ))}
        </select>
      )}
      {checked && (
        <small className="cad-help" role="note" aria-label="Horn sections">
          The tip runs {horn.reach} mm past the punch body at each end, {horn.tip} mm high: it reaches under a lip. Half
          the punch&apos;s load ({fmt(punch.load * horn.load)} kN/m).
        </small>
      )}
    </div>
  );
}

/**
 * The Blades row (§4.1), always in view: the punch (top) and the die (bottom)
 * with their silhouettes, a click opens the picker, each with its length
 * under it (brake tool length §3.4); Reverse punch (§4.2) for a punch that is
 * not its own mirror image. The open picker (`picker`: 'punch' | 'die' |
 * null, `onPicker`) is held above it, so a click on a blade in the 3D view
 * can open it (hands on the sheet §6.3).
 */
function Blades({ session, auto, bladeOptions, disabled, onSession, tooling = null, bed = null, picker, onPicker }) {
  const setPicker = onPicker;
  const punch = PUNCHES[session.punch] || PUNCHES[DEFAULT_PUNCH];
  const die = session.die ? DIES[session.die] : auto.die;
  const reversible = !punchSymmetric(punch);
  const reversed = reversible && Boolean(session.reverse);
  const options = useMemo(() => (picker && bladeOptions ? bladeOptions(picker) : null), [picker, bladeOptions]);
  const toggle = (kind) => setPicker(picker === kind ? null : kind);
  return (
    <div className="cad-blades" role="group" aria-label="Blades">
      <div className="cad-blades-row">
        <div className="cad-blade-column">
          <button
            type="button"
            className="cad-blade"
            aria-expanded={picker === 'punch'}
            disabled={disabled}
            onClick={() => toggle('punch')}
          >
            <BladeShape ring={punchRing(punch, reversed)} box={boxOf([punchRing(punch)])} />
            <span className="cad-blade-text">
              <small>Top: punch</small>
              <strong>{punch.name}</strong>
              <small>
                {punchFact(punch)}
                {reversed ? ' · reversed' : ''}
              </small>
            </span>
          </button>
          <BladeLength
            kind="punch"
            tooling={tooling}
            trim={session.punchTrim}
            hold={session.punchHold ?? null}
            bed={bed}
            disabled={disabled}
            onTrim={(punchTrim, punchHold) =>
              onSession({ punchTrim, ...(punchHold !== undefined ? { punchHold } : {}), scrub: null })
            }
            ends={tooling?.slide ? toolEnds(tooling, tooling.sign) : null}
          />
          <SheetSlide
            tooling={tooling}
            slide={session.slide}
            offset={Boolean(tooling) && tooling.right == null && session.shape === 'offset'}
            disabled={disabled}
            onSession={onSession}
          />
          <HornSections punch={punch} horns={session.horns} disabled={disabled} onSession={onSession} />
        </div>
        <div className="cad-blade-column">
          <button
            type="button"
            className="cad-blade"
            aria-expanded={picker === 'die'}
            disabled={disabled}
            onClick={() => toggle('die')}
          >
            <BladeShape ring={dieSection(die)} box={boxOf([dieSection(die)])} />
            <span className="cad-blade-text">
              <small>Bottom: die</small>
              <strong>{die.name}</strong>
              <small>
                V {die.v} mm{session.die ? '' : ' (automatic)'}
              </small>
            </span>
          </button>
          <BladeLength
            kind="die"
            tooling={tooling}
            trim={session.dieTrim}
            hold={session.dieHold ?? null}
            bed={bed}
            disabled={disabled}
            onTrim={(dieTrim, dieHold) =>
              onSession({ dieTrim, ...(dieHold !== undefined ? { dieHold } : {}), scrub: null })
            }
          />
        </div>
      </div>
      {reversible && (
        <label className="cad-check cad-blade-reverse">
          <input
            type="checkbox"
            aria-label="Reverse punch"
            checked={reversed}
            disabled={disabled}
            onChange={(e) => onSession({ reverse: e.target.checked, scrub: null })}
          />
          Reverse punch (throat to the backgauge)
        </label>
      )}
      {picker && !disabled && (
        <BladePicker
          kind={picker}
          session={session}
          auto={auto}
          options={options}
          onChoose={(patch) => {
            onSession({ ...patch, scrub: null });
            setPicker(null);
          }}
          onClose={() => setPicker(null)}
        />
      )}
    </div>
  );
}

/**
 * Flip sheet (docs/sketch-studio-brake-flip-tooling.md §5.1): `session.flip`
 * as a two-state control, This side up · Flipped over (the machine always
 * bends up, so a bend down is made with the sheet turned over). One
 * checkbox (a switch) under the whole control, labelled "Flip sheet".
 */
function FlipControl({ flip, onChange, disabled = false }) {
  return (
    <label
      className="cad-flip"
      title="Flip sheet: the machine always bends up, so a bend down is made with the sheet turned over"
    >
      <input
        type="checkbox"
        role="switch"
        aria-label="Flip sheet"
        checked={flip}
        disabled={disabled}
        onChange={onChange}
      />
      <span className={`cad-flip-side${flip ? '' : ' is-on'}`}>This side up</span>
      <span className={`cad-flip-side${flip ? ' is-on' : ''}`}>Flipped over</span>
    </label>
  );
}

const leaveButton = (onClick, disabled = false, label = 'Leave press brake') => (
  <button type="button" className="cad-shell-leave" disabled={disabled} onClick={onClick}>
    {label}
  </button>
);

// The hits made on a part, read only: its folded size and one row per stroke.
function HitsMade({ fold, strokes }) {
  return (
    <>
      <h4>Hits made on this part</h4>
      <p className="cad-part-size" aria-label="Folded size">
        {(() => {
          const [min, max] = foldedBounds(fold);
          return `Folded ${min.map((v, i) => fmt(max[i] - v)).join(' × ')} mm (X × Y × Z, part coordinates)`;
        })()}
      </p>
      <ol className="cad-brake-sequence" aria-label="Hits made">
        {strokes.map((stroke, index) => {
          return (
            <li key={stroke.key} aria-label={`Hit ${index + 1}`}>
              <div className="cad-brake-step">
                <strong>
                  {index + 1} · {stepText(fold, stroke)}
                </strong>
                <small>{toolingLine(stroke, stroke.die, lengthsOf(fold, stroke))}</small>
              </div>
            </li>
          );
        })}
      </ol>
    </>
  );
}

/** Shop → Press brake refused by the shop order (brakeStation.js shopOrderBlock), with its one-click remedy. */
// `fold`: the part's fold (sheetMetal.js foldSheet), when it reads: what the
// brake made on it stays on show under the refusal, read only. A part whose
// hits are made and that has gone on down the route is not refused: it
// shows PressBrakeFinished instead (shop floor §8.1).
export function PressBrakeBlocked({ blocked, onRemove, onCancel, shell = null, fold = null }) {
  const strokes = fold ? hitSequence(fold) : NONE;
  return (
    <StationShell station="bend" region="Press brake" shell={shell} leave={leaveButton(onCancel, false, 'Cancel')}>
      <ProblemCard message={blocked.message} fix={{ label: blocked.remedy }} onFix={onRemove} />
      {strokes.length > 0 && <HitsMade fold={fold} strokes={strokes} />}
    </StationShell>
  );
}

// "powder-coated RAL 9005 Jet black and printed (1 print)".
function routeWords(here) {
  const done = [
    here.finish && `${here.finishKind === 'powder' ? 'powder-coated' : 'painted'} ${here.finish}`,
    here.prints && `printed (${plural(here.prints, 'print')})`,
  ].filter(Boolean);
  return done.length > 1 ? `${done.slice(0, -1).join(', ')} and ${done.at(-1)}` : done[0] || '';
}

/**
 * The press brake on a part that is finished here (shop floor §8.1, the SF-4
 * audit): every hit made and the part gone on down the route (painted or
 * printed). Not a refusal — the part is
 * simply past bending: what was made stays on show, Watch the bends replays
 * its strokes (the film, §8), and taking it back to bare metal stays one
 * click away as a second choice. `blocked`: shopOrderBlock (the part's records:
 * the blank's own, docs/sketch-studio-own-bends.md §4.5; every copy's in a
 * model that still has copies); `here`: brakeStation.js finishedHere (this
 * instance's own).
 */
export function PressBrakeFinished({ blocked, here, fold, onWatch, onRemove, onCancel, shell = null }) {
  const strokes = hitSequence(fold);
  const done = routeWords(here);
  // The records the remedy takes off, worded as its button is (shopOrderBlock).
  const list = [
    blocked.finishes.length &&
      (blocked.finishes.length === 1
        ? 'a paint finish'
        : plural(blocked.finishes.length, 'paint finish', 'paint finishes')),
    blocked.prints.length && plural(blocked.prints.length, 'print'),
  ].filter(Boolean);
  const records = list.length > 1 ? `${list.slice(0, -1).join(', ')} and ${list.at(-1)}` : list[0] || '';
  const times = ['', 'once', 'twice'][here.copies.length + 1] || `${here.copies.length + 1} times`;
  return (
    <StationShell
      station="bend"
      region="Press brake"
      shell={shell}
      className="cad-brake-finished"
      primary={<PrimaryButton onClick={onWatch}>Watch the bends</PrimaryButton>}
      leave={leaveButton(onCancel, false, 'Cancel')}
    >
      <div className="cad-shop-done" role="status" aria-label="Finished here">
        <strong>Bending is done on this part: {plural(hitsMade(fold, strokes), 'hit')} made.</strong>
        {done && <span> It has gone on down the route: {done}.</span>}
      </div>
      <HitsMade fold={fold} strokes={strokes} />
      <section className="cad-shop-again">
        <h4>Bend it again?</h4>
        <p className="cad-help" role="note" aria-label="Bend it again">
          {here.copies.length
            ? `Only bare metal goes back on the press brake, so bending it again means taking off what came after the brake. This part is one definition made ${times} (it is also the ${here.copies.map((n) => n.toLowerCase()).join(' and the ')}), so that is every copy's: ${records}.`
            : `Only bare metal goes back on the press brake, so bending it again means taking off what came after the brake: ${records}.`}
        </p>
        <button type="button" className="cad-shop-secondary" onClick={onRemove}>
          {blocked.remedy}
        </button>
      </section>
    </StationShell>
  );
}

/**
 * The NC panel. `station`: brakeStation(); `session`: the workspace's
 * brakeSession; `checks`: sequenceChecks() for the bends made; `problem`: the
 * last refused pedal or sequence edit; `shell`: the station shell's subject
 * and Back / Next; `bladeOptions(kind)`: the blade picker's cards for the
 * pending hit (brakeStation.js bladeOptions), or null. Callbacks change the
 * session (picks, and a refusal's one-field fix), the model (machine,
 * sequence) or run the pedal.
 */
export function PressBrakePanel({
  station,
  session,
  checks = NONE,
  problem = '',
  shell = null,
  bladeOptions = null,
  // Hands on the sheet HO-2 (§6.2, §6.3): the open blade picker held by the
  // workspace (none given: the panel's own), and a request from the 3D view
  // ({ target: 'distance' | 'punch' | 'die', token }) for that field or
  // picker to scroll into view and take focus; onFocused once it has.
  picker: pickerHeld,
  onPicker = null,
  focus = null,
  onFocused = null,
  onSession,
  onMachine,
  onBend,
  onLeave,
  onScrub,
  onRerun,
  onMove,
  onRemove,
  // Bend on (docs/sketch-studio-tight-bends.md §4.4): (step key) → the line set on that step's bends.
  onBendOn = null,
  // The brake finds the way (§5.2): a colliding row's remedies (brakeStation.js sequenceTries, by
  // step key) and onReorder(bends), the new order committed as a move of the made steps.
  rowTries = null,
  onReorder = null,
  // Flange gaps (docs/sketch-studio-corner-gaps.md §3.3): onGapHover(row | null), a row of the card hovered.
  onGapHover = null,
  // The pieces on the line (docs/sketch-studio-piece-pick.md §5.5): onPieceHover(index | null), a chip pointed at or focused.
  onPieceHover = null,
  // What the shop holds (§6.1, shopCatalog.js shopTolerance): each gap row's band on the bench; null: none.
  tolerance = null,
}) {
  const { values } = useContext(ParameterContext);
  const [pickerOwn, setPickerOwn] = useState(null);
  const picker = pickerHeld === undefined ? pickerOwn : pickerHeld;
  const fields = useRef(null);
  useEffect(() => {
    const root = fields.current;
    if (!focus || !root) return;
    const blades = root.querySelector('.cad-blades');
    // A field (L, or the sheet's slide: docs/sketch-studio-sheet-slide.md §6.1) or a blade's picker.
    const field =
      focus.target === 'distance' ? 'Backgauge L (mm)' : focus.target === 'slide' ? 'Sheet slide (mm)' : null;
    const target = field
      ? root.querySelector(`input[aria-label="${field}"]`)
      : root.querySelector('.cad-blade-picker .cad-blade-card[aria-pressed="true"]') ||
        root.querySelector('.cad-blade-picker .cad-blade-card');
    if (target) {
      (field ? target : blades || target).scrollIntoView?.({ block: 'nearest' });
      target.focus();
      if (field) target.select?.();
    }
    onFocused?.();
    // Once per request (its token).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [focus?.token]);
  const stroking = session.stage === 'stroke';
  const { pending, fold, feature, part } = station;
  // The part as made so far (every stored bend at its made angle: brakeStation's
  // fold, never the scrubbed or pending pose), read again only when the bends or
  // the blank change, not on every pick.
  const madeFold = useMemo(
    () => fold,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [feature, station.profile],
  );
  const t = fold.thickness;
  // A radius punch (round-bend spec §12.6) is Round · Radius punch: the punch is the one source of truth.
  const radiusPunch = PUNCHES[session.punch]?.round ? PUNCHES[session.punch] : null;
  const shape = radiusPunch ? 'round' : session.shape || 'sharp';
  const auto = suggestedDie(t, session.punch);
  // A typed value (number or =expression) for the session; anything else
  // changes nothing and the field shows the value in force again.
  const number = numberFor(values);
  const hit = pending && !pending.error ? pending : null;
  // An offset bend's pair (brake flip tooling §5.3): its spacing, web, both hits and the order chosen.
  const offset = hit?.offset || null;
  const lined = Boolean(station.edge) || (session.mode === 'points' && session.points.length === 2);
  const refusals = hit?.refusals || NONE;
  const collision = hit?.collision?.hit || null;
  const ready = Boolean(hit) && !refusals.length && !collision && !stroking;
  const readouts = hit?.readouts;
  const bends = fold.bends;
  // The sequence is per step (shop floor §6.1): one row per hit of the machine, a bend-on hit its own
  // (docs/sketch-studio-tight-bends.md §4.4).
  const strokes = hitSequence(fold);
  // A made bend's line (§4.4): this hit bends it on.
  const again = pending?.again || null;
  // The line seated on a made bend (tight bends §7.3), and the way on from a line that did not (§7.4 (c)).
  const seated = session.seated || null;
  const seat = onBendOn && pending?.seat ? pending.seat : null;
  const seatButton = seat ? (
    <button
      type="button"
      className="cad-problem-fix"
      title={`Set the punch line on bend ${seat.number}, to bend it further`}
      disabled={stroking}
      onClick={() => onBendOn(seat.key)}
    >
      {seat.label}
    </button>
  ) : null;
  // An armed try (tight bends §5.2), as the station resolved it.
  const armed = pending && !pending.error ? pending.armed || null : null;
  const tabs = hit?.members?.length || 1;
  // One rule with the backgauge's readout in the 3D view (brakeHands.js legsText).
  const legsOf = (key) => `${legsText(readouts, key) ?? '—'} mm`;
  return (
    <StationShell
      station="bend"
      region="Press brake"
      shell={shell && { ...shell, disabled: shell.disabled || stroking }}
      leave={leaveButton(onLeave, stroking)}
      primary={
        <PrimaryButton
          disabled={!ready}
          onClick={onBend}
          title={
            offset
              ? 'The pedal: Enter or Space. Both hits, the sheet turned over between them'
              : 'The pedal: Enter or Space'
          }
        >
          {stroking ? 'Bending…' : 'Bend'}
        </PrimaryButton>
      }
      className="cad-brake"
    >
      <ol className="cad-mate-steps">
        <li className={!pending ? 'is-current' : ''}>
          Pick the gauge edge on the sheet or on the flat blank (or two points for the punch line).
        </li>
        <li className={pending && !ready ? 'is-current' : ''}>Set L, the angle and the tooling.</li>
        <li className={ready ? 'is-current' : ''}>Bend: the pedal is Bend, Enter or Space.</li>
      </ol>
      <p className="cad-part-size" aria-label="On the brake">
        {part.name} · t {fmt(t)} {stockOf(fold.stock).name} · blank {fmt(fold.flat.width)} × {fmt(fold.flat.height)} mm
      </p>
      <fieldset ref={fields} className="cad-profile-fields" disabled={stroking}>
        <Segmented
          label="Punch line"
          options={[
            ['gauge', 'Backgauge edge'],
            ['points', 'Two points'],
          ]}
          value={session.mode}
          onChange={(mode) => onSession({ mode, scrub: null })}
        />
        {session.mode === 'gauge' ? (
          <>
            <dl className="cad-brake-readouts is-single">
              <Readout label="Gauge edge">
                {station.edge
                  ? `Edge ${station.edge.index + 1} · ${fmt(station.edge.length)} mm`
                  : 'Click a straight outline edge on the flat blank'}
              </Readout>
            </dl>
            {station.edge && (station.stops || NONE).length > 0 && (
              // Gauging off a flange (docs/sketch-studio-skin-gauge.md §4.6): what L is read from,
              // only while the edge has made bends in front of it. The L stays, the line moves.
              <label className="cad-field">
                Gauge off
                <select
                  aria-label="Gauge off"
                  value={session.stopHold ?? 'auto'}
                  title="What the backgauge fingers stop on: the blank's edge, or the outside face of a flange already bent"
                  onChange={(e) =>
                    onSession({
                      stopHold: e.target.value === 'auto' ? null : e.target.value,
                      distance: session.distance,
                      scrub: null,
                    })
                  }
                >
                  <option value="auto">Automatic</option>
                  <option value="edge">The edge</option>
                  {station.stops.map((s) => (
                    <option key={s.bendId} value={s.bendId}>
                      Bend {s.number}&apos;s flange
                    </option>
                  ))}
                </select>
              </label>
            )}
            <ValueField
              key={`distance-${session.edge}`}
              label="Backgauge L (mm)"
              value={session.distance}
              onChange={number((distance) => onSession({ distance, scrub: null }))}
            />
            {station.gaugeHint && (
              // The same L would also make a line off a flange (§4.6): said, with the one click that does it.
              <p className="cad-help cad-brake-hint" role="note" aria-label="Gauge off a flange">
                {station.gaugeHint.words}{' '}
                <button
                  type="button"
                  className="cad-problem-fix"
                  title={`L ${fmt(station.gaugeHint.L)} from the outside face of bend ${station.gaugeHint.number}'s flange`}
                  onClick={() =>
                    onSession({ stopHold: station.gaugeHint.bendId, distance: station.gaugeHint.L, scrub: null })
                  }
                >
                  {station.gaugeHint.label}
                </button>
              </p>
            )}
          </>
        ) : (
          <>
            <p className="cad-help">
              Click two points on the flat blank: corners and edge midpoints snap. Or type them.
            </p>
            {[0, 1].map((index) => (
              <div className="cad-inline" key={index} role="group" aria-label={`Point ${index ? 'B' : 'A'}`}>
                {[0, 1].map((axis) => {
                  const label = `${index ? 'B' : 'A'} ${axis ? 'Y' : 'X'} (mm)`;
                  return (
                    <label className="cad-field" key={axis}>
                      {label}
                      <NumericInput
                        aria-label={label}
                        step="1"
                        value={session.points[index]?.[axis] ?? ''}
                        onCommit={(v) => {
                          const points = [0, 1].map((i) => [...(session.points[i] || [0, 0])]);
                          points[index][axis] = v;
                          onSession({ points, scrub: null });
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            ))}
          </>
        )}
        <div className="cad-inline cad-brake-turn">
          <button
            type="button"
            className="cad-shop-secondary"
            disabled={!lined}
            title="The other side of the punch line to the backgauge: the same line, gauged from the opposite edge"
            onClick={() => onSession({ ...turnAround(station, session), scrub: null })}
          >
            Turn sheet around
          </button>
          {session.turned && (
            <small role="note" aria-label="Turned around">
              Turned around: the other side to the backgauge.
            </small>
          )}
        </div>
        {(feature.marks || []).length > 0 && !pending && (
          <p className="cad-help cad-brake-hint">
            The laser etched {plural(feature.marks.length, 'bend line')} on this blank: click one on the flat blank and
            the punch line goes on it{feature.marks.some((m) => m.bend) ? ', with its angle and side' : ''}.
          </p>
        )}
        {(station.segments || NONE).length > 1 && (
          <PiecesRow station={station} session={session} onSession={onSession} onHover={onPieceHover} />
        )}
        {again && (
          <p className="cad-help cad-brake-hint" role="note" aria-label="Bend on">
            This is bend {again.number}&apos;s line: it stands at {fmtAngle(again.from)}. This hit bends it on.
          </p>
        )}
        {again && seated?.number === again.number && (
          // A bent line seats itself in the die (tight bends §7.3): where the line was set, and why it moved.
          <p className="cad-help cad-brake-hint" role="note" aria-label="Seated on the bend">
            {seated.from != null ? `L ${fmt(seated.from)} is` : 'The line you set is'} {fmt(seated.off)} mm from bend{' '}
            {again.number}&apos;s line. A bent line seats itself in the die, so the line is on bend {again.number}.
          </p>
        )}
        <div className="cad-inline cad-brake-angle">
          <ValueField
            // A bend bent on (tight bends §4.4): the angle after the hit, as the brake's setting reads.
            label={again ? 'Bend on to (°)' : 'Bend angle (°)'}
            value={session.angle}
            onChange={number((angle) => onSession({ angle, scrub: null }))}
          />
          <FlipControl
            flip={session.flip}
            disabled={Boolean(again)}
            onChange={(e) => onSession({ flip: e.target.checked, scrub: null })}
          />
        </div>
        {again && (
          <small className="cad-brake-on-note" role="note" aria-label="Bend on note">
            now {fmtAngle(again.from)} · this hit adds {fmtAngle(Math.max(0, again.to - again.from))}
          </small>
        )}
        <Segmented
          label="Bend shape"
          // A bend bent on keeps its own side and shape (§4.4).
          disabled={Boolean(again)}
          options={[
            ['sharp', 'Sharp'],
            ['round', 'Round'],
            ['offset', 'Offset'],
          ]}
          value={shape}
          // Sharp and Offset put the straight punch back (§12.6; an offset is two sharp bends).
          onChange={(next) =>
            onSession({
              shape: next,
              ...(next !== 'round' && radiusPunch ? { punch: DEFAULT_PUNCH, die: null } : {}),
              scrub: null,
            })
          }
        />
        {shape === 'offset' && (
          // The offset bend (brake flip tooling §5.3): two bends of the angle above, one each way.
          <>
            <ValueField
              label="Offset (mm)"
              value={session.offset}
              onChange={number((offset) => onSession({ offset, scrub: null }))}
            />
            <p className="cad-help">
              The step between the two faces. Flip sheet says which way it goes; Bend makes both hits, the sheet turned
              over between them.
            </p>
          </>
        )}
        {shape === 'round' && (
          // Made by (§12.6): bump hits (RB-1) or one hit of a radius punch.
          <Segmented
            label="Made by"
            options={[
              ['bump', 'Bump hits'],
              ['punch', 'Radius punch'],
            ]}
            value={radiusPunch ? 'punch' : 'bump'}
            onChange={(made) => {
              if ((made === 'punch') === Boolean(radiusPunch)) return;
              onSession(
                made === 'punch'
                  ? { punch: nearestRadiusPunch(session.radius).key, die: null, scrub: null }
                  : { punch: DEFAULT_PUNCH, die: null, radius: radiusPunch.radius, steps: null, scrub: null },
              );
            }}
          />
        )}
        {shape === 'round' && radiusPunch && (
          // One hit of the radius punch: its nose is the inside radius, the die automatic (§12.3).
          <label className="cad-field">
            Radius punch
            <select
              aria-label="Radius punch"
              value={session.punch}
              onChange={(e) => onSession({ punch: e.target.value, scrub: null })}
            >
              {RADIUS_PUNCHES.map((p) => (
                <option key={p.key} value={p.key}>
                  {p.name}
                </option>
              ))}
            </select>
          </label>
        )}
        {shape === 'round' && !radiusPunch && (
          // A round bend (docs/sketch-studio-round-bend.md §6): made by bump bending, hit by hit.
          <div className="cad-inline">
            <ValueField
              label="Inside radius (mm)"
              value={session.radius}
              onChange={number((radius) => onSession({ radius, scrub: null }))}
            />
            <label className="cad-field">
              Hits
              <NumericInput
                aria-label="Hits"
                step="1"
                min="2"
                allowEmpty
                placeholder={station.autoSteps != null ? String(station.autoSteps) : 'automatic'}
                title="Empty: automatic (the pitch half the die opening)"
                value={session.steps ?? ''}
                onCommit={(steps) => onSession({ steps, scrub: null })}
              />
            </label>
          </div>
        )}
        <Blades
          session={session}
          auto={auto}
          bladeOptions={bladeOptions}
          disabled={stroking}
          onSession={onSession}
          tooling={hit?.tooling || null}
          bed={station.machine.bed}
          picker={picker}
          onPicker={onPicker || setPickerOwn}
        />
        <details className="cad-shop-tooling">
          <summary>
            Machine and tooling
            <small>
              {station.machine.name} · {PUNCHES[session.punch]?.name || session.punch} punch
              {session.reverse && PUNCHES[session.punch] && !punchSymmetric(PUNCHES[session.punch])
                ? ' (reversed)'
                : ''}{' '}
              · {session.die ? DIES[session.die]?.name : `${auto.die.name} (automatic)`} die
            </small>
          </summary>
          <label className="cad-field">
            Machine
            <select
              aria-label="Press brake machine"
              value={station.machineKnown ? station.machineKey : station.machine.key}
              disabled={stroking}
              onChange={(e) => onMachine(e.target.value)}
            >
              {MACHINE_KEYS.map((key) => (
                <option key={key} value={key}>
                  {MACHINES[key].name}
                </option>
              ))}
            </select>
          </label>
          {!station.machineKnown && (
            <p className="cad-help" role="note">
              The model names a press brake this shop does not have ({station.machineKey}); the {station.machine.name}{' '}
              is used.
            </p>
          )}
          <label className="cad-field">
            Punch
            <select
              aria-label="Punch"
              value={session.punch}
              // A radius punch here is Round · Radius punch (§12.6); between a radius punch and a straight one
              // the die goes back to automatic: brakeStation.js punchChoice, the rule the blade picker shares.
              onChange={(e) => onSession(punchChoice(session, e.target.value))}
            >
              {/* The two groups of the rack, the shop's own first (shop punches §5.2). */}
              {PUNCH_GROUPS.map((g) => (
                <optgroup key={g.rack} label={g.name}>
                  {g.keys.map((key) => (
                    <option key={key} value={key}>
                      {PUNCHES[key].name} · tip R{PUNCHES[key].radius} · {PUNCHES[key].load} kN/m
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </label>
          <label className="cad-field">
            Die
            <select
              aria-label="Die"
              value={session.die || ''}
              onChange={(e) => onSession({ die: e.target.value || null })}
            >
              <option value="">Automatic ({auto.die.name})</option>
              {Object.values(DIES).map((d) => (
                <option key={d.key} value={d.key}>
                  {d.name} · shoulder R{d.shoulderRadius} · {d.load} kN/m
                </option>
              ))}
            </select>
          </label>
        </details>
      </fieldset>
      {pending?.error && <ProblemCard message={pending.error}>{seatButton}</ProblemCard>}
      {refusals.map((r, i) => (
        <ProblemCard
          key={`${r.code}-${i}`}
          message={r.message}
          fix={r.fix}
          onFix={r.fix ? () => onSession({ ...r.fix.session, scrub: null }) : null}
        >
          {/* The made bend the line lies along, bent on instead (§7.4 (d)): on the first short-leg card. */}
          {r.code === 'short-leg' && refusals.findIndex((o) => o.code === 'short-leg') === i ? seatButton : null}
        </ProblemCard>
      ))}
      {collision && (
        // Advice that names a punch is a button when the hit clears with it (brake blades §4.3);
        // so is turning the sheet around, when the whole hit passes that way (§5.2).
        <ProblemCard
          label="Collision"
          message={collision.message}
          fix={hit.collision.fix || null}
          onFix={hit.collision.fix ? () => onSession({ ...hit.collision.fix.session, scrub: null }) : null}
        >
          {hit.collision.turn && (
            <button
              type="button"
              className="cad-problem-fix"
              title="Turned around (the other side to the backgauge) it clears"
              onClick={() => onSession({ ...hit.collision.turn.session, scrub: null })}
            >
              {hit.collision.turn.label}
            </button>
          )}
          {hit.collision.horn && (
            // Horn sections at the ends (docs/sketch-studio-punch-library.md §4.4): tried, the hit
            // clears with the corners pressed; before "Shorten the punch", which stays true.
            <button
              type="button"
              className="cad-problem-fix"
              title="Tried with horn sections, the hit clears: the corners are pressed"
              onClick={() => onSession({ ...hit.collision.horn.session, scrub: null })}
            >
              {hit.collision.horn.label}
            </button>
          )}
          {hit.collision.length && (
            // The punch or die fitted or shorter (brake tool length §3.5): tried, it clears.
            <button
              type="button"
              className="cad-problem-fix"
              title="Tried with the tool this long, the hit clears"
              onClick={() => onSession({ ...hit.collision.length.session, scrub: null })}
            >
              {hit.collision.length.label}
            </button>
          )}
          {[hit.collision.ways?.first, hit.collision.ways?.partway, hit.collision.ways?.compound]
            .filter(Boolean)
            .map((way) => (
              // The brake finds the way (docs/sketch-studio-tight-bends.md §5.2): tried armed, it
              // passes; one click arms it, the pedal makes it.
              <button
                key={way.label}
                type="button"
                className="cad-problem-fix"
                title="Tried in that order, every hit clears: the view then shows the sheet as it is at this hit"
                onClick={() => onSession({ ...way.session, scrub: null })}
              >
                {way.label}
              </button>
            ))}
        </ProblemCard>
      )}
      {armed && (
        // An armed try (§5.2): where this hit goes in, until the pedal, Esc, Cancel or a new line.
        <div className="cad-brake-armed" role="status" aria-label="Bend order">
          <p>{armedText(armed)}</p>
          <button
            type="button"
            className="cad-shop-secondary"
            disabled={stroking}
            onClick={() => onSession({ armed: null })}
          >
            Cancel
          </button>
        </div>
      )}
      {session.notice && !armed && (
        <p className="cad-help cad-brake-armed-done" role="status" aria-label={noticeName(session.notice)}>
          {session.notice}
        </p>
      )}
      {hit?.warnings.map((w, i) => (
        <ProblemCard
          key={`${w.code}-${i}`}
          tone="warning"
          message={w.message}
          fix={w.fix}
          onFix={w.fix ? () => onSession({ ...w.fix.session, scrub: null }) : null}
        />
      ))}
      {problem && <ProblemCard message={problem} />}
      {!readouts && bends.length > 0 && (
        // Between hits, what the brake has made so far stays on show.
        <dl className="cad-shop-results" aria-label="Part results">
          <Result label="Folded" title="X × Y × Z, part coordinates">
            {(() => {
              const [min, max] = foldedBounds(fold);
              return `${min.map((v, i) => fmt(max[i] - v)).join(' × ')} mm`;
            })()}
          </Result>
          <Result label="Hits made">{hitsMade(fold, strokes)}</Result>
        </dl>
      )}
      {offset && (
        // Before the pedal (§5.3): the spacing, the web, each hit's backgauge reading and check, the force.
        <>
          <dl className="cad-shop-results" aria-label="Offset results">
            <Result label="Spacing" title="Punch line to punch line, in the flat">
              {fmt(offset.spacing)} mm
            </Result>
            <Result label="Web" title="The flat between the two bend zones">
              {fmt(offset.web)} mm
            </Result>
            {offset.hits.filter(Boolean).map((row) => (
              <Result
                key={row.label}
                label={row.label}
                title={
                  row.problem ||
                  (row.around
                    ? 'Gauged off the opposite edge: the sheet turned around for this hit'
                    : row.reason || undefined)
                }
              >
                {row.line} {String(row.direction).toUpperCase()} ·{' '}
                {row.distance != null ? `L ${fmt(row.distance)}` : 'no gauge'}
                {row.around ? ' (turned)' : ''} · {row.ok ? 'clear' : 'refused'}
              </Result>
            ))}
            {readouts && (
              <Result label="Force">
                <TonnageBar force={readouts.tonnage} capacity={readouts.capacity} limit={readouts.toolingLimit} />
              </Result>
            )}
          </dl>
          {offset.note && (
            <p className="cad-help" role="status" aria-label="Offset order">
              {offset.note}
            </p>
          )}
        </>
      )}
      {readouts && !offset && (
        <dl className="cad-shop-results" aria-label="Hit results">
          {tabs > 1 && (
            <Result label="Tabs" title="Separate tabs on the punch line: one stroke bends them all">
              {tabs} in one stroke
            </Result>
          )}
          {readouts.hits > 1 && (
            <>
              <Result label="Hits" title="A round bend is made by bump bending: many small hits across its zone">
                {readouts.hits} hits · {fmt(readouts.stepAngle)}° each · every {fmt(readouts.pitch)} mm
              </Result>
              <Result
                label="Flats"
                title="How far each flat between two hits stands off the true curve. More hits make it smoother."
              >
                {fmt(readouts.flat)} mm high
              </Result>
            </>
          )}
          <Result label="Flange" title="The outside leg the hit raises">
            {legsOf('moving')}
          </Result>
          <Result label="Other leg" title="The outside leg left on the die side">
            {legsOf('fixed')}
          </Result>
          <Result label="Force">
            <TonnageBar force={readouts.tonnage} capacity={readouts.capacity} limit={readouts.toolingLimit} />
          </Result>
        </dl>
      )}
      {!collision && hit && !refusals.length && (
        <p className="cad-help" role="status" aria-label="Collision check">
          {offset
            ? 'Both hits clear: no part of the sheet meets the punch, ram, die, bed or itself.'
            : 'Clear through the stroke: no part of the sheet meets the punch, ram, die, bed or itself.'}
        </p>
      )}
      {!collision && hit && !refusals.length && takeOffNote(hit) && (
        // Taken off the punch along a slant (docs/sketch-studio-shop-punches.md §5.3).
        <p className="cad-help" role="note" aria-label="Take-off">
          {takeOffNote(hit)}
        </p>
      )}
      {readouts && (
        <MachineNumbers station="bend">
          <dl className="cad-brake-readouts" aria-label="Hit readouts">
            <Readout label="Inside radius">R{fmt(readouts.radius)} mm</Readout>
            <Readout label="Bend allowance">{fmt(readouts.allowance)} mm</Readout>
            <Readout label="Bend deduction">{fmt(readouts.deduction)} mm</Readout>
            <Readout label="Backgauge L" title={gaugeTitle(station) || undefined}>
              {gaugeWords(station, session, armed)}
            </Readout>
            {station.stop != null && station.flat != null && station.edge && (
              // Off a flange L is not the flat distance (skin gauge §4.7): where the line lies on the blank.
              <Readout label="Line on the flat blank">
                {fmt(station.flat)} mm from edge {station.edge.index + 1}
              </Readout>
            )}
            {readouts.hits > 1 && (
              <Readout label="Backgauge per hit" title="The first hit (farthest from the gauge edge) to the last">
                {readouts.gaugeFirst != null
                  ? `${fmt(readouts.gaugeFirst)} → ${fmt(readouts.gaugeLast)} mm`
                  : 'no straight gauge'}
              </Readout>
            )}
            <Readout label={readouts.hits > 1 ? 'Ram depth per hit' : 'Ram depth'}>{fmt(readouts.ramDepth)} mm</Readout>
            <Readout label="Springback">
              {fmt(readouts.springback, 1)}° · bends to {fmt(readouts.bendTo, 1)}°{readouts.hits > 1 ? ' per hit' : ''}
            </Readout>
          </dl>
        </MachineNumbers>
      )}
      <h4>Sequence, in the order made</h4>
      <p className="cad-part-size" aria-label="Folded size">
        {(() => {
          const [min, max] = foldedBounds(fold);
          return `Folded ${min.map((v, i) => fmt(max[i] - v)).join(' × ')} mm (X × Y × Z, part coordinates)`;
        })()}
      </p>
      <FlangeGaps
        fold={madeFold}
        profile={station.profile}
        params={values || NO_PARAMS}
        onHover={stroking ? null : onGapHover}
        // The sequence follows: the rows stay closed until asked for (or two flanges overlap).
        station="gaps-brake"
        openNear={false}
        // What the shop holds (corner gaps §6.1): the band, read only here.
        tolerance={tolerance}
      >
        {/* Read-only here (corner gaps §4.3): a gap is set on the outline, in the part's own panel. */}
        <p className="cad-help">To change a gap, set it in the part&apos;s Sheet metal panel.</p>
      </FlangeGaps>
      {!bends.length && <p className="cad-help">No hits yet: the part is the flat blank.</p>}
      <ol className="cad-brake-sequence" aria-label="Sequence">
        {strokes.map((stroke, index) => {
          const check = checks.find((c) => c.bendId === stroke.key);
          const failing = check && (check.refusals.length || check.collision);
          // The scrub names a step by its key (its first record), tight bends §4.4.
          const shown = Boolean(session.scrub) && stroke.recordIds.includes(session.scrub.bendId);
          // Bend on (§4.4): on a bend's last step, while it is sharp and under 180°.
          const members = stroke.bendIds.map((id) => bends.find((b) => b.id === id));
          const onward =
            onBendOn &&
            members.every((b) => b && !isRoundBend(b) && b.angle < 180 - 1e-9) &&
            !strokes.slice(index + 1).some((later) => later.bendIds.some((id) => stroke.bendIds.includes(id)));
          const number = bendNumber(fold, stroke.bendIds[0]);
          return (
            <li key={stroke.key} className={shown ? 'is-current' : ''} aria-label={`Step ${index + 1}`}>
              <div className="cad-brake-step">
                <strong>
                  {index + 1} · {stepText(fold, stroke)}
                </strong>
                <small>
                  {toolingLine(
                    stroke,
                    feature.bends.find((b) => b.id === stroke.key)?.die || stroke.die,
                    lengthsOf(fold, stroke, station.machine.bed),
                  )}
                </small>
                {check && (
                  <span className={`cad-brake-check ${failing ? 'is-failing' : ''}`}>{failing ? 'refused' : 'ok'}</span>
                )}
              </div>
              {failing && (
                <p className="cad-shop-error">
                  {check.collision ? check.collision.message : check.refusals[0].message}
                </p>
              )}
              {failing &&
                check.collision &&
                (rowTries?.[stroke.key]?.move || rowTries?.[stroke.key]?.partway || rowTries?.[stroke.key]?.punch) && (
                  // The stored sequence's remedies (tight bends §5.2): tried on the new order, committed as a move;
                  // or the step made with another punch (docs/sketch-studio-shop-punches.md §6.3).
                  <div className="cad-inline cad-brake-row-fix">
                    {[rowTries[stroke.key].move, rowTries[stroke.key].partway, rowTries[stroke.key].punch]
                      .filter(Boolean)
                      .map((way) => (
                        <button
                          key={way.label}
                          type="button"
                          className="cad-problem-fix"
                          disabled={stroking}
                          title={
                            way === rowTries[stroke.key].punch
                              ? 'Tried with that punch: this step clears and no other step is refused'
                              : 'Tried in that order: this step clears and no other step is refused'
                          }
                          onClick={() => onReorder?.(way.bends)}
                        >
                          {way.label}
                        </button>
                      ))}
                  </div>
                )}
              <div className="cad-inline">
                <span className="cad-segmented" role="group" aria-label={`Step ${index + 1} view`}>
                  <button
                    type="button"
                    aria-pressed={shown && !session.scrub.after}
                    disabled={stroking}
                    onClick={() => onScrub(stroke.key, false)}
                  >
                    Before
                  </button>
                  <button
                    type="button"
                    aria-pressed={shown && session.scrub.after}
                    disabled={stroking}
                    onClick={() => onScrub(stroke.key, true)}
                  >
                    After
                  </button>
                </span>
                <button type="button" disabled={stroking} onClick={() => onRerun(stroke.key)}>
                  Re-run
                </button>
                <button type="button" disabled={stroking || index === 0} onClick={() => onMove(stroke.key, -1)}>
                  Earlier
                </button>
                <button
                  type="button"
                  disabled={stroking || index === strokes.length - 1}
                  onClick={() => onMove(stroke.key, 1)}
                >
                  Later
                </button>
                <button
                  type="button"
                  className="cad-danger-inline"
                  disabled={stroking}
                  onClick={() => onRemove(stroke.key)}
                >
                  Remove
                </button>
                {onward && (
                  <button
                    type="button"
                    aria-label={`Bend ${number} on`}
                    title="Set the punch line on this bend, to bend it further"
                    disabled={stroking}
                    onClick={() => onBendOn(stroke.key)}
                  >
                    Bend on
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </StationShell>
  );
}
