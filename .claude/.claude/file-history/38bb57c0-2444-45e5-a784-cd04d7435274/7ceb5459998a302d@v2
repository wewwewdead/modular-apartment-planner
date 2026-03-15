import { useRef, useCallback } from 'react';
import styles from '../Universe.module.css';

const TouchThrottle = ({ analogRef, inputFrozenRef, onInteract }) => {
    const thrustTouchRef = useRef(null);
    const dockTouchRef = useRef(null);

    // ── Thrust (hold) ─────────────────────────────────────────────
    const onThrustStart = useCallback((e) => {
        if (thrustTouchRef.current !== null || inputFrozenRef.current) return;
        thrustTouchRef.current = e.changedTouches[0].identifier;
        analogRef.current.throttle = 1;
    }, [analogRef, inputFrozenRef]);

    const onThrustEnd = useCallback((e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === thrustTouchRef.current) {
                thrustTouchRef.current = null;
                analogRef.current.throttle = 0;
                return;
            }
        }
    }, [analogRef]);

    // ── Dock (tap) ────────────────────────────────────────────────
    const onDockStart = useCallback((e) => {
        if (dockTouchRef.current !== null || inputFrozenRef.current) return;
        dockTouchRef.current = e.changedTouches[0].identifier;
    }, [inputFrozenRef]);

    const onDockEnd = useCallback((e) => {
        for (let i = 0; i < e.changedTouches.length; i++) {
            if (e.changedTouches[i].identifier === dockTouchRef.current) {
                dockTouchRef.current = null;
                if (!inputFrozenRef.current) onInteract();
                return;
            }
        }
    }, [inputFrozenRef, onInteract]);

    return (
        <div className={styles.throttleArea}>
            <button
                className={styles.thrustBtn}
                onTouchStart={onThrustStart}
                onTouchEnd={onThrustEnd}
                onTouchCancel={onThrustEnd}
            >
                THRUST
            </button>
            <button
                className={styles.dockBtn}
                onTouchStart={onDockStart}
                onTouchEnd={onDockEnd}
                onTouchCancel={onDockEnd}
            >
                DOCK
            </button>
        </div>
    );
};

export default TouchThrottle;
