import './welcomemessage.css';
import { AnimatePresence, motion } from 'framer-motion';
import confetti from "canvas-confetti";
import { useEffect } from 'react';

const WelcomeMessage = ({onClose}) => {

    useEffect(() =>{
        const canvas = document.getElementById('my-confetti');
        const myConfetti = confetti.create(canvas, {resize: true})

        const timer = setTimeout(() => {
            myConfetti({
                particleCount: 80,
                spread: 100,
                startVelocity: 25,
                ticks: 500,
                gravity: 0.6,
                scalar: 1.2,
                origin: {x: 0.5, y: 0.4},
                colors: ['#D4A853', '#C4943E', '#E0BA6A', '#FAF9F6', '#8A9E7A']
            })
        }, 500);

        return () => {
            clearTimeout(timer)
        }
    }, [])

    return(
        <>
        <canvas id='my-confetti' className='confetti-layer'></canvas>
        <AnimatePresence>
        <div className='welcome-message-container'>
            <motion.div
            initial={{opacity: 0, scale: 0.95, y: 12}}
            animate={{
                opacity: 1,
                scale: 1,
                y: 0,
                transition: {
                    type: "spring",
                    stiffness: 180,
                    damping: 22,
                    duration: 0.4
                }
            }}
            exit={{opacity: 0, scale: 0.95, y: 12, transition: {type: "tween", duration: 0.2}}}
            className='welcome-message-child-container'
            >
                <button onClick={onClose} className='welcome-close-btn' aria-label="Close">
                    <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <line x1="18" y1="6" x2="6" y2="18"></line>
                        <line x1="6" y1="6" x2="18" y2="18"></line>
                    </svg>
                </button>

                <div className='welcome-icon'>
                    <svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
                    </svg>
                </div>

                <h2 className='welcome-heading'>You're all set</h2>

                <div className='welcome-message'>
                    Your thoughts now have a home on <span className='iskrib-word'>Iskrib</span>. The blank page awaits.
                </div>

                <button onClick={onClose} className='welcome-cta'>
                    Begin writing
                </button>
            </motion.div>
        </div>
        </AnimatePresence>
        </>
    )
}
export default WelcomeMessage;
