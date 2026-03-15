import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "react-router-dom";
import { addReplyOpinion, getViewOpinion } from "../../../API/Api";
import { useAuth } from "../../Context/useAuth";
import { useState, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import formatPostDate from "../../../helpers/formatDateString";
import OpinionsReplyCard from "./OpinionsCardRepy";
import VerifiedBadge from "../Badge/VerifiedBadge";
import MentionText from "../mentions/MentionText";
import useTextareaMention from "../mentions/useTextareaMention";
import MentionDropdown from "../mentions/MentionDropdown";

const OpinionViewer = () => {
    const queryClient = useQueryClient();
    const location = useLocation();
    const { opinionId, userId } = location.state;
    const { user, session } = useAuth();
    const textAreaRef = useRef(null);

    const [replyOpinion, setReplyOpinion] = useState('');
    const [isTyping, setIsTyping] = useState(false);

    const { textareaProps: mentionTextareaProps, dropdownProps: mentionDropdownProps } = useTextareaMention(replyOpinion, setReplyOpinion, textAreaRef, 280, user?.userData?.[0]?.id);

    const { data, isLoading } = useQuery({
        queryKey: ['getViewOpinion', opinionId, userId],
        queryFn: ({ queryKey }) => getViewOpinion(queryKey[1], queryKey[2]),
        staleTime: 1000 * 60 * 60,
        gcTime: 1000 * 60 * 60,
        enabled: !!opinionId && !!userId,
        refetchOnWindowFocus: false
    });

    const cancelTyping = () => {
        setIsTyping(false);
        setReplyOpinion('');
        if (textAreaRef.current) {
            textAreaRef.current.blur();
        }
    };

    const submitReply = async (receiverId, senderId, parentId) => {
        const formData = new FormData();
        formData.append('opinion', replyOpinion);

        try {
            await addReplyOpinion(formData, receiverId, senderId, parentId, session?.access_token);
            setReplyOpinion('');
            setIsTyping(false);
            queryClient.invalidateQueries({ queryKey: ['getViewOpinion', opinionId, userId] });
            queryClient.invalidateQueries({ queryKey: ['getReplyOpinion', opinionId] });
            queryClient.invalidateQueries({ queryKey: ['getOpinions'] });
        } catch (error) {
            console.error(error);
            setReplyOpinion('');
            queryClient.invalidateQueries({ queryKey: ['getViewOpinion', opinionId, userId] });
            queryClient.invalidateQueries({ queryKey: ['getReplyOpinion', opinionId] });
            queryClient.invalidateQueries({ queryKey: ['getOpinions'] });
        }
    };

    const opinionData = data?.data;

    return (
        <>
            {opinionData?.map((opinion) => (
                <motion.div
                    className="so-card-wrapper"
                    key={opinion.id}
                    initial={{ opacity: 0, y: 12 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, ease: "easeOut" }}
                    style={{ borderBottom: 'none' }}
                >
                    <div className="so-card so-card--parent">
                        <div className="so-card-content">
                            <div className="so-header-row">
                                <div className={`so-avatar-outer ${opinion.users.badge === 'legend' ? 'avatar-ring-legend' : opinion.users.badge === 'og' ? 'avatar-ring-og' : ''}`}>
                                    <img
                                        className="so-avatar"
                                        src={opinion.users.image_url || '../assets/profile.jpg'}
                                        alt={`${opinion?.users?.name || "User"} profile picture`}
                                    />
                                </div>
                                <span className="so-username">{opinion.users.name}</span>
                                <VerifiedBadge badge={opinion.users.badge} size={14}/>
                            </div>

                            <div className="so-body so-body--parent">
                                <MentionText text={opinion.opinion} />
                            </div>

                            <div className="ov-stats-row">
                                <span className="ov-reply-count">
                                    {opinion.reply_count} {opinion.reply_count === 1 ? 'reply' : 'replies'}
                                </span>
                                <span className="so-dot">·</span>
                                <span className="ov-full-date">
                                    {new Date(opinion.created_at).toLocaleDateString('en-US', {
                                        month: 'long',
                                        day: '2-digit',
                                        year: 'numeric',
                                    })}
                                </span>
                            </div>

                            <div className="ov-divider" />

                            <div className="ov-composer">
                                <img
                                    className="ov-reply-avatar"
                                    src={user?.userData[0].image_url || '../assets/profile.jpg'}
                                    alt={`${user?.userData?.[0]?.name || "User"} profile picture`}
                                />
                                <div className="ov-composer-input-wrap">
                                    <textarea
                                        ref={textAreaRef}
                                        maxLength={280}
                                        value={replyOpinion}
                                        onChange={(e) => { setReplyOpinion(e.target.value); mentionTextareaProps.onChange(e); }}
                                        onKeyDown={mentionTextareaProps.onKeyDown}
                                        onKeyUp={mentionTextareaProps.onKeyUp}
                                        onFocus={() => setIsTyping(true)}
                                        className="ov-reply-input"
                                        placeholder={`Reply to ${opinion.users.name}...`}
                                        rows={1}
                                    />
                                    <MentionDropdown {...mentionDropdownProps} />

                                    <AnimatePresence>
                                        {isTyping && (
                                            <motion.div
                                                className="ov-composer-actions"
                                                initial={{ height: 0, opacity: 0 }}
                                                animate={{ height: "auto", opacity: 1 }}
                                                exit={{ height: 0, opacity: 0 }}
                                                transition={{ duration: 0.2 }}
                                            >
                                                <span className="ov-char-count">
                                                    {replyOpinion.length > 0 ? `${replyOpinion.length}/280` : ''}
                                                </span>
                                                <div className="ov-btn-row">
                                                    <button
                                                        onClick={cancelTyping}
                                                        className="ov-btn-cancel"
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button
                                                        disabled={replyOpinion.trim().length === 0}
                                                        onClick={() => submitReply(userId, user?.userData[0].id, opinion.id)}
                                                        className={`ov-btn-submit ${replyOpinion.trim().length === 0 ? 'ov-btn-disabled' : ''}`}
                                                    >
                                                        Reply
                                                    </button>
                                                </div>
                                            </motion.div>
                                        )}
                                    </AnimatePresence>
                                </div>
                            </div>

                            <div className="ov-divider" />

                            <OpinionsReplyCard opinionId={opinion.id} depth={0} />
                        </div>
                    </div>
                </motion.div>
            ))}
        </>
    );
};

export default OpinionViewer;
