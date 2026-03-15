import { generateId } from '@/domain/ids';

export function createAssembly(name = 'Untitled Assembly', overrides = {}) {
  return {
    id: generateId('asm'),
    name,
    description: overrides.description || '',
    category: overrides.category || 'general',
    partIds: overrides.partIds || [],
    objectId: overrides.objectId || null,
    parentAssemblyId: overrides.parentAssemblyId || null,
    childAssemblyIds: overrides.childAssemblyIds || [],
    source: overrides.source || 'manual',
    role: overrides.role || null,
    sortIndex: overrides.sortIndex ?? 0,
    ...overrides,
  };
}

export function addPartToAssembly(assembly, partId) {
  if (assembly.partIds.includes(partId)) return assembly;
  return { ...assembly, partIds: [...assembly.partIds, partId] };
}

export function removePartFromAssembly(assembly, partId) {
  return { ...assembly, partIds: assembly.partIds.filter((id) => id !== partId) };
}

export function createTemplateAssembly(templateType, params, name) {
  return createAssembly(name, {
    category: templateType,
    templateType,
    templateParams: { ...params },
  });
}
