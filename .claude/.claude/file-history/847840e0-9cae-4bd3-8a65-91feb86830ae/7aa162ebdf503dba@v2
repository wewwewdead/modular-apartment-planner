import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';

const PARTICLE_COUNT = 6;
const DURATION = 0.85;
const STAGGER = 0.06;

const generateParticles = (originRect) => {
    const centerX = originRect.left + originRect.width / 2;
    const centerY = originRect.top + originRect.height / 2;

    return Array.from({ length: PARTICLE_COUNT }, (_, i) => ({
        id: i,
        x: centerX,
        y: centerY,
        driftX: (Math.random() - 0.5) * 80,
        driftY: -(80 + Math.random() * 60),
        rotation: (Math.random() - 0.5) * 120,
        scale: 0.6 + Math.random() * 0.6,
        delay: i * STAGGER,
    }));
};

const ReactionBurst = ({ emoji, originRect, onComplete }) => {
    const [particles, setParticles] = useState(() => generateParticles(originRect));

    useEffect(() => {
        const timeout = setTimeout(() => {
            onComplete();
        }, (DURATION + PARTICLE_COUNT * STAGGER) * 1000 + 100);

        return () => clearTimeout(timeout);
    }, [onComplete]);

    return createPortal(
        <AnimatePresence>
            {particles.map((p) => (
                <motion.span
                    key={p.id}
                    initial={{
                        position: 'fixed',
                        left: p.x,
                        top: p.y,
                        opacity: 1,
                        scale: 0.3,
                        rotate: 0,
                        zIndex: 99999,
                        pointerEvents: 'none',
                        fontSize: '20px',
                        lineHeight: 1,
                        userSelect: 'none',
                    }}
                    animate={{
                        left: p.x + p.driftX,
                        top: p.y + p.driftY,
                        opacity: 0,
                        scale: p.scale,
                        rotate: p.rotation,
                    }}
                    transition={{
                        duration: DURATION,
                        delay: p.delay,
                        ease: [0.25, 0.46, 0.45, 0.94],
                    }}
                >
                    {emoji}
                </motion.span>
            ))}
        </AnimatePresence>,
        document.body
    );
};

export default ReactionBurst;
