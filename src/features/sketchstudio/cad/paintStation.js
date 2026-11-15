// The paint booth (docs/sketch-studio-fab-shop.md §9 SM-3, numbers §8.6):
// what is painted (a part, or the group it belongs to), the finish rows it
// writes (one per instance, §4.2), the readouts (painted area from the kernel
// mesh, powder mass, cure) and the shop order: paint goes on before printing,
// so painting or stripping a part removes its prints (the panel asks first).
// Pure: models and plain arrays in and out.
import { numeric, uid } from './model.js';
import { profilePolygon } from './sheetMetal.js';
import { FINISH_GLOSS_NAMES, POWDER, RAL_CLASSIC, powderCoverage } from './shopCatalog.js';
import { memberIds, nodeName, nodeParent } from './groups.js';
import { isFabricated } from './shopParts.js';

const fmt = (value, digits = 2) => (Number.isFinite(value) ? Number(value.toFixed(digits)).toString() : '—');
const RAL_7035 = RAL_CLASSIC.find((r) => r.code === 7035);
export const FINISH_DEFAULTS = Object.freeze({
  kind: 'powder',
  name: RAL_7035.name,
  colour: RAL_7035.colour,
  gloss: 'satin',
  thickness: POWDER.film,
});

/** Surface area of a triangle mesh in mm² ({ vertices: flat xyz, triangles: corner indices }). */
export function meshArea(mesh) {
  const v = mesh?.vertices,
    t = mesh?.triangles;
  if (!v || !t) return 0;
  let sum = 0;
  for (let i = 0; i + 2 < t.length; i += 3) {
    const a = t[i] * 3,
      b = t[i + 1] * 3,
      c = t[i + 2] * 3;
    const ux = v[b] - v[a],
      uy = v[b + 1] - v[a + 1],
      uz = v[b + 2] - v[a + 2];
    const wx = v[c] - v[a],
      wy = v[c + 1] - v[a + 1],
      wz = v[c + 2] - v[a + 2];
    sum += Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
  }
  return sum;
}

/**
 * The booth's readouts for `area` mm² of surface (§8.6): powder coverage
 * m²/kg = 1000 / (SG × µm) × TE, the powder to spray, the cure; a film outside
 * 50 – 125 µm is a warning. Wet paint has no powder figures.
 */
export function paintNumbers({ area, kind = 'powder', thickness = POWDER.film }) {
  const m2 = area / 1e6;
  const film = Number(thickness);
  const warnings = [];
  if (kind === 'powder' && (film < POWDER.minFilm || film > POWDER.maxFilm))
    warnings.push({
      code: 'film',
      message: `A ${fmt(film, 0)} µm powder film is outside the ${POWDER.minFilm} – ${POWDER.maxFilm} µm a booth lays down.`,
    });
  if (!(film > 0)) return { area: m2, coverage: null, mass: null, cure: null, warnings };
  if (kind !== 'powder')
    return { area: m2, coverage: null, mass: null, cure: 'Flash off and cure to the paint maker’s sheet', warnings };
  const coverage = powderCoverage(film);
  return {
    area: m2,
    coverage,
    mass: m2 / coverage,
    cure: `${POWDER.cureTemperature} °C part temperature for ${POWDER.cureMinutes} min`,
    warnings,
  };
}

/**
 * What a pick paints: the instance, and the group it belongs to (its own,
 * innermost group: { id, name, instanceIds }, its fabricated members only —
 * bought-in items and fasteners are not painted here) when that is more than
 * itself, else null.
 */
export function paintPick(model, instanceId) {
  const groupId = nodeParent(model, instanceId);
  const partOf = (id) => model.parts.find((p) => p.id === model.instances.find((i) => i.id === id)?.partId);
  const members = groupId ? memberIds(model, [groupId]).filter((id) => isFabricated(partOf(id))) : [];
  return {
    instanceIds: [instanceId],
    group: members.length > 1 ? { id: groupId, name: nodeName(model, groupId), instanceIds: members } : null,
  };
}

/** The prints a paint or strip of these instances would remove (paint goes on first). */
export const printsOn = (model, instanceIds) => {
  const ids = new Set(instanceIds);
  return (model.prints || []).filter((p) => ids.has(p.instanceId));
};

/**
 * One finish row per instance (§4.2), replacing any it had, and its prints
 * removed (printing comes after paint). `finish`: { kind, name, colour, gloss,
 * thickness }; the colour is stored lower case.
 */
export function applyFinish(model, instanceIds, finish) {
  const ids = new Set(instanceIds);
  const kept = (model.finishes || []).filter((f) => !ids.has(f.instanceId));
  const rows = model.instances
    .filter((i) => ids.has(i.id))
    .map((i) => ({
      id: uid('finish'),
      instanceId: i.id,
      kind: finish.kind,
      name: String(finish.name || '').trim() || `Custom ${finish.colour.toLowerCase()}`,
      colour: finish.colour.toLowerCase(),
      gloss: finish.gloss,
      thickness: Number(finish.thickness),
    }));
  return {
    ...model,
    finishes: [...kept, ...rows],
    prints: (model.prints || []).filter((p) => !ids.has(p.instanceId)),
  };
}

/** Strip the paint (and the prints on it) from these instances. */
export function stripFinish(model, instanceIds) {
  const ids = new Set(instanceIds);
  return {
    ...model,
    finishes: (model.finishes || []).filter((f) => !ids.has(f.instanceId)),
    prints: (model.prints || []).filter((p) => !ids.has(p.instanceId)),
  };
}

/** "RAL 7035 Light grey · satin · 70 µm powder". */
export const finishLabel = (finish) =>
  `${finish.name} · ${(FINISH_GLOSS_NAMES[finish.gloss] || finish.gloss || '').toLowerCase()} · ${fmt(Number(finish.thickness), 0)} µm ${finish.kind}`;

/**
 * Open holes below 1.0 mm (§8.6: likely to fill with powder): the cut-outs of
 * a sheet-metal blank (their smallest width) and drilled hole features.
 * Returns [{ size, where }].
 */
export function fillingHoles(part, model, params = {}) {
  const found = [];
  for (const f of part?.features || []) {
    if (f.suppressed) continue;
    if (f.type === 'sheetmetal') {
      try {
        const profile = model.sketches.find((s) => s.id === f.sketchId)?.profile;
        for (const hole of profilePolygon(profile, params).holes) {
          const xs = hole.map((p) => p[0]),
            ys = hole.map((p) => p[1]);
          const size = Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys));
          if (size < POWDER.fillHole) found.push({ size, where: 'a cut-out in the blank' });
        }
      } catch {
        // A blank that does not read has no holes to flag.
      }
    } else if (f.type === 'hole' && f.diameter != null) {
      try {
        const size = numeric(f.diameter, params);
        if (size < POWDER.fillHole) found.push({ size, where: 'a drilled hole' });
      } catch {
        // An unreadable diameter is the feature form's to report.
      }
    }
  }
  return found;
}
