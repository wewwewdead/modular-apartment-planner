import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';

const StarIcon = () => (
    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
        <path d="M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z"/>
    </svg>
);

const BestPostCard = ({ bestPost }) => {
    const navigate = useNavigate();

    if (!bestPost || !bestPost.journal_id) return null;

    const handleClick = () => {
        navigate(`/home/post/${bestPost.journal_id}`);
    };

    return (
        <motion.div
            className="recap-best-post"
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, delay: 0.45, ease: 'easeOut' }}
            onClick={handleClick}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => e.key === 'Enter' && handleClick()}
        >
            <span className="recap-best-post-badge">
                <StarIcon /> Best post this week
            </span>
            <span className="recap-best-post-title">
                {bestPost.title || 'Untitled'}
            </span>
            <span className="recap-best-post-stats">
                {bestPost.reaction_count || 0} reactions · {bestPost.view_count || 0} views
            </span>
        </motion.div>
    );
};

export default BestPostCard;
