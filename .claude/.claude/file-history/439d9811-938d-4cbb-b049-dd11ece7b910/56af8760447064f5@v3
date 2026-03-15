import React, { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

const fmt = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const RecapSection = ({ personal, group }) => {
    const [expanded, setExpanded] = useState(false);

    const bestPost = personal?.best_post;
    const mostActive = group?.most_active_writer;
    const mostReacted = group?.most_reacted_post;

    return (
        <div className="dashboard-recap">
            <div className="dashboard-stat-row" onClick={() => setExpanded((v) => !v)}>
                <span className="dashboard-stat-line">
                    <strong>{personal?.posts_written || 0}</strong> posts
                    {' · '}
                    <strong>{fmt(personal?.total_words)}</strong> words
                    {' · '}
                    <strong>{fmt(personal?.reactions_received)}</strong> reactions
                    {' · '}
                    <strong>{fmt(personal?.views_received)}</strong> views
                </span>

                <button className={`dashboard-recap-expand ${expanded ? 'is-expanded' : ''}`}>
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                        <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                    </svg>
                </button>
            </div>

            <AnimatePresence>
                {expanded && (
                    <motion.div
                        className="dashboard-recap-details"
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        transition={{ duration: 0.25, ease: 'easeOut' }}
                    >
                        <div className="dashboard-recap-details-inner">
                            {bestPost && bestPost.journal_id && (
                                <div className="dashboard-recap-detail">
                                    <span className="dashboard-recap-detail-heading">Your best post</span>
                                    <p className="dashboard-recap-detail-text">
                                        {bestPost.title || 'Untitled'} — {bestPost.reaction_count || 0} reactions
                                    </p>
                                </div>
                            )}

                            <div className="dashboard-recap-detail">
                                <span className="dashboard-recap-detail-heading">Community</span>
                                <p className="dashboard-recap-detail-text">
                                    {group?.total_posts || 0} posts written this week
                                </p>
                            </div>

                            {mostActive && mostActive.name && (
                                <div className="dashboard-recap-detail">
                                    <span className="dashboard-recap-detail-heading">Most active writer</span>
                                    <div className="dashboard-recap-detail-user">
                                        <img
                                            src={mostActive.avatar || '/assets/profile.jpg'}
                                            alt={mostActive.name}
                                            className="dashboard-recap-detail-avatar"
                                        />
                                        <span className="dashboard-recap-detail-text">
                                            {mostActive.name} — {mostActive.post_count} posts
                                        </span>
                                    </div>
                                </div>
                            )}

                            {mostReacted && mostReacted.title && (
                                <div className="dashboard-recap-detail">
                                    <span className="dashboard-recap-detail-heading">Most reacted post</span>
                                    <div className="dashboard-recap-detail-user">
                                        <img
                                            src={mostReacted.author_avatar || '/assets/profile.jpg'}
                                            alt={mostReacted.author_name}
                                            className="dashboard-recap-detail-avatar"
                                        />
                                        <span className="dashboard-recap-detail-text">
                                            {mostReacted.title} by {mostReacted.author_name} — {mostReacted.reaction_count || 0} reactions
                                        </span>
                                    </div>
                                </div>
                            )}
                        </div>
                    </motion.div>
                )}
            </AnimatePresence>
        </div>
    );
};

export default RecapSection;
