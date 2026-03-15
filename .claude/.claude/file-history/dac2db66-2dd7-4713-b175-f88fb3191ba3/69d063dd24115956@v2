import { useEffect, useRef, useState } from 'react';
import './mobilenavlink.css';
import { motion } from 'framer-motion';
import { useAuth } from '../../Context/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';

const MobileNavlink = () => {
    const [showNavlinks, setShowNavlinks] = useState(true);
    const timeOutRef = useRef();
    const navigate = useNavigate();
    const location = useLocation();

    const { session, openAuthModal } = useAuth();

    const handleNavigatePath = (path) => {
        if (location.pathname === path) {
            return window.location.reload();
        }
        return navigate(path);
    };

    const activeColor = '#D4A853';
    const inactiveColor = '#787878';

    const navLinks = [
        {
            type: 'icon',
            label: 'Home',
            path: '/home',
            action: (path) => handleNavigatePath(path),
            icon: (isActive) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill={isActive ? activeColor : inactiveColor}>
                    <g clipPath="url(#clip0_1_110)">
                        <path fillRule="evenodd" clipRule="evenodd" d="M14.3594 2.12613C13.0087 0.944612 10.9923 0.94461 9.64162 2.12612L3.2802 7.69086C2.29508 8.55261 1.72998 9.79772 1.72998 11.1066L1.72998 19.1672C1.72998 21.1459 3.33403 22.75 5.31273 22.75L18.6883 22.75C20.667 22.75 22.271 21.1459 22.271 19.1672L22.271 11.1066C22.271 9.79772 21.706 8.55261 20.7208 7.69086L14.3594 2.12613ZM10 16.1136C9.58579 16.1136 9.25 16.4494 9.25 16.8636C9.25 17.2779 9.58579 17.6136 10 17.6136L14 17.6136C14.4142 17.6136 14.75 17.2779 14.75 16.8636C14.75 16.4494 14.4142 16.1136 14 16.1136L10 16.1136Z" fill={isActive ? activeColor : inactiveColor}/>
                    </g>
                </svg>
            ),
        },
        {
            type: 'icon',
            label: 'Explore',
            path: '/home/explore',
            action: (path) => handleNavigatePath(path),
            icon: (isActive) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill={isActive ? activeColor : inactiveColor}>
                    <path
                        fillRule="evenodd"
                        d="M12,2 C17.5228475,2 22,6.4771525 22,12 C22,17.5228475 17.5228475,22 12,22 C6.4771525,22 2,17.5228475 2,12 C2,6.4771525 6.4771525,2 12,2 Z M17.9842695,7.39078625 C18.1985588,6.64477525 17.4973604,5.9435768 16.7513494,6.1578661 L16.6494246,6.19284365 L9.57835679,9.02127078 L9.47282273,9.07079854 C9.30957453,9.15937167 9.17428758,9.29167162 9.08209683,9.45256344 L9.02127078,9.57835679 L6.19284365,16.6494246 L6.1578661,16.7513494 C5.9435768,17.4973604 6.64477525,18.1985588 7.39078625,17.9842695 L7.49271102,17.949292 L14.5637788,15.1208648 L14.6693129,15.0713371 C14.8325611,14.982764 14.967848,14.850464 15.0600388,14.6895722 L15.1208648,14.5637788 L17.949292,7.49271102 L17.9842695,7.39078625 Z M12,10 C13.1045695,10 14,10.8954305 14,12 C14,13.1045695 13.1045695,14 12,14 C10.8954305,14 10,13.1045695 10,12 C10,10.8954305 10.8954305,10 12,10 Z"
                    />
                </svg>
            ),
        },
        {
            type: 'icon',
            label: 'Gallery',
            path: '/home/gallery',
            action: (path) => handleNavigatePath(path),
            icon: (isActive) => (
                <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill={isActive ? activeColor : inactiveColor}>
                    <path d="M480-80q-83 0-156-31.5T197-197q-54-54-85.5-127T80-480q0-83 31.5-156T197-763q54-54 127-85.5T480-880q63 0 121.5 18.5T709-807q-17 19-26 44t-9 52q0 53 37.5 90.5T802-583q27 0 52-9t44-26q36 49 54 107.5T970-480q0 83-31.5 156T853-197q-54 54-127 85.5T570-80H480Zm-12-196q30 0 51-21t21-51q0-30-21-51t-51-21q-30 0-51 21t-21 51q0 30 21 51t51 21Zm-153-84q24 0 42-18t18-42q0-24-18-42t-42-18q-24 0-42 18t-18 42q0 24 18 42t42 18Zm6-189q17 0 28.5-11.5T361-589q0-17-11.5-28.5T321-629q-17 0-28.5 11.5T281-589q0 17 11.5 28.5T321-549Zm183-66q36 0 60-24t24-60q0-36-24-60t-60-24q-36 0-60 24t-24 60q0 36 24 60t60 24Z"/>
                </svg>
            ),
        },
        {
            type: 'icon',
            label: 'Universe',
            path: '/universe',
            action: (path) => handleNavigatePath(path),
            icon: (isActive) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="24px" height="24px" viewBox="0 0 24 24" fill={isActive ? activeColor : inactiveColor}>
                    <circle cx="6" cy="6" r="2"/>
                    <circle cx="18" cy="8" r="1.5"/>
                    <circle cx="12" cy="4" r="1"/>
                    <circle cx="10" cy="14" r="2.5"/>
                    <circle cx="17" cy="17" r="1.8"/>
                    <circle cx="5" cy="19" r="1.2"/>
                    <line x1="6" y1="6" x2="12" y2="4" stroke={isActive ? activeColor : inactiveColor} strokeWidth="0.5" opacity="0.4"/>
                    <line x1="12" y1="4" x2="18" y2="8" stroke={isActive ? activeColor : inactiveColor} strokeWidth="0.5" opacity="0.4"/>
                    <line x1="6" y1="6" x2="10" y2="14" stroke={isActive ? activeColor : inactiveColor} strokeWidth="0.5" opacity="0.4"/>
                    <line x1="10" y1="14" x2="17" y2="17" stroke={isActive ? activeColor : inactiveColor} strokeWidth="0.5" opacity="0.4"/>
                </svg>
            ),
        },
    ];

    useEffect(() => {
        const scroll = () => {
            setShowNavlinks(false);

            if (timeOutRef.current) {
                clearTimeout(timeOutRef.current);
            }

            timeOutRef.current = setTimeout(() => {
                setShowNavlinks(true);
            }, 500);
        };

        document.addEventListener('scroll', scroll, true);
        return () => {
            if (timeOutRef.current) {
                clearTimeout(timeOutRef.current);
            }
            document.removeEventListener('scroll', scroll, true);
        };
    }, []);

    return (
        <>
            {showNavlinks && (
                <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0, transition: { type: 'spring', stiffness: 300, damping: 25, mass: 0.8 } }}
                    exit={{ opacity: 0, y: 20, transition: { duration: 0.2, ease: 'easeOut' } }}
                    className="mobile-navlink-container"
                >
                    <div className="mobile-navlink-icon-container">
                        {navLinks.map((link, index) => {
                            const isActive = link.path && location.pathname === link.path;

                            return (
                                <div
                                    key={index}
                                    className="mobile-navlink-item"
                                    onClick={() => link.action(link.path)}
                                >
                                    <div className="mobile-navlink-icons">
                                        {link.icon(isActive)}
                                    </div>
                                    <p className={`mobile-navlink-label ${isActive ? 'mobile-navlink-label-active' : ''}`}>
                                        {link.label}
                                    </p>
                                    {isActive && <div className="mobile-navlink-active-dot" />}
                                </div>
                            );
                        })}
                    </div>
                </motion.div>
            )}
        </>
    );
};

export default MobileNavlink;
