import { memo } from 'react';
import { deviceOutlineOnWall } from '@/geometry/wallGeometry';
import { ELECTRICAL_PLATE, ELECTRICAL_SYMBOL_SIZE } from '@/domain/defaults';
import { DRAWING_GRAPHICS } from '@/sheets/standards';

const OUTLET_RADIUS = 150; // mm
const LABEL_SIZE = 180; // mm
const SWITCH_SIZE = 250; // mm
const STEM = 120; // mm

// The physical faceplate, true to model size — the one plan element that
// corresponds 1:1 to the 3D device, so butting it against a column in plan
// means touching in 3D too. The glyph beyond it stays a symbolic annotation.
function PlateFootprint({ outSign }) {
  return (
    <rect
      x={-ELECTRICAL_PLATE.width / 2}
      y={outSign < 0 ? -ELECTRICAL_PLATE.depth : 0}
      width={ELECTRICAL_PLATE.width}
      height={ELECTRICAL_PLATE.depth}
      fill={DRAWING_GRAPHICS.plan.markerStroke}
      stroke={DRAWING_GRAPHICS.plan.markerStroke}
      strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
      vectorEffect="non-scaling-stroke"
    />
  );
}

// Every symbol is drawn in a local frame whose origin sits on the wall face and
// whose +x runs along the wall, so `outSign` is all that separates the two
// faces: it points away from the wall.
function OutletSymbol({ outSign, label }) {
  return (
    <g>
      <circle
        cx={0}
        cy={outSign * OUTLET_RADIUS}
        r={OUTLET_RADIUS}
        fill="white"
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      {[-60, 60].map((x) => (
        <line
          key={x}
          x1={x}
          y1={outSign * OUTLET_RADIUS * 0.9}
          x2={x}
          y2={outSign * -80}
          stroke={DRAWING_GRAPHICS.plan.markerStroke}
          strokeWidth={DRAWING_GRAPHICS.plan.secondaryStrokeWidth}
          vectorEffect="non-scaling-stroke"
        />
      ))}
      {label ? (
        <text
          x={0}
          y={outSign * (OUTLET_RADIUS * 2 + LABEL_SIZE * 0.8)}
          textAnchor="middle"
          dominantBaseline="middle"
          fontSize={LABEL_SIZE}
          fill={DRAWING_GRAPHICS.plan.markerStroke}
        >
          {label}
        </text>
      ) : null}
    </g>
  );
}

function SwitchSymbol({ outSign, label }) {
  return (
    <g>
      <line
        x1={0}
        y1={0}
        x2={0}
        y2={outSign * STEM}
        stroke={DRAWING_GRAPHICS.plan.markerStroke}
        strokeWidth={DRAWING_GRAPHICS.plan.markerStrokeWidth}
        vectorEffect="non-scaling-stroke"
      />
      <text
        x={0}
        y={outSign * (STEM + SWITCH_SIZE / 2)}
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize={SWITCH_SIZE}
        fill={DRAWING_GRAPHICS.plan.markerStroke}
      >
        {label}
      </text>
    </g>
  );
}

const SYMBOLS = {
  outlet: { Glyph: OutletSymbol, label: '' },
  'outlet-gfci': { Glyph: OutletSymbol, label: 'GFCI' },
  'outlet-220v': { Glyph: OutletSymbol, label: '220' },
  switch: { Glyph: SwitchSymbol, label: 'S' },
  'switch-3way': { Glyph: SwitchSymbol, label: 'S3' },
  'switch-dimmer': { Glyph: SwitchSymbol, label: 'SD' },
};

function ElectricalRenderer({ devices, walls }) {
  return (
    <g className="electrical-devices">
      {devices.map((device) => {
        const wall = walls.find((w) => w.id === device.wallId);
        if (!wall) return null;

        const { Glyph, label } = SYMBOLS[device.deviceType] || SYMBOLS.outlet;
        const info = deviceOutlineOnWall(wall, device, ELECTRICAL_SYMBOL_SIZE);
        const angleDeg = (info.angle * 180) / Math.PI;
        const outSign = device.side === 'left' ? -1 : 1;

        return (
          <g key={device.id} data-id={device.id} data-type="electricalDevice">
            <g transform={`translate(${info.center.x},${info.center.y}) rotate(${angleDeg})`}>
              <PlateFootprint outSign={outSign} />
              <Glyph outSign={outSign} label={label} />
            </g>
          </g>
        );
      })}
    </g>
  );
}

export default memo(ElectricalRenderer);
