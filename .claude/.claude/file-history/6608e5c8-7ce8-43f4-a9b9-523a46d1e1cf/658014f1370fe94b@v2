import React, { useRef, useEffect, useCallback } from 'react';
import { getStarColor } from '../utils/starUtils';
import styles from '../Universe.module.css';

const MINIMAP_SIZE = 160;
const WORLD_MIN = -25000;
const WORLD_MAX = 25000;
const WORLD_RANGE = WORLD_MAX - WORLD_MIN;

/** Convert world coordinate to minimap pixel */
const worldToMinimap = (val) =>
    ((val - WORLD_MIN) / WORLD_RANGE) * MINIMAP_SIZE;

/** Convert minimap pixel to world coordinate */
const minimapToWorld = (px) =>
    (px / MINIMAP_SIZE) * WORLD_RANGE + WORLD_MIN;

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

const UniverseMinimap = React.memo(({ galaxies, camera, zoom, stageSize, onNavigate, constellations, computedStarPositions, focusedConstellationId }) => {
    const canvasRef = useRef(null);
    const pointerStateRef = useRef({
        active: false,
        pointerId: null,
        moved: false,
        startX: 0,
        startY: 0,
    });

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        const dpr = window.devicePixelRatio || 1;

        canvas.width = MINIMAP_SIZE * dpr;
        canvas.height = MINIMAP_SIZE * dpr;
        ctx.scale(dpr, dpr);

        // Background
        ctx.fillStyle = 'rgba(10, 14, 26, 0.85)';
        ctx.fillRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

        // Galaxy dots
        if (galaxies) {
            for (const g of galaxies) {
                const mx = worldToMinimap(g.x);
                const my = worldToMinimap(g.y);

                ctx.fillStyle = getStarColor(g.userId);
                ctx.globalAlpha = 0.7;
                ctx.beginPath();
                ctx.arc(mx, my, 1.5, 0, Math.PI * 2);
                ctx.fill();
            }
        }

        ctx.globalAlpha = 1;

        // Constellation lines
        if (Array.isArray(constellations) && constellations.length > 0 && computedStarPositions) {
            for (const link of constellations) {
                const posA = computedStarPositions.get(link.star_id_a);
                const posB = computedStarPositions.get(link.star_id_b);
                if (!posA || !posB) continue;

                const ax = worldToMinimap(posA.x);
                const ay = worldToMinimap(posA.y);
                const bx = worldToMinimap(posB.x);
                const by = worldToMinimap(posB.y);

                const isFocused = focusedConstellationId === link.id;

                if (isFocused) {
                    // Glow layer
                    ctx.save();
                    ctx.strokeStyle = 'rgba(95, 146, 255, 0.6)';
                    ctx.lineWidth = 3;
                    ctx.globalAlpha = 0.5;
                    ctx.shadowColor = 'rgba(95, 146, 255, 0.9)';
                    ctx.shadowBlur = 8;
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                    ctx.restore();
                    // Bright core
                    ctx.save();
                    ctx.strokeStyle = 'rgba(180, 210, 255, 0.9)';
                    ctx.lineWidth = 1;
                    ctx.globalAlpha = 1;
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                    ctx.restore();
                } else {
                    ctx.strokeStyle = 'rgba(95, 146, 255, 0.4)';
                    ctx.lineWidth = 0.5;
                    ctx.globalAlpha = focusedConstellationId ? 0.15 : 0.6;
                    ctx.beginPath();
                    ctx.moveTo(ax, ay);
                    ctx.lineTo(bx, by);
                    ctx.stroke();
                }
            }
            ctx.globalAlpha = 1;
        }

        // Viewport rectangle
        if (camera && stageSize) {
            // Camera is the world-space center, zoom determines how much world is visible
            const viewWidth = stageSize.width / zoom;
            const viewHeight = stageSize.height / zoom;

            const vpLeft = worldToMinimap(camera.x - viewWidth / 2);
            const vpTop = worldToMinimap(camera.y - viewHeight / 2);
            const vpW = (viewWidth / WORLD_RANGE) * MINIMAP_SIZE;
            const vpH = (viewHeight / WORLD_RANGE) * MINIMAP_SIZE;

            ctx.strokeStyle = 'rgba(255, 255, 255, 0.6)';
            ctx.lineWidth = 1;
            ctx.strokeRect(vpLeft, vpTop, vpW, vpH);
        }

        // Border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        ctx.lineWidth = 1;
        ctx.strokeRect(0, 0, MINIMAP_SIZE, MINIMAP_SIZE);

    }, [galaxies, camera, zoom, stageSize, constellations, computedStarPositions, focusedConstellationId]);

    const navigateFromClientPoint = useCallback((clientX, clientY, mode = 'fly') => {
        const canvas = canvasRef.current;
        if (!canvas || !onNavigate) return;

        const rect = canvas.getBoundingClientRect();
        if (!rect.width || !rect.height) return;

        const scaleX = MINIMAP_SIZE / rect.width;
        const scaleY = MINIMAP_SIZE / rect.height;

        const px = clamp((clientX - rect.left) * scaleX, 0, MINIMAP_SIZE);
        const py = clamp((clientY - rect.top) * scaleY, 0, MINIMAP_SIZE);

        const worldX = minimapToWorld(px);
        const worldY = minimapToWorld(py);

        onNavigate(worldX, worldY, mode);
    }, [onNavigate]);

    const handlePointerDown = useCallback((e) => {
        const canvas = canvasRef.current;
        if (!canvas) return;

        e.preventDefault();
        e.stopPropagation();

        pointerStateRef.current = {
            active: true,
            pointerId: e.pointerId,
            moved: false,
            startX: e.clientX,
            startY: e.clientY,
        };

        if (canvas.setPointerCapture) {
            canvas.setPointerCapture(e.pointerId);
        }
    }, []);

    const handlePointerMove = useCallback((e) => {
        const state = pointerStateRef.current;
        if (!state.active || state.pointerId !== e.pointerId) return;

        e.preventDefault();
        e.stopPropagation();

        const movedEnough = Math.hypot(e.clientX - state.startX, e.clientY - state.startY) > 2;
        if (!movedEnough && !state.moved) return;

        state.moved = true;
        navigateFromClientPoint(e.clientX, e.clientY, 'drag');
    }, [navigateFromClientPoint]);

    const finishPointer = useCallback((e) => {
        const state = pointerStateRef.current;
        if (!state.active || state.pointerId !== e.pointerId) return;

        e.preventDefault();
        e.stopPropagation();

        if (state.moved) {
            navigateFromClientPoint(e.clientX, e.clientY, 'drag');
        } else {
            navigateFromClientPoint(e.clientX, e.clientY, 'fly');
        }

        const canvas = canvasRef.current;
        if (canvas?.releasePointerCapture) {
            canvas.releasePointerCapture(e.pointerId);
        }

        pointerStateRef.current = {
            active: false,
            pointerId: null,
            moved: false,
            startX: 0,
            startY: 0,
        };
    }, [navigateFromClientPoint]);

    const handleContextMenu = useCallback((e) => {
        e.preventDefault();
    }, []);

    return (
        <canvas
            ref={canvasRef}
            className={styles.minimap}
            width={MINIMAP_SIZE}
            height={MINIMAP_SIZE}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={finishPointer}
            onPointerCancel={finishPointer}
            onPointerLeave={finishPointer}
            onContextMenu={handleContextMenu}
            title="Click to fly, drag to pan"
        />
    );
});

UniverseMinimap.displayName = 'UniverseMinimap';

export default UniverseMinimap;
