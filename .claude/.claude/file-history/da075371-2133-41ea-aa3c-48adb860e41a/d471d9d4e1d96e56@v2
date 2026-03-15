import { useEffect, useRef } from 'react';

const FOCUSABLE = 'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])';

const useFocusTrap = (containerRef, isActive = true) => {
    const previousFocusRef = useRef(null);

    useEffect(() => {
        if (!isActive || !containerRef?.current) return;

        previousFocusRef.current = document.activeElement;
        const container = containerRef.current;

        // Focus first focusable element
        const focusable = container.querySelectorAll(FOCUSABLE);
        if (focusable.length) focusable[0].focus({ preventScroll: true });

        const handleKeyDown = (e) => {
            if (e.key !== 'Tab') return;
            const nodes = container.querySelectorAll(FOCUSABLE);
            if (!nodes.length) return;

            const first = nodes[0];
            const last = nodes[nodes.length - 1];

            if (e.shiftKey && document.activeElement === first) {
                e.preventDefault();
                last.focus();
            } else if (!e.shiftKey && document.activeElement === last) {
                e.preventDefault();
                first.focus();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => {
            document.removeEventListener('keydown', handleKeyDown);
            if (previousFocusRef.current && typeof previousFocusRef.current.focus === 'function') {
                previousFocusRef.current.focus({ preventScroll: true });
            }
        };
    }, [containerRef, isActive]);
};

export default useFocusTrap;
