/**
 * Roof-seating measurements shared by the attached-roof tests (RT-3.1 / RT-4,
 * docs/roof-truss-industrial.md §7.8.4, §7.9.4). Every gap is
 * `roof underside − member top face`, taken at the top-face point's OWN plan
 * position, so a positive gap floats and a negative one pokes through.
 */

const EPSILON = 1e-6;

/** The top-chord TOP FACE point at `t` along a member (in-plane normal, plan + elevation). */
export function chordTopFacePoint(member, t, topChordDepth) {
  const a = member.startWorld;
  const b = member.endWorld;
  const run = Math.hypot(b.x - a.x, b.y - a.y);
  const rise = b.elevation - a.elevation;
  const length = Math.hypot(run, rise);
  const half = topChordDepth / 2;
  return {
    x: a.x + (b.x - a.x) * t - ((b.x - a.x) / run) * (rise / length) * half,
    y: a.y + (b.y - a.y) * t - ((b.y - a.y) / run) * (rise / length) * half,
    elevation: a.elevation + rise * t + (run / length) * half,
  };
}

/**
 * What a top-chord member of a hip copy is, by its own slope (`ratio` = the
 * hip pitch as a ratio, `span` = the truss span, local x):
 * - `sloped`: on a pitched run (the slope is the hip pitch);
 * - `flat`: a level member whose midpoint is inside the span (a slice crown,
 *   a flat slice — its end node may sit a few mm past the heel, on the mitre);
 * - `levelTail`: a level member outside the span (a level tail);
 * - `kink`: anything else (a chord drawn straight across a kink).
 */
export function classifyTopChordMember(member, ratio, span) {
  const run = Math.hypot(member.endWorld.x - member.startWorld.x, member.endWorld.y - member.startWorld.y);
  const slope = Math.abs(member.endWorld.elevation - member.startWorld.elevation) / run;
  if (Math.abs(slope - ratio) <= 1e-6) return 'sloped';
  if (slope <= EPSILON) {
    const midX = (member.startNode.x + member.endNode.x) / 2;
    return midX >= 0 && midX <= span ? 'flat' : 'levelTail';
  }
  return 'kink';
}

/** Every top-chord member of a copy at 0.1 / 0.5 / 0.9: `{member, kind, samples: [{localX, gap}]}`. */
export function measureTopChords(roofGeometry, copy, { ratio, span, topChordDepth }) {
  return copy.members
    .filter((member) => member.memberType === 'topChord')
    .map((member) => ({
      member,
      kind: classifyTopChordMember(member, ratio, span),
      samples: [0.1, 0.5, 0.9].map((t) => {
        const point = chordTopFacePoint(member, t, topChordDepth);
        return {
          localX: member.startNode.x + (member.endNode.x - member.startNode.x) * t,
          gap: roofGeometry.getSurfaceElevation(point, 'bottom') - point.elevation,
        };
      }),
    }));
}

/** The purlin TOP FACE points at 0.02 / 0.5 / 0.98: centre + up · depth / 2 (`up` is three-space: y is elevation). */
export function purlinTopFacePoints(segment) {
  const depth = segment.crossSection.height;
  const up = segment.up;
  return [0.02, 0.5, 0.98].map((t) => {
    const lerp = (key) => segment.startWorld[key] + (segment.endWorld[key] - segment.startWorld[key]) * t;
    return {
      x: lerp('x') + (up.x * depth) / 2,
      y: lerp('y') + (up.z * depth) / 2,
      elevation: lerp('elevation') + (up.y * depth) / 2,
    };
  });
}

/** roof underside − purlin top face, per purlin sample: `{segment, point, gap}`. */
export function measurePurlins(roofGeometry, segments) {
  return segments.flatMap((segment) =>
    purlinTopFacePoints(segment).map((point) => ({
      segment,
      point,
      gap: roofGeometry.getSurfaceElevation(point, 'bottom') - point.elevation,
    })),
  );
}
