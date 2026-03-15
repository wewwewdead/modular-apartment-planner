import React from 'react';
import { motion } from 'framer-motion';
import { getReactionEmoji, REACTION_MAP, REACTION_TYPES } from '../../utils/reactionConfig';

const ReactionBreakdown = ({ data }) => {
    if (!data?.length) return null;

    const countMap = Object.fromEntries(data.map((d) => [d.type, d.count]));
    const fullData = REACTION_TYPES.map((r) => ({
        type: r.type,
        count: countMap[r.type] || 0,
    }));
    const maxCount = Math.max(...fullData.map((d) => d.count), 1);

    return (
        <div className="analytics-chart-card">
            <h3 className="analytics-chart-title">Reaction breakdown</h3>
            <div className="analytics-breakdown-list">
                {fullData.map((item, i) => (
                    <motion.div
                        key={item.type}
                        className="analytics-breakdown-row"
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ duration: 0.25, delay: i * 0.05 }}
                    >
                        <span className="analytics-breakdown-emoji">{getReactionEmoji(item.type)}</span>
                        <span className="analytics-breakdown-label">{REACTION_MAP[item.type]?.label}</span>
                        <div className="analytics-breakdown-bar-track">
                            <motion.div
                                className="analytics-breakdown-bar-fill"
                                initial={{ width: 0 }}
                                animate={{ width: `${(item.count / maxCount) * 100}%` }}
                                transition={{ duration: 0.5, delay: 0.15 + i * 0.05 }}
                            />
                        </div>
                        <span className="analytics-breakdown-count">{item.count}</span>
                    </motion.div>
                ))}
            </div>
        </div>
    );
};

export default ReactionBreakdown;
