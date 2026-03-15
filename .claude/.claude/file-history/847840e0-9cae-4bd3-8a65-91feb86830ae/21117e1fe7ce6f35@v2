import { motion } from 'framer-motion';

const ReplyContextChip = ({ name, onDismiss }) => {
    return (
        <motion.div
            className="cm-reply-context-chip"
            initial={{ opacity: 0, y: -4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: 0.15 }}
        >
            <span className="cm-reply-context-text">
                Replying to <span className="cm-reply-context-name">@{name}</span>
            </span>
            <button
                className="cm-reply-context-dismiss"
                onClick={onDismiss}
                aria-label="Cancel reply"
            >
                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18" />
                    <line x1="6" y1="6" x2="18" y2="18" />
                </svg>
            </button>
        </motion.div>
    );
};

export default ReplyContextChip;
