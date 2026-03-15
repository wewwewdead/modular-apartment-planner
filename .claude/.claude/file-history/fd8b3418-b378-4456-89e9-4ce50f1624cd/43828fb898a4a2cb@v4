import { useState, useEffect, useRef } from 'react';
import { useAuth } from '../../../Context/useAuth';
import { useQueryClient } from '@tanstack/react-query';
import { useChapterComments } from '../hooks/useStoryData';
import { useAddChapterComment } from '../hooks/useStoryMutations';
import { motion } from 'framer-motion';
import { BeatLoader } from 'react-spinners';
import ChapterCommentCard from './ChapterCommentCard';

const MAX_CHARS = 300;

const CommentPanel = ({ chapterId, activeComment, onClose }) => {
    const { user, session } = useAuth();
    const token = session?.access_token;
    const queryClient = useQueryClient();

    const [body, setBody] = useState('');
    const [replyTo, setReplyTo] = useState(null);
    const [isMobile, setIsMobile] = useState(window.innerWidth <= 768);
    const textareaRef = useRef(null);
    const listRef = useRef(null);

    const { paragraphIndex, fingerprint, text } = activeComment;

    const { data: comments, isLoading } = useChapterComments(chapterId, paragraphIndex, token);
    const addComment = useAddChapterComment(token);

    useEffect(() => {
        const handleResize = () => setIsMobile(window.innerWidth <= 768);
        window.addEventListener('resize', handleResize);
        return () => window.removeEventListener('resize', handleResize);
    }, []);

    useEffect(() => {
        setReplyTo(null);
        setBody('');
    }, [paragraphIndex]);

    const handleReply = (comment) => {
        setReplyTo(comment);
        textareaRef.current?.focus();
    };

    const handleSubmit = () => {
        const trimmed = body.trim();
        if (!trimmed || trimmed.length > MAX_CHARS) return;

        const userData = user?.userData?.[0];

        const data = {
            comment: trimmed,
            paragraph_index: paragraphIndex,
            paragraph_fingerprint: fingerprint,
        };
        if (replyTo) {
            data.parent_id = replyTo.id;
        }

        const optimisticComment = {
            id: `optimistic-${Date.now()}`,
            comment: trimmed,
            paragraph_index: paragraphIndex,
            parent_id: replyTo?.id || null,
            created_at: new Date().toISOString(),
            user_id: userData?.id,
            users: {
                id: userData?.id,
                name: userData?.name,
                image_url: userData?.image_url,
                badge: userData?.badge,
                username: userData?.username,
            },
            replies: [],
        };

        const prevComments = queryClient.getQueryData(['chapterComments', chapterId, paragraphIndex]);
        const prevCounts = queryClient.getQueryData(['chapterCommentCounts', chapterId]);

        queryClient.setQueryData(['chapterComments', chapterId, paragraphIndex], (old) => {
            if (!old) return [optimisticComment];
            if (replyTo) {
                return old.map((c) =>
                    c.id === replyTo.id
                        ? { ...c, replies: [...(c.replies || []), optimisticComment] }
                        : c
                );
            }
            return [optimisticComment, ...old];
        });

        queryClient.setQueryData(['chapterCommentCounts', chapterId], (old) => {
            if (!old) return { [paragraphIndex]: 1 };
            return { ...old, [paragraphIndex]: (old[paragraphIndex] || 0) + 1 };
        });

        addComment.mutate(
            { chapterId, data },
            {
                onError: () => {
                    queryClient.setQueryData(['chapterComments', chapterId, paragraphIndex], prevComments);
                    queryClient.setQueryData(['chapterCommentCounts', chapterId], prevCounts);
                },
            }
        );

        setBody('');
        setReplyTo(null);
    };

    const handleKeyDown = (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSubmit();
        }
    };

    const commentList = comments || [];
    const isLoggedIn = !!token;
    const charCount = body.length;

    const panelVariants = isMobile
        ? { initial: { y: '100%' }, animate: { y: 0 }, exit: { y: '100%' } }
        : { initial: { x: '100%' }, animate: { x: 0 }, exit: { x: '100%' } };

    return (
        <>
            <motion.div
                className="cp-backdrop"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.2 }}
                onClick={onClose}
            />

            <motion.div
                className={`cp-panel ${isMobile ? 'cp-panel-mobile' : 'cp-panel-desktop'}`}
                variants={panelVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={{ type: 'spring', damping: 25, stiffness: 200 }}
            >
                {isMobile && <div className="cp-drag-handle" />}

                <div className="cp-header">
                    <div className="cp-header-left">
                        <h3 className="cp-title">Comments</h3>
                        {commentList.length > 0 && (
                            <span className="cp-count">{commentList.length}</span>
                        )}
                    </div>
                    <button className="cp-close" onClick={onClose} aria-label="Close comments">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </button>
                </div>

                <div className="cp-preview">
                    <div className="cp-preview-bar" />
                    <p className="cp-preview-text">{text}</p>
                </div>

                <div className="cp-list" ref={listRef}>
                    {isLoading ? (
                        <div className="cp-loading">
                            <BeatLoader size={8} color="var(--accent-amber)" />
                        </div>
                    ) : commentList.length === 0 ? (
                        <div className="cp-empty">
                            <div className="cp-empty-icon">
                                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                                </svg>
                            </div>
                            <p className="cp-empty-title">Start the conversation</p>
                            <span className="cp-empty-hint">Share your thoughts on this passage</span>
                        </div>
                    ) : (
                        commentList.map((c) => (
                            <ChapterCommentCard
                                key={c.id}
                                comment={c}
                                onReply={handleReply}
                            />
                        ))
                    )}
                </div>

                {isLoggedIn && (
                    <div className="cp-input-area">
                        {replyTo && (
                            <div className="cp-reply-indicator">
                                <svg width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                    <polyline points="9 17 4 12 9 7" />
                                    <path d="M20 18v-2a4 4 0 0 0-4-4H4" />
                                </svg>
                                <span>{replyTo.users?.name}</span>
                                <button onClick={() => setReplyTo(null)} aria-label="Cancel reply">&times;</button>
                            </div>
                        )}
                        <div className="cp-input-row">
                            <textarea
                                ref={textareaRef}
                                className="cp-textarea"
                                placeholder="Share a thought..."
                                value={body}
                                onChange={(e) => setBody(e.target.value.slice(0, MAX_CHARS))}
                                onKeyDown={handleKeyDown}
                                rows={1}
                            />
                            <button
                                className="cp-submit"
                                onClick={handleSubmit}
                                disabled={!body.trim() || charCount > MAX_CHARS}
                            >
                                Post
                            </button>
                        </div>
                        <div className="cp-action-row">
                            <span className={`cp-char-count ${charCount >= 280 ? (charCount >= MAX_CHARS ? 'cp-char-red' : 'cp-char-warn') : ''}`}>
                                {charCount}/{MAX_CHARS}
                            </span>
                        </div>
                    </div>
                )}
            </motion.div>
        </>
    );
};

export default CommentPanel;
