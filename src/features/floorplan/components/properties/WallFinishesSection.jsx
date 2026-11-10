import { WALL_FINISH_APPLY_SCOPES, createWallAssembly } from '@/domain/wallAssemblies';
import {
  WALL_COLOUR_CATALOG,
  WALL_COLOUR_CATALOGUE_LABELS,
  WALL_FINISH_KINDS,
  WALL_FINISH_KIND_LABELS,
  WALL_FINISH_SHEENS,
  WALL_FINISH_SHEEN_LABELS,
  defaultWallFinish,
  wallFinishKindsFor,
} from '@/domain/wallFinishes';
import { ColourField, Hint, Readout, Section, SelectField, Stack } from './PanelKit';
import { wallFaceTakesAccents } from '@/domain/wallAccentModel';
import styles from '../PropertiesPanel.module.css';

const STOCK = 'stock';

const FACE_LABELS = Object.freeze({ exterior: 'Outside', interior: 'Inside' });

const catalogue = (key) => ({ label: WALL_COLOUR_CATALOGUE_LABELS[key], colours: WALL_COLOUR_CATALOG[key] });

// The swatch strips a finish offers. A stain opens on the timbers; paint and
// render open on the facade palette. RAL is always one toggle away.
const PAINT_CATALOGUES = Object.freeze({ facade: catalogue('facade'), ral: catalogue('ral') });
const TIMBER_CATALOGUES = Object.freeze({
  timber: catalogue('timber'),
  facade: catalogue('facade'),
  ral: catalogue('ral'),
});

/** `Paint · Signal Orange`, or `Stock`: the part of a face's finish a closed section can afford. */
function faceSummary(finish) {
  if (!finish) return 'Stock';
  return `${WALL_FINISH_KIND_LABELS[finish.kind]} · ${finish.colour.name}`;
}

/** The faces of this wall that can carry a finish at all, outside first. */
export function finishableWallFaces(assembly, sides = ['exterior', 'interior']) {
  return sides.filter((side) => wallFinishKindsFor(assembly.system, assembly[side]?.material).length > 0);
}

/**
 * What each face of the wall looks like (docs/wall-cladding-finishes.md §5.7).
 *
 * A face's finish is written straight onto its board layer with a plain
 * `WALL_UPDATE` of the assembly — not through the panel's general assembly
 * path, which also rewrites the built thickness and resets a load-bearing
 * declaration: a coat of paint should do neither.
 *
 * The system colour picker reports every colour the pointer crosses, so its
 * pick is bracketed as a drag gesture (`BEGIN_DRAG_GESTURE` … `END_DRAG_GESTURE`,
 * see docs/state-machines.md): the whole pick is one undo step and one
 * coordination pass. A swatch and a typed hex are ordinary single edits.
 */
export function WallFinishesSection({ wall, assembly, floorId, dispatch, sides, onEditAccents = null }) {
  const faces = finishableWallFaces(assembly, sides);

  const setFinish = (side, finish) => {
    const nextAssembly = createWallAssembly(
      assembly.preset,
      { ...assembly, [side]: { ...assembly[side], finish } },
      wall.thickness,
    );
    dispatch({ type: 'WALL_UPDATE', floorId, wall: { id: wall.id, assembly: nextAssembly } });
  };
  const applyFinish = (side, scope) =>
    dispatch({ type: 'WALL_FACE_FINISH_APPLY', floorId, wallId: wall.id, side, scope });
  const beginPick = () => dispatch({ type: 'BEGIN_DRAG_GESTURE' });
  const endPick = () => dispatch({ type: 'END_DRAG_GESTURE' });

  /**
   * A face's accent panels (spec §7.1): how many it has, and the three things
   * the panel can do with them — open the wall detail editor on that face, where
   * they are drawn and edited, clear them, or copy them up and down the facade
   * stack. Masonry and arc walls are out of this phase, and the panel says so
   * rather than offering a button that would do nothing.
   */
  const accentControls = (side, label) => {
    const layer = assembly[side];
    if (!onEditAccents || assembly.system !== 'framed' || !wallFaceTakesAccents(assembly.system, layer.material)) {
      return (
        <Hint>
          Accent panels are drawn on boarded faces of straight framed walls; this{' '}
          {assembly.system === 'masonry' ? 'masonry ' : ''}
          {wall.controlPoint ? 'arc ' : ''}face cannot carry them yet.
        </Hint>
      );
    }
    const count = layer.accents?.length || 0;
    const clearAccents = () => {
      const nextAssembly = createWallAssembly(
        assembly.preset,
        { ...assembly, [side]: { ...layer, accents: [] } },
        wall.thickness,
      );
      dispatch({ type: 'WALL_UPDATE', floorId, wall: { id: wall.id, assembly: nextAssembly } });
    };
    return (
      <>
        <div className={styles.subtitle}>Accent panels</div>
        <Readout label={`${label} accents`} value={count} />
        <Stack>
          <button type="button" className={styles.actionBtn} onClick={() => onEditAccents(side)}>
            Edit accents
          </button>
        </Stack>
        <Stack>
          <button type="button" className={styles.actionBtn} disabled={!count} onClick={clearAccents}>
            Clear accents
          </button>
        </Stack>
        <Stack>
          <button
            type="button"
            className={styles.actionBtn}
            disabled={!wall.stackId}
            title={wall.stackId ? undefined : 'This wall is not part of a facade stack'}
            onClick={() =>
              dispatch({ type: 'WALL_FACE_ACCENTS_APPLY', floorId, wallId: wall.id, side, scope: 'stack' })
            }
          >
            Copy accents to the facade stack
          </button>
        </Stack>
      </>
    );
  };

  const summary = faces.length
    ? faces.map((side) => `${FACE_LABELS[side]}: ${faceSummary(assembly[side].finish)}`).join(' / ')
    : 'No finishable face';

  return (
    <Section id="wall.finishes" title="Finishes" summary={summary}>
      {faces.length === 0 ? (
        <Hint>This wall has no board on either face, so there is nothing to paint. Pick a board under Assembly.</Hint>
      ) : null}
      {faces.map((side) => {
        const label = FACE_LABELS[side];
        const layer = assembly[side];
        const finish = layer.finish || null;
        const kinds = wallFinishKindsFor(assembly.system, layer.material);
        return (
          <div key={side} data-wall-finish-face={side}>
            <div className={styles.subtitle}>{label} face</div>
            <SelectField
              label={`${label} finish`}
              value={finish?.kind || STOCK}
              onChange={(kind) => setFinish(side, kind === STOCK ? null : defaultWallFinish(kind))}
            >
              {/* Siding has no stock look to go back to (spec §6.1). */}
              {layer.material === 'siding' ? null : <option value={STOCK}>Stock</option>}
              {kinds.map((kind) => (
                <option key={kind} value={kind}>
                  {WALL_FINISH_KIND_LABELS[kind]}
                </option>
              ))}
            </SelectField>
            {finish ? (
              <>
                {/* Keyed on the kind: a stain and a paint open on different
                    swatch strips, and the strip a field shows is its own state. */}
                <ColourField
                  key={finish.kind}
                  id={`wall-finish-${side}-colour`}
                  label={`${label} colour`}
                  value={finish.colour}
                  catalogues={finish.kind === WALL_FINISH_KINDS.TIMBER ? TIMBER_CATALOGUES : PAINT_CATALOGUES}
                  onChange={(colour) =>
                    setFinish(side, {
                      ...finish,
                      colour: { hex: colour.hex, name: colour.name, catalogue: colour.catalogue },
                    })
                  }
                  onPickStart={beginPick}
                  onPickEnd={endPick}
                />
                <SelectField
                  label={`${label} sheen`}
                  value={finish.sheen}
                  onChange={(sheen) => setFinish(side, { ...finish, sheen })}
                >
                  {Object.values(WALL_FINISH_SHEENS).map((sheen) => (
                    <option key={sheen} value={sheen}>
                      {WALL_FINISH_SHEEN_LABELS[sheen]}
                    </option>
                  ))}
                </SelectField>
              </>
            ) : null}
            <div className={styles.subtitle}>Apply this finish to</div>
            <Stack>
              <button
                type="button"
                className={styles.actionBtn}
                disabled={!wall.stackId}
                title={wall.stackId ? undefined : 'This wall is not part of a facade stack'}
                onClick={() => applyFinish(side, WALL_FINISH_APPLY_SCOPES.STACK)}
              >
                Whole facade stack
              </button>
            </Stack>
            <Stack>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => applyFinish(side, WALL_FINISH_APPLY_SCOPES.FLOOR)}
              >
                Matching walls on this floor
              </button>
            </Stack>
            <Stack>
              <button
                type="button"
                className={styles.actionBtn}
                onClick={() => applyFinish(side, WALL_FINISH_APPLY_SCOPES.BUILDING)}
              >
                Matching walls in the building
              </button>
            </Stack>
            {accentControls(side, label)}
          </div>
        );
      })}
      {faces.length ? (
        <Hint>
          Matching walls are built the same way, with the same board on that face; the facade stack is this wall and the
          walls above and below it on the same facade. Applying Stock clears their finish. A finish is look only: the
          board, its thickness and the bill are unchanged.
        </Hint>
      ) : null}
    </Section>
  );
}
