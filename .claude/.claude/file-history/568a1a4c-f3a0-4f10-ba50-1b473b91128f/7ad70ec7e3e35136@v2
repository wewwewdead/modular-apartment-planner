import React, { useState } from 'react';
import { motion } from 'framer-motion';
import { useMediaQuery } from 'react-responsive';
import useAnalyticsData from './useAnalyticsData';
import TimeRangeSelector from './TimeRangeSelector';
import AnalyticsSummary from './AnalyticsSummary';
import ViewsChart from './ViewsChart';
import ReactionsChart from './ReactionsChart';
import ReactionBreakdown from './ReactionBreakdown';
import TopPosts from './TopPosts';
import PublishingFrequency from './PublishingFrequency';
import './AnalyticsDashboard.css';

const AnalyticsDashboard = () => {
    const [range, setRange] = useState('30d');
    const isMobile = useMediaQuery({ query: '(max-width: 480px)' });
    const { data, isLoading, isError } = useAnalyticsData(range);

    const analytics = data?.analytics;

    if (isLoading) {
        return (
            <div className="analytics-dashboard">
                <div className="analytics-header">
                    <h1 className="analytics-title">Analytics</h1>
                </div>
                <div className="analytics-loading">
                    <div className="analytics-loading-spinner" />
                    <p className="analytics-loading-text">Crunching your numbers...</p>
                </div>
            </div>
        );
    }

    if (isError) {
        return (
            <div className="analytics-dashboard">
                <div className="analytics-header">
                    <h1 className="analytics-title">Analytics</h1>
                </div>
                <div className="analytics-empty">
                    <p className="analytics-empty-text">Something went wrong loading your analytics. Try again later.</p>
                </div>
            </div>
        );
    }

    const isEmpty = !analytics?.summary?.total_posts;

    return (
        <motion.div
            className="analytics-dashboard"
            initial={{ opacity: 0, y: isMobile ? 6 : 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: isMobile ? 0.25 : 0.35, ease: 'easeOut' }}
        >
            <div className="analytics-header">
                <div className="analytics-header-left">
                    <h1 className="analytics-title">Analytics</h1>
                    {analytics?.streak?.current_streak > 0 && (
                        <span className="analytics-streak-badge">
                            {analytics.streak.current_streak} day streak
                        </span>
                    )}
                </div>
                <TimeRangeSelector value={range} onChange={setRange} />
            </div>

            {isEmpty ? (
                <div className="analytics-empty">
                    <p className="analytics-empty-heading">No data yet</p>
                    <p className="analytics-empty-text">
                        Start publishing to see your writing analytics here.
                    </p>
                </div>
            ) : (
                <>
                    <AnalyticsSummary summary={analytics.summary} />

                    <div className="analytics-charts-grid">
                        <ViewsChart data={analytics.views_series} />
                        <ReactionsChart data={analytics.reactions_series} />
                    </div>

                    <div className="analytics-charts-grid">
                        <ReactionBreakdown data={analytics.reaction_breakdown} />
                        <PublishingFrequency data={analytics.publishing_frequency} />
                    </div>

                    <TopPosts data={analytics.top_posts} />
                </>
            )}
        </motion.div>
    );
};

export default AnalyticsDashboard;
