import React from 'react';
import { motion } from 'framer-motion';
import StatTile from './StatTile';
import BestPostCard from './BestPostCard';
import CommunityHighlights from './CommunityHighlights';
import { getOverallEncouragement } from './recapCopy';

const PenIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 20h9"/>
        <path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/>
    </svg>
);

const TypeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="4 7 4 4 20 4 20 7"/>
        <line x1="9" y1="20" x2="15" y2="20"/>
        <line x1="12" y1="4" x2="12" y2="20"/>
    </svg>
);

const HeartIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
    </svg>
);

const EyeIcon = () => (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
        <circle cx="12" cy="12" r="3"/>
    </svg>
);

const RecapSection = ({ personal, group, streakCount, freezeAvailable }) => {
    const posts = personal?.posts_written || 0;
    const words = personal?.total_words || 0;
    const reactions = personal?.reactions_received || 0;
    const views = personal?.views_received || 0;

    const tiles = [
        { icon: <PenIcon />, value: posts, label: 'posts' },
        { icon: <TypeIcon />, value: words, label: 'words' },
        { icon: <HeartIcon />, value: reactions, label: 'reactions' },
        { icon: <EyeIcon />, value: views, label: 'views' },
    ];

    return (
        <div className="dashboard-recap-v2">
            <motion.p
                className="recap-encouragement"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.3, delay: 0.05 }}
            >
                {getOverallEncouragement(personal, streakCount, freezeAvailable)}
            </motion.p>

            <div className="recap-tiles-grid">
                {tiles.map((tile, i) => (
                    <StatTile key={tile.label} {...tile} index={i} />
                ))}
            </div>

            <BestPostCard bestPost={personal?.best_post} />

            <CommunityHighlights group={group} />
        </div>
    );
};

export default RecapSection;
