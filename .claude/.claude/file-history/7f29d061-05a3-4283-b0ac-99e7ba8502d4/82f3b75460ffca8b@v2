import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../Context/useAuth';
import './MentionText.css';

const MENTION_SPLIT_REGEX = /(@[\w-]+)/g;
const MENTION_EXTRACT_REGEX = /^@([\w-]+)$/;

export default function MentionText({ text }) {
    const navigate = useNavigate();
    const { user } = useAuth();
    const currentUsername = user?.userData?.[0]?.username;

    if (!text) return null;

    const parts = text.split(MENTION_SPLIT_REGEX);

    return (
        <>
            {parts.map((part, i) => {
                const match = part.match(MENTION_EXTRACT_REGEX);
                if (!match) return part;

                const username = match[1];
                return (
                    <span
                        key={i}
                        className="mention-link"
                        onClick={(e) => {
                            e.stopPropagation();
                            if (username === currentUsername) {
                                navigate('/profile');
                            } else {
                                navigate(`/u/${username}`);
                            }
                        }}
                    >
                        {part}
                    </span>
                );
            })}
        </>
    );
}
