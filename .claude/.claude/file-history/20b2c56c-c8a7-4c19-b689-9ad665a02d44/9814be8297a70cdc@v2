import React, { useRef, useEffect, useCallback, useMemo } from 'react';
import { Layer, Shape } from 'react-konva';
import embeddingToColor from '../utils/embeddingToColor';
import { simpleHash, getStarColor } from '../utils/starUtils';

const TWO_PI = Math.PI * 2;
const BREATH_PERIOD = 10000;
const ROTATION_SPEED = 0.002;
const BASE_RADIUS = 400;
const RADIUS_PER_POST = 50;
const MAX_EXTRA_POSTS = 4;
const DUST_PER_GALAXY = 60;

/** Parse "#5f92ff" → { r, g, b } */
const parseHex = (hex) => ({
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
});

/** Seeded RNG */
const seededRng = (seed) => {
    let s = seed | 0;
    return () => {
        s = (s + 0x6D2B79F5) | 0;
        let t = Math.imul(s ^ (s >>> 15), 1 | s);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
};

const NebulaLayer = React.memo(({ layerProps, galaxies, centroids }) => {
    const animRef = useRef({ phase: 0, rotations: [], time: 0 });
    const shapeRef = useRef(null);
    const rafRef = useRef(null);

    // Build nebula data: position + RGB color for each galaxy
    const nebulaData = useMemo(() => {
        const centroidMap = new Map();
        if (Array.isArray(centroids)) {
            for (const c of centroids) {
                centroidMap.set(c.user_id, c);
            }
        }

        const data = [];
        if (!Array.isArray(galaxies)) return data;

        for (const galaxy of galaxies) {
            const centroid = centroidMap.get(galaxy.userId);
            const embedding = centroid?.mean_embedding;
            const rgb = embeddingToColor(embedding) || parseHex(getStarColor(galaxy.userId));
            const postCount = Math.min(centroid?.post_count ?? 0, MAX_EXTRA_POSTS);
            const radius = BASE_RADIUS + postCount * RADIUS_PER_POST;

            data.push({
                x: galaxy.x,
                y: galaxy.y,
                radius,
                r: rgb.r,
                g: rgb.g,
                b: rgb.b,
            });
        }

        return data;
    }, [galaxies, centroids]);

    // Generate deterministic stardust particles for each galaxy
    const dustData = useMemo(() => {
        if (!Array.isArray(galaxies) || galaxies.length === 0) return [];

        const allDust = [];

        for (const galaxy of galaxies) {
            const seed = simpleHash(galaxy.userId) + 3571;
            const rng = seededRng(seed);
            const color = getStarColor(galaxy.userId);
            const rgb = parseHex(color);
            const galaxyRadius = 250 + (rng() * 100);

            for (let i = 0; i < DUST_PER_GALAXY; i++) {
                const angle = rng() * TWO_PI;
                const dist = galaxyRadius * (0.15 + rng() * 1.1);
                const localX = Math.cos(angle) * dist;
                const localY = Math.sin(angle) * dist * (0.5 + rng() * 0.4);

                const twinkleSpeed = 0.0008 + rng() * 0.002;
                const twinklePhase = rng() * TWO_PI;
                const driftSpeed = 0.00003 + rng() * 0.00008;
                const driftAngle = rng() * TWO_PI;
                const driftRadius = 3 + rng() * 12;
                const baseAlpha = 0.08 + rng() * 0.35;
                const size = 0.4 + rng() * 1.6;

                const warmMix = rng();
                const r = Math.round(rgb.r + (255 - rgb.r) * warmMix * 0.5);
                const g = Math.round(rgb.g + (248 - rgb.g) * warmMix * 0.4);
                const b = Math.round(rgb.b + (220 - rgb.b) * warmMix * 0.3);

                allDust.push({
                    gx: galaxy.x,
                    gy: galaxy.y,
                    localX, localY,
                    twinkleSpeed, twinklePhase,
                    driftSpeed, driftAngle, driftRadius,
                    baseAlpha, size,
                    r, g, b,
                });
            }
        }

        return allDust;
    }, [galaxies]);

    // Initialize per-cloud rotation offsets when data changes
    useEffect(() => {
        animRef.current.rotations = nebulaData.map(() => Math.random() * 360);
    }, [nebulaData]);

    // Animation loop
    const animate = useCallback(() => {
        const anim = animRef.current;
        const now = performance.now();
        anim.phase = (now % BREATH_PERIOD) / BREATH_PERIOD;
        anim.time = now;

        for (let i = 0; i < anim.rotations.length; i++) {
            anim.rotations[i] += ROTATION_SPEED;
        }

        if (shapeRef.current) {
            shapeRef.current.getLayer()?.batchDraw();
        }

        rafRef.current = requestAnimationFrame(animate);
    }, []);

    useEffect(() => {
        rafRef.current = requestAnimationFrame(animate);
        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [animate]);

    return (
        <Layer {...layerProps} listening={false}>
            <Shape
                ref={shapeRef}
                sceneFunc={(ctx) => {
                    const anim = animRef.current;
                    const scale = 1.0 + 0.15 * Math.sin(anim.phase * TWO_PI);
                    const time = anim.time;

                    // --- Nebula clouds ---
                    for (let i = 0; i < nebulaData.length; i++) {
                        const cloud = nebulaData[i];
                        const rot = (anim.rotations[i] || 0) * (Math.PI / 180);
                        const r = cloud.radius * scale;

                        ctx.save();
                        ctx.translate(cloud.x, cloud.y);
                        ctx.rotate(rot);

                        const grad = ctx.createRadialGradient(0, 0, 0, 0, 0, r);
                        grad.addColorStop(0, `rgba(${cloud.r},${cloud.g},${cloud.b},0.18)`);
                        grad.addColorStop(0.5, `rgba(${cloud.r},${cloud.g},${cloud.b},0.08)`);
                        grad.addColorStop(1, 'rgba(0,0,0,0)');

                        ctx.beginPath();
                        ctx.arc(0, 0, r, 0, TWO_PI);
                        ctx.fillStyle = grad;
                        ctx.fill();

                        ctx.restore();
                    }

                    // --- Stardust particles ---
                    for (let i = 0; i < dustData.length; i++) {
                        const d = dustData[i];

                        const twinkle = 0.5 + 0.5 * Math.sin(time * d.twinkleSpeed + d.twinklePhase);
                        const alpha = d.baseAlpha * twinkle;
                        if (alpha < 0.02) continue;

                        const driftPhase = time * d.driftSpeed;
                        const dx = Math.cos(d.driftAngle + driftPhase) * d.driftRadius;
                        const dy = Math.sin(d.driftAngle + driftPhase) * d.driftRadius;

                        const px = d.gx + d.localX + dx;
                        const py = d.gy + d.localY + dy;
                        const sizePulse = d.size * (0.85 + 0.15 * twinkle);

                        ctx.beginPath();
                        ctx.arc(px, py, sizePulse, 0, TWO_PI);
                        ctx.fillStyle = `rgba(${d.r},${d.g},${d.b},${alpha})`;
                        ctx.fill();
                    }
                }}
                perfectDrawEnabled={false}
                listening={false}
            />
        </Layer>
    );
});

NebulaLayer.displayName = 'NebulaLayer';

export default NebulaLayer;
