// Readouts for the move/rotate gizmo HUD and typed exact values during a drag.
// Handles (TransformControls `axis`): rotate rings 'X' | 'Y' | 'Z', the screen
// ring 'E' and the free trackball 'XYZE'; translate arrows 'X' | 'Y' | 'Z',
// plane squares 'XY' | 'YZ' | 'XZ' and the free centre 'XYZ'.

const AXES = { X: [1, 0, 0], Y: [0, 1, 0], Z: [0, 0, 1] };
const escape = (text) =>
  String(text).replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' })[c]);
const tidy = (value, digits) => {
  const result = +value.toFixed(digits);
  return Object.is(result, -0) ? 0 : result;
};
export const signed = (value) => {
  const n = tidy(value, 1);
  return n > 0 ? `+${n.toFixed(1)}` : n.toFixed(1);
};
const signedMm = (value) => {
  const n = tidy(value, 3);
  return n > 0 ? `+${n}` : String(n);
};

// Signed turn about the dragged ring's axis, from the turn quaternion
// [x, y, z, w] (identity at drag start); total angle otherwise. In Local
// space pass the turn expressed in the part's own axes and space 'local'.
// The angle is in (-180°, 180°] unless `near` is given: then of the angles
// that make this turn (360° apart) the one nearest `near`, so a dial that
// has swept +270° or +450° reads that rather than -90° or +90°.
export function rotationReadout(quaternion, handle, { space = 'world', near = null } = {}) {
  const [x, y, z, w] = quaternion;
  const axis = AXES[handle];
  if (axis) {
    const s = x * axis[0] + y * axis[1] + z * axis[2];
    let degrees = (2 * Math.atan2(s, w) * 180) / Math.PI;
    if (Number.isFinite(near)) degrees += 360 * Math.round((near - degrees) / 360);
    else if (degrees > 180) degrees -= 360;
    else if (degrees <= -180) degrees += 360;
    const value = `${signed(degrees)}°`;
    const local = space === 'local' ? 'local ' : '';
    return {
      degrees,
      axis: handle,
      text: `${value} about ${local}${handle}`,
      html: `<span class="cad-gizmo-value">${value}</span> about ${local}<span class="cad-axis-${handle.toLowerCase()}">${handle}</span>`,
    };
  }
  const degrees = (2 * Math.acos(Math.min(1, Math.abs(w))) * 180) / Math.PI;
  const value = `${tidy(degrees, 1).toFixed(1)}°`;
  return { degrees, axis: null, text: `${value} turn`, html: `<span class="cad-gizmo-value">${value}</span> turn` };
}

// Move so far (after grid and box snapping), and which box snaps engaged.
export function translationReadout(delta, snaps = []) {
  const kinds = [...new Set(snaps.map((s) => s.kind))];
  const parts = ['X', 'Y', 'Z'].map((name, i) => `Δ${name} ${signedMm(delta[i])}`);
  const text = `${parts.join(' · ')} mm${kinds.map((k) => ` · ${k}`).join('')}`;
  const html =
    ['X', 'Y', 'Z']
      .map(
        (name, i) =>
          `<span class="cad-axis-${name.toLowerCase()}">Δ${name}</span> <span class="cad-gizmo-value">${signedMm(delta[i])}</span>`,
      )
      .join(' · ') +
    ' mm' +
    kinds.map((k) => ` · <span class="cad-gizmo-snap">${escape(k)}</span>`).join('');
  return { text, html };
}

// Typing an exact value works on single-axis handles only: a rotate ring or
// a translate arrow. Plane squares, the free centre, the screen ring and the
// trackball ignore typing.
export const typingSupported = (mode, handle) => Boolean(AXES[handle]) && (mode === 'rotate' || mode === 'translate');

export function typedRotation(handle, degrees) {
  const axis = AXES[handle];
  if (!axis || !Number.isFinite(degrees)) return null;
  const half = (degrees * Math.PI) / 360;
  return [...axis.map((v) => v * Math.sin(half) || 0), Math.cos(half)];
}

export function typedTranslation(handle, distance) {
  const axis = AXES[handle];
  if (!axis || !Number.isFinite(distance)) return null;
  return axis.map((v) => v * distance || 0); // no -0 components
}

// Keys that edit the typed value: digits, one leading "-", one ".".
export function typeKey(text, key) {
  if (key === 'Backspace') return text.slice(0, -1);
  if (/^[0-9]$/.test(key)) return text + key;
  if (key === '-' && !text) return '-';
  if (key === '.' && !text.includes('.')) return text + '.';
  return null;
}

// The rotate drag's snap state: the step in use, or free because snap is 0
// or Alt is held.
export function snapLabel(snap, altHeld) {
  const text = altHeld && snap > 0 ? 'free · Alt' : snap > 0 ? `snap ${snap}°` : 'free';
  return { text, html: ` · <span class="cad-gizmo-snap">${escape(text)}</span>` };
}

export const typedHtml = (text, mode) =>
  text
    ? `<div class="cad-gizmo-typed">${escape(text)} ${mode === 'rotate' ? '°' : 'mm'} · Enter applies · Esc cancels</div>`
    : '<div class="cad-gizmo-typed">Type a value · Enter applies</div>';
