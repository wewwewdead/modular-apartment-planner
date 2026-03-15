import { useNavigate } from "react-router-dom";
import { useAuth } from "../../../../Context/useAuth";
import { handleClickProfile } from "../../../../../helpers/handleClicks";

export default function MentionComponent({ mentionName, mentionUserId, mentionUsername, isEditable }) {
    const navigate = useNavigate();
    const { user } = useAuth();

    const handleClick = (e) => {
        if (isEditable) return;
        e.stopPropagation();
        handleClickProfile(navigate)(e, user?.id, mentionUserId, mentionUsername);
    };

    return (
        <span
            className={`mention-chip${isEditable ? ' mention-chip--editing' : ''}`}
            onClick={handleClick}
            role={isEditable ? undefined : "link"}
            tabIndex={isEditable ? undefined : 0}
        >
            @{mentionName}
        </span>
    );
}
