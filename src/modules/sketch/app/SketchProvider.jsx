import { createContext, useContext, useReducer, useCallback } from 'react';
import { createSketchProject } from '../domain/sketchModels';
import { createAssembly } from '../domain/assemblyModels';
import { clampDimension, sanitizePartDimensions, sanitizePartPosition } from '../domain/validation';
import { resolveConstraints } from '../domain/constraintResolver';
import { updateBoundDimensionEndpoints } from '../domain/dimensionBinding';
import { generateId } from '@/domain/ids';
import { generateObjectFromTemplate } from '../domain/objectGenerator';
import { createSketchObject, normalizeSketchObjects } from '../domain/objectModels';
import { getPartDimensions } from '../domain/partGeometry';
import {
  buildObjectScaleFactors,
  getPartsBounds3d,
  hasMeaningfulScaleChange,
  isObjectGeometryPart,
  resizePartForObject,
  scalePoint3d,
  syncManualObjectDimensions,
} from '../domain/objectResize';

const SketchContext = createContext(null);
const HISTORY_LIMIT = 80;

function snapshotSketch(sketchProject) {
  return JSON.stringify(sketchProject);
}

function applyUpdate(state, nextProject, recordHistory = true) {
  const normalizedProject = syncManualObjectDimensions(normalizeSketchObjects(nextProject));
  const nextSnapshot = snapshotSketch(normalizedProject);
  const history = recordHistory
    ? [...state.history, state.project].slice(-HISTORY_LIMIT)
    : state.history;

  return {
    ...state,
    history,
    future: recordHistory ? [] : state.future,
    project: normalizedProject,
    isDirty: nextSnapshot !== state.savedSnapshot,
  };
}

function mergePart(existing, updates) {
  const merged = { ...existing, ...updates };
  if (updates.position) {
    merged.position = { ...existing.position, ...updates.position };
  }
  if (updates.rotation) {
    merged.rotation = { ...existing.rotation, ...updates.rotation };
  }
  if (updates.flip) {
    merged.flip = { ...(existing.flip || { x: false, y: false, z: false }), ...updates.flip };
  }
  return merged;
}

function sanitizePart(part) {
  if (part.type === 'dimension') return part;
  return sanitizePartPosition(sanitizePartDimensions(part));
}

function applyConstraints(project) {
  const constraints = project.constraints || [];
  if (constraints.length === 0) return project;

  const resolved = resolveConstraints(constraints, project.parts);
  if (resolved.size === 0) return project;

  return {
    ...project,
    parts: project.parts.map((part) => {
      const newPos = resolved.get(part.id);
      return newPos ? { ...part, position: newPos } : part;
    }),
  };
}

function updateBoundDimensions(project, updatedPartId) {
  const updatedPart = project.parts.find((part) => part.id === updatedPartId);
  if (!updatedPart) return project;

  let changed = false;
  const newParts = project.parts.map((part) => {
    if (part.type === 'dimension' && part.boundPartId === updatedPartId) {
      changed = true;
      return updateBoundDimensionEndpoints(part, updatedPart);
    }
    return part;
  });

  return changed ? { ...project, parts: newParts } : project;
}

function clonePart(part, idMap) {
  const newId = generateId('part');
  idMap.set(part.id, newId);
  return {
    ...part,
    id: newId,
    name: `${part.name} (copy)`,
    objectId: part.objectId || null,
    source: 'manual',
    locked: false,
    position: {
      ...part.position,
      x: part.position.x + 50,
      y: part.position.y + 50,
    },
  };
}

function clonePartWithOffset(part, idMap, delta = {}, suffix = '') {
  const newId = generateId('part');
  idMap.set(part.id, newId);
  return {
    ...part,
    id: newId,
    name: suffix ? `${part.name} ${suffix}` : part.name,
    source: 'manual',
    locked: false,
    position: {
      ...part.position,
      x: part.position.x + (delta.dx || 0),
      y: part.position.y + (delta.dy || 0),
      z: part.position.z + (delta.dz || 0),
    },
  };
}

function clonePartForAssemblyInstance(part, idMap, options = {}) {
  const {
    delta = {},
    suffix = '',
    assemblyId = null,
    instanceMode = 'independent',
    sourceAssemblyId = null,
    patternGroupId = null,
    patternType = null,
    linkedSourcePartId = null,
    positionTransform = null,
    extra = {},
  } = options;

  const cloned = clonePartWithOffset(part, idMap, delta, suffix);
  cloned.assemblyId = assemblyId;
  cloned.instanceMode = instanceMode;
  cloned.patternGroupId = patternGroupId;
  cloned.patternType = patternType;
  cloned.linkedSourceAssemblyId = instanceMode === 'linked'
    ? (sourceAssemblyId || part.assemblyId || null)
    : null;
  cloned.linkedSourcePartId = instanceMode === 'linked'
    ? (linkedSourcePartId || part.linkedSourcePartId || part.id)
    : null;

  if (typeof positionTransform === 'function') {
    cloned.position = positionTransform(cloned, part);
  }

  return { ...cloned, ...extra };
}

function getAssemblyCenter(parts) {
  const bounds = getPartsBounds3d((parts || []).filter((part) => part.type !== 'dimension'));
  if (bounds.empty) {
    return { x: 0, y: 0, z: 0 };
  }
  return {
    x: (bounds.min.x + bounds.max.x) / 2,
    y: (bounds.min.y + bounds.max.y) / 2,
    z: (bounds.min.z + bounds.max.z) / 2,
  };
}

function rotatePointAroundAxis(point, center, axis, angle) {
  const dx = point.x - center.x;
  const dy = point.y - center.y;
  const dz = point.z - center.z;
  const sin = Math.sin(angle);
  const cos = Math.cos(angle);

  if (axis === 'x') {
    return {
      x: center.x + dx,
      y: center.y + dy * cos - dz * sin,
      z: center.z + dy * sin + dz * cos,
    };
  }

  if (axis === 'y') {
    return {
      x: center.x + dx * cos + dz * sin,
      y: center.y + dy,
      z: center.z - dx * sin + dz * cos,
    };
  }

  return {
    x: center.x + dx * cos - dy * sin,
    y: center.y + dx * sin + dy * cos,
    z: center.z + dz,
  };
}

function mirrorPartPosition(part, mirrorCenter, axis) {
  const dims = getPartDimensions(part);
  const center = {
    x: part.position.x + dims.width / 2,
    y: part.position.y + dims.depth / 2,
    z: part.position.z + dims.height / 2,
  };

  const mirroredCenter = { ...center };
  mirroredCenter[axis] = 2 * mirrorCenter[axis] - center[axis];

  return {
    x: mirroredCenter.x - dims.width / 2,
    y: mirroredCenter.y - dims.depth / 2,
    z: mirroredCenter.z - dims.height / 2,
  };
}

function getLinkedPropagationUpdates(updates = {}) {
  const blockedFields = new Set([
    'id',
    'name',
    'position',
    'rotation',
    'flip',
    'assemblyId',
    'objectId',
    'parentId',
    'linkedSourcePartId',
    'linkedSourceAssemblyId',
    'patternGroupId',
    'patternType',
    'instanceMode',
    'sortIndex',
  ]);

  return Object.entries(updates).reduce((acc, [key, value]) => {
    if (!blockedFields.has(key)) {
      acc[key] = value;
    }
    return acc;
  }, {});
}

function propagateLinkedPartUpdates(project, updatedPartId, updates) {
  const updatedPart = project.parts.find((part) => part.id === updatedPartId);
  if (!updatedPart) return project;

  const sourcePartId = updatedPart.linkedSourcePartId || updatedPart.id;
  if (updatedPart.linkedSourcePartId) {
    return project;
  }

  const propagatedUpdates = getLinkedPropagationUpdates(updates);
  if (Object.keys(propagatedUpdates).length === 0) return project;

  let changed = false;
  const nextParts = project.parts.map((part) => {
    if (part.linkedSourcePartId !== sourcePartId) return part;
    changed = true;
    return sanitizePart({
      ...part,
      ...propagatedUpdates,
    });
  });

  return changed ? { ...project, parts: nextParts } : project;
}

function collectPartBranchIds(project, rootPartId) {
  const collected = new Set([rootPartId]);
  let changed = true;

  while (changed) {
    changed = false;
    for (const part of project.parts) {
      if (part.parentId && collected.has(part.parentId) && !collected.has(part.id)) {
        collected.add(part.id);
        changed = true;
      }
    }
  }

  return collected;
}

function cloneInternalConstraints(constraints, sourcePartIds, idMap) {
  const cloned = [];

  for (const constraint of constraints || []) {
    if (constraint.type === 'equal_spacing') {
      const partIds = constraint.partIds || [];
      const allInScope = partIds.length > 0 && partIds.every((id) => sourcePartIds.has(id));
      const referenceInScope = !constraint.referencePartId || sourcePartIds.has(constraint.referencePartId);
      if (!allInScope || !referenceInScope) continue;

      cloned.push({
        ...constraint,
        id: generateId('cstr'),
        partIds: partIds.map((id) => idMap.get(id)).filter(Boolean),
        referencePartId: constraint.referencePartId ? (idMap.get(constraint.referencePartId) || null) : null,
      });
      continue;
    }

    if (!sourcePartIds.has(constraint.sourcePartId) || !sourcePartIds.has(constraint.targetPartId)) {
      continue;
    }

    cloned.push({
      ...constraint,
      id: generateId('cstr'),
      sourcePartId: idMap.get(constraint.sourcePartId) || null,
      targetPartId: idMap.get(constraint.targetPartId) || null,
    });
  }

  return cloned.filter((constraint) => {
    if (constraint.type === 'equal_spacing') {
      return (constraint.partIds || []).length >= 2;
    }
    return !!constraint.sourcePartId && !!constraint.targetPartId;
  });
}

function getManagedObject(project, objectId) {
  if (!objectId) return null;
  return (project.objects || []).find((object) => object.id === objectId) || null;
}

function getManagedObjectForPart(project, partId) {
  const part = project.parts.find((entry) => entry.id === partId);
  const object = part?.objectId ? getManagedObject(project, part.objectId) : null;
  return object?.editingPolicy === 'parametric' ? object : null;
}

function getManagedObjectForAssembly(project, assemblyId) {
  const assembly = project.assemblies.find((entry) => entry.id === assemblyId);
  const object = assembly?.objectId ? getManagedObject(project, assembly.objectId) : null;
  return object?.editingPolicy === 'parametric' ? object : null;
}

function filterConstraintsForRemovedParts(constraints, idsToRemove) {
  return constraints
    .map((constraint) => {
      // For equal_spacing, remove deleted parts from the partIds list
      if (constraint.type === 'equal_spacing') {
        const filtered = (constraint.partIds || []).filter((id) => !idsToRemove.has(id));
        // Also clear referencePartId if it was removed
        const refCleared = idsToRemove.has(constraint.referencePartId)
          ? null
          : constraint.referencePartId;
        if (filtered.length < 2) return null; // not enough parts left
        return { ...constraint, partIds: filtered, referencePartId: refCleared };
      }
      // Standard constraints: remove if either source or target is deleted
      if (idsToRemove.has(constraint.sourcePartId) || idsToRemove.has(constraint.targetPartId)) {
        return null;
      }
      return constraint;
    })
    .filter(Boolean);
}

function removePartsAndAssemblies(project, { partIds, assemblyIds }) {
  const idsToRemove = new Set(partIds);
  const assemblyIdSet = new Set(assemblyIds);

  const childIds = new Set(
    project.parts.filter((part) => idsToRemove.has(part.parentId)).map((part) => part.id)
  );
  for (const childId of childIds) idsToRemove.add(childId);

  const constraints = filterConstraintsForRemovedParts(
    project.constraints || [],
    idsToRemove
  );

  return {
    ...project,
    parts: project.parts
      .filter((part) => !idsToRemove.has(part.id))
      .map((part) => {
        if (part.type === 'dimension' && part.boundPartId && idsToRemove.has(part.boundPartId)) {
          return { ...part, boundPartId: null, boundProperty: null, boundAxis: null };
        }
        return part;
      }),
    assemblies: project.assemblies.filter((assembly) => !assemblyIdSet.has(assembly.id)),
    constraints,
  };
}

function removeObjectArtifacts(project, objectId) {
  const partIds = project.parts
    .filter((part) => part.objectId === objectId)
    .map((part) => part.id);
  const assemblyIds = project.assemblies
    .filter((assembly) => assembly.objectId === objectId)
    .map((assembly) => assembly.id);

  return removePartsAndAssemblies(project, { partIds, assemblyIds });
}

function retargetManagedViewports(sheets, objectId, oldAssemblyIds = []) {
  const oldAssemblyIdSet = new Set(oldAssemblyIds);

  return (sheets || []).map((sheet) => ({
    ...sheet,
    viewports: (sheet.viewports || []).map((viewport) => {
      if (viewport.sourceRefId !== objectId && !oldAssemblyIdSet.has(viewport.sourceRefId)) {
        return viewport;
      }

      if (viewport.sourceView === 'sketch_assembly_top') {
        return { ...viewport, sourceView: 'sketch_object_top', sourceRefId: objectId };
      }
      if (viewport.sourceView === 'sketch_assembly_front') {
        return { ...viewport, sourceView: 'sketch_object_front', sourceRefId: objectId };
      }
      if (viewport.sourceView === 'sketch_assembly_side') {
        return { ...viewport, sourceView: 'sketch_object_side', sourceRefId: objectId };
      }
      if (viewport.sourceView === 'sketch_part_list') {
        return { ...viewport, sourceRefId: objectId, sourceObjectId: objectId };
      }

      return viewport;
    }),
  }));
}

function detachManagedObject(project, objectId) {
  return {
    ...project,
    objects: (project.objects || []).map((object) => (
      object.id === objectId
        ? {
            ...object,
            source: 'custom',
            editingPolicy: 'manual',
            templateType: null,
            templateParams: null,
            summary: object.summary || 'Detached custom object',
            updatedAt: new Date().toISOString(),
          }
        : object
    )),
    assemblies: project.assemblies.map((assembly) => (
      assembly.objectId === objectId
        ? {
            ...assembly,
            source: 'manual',
            role: assembly.role || null,
          }
        : assembly
    )),
    parts: project.parts.map((part) => (
      part.objectId === objectId
        ? {
          ...part,
            source: 'manual',
            locked: false,
          }
        : part
    )),
  };
}

function addGeneratedObject(project, generated) {
  return {
    ...project,
    objects: [...(project.objects || []), generated.object],
    assemblies: [...project.assemblies, ...generated.assemblies],
    parts: [...project.parts, ...generated.parts.map(sanitizePart)],
  };
}

function collectConstraintsForObject(project, objectId) {
  const objectPartIds = new Set(
    project.parts.filter((part) => part.objectId === objectId).map((part) => part.id)
  );
  return (project.constraints || []).filter((constraint) => {
    if (constraint.type === 'equal_spacing') {
      return (constraint.partIds || []).some((id) => objectPartIds.has(id));
    }
    return objectPartIds.has(constraint.sourcePartId) || objectPartIds.has(constraint.targetPartId);
  });
}

function buildRoleMap(parts, objectId) {
  const map = new Map();
  for (const part of parts) {
    if (part.objectId === objectId && part.generatedRole) {
      map.set(part.id, part.generatedRole);
    }
  }
  return map;
}

function buildReverseRoleMap(parts, objectId) {
  const map = new Map();
  for (const part of parts) {
    if (part.objectId === objectId && part.generatedRole) {
      map.set(part.generatedRole, part.id);
    }
  }
  return map;
}

function remapConstraints(constraints, oldRoleMap, newRoleMap) {
  return constraints
    .map((constraint) => {
      if (constraint.type === 'equal_spacing') {
        const newPartIds = (constraint.partIds || []).map((id) => {
          const role = oldRoleMap.get(id);
          return role ? (newRoleMap.get(role) || null) : id;
        }).filter(Boolean);

        let newRefId = constraint.referencePartId;
        if (newRefId) {
          const refRole = oldRoleMap.get(newRefId);
          newRefId = refRole ? (newRoleMap.get(refRole) || null) : newRefId;
        }

        if (newPartIds.length < 2) return null;
        return { ...constraint, partIds: newPartIds, referencePartId: newRefId };
      }

      let newSourceId = constraint.sourcePartId;
      let newTargetId = constraint.targetPartId;

      const sourceRole = oldRoleMap.get(newSourceId);
      if (sourceRole) newSourceId = newRoleMap.get(sourceRole) || null;

      const targetRole = oldRoleMap.get(newTargetId);
      if (targetRole) newTargetId = newRoleMap.get(targetRole) || null;

      if (!newSourceId || !newTargetId) return null;
      return { ...constraint, sourcePartId: newSourceId, targetPartId: newTargetId };
    })
    .filter(Boolean);
}

function rebuildManagedObject(project, object, params) {
  const oldAssemblyIds = project.assemblies
    .filter((assembly) => assembly.objectId === object.id)
    .map((assembly) => assembly.id);

  // Collect constraints referencing old parts and build role map before stripping
  const affectedConstraints = collectConstraintsForObject(project, object.id);
  const oldRoleMap = buildRoleMap(project.parts, object.id);

  const strippedProject = removeObjectArtifacts(project, object.id);
  const generated = generateObjectFromTemplate(object.templateType, params, {
    objectId: object.id,
    name: object.name,
    origin: object.origin,
  });

  const nextProject = addGeneratedObject({
    ...strippedProject,
    objects: (strippedProject.objects || []).filter((entry) => entry.id !== object.id),
    sheets: retargetManagedViewports(strippedProject.sheets, object.id, oldAssemblyIds),
  }, generated);

  // Remap constraints to new part IDs via role matching
  if (affectedConstraints.length > 0) {
    const newRoleMap = buildReverseRoleMap(nextProject.parts, object.id);
    const remapped = remapConstraints(affectedConstraints, oldRoleMap, newRoleMap);
    // Merge: keep constraints not affected + add remapped ones
    const affectedIds = new Set(affectedConstraints.map((c) => c.id));
    const kept = (nextProject.constraints || []).filter((c) => !affectedIds.has(c.id));
    return { ...nextProject, constraints: [...kept, ...remapped] };
  }

  return nextProject;
}

function sketchReducer(state, action) {
  switch (action.type) {
    case 'SKETCH_NEW': {
      const newProject = syncManualObjectDimensions(
        normalizeSketchObjects(action.project || createSketchProject())
      );
      return {
        project: newProject,
        isDirty: false,
        savedSnapshot: snapshotSketch(newProject),
        history: [],
        future: [],
      };
    }

    case 'SKETCH_LOAD': {
      const loaded = syncManualObjectDimensions(normalizeSketchObjects(action.project));
      return {
        project: loaded,
        isDirty: false,
        savedSnapshot: snapshotSketch(loaded),
        history: [],
        future: [],
      };
    }

    case 'PART_ADD': {
      const part = sanitizePart(action.part);
      const assembly = part.assemblyId
        ? state.project.assemblies.find((entry) => entry.id === part.assemblyId)
        : null;
      const nextPart = assembly && assembly.objectId
        ? { ...part, objectId: assembly.objectId }
        : part;
      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: [...state.project.parts, nextPart],
      };
      nextProject = applyConstraints(nextProject);
      return applyUpdate(state, nextProject);
    }

    case 'PART_UPDATE': {
      const managedObject = getManagedObjectForPart(state.project, action.part.id);
      if (managedObject && !action.allowManagedUpdate) return state;

      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: state.project.parts.map((part) => {
          if (part.id !== action.part.id) return part;
          const merged = mergePart(part, action.part);
          return merged.type === 'dimension' ? merged : sanitizePart(merged);
        }),
      };
      nextProject = propagateLinkedPartUpdates(nextProject, action.part.id, action.part);
      nextProject = applyConstraints(nextProject);
      nextProject = updateBoundDimensions(nextProject, action.part.id);
      const updatedSourcePart = nextProject.parts.find((part) => part.id === action.part.id);
      const linkedSourcePartId = updatedSourcePart?.linkedSourcePartId || updatedSourcePart?.id || null;
      if (linkedSourcePartId && !updatedSourcePart?.linkedSourcePartId) {
        const linkedPartIds = nextProject.parts
          .filter((part) => part.linkedSourcePartId === linkedSourcePartId)
          .map((part) => part.id);
        for (const linkedPartId of linkedPartIds) {
          nextProject = updateBoundDimensions(nextProject, linkedPartId);
        }
      }
      return applyUpdate(state, nextProject);
    }

    case 'PART_DELETE': {
      const managedObject = getManagedObjectForPart(state.project, action.partId);
      if (managedObject) return state;

      const partId = action.partId;
      const childIds = new Set(
        state.project.parts.filter((part) => part.parentId === partId).map((part) => part.id)
      );
      const idsToRemove = new Set([partId, ...childIds]);

      const constraints = filterConstraintsForRemovedParts(
        state.project.constraints || [],
        idsToRemove
      );

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: state.project.parts
          .filter((part) => !idsToRemove.has(part.id))
          .map((part) => {
            if (part.type === 'dimension' && part.boundPartId && idsToRemove.has(part.boundPartId)) {
              return { ...part, boundPartId: null, boundProperty: null, boundAxis: null };
            }
            return part;
          }),
        assemblies: state.project.assemblies.map((assembly) => ({
          ...assembly,
          partIds: assembly.partIds.filter((id) => !idsToRemove.has(id)),
        })),
        constraints,
      });
    }

    case 'PART_CLONE': {
      const managedObject = getManagedObjectForPart(state.project, action.partId);
      if (managedObject) return state;

      const part = state.project.parts.find((entry) => entry.id === action.partId);
      if (!part) return state;

      const idMap = new Map();
      const cloned = clonePart(part, idMap);
      const children = state.project.parts.filter((entry) => entry.parentId === action.partId);
      const clonedChildren = children.map((child) => {
        const clonedChild = clonePart(child, idMap);
        clonedChild.parentId = cloned.id;
        return clonedChild;
      });

      const newParts = [cloned, ...clonedChildren];
      let assemblies = state.project.assemblies;
      if (part.assemblyId) {
        assemblies = assemblies.map((assembly) => {
          if (assembly.id === part.assemblyId) {
            return {
              ...assembly,
              partIds: [...assembly.partIds, ...newParts.map((entry) => entry.id)],
            };
          }
          return assembly;
        });
        for (const nextPart of newParts) {
          nextPart.assemblyId = part.assemblyId;
        }
      }

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: [...state.project.parts, ...newParts],
        assemblies,
      });
    }

    case 'ASSEMBLY_ADD':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: [...state.project.assemblies, { ...action.assembly, source: action.assembly.source || 'manual' }],
      });

    case 'MODULE_PRESET_INSERT':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: [...state.project.assemblies, { ...action.assembly, source: action.assembly.source || 'manual' }],
        parts: [...state.project.parts, ...(action.parts || []).map(sanitizePart)],
      });

    case 'ASSEMBLY_UPDATE': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assembly.id);
      if (managedObject) return state;

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: state.project.assemblies.map((assembly) => (
          assembly.id === action.assembly.id ? { ...assembly, ...action.assembly } : assembly
        )),
      });
    }

    case 'ASSEMBLY_DELETE': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) return state;

      const assemblyId = action.assemblyId;
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: state.project.assemblies.filter((assembly) => assembly.id !== assemblyId),
        parts: state.project.parts.map((part) => (
          part.assemblyId === assemblyId ? { ...part, assemblyId: null } : part
        )),
      });
    }

    case 'ASSEMBLY_MOVE': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) {
        return sketchReducer(state, {
          type: 'OBJECT_MOVE',
          objectId: managedObject.id,
          delta: action.delta,
        });
      }

      const assembly = state.project.assemblies.find((entry) => entry.id === action.assemblyId);
      if (!assembly) return state;

      const partIdSet = new Set(assembly.partIds);
      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: state.project.parts.map((part) => {
          if (!partIdSet.has(part.id) || part.type === 'dimension') return part;
          const moved = {
            ...part,
            position: {
              x: part.position.x + (action.delta.dx || 0),
              y: part.position.y + (action.delta.dy || 0),
              z: part.position.z + (action.delta.dz || 0),
            },
          };
          return sanitizePart(moved);
        }),
      };
      nextProject = applyConstraints(nextProject);
      for (const partId of partIdSet) {
        nextProject = updateBoundDimensions(nextProject, partId);
      }
      return applyUpdate(state, nextProject);
    }

    case 'ASSEMBLY_DELETE_WITH_PARTS': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) {
        return sketchReducer(state, {
          type: 'OBJECT_DELETE',
          objectId: managedObject.id,
        });
      }

      const assembly = state.project.assemblies.find((entry) => entry.id === action.assemblyId);
      if (!assembly) return state;

      return applyUpdate(state, {
        ...removePartsAndAssemblies(state.project, {
          partIds: assembly.partIds,
          assemblyIds: [assembly.id],
        }),
        updatedAt: new Date().toISOString(),
      });
    }

    case 'ASSEMBLY_ADD_PART': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) return state;

       const assembly = state.project.assemblies.find((entry) => entry.id === action.assemblyId);

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: state.project.assemblies.map((assembly) => (
          assembly.id === action.assemblyId && !assembly.partIds.includes(action.partId)
            ? { ...assembly, partIds: [...assembly.partIds, action.partId] }
            : assembly
        )),
        parts: state.project.parts.map((part) => (
          part.id === action.partId
            ? { ...part, assemblyId: action.assemblyId, objectId: assembly?.objectId || part.objectId || null }
            : part
        )),
      });
    }

    case 'ASSEMBLY_REMOVE_PART': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) return state;

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: state.project.assemblies.map((assembly) => (
          assembly.id === action.assemblyId
            ? { ...assembly, partIds: assembly.partIds.filter((id) => id !== action.partId) }
            : assembly
        )),
        parts: state.project.parts.map((part) => (
          part.id === action.partId && part.assemblyId === action.assemblyId
            ? { ...part, assemblyId: null }
            : part
        )),
      });
    }

    case 'ASSEMBLY_CLONE': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) return state;

      const assembly = state.project.assemblies.find((entry) => entry.id === action.assemblyId);
      if (!assembly) return state;

      const idMap = new Map();
      const newAssemblyId = generateId('asm');
      const cloneMode = action.mode === 'linked' ? 'linked' : 'independent';
      const linkedSourceAssemblyId = assembly.linkedSourceAssemblyId || assembly.id;
      const patternGroupId = assembly.patternGroupId || generateId('pattern');
      const newAssembly = {
        ...assembly,
        id: newAssemblyId,
        name: cloneMode === 'linked' ? `${assembly.name} (linked)` : `${assembly.name} (copy)`,
        partIds: [],
        objectId: assembly.objectId || null,
        source: 'manual',
        instanceMode: cloneMode,
        linkedSourceAssemblyId: cloneMode === 'linked' ? linkedSourceAssemblyId : null,
        patternGroupId: cloneMode === 'linked' ? patternGroupId : assembly.patternGroupId || null,
      };

      const assemblyParts = state.project.parts.filter((part) => part.assemblyId === action.assemblyId);
      const sourcePartIds = new Set(assemblyParts.map((part) => part.id));
      const clonedParts = [];

      for (const part of assemblyParts) {
        const cloned = clonePartForAssemblyInstance(part, idMap, {
          assemblyId: newAssemblyId,
          instanceMode: cloneMode,
          sourceAssemblyId: linkedSourceAssemblyId,
          patternGroupId: cloneMode === 'linked' ? patternGroupId : assembly.patternGroupId || null,
          linkedSourcePartId: part.linkedSourcePartId || part.id,
        });
        clonedParts.push(cloned);
      }

      for (const clonedPart of clonedParts) {
        if (clonedPart.parentId && idMap.has(clonedPart.parentId)) {
          clonedPart.parentId = idMap.get(clonedPart.parentId);
        }
      }

      newAssembly.partIds = clonedParts.map((part) => part.id);
      const clonedConstraints = cloneInternalConstraints(state.project.constraints, sourcePartIds, idMap);

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: [...state.project.parts, ...clonedParts],
        constraints: [...(state.project.constraints || []), ...clonedConstraints],
        assemblies: [...state.project.assemblies, newAssembly],
      });
    }

    case 'ASSEMBLY_ARRAY_CREATE': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) return state;

      const assembly = state.project.assemblies.find((entry) => entry.id === action.assemblyId);
      if (!assembly) return state;

      const copies = Math.max(1, Math.floor(action.copies || 0));
      if (copies < 1) return state;

      const sourceParts = state.project.parts.filter((part) => part.assemblyId === assembly.id);
      if (sourceParts.length === 0) return state;

      const sourcePartIds = new Set(sourceParts.map((part) => part.id));
      const newAssemblies = [];
      const newParts = [];
      const newConstraints = [];
      const arrayMode = action.mode === 'linked' ? 'linked' : 'independent';
      const patternType = action.patternType === 'radial' ? 'radial' : 'linear';
      const linkedSourceAssemblyId = assembly.linkedSourceAssemblyId || assembly.id;
      const patternGroupId = action.patternGroupId || assembly.patternGroupId || generateId('pattern');
      const arrayAxis = action.axis || 'x';
      const angleStep = ((Number(action.angleStep) || 15) * Math.PI) / 180;
      const assemblyCenter = getAssemblyCenter(sourceParts);

      for (let index = 1; index <= copies; index += 1) {
        const idMap = new Map();
        const assemblyCopy = {
          ...assembly,
          id: generateId('asm'),
          name: `${assembly.name} ${index + 1}`,
          partIds: [],
          source: 'manual',
          instanceMode: arrayMode,
          linkedSourceAssemblyId: arrayMode === 'linked' ? linkedSourceAssemblyId : null,
          patternGroupId,
          patternType,
        };

        const delta = {
          dx: (action.delta?.dx || 0) * index,
          dy: (action.delta?.dy || 0) * index,
          dz: (action.delta?.dz || 0) * index,
        };

        const clonedParts = sourceParts.map((part) => {
          const cloned = clonePartForAssemblyInstance(part, idMap, {
            assemblyId: assemblyCopy.id,
            instanceMode: arrayMode,
            sourceAssemblyId: linkedSourceAssemblyId,
            patternGroupId,
            patternType,
            linkedSourcePartId: part.linkedSourcePartId || part.id,
            positionTransform: () => {
              if (patternType === 'radial') {
                const dims = getPartDimensions(part);
                const sourceCenter = {
                  x: part.position.x + dims.width / 2,
                  y: part.position.y + dims.depth / 2,
                  z: part.position.z + dims.height / 2,
                };
                const rotatedCenter = rotatePointAroundAxis(
                  sourceCenter,
                  assemblyCenter,
                  arrayAxis,
                  angleStep * index
                );
                return {
                  x: rotatedCenter.x - dims.width / 2,
                  y: rotatedCenter.y - dims.depth / 2,
                  z: rotatedCenter.z - dims.height / 2,
                };
              }

              return {
                x: part.position.x + delta.dx,
                y: part.position.y + delta.dy,
                z: part.position.z + delta.dz,
              };
            },
          });
          if (patternType === 'radial') {
            cloned.rotation = {
              ...(cloned.rotation || { x: 0, y: 0, z: 0 }),
              [arrayAxis]: (cloned.rotation?.[arrayAxis] || 0) + angleStep * index,
            };
          }
          return cloned;
        });

        for (const clonedPart of clonedParts) {
          if (clonedPart.parentId && idMap.has(clonedPart.parentId)) {
            clonedPart.parentId = idMap.get(clonedPart.parentId);
          }
        }

        assemblyCopy.partIds = clonedParts.map((part) => part.id);
        newAssemblies.push(assemblyCopy);
        newParts.push(...clonedParts);
        newConstraints.push(...cloneInternalConstraints(state.project.constraints, sourcePartIds, idMap));
      }

      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: [...state.project.assemblies, ...newAssemblies],
        parts: [...state.project.parts, ...newParts],
        constraints: [...(state.project.constraints || []), ...newConstraints],
      };
      nextProject = applyConstraints(nextProject);
      return applyUpdate(state, nextProject);
    }

    case 'ASSEMBLY_MIRROR_CREATE': {
      const managedObject = getManagedObjectForAssembly(state.project, action.assemblyId);
      if (managedObject) return state;

      const assembly = state.project.assemblies.find((entry) => entry.id === action.assemblyId);
      if (!assembly) return state;

      const sourceParts = state.project.parts.filter((part) => part.assemblyId === assembly.id);
      if (sourceParts.length === 0) return state;

      const sourcePartIds = new Set(sourceParts.map((part) => part.id));
      const idMap = new Map();
      const mirrorAxis = action.axis || 'x';
      const mirrorMode = action.mode === 'linked' ? 'linked' : 'independent';
      const linkedSourceAssemblyId = assembly.linkedSourceAssemblyId || assembly.id;
      const patternGroupId = action.patternGroupId || assembly.patternGroupId || generateId('pattern');
      const scopeParts = assembly.objectId
        ? state.project.parts.filter((part) => part.objectId === assembly.objectId && part.type !== 'dimension')
        : sourceParts;
      const scopeBounds = getPartsBounds3d(scopeParts);
      const mirrorCenter = scopeBounds.empty
        ? getAssemblyCenter(sourceParts)
        : {
            x: (scopeBounds.min.x + scopeBounds.max.x) / 2,
            y: (scopeBounds.min.y + scopeBounds.max.y) / 2,
            z: (scopeBounds.min.z + scopeBounds.max.z) / 2,
          };

      const mirroredAssembly = {
        ...assembly,
        id: generateId('asm'),
        name: `${assembly.name} Mirror`,
        partIds: [],
        source: 'manual',
        instanceMode: mirrorMode,
        linkedSourceAssemblyId: mirrorMode === 'linked' ? linkedSourceAssemblyId : null,
        patternGroupId,
        patternType: 'mirror',
        mirrorSourceAssemblyId: assembly.id,
      };

      const mirroredParts = sourceParts.map((part) => {
        const cloned = clonePartForAssemblyInstance(part, idMap, {
          assemblyId: mirroredAssembly.id,
          instanceMode: mirrorMode,
          sourceAssemblyId: linkedSourceAssemblyId,
          patternGroupId,
          patternType: 'mirror',
          linkedSourcePartId: part.linkedSourcePartId || part.id,
          positionTransform: () => mirrorPartPosition(part, mirrorCenter, mirrorAxis),
        });
        cloned.flip = {
          ...(cloned.flip || { x: false, y: false, z: false }),
          [mirrorAxis]: !(cloned.flip?.[mirrorAxis] || false),
        };
        return cloned;
      });

      for (const clonedPart of mirroredParts) {
        if (clonedPart.parentId && idMap.has(clonedPart.parentId)) {
          clonedPart.parentId = idMap.get(clonedPart.parentId);
        }
      }

      mirroredAssembly.partIds = mirroredParts.map((part) => part.id);
      const mirroredConstraints = cloneInternalConstraints(state.project.constraints, sourcePartIds, idMap);

      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: [...state.project.assemblies, mirroredAssembly],
        parts: [...state.project.parts, ...mirroredParts],
        constraints: [...(state.project.constraints || []), ...mirroredConstraints],
      };
      nextProject = applyConstraints(nextProject);
      return applyUpdate(state, nextProject);
    }

    case 'ASSEMBLY_DETACH_LINK': {
      const assembly = state.project.assemblies.find((entry) => entry.id === action.assemblyId);
      if (!assembly) return state;

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: state.project.assemblies.map((entry) => (
          entry.id === assembly.id
            ? {
                ...entry,
                instanceMode: 'independent',
                linkedSourceAssemblyId: null,
                patternGroupId: null,
                patternType: null,
                mirrorSourceAssemblyId: null,
              }
            : entry
        )),
        parts: state.project.parts.map((part) => (
          part.assemblyId === assembly.id
            ? {
                ...part,
                linkedSourcePartId: null,
                linkedSourceAssemblyId: null,
                patternGroupId: null,
                patternType: null,
                instanceMode: 'independent',
              }
            : part
        )),
      });
    }

    case 'PART_WRAP_IN_ASSEMBLY': {
      const managedObject = getManagedObjectForPart(state.project, action.partId);
      if (managedObject) return state;

      const part = state.project.parts.find((entry) => entry.id === action.partId);
      if (!part) return state;

      const branchIds = collectPartBranchIds(state.project, action.partId);
      const assembly = createAssembly(action.assembly.name, {
        ...action.assembly,
        objectId: action.assembly.objectId ?? part.objectId ?? null,
        partIds: [...branchIds],
        source: action.assembly.source || 'manual',
      });

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        assemblies: [
          ...state.project.assemblies.map((entry) => ({
            ...entry,
            partIds: entry.partIds.filter((id) => !branchIds.has(id)),
          })),
          assembly,
        ],
        parts: state.project.parts.map((entry) => (
          branchIds.has(entry.id)
            ? {
                ...entry,
                assemblyId: assembly.id,
                objectId: assembly.objectId ?? entry.objectId ?? null,
              }
            : entry
        )),
      });
    }

    case 'PART_PASTE': {
      const { partData, children = [], targetPosition } = action;
      const idMap = new Map();
      const cloned = clonePart(partData, idMap);
      // Override position with target instead of +50 offset
      cloned.position = { ...cloned.position, x: targetPosition.x, y: targetPosition.y, z: targetPosition.z };
      const clonedChildren = children.map((child) => {
        const clonedChild = clonePart(child, idMap);
        clonedChild.parentId = cloned.id;
        // Offset children relative to parent
        const dx = child.position.x - partData.position.x;
        const dy = child.position.y - partData.position.y;
        const dz = child.position.z - partData.position.z;
        clonedChild.position = {
          x: targetPosition.x + dx,
          y: targetPosition.y + dy,
          z: targetPosition.z + dz,
        };
        return clonedChild;
      });

      const newParts = [cloned, ...clonedChildren];
      let assemblies = state.project.assemblies;
      if (partData.assemblyId) {
        assemblies = assemblies.map((assembly) => {
          if (assembly.id === partData.assemblyId) {
            return {
              ...assembly,
              partIds: [...assembly.partIds, ...newParts.map((entry) => entry.id)],
            };
          }
          return assembly;
        });
        for (const nextPart of newParts) {
          nextPart.assemblyId = partData.assemblyId;
        }
      }

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: [...state.project.parts, ...newParts],
        assemblies,
      });
    }

    case 'ASSEMBLY_PASTE': {
      const { assemblyData, memberParts, targetPosition } = action;

      // Compute center of original assembly parts
      let cx = 0, cy = 0, cz = 0;
      const geomParts = memberParts.filter((p) => p.type !== 'dimension');
      if (geomParts.length > 0) {
        for (const part of geomParts) {
          cx += part.position.x;
          cy += part.position.y;
          cz += part.position.z;
        }
        cx /= geomParts.length;
        cy /= geomParts.length;
        cz /= geomParts.length;
      }

      const dx = targetPosition.x - cx;
      const dy = targetPosition.y - cy;
      const dz = targetPosition.z - cz;

      const idMap = new Map();
      const newAssemblyId = generateId('asm');
      const newAssembly = {
        ...assemblyData,
        id: newAssemblyId,
        name: `${assemblyData.name} (copy)`,
        partIds: [],
        objectId: assemblyData.objectId || null,
        source: 'manual',
      };

      const clonedParts = [];
      for (const part of memberParts) {
        const cloned = clonePart(part, idMap);
        cloned.assemblyId = newAssemblyId;
        cloned.position = {
          x: part.position.x + dx,
          y: part.position.y + dy,
          z: part.position.z + dz,
        };
        clonedParts.push(cloned);
      }

      for (const clonedPart of clonedParts) {
        if (clonedPart.parentId && idMap.has(clonedPart.parentId)) {
          clonedPart.parentId = idMap.get(clonedPart.parentId);
        }
      }

      newAssembly.partIds = clonedParts.map((part) => part.id);

      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        parts: [...state.project.parts, ...clonedParts],
        assemblies: [...state.project.assemblies, newAssembly],
      });
    }

    case 'OBJECT_ADD':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        objects: [...(state.project.objects || []), createSketchObject(action.object.name, action.object)],
      });

    case 'OBJECT_CREATE': {
      const object = createSketchObject(action.object.name, action.object);
      const assemblies = (action.assemblies || []).map((assembly) => createAssembly(assembly.name, assembly));
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        objects: [...(state.project.objects || []), object],
        assemblies: [...state.project.assemblies, ...assemblies],
      });
    }

    case 'OBJECT_UPDATE':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        objects: (state.project.objects || []).map((object) => (
          object.id === action.object.id
            ? {
                ...object,
                ...action.object,
                templateParams: action.object.templateParams
                  ? { ...action.object.templateParams }
                  : object.templateParams,
                dimensions: action.object.dimensions
                  ? { ...action.object.dimensions }
                  : object.dimensions,
                updatedAt: new Date().toISOString(),
              }
            : object
        )),
      });

    case 'OBJECT_RESIZE': {
      const object = getManagedObject(state.project, action.objectId);
      if (!object || object.editingPolicy === 'parametric') return state;

      const now = new Date().toISOString();
      const objectParts = state.project.parts.filter((part) => part.objectId === object.id);
      const geometryParts = objectParts.filter(isObjectGeometryPart);
      const requestedDimensions = action.dimensions || {};

      if (geometryParts.length === 0) {
        const nextDimensions = {
          ...object.dimensions,
          ...(Number.isFinite(requestedDimensions.width) ? { width: clampDimension(requestedDimensions.width) } : {}),
          ...(Number.isFinite(requestedDimensions.depth) ? { depth: clampDimension(requestedDimensions.depth) } : {}),
          ...(Number.isFinite(requestedDimensions.height) ? { height: clampDimension(requestedDimensions.height) } : {}),
        };

        const unchanged = (
          object.dimensions?.width === nextDimensions.width
          && object.dimensions?.depth === nextDimensions.depth
          && object.dimensions?.height === nextDimensions.height
        );
        if (unchanged) return state;

        return applyUpdate(state, {
          ...state.project,
          updatedAt: now,
          objects: (state.project.objects || []).map((entry) => (
            entry.id === object.id
              ? {
                  ...entry,
                  dimensions: nextDimensions,
                  updatedAt: now,
                }
              : entry
          )),
        });
      }

      const currentBounds = getPartsBounds3d(geometryParts);
      const { nextDimensions, scaleFactors } = buildObjectScaleFactors(currentBounds, requestedDimensions);
      const hasScaleChange = hasMeaningfulScaleChange(scaleFactors);

      if (!hasScaleChange) {
        return state;
      }

      const anchor = currentBounds.min;
      const resizedPartIds = new Set();
      let nextProject = {
        ...state.project,
        updatedAt: now,
        objects: (state.project.objects || []).map((entry) => (
          entry.id === object.id
            ? {
                ...entry,
                origin: scalePoint3d(entry.origin, anchor, scaleFactors),
                dimensions: nextDimensions,
                updatedAt: now,
              }
            : entry
        )),
        parts: state.project.parts.map((part) => {
          if (part.objectId !== object.id) return part;
          const resized = resizePartForObject(part, anchor, scaleFactors);
          if (part.type !== 'dimension') {
            resizedPartIds.add(part.id);
            return sanitizePart(resized);
          }
          return resized;
        }),
      };

      nextProject = applyConstraints(nextProject);
      for (const partId of resizedPartIds) {
        nextProject = updateBoundDimensions(nextProject, partId);
      }

      return applyUpdate(state, nextProject);
    }

    case 'OBJECT_DELETE': {
      const object = getManagedObject(state.project, action.objectId);
      if (!object) return state;

      const strippedProject = removeObjectArtifacts(state.project, object.id);
      return applyUpdate(state, {
        ...strippedProject,
        updatedAt: new Date().toISOString(),
        objects: (strippedProject.objects || []).filter((entry) => entry.id !== object.id),
      });
    }

    case 'OBJECT_MOVE': {
      const object = getManagedObject(state.project, action.objectId);
      if (!object) return state;

      const partIds = new Set(
        state.project.parts.filter((part) => part.objectId === object.id).map((part) => part.id)
      );

      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        objects: state.project.objects.map((entry) => (
          entry.id === object.id
            ? {
                ...entry,
                origin: {
                  x: entry.origin.x + (action.delta.dx || 0),
                  y: entry.origin.y + (action.delta.dy || 0),
                  z: entry.origin.z + (action.delta.dz || 0),
                },
                updatedAt: new Date().toISOString(),
              }
            : entry
        )),
        parts: state.project.parts.map((part) => {
          if (!partIds.has(part.id) || part.type === 'dimension') return part;
          return sanitizePart({
            ...part,
            position: {
              x: part.position.x + (action.delta.dx || 0),
              y: part.position.y + (action.delta.dy || 0),
              z: part.position.z + (action.delta.dz || 0),
            },
          });
        }),
      };
      nextProject = applyConstraints(nextProject);
      for (const partId of partIds) {
        nextProject = updateBoundDimensions(nextProject, partId);
      }
      return applyUpdate(state, nextProject);
    }

    case 'OBJECT_DETACH': {
      const object = getManagedObject(state.project, action.objectId);
      if (!object) return state;
      return applyUpdate(state, {
        ...detachManagedObject(state.project, object.id),
        updatedAt: new Date().toISOString(),
      });
    }

    case 'CONSTRAINT_ADD': {
      const constraints = [...(state.project.constraints || []), action.constraint];
      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        constraints,
      };
      nextProject = applyConstraints(nextProject);
      return applyUpdate(state, nextProject);
    }

    case 'CONSTRAINT_UPDATE': {
      const constraints = (state.project.constraints || []).map((constraint) => (
        constraint.id === action.constraint.id ? { ...constraint, ...action.constraint } : constraint
      ));
      let nextProject = {
        ...state.project,
        updatedAt: new Date().toISOString(),
        constraints,
      };
      nextProject = applyConstraints(nextProject);
      return applyUpdate(state, nextProject);
    }

    case 'CONSTRAINT_DELETE': {
      const constraints = (state.project.constraints || []).filter(
        (constraint) => constraint.id !== action.constraintId
      );
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        constraints,
      });
    }

    case 'ANNOTATION_ADD':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        annotations: [...(state.project.annotations || []), action.annotation],
      });

    case 'ANNOTATION_UPDATE':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        annotations: (state.project.annotations || []).map((annotation) => (
          annotation.id === action.annotation.id
            ? {
                ...annotation,
                ...action.annotation,
                position: action.annotation.position
                  ? { ...annotation.position, ...action.annotation.position }
                  : annotation.position,
                startPoint: action.annotation.startPoint
                  ? { ...annotation.startPoint, ...action.annotation.startPoint }
                  : annotation.startPoint,
                endPoint: action.annotation.endPoint
                  ? { ...annotation.endPoint, ...action.annotation.endPoint }
                  : annotation.endPoint,
                plane: action.annotation.plane
                  ? {
                      ...annotation.plane,
                      ...action.annotation.plane,
                      origin: action.annotation.plane.origin
                        ? { ...annotation.plane?.origin, ...action.annotation.plane.origin }
                        : annotation.plane?.origin,
                      normal: action.annotation.plane.normal
                        ? { ...annotation.plane?.normal, ...action.annotation.plane.normal }
                        : annotation.plane?.normal,
                      up: action.annotation.plane.up
                        ? { ...annotation.plane?.up, ...action.annotation.plane.up }
                        : annotation.plane?.up,
                      uAxis: action.annotation.plane.uAxis
                        ? { ...annotation.plane?.uAxis, ...action.annotation.plane.uAxis }
                        : annotation.plane?.uAxis,
                      vAxis: action.annotation.plane.vAxis
                        ? { ...annotation.plane?.vAxis, ...action.annotation.plane.vAxis }
                        : annotation.plane?.vAxis,
                    }
                  : annotation.plane,
              }
            : annotation
        )),
      });

    case 'ANNOTATION_DELETE':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        annotations: (state.project.annotations || []).filter((annotation) => annotation.id !== action.annotationId),
      });

    case 'PROJECT_UPDATE_META':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        ...action.meta,
      });

    case 'SKETCH_SHEET_ADD':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: [...(state.project.sheets || []), action.sheet],
      });

    case 'SKETCH_SHEET_UPDATE':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) => (
          sheet.id === action.sheet.id ? { ...sheet, ...action.sheet } : sheet
        )),
      });

    case 'SKETCH_SHEET_DELETE':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).filter((sheet) => sheet.id !== action.sheetId),
      });

    case 'SKETCH_SHEET_VIEWPORT_ADD': {
      const targetSheet = (state.project.sheets || []).find((sheet) => sheet.id === action.sheetId);
      if (!targetSheet) return state;
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: state.project.sheets.map((sheet) => (
          sheet.id === action.sheetId
            ? { ...sheet, viewports: [...(sheet.viewports || []), action.viewport] }
            : sheet
        )),
      });
    }

    case 'SKETCH_SHEET_VIEWPORT_UPDATE':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) => (
          sheet.id === action.sheetId
            ? {
                ...sheet,
                viewports: (sheet.viewports || []).map((viewport) => (
                  viewport.id === action.viewport.id ? { ...viewport, ...action.viewport } : viewport
                )),
              }
            : sheet
        )),
      });

    case 'SKETCH_SHEET_VIEWPORT_DELETE':
      return applyUpdate(state, {
        ...state.project,
        updatedAt: new Date().toISOString(),
        sheets: (state.project.sheets || []).map((sheet) => (
          sheet.id === action.sheetId
            ? { ...sheet, viewports: (sheet.viewports || []).filter((viewport) => viewport.id !== action.viewportId) }
            : sheet
        )),
      });

    case 'TEMPLATE_GENERATE': {
      const generated = generateObjectFromTemplate(action.templateType, action.params, {
        objectId: action.objectId,
        name: action.name,
        origin: action.origin,
      });
      return applyUpdate(state, {
        ...addGeneratedObject(state.project, generated),
        updatedAt: new Date().toISOString(),
      });
    }

    case 'TEMPLATE_REGENERATE': {
      const object = action.objectId
        ? getManagedObject(state.project, action.objectId)
        : getManagedObjectForAssembly(state.project, action.assemblyId);
      if (!object || !object.templateType) return state;

      const nextProject = rebuildManagedObject(state.project, object, action.params);
      return applyUpdate(state, {
        ...nextProject,
        updatedAt: new Date().toISOString(),
      });
    }

    case 'TEMPLATE_DETACH': {
      const object = action.objectId
        ? getManagedObject(state.project, action.objectId)
        : getManagedObjectForAssembly(state.project, action.assemblyId);
      if (!object) return state;
      return sketchReducer(state, { type: 'OBJECT_DETACH', objectId: object.id });
    }

    case 'UNDO': {
      if (state.history.length === 0) return state;
      const previous = state.history[state.history.length - 1];
      return {
        ...state,
        project: previous,
        history: state.history.slice(0, -1),
        future: [state.project, ...state.future].slice(0, HISTORY_LIMIT),
        isDirty: snapshotSketch(previous) !== state.savedSnapshot,
      };
    }

    case 'REDO': {
      if (state.future.length === 0) return state;
      const next = state.future[0];
      return {
        ...state,
        project: next,
        history: [...state.history, state.project].slice(-HISTORY_LIMIT),
        future: state.future.slice(1),
        isDirty: snapshotSketch(next) !== state.savedSnapshot,
      };
    }

    case 'MARK_SAVED':
      return {
        ...state,
        isDirty: false,
        savedSnapshot: snapshotSketch(state.project),
      };

    default:
      return state;
  }
}

function createInitialState(project) {
  return {
    project: syncManualObjectDimensions(normalizeSketchObjects(project)),
    isDirty: false,
    savedSnapshot: snapshotSketch(syncManualObjectDimensions(normalizeSketchObjects(project))),
    history: [],
    future: [],
  };
}

export function SketchProvider({ children, initialProject }) {
  const [state, dispatch] = useReducer(
    sketchReducer,
    syncManualObjectDimensions(normalizeSketchObjects(initialProject || createSketchProject())),
    createInitialState
  );

  return (
    <SketchContext.Provider value={{ state, dispatch }}>
      {children}
    </SketchContext.Provider>
  );
}

export function useSketch() {
  const ctx = useContext(SketchContext);
  if (!ctx) throw new Error('useSketch must be used within SketchProvider');
  const { state, dispatch } = ctx;

  const getPart = useCallback(
    (partId) => state.project.parts.find((part) => part.id === partId) || null,
    [state.project.parts]
  );

  const getAssembly = useCallback(
    (assemblyId) => state.project.assemblies.find((assembly) => assembly.id === assemblyId) || null,
    [state.project.assemblies]
  );

  const getObject = useCallback(
    (objectId) => (state.project.objects || []).find((object) => object.id === objectId) || null,
    [state.project.objects]
  );

  const getPartsForAssembly = useCallback(
    (assemblyId) => state.project.parts.filter((part) => part.assemblyId === assemblyId),
    [state.project.parts]
  );

  const getChildParts = useCallback(
    (parentId) => state.project.parts.filter((part) => part.parentId === parentId),
    [state.project.parts]
  );

  const getAssembliesForObject = useCallback(
    (objectId) => state.project.assemblies.filter((assembly) => assembly.objectId === objectId),
    [state.project.assemblies]
  );

  return {
    project: state.project,
    isDirty: state.isDirty,
    canUndo: state.history.length > 0,
    canRedo: state.future.length > 0,
    dispatch,
    getPart,
    getAssembly,
    getObject,
    getPartsForAssembly,
    getChildParts,
    getAssembliesForObject,
  };
}
