import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import './StreakMilestoneToast.css';

const milestoneMessages = {
    7: "1 week streak! You're on fire!",
    14: "2 weeks strong! Unstoppable!",
    30: "30 days! A whole month of writing!",
    50: "50 day streak! Legend in the making!",
    100: "100 DAYS! Absolute legend!",
};

const StreakMilestoneToast = ({ milestone, onDismiss }) => {
    const [confettiPieces, setConfettiPieces] = useState([]);

    useEffect(() => {
        if (!milestone) return;

        // Generate confetti pieces
        const pieces = Array.from({ length: 24 }, (_, i) => ({
            id: i,
            x: Math.random() * 100,
            delay: Math.random() * 0.5,
            duration: 1.5 + Math.random() * 1,
            color: ['#f59e0b', '#ef4444', '#f97316', '#eab308', '#22c55e', '#3b82f6'][i % 6],
            rotation: Math.random() * 360,
        }));
        setConfettiPieces(pieces);

        const timer = setTimeout(() => {
            onDismiss?.();
        }, 5000);

        return () => clearTimeout(timer);
    }, [milestone, onDismiss]);

    if (!milestone) return null;

    return (
        <AnimatePresence>
            <motion.div
                className="streak-milestone-toast"
                initial={{ opacity: 0, y: 60, scale: 0.9 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -20, scale: 0.95 }}
                transition={{ type: 'spring', damping: 20, stiffness: 300 }}
                onClick={onDismiss}
            >
                <div className="streak-milestone-confetti">
                    {confettiPieces.map((piece) => (
                        <motion.div
                            key={piece.id}
                            className="confetti-piece"
                            style={{
                                left: `${piece.x}%`,
                                backgroundColor: piece.color,
                            }}
                            initial={{ y: -10, opacity: 1, rotate: 0 }}
                            animate={{
                                y: 120,
                                opacity: 0,
                                rotate: piece.rotation,
                            }}
                            transition={{
                                duration: piece.duration,
                                delay: piece.delay,
                                ease: 'easeOut',
                            }}
                        />
                    ))}
                </div>
                <div className="streak-milestone-content">
                    <span className="streak-milestone-flame">
                        <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 -960 960 960" fill="#eab308">
                            <path d="M80-120q27-71 65-133.5T225-370q-10-26-15-52t-5-54q0-94 55-168.5T400-740q-3 42 10 81t38 72q25 33 60.5 52t77.5 22q-6-39 2-77.5t28-72.5q20-34 49.5-61T726-776q-2 48 8 93.5t31 86.5q21 41 33 85t12 91q0 30-5 58.5T790-308q10 10 19 20.5t18 21.5q31 38 55 80t43 86H80Z" />
                        </svg>
                    </span>
                    <div className="streak-milestone-text">
                        <span className="streak-milestone-count">{milestone} Day Streak!</span>
                        <span className="streak-milestone-msg">{milestoneMessages[milestone]}</span>
                    </div>
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default StreakMilestoneToast;
