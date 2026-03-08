export function formatMeasurement(mm) {
  const abs = Math.abs(mm);
  if (abs < 1000) return `${Math.round(abs)} mm`;
  return `${(abs / 1000).toFixed(3)} m`;
}

export function getAnnotationDisplayLabel(annotation) {
  if (!annotation || annotation.type !== 'dimension') {
    return annotation?.id || 'Annotation';
  }

  const dx = annotation.endPoint.x - annotation.startPoint.x;
  const dy = annotation.endPoint.y - annotation.startPoint.y;
  let measurement = Math.hypot(dx, dy);

  if (annotation.mode === 'horizontal') measurement = Math.abs(dx);
  if (annotation.mode === 'vertical') measurement = Math.abs(dy);

  return annotation.textOverride?.trim() || `Dim ${formatMeasurement(measurement)}`;
}
