import { useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import confetti from 'canvas-confetti';
import TypewriterText from '../components/TypewriterText';

const CONFETTI_COLORS = ['#D4A853', '#C4943E', '#E0BA6A', '#FAF9F6', '#8A9E7A'];

const WelcomeStep = ({ goNext }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        if (!canvasRef.current) return;
        const myConfetti = confetti.create(canvasRef.current, { resize: true });

        const timer = setTimeout(() => {
            myConfetti({
                particleCount: 80,
                spread: 100,
                startVelocity: 25,
                ticks: 500,
                gravity: 0.6,
                scalar: 1.2,
                origin: { x: 0.5, y: 0.4 },
                colors: CONFETTI_COLORS,
            });
        }, 600);

        return () => clearTimeout(timer);
    }, []);

    return (
        <div className="onboarding-step welcome-step">
            <canvas ref={canvasRef} className="onboarding-confetti-canvas" />

            <div className="welcome-blob" />

            <motion.div
                className="welcome-brand"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.1, duration: 0.5 }}
            >
                ISKRIB
            </motion.div>

            <motion.h1
                className="onboarding-step-title"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.3, duration: 0.5 }}
            >
                <TypewriterText text="Welcome to Iskrib" delay={50} />
            </motion.h1>

            <motion.p
                className="onboarding-step-subtitle"
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.2, duration: 0.6 }}
            >
                A quiet place for your thoughts, stories, and reflections.
            </motion.p>

            <motion.button
                className="onboarding-cta-primary"
                onClick={goNext}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 1.8, duration: 0.5 }}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
            >
                Let's set up your space
            </motion.button>
        </div>
    );
};

export default WelcomeStep;
