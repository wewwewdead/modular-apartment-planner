import React, { useMemo } from 'react';
import { Layer, Shape } from 'react-konva';
import Nebula from '../components/Nebula';
import { generateDeepSpaceStars, generateNebulae } from '../utils/proceduralGeneration';

const DeepSpaceLayer = React.memo(({ layerProps }) => {
    const dustStars = useMemo(() => generateDeepSpaceStars(2000, 42), []);
    const nebulae = useMemo(() => generateNebulae(18, 256), []);

    return (
        <Layer {...layerProps} listening={false}>
            {/* Nebulae (behind dust) */}
            {nebulae.map((n, i) => (
                <Nebula
                    key={i}
                    x={n.x}
                    y={n.y}
                    radius={n.radius}
                    opacity={n.opacity}
                    color={n.color}
                />
            ))}
            {/* Dust stars — batch-drawn via single Shape for performance */}
            <Shape
                sceneFunc={(ctx) => {
                    ctx.fillStyle = '#ffffff';
                    for (let i = 0; i < dustStars.length; i++) {
                        const s = dustStars[i];
                        ctx.globalAlpha = s.opacity;
                        ctx.beginPath();
                        ctx.arc(s.x, s.y, s.radius, 0, Math.PI * 2);
                        ctx.fill();
                    }
                    ctx.globalAlpha = 1;
                }}
                perfectDrawEnabled={false}
                listening={false}
            />
        </Layer>
    );
});

DeepSpaceLayer.displayName = 'DeepSpaceLayer';

export default DeepSpaceLayer;
