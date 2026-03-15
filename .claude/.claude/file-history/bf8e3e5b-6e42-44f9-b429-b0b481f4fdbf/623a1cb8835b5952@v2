import { useEffect, useRef, useState } from 'react';
import './ReadingProgress.css';

const ReadingProgress = ({ targetRef }) => {
    const [progress, setProgress] = useState(0);
    const rafRef = useRef(null);

    useEffect(() => {
        const handleScroll = () => {
            if (rafRef.current) return;
            rafRef.current = requestAnimationFrame(() => {
                rafRef.current = null;
                const el = targetRef?.current;
                if (!el) return;
                const rect = el.getBoundingClientRect();
                const total = el.scrollHeight - window.innerHeight;
                if (total <= 0) { setProgress(0); return; }
                const scrolled = Math.max(0, -rect.top);
                setProgress(Math.min(1, scrolled / total));
            });
        };

        window.addEventListener('scroll', handleScroll, { passive: true });
        handleScroll();
        return () => {
            window.removeEventListener('scroll', handleScroll);
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [targetRef]);

    if (progress <= 0) return null;

    return (
        <div className="reading-progress" role="progressbar" aria-valuenow={Math.round(progress * 100)} aria-valuemin={0} aria-valuemax={100}>
            <div className="reading-progress-fill" style={{ transform: `scaleX(${progress})` }} />
        </div>
    );
};

export default ReadingProgress;
