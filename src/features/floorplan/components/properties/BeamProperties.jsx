import { memo } from 'react';
import { getBeamDisplayLabel } from '@/domain/beamLabels';
import { getColumnListLabel } from '@/domain/columnLabels';
import { resolveBeamBearingLevel } from '@/domain/beamLevels';
import { getFloorElevation } from '@/domain/floorModels';
import { beamLength } from '@/geometry/beamGeometry';
import PhaseSelector from '../PhaseSelector';
import { NumberField, Readout, Section, Status, panelKitStyles } from './PanelKit';

function BeamProperties({ beam, floor, dispatch, floorId, u, phases }) {
  const updateBeam = (updates) => {
    dispatch({ type: 'BEAM_UPDATE', floorId, beam: { id: beam.id, ...updates } });
  };

  const startColumn = (floor.columns || []).find((column) => column.id === beam.startRef?.id);
  const endColumn = (floor.columns || []).find((column) => column.id === beam.endRef?.id);
  const len = beamLength(beam, floor.columns || []);
  const bearingLevel = resolveBeamBearingLevel(floor, [beam.startRef?.id, beam.endRef?.id]);
  const isRoofRingBeam = beam.placementRole === 'roof_ring' || Math.abs((beam.floorLevel ?? 0) - bearingLevel) < 1;
  // What an auto-height wall running under this beam gets built to. Negative or
  // tiny means the beam is at or below this floor's own datum, where it frames
  // the deck rather than capping a wall.
  const clearHeightUnder = (beam.floorLevel ?? 0) - (beam.depth || 0) - getFloorElevation(floor);
  const carriesWalls = clearHeightUnder >= 100;

  return (
    <div className={panelKitStyles.gutter}>
      <PhaseSelector phaseId={beam.phaseId} phases={phases} onChange={(v) => updateBeam({ phaseId: v })} />

      {carriesWalls ? null : (
        <Status tone="warning">
          Soffit is at or below this floor&rsquo;s datum, so this beam sets no wall height here. Set Level to{' '}
          {Math.round(u.toDisplay(bearingLevel))} {u.suffix} to sit it on the column tops.
        </Status>
      )}

      <Section id="beam.section" title="Section" summary={`${u.toDisplay(beam.width)} × ${u.toDisplay(beam.depth)}`}>
        <NumberField
          label="Width"
          value={u.toDisplay(beam.width)}
          step={u.step(10)}
          unit={u.suffix}
          onChange={(v) => updateBeam({ width: Math.max(50, u.fromDisplay(v)) })}
        />
        <NumberField
          label="Depth"
          value={u.toDisplay(beam.depth)}
          step={u.step(10)}
          unit={u.suffix}
          onChange={(v) => updateBeam({ depth: Math.max(50, u.fromDisplay(v)) })}
        />
        <NumberField
          label="Level (top)"
          value={u.toDisplay(beam.floorLevel)}
          step={u.step(100)}
          unit={u.suffix}
          onChange={(v) => {
            const floorLevel = u.fromDisplay(v);
            updateBeam({
              floorLevel,
              placementRole: Math.abs(floorLevel - bearingLevel) < 1 ? 'roof_ring' : 'floor',
            });
          }}
        />
      </Section>

      <Section id="beam.derived" title="Derived" summary={`${u.toDisplay(len)} span`}>
        <Readout label="Label" value={getBeamDisplayLabel(beam, floor.columns || [])} muted />
        <Readout
          label="From"
          value={startColumn ? getColumnListLabel(startColumn, floor.columns || []) : beam.startRef?.id || '—'}
          muted
        />
        <Readout
          label="To"
          value={endColumn ? getColumnListLabel(endColumn, floor.columns || []) : beam.endRef?.id || '—'}
          muted
        />
        <Readout label="Placement" value={isRoofRingBeam ? 'Top / roof' : 'Floor / slab'} muted />
        <Readout label="Span" value={u.toDisplay(len)} unit={u.suffix} />
        {carriesWalls ? <Readout label="Clear under" value={u.toDisplay(clearHeightUnder)} unit={u.suffix} /> : null}
      </Section>
    </div>
  );
}

export default memo(BeamProperties);
