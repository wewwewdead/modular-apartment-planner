import React from 'react';

const RANGES = [
    { value: '7d', label: '7 days' },
    { value: '30d', label: '30 days' },
    { value: '90d', label: '90 days' },
    { value: 'all', label: 'All time' },
];

const TimeRangeSelector = ({ value, onChange }) => (
    <div className="analytics-range-selector">
        {RANGES.map((r) => (
            <button
                key={r.value}
                className={`analytics-range-pill${value === r.value ? ' active' : ''}`}
                onClick={() => onChange(r.value)}
            >
                {r.label}
            </button>
        ))}
    </div>
);

export default TimeRangeSelector;
