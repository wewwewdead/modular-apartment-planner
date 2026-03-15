import React from 'react';
import { Circle } from 'react-konva';
import { hexToRgba } from '../utils/starUtils';

const Nebula = React.memo(({ x, y, radius, opacity, color }) => {
    // 4 concentric circles at increasing opacity to simulate soft cloud glow
    const layers = [
        { rFactor: 1.0, opFactor: 0.3 },
        { rFactor: 0.75, opFactor: 0.5 },
        { rFactor: 0.5, opFactor: 0.7 },
        { rFactor: 0.25, opFactor: 1.0 },
    ];

    return layers.map((layer, i) => (
        <Circle
            key={i}
            x={x}
            y={y}
            radius={radius * layer.rFactor}
            fillRadialGradientStartPoint={{ x: 0, y: 0 }}
            fillRadialGradientEndPoint={{ x: 0, y: 0 }}
            fillRadialGradientStartRadius={0}
            fillRadialGradientEndRadius={radius * layer.rFactor}
            fillRadialGradientColorStops={[
                0, hexToRgba(color, opacity * layer.opFactor),
                1, hexToRgba(color, 0),
            ]}
            listening={false}
            perfectDrawEnabled={false}
        />
    ));
});

Nebula.displayName = 'Nebula';

export default Nebula;
