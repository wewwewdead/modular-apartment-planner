function baseFeature(feature) {
  return {
    operation: 'subtract',
    targetPartId: null,
    sourceProfileId: null,
    depth: null,
    through: true,
    metadata: {},
    ...feature,
  };
}

export function createHoleFeature(feature = {}) {
  return baseFeature({
    type: 'hole',
    shape: 'circle',
    diameter: 0,
    ...feature,
  });
}

export function createCutoutFeature(feature = {}) {
  return baseFeature({
    type: 'cutout',
    shape: 'rect',
    width: 0,
    height: 0,
    ...feature,
  });
}

export function assignFeatureToPart(features, featureId, targetPartId) {
  return features.map((feature) => (
    feature.id === featureId
      ? {
          ...feature,
          targetPartId: targetPartId || null,
        }
      : feature
  ));
}

export function getFeatureTargetSummary(feature, parts = []) {
  if (!feature) {
    return 'Unassigned';
  }

  if (!feature.targetPartId) {
    return 'Object';
  }

  const part = parts.find((item) => item.id === feature.targetPartId);
  return part ? part.name : 'Unknown Part';
}
