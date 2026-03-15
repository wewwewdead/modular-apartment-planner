import { motion } from 'framer-motion';

const FEATURES = [
    {
        title: 'Rich Editor',
        description: 'A beautiful space to write, with formatting that feels natural.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z" />
            </svg>
        ),
    },
    {
        title: 'Writing Streaks',
        description: 'Build momentum by writing every day. Watch your streak grow.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M13.5.67s.74 2.65.74 4.8c0 2.06-1.35 3.73-3.41 3.73-2.07 0-3.63-1.67-3.63-3.73l.03-.36C5.21 7.51 4 10.62 4 14c0 4.42 3.58 8 8 8s8-3.58 8-8C20 8.61 17.41 3.8 13.5.67zM11.71 19c-1.78 0-3.22-1.4-3.22-3.14 0-1.62 1.05-2.76 2.81-3.12 1.77-.36 3.6-1.21 4.62-2.58.39 1.29.59 2.65.59 4.04 0 2.65-2.15 4.8-4.8 4.8z" />
            </svg>
        ),
    },
    {
        title: 'Stories',
        description: 'Serialize your long-form work into chapters readers can follow.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z" />
            </svg>
        ),
    },
    {
        title: 'Community',
        description: 'Discover writers you admire and connect through words.',
        icon: (
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="currentColor">
                <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z" />
            </svg>
        ),
    },
];

const container = {
    hidden: {},
    show: {
        transition: {
            staggerChildren: 0.15,
        },
    },
};

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 24 } },
};

const FeatureShowcaseStep = ({ goNext, goBack }) => {
    return (
        <div className="onboarding-step showcase-step">
            <button className="onboarding-back-btn" onClick={goBack} type="button">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>

            <h2 className="onboarding-step-title">Your writing toolkit</h2>
            <p className="onboarding-step-subtitle">Everything you need to create, share, and grow.</p>

            <motion.div
                className="showcase-features-grid"
                variants={container}
                initial="hidden"
                animate="show"
            >
                {FEATURES.map((feature) => (
                    <motion.div key={feature.title} className="showcase-feature-card" variants={item}>
                        <div className="showcase-feature-icon">{feature.icon}</div>
                        <div className="showcase-feature-text">
                            <h4 className="showcase-feature-title">{feature.title}</h4>
                            <p className="showcase-feature-desc">{feature.description}</p>
                        </div>
                    </motion.div>
                ))}
            </motion.div>

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

export default FeatureShowcaseStep;
