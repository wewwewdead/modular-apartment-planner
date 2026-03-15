import { ProjectValidationError } from './errors';
import { PHASE_ASSIGNABLE_KEYS } from '@/domain/phaseAssignments';

export function validateProjectStructure(project) {
  const errors = [];

  if (!project || typeof project !== 'object') {
    errors.push({ path: '', message: 'Project must be a non-null object' });
    return errors;
  }
  if (typeof project.id !== 'string' || !project.id) {
    errors.push({ path: 'id', message: 'Project must have a non-empty string id' });
  }
  if (typeof project.name !== 'string' || !project.name) {
    errors.push({ path: 'name', message: 'Project must have a non-empty string name' });
  }
  if (!Array.isArray(project.floors) || project.floors.length === 0) {
    errors.push({ path: 'floors', message: 'Project must have a non-empty floors array' });
    return errors;
  }

  project.floors.forEach((floor, fi) => {
    if (!floor.id) {
      errors.push({ path: `floors[${fi}].id`, message: 'Floor must have an id' });
    }
    if (!Array.isArray(floor.walls)) {
      errors.push({ path: `floors[${fi}].walls`, message: 'Floor must have a walls array' });
    }

    for (const door of (floor.doors || [])) {
      if (!door.id) errors.push({ path: `floors[${fi}].doors`, message: 'Door missing id' });
      if (!door.wallId) errors.push({ path: `floors[${fi}].doors`, message: `Door ${door.id || '?'} missing wallId` });
    }

    for (const win of (floor.windows || [])) {
      if (!win.id) errors.push({ path: `floors[${fi}].windows`, message: 'Window missing id' });
      if (!win.wallId) errors.push({ path: `floors[${fi}].windows`, message: `Window ${win.id || '?'} missing wallId` });
    }
  });

  return errors;
}

export function validateProjectReferences(project) {
  const warnings = [];

  const floorIds = new Set(project.floors.map((f) => f.id));
  const phaseIds = new Set((project.phases || []).map((p) => p.id));

  for (const floor of project.floors) {
    const wallIds = new Set((floor.walls || []).map((w) => w.id));
    const landingIds = new Set((floor.landings || []).map((l) => l.id));
    const columnIds = new Set((floor.columns || []).map((c) => c.id));

    for (const door of (floor.doors || [])) {
      if (door.wallId && !wallIds.has(door.wallId)) {
        warnings.push({ path: `floor ${floor.id} door ${door.id}`, message: `References non-existent wall ${door.wallId}` });
      }
    }

    for (const win of (floor.windows || [])) {
      if (win.wallId && !wallIds.has(win.wallId)) {
        warnings.push({ path: `floor ${floor.id} window ${win.id}`, message: `References non-existent wall ${win.wallId}` });
      }
    }

    for (const beam of (floor.beams || [])) {
      if (beam.startRef?.columnId && !columnIds.has(beam.startRef.columnId)) {
        warnings.push({ path: `floor ${floor.id} beam ${beam.id}`, message: `startRef references non-existent column ${beam.startRef.columnId}` });
      }
      if (beam.endRef?.columnId && !columnIds.has(beam.endRef.columnId)) {
        warnings.push({ path: `floor ${floor.id} beam ${beam.id}`, message: `endRef references non-existent column ${beam.endRef.columnId}` });
      }
    }

    for (const stair of (floor.stairs || [])) {
      if (stair.floorRelation?.fromFloorId && !floorIds.has(stair.floorRelation.fromFloorId)) {
        warnings.push({ path: `floor ${floor.id} stair ${stair.id}`, message: `fromFloorId references non-existent floor ${stair.floorRelation.fromFloorId}` });
      }
      if (stair.floorRelation?.toFloorId && !floorIds.has(stair.floorRelation.toFloorId)) {
        warnings.push({ path: `floor ${floor.id} stair ${stair.id}`, message: `toFloorId references non-existent floor ${stair.floorRelation.toFloorId}` });
      }
      if (stair.startLandingAttachment?.landingId && !landingIds.has(stair.startLandingAttachment.landingId)) {
        warnings.push({ path: `floor ${floor.id} stair ${stair.id}`, message: `startLandingAttachment references non-existent landing ${stair.startLandingAttachment.landingId}` });
      }
      if (stair.endLandingAttachment?.landingId && !landingIds.has(stair.endLandingAttachment.landingId)) {
        warnings.push({ path: `floor ${floor.id} stair ${stair.id}`, message: `endLandingAttachment references non-existent landing ${stair.endLandingAttachment.landingId}` });
      }
    }

    for (const slab of (floor.slabs || [])) {
      if (slab.floorId && !floorIds.has(slab.floorId)) {
        warnings.push({ path: `floor ${floor.id} slab ${slab.id}`, message: `floorId references non-existent floor ${slab.floorId}` });
      }
    }

    // Check phaseId references on all phase-assignable objects
    for (const key of PHASE_ASSIGNABLE_KEYS) {
      for (const obj of (floor[key] || [])) {
        if (obj.phaseId && !phaseIds.has(obj.phaseId)) {
          warnings.push({ path: `floor ${floor.id} ${key} ${obj.id}`, message: `phaseId references non-existent phase ${obj.phaseId}` });
        }
      }
    }
  }

  // Check phaseId on roof system and truss systems
  if (project.roofSystem?.phaseId && !phaseIds.has(project.roofSystem.phaseId)) {
    warnings.push({ path: 'roofSystem', message: `phaseId references non-existent phase ${project.roofSystem.phaseId}` });
  }
  for (const ts of (project.trussSystems || [])) {
    if (ts.phaseId && !phaseIds.has(ts.phaseId)) {
      warnings.push({ path: `trussSystem ${ts.id}`, message: `phaseId references non-existent phase ${ts.phaseId}` });
    }
  }

  // Check viewport phaseId references
  for (const sheet of (project.sheets || [])) {
    for (const vp of (sheet.viewports || [])) {
      if (vp.phaseId && !phaseIds.has(vp.phaseId)) {
        warnings.push({ path: `sheet ${sheet.id} viewport ${vp.id}`, message: `phaseId references non-existent phase ${vp.phaseId}` });
      }
    }
  }

  return warnings;
}

export function repairBrokenReferences(project) {
  const floorIds = new Set(project.floors.map((f) => f.id));
  const phaseIds = new Set((project.phases || []).map((p) => p.id));

  const repairedFloors = project.floors.map((floor) => {
    const wallIds = new Set((floor.walls || []).map((w) => w.id));
    const landingIds = new Set((floor.landings || []).map((l) => l.id));

    // Remove doors/windows pointing to non-existent walls
    const doors = (floor.doors || []).filter((d) => !d.wallId || wallIds.has(d.wallId));
    const windows = (floor.windows || []).filter((w) => !w.wallId || wallIds.has(w.wallId));

    // Nullify invalid stair landing attachments
    const stairs = (floor.stairs || []).map((stair) => {
      let changed = false;
      let startLandingAttachment = stair.startLandingAttachment;
      let endLandingAttachment = stair.endLandingAttachment;

      if (startLandingAttachment?.landingId && !landingIds.has(startLandingAttachment.landingId)) {
        startLandingAttachment = null;
        changed = true;
      }
      if (endLandingAttachment?.landingId && !landingIds.has(endLandingAttachment.landingId)) {
        endLandingAttachment = null;
        changed = true;
      }
      return changed ? { ...stair, startLandingAttachment, endLandingAttachment } : stair;
    });

    // Nullify invalid phaseId references on floor objects
    const repairedFloor = { ...floor, doors, windows, stairs };
    for (const key of PHASE_ASSIGNABLE_KEYS) {
      const arr = repairedFloor[key];
      if (!Array.isArray(arr)) continue;
      repairedFloor[key] = arr.map((obj) =>
        obj.phaseId && !phaseIds.has(obj.phaseId)
          ? { ...obj, phaseId: null }
          : obj,
      );
    }

    return repairedFloor;
  });

  // Nullify invalid phaseId on roof system
  let roofSystem = project.roofSystem;
  if (roofSystem?.phaseId && !phaseIds.has(roofSystem.phaseId)) {
    roofSystem = { ...roofSystem, phaseId: null };
  }

  // Nullify invalid phaseId on truss systems
  const trussSystems = (project.trussSystems || []).map((ts) =>
    ts.phaseId && !phaseIds.has(ts.phaseId)
      ? { ...ts, phaseId: null }
      : ts,
  );

  // Nullify invalid viewport phaseId references
  const sheets = (project.sheets || []).map((sheet) => ({
    ...sheet,
    viewports: (sheet.viewports || []).map((vp) =>
      vp.phaseId && !phaseIds.has(vp.phaseId)
        ? { ...vp, phaseId: null, phaseViewMode: 'all' }
        : vp,
    ),
  }));

  return { ...project, floors: repairedFloors, roofSystem, trussSystems, sheets };
}

export function validateAndRepair(project) {
  const structuralErrors = validateProjectStructure(project);
  if (structuralErrors.length > 0) {
    throw new ProjectValidationError(
      `Project failed structural validation: ${structuralErrors.map((e) => e.message).join('; ')}`,
      structuralErrors,
    );
  }

  const warnings = validateProjectReferences(project);
  if (warnings.length > 0) {
    console.warn('[persistence] Referential integrity warnings:', warnings);
    return repairBrokenReferences(project);
  }

  return project;
}
