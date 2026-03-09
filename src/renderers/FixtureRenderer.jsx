import { fixtureOutline } from '@/geometry/fixtureGeometry';

// Stroke hierarchy constants
const PRIMARY = { stroke: '#6B5E4F', strokeWidth: 1.2 };
const SECONDARY = { stroke: '#9E9283', strokeWidth: 0.5 };
const HIGHLIGHT = { stroke: 'rgba(255,255,255,0.35)', strokeWidth: 0.8 };
const NSS = { vectorEffect: 'non-scaling-stroke' };
const BLUE_TINT = '#D0E8F4';

function FixtureDetails({ fixture }) {
  const { fixtureType, x, y, width, depth, rotation } = fixture;
  const hw = width / 2, hd = depth / 2;
  const transform = `translate(${x},${y}) rotate(${rotation || 0})`;

  switch (fixtureType) {
    case 'kitchenTop': {
      // 2x2 burner grid positions
      const bx1 = -hw + width * 0.15, bx2 = -hw + width * 0.35;
      const by1 = -hd + depth * 0.3, by2 = hd - depth * 0.3;
      const bOuter = depth * 0.13, bInner = depth * 0.06;
      // Sink area
      const sx = hw - width * 0.32, sy = -hd * 0.55;
      const sw = width * 0.25, sh = depth * 0.55;
      return (
        <g transform={transform}>
          {/* Countertop seam line */}
          <line x1={-hw + width * 0.52} y1={-hd + depth * 0.05} x2={-hw + width * 0.52} y2={hd - depth * 0.05}
            {...SECONDARY} {...NSS} fill="none" />
          {/* 4 burners */}
          {[[bx1, by1], [bx2, by1], [bx1, by2], [bx2, by2]].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r={bOuter} fill="none" {...PRIMARY} {...NSS} />
              <circle cx={cx} cy={cy} r={bInner} fill="none" {...SECONDARY} {...NSS} />
            </g>
          ))}
          {/* Sink basin */}
          <rect x={sx} y={sy} width={sw} height={sh} rx={width * 0.03}
            fill={BLUE_TINT} {...PRIMARY} {...NSS} />
          {/* Sink highlight edge */}
          <rect x={sx + sw * 0.08} y={sy + sh * 0.08} width={sw * 0.84} height={sh * 0.84} rx={width * 0.02}
            fill="none" {...HIGHLIGHT} {...NSS} />
          {/* Drain circle */}
          <circle cx={sx + sw / 2} cy={sy + sh / 2} r={width * 0.015}
            fill="#9E9283" stroke="none" />
          {/* Faucet dot */}
          <circle cx={sx + sw / 2} cy={sy - depth * 0.05} r={width * 0.012}
            fill="#6B5E4F" stroke="none" />
        </g>
      );
    }
    case 'toilet': {
      const cisternH = depth * 0.3;
      const bowlCy = hd * 0.35;
      const bowlRx = width * 0.35, bowlRy = depth * 0.32;
      return (
        <g transform={transform}>
          {/* Cistern */}
          <rect x={-hw + width * 0.1} y={-hd + depth * 0.02} width={width * 0.8} height={cisternH} rx={width * 0.05}
            fill="none" {...PRIMARY} {...NSS} />
          {/* Cistern highlight */}
          <rect x={-hw + width * 0.15} y={-hd + depth * 0.06} width={width * 0.7} height={cisternH * 0.6} rx={width * 0.03}
            fill="none" {...HIGHLIGHT} {...NSS} />
          {/* Flush button */}
          <rect x={-width * 0.08} y={-hd + depth * 0.06} width={width * 0.16} height={cisternH * 0.4} rx={width * 0.02}
            fill="none" {...SECONDARY} {...NSS} />
          {/* Bowl */}
          <ellipse cx={0} cy={bowlCy} rx={bowlRx} ry={bowlRy}
            fill={BLUE_TINT} {...PRIMARY} {...NSS} />
          {/* Inner seat rim */}
          <ellipse cx={0} cy={bowlCy} rx={bowlRx * 0.72} ry={bowlRy * 0.72}
            fill="none" {...SECONDARY} {...NSS} />
          {/* Seat hinge dots */}
          <circle cx={-width * 0.2} cy={-hd + cisternH + depth * 0.06} r={width * 0.02}
            fill="#9E9283" stroke="none" />
          <circle cx={width * 0.2} cy={-hd + cisternH + depth * 0.06} r={width * 0.02}
            fill="#9E9283" stroke="none" />
        </g>
      );
    }
    case 'lavatory': {
      const r = Math.min(width, depth) * 0.3;
      return (
        <g transform={transform}>
          {/* Outer basin */}
          <ellipse cx={0} cy={0} rx={r} ry={r * 0.85}
            fill={BLUE_TINT} {...PRIMARY} {...NSS} />
          {/* Inner bowl highlight */}
          <ellipse cx={0} cy={0} rx={r * 0.7} ry={r * 0.6}
            fill="none" {...HIGHLIGHT} {...NSS} />
          {/* Drain dot */}
          <circle cx={0} cy={0} r={width * 0.015}
            fill="#9E9283" stroke="none" />
          {/* Faucet dots + spout line */}
          <circle cx={-width * 0.06} cy={-hd + depth * 0.12} r={width * 0.015}
            fill="#6B5E4F" stroke="none" />
          <circle cx={width * 0.06} cy={-hd + depth * 0.12} r={width * 0.015}
            fill="#6B5E4F" stroke="none" />
          <line x1={0} y1={-hd + depth * 0.12} x2={0} y2={-hd + depth * 0.22}
            {...SECONDARY} {...NSS} fill="none" />
        </g>
      );
    }
    case 'table': {
      const inset = width * 0.06;
      const legInset = width * 0.1;
      const legDInset = depth * 0.1;
      const legR = width * 0.035;
      return (
        <g transform={transform}>
          {/* Inner highlight rect (bevel) */}
          <rect x={-hw + inset} y={-hd + inset} width={width - inset * 2} height={depth - inset * 2} rx={2}
            fill="none" {...HIGHLIGHT} {...NSS} />
          {/* Subtle grain lines */}
          <line x1={-hw + width * 0.3} y1={-hd + inset} x2={-hw + width * 0.3} y2={hd - inset}
            {...SECONDARY} {...NSS} fill="none" opacity={0.4} />
          <line x1={-hw + width * 0.65} y1={-hd + inset} x2={-hw + width * 0.65} y2={hd - inset}
            {...SECONDARY} {...NSS} fill="none" opacity={0.4} />
          {/* 4 legs with outer ring + filled center */}
          {[
            [-hw + legInset, -hd + legDInset],
            [hw - legInset, -hd + legDInset],
            [-hw + legInset, hd - legDInset],
            [hw - legInset, hd - legDInset],
          ].map(([cx, cy], i) => (
            <g key={i}>
              <circle cx={cx} cy={cy} r={legR} fill="none" {...PRIMARY} {...NSS} />
              <circle cx={cx} cy={cy} r={legR * 0.4} fill="#6B5E4F" stroke="none" />
            </g>
          ))}
        </g>
      );
    }
    case 'tv': {
      const bezelInset = width * 0.04;
      return (
        <g transform={transform}>
          {/* Inner bezel rect */}
          <rect x={-hw + bezelInset} y={-hd + bezelInset} width={width - bezelInset * 2} height={depth - bezelInset * 2}
            rx={1} fill="none" {...SECONDARY} {...NSS} />
          {/* Power LED dot (green) */}
          <circle cx={hw - width * 0.08} cy={hd - depth * 0.25} r={width * 0.012}
            fill="#4CAF50" stroke="none" />
          {/* Stand mount line */}
          <line x1={0} y1={hd} x2={0} y2={hd + depth * 0.3}
            {...PRIMARY} {...NSS} fill="none" />
          {/* Base bar */}
          <line x1={-width * 0.18} y1={hd + depth * 0.3} x2={width * 0.18} y2={hd + depth * 0.3}
            {...PRIMARY} {...NSS} fill="none" />
        </g>
      );
    }
    case 'sofa': {
      const pad = width * 0.04;
      const backH = depth * 0.22;
      const armW = width * 0.08;
      const seatTop = -hd + backH + pad;
      const seatBot = hd - pad;
      const seatLeft = -hw + armW + pad;
      const seatRight = hw - armW - pad;
      const seatW = seatRight - seatLeft;
      const cushionW = seatW / 3;
      return (
        <g transform={transform}>
          {/* Backrest */}
          <rect x={-hw + pad} y={-hd + pad} width={width - pad * 2} height={backH}
            rx={width * 0.02} fill="none" {...PRIMARY} {...NSS} />
          {/* Left armrest */}
          <rect x={-hw + pad} y={-hd + backH} width={armW} height={depth - backH - pad}
            rx={width * 0.015} fill="none" {...PRIMARY} {...NSS} />
          {/* Right armrest */}
          <rect x={hw - armW - pad} y={-hd + backH} width={armW} height={depth - backH - pad}
            rx={width * 0.015} fill="none" {...PRIMARY} {...NSS} />
          {/* 3 seat cushion rects */}
          {[0, 1, 2].map(i => (
            <rect key={i}
              x={seatLeft + i * cushionW + pad * 0.3}
              y={seatTop + pad * 0.3}
              width={cushionW - pad * 0.6}
              height={seatBot - seatTop - pad * 0.6}
              rx={width * 0.01}
              fill="none" {...SECONDARY} {...NSS}
            />
          ))}
          {/* Cushion seam dash lines */}
          {[1, 2].map(i => (
            <line key={i}
              x1={seatLeft + i * cushionW} y1={seatTop + pad}
              x2={seatLeft + i * cushionW} y2={seatBot - pad}
              {...SECONDARY} {...NSS} fill="none"
              strokeDasharray="8 6"
            />
          ))}
        </g>
      );
    }
    case 'bed': {
      const headH = depth * 0.08;
      const pillowW = width * 0.38;
      const pillowH = depth * 0.12;
      const pillowGap = width * 0.04;
      const pillowY = -hd + headH + depth * 0.04;
      return (
        <g transform={transform}>
          {/* Headboard */}
          <rect x={-hw + width * 0.02} y={-hd + depth * 0.01} width={width * 0.96} height={headH}
            rx={width * 0.02} fill="none" {...PRIMARY} {...NSS} />
          {/* Left pillow */}
          <rect x={-pillowGap / 2 - pillowW} y={pillowY} width={pillowW} height={pillowH}
            rx={width * 0.04} fill="none" {...PRIMARY} {...NSS} />
          {/* Right pillow */}
          <rect x={pillowGap / 2} y={pillowY} width={pillowW} height={pillowH}
            rx={width * 0.04} fill="none" {...PRIMARY} {...NSS} />
          {/* Blanket fold line */}
          <line x1={-hw + width * 0.08} y1={hd - depth * 0.35}
            x2={hw - width * 0.08} y2={hd - depth * 0.35}
            {...SECONDARY} {...NSS} fill="none" />
          {/* Inner highlight */}
          <rect x={-hw + width * 0.05} y={-hd + headH + depth * 0.02}
            width={width * 0.90} height={depth - headH - depth * 0.04}
            rx={width * 0.02} fill="none" {...HIGHLIGHT} {...NSS} />
        </g>
      );
    }
    default:
      return null;
  }
}

export default function FixtureRenderer({ fixtures }) {
  return (
    <g className="fixtures">
      {fixtures.map(fixture => {
        const outline = fixtureOutline(fixture);
        const points = outline.map(p => `${p.x},${p.y}`).join(' ');
        const gradFill = `url(#grad-${fixture.fixtureType})`;
        return (
          <g key={fixture.id} filter="url(#fixture-shadow)">
            <polygon
              data-id={fixture.id}
              data-type="fixture"
              points={points}
              fill={gradFill}
              stroke="#8A7D6B"
              strokeWidth={1.5}
              vectorEffect="non-scaling-stroke"
            />
            <FixtureDetails fixture={fixture} />
          </g>
        );
      })}
    </g>
  );
}
