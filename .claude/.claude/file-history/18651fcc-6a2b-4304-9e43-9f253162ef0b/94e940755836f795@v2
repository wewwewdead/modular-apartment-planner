import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { getTodaysPrompt, getPromptResponses } from '../../../API/Api';
import './DailyPromptCard.css';

const DailyPromptCard = ({ onWriteResponse }) => {
    const { data: prompt, isLoading } = useQuery({
        queryKey: ['todaysPrompt'],
        queryFn: getTodaysPrompt,
        staleTime: 1000 * 60 * 30,
        refetchOnWindowFocus: false,
    });

    const { data: responsesData } = useQuery({
        queryKey: ['promptResponses', prompt?.id],
        queryFn: () => getPromptResponses(prompt.id),
        enabled: !!prompt?.id,
        staleTime: 1000 * 60 * 5,
        refetchOnWindowFocus: false,
    });

    if (isLoading || !prompt) return null;

    const responseCount = responsesData?.count || 0;
    const avatars = (responsesData?.responses || []).slice(0, 5);

    return (
        <div className="daily-prompt-card">
            <div className="daily-prompt-header">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 -960 960 960" fill="currentColor" className="daily-prompt-icon">
                    <path d="M480-80q-26 0-47-12.5T400-126q-33 0-56.5-23.5T320-206v-142q-59-39-94.5-103T190-590q0-121 84.5-205.5T480-880q121 0 205.5 84.5T770-590q0 77-35.5 140T640-348v142q0 33-23.5 56.5T560-126q-12 21-33 33.5T480-80Zm-80-126h160v-36H400v36Zm0-76h160v-38H400v38Zm-8-118h58v-108l-88-88 42-42 76 76 76-76 42 42-88 88v108h58q54-26 88-76.5T690-590q0-88-61-149t-149-61q-88 0-149 61t-61 149q0 63 34 113.5t88 76.5Z"/>
                </svg>
                <span className="daily-prompt-label">Today's Prompt</span>
                {prompt.category && (
                    <span className="daily-prompt-category">{prompt.category}</span>
                )}
            </div>
            <p className="daily-prompt-text">{prompt.prompt_text}</p>
            <div className="daily-prompt-footer">
                <button
                    className="daily-prompt-write-btn"
                    onClick={() => onWriteResponse?.(prompt)}
                >
                    Write your take
                </button>
                {responseCount > 0 && (
                    <div className="daily-prompt-responses">
                        <div className="daily-prompt-avatars">
                            {avatars.map((r, i) => (
                                <img
                                    key={r.id}
                                    src={r.users?.image_url || '/assets/profile.jpg'}
                                    alt=""
                                    className="daily-prompt-avatar"
                                    style={{ zIndex: avatars.length - i }}
                                />
                            ))}
                        </div>
                        <span className="daily-prompt-count">
                            {responseCount} {responseCount === 1 ? 'response' : 'responses'}
                        </span>
                    </div>
                )}
            </div>
        </div>
    );
};

export default DailyPromptCard;
