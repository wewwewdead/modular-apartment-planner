import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { addReplyOpinion, getOpinionReply } from "../../../API/Api";
import { useState, useRef } from "react";
import { useAuth } from "../../Context/useAuth";
import { motion, AnimatePresence } from "framer-motion";
import formatPostDate from "../../../helpers/formatDateString";
import VerifiedBadge from "../Badge/VerifiedBadge";
import MentionText from "../mentions/MentionText";
import useTextareaMention from "../mentions/useTextareaMention";
import MentionDropdown from "../mentions/MentionDropdown";
import { getBadgeRingClass } from "../../utils/badgeRingClass";

const MAX_VISUAL_DEPTH = 3;

const OpinionsReplyCard = ({ opinionId, depth = 0 }) => {
    const queryClient = useQueryClient();
    const { user, session } = useAuth();

    const [openReplies, setOpenReplies] = useState(new Set());
    const [replyOpinion, setReplyOpinion] = useState('');
    const [isTypingId, setIsTypingId] = useState('');
    const [showReplyButtonId, setShowReplyButtonId] = useState('');

    const textAreaRef = useRef(null);

    const { textareaProps: mentionTextareaProps, dropdownProps: mentionDropdownProps } = useTextareaMention(replyOpinion, setReplyOpinion, textAreaRef, 280, user?.userData?.[0]?.id);

    const { data, isLoading, hasNextPage, isFetchingNextPage, fetchNextPage } = useInfiniteQuery({
        queryKey: ['getReplyOpinion', opinionId],
        queryFn: ({ queryKey, pageParam = null }) => getOpinionReply(queryKey[1], 10, pageParam),
        getNextPageParam: (lastPage) => {
            if (lastPage?.hasMore) {
                const lastReply = lastPage?.data[lastPage?.data.length - 1];
                return lastReply.id;
            }
            return undefined;
        },
        enabled: !!opinionId,
    });

    const handleSubmitReplyOpinion = async (reply, receiver_id, sender_id, parent_id) => {
        try {
            const formadata = new FormData();
            formadata.append('opinion', reply);
            await addReplyOpinion(formadata, receiver_id, sender_id, parent_id, session?.access_token);
            setShowReplyButtonId('');
            setIsTypingId('');
        } catch (error) {
            console.error(error);
        } finally {
            setReplyOpinion('');
            queryClient.invalidateQueries({ queryKey: ['getReplyOpinion', opinionId] });
            queryClient.invalidateQueries({ queryKey: ['getOpinions'] });
            queryClient.invalidateQueries({ queryKey: ['getViewOpinion'] });
        }
    };

    const cancelTyping = () => {
        setIsTypingId('');
        setReplyOpinion('');
        if (textAreaRef.current) {
            textAreaRef.current.blur();
        }
        setShowReplyButtonId('');
    };

    const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
    const opinioData = data?.pages.flatMap((page) => page.data) || [];

    return (
        <div
            className="rc-thread"
            style={{ '--depth': visualDepth }}
        >
            {opinioData?.map((opinion, index) => {
                const isLast = index === opinioData.length - 1;
                const hideConnector = isLast && !hasNextPage && opinion.reply_count === 0;

                return (
                    <motion.div
                        className="rc-reply"
                        key={opinion.id}
                        initial={{ opacity: 0, y: 6 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ duration: 0.25, delay: index * 0.03, ease: "easeOut" }}
                    >
                        <div className="rc-avatar-col">
                            <div className={`so-avatar-outer so-avatar-outer--sm ${getBadgeRingClass(opinion.users?.badge)}`}>
                                <img
                                    className="so-avatar so-avatar--sm"
                                    src={opinion.users?.image_url || '../assets/profile.jpg'}
                                    alt={`${opinion?.users?.name || "User"} profile picture`}
                                />
                            </div>
                            <div className={`rc-connector ${hideConnector ? 'rc-connector--hidden' : ''}`} />
                        </div>

                        <div className="rc-content">
                            <div className="so-header-row">
                                <span className="so-username" style={{ fontSize: '0.8rem' }}>{opinion.users?.name}</span>
                                <VerifiedBadge badge={opinion.users?.badge} size={12}/>
                                <span className="so-dot">·</span>
                                <span className="so-date" style={{ fontSize: '0.7rem' }}>{formatPostDate(opinion.created_at)}</span>
                            </div>

                            <div className="rc-body">
                                <MentionText text={opinion.opinion} />
                            </div>

                            <div className="rc-actions">
                                {opinion.reply_count > 0 && (
                                    <button
                                        className="rc-show-replies"
                                        onClick={() => setOpenReplies(prev => {
                                            const next = new Set(prev);
                                            next.has(opinion.id) ? next.delete(opinion.id) : next.add(opinion.id);
                                            return next;
                                        })}
                                    >
                                        {openReplies.has(opinion.id) ? 'Hide' : 'Show'} {opinion.reply_count} {opinion.reply_count === 1 ? 'reply' : 'replies'}
                                    </button>
                                )}
                                <button
                                    className="rc-reply-btn"
                                    onClick={() => setShowReplyButtonId(
                                        showReplyButtonId === opinion.id ? '' : opinion.id
                                    )}
                                >
                                    Reply
                                </button>
                            </div>

                            <AnimatePresence>
                                {showReplyButtonId === opinion.id && (
                                    <motion.div
                                        initial={{ height: 0, opacity: 0 }}
                                        animate={{ height: "auto", opacity: 1 }}
                                        exit={{ height: 0, opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                        className="rc-inline-composer"
                                    >
                                        <textarea
                                            ref={textAreaRef}
                                            maxLength={280}
                                            value={replyOpinion}
                                            onChange={(e) => { setReplyOpinion(e.target.value); mentionTextareaProps.onChange(e); }}
                                            onKeyDown={mentionTextareaProps.onKeyDown}
                                            onKeyUp={mentionTextareaProps.onKeyUp}
                                            onFocus={() => setIsTypingId(opinion.id)}
                                            className="ov-reply-input"
                                            placeholder={`Reply to ${opinion.users?.name}...`}
                                            rows={1}
                                        />
                                        <MentionDropdown {...mentionDropdownProps} />

                                        {isTypingId === opinion.id && (
                                            <div className="ov-composer-actions">
                                                <span className="ov-char-count">
                                                    {replyOpinion.length > 0 ? `${replyOpinion.length}/280` : ''}
                                                </span>
                                                <div className="ov-btn-row">
                                                    <button onClick={cancelTyping} className="ov-btn-cancel">Cancel</button>
                                                    <button
                                                        disabled={replyOpinion.trim().length === 0}
                                                        onClick={() => handleSubmitReplyOpinion(replyOpinion, opinion.users.id, user?.userData[0].id, opinion.id)}
                                                        className={`ov-btn-submit ${replyOpinion.trim().length === 0 ? 'ov-btn-disabled' : ''}`}
                                                    >
                                                        Reply
                                                    </button>
                                                </div>
                                            </div>
                                        )}
                                    </motion.div>
                                )}
                            </AnimatePresence>

                            <AnimatePresence>
                                {openReplies.has(opinion.id) && (
                                    <motion.div
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        transition={{ duration: 0.2 }}
                                    >
                                        <OpinionsReplyCard opinionId={opinion.id} depth={depth + 1} />
                                    </motion.div>
                                )}
                            </AnimatePresence>
                        </div>
                    </motion.div>
                );
            })}

            {hasNextPage && (
                <button className="rc-load-more" onClick={() => fetchNextPage()}>
                    {isFetchingNextPage ? 'Loading...' : 'Show more replies'}
                </button>
            )}
        </div>
    );
};

export default OpinionsReplyCard;
