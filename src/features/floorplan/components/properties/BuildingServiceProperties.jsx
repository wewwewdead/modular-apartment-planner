import { memo } from 'react';
import { BUILDING_COMMANDS } from '@/domain/buildingCommands';
import InputField from '../InputField';
import styles from '../PropertiesPanel.module.css';

function BuildingServiceProperties({ entity, serviceType, dispatch, u }) {
  const update = (updates) => {
    const next = { ...entity, ...updates };
    if (updates.origin) next.origin = { ...entity.origin, ...updates.origin };

    if (serviceType === 'plumbingShaft') {
      dispatch({
        type: 'EXECUTE_BUILDING_COMMAND',
        command: {
          type: BUILDING_COMMANDS.CONFIGURE_PLUMBING_SHAFT,
          shaftId: next.id,
          name: next.name,
          origin: next.origin,
          width: next.width,
          depth: next.depth,
          servedFloorIds: next.servedFloorIds,
          maxFixtureDistance: next.maxFixtureDistance,
        },
      });
      return;
    }

    if (serviceType === 'electricalRiser') {
      dispatch({
        type: 'EXECUTE_BUILDING_COMMAND',
        command: {
          type: BUILDING_COMMANDS.CONFIGURE_ELECTRICAL_RISER,
          riserId: next.id,
          name: next.name,
          origin: next.origin,
          width: next.width,
          depth: next.depth,
          servedFloorIds: next.servedFloorIds,
          openingClearance: next.openingClearance,
        },
      });
      return;
    }

    dispatch({
      type: 'EXECUTE_BUILDING_COMMAND',
      command: {
        type: BUILDING_COMMANDS.CONFIGURE_EQUIPMENT_ZONE,
        zoneId: next.id,
        name: next.name,
        kind: next.kind,
        floorId: next.floorId,
        location: next.location,
        origin: next.origin,
        width: next.width,
        depth: next.depth,
        rotation: next.rotation,
        clearance: next.clearance,
        capacity: next.capacity,
        unitCount: next.unitCount,
        servedFloorIds: next.servedFloorIds,
      },
    });
  };

  const title =
    serviceType === 'plumbingShaft'
      ? 'Wet-service shaft'
      : serviceType === 'electricalRiser'
        ? 'Electrical riser'
        : 'Electrical panel';

  return (
    <div>
      <div className={styles.title}>{title}</div>
      <InputField label="Name" value={entity.name || title} onChange={(name) => update({ name })} />
      <InputField
        label="Center X"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(entity.origin.x)}
        onChange={(value) => update({ origin: { x: u.fromDisplay(value) } })}
      />
      <InputField
        label="Center Y"
        type="number"
        suffix={u.suffix}
        step={u.step(100)}
        value={u.toDisplay(entity.origin.y)}
        onChange={(value) => update({ origin: { y: u.fromDisplay(value) } })}
      />
      <InputField
        label="Width"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(entity.width)}
        onChange={(value) => update({ width: Math.max(1, u.fromDisplay(value)) })}
      />
      <InputField
        label="Depth"
        type="number"
        suffix={u.suffix}
        step={u.step(50)}
        value={u.toDisplay(entity.depth)}
        onChange={(value) => update({ depth: Math.max(1, u.fromDisplay(value)) })}
      />
      <div className={styles.subtitle}>Drag this footprint on the plan or enter exact center coordinates.</div>
    </div>
  );
}

export default memo(BuildingServiceProperties);
