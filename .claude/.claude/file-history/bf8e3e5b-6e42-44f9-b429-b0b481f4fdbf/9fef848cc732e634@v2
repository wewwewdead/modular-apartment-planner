import React, { useState, useRef, useCallback, useEffect } from 'react';
import ReactionPicker from './ReactionPicker';
import ReactionBurst from './ReactionBurst';
import { getReactionEmoji } from '../../utils/reactionConfig';
import './reactions.css';

const ReactionButton = ({ userReaction, reactionCount, onReact, disabled }) => {
    const [showPicker, setShowPicker] = useState(false);
    const [burstState, setBurstState] = useState(null);
    const [justReacted, setJustReacted] = useState(false);
    const hoverTimerRef = useRef(null);
    const leaveTimerRef = useRef(null);
    const longPressTimerRef = useRef(null);
    const longPressOpenedRef = useRef(false);
    const isTouchRef = useRef(false);
    const containerRef = useRef(null);

    const handleMouseEnter = useCallback(() => {
        if (isTouchRef.current) return;
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
        hoverTimerRef.current = setTimeout(() => {
            setShowPicker(true);
        }, 300);
    }, []);

    const handleMouseLeave = useCallback(() => {
        if (isTouchRef.current) return;
        if (hoverTimerRef.current) {
            clearTimeout(hoverTimerRef.current);
            hoverTimerRef.current = null;
        }
        leaveTimerRef.current = setTimeout(() => {
            setShowPicker(false);
        }, 150);
    }, []);

    const handleTouchStart = useCallback(() => {
        isTouchRef.current = true;
        longPressTimerRef.current = setTimeout(() => {
            longPressOpenedRef.current = true;
            setShowPicker(true);
        }, 500);
    }, []);

    const handleTouchEnd = useCallback(() => {
        if (longPressTimerRef.current) {
            clearTimeout(longPressTimerRef.current);
            longPressTimerRef.current = null;
        }
    }, []);

    // Tap-outside-to-close for mobile
    useEffect(() => {
        if (!showPicker || !isTouchRef.current) return;

        const handleOutsideTouch = (e) => {
            if (containerRef.current && !containerRef.current.contains(e.target)) {
                setShowPicker(false);
                isTouchRef.current = false;
            }
        };

        document.addEventListener('touchstart', handleOutsideTouch);
        return () => document.removeEventListener('touchstart', handleOutsideTouch);
    }, [showPicker]);

    useEffect(() => {
        return () => {
            if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
            if (leaveTimerRef.current) clearTimeout(leaveTimerRef.current);
            if (longPressTimerRef.current) clearTimeout(longPressTimerRef.current);
        };
    }, []);

    const handleQuickClick = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        if (disabled) return;

        if (longPressOpenedRef.current) {
            longPressOpenedRef.current = false;
            return;
        }

        if (showPicker) {
            setShowPicker(false);
            isTouchRef.current = false;
            return;
        }

        // Quick tap: toggle heart (or remove current reaction)
        if (userReaction) {
            onReact(userReaction); // toggle off
        } else {
            if (!burstState && containerRef.current) {
                const rect = containerRef.current.getBoundingClientRect();
                setBurstState({ emoji: getReactionEmoji('heart'), rect });
            }
            setJustReacted(true);
            setTimeout(() => setJustReacted(false), 350);
            onReact('heart'); // default to heart
        }
    }, [userReaction, onReact, disabled, showPicker, burstState]);

    const handlePickerSelect = useCallback((reactionType) => {
        setShowPicker(false);
        isTouchRef.current = false;
        if (!burstState && containerRef.current) {
            const rect = containerRef.current.getBoundingClientRect();
            setBurstState({ emoji: getReactionEmoji(reactionType), rect });
        }
        setJustReacted(true);
        setTimeout(() => setJustReacted(false), 350);
        onReact(reactionType);
    }, [onReact, burstState]);

    const hasReaction = !!userReaction;
    const displayEmoji = hasReaction ? getReactionEmoji(userReaction) : null;

    return (
        <div
            className="reaction-button-container"
            ref={containerRef}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
            onTouchStart={handleTouchStart}
            onTouchEnd={handleTouchEnd}
        >
            <div
                className={`reaction-button ${hasReaction ? 'has-reaction' : ''} ${justReacted ? 'just-reacted' : ''}`}
                role="button"
                aria-label="React"
                aria-pressed={hasReaction}
                onClick={handleQuickClick}
            >
                {hasReaction ? (
                    <span className="reaction-button-emoji">{displayEmoji}</span>
                ) : (
                    <svg className="svg-like" xmlns="http://www.w3.org/2000/svg" width="20px" height="20px" viewBox="0 0 24 24" fill="var(--icon-default)">
                        <g id="style=fill">
                        <g id="like">
                        <path id="Subtract" fillRule="evenodd" clipRule="evenodd" d="M15.9977 5.63891C16.2695 4.34931 15.433 3.00969 14.2102 2.59462C13.6171 2.37633 12.9892 2.4252 12.4662 2.60499C11.9449 2.78419 11.4461 3.12142 11.1369 3.58441L11.136 3.58573L7.49506 9.00272C8.05104 9.29585 8.43005 9.87954 8.43005 10.5518V21.3018H6.91003V21.3018H16.6801C18.2938 21.3018 19.2028 20.2977 19.8943 19.202C20.6524 18.0009 21.1453 16.7211 21.5116 15.5812C21.6808 15.0546 21.8252 14.5503 21.9547 14.0984L21.9863 13.9881C22.126 13.5007 22.2457 13.0904 22.366 12.7549C22.698 11.8292 22.5933 10.9072 22.067 10.2072C21.5476 9.5166 20.7005 9.15175 19.76 9.15175H15.76C15.6702 9.15175 15.6017 9.11544 15.5599 9.06803C15.5238 9.02716 15.4831 8.95058 15.502 8.81171L15.9977 5.63891Z"/>
                        <path id="rec" d="M2.18005 10.6199C2.18005 10.03 2.62777 9.55176 3.18005 9.55176H6.68005C7.23234 9.55176 7.68005 10.03 7.68005 10.6199V21.3018H3.18005C2.62777 21.3018 2.18005 20.8235 2.18005 20.2336V10.6199Z"/>
                        </g>
                        </g>
                    </svg>
                )}
            </div>
            {typeof reactionCount === 'number' && reactionCount > 0 && (
                <span className="reaction-count">{reactionCount}</span>
            )}
            <ReactionPicker
                isOpen={showPicker}
                onSelect={handlePickerSelect}
                currentReaction={userReaction}
            />
            {burstState && (
                <ReactionBurst
                    emoji={burstState.emoji}
                    originRect={burstState.rect}
                    onComplete={() => setBurstState(null)}
                />
            )}
        </div>
    );
};

export default ReactionButton;
