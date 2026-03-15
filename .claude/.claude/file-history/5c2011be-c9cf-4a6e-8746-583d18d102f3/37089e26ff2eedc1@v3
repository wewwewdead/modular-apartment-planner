import React from 'react';
import { motion } from 'framer-motion';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/useAuth';
import { handleClickProfile } from '../../../helpers/handleClicks';

const CommunityHighlights = ({ group }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const clickProfile = handleClickProfile(navigate);

    const mostActive = group?.most_active_writer;
    const mostReacted = group?.most_reacted_post;

    if (!mostActive?.name && !mostReacted?.title) return null;

    const goToProfile = (e) => {
        clickProfile(e, user?.id, mostActive.user_id, mostActive.username);
    };

    const goToPost = () => {
        navigate(`/home/post/${mostReacted.journal_id}`);
    };

    return (
        <motion.div
            className="recap-community"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.3, delay: 0.55, ease: 'easeOut' }}
        >
            <span className="recap-community-label">This week on iskrib</span>

            {mostActive && mostActive.name && (
                <div
                    className="recap-community-item recap-community-clickable"
                    onClick={goToProfile}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && goToProfile(e)}
                >
                    <img
                        src={mostActive.avatar || '/assets/profile.jpg'}
                        alt={mostActive.name}
                        className="recap-community-avatar"
                    />
                    <span className="recap-community-text">
                        <strong>{mostActive.name}</strong> — {mostActive.post_count} posts
                    </span>
                </div>
            )}

            {mostReacted && mostReacted.title && (
                <div
                    className="recap-community-item recap-community-clickable"
                    onClick={goToPost}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => e.key === 'Enter' && goToPost()}
                >
                    <img
                        src={mostReacted.author_avatar || '/assets/profile.jpg'}
                        alt={mostReacted.author_name}
                        className="recap-community-avatar"
                    />
                    <span className="recap-community-text">
                        <strong>{mostReacted.title}</strong> by {mostReacted.author_name} — {mostReacted.reaction_count || 0} reactions
                    </span>
                </div>
            )}
        </motion.div>
    );
};

export default CommunityHighlights;
