import { useState, useCallback } from 'react';
import { requestConstellation } from '../../../../API/Api';

const useConstellationLinkMode = (userId, session) => {
    const [isLinkMode, setIsLinkMode] = useState(false);
    const [firstStar, setFirstStar] = useState(null);
    const [secondStar, setSecondStar] = useState(null);
    const [isSubmitting, setIsSubmitting] = useState(false);

    const toggleLinkMode = useCallback(() => {
        setIsLinkMode(prev => {
            if (prev) {
                setFirstStar(null);
                setSecondStar(null);
            }
            return !prev;
        });
    }, []);

    const cancelLinkMode = useCallback(() => {
        setIsLinkMode(false);
        setFirstStar(null);
        setSecondStar(null);
    }, []);

    const submitLink = useCallback(async (label = '') => {
        if (!firstStar || !secondStar || isSubmitting) return;
        setIsSubmitting(true);
        try {
            const token = session?.access_token;
            const result = await requestConstellation(token, firstStar.id, secondStar.id, label);
            setIsLinkMode(false);
            setFirstStar(null);
            setSecondStar(null);
            return { step: 'complete', result };
        } catch (err) {
            return { error: err.message || 'Failed to create constellation link' };
        } finally {
            setIsSubmitting(false);
        }
    }, [firstStar, secondStar, isSubmitting, session]);

    const handleStarClickInLinkMode = useCallback((post) => {
        if (!isLinkMode || isSubmitting) return false;

        const postOwnerId = post.users?.id ?? post.user_id;

        if (!firstStar) {
            // First click: must be user's own star
            if (postOwnerId !== userId) {
                return { error: 'Select one of your own stars first' };
            }
            setFirstStar(post);
            return { step: 'first', post };
        }

        // Second click: must be a different user's star
        if (postOwnerId === userId) {
            return { error: 'Second star must belong to another user' };
        }

        // Set second star and prompt for label instead of submitting immediately
        setSecondStar(post);
        return { step: 'enter_label' };
    }, [isLinkMode, isSubmitting, firstStar, userId]);

    const linkModeStatus = isLinkMode
        ? (secondStar ? 'enter_label' : (firstStar ? 'select_second' : 'select_first'))
        : 'inactive';

    return {
        isLinkMode,
        firstStar,
        secondStar,
        isSubmitting,
        linkModeStatus,
        toggleLinkMode,
        cancelLinkMode,
        handleStarClickInLinkMode,
        submitLink,
    };
};

export default useConstellationLinkMode;
