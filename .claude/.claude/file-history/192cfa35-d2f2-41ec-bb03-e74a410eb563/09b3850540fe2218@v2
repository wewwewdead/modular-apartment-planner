import { useQuery } from "@tanstack/react-query";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { MoonLoader } from "react-spinners";
import { searchUsers } from "../../../../API/Api";
import { useAuth } from "../../../Context/useAuth";
import { handleClickProfile } from "../../../../helpers/handleClicks";
import VerifiedBadge from "../../Badge/VerifiedBadge";
import "./userSearch.css";

const ChevronRight = ({ className }) => (
    <svg className={className} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M9 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
    </svg>
);

const UserSearchResults = ({ searchQuery }) => {
    const navigate = useNavigate();
    const { user } = useAuth();
    const loggedInUserId = user?.userData?.[0]?.id || null;
    const onClickProfile = handleClickProfile(navigate);

    const {
        data: searchData,
        isLoading,
        error,
    } = useQuery({
        queryKey: ["user-search", searchQuery],
        queryFn: () => searchUsers(searchQuery, 10),
        enabled: searchQuery.length >= 2,
        refetchOnWindowFocus: false,
        staleTime: 1000 * 60 * 2,
    });

    const users = searchData?.data || [];

    if(isLoading){
        return (
            <div className="postcards-parent-loading-container">
                <MoonLoader loading={true} color="var(--loader-color)" speedMultiplier={1} size={20} />
            </div>
        );
    }

    if(error){
        return (
            <div className="search-empty-state">
                Search failed. Please try again.
            </div>
        );
    }

    if(users.length === 0){
        return (
            <div className="search-empty-state">
                No matching people found.
            </div>
        );
    }

    return (
        <div className="user-search-results">
            {users.map((userItem, i) => (
                <motion.div
                    key={userItem.id}
                    className="user-search-card"
                    onClick={(e) => onClickProfile(e, loggedInUserId, userItem.id, userItem.username)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                        if(e.key === "Enter" || e.key === " "){
                            e.preventDefault();
                            onClickProfile(e, loggedInUserId, userItem.id, userItem.username);
                        }
                    }}
                    initial={{ opacity: 0, y: 8 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: 0.04 * i, ease: [0.22, 1, 0.36, 1] }}
                >
                    <div className="user-search-avatar-wrap">
                        <div className={`user-avatar-container ${userItem.badge === "legend" ? "avatar-ring-legend" : userItem.badge === "og" ? "avatar-ring-og" : ""}`}>
                            <img
                                loading="lazy"
                                className="user-info-avatar"
                                src={userItem.image_url || "/assets/profile.jpg"}
                                alt={`${userItem.name || "User"} profile picture`}
                            />
                        </div>
                    </div>
                    <div className="user-search-info">
                        <div className="user-search-name-row">
                            <p className="user-search-name">{userItem.name || "Unknown"}</p>
                            <VerifiedBadge badge={userItem.badge} size={14} />
                        </div>
                        {userItem.username && (
                            <p className="user-search-username">@{userItem.username}</p>
                        )}
                    </div>
                    <ChevronRight className="user-search-arrow" />
                </motion.div>
            ))}
        </div>
    );
};

export default UserSearchResults;
