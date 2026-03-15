import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { getWeeklyRecap } from '../../../API/Api';
import { useAuth } from '../../Context/useAuth';
import './WeeklyRecapCard.css';

const getWeekKey = () => {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
    return `recap-dismissed-${monday.toISOString().slice(0, 10)}`;
};

const formatNumber = (n) => {
    if (!n || n === 0) return '0';
    if (n >= 1000) return `${(n / 1000).toFixed(1)}K`;
    return String(n);
};

const WeeklyRecapCard = () => {
    const { session } = useAuth();
    const weekKey = getWeekKey();

    const [dismissed, setDismissed] = useState(() => {
        try { return localStorage.getItem(weekKey) === 'true'; }
        catch { return false; }
    });
    const [expanded, setExpanded] = useState(false);

    const { data, isLoading } = useQuery({
        queryKey: ['weeklyRecap', session?.access_token],
        queryFn: () => getWeeklyRecap(session?.access_token),
        enabled: !!session?.access_token && !dismissed,
        staleTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
    });

    if (dismissed || isLoading || !data?.recap) return null;

    const recap = data.recap;
    const personal = recap.personal || {};
    const group = recap.group || {};

    if (personal.posts_written === 0 && group.total_posts === 0) return null;

    const handleDismiss = (e) => {
        e.stopPropagation();
        try { localStorage.setItem(weekKey, 'true'); }
        catch { /* no-op */ }
        setDismissed(true);
    };

    const bestPost = personal.best_post;
    const mostActive = group.most_active_writer;
    const mostReacted = group.most_reacted_post;

    return (
        <AnimatePresence>
            {!dismissed && (
                <motion.div
                    className="weekly-recap-card"
                    initial={{ opacity: 0, y: -12 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -20, transition: { duration: 0.25 } }}
                    transition={{ duration: 0.4, ease: 'easeOut' }}
                >
                    <div className="recap-header">
                        <div className="recap-header-left">
                            <svg className="recap-icon" width="18" height="18" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                                <path d="M9 2H15M12 10V14M12 22C7.02944 22 3 17.9706 3 13C3 8.02944 7.02944 4 12 4C16.9706 4 21 8.02944 21 13C21 17.9706 16.9706 22 12 22Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                            <span className="recap-label">Your Week</span>
                        </div>
                        <button className="recap-dismiss-btn" onClick={handleDismiss} title="Dismiss">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </button>
                    </div>

                    <div className="recap-summary-row" onClick={() => setExpanded((v) => !v)}>
                        <div className="recap-stat">
                            <span className="recap-stat-value">{personal.posts_written || 0}</span>
                            <span className="recap-stat-label">posts</span>
                        </div>
                        <div className="recap-stat-divider" />
                        <div className="recap-stat">
                            <span className="recap-stat-value">{formatNumber(personal.total_words)}</span>
                            <span className="recap-stat-label">words</span>
                        </div>
                        <div className="recap-stat-divider" />
                        <div className="recap-stat">
                            <span className="recap-stat-value">{formatNumber(personal.reactions_received)}</span>
                            <span className="recap-stat-label">reactions</span>
                        </div>
                        <div className="recap-stat-divider" />
                        <div className="recap-stat">
                            <span className="recap-stat-value">{formatNumber(personal.views_received)}</span>
                            <span className="recap-stat-label">views</span>
                        </div>

                        <button className={`recap-expand-btn ${expanded ? 'is-expanded' : ''}`}>
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                                <path d="M6 9L12 15L18 9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                            </svg>
                        </button>
                    </div>

                    <AnimatePresence>
                        {expanded && (
                            <motion.div
                                className="recap-details"
                                initial={{ height: 0, opacity: 0 }}
                                animate={{ height: 'auto', opacity: 1 }}
                                exit={{ height: 0, opacity: 0 }}
                                transition={{ duration: 0.25, ease: 'easeOut' }}
                            >
                                <div className="recap-details-inner">
                                    {bestPost && bestPost.journal_id && (
                                        <div className="recap-detail-section">
                                            <span className="recap-detail-heading">Your best post</span>
                                            <p className="recap-detail-text">
                                                {bestPost.title || 'Untitled'} — {bestPost.reaction_count || 0} reactions
                                            </p>
                                        </div>
                                    )}

                                    <div className="recap-detail-section">
                                        <span className="recap-detail-heading">Community</span>
                                        <p className="recap-detail-text">
                                            {group.total_posts || 0} posts written this week
                                        </p>
                                    </div>

                                    {mostActive && mostActive.name && (
                                        <div className="recap-detail-section">
                                            <span className="recap-detail-heading">Most active writer</span>
                                            <div className="recap-detail-user">
                                                <img
                                                    src={mostActive.avatar || '/assets/profile.jpg'}
                                                    alt={mostActive.name}
                                                    className="recap-detail-avatar"
                                                />
                                                <span className="recap-detail-text">
                                                    {mostActive.name} — {mostActive.post_count} posts
                                                </span>
                                            </div>
                                        </div>
                                    )}

                                    {mostReacted && mostReacted.title && (
                                        <div className="recap-detail-section">
                                            <span className="recap-detail-heading">Most reacted post</span>
                                            <div className="recap-detail-user">
                                                <img
                                                    src={mostReacted.author_avatar || '/assets/profile.jpg'}
                                                    alt={mostReacted.author_name}
                                                    className="recap-detail-avatar"
                                                />
                                                <span className="recap-detail-text">
                                                    {mostReacted.title} by {mostReacted.author_name} — {mostReacted.reaction_count || 0} reactions
                                                </span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                </motion.div>
            )}
        </AnimatePresence>
    );
};

export default WeeklyRecapCard;
