import { useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useRepostMutation } from "../../utils/useMutation";
import { useAuth } from "../../Context/useAuth";
import VerifiedBadge from "../Badge/VerifiedBadge";
import useFocusTrap from "../../utils/useFocusTrap";
import './repostmodal.css';

const CAPTION_MAX = 280;

const RepostModal = ({ journal, onClose }) => {
    const { session } = useAuth();
    const modalRef = useRef(null);
    useFocusTrap(modalRef, true);
    const [caption, setCaption] = useState('');
    const [error, setError] = useState('');

    const repostMutation = useRepostMutation(session);

    const handleSubmit = () => {
        if(repostMutation.isPending) return;
        setError('');

        repostMutation.mutate(
            {
                sourceJournalId: journal.id,
                caption: caption.trim() || ''
            },
            {
                onSuccess: () => {
                    onClose('success');
                },
                onError: (err) => {
                    setError(err?.message || 'Failed to repost');
                }
            }
        );
    };

    return (
        <AnimatePresence>
            <motion.div
                className="repost-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={() => onClose()}
            >
                <motion.div
                    className="repost-modal"
                    ref={modalRef}
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 20 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="repost-modal-header">
                        <h3 className="repost-modal-title">Repost</h3>
                        <button className="repost-modal-close" onClick={() => onClose()}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.3 5.71a1 1 0 0 0-1.42 0L12 10.59 7.12 5.71a1 1 0 1 0-1.42 1.42L10.59 12l-4.88 4.88a1 1 0 1 0 1.42 1.42L12 13.41l4.88 4.88a1 1 0 0 0 1.42-1.42L13.41 12l4.88-4.88a1 1 0 0 0 0-1.41Z"/>
                            </svg>
                        </button>
                    </div>

                    <div className="repost-original-preview">
                        <div className="repost-original-author">
                            <img
                                className="repost-original-avatar"
                                src={journal?.users?.image_url || '/assets/profile.jpg'}
                                alt="author"
                            />
                            <span className="repost-original-name">{journal?.users?.name}</span>
                            <VerifiedBadge badge={journal?.users?.badge} size={12} />
                        </div>
                        <p className="repost-original-title">{journal?.title?.length > 80 ? journal.title.substring(0, 80) + '...' : journal?.title}</p>
                    </div>

                    <div className="repost-caption-container">
                        <textarea
                            className="repost-caption-input"
                            placeholder="Add your thoughts (optional)..."
                            value={caption}
                            onChange={(e) => {
                                if(e.target.value.length <= CAPTION_MAX){
                                    setCaption(e.target.value);
                                }
                            }}
                            maxLength={CAPTION_MAX}
                            rows={3}
                        />
                        <span className={`repost-char-count ${caption.length >= CAPTION_MAX ? 'at-limit' : ''}`}>
                            {caption.length}/{CAPTION_MAX}
                        </span>
                    </div>

                    {error && (
                        <p className="repost-error">{error}</p>
                    )}

                    <div className="repost-modal-actions">
                        <button className="repost-cancel-btn" onClick={() => onClose()}>Cancel</button>
                        <button
                            className="repost-submit-btn"
                            onClick={handleSubmit}
                            disabled={repostMutation.isPending}
                        >
                            {repostMutation.isPending ? 'Reposting...' : 'Repost'}
                        </button>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default RepostModal;
