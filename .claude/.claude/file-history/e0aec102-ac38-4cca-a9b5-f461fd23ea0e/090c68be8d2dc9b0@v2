import { motion, AnimatePresence } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useInfiniteQuery } from '@tanstack/react-query';
import { getPromptResponses } from '../../../API/Api';
import { MoonLoader } from 'react-spinners';
import VerifiedBadge from '../Badge/VerifiedBadge';

function timeAgo(dateStr) {
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return 'just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    const days = Math.floor(hours / 24);
    if (days < 30) return `${days}d ago`;
    return new Date(dateStr).toLocaleDateString();
}

const PromptResponsesModal = ({ promptId, count, promptText, onClose }) => {
    const navigate = useNavigate();

    const {
        data,
        hasNextPage,
        fetchNextPage,
        isFetchingNextPage,
    } = useInfiniteQuery({
        queryKey: ['promptResponsesModal', promptId],
        queryFn: ({ pageParam = null }) => getPromptResponses(promptId, pageParam, 5),
        getNextPageParam: (lastPage) => {
            if (lastPage?.hasMore) {
                const last = lastPage.responses[lastPage.responses.length - 1];
                return new Date(last.created_at).toISOString();
            }
            return undefined;
        },
        enabled: !!promptId,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 5,
    });

    const responses = data?.pages?.flatMap(p => p.responses) || [];

    const handleCardClick = (id) => {
        onClose();
        navigate(`/home/post/${id}`);
    };

    return (
        <AnimatePresence>
            <motion.div
                className="prompt-responses-overlay"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
            >
                <motion.div
                    className="prompt-responses-modal"
                    initial={{ opacity: 0, scale: 0.92, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.92, y: 20 }}
                    transition={{ type: 'spring', stiffness: 400, damping: 30 }}
                    onClick={(e) => e.stopPropagation()}
                >
                    <div className="prompt-responses-header">
                        <div className="prompt-responses-header-text">
                            <h3 className="prompt-responses-title">
                                {count} {count === 1 ? 'Response' : 'Responses'}
                            </h3>
                            {promptText && (
                                <p className="prompt-responses-prompt">
                                    {promptText.length > 80 ? promptText.substring(0, 80) + '…' : promptText}
                                </p>
                            )}
                        </div>
                        <button className="prompt-responses-close" onClick={onClose}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M18.3 5.71a1 1 0 0 0-1.42 0L12 10.59 7.12 5.71a1 1 0 1 0-1.42 1.42L10.59 12l-4.88 4.88a1 1 0 1 0 1.42 1.42L12 13.41l4.88 4.88a1 1 0 0 0 1.42-1.42L13.41 12l4.88-4.88a1 1 0 0 0 0-1.41Z"/>
                            </svg>
                        </button>
                    </div>

                    <div className="prompt-responses-list">
                        {responses.map((r) => (
                            <div
                                key={r.id}
                                className="prompt-response-card"
                                onClick={() => handleCardClick(r.id)}
                            >
                                <div className="prompt-response-author">
                                    <div className={`prompt-response-avatar-wrap${r.users?.badge === 'legend' ? ' pr-ring-legend' : r.users?.badge === 'og' ? ' pr-ring-og' : ''}`}>
                                        <img
                                            src={r.users?.image_url || '/assets/profile.jpg'}
                                            alt=""
                                            className="prompt-response-avatar"
                                        />
                                    </div>
                                    <span className="prompt-response-name">{r.users?.name || 'Anonymous'}</span>
                                    {r.users?.badge && <VerifiedBadge badge={r.users.badge} size={12} />}
                                </div>
                                <p className="prompt-response-title">{r.title}</p>
                                <span className="prompt-response-time">{timeAgo(r.created_at)}</span>
                            </div>
                        ))}

                        {hasNextPage && (
                            <button
                                className="prompt-responses-see-more"
                                onClick={() => fetchNextPage()}
                                disabled={isFetchingNextPage}
                            >
                                {isFetchingNextPage ? (
                                    <MoonLoader size={14} color="var(--text-secondary, #a1a1aa)" />
                                ) : (
                                    'See more'
                                )}
                            </button>
                        )}
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
};

export default PromptResponsesModal;
