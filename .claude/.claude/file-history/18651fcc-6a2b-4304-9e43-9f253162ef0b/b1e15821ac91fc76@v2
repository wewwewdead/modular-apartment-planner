import React from 'react';

const PromptBadge = ({ promptId }) => {
    if (!promptId) return null;

    return (
        <span
            className="prompt-badge"
            title="Written from a daily prompt"
            style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '3px',
                fontSize: '11px',
                padding: '2px 6px',
                borderRadius: '8px',
                background: 'rgba(245, 158, 11, 0.12)',
                color: '#f59e0b',
                fontWeight: 500,
                marginLeft: '6px',
                verticalAlign: 'middle',
            }}
        >
            <svg xmlns="http://www.w3.org/2000/svg" width="11" height="11" viewBox="0 -960 960 960" fill="currentColor">
                <path d="M480-80q-26 0-47-12.5T400-126q-33 0-56.5-23.5T320-206v-142q-59-39-94.5-103T190-590q0-121 84.5-205.5T480-880q121 0 205.5 84.5T770-590q0 77-35.5 140T640-348v142q0 33-23.5 56.5T560-126q-12 21-33 33.5T480-80Z"/>
            </svg>
            Prompt
        </span>
    );
};

export default PromptBadge;
