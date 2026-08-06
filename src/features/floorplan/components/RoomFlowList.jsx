/**
 * The per-room airflow readout, shared by every panel that shows one.
 *
 * Two presentations of the same rows:
 *
 *   `metric="speed"`  the bulk air-movement index leads, with its uncertainty
 *                     band under it and the air-change rate demoted to a
 *                     secondary "freshness" figure. This is the one a designer
 *                     reads: a room can be flushed six times an hour and still
 *                     feel dead, and speed is the half of that story that
 *                     air-change rate cannot tell.
 *   `metric="ach"`    air-change rate alone, the original presentation, kept
 *                     for callers whose question really is dilution.
 *
 * A null `airSpeedMs` prints an em dash, never a zero: rooms that never joined
 * the network have no index, and a 0 there would read as "still air" rather
 * than "not modelled".
 */

import styles from './RoomFlowList.module.css';

/** How many rows fit before the list stops being a list and becomes a table. */
const DEFAULT_LIMIT = 8;

/**
 * A number, or null.
 *
 * `Number(null)` is 0 and `Number('')` is 0, so the type has to be checked
 * before the value — otherwise the one distinction this list exists to keep,
 * between a room that moves no air and a room that was never modelled, is
 * erased on the way to the screen.
 */
function finite(value) {
  if (value === null || value === undefined || value === '') return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

function stateLabel(room) {
  if (room.crossVentilated) return 'Cross-flow';
  return (finite(room.airChangesPerHour) ?? 0) >= 0.1 ? 'Airflow path' : 'Low / no flow';
}

function speedText(room) {
  const speed = finite(room.airSpeedMs);
  return speed === null ? '—' : `${speed.toFixed(2)} m/s`;
}

function bandText(room) {
  const band = room.airSpeedBand;
  const low = finite(band?.lowMs);
  const high = finite(band?.highMs);
  if (low === null || high === null) return 'not modelled';
  return `${low.toFixed(2)}–${high.toFixed(2)} m/s`;
}

function achText(room) {
  const ach = finite(room.airChangesPerHour);
  return ach === null ? '—' : `${ach.toFixed(1)} ACH`;
}

function pressureTitle(room) {
  const pressure = finite(room.pressurePa);
  return pressure === null ? undefined : `${pressure.toFixed(2)} Pa`;
}

export default function RoomFlowList({ rooms = [], metric = 'ach', limit = DEFAULT_LIMIT }) {
  const shown = rooms.slice(0, limit);
  if (metric !== 'speed') {
    return (
      <div className={styles.list} data-room-flow-metric="ach">
        {shown.map((room) => (
          <div key={room.id} className={styles.row}>
            <span title={pressureTitle(room)}>{room.name}</span>
            <em>{stateLabel(room)}</em>
            <strong>{achText(room)}</strong>
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className={styles.list} data-room-flow-metric="speed">
      {shown.map((room) => (
        <div key={room.id} className={styles.speedRow}>
          <span className={styles.name} title={pressureTitle(room)}>
            {room.name}
          </span>
          <em>{stateLabel(room)}</em>
          <strong>{speedText(room)}</strong>
          <span className={styles.detail}>
            <span className={styles.band}>{bandText(room)}</span>
            <span className={styles.ach}>{achText(room)}</span>
          </span>
        </div>
      ))}
    </div>
  );
}
