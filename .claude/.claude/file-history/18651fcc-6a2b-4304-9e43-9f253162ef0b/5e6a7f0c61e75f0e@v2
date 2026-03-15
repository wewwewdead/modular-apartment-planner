import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getPostReactions } from '../../../API/Api';
import { getReactionEmoji } from '../../utils/reactionConfig';
import './reactions.css';

const ReactionSummary = ({ journalId }) => {
    const { data } = useQuery({
        queryKey: ['postReactions', journalId],
        queryFn: () => getPostReactions(journalId),
        enabled: !!journalId,
        staleTime: 1000 * 60 * 2,
        refetchOnWindowFocus: false,
    });

    const reactions = data?.reactions || [];

    if (reactions.length === 0) return null;

    return (
        <div className="reaction-summary">
            {reactions.map((group) => (
                <span key={group.reaction_type} className="reaction-summary-chip">
                    <span className="reaction-summary-emoji">{getReactionEmoji(group.reaction_type)}</span>
                    <span className="reaction-summary-count">{group.count}</span>
                </span>
            ))}
        </div>
    );
};

export default ReactionSummary;
