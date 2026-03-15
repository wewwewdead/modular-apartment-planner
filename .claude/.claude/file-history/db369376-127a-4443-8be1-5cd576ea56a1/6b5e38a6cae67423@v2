import { useState, useRef, useCallback } from 'react';
import { motion, AnimatePresence, LayoutGroup } from 'framer-motion';
import { useAuth } from '../../Context/useAuth';
import { submitProfileData, checkUsernameAvailability, completeOnboarding } from '../../../API/Api';
import { useQueryClient } from '@tanstack/react-query';

import StepProgressBar from './components/StepProgressBar';
import WelcomeStep from './steps/WelcomeStep';
import ProfileSetupStep from './steps/ProfileSetupStep';
import InterestsStep from './steps/InterestsStep';
import FeatureShowcaseStep from './steps/FeatureShowcaseStep';
import FirstActionStep from './steps/FirstActionStep';

import './OnboardingWizard.css';

const TOTAL_STEPS = 5;

const slideVariants = {
    enter: (direction) => ({
        x: direction > 0 ? 80 : -80,
        opacity: 0,
    }),
    center: {
        x: 0,
        opacity: 1,
    },
    exit: (direction) => ({
        x: direction > 0 ? -80 : 80,
        opacity: 0,
    }),
};

const slideTransition = {
    type: 'spring',
    stiffness: 350,
    damping: 32,
    mass: 0.8,
};

const OnboardingWizard = ({ onComplete, userExists }) => {
    const { session, user } = useAuth();
    const queryClient = useQueryClient();

    const [currentStep, setCurrentStep] = useState(userExists ? 2 : 0);
    const [direction, setDirection] = useState(1);

    // Profile state
    const [name, setName] = useState('');
    const [bio, setBio] = useState('');
    const [setupUsername, setSetupUsername] = useState('');
    const [usernameAvailable, setUsernameAvailable] = useState(null);
    const [usernameChecking, setUsernameChecking] = useState(false);
    const usernameCheckTimer = useRef(null);
    const [profilePreview, setProfilePreview] = useState(null);
    const [imageFile, setImageFile] = useState(null);
    const [submitting, setSubmitting] = useState(false);

    // Interests state
    const [writingInterests, setWritingInterests] = useState([]);
    const [writingGoal, setWritingGoal] = useState('');

    const checkUsernameDebounced = useCallback((uname) => {
        if (usernameCheckTimer.current) clearTimeout(usernameCheckTimer.current);
        if (!uname || uname.length < 3) {
            setUsernameAvailable(null);
            return;
        }
        setUsernameChecking(true);
        usernameCheckTimer.current = setTimeout(async () => {
            try {
                const result = await checkUsernameAvailability(uname);
                setUsernameAvailable(result.available);
            } catch {
                setUsernameAvailable(null);
            } finally {
                setUsernameChecking(false);
            }
        }, 400);
    }, []);

    const goNext = useCallback(() => {
        setDirection(1);
        setCurrentStep((s) => Math.min(s + 1, TOTAL_STEPS - 1));
    }, []);

    const goBack = useCallback(() => {
        setDirection(-1);
        setCurrentStep((s) => Math.max(s - 1, 0));
    }, []);

    const handleSubmitProfile = useCallback(async () => {
        try {
            setSubmitting(true);
            const formdata = new FormData();
            if (imageFile) formdata.append('image', imageFile);
            if (bio && name) {
                formdata.append('name', name);
                formdata.append('bio', bio);
                if (setupUsername && setupUsername.length >= 3 && usernameAvailable !== false) {
                    formdata.append('username', setupUsername);
                }
            }
            await submitProfileData(formdata, session?.access_token);
            queryClient.invalidateQueries({ queryKey: ['userData', session?.user?.id] });
            return true;
        } catch (error) {
            console.error('error uploading profile data:', error);
            return false;
        } finally {
            setSubmitting(false);
        }
    }, [imageFile, bio, name, setupUsername, usernameAvailable, session, queryClient]);

    const handleComplete = useCallback(async (action) => {
        try {
            await completeOnboarding(session?.access_token, {
                writingInterests,
                writingGoal,
            });
        } catch (err) {
            console.error('non-fatal: failed to save onboarding preferences:', err);
        }
        queryClient.invalidateQueries({ queryKey: ['userData', session?.user?.id] });
        onComplete(action);
    }, [session, writingInterests, writingGoal, queryClient, onComplete]);

    const renderStep = () => {
        switch (currentStep) {
            case 0:
                return <WelcomeStep key="welcome" goNext={goNext} />;
            case 1:
                return (
                    <ProfileSetupStep
                        key="profile"
                        goNext={goNext}
                        goBack={goBack}
                        name={name}
                        setName={setName}
                        bio={bio}
                        setBio={setBio}
                        setupUsername={setupUsername}
                        setSetupUsername={setSetupUsername}
                        usernameAvailable={usernameAvailable}
                        usernameChecking={usernameChecking}
                        profilePreview={profilePreview}
                        setProfilePreview={setProfilePreview}
                        imageFile={imageFile}
                        setImageFile={setImageFile}
                        checkUsernameDebounced={checkUsernameDebounced}
                        submitting={submitting}
                        onSubmitProfile={handleSubmitProfile}
                    />
                );
            case 2:
                return (
                    <InterestsStep
                        key="interests"
                        goNext={goNext}
                        goBack={userExists ? undefined : goBack}
                        writingInterests={writingInterests}
                        setWritingInterests={setWritingInterests}
                        writingGoal={writingGoal}
                        setWritingGoal={setWritingGoal}
                    />
                );
            case 3:
                return <FeatureShowcaseStep key="showcase" goNext={goNext} goBack={goBack} />;
            case 4:
                return (
                    <FirstActionStep
                        key="firstaction"
                        goBack={goBack}
                        writingGoal={writingGoal}
                        onComplete={handleComplete}
                    />
                );
            default:
                return null;
        }
    };

    return (
        <div className="onboarding-wizard-overlay">
            <div className="onboarding-wizard-card">
                <LayoutGroup>
                    <StepProgressBar currentStep={currentStep} totalSteps={TOTAL_STEPS} />
                </LayoutGroup>

                <div className="onboarding-wizard-content">
                    <AnimatePresence mode="wait" custom={direction}>
                        <motion.div
                            key={currentStep}
                            custom={direction}
                            variants={slideVariants}
                            initial="enter"
                            animate="center"
                            exit="exit"
                            transition={slideTransition}
                            className="onboarding-step-wrapper"
                        >
                            {renderStep()}
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>
        </div>
    );
};

export default OnboardingWizard;
