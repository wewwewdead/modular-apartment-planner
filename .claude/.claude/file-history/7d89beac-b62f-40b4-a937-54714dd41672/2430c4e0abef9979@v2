import React from 'react';
import { motion } from 'framer-motion';
import useAnimatedCounter from '../DashboardBriefing/useAnimatedCounter';

const fmt = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1000000) return `${(n / 1000000).toFixed(1)}M`;
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const Tile = ({ icon, value, label, index }) => {
    const animated = useAnimatedCounter(value, 900 + index * 50);

    return (
        <motion.div
            className="analytics-stat-tile"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.1 + index * 0.08, ease: 'easeOut' }}
        >
            <span className="analytics-tile-icon">{icon}</span>
            <span className="analytics-tile-value">{fmt(animated)}</span>
            <span className="analytics-tile-label">{label}</span>
        </motion.div>
    );
};

const AnalyticsSummary = ({ summary }) => {
    if (!summary) return null;

    const tiles = [
        { icon: '📝', value: summary.total_posts, label: 'posts' },
        { icon: '👁', value: summary.total_views, label: 'views' },
        { icon: '✨', value: summary.total_reactions, label: 'reactions' },
        { icon: '💬', value: summary.total_comments, label: 'comments' },
    ];

    return (
        <div className="analytics-summary-grid">
            {tiles.map((t, i) => (
                <Tile key={t.label} icon={t.icon} value={t.value} label={t.label} index={i} />
            ))}
        </div>
    );
};

export default AnalyticsSummary;
