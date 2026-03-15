import { useEffect, useRef, useState } from 'react';
import './mobilenavlink.css';
import { useAuth } from '../../Context/useAuth';
import { useLocation, useNavigate } from 'react-router-dom';

const MobileNavlink = () => {
    const [isScrolling, setIsScrolling] = useState(false);
    const timeOutRef = useRef();
    const navigate = useNavigate();
    const location = useLocation();

    const { session, openAuthModal, user } = useAuth();

    const userWritingInterests = user?.userData?.[0]?.writing_interests;
    const hasInterests = Array.isArray(userWritingInterests) && userWritingInterests.length > 0;

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
            label: 'Following',
            path: '/home/following',
            action: (path) => handleNavigatePath(path),
            icon: (isActive) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24" fill={isActive ? activeColor : inactiveColor}>
                    <path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/>
                </svg>
            ),
        },
        ...(hasInterests ? [{
            type: 'icon',
            label: 'For You',
            path: '/home/for-you',
            action: (path) => handleNavigatePath(path),
            icon: (isActive) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24" fill={isActive ? activeColor : inactiveColor}>
                    <path d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/>
                </svg>
            ),
        }] : []),
        {
            type: 'icon',
            label: 'Stories',
            path: '/home/stories',
            action: (path) => handleNavigatePath(path),
            icon: (isActive) => (
                <svg xmlns="http://www.w3.org/2000/svg" width="22px" height="22px" viewBox="0 0 24 24" fill={isActive ? activeColor : inactiveColor}>
                    <path d="M21 5c-1.11-.35-2.33-.5-3.5-.5-1.95 0-4.05.4-5.5 1.5-1.45-1.1-3.55-1.5-5.5-1.5S2.45 4.9 1 6v14.65c0 .25.25.5.5.5.1 0 .15-.05.25-.05C3.1 20.45 5.05 20 6.5 20c1.95 0 4.05.4 5.5 1.5 1.35-.85 3.8-1.5 5.5-1.5 1.65 0 3.35.3 4.75 1.05.1.05.15.05.25.05.25 0 .5-.25.5-.5V6c-.6-.45-1.25-.75-2-1zm0 13.5c-1.1-.35-2.3-.5-3.5-.5-1.7 0-4.15.65-5.5 1.5V8c1.35-.85 3.8-1.5 5.5-1.5 1.2 0 2.4.15 3.5.5v11.5z"/>
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
    ];

    useEffect(() => {
        const scroll = () => {
            setIsScrolling(true);

            if (timeOutRef.current) {
                clearTimeout(timeOutRef.current);
            }

            timeOutRef.current = setTimeout(() => {
                setIsScrolling(false);
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
        <div className={`mobile-navlink-container ${isScrolling ? 'mobile-navlink-dimmed' : ''}`}>
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
        </div>
    );
};

export default MobileNavlink;
