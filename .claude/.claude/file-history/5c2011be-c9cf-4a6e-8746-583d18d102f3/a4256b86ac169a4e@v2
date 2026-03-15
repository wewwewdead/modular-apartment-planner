import { useState, useEffect, useRef } from 'react';

const easeOutExpo = (t) => (t === 1 ? 1 : 1 - Math.pow(2, -10 * t));

const useAnimatedCounter = (target, duration = 900) => {
    const [value, setValue] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        if (!target || target === 0) { setValue(0); return; }

        const start = performance.now();

        const tick = (now) => {
            const elapsed = Math.min((now - start) / duration, 1);
            setValue(Math.round(easeOutExpo(elapsed) * target));
            if (elapsed < 1) rafRef.current = requestAnimationFrame(tick);
        };

        rafRef.current = requestAnimationFrame(tick);
        return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
    }, [target, duration]);

    return value;
};

export default useAnimatedCounter;
