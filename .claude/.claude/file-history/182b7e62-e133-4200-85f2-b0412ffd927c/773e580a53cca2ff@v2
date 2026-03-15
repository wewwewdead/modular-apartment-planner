import { useState } from 'react';
import './sharemenu.css';

const ShareMenu = ({ url, title, onClose }) => {
    const [copied, setCopied] = useState(false);

    const handleCopyLink = async (e) => {
        e.stopPropagation();
        try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => {
                setCopied(false);
                onClose();
            }, 1200);
        } catch {
            onClose();
        }
    };

    const handleShareX = (e) => {
        e.stopPropagation();
        const xUrl = `https://x.com/intent/tweet?url=${encodeURIComponent(url)}&text=${encodeURIComponent(title)}`;
        window.open(xUrl, '_blank', 'noopener,noreferrer');
        onClose();
    };

    const handleShareFacebook = (e) => {
        e.stopPropagation();
        const fbUrl = `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}`;
        window.open(fbUrl, '_blank', 'noopener,noreferrer');
        onClose();
    };

    const handleNativeShare = async (e) => {
        e.stopPropagation();
        try {
            await navigator.share({ url, title });
        } catch {
            // user cancelled or not supported
        }
        onClose();
    };

    const handleOverlayClick = (e) => {
        e.stopPropagation();
        onClose();
    };

    return (
        <>
            <div className="share-menu-overlay" onClick={handleOverlayClick} />
            <div className="share-menu" onClick={(e) => e.stopPropagation()}>
                <button
                    className={`share-menu-item ${copied ? 'share-menu-item--copied' : ''}`}
                    onClick={handleCopyLink}
                >
                    {copied ? (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41L9 16.17z"/>
                        </svg>
                    ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z"/>
                        </svg>
                    )}
                    <span>{copied ? 'Copied!' : 'Copy link'}</span>
                </button>

                <button className="share-menu-item" onClick={handleShareX}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
                    </svg>
                    <span>Share to X</span>
                </button>

                <button className="share-menu-item" onClick={handleShareFacebook}>
                    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                    </svg>
                    <span>Share to Facebook</span>
                </button>

                {typeof navigator !== 'undefined' && navigator.share && (
                    <button className="share-menu-item" onClick={handleNativeShare}>
                        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">
                            <path d="M18 16.08c-.76 0-1.44.3-1.96.77L8.91 12.7c.05-.23.09-.46.09-.7s-.04-.47-.09-.7l7.05-4.11c.54.5 1.25.81 2.04.81 1.66 0 3-1.34 3-3s-1.34-3-3-3-3 1.34-3 3c0 .24.04.47.09.7L8.04 9.81C7.5 9.31 6.79 9 6 9c-1.66 0-3 1.34-3 3s1.34 3 3 3c.79 0 1.5-.31 2.04-.81l7.12 4.16c-.05.21-.08.43-.08.65 0 1.61 1.31 2.92 2.92 2.92 1.61 0 2.92-1.31 2.92-2.92s-1.31-2.92-2.92-2.92z"/>
                        </svg>
                        <span>Share</span>
                    </button>
                )}
            </div>
        </>
    );
};

export default ShareMenu;
