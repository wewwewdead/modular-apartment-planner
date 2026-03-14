import { getTopChordRunLength, sampleTopChordRun } from './curveSampling';

const EPSILON = 1e-6;
const DETAIL_MARKER_LENGTH = 160;

function normalize2d(vector) {
  const length = Math.sqrt((vector.x * vector.x) + (vector.z * vector.z));
  if (length <= EPSILON) {
    return { x: 1, z: 0 };
  }
  return {
    x: vector.x / length,
    z: vector.z / length,
  };
}

function buildChordAttachments(run, spacing, startOffset, endOffset, side) {
  if (!(run?.points || []).length || spacing <= EPSILON) return [];

  const chordLength = getTopChordRunLength(run);
  const limit = chordLength - Math.max(endOffset, 0);
  if (limit < Math.max(startOffset, 0) - EPSILON) return [];

  const attachments = [];
  for (let distanceAlong = Math.max(startOffset, 0), index = 0; distanceAlong <= limit + EPSILON; distanceAlong += spacing, index += 1) {
    const sample = sampleTopChordRun(run, distanceAlong);
    if (!sample) continue;

    attachments.push({
      id: `${side}_${index}`,
      side,
      localPoint: sample.point,
      tangent: sample.tangent,
      distanceAlong: sample.distanceAlong,
    });
  }

  return attachments;
}

function dedupeAttachments(attachments = []) {
  return attachments.filter((attachment, index) => (
    attachments.findIndex((entry) => (
      Math.abs(entry.localPoint.x - attachment.localPoint.x) <= EPSILON
      && Math.abs(entry.localPoint.z - attachment.localPoint.z) <= EPSILON
    )) === index
  ));
}

export function buildTrussPurlinAttachments(profile, purlinSystem = {}) {
  if (!purlinSystem?.enabled) return [];

  const spacing = Math.max(Number(purlinSystem.spacing || 0), 0);
  const startOffset = Math.max(Number(purlinSystem.startOffset || 0), 0);
  const endOffset = Math.max(Number(purlinSystem.endOffset || 0), 0);
  if (spacing <= EPSILON) return [];

  const topChordRuns = (profile?.topChordRuns || [])
    .filter((run) => (run.points || []).length >= 2);

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
      'main'
    );
  }

  return dedupeAttachments(topChordRuns.flatMap((run, index) => (
    buildChordAttachments(
      run,
      spacing,
      startOffset,
      endOffset,
      run.side || run.id || `run_${index + 1}`
    )
  )));
}

export function createDetailPurlinMarker(attachment, markerLength = DETAIL_MARKER_LENGTH) {
  if (!attachment?.localPoint) return null;

  const tangent = normalize2d(attachment.tangent || { x: 1, z: 0 });
  const normal = { x: -tangent.z, z: tangent.x };
  const halfLength = markerLength / 2;

  return {
    id: attachment.id,
    start: {
      x: attachment.localPoint.x - (normal.x * halfLength),
      z: attachment.localPoint.z - (normal.z * halfLength),
    },
    end: {
      x: attachment.localPoint.x + (normal.x * halfLength),
      z: attachment.localPoint.z + (normal.z * halfLength),
    },
  };
}
