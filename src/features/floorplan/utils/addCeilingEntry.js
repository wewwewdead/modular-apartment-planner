import { getCeilingHostFloor } from '@/domain/cantileverCeiling';
import { CEILING_ATTACHMENT_MODES } from '@/domain/ceilingModels';
import { TOOLS } from '@/editor/tools';

/**
 * Where "add a ceiling" starts, for every control that offers it.
 *
 * The sidebar's + button, the empty-state row and the P key all used to be
 * their own small opinion about what adding a ceiling means — the sidebar
 * branched into the beam-pick tool or created a floor-wide ceiling outright,
 * the key just armed the draw tool. Three answers to one question is three
 * things to learn, so they share this instead.
 *
 * The one distinction worth making is what is already selected. A slab is a
 * statement about which deck the ceiling goes under, and a deck's ceiling
 * belongs to the storey below it — so a selected plate anchors the trace on the
 * floor under it rather than the floor being edited. Everything else is a plain
 * trace on the active floor.
 */

/**
 * Arm the draw tool to trace a ceiling under one plate, filed on the storey
 * below it.
 *
 * The order is load-bearing. SET_TOOL clears the selection and the outgoing
 * tool's state together, and this whole flow is anchored on the plate — so the
 * plate goes straight back afterwards, and the target floor has to be set after
 * that or the tool would wipe its own override on the way in.
 */
export function enterDrawCeilingUnderSlab({ slab, targetFloor, editorDispatch }) {
  if (!slab || !targetFloor) return null;

  editorDispatch({ type: 'SET_TOOL', tool: TOOLS.CEILING });
  editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
  editorDispatch({ type: 'UPDATE_TOOL_STATE', payload: { ceilingTargetFloorId: targetFloor.id } });
  editorDispatch({
    type: 'SET_STATUS_MESSAGE',
    message: 'Trace the ceiling area under this slab — click points, close on the first point.',
  });
  return targetFloor;
}

/**
 * Arm the beam-pick tool to close the part of one plate that its frame encloses,
 * filed on the storey below it.
 *
 * The interior of a plate is not an outline anyone wants to trace: the line a
 * ceiling stops on is a beam face, and the beams are already drawn. So this
 * flow asks for the beams instead and works the area out — the bay they frame,
 * cut to the plate overhead.
 *
 * The beams to click are on the storey BELOW the plan on screen, which the
 * status line has to say outright: they are drawn on this plan because plan
 * coordinates are shared across the stack, and clicking what looks like the
 * floor you are standing on is otherwise exactly what it looks like.
 *
 * Order as in `enterDrawCeilingUnderSlab`, and load-bearing for the same reason:
 * SET_TOOL clears the selection and the outgoing tool's state together, so the
 * plate and then the anchor have to follow it.
 */
export function enterPickCeilingBeamsUnderSlab({ slab, targetFloor, editorDispatch }) {
  if (!slab || !targetFloor) return null;

  editorDispatch({ type: 'SET_TOOL', tool: TOOLS.CEILING_BEAM_PICK });
  editorDispatch({ type: 'SELECT_OBJECT', id: slab.id, objectType: 'slab' });
  editorDispatch({
    type: 'UPDATE_TOOL_STATE',
    payload: { ceilingTargetFloorId: targetFloor.id, ceilingClipSlabId: slab.id },
  });
  editorDispatch({
    type: 'SET_STATUS_MESSAGE',
    message: `Click the beams on ${targetFloor.name}, the storey below this one, then press Enter — the ceiling covers the plate inside them.`,
  });
  return targetFloor;
}

/**
 * Enter whichever ceiling flow the current selection asks for.
 *
 * Deliberately dispatch-only: both branches hand the plan a tool and wait,
 * because which area a ceiling covers is a decision about a room and not
 * something a button can make on someone's behalf.
 *
 * @returns {object | null} the floor the trace will be filed on when the plate
 *   anchored it, null for a plain trace on the active floor.
 */
export function enterAddCeiling({ project, activeFloorId, selectedId, selectedType, editorDispatch }) {
  const floor = (project?.floors || []).find((entry) => entry.id === activeFloorId) || null;
  // Only a plate on the floor being edited anchors anything — a selection left
  // over from another storey says nothing about what is overhead here.
  const slab = selectedType === 'slab' ? (floor?.slabs || []).find((entry) => entry.id === selectedId) || null : null;
  const targetFloor = slab ? getCeilingHostFloor(project, activeFloorId) : null;

  if (slab && targetFloor) return enterDrawCeilingUnderSlab({ slab, targetFloor, editorDispatch });

  editorDispatch({ type: 'SET_TOOL', tool: TOOLS.CEILING });
  editorDispatch({
    type: 'SET_STATUS_MESSAGE',
    message: 'Trace the ceiling area — click points, close on the first point.',
  });
  return null;
}

/**
 * What the automatic trace ended up hanging from, said plainly. The plane is
 * decided for the user by the beams the overhang's deck rests on, so a ceiling
 * that found none is not broken — it just has nothing to attach to yet, and the
 * message names the fix.
 */
function describeCantileverCeilings(ceilings, floorBelow) {
  const primary = ceilings[0];
  const subject = ceilings.length === 1 ? 'Cantilever ceiling' : `${ceilings.length} cantilever ceilings`;
  // With several regions every number below describes one of them, so which one
  // has to be said.
  const about = ceilings.length === 1 ? '' : 'the largest ';

  if (primary.attachment?.mode !== CEILING_ATTACHMENT_MODES.BEAM) {
    return `${subject} added to ${floorBelow.name} — ${about}sits on a manual datum; place top beams on the columns to attach it.`;
  }

  const beamCount = primary.attachment.beamIds.length;
  return `${subject} added to ${floorBelow.name} — ${about}hangs from ${beamCount} beam${
    beamCount === 1 ? '' : 's'
  } at ${Math.round(primary.baseElevation)} mm.`;
}

/**
 * Commit a planned set of cantilever ceilings and open the one that matters.
 *
 * @returns {object | null} the ceiling the editor was opened on.
 */
export function addCantileverCeilings({ plan, dispatch, editorDispatch }) {
  const ceilings = plan?.ceilings || [];
  if (!ceilings.length || !plan.floorBelow) return null;

  for (const ceiling of ceilings) dispatch({ type: 'CEILING_ADD', ceiling });

  // Largest region first out of the planner, so this is the piece of overhang
  // someone actually meant rather than a corner sharing the same plate.
  editorDispatch({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceilings[0].id });
  // Opening the editor clears the status line, so the report goes after it.
  editorDispatch({ type: 'SET_STATUS_MESSAGE', message: describeCantileverCeilings(ceilings, plan.floorBelow) });
  return ceilings[0];
}
