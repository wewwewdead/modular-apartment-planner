import React from 'react';
import { useMediaQuery } from 'react-responsive';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from 'recharts';

const formatWeek = (dateStr) => {
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const CustomTooltip = ({ active, payload, label }) => {
    if (!active || !payload?.length) return null;
    return (
        <div className="analytics-chart-tooltip">
            <span className="analytics-tooltip-date">Week of {formatWeek(label)}</span>
            <span className="analytics-tooltip-value">{payload[0].value} posts</span>
        </div>
    );
};

const PublishingFrequency = ({ data }) => {
    const isMobile = useMediaQuery({ query: '(max-width: 480px)' });

    if (!data?.length) return null;

    return (
        <div className="analytics-chart-card">
            <h3 className="analytics-chart-title">Publishing frequency</h3>
            <div className="analytics-chart-container">
                <ResponsiveContainer width="100%" height={isMobile ? 180 : 220}>
                    <BarChart data={data} margin={{ top: 8, right: 8, left: isMobile ? -15 : -20, bottom: 0 }}>
                        <XAxis
                            dataKey="week_start"
                            tickFormatter={formatWeek}
                            tick={{ fontSize: 11, fill: 'var(--text-muted, #9ca3af)' }}
                            axisLine={false}
                            tickLine={false}
                            interval="preserveStartEnd"
                        />
                        <YAxis
                            tick={{ fontSize: 11, fill: 'var(--text-muted, #9ca3af)' }}
                            axisLine={false}
                            tickLine={false}
                            allowDecimals={false}
                        />
                        <Tooltip content={<CustomTooltip />} isAnimationActive={false} offset={10} />
                        <Bar
                            dataKey="count"
                            fill="var(--accent-sage, #6b9e7b)"
                            radius={[4, 4, 0, 0]}
                            maxBarSize={isMobile ? 24 : 32}
                        />
                    </BarChart>
                </ResponsiveContainer>
            </div>
        </div>
    );
};

export default PublishingFrequency;
