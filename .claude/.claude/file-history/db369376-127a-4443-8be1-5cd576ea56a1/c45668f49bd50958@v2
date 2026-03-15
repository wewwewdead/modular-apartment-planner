import { motion } from 'framer-motion';

const TOPICS = [
    'Poetry', 'Fiction', 'Journals', 'Essays',
    'Philosophy', 'Self-Reflection', 'Creative Nonfiction', 'Short Stories',
    'Science', 'Nature', 'Music', 'Art',
    'Travel', 'Technology', 'Mental Health', 'Spirituality',
];

const GOALS = [
    { id: 'journal', label: 'Keep a journal', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM9 4h2v5l-1-.75L9 9V4zm9 16H6V4h1v9l3-2.25L13 13V4h5v16z"/></svg>
    )},
    { id: 'publish', label: 'Publish & share', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm-1 17.93c-3.95-.49-7-3.85-7-7.93 0-.62.08-1.21.21-1.79L9 15v1c0 1.1.9 2 2 2v1.93zm6.9-2.54c-.26-.81-1-1.39-1.9-1.39h-1v-3c0-.55-.45-1-1-1H8v-2h2c.55 0 1-.45 1-1V7h2c1.1 0 2-.9 2-2v-.41c2.93 1.19 5 4.06 5 7.41 0 2.08-.8 3.97-2.1 5.39z"/></svg>
    )},
    { id: 'stories', label: 'Write long stories', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/></svg>
    )},
    { id: 'explore', label: 'Just explore', icon: (
        <svg xmlns="http://www.w3.org/2000/svg" width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M12 10.9c-.61 0-1.1.49-1.1 1.1s.49 1.1 1.1 1.1c.61 0 1.1-.49 1.1-1.1s-.49-1.1-1.1-1.1zM12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm2.19 12.19L6 18l3.81-8.19L18 6l-3.81 8.19z"/></svg>
    )},
];

const InterestsStep = ({
    goNext,
    goBack,
    writingInterests,
    setWritingInterests,
    writingGoal,
    setWritingGoal,
}) => {
    const toggleTopic = (topic) => {
        setWritingInterests((prev) =>
            prev.includes(topic)
                ? prev.filter((t) => t !== topic)
                : [...prev, topic]
        );
    };

    return (
        <div className="onboarding-step interests-step">
            {goBack && (
                <button className="onboarding-back-btn" onClick={goBack} type="button">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="15 18 9 12 15 6" />
                    </svg>
                </button>
            )}

            <h2 className="onboarding-step-title">What draws you to write?</h2>
            <p className="onboarding-step-subtitle">Pick as many as you like. This helps us personalize your experience.</p>

            <div className="interests-topic-grid">
                {TOPICS.map((topic) => (
                    <motion.button
                        key={topic}
                        type="button"
                        className={`interests-chip ${writingInterests.includes(topic) ? 'selected' : ''}`}
                        onClick={() => toggleTopic(topic)}
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                    >
                        {topic}
                    </motion.button>
                ))}
            </div>

            <h3 className="interests-goal-heading">What's your main goal?</h3>

            <div className="interests-goal-grid">
                {GOALS.map((goal) => (
                    <motion.button
                        key={goal.id}
                        type="button"
                        className={`interests-goal-card ${writingGoal === goal.id ? 'selected' : ''}`}
                        onClick={() => setWritingGoal(goal.id)}
                        whileHover={{ scale: 1.03 }}
                        whileTap={{ scale: 0.97 }}
                    >
                        <span className="interests-goal-icon">{goal.icon}</span>
                        <span className="interests-goal-label">{goal.label}</span>
                    </motion.button>
                ))}
            </div>

            <div className="onboarding-cta-row">
                <motion.button
                    className="onboarding-cta-primary"
                    onClick={goNext}
                    whileHover={{ scale: 1.02 }}
                    whileTap={{ scale: 0.98 }}
                >
                    Continue
                </motion.button>
                <button className="onboarding-skip-btn" onClick={goNext} type="button">
                    Skip for now
                </button>
            </div>
        </div>
    );
};

export default InterestsStep;
