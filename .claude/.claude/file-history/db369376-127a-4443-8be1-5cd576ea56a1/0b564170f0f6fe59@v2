import { motion } from 'framer-motion';

const StepProgressBar = ({ currentStep, totalSteps = 5 }) => {
    return (
        <div className="onboarding-progress-bar">
            {Array.from({ length: totalSteps }, (_, i) => (
                <div key={i} className="onboarding-progress-dot-wrapper">
                    <div className={`onboarding-progress-dot ${i <= currentStep ? 'active' : ''}`}>
                        {i === currentStep && (
                            <motion.div
                                className="onboarding-progress-indicator"
                                layoutId="step-indicator"
                                transition={{ type: 'spring', stiffness: 350, damping: 30 }}
                            />
                        )}
                    </div>
                    {i < totalSteps - 1 && (
                        <div className={`onboarding-progress-line ${i < currentStep ? 'filled' : ''}`} />
                    )}
                </div>
            ))}
        </div>
    );
};

export default StepProgressBar;
