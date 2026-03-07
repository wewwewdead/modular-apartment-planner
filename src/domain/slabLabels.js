export function getSlabDisplayLabel(slab) {
  const name = slab?.name?.trim();
  if (name) return name;

  const type = slab?.type?.trim();
  if (type) return type;

  return 'Floor Slab';
}
