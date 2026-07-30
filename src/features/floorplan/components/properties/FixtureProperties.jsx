import { memo } from 'react';
import InputField from '../InputField';
import PhaseSelector from '../PhaseSelector';
import styles from '../PropertiesPanel.module.css';

function FixtureProperties({ fixture, dispatch, floorId, u, phases }) {
  const updateFixture = (updates) => {
    dispatch({ type: 'FIXTURE_UPDATE', floorId, fixture: { id: fixture.id, ...updates } });
  };

  const fixtureTypeLabels = {
    kitchenTop: 'Kitchen Top',
    toilet: 'Toilet',
    lavatory: 'Lavatory',
    table: 'Table',
    tv: 'TV',
    sofa: 'Sofa',
  };

  return (
    <div>
      <div className={styles.title}>Fixture</div>
      <PhaseSelector phaseId={fixture.phaseId} phases={phases} onChange={(v) => updateFixture({ phaseId: v })} />
      <InputField label="Name" value={fixture.name} onChange={(v) => updateFixture({ name: v })} />
      <InputField label="Type" value={fixtureTypeLabels[fixture.fixtureType] || fixture.fixtureType} readOnly />
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
