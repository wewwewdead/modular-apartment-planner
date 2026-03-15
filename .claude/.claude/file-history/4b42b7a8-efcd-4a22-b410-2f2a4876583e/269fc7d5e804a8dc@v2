import React from 'react';
import { motion } from 'framer-motion';
import useAnimatedCounter from './useAnimatedCounter';

const fmt = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const StatTile = ({ icon, value, label, index }) => {
    const animated = useAnimatedCounter(value, 900 + index * 50);

    return (
        <motion.div
            className="recap-tile"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.35, delay: 0.1 + index * 0.08, ease: 'easeOut' }}
        >
            <span className="recap-tile-icon">{icon}</span>
            <span className="recap-tile-value">{fmt(animated)}</span>
            <span className="recap-tile-label">{label}</span>
        </motion.div>
    );
};

export default StatTile;
