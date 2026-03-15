import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Layer, Shape } from 'react-konva';
import { STAR_COLORS } from '../utils/starUtils';

const TWO_PI = Math.PI * 2;
const RING_COUNT = 4;
const SPIRAL_ARMS = 3;
const SPIRAL_PARTICLES = 16;
const OUTER_PARTICLE_COUNT = 14;

/** Parse "#5f92ff" → { r, g, b } */
const parseHex = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
});

/** Lerp between two RGB colors */
const lerpRgb = (a, b, t) => ({
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
});

const WHITE = { r: 255, g: 255, b: 255 };

const WormholeLayer = React.memo(({ layerProps, wormholes, zoom }) => {
    const animRef = useRef({ time: 0 });
    const shapeRef = useRef(null);
    const rafRef = useRef(null);

    // Always bright
    const opacity = zoom < 0.15 ? 1.0
        : zoom < 1.0 ? 1.0 - (zoom - 0.15) * 0.2
        : 0.83;

    // Pre-compute vortex data with colors and stable phase offsets
    const vortexData = useMemo(() => {
        if (!Array.isArray(wormholes)) return [];
        return wormholes.map((wh, i) => {
            const color = STAR_COLORS[i % STAR_COLORS.length];
            const rgb = parseHex(color);
            const hashVal = wh.post_a ? parseInt(wh.post_a.slice(0, 8), 16) : i * 12345;
            return {
                ...wh,
                color,
                rgb,
                phaseA: (hashVal % 1000) / 1000 * TWO_PI,
                phaseB: ((hashVal * 7) % 1000) / 1000 * TWO_PI,
            };
        });
    }, [wormholes]);

    const animate = useCallback(() => {
        animRef.current.time = performance.now();
        if (shapeRef.current) {
            shapeRef.current.getLayer()?.batchDraw();
        }
        rafRef.current = requestAnimationFrame(animate);
    }, []);

    useEffect(() => {
        if (vortexData.length === 0) return;
        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [animate, vortexData.length]);

    if (vortexData.length === 0) return null;

    const drawVortex = (ctx, x, y, rgb, time, phaseOffset, radius) => {
        const breathe = 1.0 + 0.25 * Math.sin(time * 0.001 + phaseOffset);
        const r = radius * breathe;

        // Large pulsing outer halo — makes it unmissable
        const pulseScale = 1.0 + 0.3 * Math.sin(time * 0.0015 + phaseOffset);
        const haloR = r * 4.0 * pulseScale;
        const haloGrad = ctx.createRadialGradient(x, y, 0, x, y, haloR);
        haloGrad.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.25 * opacity})`);
        haloGrad.addColorStop(0.3, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.12 * opacity})`);
        haloGrad.addColorStop(0.6, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.04 * opacity})`);
        haloGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(x, y, haloR, 0, TWO_PI);
        ctx.fillStyle = haloGrad;
        ctx.fill();

        // Inner bright glow
        const innerGlow = ctx.createRadialGradient(x, y, 0, x, y, r * 1.8);
        innerGlow.addColorStop(0, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.45 * opacity})`);
        innerGlow.addColorStop(0.4, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.2 * opacity})`);
        innerGlow.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(x, y, r * 1.8, 0, TWO_PI);
        ctx.fillStyle = innerGlow;
        ctx.fill();

        // Dark center void (the "hole")
        const voidGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 0.4);
        voidGrad.addColorStop(0, `rgba(0,0,0,${0.85 * opacity})`);
        voidGrad.addColorStop(0.6, `rgba(0,0,0,${0.4 * opacity})`);
        voidGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(x, y, r * 0.4, 0, TWO_PI);
        ctx.fillStyle = voidGrad;
        ctx.fill();

        // Bright event horizon ring
        const ehRadius = r * 0.48;
        const ehAlpha = (0.6 + 0.2 * Math.sin(time * 0.002 + phaseOffset)) * opacity;
        ctx.beginPath();
        ctx.arc(x, y, ehRadius, 0, TWO_PI);
        ctx.strokeStyle = `rgba(255,255,255,${ehAlpha})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Concentric rotating rings
        for (let ring = 0; ring < RING_COUNT; ring++) {
            const ringRadius = r * (0.6 + ring * 0.3);
            const rotSpeed = 0.0008 * (ring % 2 === 0 ? 1 : -1) * (1 + ring * 0.25);
            const rot = time * rotSpeed + phaseOffset + ring * 0.7;
            const ringAlpha = (0.55 - ring * 0.08) * opacity;

            const segments = 5 + ring * 2;
            const gapRatio = 0.3;
            const segSweep = TWO_PI / segments * (1 - gapRatio);

            ctx.lineWidth = Math.max(2.5 - ring * 0.4, 1.0);
            const c = lerpRgb(rgb, WHITE, 0.35 - ring * 0.06);
            ctx.strokeStyle = `rgba(${c.r},${c.g},${c.b},${ringAlpha})`;

            for (let s = 0; s < segments; s++) {
                const start = rot + (s * TWO_PI / segments);
                ctx.beginPath();
                ctx.arc(x, y, ringRadius, start, start + segSweep);
                ctx.stroke();
            }
        }

        // Spiral arms — particles spiraling inward
        for (let arm = 0; arm < SPIRAL_ARMS; arm++) {
            const armOffset = (arm * TWO_PI) / SPIRAL_ARMS;
            for (let p = 0; p < SPIRAL_PARTICLES; p++) {
                const t = p / SPIRAL_PARTICLES;
                const spiralAngle = armOffset + t * TWO_PI * 2.0 + time * 0.0015 + phaseOffset;
                const spiralR = r * (0.25 + t * 1.2);
                const px = x + Math.cos(spiralAngle) * spiralR;
                const py = y + Math.sin(spiralAngle) * spiralR;
                const pAlpha = (0.3 + 0.5 * (1 - t)) * opacity;
                const pSize = 1.5 + 2.5 * (1 - t);

                ctx.beginPath();
                ctx.arc(px, py, pSize, 0, TWO_PI);
                const pc = lerpRgb(rgb, WHITE, 0.6 * (1 - t));
                ctx.fillStyle = `rgba(${pc.r},${pc.g},${pc.b},${pAlpha})`;
                ctx.fill();
            }
        }

        // Outer orbiting particles — larger, brighter
        for (let p = 0; p < OUTER_PARTICLE_COUNT; p++) {
            const orbitSpeed = 0.0005 + (p % 4) * 0.00015;
            const dir = p % 2 === 0 ? 1 : -1;
            const orbitR = r * (1.3 + (p / OUTER_PARTICLE_COUNT) * 1.0);
            const angle = time * orbitSpeed * dir + phaseOffset + (p * TWO_PI / OUTER_PARTICLE_COUNT);
            const px = x + Math.cos(angle) * orbitR;
            const py = y + Math.sin(angle) * orbitR;
            const pAlpha = (0.5 + 0.3 * Math.sin(time * 0.003 + p * 1.1)) * opacity;

            ctx.beginPath();
            ctx.arc(px, py, 2.0, 0, TWO_PI);
            ctx.fillStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${pAlpha})`;
            ctx.fill();
        }

        // Bright core — white hot center
        const coreGrad = ctx.createRadialGradient(x, y, 0, x, y, r * 0.2);
        coreGrad.addColorStop(0, `rgba(255,255,255,${0.95 * opacity})`);
        coreGrad.addColorStop(0.4, `rgba(${rgb.r},${rgb.g},${rgb.b},${0.6 * opacity})`);
        coreGrad.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.beginPath();
        ctx.arc(x, y, r * 0.2, 0, TWO_PI);
        ctx.fillStyle = coreGrad;
        ctx.fill();
    };

    const drawConnection = (ctx, ax, ay, bx, by, rgb, time) => {
        const dx = bx - ax;
        const dy = by - ay;
        const dist = Math.sqrt(dx * dx + dy * dy) || 1;

        const mx = (ax + bx) / 2;
        const my = (ay + by) / 2;
        const perpX = (-dy / dist) * dist * 0.08;
        const perpY = (dx / dist) * dist * 0.08;

        const dashPhase = time * 0.06;

        // Glow line underneath
        ctx.save();
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.06 * opacity})`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx + perpX, my + perpY, bx, by);
        ctx.stroke();

        // Dashed bright line
        ctx.setLineDash([10, 14]);
        ctx.lineDashOffset = -dashPhase;
        ctx.strokeStyle = `rgba(${rgb.r},${rgb.g},${rgb.b},${0.2 * opacity})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.quadraticCurveTo(mx + perpX, my + perpY, bx, by);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();
    };

    // Bigger base radius — scales with zoom to stay prominent
    const vortexRadius = Math.max(30, Math.min(70, 45 / zoom));

    return (
        <Layer {...layerProps} listening={false}>
            <Shape
                ref={shapeRef}
                sceneFunc={(ctx) => {
                    const time = animRef.current.time;
                    for (const vortex of vortexData) {
                        drawConnection(ctx, vortex.a_x, vortex.a_y, vortex.b_x, vortex.b_y, vortex.rgb, time);
                        drawVortex(ctx, vortex.a_x, vortex.a_y, vortex.rgb, time, vortex.phaseA, vortexRadius);
                        drawVortex(ctx, vortex.b_x, vortex.b_y, vortex.rgb, time, vortex.phaseB, vortexRadius);
                    }
                }}
                perfectDrawEnabled={false}
                listening={false}
            />
        </Layer>
    );
});

WormholeLayer.displayName = 'WormholeLayer';

export default WormholeLayer;
