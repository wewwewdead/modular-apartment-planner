import { useState, useEffect, useCallback, useRef } from 'react';

const HOVER_LEAVE_DELAY_MS = 450;

const CommentBadge = ({ count, hasComments }) => {
    return (
        <>
            {hasComments ? (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor" stroke="none">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            ) : (
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                </svg>
            )}
            {hasComments && <span className="pcl-badge-count">{count}</span>}
        </>
    );
};

const ParagraphCommentLayer = ({ containerRef, commentCounts, onParagraphClick }) => {
    const [paragraphs, setParagraphs] = useState([]);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [clickSeq, setClickSeq] = useState(0);
    const listenersRef = useRef([]);
    const leaveTimerRef = useRef(null);
    const layerRef = useRef(null);
    const clickedRef = useRef(false);
    const prevActiveElRef = useRef(null);

    const clearLeaveTimer = useCallback(() => {
        if (leaveTimerRef.current) {
            clearTimeout(leaveTimerRef.current);
            leaveTimerRef.current = null;
        }
    }, []);

    const scheduleLeave = useCallback((idx) => {
        clearLeaveTimer();
        leaveTimerRef.current = setTimeout(() => {
            setHoveredIndex((prev) => prev === idx ? null : prev);
        }, HOVER_LEAVE_DELAY_MS);
    }, [clearLeaveTimer]);

    const getParagraphIndex = useCallback((target) => {
        const el = target?.closest?.('.editor-paragraph[data-paragraph-index]');
        if (!el) return null;
        return Number(el.getAttribute('data-paragraph-index'));
    }, []);

    const scanParagraphs = useCallback(() => {
        const container = containerRef.current;
        if (!container) return;

        // Remove old hover listeners
        listenersRef.current.forEach(({ el, enter, leave }) => {
            el.removeEventListener('mouseenter', enter);
            el.removeEventListener('mouseleave', leave);
        });
        listenersRef.current = [];

        const elements = container.querySelectorAll('.editor-paragraph');
        const containerRect = container.getBoundingClientRect();
        const result = [];
        let realIndex = 0;

        elements.forEach((el) => {
            const text = el.textContent.trim();
            if (!text) return;

            const idx = realIndex;
            el.setAttribute('data-paragraph-index', idx);
            const fingerprint = text.substring(0, 100);

            const elRect = el.getBoundingClientRect();
            result.push({
                index: idx,
                top: elRect.top - containerRect.top + container.scrollTop,
                height: elRect.height,
                text,
                fingerprint,
            });

            // Desktop hover listeners (per-paragraph)
            const enter = () => {
                clearLeaveTimer();
                setHoveredIndex(idx);
            };
            const leave = (event) => {
                if (clickedRef.current) return;

                const nextTarget = event.relatedTarget;
                const layer = layerRef.current;

                if (nextTarget && layer && layer.contains(nextTarget)) {
                    return;
                }

                scheduleLeave(idx);
            };
            el.addEventListener('mouseenter', enter);
            el.addEventListener('mouseleave', leave);
            listenersRef.current.push({ el, enter, leave });

            realIndex++;
        });

        setParagraphs(result);
    }, [containerRef, clearLeaveTimer, scheduleLeave]);

    // Delegated click handler on the container (handles both mouse and touch)
    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const handleClick = (e) => {
            const idx = getParagraphIndex(e.target);
            if (idx == null) return;

            clearLeaveTimer();
            clickedRef.current = true;
            setHoveredIndex(idx);
            setClickSeq(c => c + 1);
        };

        container.addEventListener('click', handleClick);

        return () => {
            container.removeEventListener('click', handleClick);
        };
    }, [containerRef, getParagraphIndex, clearLeaveTimer]);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;

        const timer = setTimeout(scanParagraphs, 300);

        const observer = new MutationObserver((mutations) => {
            const layer = layerRef.current;
            const isOwnMutation = layer && mutations.every(
                (m) => layer.contains(m.target)
            );
            if (isOwnMutation) return;
            scanParagraphs();
        });

        observer.observe(container, { childList: true, subtree: true, characterData: true });
        window.addEventListener('resize', scanParagraphs);

        return () => {
            clearTimeout(timer);
            clearLeaveTimer();
            observer.disconnect();
            window.removeEventListener('resize', scanParagraphs);
            listenersRef.current.forEach(({ el, enter, leave }) => {
                el.removeEventListener('mouseenter', enter);
                el.removeEventListener('mouseleave', leave);
            });
            listenersRef.current = [];
        };
    }, [containerRef, scanParagraphs, clearLeaveTimer]);

    // Sync .pcl-active CSS class with hoveredIndex
    useEffect(() => {
        if (prevActiveElRef.current) {
            prevActiveElRef.current.classList.remove('pcl-active');
            prevActiveElRef.current = null;
        }

        if (hoveredIndex == null) {
            clickedRef.current = false;
            return;
        }

        const container = containerRef.current;
        if (!container) return;

        const el = container.querySelector(
            `.editor-paragraph[data-paragraph-index="${hoveredIndex}"]`
        );
        if (el) {
            el.classList.add('pcl-active');
            prevActiveElRef.current = el;
        }
    }, [hoveredIndex, containerRef]);

    // Dismiss active paragraph when tapping outside content + badge layer
    useEffect(() => {
        if (!clickedRef.current) return;

        const handleOutsideClick = (e) => {
            const container = containerRef.current;
            const layer = layerRef.current;
            if (
                (container && container.contains(e.target)) ||
                (layer && layer.contains(e.target))
            ) return;

            clickedRef.current = false;
            setHoveredIndex(null);
        };

        document.addEventListener('click', handleOutsideClick);
        return () => document.removeEventListener('click', handleOutsideClick);
    }, [hoveredIndex, clickSeq, containerRef]);

    const handleBadgeEnter = useCallback((idx) => {
        clearLeaveTimer();
        setHoveredIndex(idx);
    }, [clearLeaveTimer]);

    const handleBadgeLeave = useCallback((idx, event) => {
        if (clickedRef.current) return;
        const nextTarget = event.relatedTarget;
        const nextParagraph = nextTarget?.closest?.('.editor-paragraph[data-paragraph-index]');

        // Prevent hide jitter when moving directly from badge back to the paragraph.
        if (nextParagraph && Number(nextParagraph.getAttribute('data-paragraph-index')) === idx) {
            return;
        }

        scheduleLeave(idx);
    }, [scheduleLeave]);

    const counts = commentCounts || {};

    return (
        <div className="pcl-layer" ref={layerRef}>
            {paragraphs.map((p) => {
                const count = counts[p.index] || 0;
                const hasComments = count > 0;
                const isVisible = hoveredIndex === p.index || hasComments;

                return (
                    <div
                        key={p.index}
                        className={`pcl-badge-anchor ${isVisible ? 'pcl-badge-visible' : ''}`}
                        style={{ top: p.top, height: p.height }}
                        onMouseEnter={() => handleBadgeEnter(p.index)}
                        onMouseLeave={(event) => handleBadgeLeave(p.index, event)}
                    >
                        <button
                            className={`pcl-badge ${hasComments ? 'pcl-badge-active' : ''}`}
                            onClick={(e) => {
                                e.stopPropagation();
                                onParagraphClick({
                                    paragraphIndex: p.index,
                                    fingerprint: p.fingerprint,
                                    text: p.text,
                                });
                            }}
                        >
                            <CommentBadge count={count} hasComments={hasComments} />
                        </button>
                    </div>
                );
            })}
        </div>
    );
};

export default ParagraphCommentLayer;
