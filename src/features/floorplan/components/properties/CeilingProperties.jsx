import { memo } from 'react';
import {
  CEILING_ATTACHMENT_MODES,
  getCeilingLocalSpace,
  resolveCeilingBeamSupports,
  resolveCeilingBoundary,
  resolveCeilingDetailing,
  resolveCeilingElevations,
} from '@/domain/ceilingModels';
import { getCeilingProductProfile } from '@/domain/ceilingProductProfiles';
import { polygonArea } from '@/geometry/polygon';
import styles from '../PropertiesPanel.module.css';
import { Hint, Readout, Section, Stack, TextField, panelKitStyles } from './PanelKit';

// A ceiling boards one face — the one looking down into the room — so unlike a
// wall there are no sides to name and the choice is the whole plane or none of
// it. Module scope because it never varies with the ceiling.
const BOARD_VISIBILITY_OPTIONS = [
  { label: 'Shown', hidden: false },
  { label: 'Hidden', hidden: true },
];

/**
 * What a ceiling is, read off the model. Everything but the name is derived —
 * the extent comes from the beams it hangs from and the assembly is designed in
 * the RCP editor — so this panel is readouts and one way through to that editor
 * rather than a second, half-complete set of controls for the same ceiling.
 *
 * The heavy derivations (panels, fasteners, hangers) stay out: they rebuild the
 * whole assembly, and this runs on every selection change.
 */
function CeilingProperties({ ceiling, project, floor, hiddenCeilingBoards, dispatch, editorDispatch, u }) {
  // The selection can outlive its ceiling — deleted from the sidebar while the
  // 3D preview still had it picked.
  if (!ceiling) return null;

  const boardsHidden = Boolean((hiddenCeilingBoards || {})[ceiling.id]);

  const boundary = resolveCeilingBoundary(project, ceiling);
  const space = getCeilingLocalSpace(boundary);
  const elevations = resolveCeilingElevations(project, ceiling);
  const detailing = resolveCeilingDetailing(ceiling);
  const beamHung = ceiling.attachment?.mode === CEILING_ATTACHMENT_MODES.BEAM;
  const supports = beamHung ? resolveCeilingBeamSupports(project, ceiling) : [];
  const profile = getCeilingProductProfile(detailing.face.productProfileId);
  const areaM2 = (polygonArea(boundary) / 1_000_000).toFixed(2);
  // The plane the ceiling hangs from is only news when the boards do not sit on
  // it — a manual ceiling has one elevation, and repeating it says nothing.
  const showAttachmentPlane = beamHung && Math.abs(elevations.attachment - elevations.boardUnderside) > 0.5;

  const updateCeiling = (updates) => {
    dispatch({ type: 'CEILING_UPDATE', ceiling: { id: ceiling.id, ...updates } });
  };

  return (
    <div className={panelKitStyles.gutter}>
      <Stack>
        <button
          type="button"
          className={styles.confirmBtn}
          onClick={() => editorDispatch({ type: 'OPEN_CEILING_DETAIL_EDITOR', ceilingId: ceiling.id })}
        >
          Open assembly editor
        </button>
      </Stack>

      <Section id="ceiling.identity" title="Ceiling" summary={ceiling.name || 'Ceiling'}>
        <TextField label="Name" value={ceiling.name || ''} onChange={(name) => updateCeiling({ name })} />
        <Readout label="Floor" value={floor?.name || 'Unassigned'} muted={!floor} />
      </Section>

      <Section id="ceiling.size" title="Size" summary={`${u.toDisplay(space.length)} × ${u.toDisplay(space.depth)}`}>
        <Readout label="Length" value={u.toDisplay(space.length)} unit={u.suffix} />
        <Readout label="Depth" value={u.toDisplay(space.depth)} unit={u.suffix} />
        <Readout label="Area" value={areaM2} unit="m²" />
        <Hint>Extent follows the beams the ceiling hangs from, or the area traced for it in the RCP editor.</Hint>
      </Section>

      <Section
        id="ceiling.height"
        title="Height"
        summary={beamHung ? `Beam-hung at ${u.toDisplay(elevations.boardUnderside)}` : 'Manual datum'}
      >
        <Readout label="Board underside" value={u.toDisplay(elevations.boardUnderside)} unit={u.suffix} />
        {showAttachmentPlane ? (
          <Readout label="Attachment plane" value={u.toDisplay(elevations.attachment)} unit={u.suffix} />
        ) : null}
        <Readout label="Attachment" value={beamHung ? 'Beam-hung' : 'Manual datum'} />
        {beamHung ? <Readout label="Support beams" value={String(supports.length)} /> : null}
      </Section>

      <Section id="ceiling.assembly" title="Assembly" summary={`${profile.manufacturer} ${profile.product}`}>
        <Readout label="Boards" value={detailing.face.enabled ? 'Boarded' : 'Not boarded'} />
        <Readout label="Board profile" value={`${profile.manufacturer} ${profile.product}`} />
        <Readout label="Light fixtures" value={String(detailing.lighting.fixtures.length)} />
      </Section>

      <Section
        id="ceiling.preview"
        title="3D view"
        defaultOpen={false}
        summary={boardsHidden ? 'Boards hidden' : 'Fully boarded'}
      >
        {detailing.face.enabled ? (
          <>
            <Stack>
              <div className={styles.segmentControl}>
                {BOARD_VISIBILITY_OPTIONS.map((option) => (
                  <button
                    key={option.label}
                    type="button"
                    className={option.hidden === boardsHidden ? styles.segmentBtnActive : styles.segmentBtn}
                    onClick={() =>
                      editorDispatch({
                        type: 'SET_CEILING_BOARD_VISIBILITY',
                        ceilingId: ceiling.id,
                        hidden: option.hidden,
                      })
                    }
                  >
                    {option.label}
                  </button>
                ))}
              </div>
            </Stack>
            <Hint>
              {boardsHidden
                ? 'Stripped in the 3D preview only — the furring, carriers and hangers above are exposed. Drawings and quantities are unaffected.'
                : 'Hide the boards to check the frame above them. Openings, fittings and light fixtures stay.'}
            </Hint>
          </>
        ) : (
          <Hint>This ceiling has no boards, so there is nothing to strip.</Hint>
        )}
      </Section>
    </div>
  );
}

export default memo(CeilingProperties);
