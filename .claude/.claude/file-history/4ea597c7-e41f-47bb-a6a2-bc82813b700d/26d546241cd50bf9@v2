import React, { useMemo } from 'react';
import { Layer, Shape } from 'react-konva';
import { generateMidGalaxyStars } from '../utils/proceduralGeneration';
import { hexToRgba } from '../utils/starUtils';

// Pre-parse hex colors to RGB for use in sceneFunc
const parseHex = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
});

const MidGalaxyLayer = React.memo(({ layerProps }) => {
    const stars = useMemo(() => {
        const raw = generateMidGalaxyStars(800, 137);
        // Pre-parse colors for sceneFunc
        return raw.map(s => ({ ...s, rgb: parseHex(s.color) }));
    }, []);

    return (
        <Layer {...layerProps} listening={false}>
            <Shape
                sceneFunc={(ctx) => {
                    for (let i = 0; i < stars.length; i++) {
                        const s = stars[i];
                        const { r, g, b } = s.rgb;
                        const grad = ctx.createRadialGradient(s.x, s.y, 0, s.x, s.y, s.radius);
                        grad.addColorStop(0, `rgba(${r},${g},${b},${s.opacity})`);
                        grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
                        ctx.beginPath();
                        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
                        ctx.fillStyle = grad;
                        ctx.fill();
                    }
                }}
                perfectDrawEnabled={false}
                listening={false}
            />
        </Layer>
    );
});

MidGalaxyLayer.displayName = 'MidGalaxyLayer';

export default MidGalaxyLayer;
