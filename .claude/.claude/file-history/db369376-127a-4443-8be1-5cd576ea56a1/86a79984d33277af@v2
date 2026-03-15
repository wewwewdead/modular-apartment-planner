import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';

const CONFETTI_COLORS = ['#D4A853', '#C4943E', '#E0BA6A', '#FAF9F6', '#8A9E7A'];

const FirstActionStep = ({ goBack, writingGoal, onComplete }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const myConfetti = confetti.create(canvasRef.current, { resize: true });

        const timer = setTimeout(() => {
            myConfetti({
                particleCount: 100,
                spread: 120,
                startVelocity: 30,
                ticks: 600,
                gravity: 0.5,
                scalar: 1.3,
                origin: { x: 0.5, y: 0.35 },
                colors: CONFETTI_COLORS,
            });
        }, 300);

        return () => clearTimeout(timer);
    }, []);

    const getPrimaryCta = () => {
        switch (writingGoal) {
            case 'journal':
            case 'publish':
                return { label: 'Write your first post', action: 'write' };
            case 'stories':
                return { label: 'Start a story', action: 'story' };
            default:
                return { label: 'Explore Iskrib', action: 'explore' };
        }
    };

    const getSecondaryCta = () => {
        switch (writingGoal) {
            case 'journal':
            case 'publish':
                return { label: 'Explore first', action: 'explore' };
            case 'stories':
                return { label: 'Write a post instead', action: 'write' };
            default:
                return { label: 'Write your first post', action: 'write' };
        }
    };

    const primary = getPrimaryCta();
    const secondary = getSecondaryCta();

    return (
        <div className="onboarding-step firstaction-step">
            <canvas ref={canvasRef} className="onboarding-confetti-canvas" />

            <button className="onboarding-back-btn" onClick={goBack} type="button">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>

            <motion.div
                className="firstaction-icon"
                initial={{ scale: 0.8, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ type: 'spring', stiffness: 200, damping: 15 }}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
                </svg>
            </motion.div>

            <motion.h2
                className="onboarding-step-title"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2, duration: 0.5 }}
            >
                You're ready
            </motion.h2>

            <motion.p
                className="onboarding-step-subtitle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4, duration: 0.5 }}
            >
                Your quiet writing space awaits.
            </motion.p>

            <motion.div
                className="firstaction-cta-group"
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.6, duration: 0.5 }}
            >
                <motion.button
                    className="onboarding-cta-primary"
                    onClick={() => onComplete(primary.action)}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    {primary.label}
                </motion.button>
                <button
                    className="onboarding-cta-secondary"
                    onClick={() => onComplete(secondary.action)}
                    type="button"
                >
                    {secondary.label}
                </button>
            </motion.div>
        </div>
    );
};

export default FirstActionStep;
