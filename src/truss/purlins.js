import { getTopChordRunLength, sampleTopChordRun } from './curveSampling';

const EPSILON = 1e-6;
const DETAIL_MARKER_LENGTH = 160;

function normalize2d(vector) {
  const length = Math.sqrt(vector.x * vector.x + vector.z * vector.z);
  if (length <= EPSILON) {
    return { x: 1, z: 0 };
  }
  return {
    x: vector.x / length,
    z: vector.z / length,
  };
}

/** The run's normal on the roof side (z up), from its unit tangent. */
export function upwardNormal(tangent) {
  const unit = normalize2d(tangent || { x: 1, z: 0 });
  const normal = { x: -unit.z, z: unit.x };
  return normal.z < 0 || (normal.z === 0 && normal.x < 0) ? { x: -normal.x, z: -normal.z } : normal;
}

function buildChordAttachments(run, spacing, startOffset, endOffset, side, seatOffset = 0) {
  if (!(run?.points || []).length || spacing <= EPSILON) return [];

  const chordLength = getTopChordRunLength(run);
  const limit = chordLength - Math.max(endOffset, 0);
  if (limit < Math.max(startOffset, 0) - EPSILON) return [];

  const attachments = [];
  for (
    let distanceAlong = Math.max(startOffset, 0), index = 0;
    distanceAlong <= limit + EPSILON;
    distanceAlong += spacing, index += 1
  ) {
    const sample = sampleTopChordRun(run, distanceAlong);
    if (!sample) continue;

    // RT-3 (spec §7.4): the run is the chord CENTRE-line; the purlin sits on
    // the chord's top face, so its centre is tc/2 + depth/2 out along the
    // run's normal.
    const normal = upwardNormal(sample.tangent);
    attachments.push({
      id: `${side}_${index}`,
      side,
      chordPoint: sample.point,
      localPoint: {
        x: sample.point.x + normal.x * seatOffset,
        z: sample.point.z + normal.z * seatOffset,
      },
      tangent: sample.tangent,
      normal,
      distanceAlong: sample.distanceAlong,
    });
  }

  return attachments;
}

function dedupeAttachments(attachments = []) {
  return attachments.filter(
    (attachment, index) =>
      attachments.findIndex(
        (entry) =>
          Math.abs(entry.localPoint.x - attachment.localPoint.x) <= EPSILON &&
          Math.abs(entry.localPoint.z - attachment.localPoint.z) <= EPSILON,
      ) === index,
  );
}

export function buildTrussPurlinAttachments(profile, purlinSystem = {}) {
  if (!purlinSystem?.enabled) return [];

  const spacing = Math.max(Number(purlinSystem.spacing || 0), 0);
  const startOffset = Math.max(Number(purlinSystem.startOffset || 0), 0);
  const endOffset = Math.max(Number(purlinSystem.endOffset || 0), 0);
  if (spacing <= EPSILON) return [];
  const chordDepth = Math.max(Number(profile?.metrics?.topChordDepth) || 0, 0);
  const purlinDepth = Math.max(Number(purlinSystem.depth) || 0, 0);
  const seatOffset = chordDepth / 2 + purlinDepth / 2;

  const topChordRuns = (profile?.topChordRuns || []).filter((run) => (run.points || []).length >= 2);

  if (!topChordRuns.length) {
    return buildChordAttachments(
      {
        id: 'main',
        side: 'main',
        points: profile?.roofOutline || [],
      },
      spacing,
      startOffset,
      endOffset,
      'main',
      seatOffset,
    );
  }

  return dedupeAttachments(
    topChordRuns.flatMap((run, index) =>
      buildChordAttachments(run, spacing, startOffset, endOffset, run.side || run.id || `run_${index + 1}`, seatOffset),
    ),
  );
}

export function createDetailPurlinMarker(attachment, markerLength = DETAIL_MARKER_LENGTH) {
  if (!attachment?.localPoint) return null;

  const tangent = normalize2d(attachment.tangent || { x: 1, z: 0 });
  const normal = { x: -tangent.z, z: tangent.x };
  const halfLength = markerLength / 2;

  return {
    id: attachment.id,
    start: {
      x: attachment.localPoint.x - normal.x * halfLength,
      z: attachment.localPoint.z - normal.z * halfLength,
    },
    end: {
      x: attachment.localPoint.x + normal.x * halfLength,
      z: attachment.localPoint.z + normal.z * halfLength,
    },
  };
}
