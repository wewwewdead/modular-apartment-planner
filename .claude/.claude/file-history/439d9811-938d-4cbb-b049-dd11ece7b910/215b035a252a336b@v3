import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { getWeeklyRecap, getTodaysPrompt, getPromptResponses } from '../../../API/Api';
import { useAuth } from '../../Context/useAuth';
import useStreakData from '../Streak/useStreakData';
import StreakBadge from '../Streak/StreakBadge';
import RecapSection from './RecapSection';
import PromptSection from './PromptSection';
import './DashboardBriefing.css';

const getWeekKey = () => {
    const now = new Date();
    const day = now.getUTCDay();
    const diff = day === 0 ? 6 : day - 1;
    const monday = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() - diff));
    return `recap-dismissed-${monday.toISOString().slice(0, 10)}`;
};

const formatDate = () => {
    return new Date().toLocaleDateString('en-US', {
        weekday: 'long',
        month: 'long',
        day: 'numeric',
    });
};

const DashboardBriefing = ({ onWriteResponse }) => {
    const { session, user } = useAuth();
    const weekKey = getWeekKey();

    const [recapDismissed, setRecapDismissed] = useState(() => {
        try { return localStorage.getItem(weekKey) === 'true'; }
        catch { return false; }
    });

    // ─── Data fetching ───

    const { data: recapData, isLoading: recapLoading } = useQuery({
        queryKey: ['weeklyRecap', session?.access_token],
        queryFn: () => getWeeklyRecap(session?.access_token),
        enabled: !!session?.access_token && !recapDismissed,
        staleTime: 1000 * 60 * 10,
        refetchOnWindowFocus: false,
    });

    const { data: prompt, isLoading: promptLoading } = useQuery({
        queryKey: ['todaysPrompt'],
        queryFn: getTodaysPrompt,
        staleTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
    });

    const { data: responsesData } = useQuery({
        queryKey: ['promptResponses', prompt?.id],
        queryFn: () => getPromptResponses(prompt.id),
        enabled: !!prompt?.id,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    const { data: streakData } = useStreakData(user?.id);

    // ─── Derived state ───

    const recap = recapData?.recap;
    const personal = recap?.personal || {};
    const group = recap?.group || {};

    const hasRecap = !recapDismissed && !recapLoading && recap &&
        (personal.posts_written > 0 || group.total_posts > 0);
    const hasPrompt = !promptLoading && !!prompt;

    // Nothing to show
    if (!hasRecap && !hasPrompt) return null;

    const handleDismissRecap = (e) => {
        e.stopPropagation();
        try { localStorage.setItem(weekKey, 'true'); }
        catch { /* no-op */ }
        setRecapDismissed(true);
    };

    const streakCount = streakData?.current_streak || 0;

    return (
        <AnimatePresence>
            <motion.div
                className="dashboard-briefing"
                initial={{ opacity: 0, y: -10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -15, transition: { duration: 0.25 } }}
                transition={{ duration: 0.35, ease: 'easeOut' }}
                key="dashboard-briefing"
            >
                <div className="dashboard-briefing-header">
                    <div className="dashboard-briefing-header-left">
                        <span className="dashboard-briefing-title">Today</span>
                        <span className="dashboard-briefing-date">{formatDate()}</span>
                        {streakCount > 0 && <StreakBadge count={streakCount} size={14} />}
                    </div>
                    {hasRecap && (
                        <button
                            className="dashboard-briefing-dismiss"
                            onClick={handleDismissRecap}
                            title="Dismiss recap"
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                                <path d="M18 6L6 18M6 6L18 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round"/>
                            </svg>
                        </button>
                    )}
                </div>

                <div className="dashboard-briefing-body">
                    {hasRecap && (
                        <RecapSection personal={personal} group={group} />
                    )}

                    {hasRecap && hasPrompt && (
                        <div className="dashboard-divider" />
                    )}

                    {hasPrompt && (
                        <PromptSection
                            prompt={prompt}
                            responsesData={responsesData}
                            onWriteResponse={onWriteResponse}
                        />
                    )}
                </div>
            </motion.div>
        </AnimatePresence>
    );
};

export default DashboardBriefing;
