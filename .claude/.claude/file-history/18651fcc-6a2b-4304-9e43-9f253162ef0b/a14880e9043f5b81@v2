export const REACTION_TYPES = [
    { type: 'fire', emoji: '\uD83D\uDD25', label: 'Amazing', color: '#f97316' },
    { type: 'heart', emoji: '\u2764\uFE0F', label: 'Love', color: '#ef4444' },
    { type: 'mind_blown', emoji: '\uD83E\uDD2F', label: 'Mind-blown', color: '#a855f7' },
    { type: 'clap', emoji: '\uD83D\uDC4F', label: 'Well said', color: '#22c55e' },
    { type: 'laugh', emoji: '\uD83D\uDE02', label: 'Haha', color: '#eab308' },
    { type: 'sad', emoji: '\uD83D\uDE22', label: 'Moving', color: '#3b82f6' },
];

export const REACTION_MAP = Object.fromEntries(
    REACTION_TYPES.map((r) => [r.type, r])
);

export const getReactionEmoji = (type) => REACTION_MAP[type]?.emoji || '';
export const getReactionColor = (type) => REACTION_MAP[type]?.color || '#5e5e5e';
