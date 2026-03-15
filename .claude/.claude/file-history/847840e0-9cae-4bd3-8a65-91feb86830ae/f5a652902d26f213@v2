import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { handleImageFallback } from '../../utils/handleImageFallback';
import './mentionDropdown.css';

const MentionDropdown = ({ isOpen, results, selectedIndex, onSelect, onHover, position, onClose }) => {
    const dropdownRef = useRef(null);

    useEffect(() => {
        if (!isOpen) return;

        const handleClickOutside = (e) => {
            if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose]);

    if (!isOpen || results.length === 0) return null;

    return createPortal(
        <AnimatePresence>
            <motion.div
                ref={dropdownRef}
                className="mention-dropdown"
                style={{
                    position: 'fixed',
                    top: position.top,
                    left: position.left,
                    width: position.width ? Math.min(position.width, 300) : 260,
                    zIndex: 99999,
                }}
                initial={{ opacity: 0, y: -4 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -4 }}
                transition={{ duration: 0.12 }}
            >
                {results.map((user, index) => (
                    <div
                        key={user.id}
                        className={`mention-dropdown-item ${index === selectedIndex ? 'mention-dropdown-item--active' : ''}`}
                        onMouseEnter={() => onHover(index)}
                        onMouseDown={(e) => {
                            e.preventDefault();
                            onSelect(user);
                        }}
                    >
                        <img
                            className="mention-dropdown-avatar"
                            src={user.image_url || '/assets/profile.jpg'}
                            alt={user.name}
                            onError={handleImageFallback}
                        />
                        <div className="mention-dropdown-info">
                            <span className="mention-dropdown-name">{user.name}</span>
                            {user.username && (
                                <span className="mention-dropdown-username">@{user.username}</span>
                            )}
                        </div>
                    </div>
                ))}
            </motion.div>
        </AnimatePresence>,
        document.body
    );
};

export default MentionDropdown;
