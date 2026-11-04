import { memo } from 'react';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';
import { FIXTURE_LABELS, FIXTURE_TYPES } from '@/editor/tools';
import { FIXTURE_PLANT_LARGE_WIDTH, FIXTURE_PLANT_WIDTH } from '@/domain/defaults';
import { SelectField, panelKitStyles } from './PanelKit';

function FixtureProperties({ fixture, dispatch, floorId, u, phases }) {
  const updateFixture = (updates) => {
    dispatch({ type: 'FIXTURE_UPDATE', floorId, fixture: { id: fixture.id, ...updates } });
  };

  const fixtureTypeLabels = FIXTURE_LABELS;
  const isPlant = fixture.fixtureType === FIXTURE_TYPES.PLANT;
  const plantSize = fixture.width >= (FIXTURE_PLANT_WIDTH + FIXTURE_PLANT_LARGE_WIDTH) / 2 ? 'large' : 'small';

  return (
    <div>
      <div className={styles.title}>Fixture</div>
      <PhaseSelector phaseId={fixture.phaseId} phases={phases} onChange={(v) => updateFixture({ phaseId: v })} />
      <InputField label="Name" value={fixture.name} onChange={(v) => updateFixture({ name: v })} />
      <InputField label="Type" value={fixtureTypeLabels[fixture.fixtureType] || fixture.fixtureType} readOnly />
      {isPlant ? (
        <div className={panelKitStyles.gutter}>
          <SelectField
            label="Size"
            value={plantSize}
            onChange={(value) => {
              const size = value === 'large' ? FIXTURE_PLANT_LARGE_WIDTH : FIXTURE_PLANT_WIDTH;
              updateFixture({ width: size, depth: size });
            }}
          >
            <option value="small">Pot plant · 500 mm</option>
            <option value="large">Floor plant · 800 mm</option>
          </SelectField>
        </div>
      ) : null}
      <div className={styles.subtitle}>Position</div>
      <InputField
        label="X"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(fixture.x)}
        onChange={(v) => updateFixture({ x: u.fromDisplay(v) })}
      />
      <InputField
        label="Y"
        type="number"
        suffix={u.suffix}
        value={u.toDisplay(fixture.y)}
        onChange={(v) => updateFixture({ y: u.fromDisplay(v) })}
      />
      <div className={styles.subtitle}>Dimensions</div>
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(fixture.width)}
        onChange={(v) => updateFixture({ width: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Depth"
        type="number"
        suffix={u.suffix}
        step={u.step(10)}
        value={u.toDisplay(fixture.depth)}
        onChange={(v) => updateFixture({ depth: Math.max(50, u.fromDisplay(v)) })}
      />
      <InputField
        label="Rotation"
        type="number"
        suffix="°"
        step={15}
        value={fixture.rotation}
        onChange={(v) => updateFixture({ rotation: ((+v % 360) + 360) % 360 })}
      />
    </div>
  );
}

export default memo(FixtureProperties);
