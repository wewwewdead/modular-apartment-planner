import { useState } from 'react';
import { numeric, resolveParameters } from './model.js';
import { ValueField, VectorFields } from './CadEditors.jsx';

export default function ProfileEditor({ sketch, parameters, onChange, solvedProfile }) {
  const profile = sketch.constrained && solvedProfile ? solvedProfile : sketch.profile;
  const [tool, setTool] = useState('line'),
    [snap, setSnap] = useState(10),
    [construction, setConstruction] = useState(false);
  const change = (patch) => onChange({ ...sketch, profile: { ...profile, ...patch } });
  let path = '',
    error = '',
    viewBox = [-20, -20, 340, 240];
  const constructionPaths = [],
    points = [];
  try {
    const vars = resolveParameters(parameters),
      n = (v) => numeric(v, vars),
      pt = (p) => p.map(n);
    if (profile.type === 'rectangle') {
      const [x, y] = pt(profile.origin || [0, 0]),
        w = n(profile.width),
        h = n(profile.height);
      path = 'M' + x + ' ' + y + 'h' + w + 'v' + h + 'h' + -w + 'Z';
      points.push([x, y], [x + w, y + h]);
    } else if (profile.type === 'circle') {
      const [x, y] = pt(profile.center || [0, 0]),
        r = n(profile.radius);
      path =
        'M' +
        (x - r) +
        ' ' +
        y +
        'a' +
        r +
        ' ' +
        r +
        ' 0 1 0 ' +
        r * 2 +
        ' 0a' +
        r +
        ' ' +
        r +
        ' 0 1 0 ' +
        -r * 2 +
        ' 0';
      points.push([x - r, y - r], [x + r, y + r]);
    } else if (profile.type === 'polygon') {
      points.push(...profile.points.map(pt));
      path = 'M' + points.map((p) => p.join(' ')).join('L') + 'Z';
    } else if (profile.type === 'path') {
      let previous = pt(profile.start);
      points.push(previous);
      path = 'M' + previous.join(' ');
      for (const segment of profile.segments) {
        const end = pt(segment.end);
        points.push(end);
        let command = 'L' + end.join(' ');
        if (segment.type === 'spline')
          command = 'C' + pt(segment.control1).join(' ') + ' ' + pt(segment.control2).join(' ') + ' ' + end.join(' ');
        if (segment.type === 'arc') {
          const mid = pt(segment.mid);
          points.push(mid);
          const [ax, ay] = previous,
            [bx, by] = mid,
            [cx, cy] = end,
            d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
          if (Math.abs(d) < 1e-9) throw new Error('Arc points must not be collinear.');
          const q = (x, y) => x * x + y * y;
          const ox = (q(ax, ay) * (by - cy) + q(bx, by) * (cy - ay) + q(cx, cy) * (ay - by)) / d;
          const oy = (q(ax, ay) * (cx - bx) + q(bx, by) * (ax - cx) + q(cx, cy) * (bx - ax)) / d;
          const radius = Math.hypot(ax - ox, ay - oy),
            cross = (bx - ax) * (cy - by) - (by - ay) * (cx - bx),
            sweep = cross > 0 ? 1 : 0;
          const angle = (x, y) => Math.atan2(y - oy, x - ox),
            tau = Math.PI * 2;
          const travel = sweep
            ? (angle(cx, cy) - angle(ax, ay) + tau) % tau
            : (angle(ax, ay) - angle(cx, cy) + tau) % tau;
          command =
            'A' + radius + ' ' + radius + ' 0 ' + (travel > Math.PI ? 1 : 0) + ' ' + sweep + ' ' + end.join(' ');
        }
        if (segment.construction) constructionPaths.push('M' + previous.join(' ') + command);
        else {
          path += command;
          previous = end;
        }
      }
      if (profile.closed !== false) path += 'Z';
    }
    if (points.length) {
      const xs = points.map((p) => p[0]),
        ys = points.map((p) => p[1]);
      const x = Math.min(...xs, 0),
        y = Math.min(...ys, 0),
        w = Math.max(...xs, 200) - x,
        h = Math.max(...ys, 150) - y;
      viewBox = [x - 20, y - 20, w + 40, h + 40];
    }
  } catch (e) {
    error = e.message;
  }
  const addSegment = (end) => {
    const previous = profile.segments?.filter((s) => !s.construction).at(-1)?.end || profile.start || [0, 0];
    const vars = resolveParameters(parameters),
      start = previous.map((n) => numeric(n, vars));
    const next = { type: tool, end, construction };
    if (tool === 'arc') next.mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2 - 30];
    if (tool === 'spline') {
      next.control1 = [start[0], start[1] - 50];
      next.control2 = [end[0] - 50, end[1]];
    }
    change({ segments: [...(profile.segments || []), next] });
  };
  return (
    <details open>
      <summary>Precision profile</summary>
      <svg
        className="cad-sketch-pad"
        viewBox={viewBox.join(' ')}
        aria-label="Part sketch preview"
        onClick={(event) => {
          if (profile.type !== 'path' || sketch.constrained) return;
          const matrix = event.currentTarget.getScreenCTM().inverse(),
            point = new DOMPoint(event.clientX, event.clientY).matrixTransform(matrix);
          let end = [Math.round(point.x / snap) * snap, Math.round(point.y / snap) * snap];
          const near = points.find((p) => Math.hypot(p[0] - point.x, p[1] - point.y) < snap / 2);
          if (near) end = near;
          addSegment(end);
        }}
      >
        <path
          d={path}
          stroke="#257cae"
          strokeWidth={viewBox[2] / 250}
          fill={profile.closed === false ? 'none' : '#cfe6f377'}
        />
        {constructionPaths.map((d, i) => (
          <path key={i} d={d} stroke="#8198a9" strokeWidth={viewBox[2] / 400} strokeDasharray="4 2" fill="none" />
        ))}
        {points.map(([x, y], i) => (
          <g key={i}>
            <circle cx={x} cy={y} r={viewBox[2] / 160} fill="#257cae" />
            <text x={x + 4} y={y - 4} fontSize={viewBox[2] / 25} fill="#3d5b70">
              {i + 1}
            </text>
          </g>
        ))}
      </svg>
      {error && <p role="alert">{error}</p>}
      {sketch.constrained && (
        <p className="cad-help">
          This profile is solver controlled. Change its constraints below; disable solving before editing free geometry.
        </p>
      )}
      <fieldset disabled={sketch.constrained} className="cad-profile-fields">
        {['rectangle', 'circle'].includes(profile.type) && (
          <>
            {(profile.type === 'rectangle' ? ['width', 'height'] : ['radius']).map((key) => (
              <ValueField
                key={key + profile[key]}
                label={key + ' (mm)'}
                value={profile[key]}
                onChange={(value) => change({ [key]: value })}
              />
            ))}
          </>
        )}
        <ValueField
          key={String(profile.offset || 0)}
          label="Profile offset (mm)"
          value={profile.offset || 0}
          onChange={(offset) => change({ offset })}
        />
        {profile.type === 'path' && (
          <>
            <VectorFields label="Start (mm)" value={profile.start} onChange={(start) => change({ start })} />
            <label className="cad-field">
              Segment
              <select value={tool} onChange={(e) => setTool(e.target.value)}>
                <option value="line">Line</option>
                <option value="arc">Three point arc</option>
                <option value="spline">Cubic spline</option>
              </select>
            </label>
            <label className="cad-field">
              Snap grid (mm)
              <input
                type="number"
                min="0.1"
                value={snap}
                onChange={(e) => setSnap(Math.max(0.1, Number(e.target.value)))}
              />
            </label>
            <label>
              <input type="checkbox" checked={construction} onChange={(e) => setConstruction(e.target.checked)} />{' '}
              Construction geometry
            </label>
            <label className="cad-field">
              <span>
                <input
                  type="checkbox"
                  checked={profile.closed !== false}
                  onChange={(e) => change({ closed: e.target.checked })}
                />{' '}
                Closed profile
              </span>
            </label>
            <p className="cad-help">
              Click the preview to place snapped endpoints. Edit exact coordinates below. Open paths can drive sweeps.
            </p>
            {(profile.segments || []).map((segment, index) => (
              <details key={index}>
                <summary>
                  {index + 1}. {segment.type}
                  {segment.construction ? ' (construction)' : ''}
                </summary>
                {['end', 'mid', 'control1', 'control2']
                  .filter((key) => segment[key])
                  .map((key) => (
                    <VectorFields
                      key={key}
                      label={key}
                      value={segment[key]}
                      onChange={(value) =>
                        change({ segments: profile.segments.map((s, i) => (i === index ? { ...s, [key]: value } : s)) })
                      }
                    />
                  ))}
                <button onClick={() => change({ segments: profile.segments.filter((_, i) => i !== index) })}>
                  Trim segment
                </button>
              </details>
            ))}
          </>
        )}
      </fieldset>
    </details>
  );
}
