import { useState, useEffect } from 'react';

const TypewriterText = ({ text, delay = 40, className = '', onComplete }) => {
    const [displayed, setDisplayed] = useState('');
    const [done, setDone] = useState(false);

    useEffect(() => {
        setDisplayed('');
        setDone(false);
        let i = 0;
        const interval = setInterval(() => {
            i++;
            setDisplayed(text.slice(0, i));
            if (i >= text.length) {
                clearInterval(interval);
                setDone(true);
                onComplete?.();
            }
        }, delay);
        return () => clearInterval(interval);
    }, [text, delay, onComplete]);

    return (
        <span className={className}>
            {displayed}
            {!done && <span className="typewriter-cursor">|</span>}
        </span>
    );
};

export default TypewriterText;
