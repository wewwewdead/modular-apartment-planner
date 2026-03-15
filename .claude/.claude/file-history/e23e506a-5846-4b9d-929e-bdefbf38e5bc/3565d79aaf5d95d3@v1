import React from "react";
import VerifiedBadge from "../../Badge/VerifiedBadge";
import formatCounts from "../../../../helpers/fomatCounts";

const ProfileHeroSection = ({
    userData,
    user,
    fontColor,
    handleClickEdit,
    handleClickFontColorSelector,
    croppedImage,
    gradientPicked,
}) => {
    return (
        <div style={croppedImage || gradientPicked} className="hero-section">
            <div className="profile-top-row">
                <div
                    className={`profile-avatar-ring ${userData?.badge === "legend" ? "badge-ring-legend" : userData?.badge === "og" ? "badge-ring-og" : ""}`}
                >
                    <img
                        className="my-profile-image"
                        loading="lazy"
                        src={userData?.image_url || "/assets/profile.jpg"}
                        alt={`${userData?.name || "User"} profile picture`}
                    />
                </div>
                <div className="profile-stats-container">
                    <div className="profile-stat-item">
                        <span className="stat-number">{formatCounts(user?.followerCount)}</span>
                        <span className="stat-label">Followers</span>
                    </div>
                    <div className="profile-stat-item">
                        <span className="stat-number">{formatCounts(user?.followingCount)}</span>
                        <span className="stat-label">Following</span>
                    </div>
                </div>
            </div>

            <div className="profile-name-container">
                <div className="profile-name-row">
                    <p className="profile-name">{userData?.name}</p>
                    <VerifiedBadge badge={userData?.badge} size={22} />
                    {userData?.badge && (
                        <span
                            className={`badge-pill ${userData.badge === "legend" ? "badge-pill-legend" : "badge-pill-og"}`}
                        >
                            {userData.badge === "legend" ? "Legend" : "OG"}
                        </span>
                    )}
                </div>
                {userData?.username && (
                    <p className="profile-user-handle">@{userData.username}</p>
                )}
            </div>

            {userData?.bio && (
                <div className="profile-bio-container">
                    <p className="profile-bio">{userData?.bio}</p>
                </div>
            )}

            <div className="profile-actions-row">
                <div onClick={(e) => handleClickEdit(e)} className="edit-profile-bttn">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="20px"
                        viewBox="0 -960 960 960"
                        width="20px"
                        fill={fontColor || userData?.profile_font_color}
                    >
                        <path d="M200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h357l-80 80H200v560h560v-278l80-80v358q0 33-23.5 56.5T760-120H200Zm280-360ZM360-360v-170l367-367q12-12 27-18t30-6q16 0 30.5 6t26.5 18l56 57q11 12 17 26.5t6 29.5q0 15-5.5 29.5T897-728L530-360H360Zm481-424-56-56 56 56ZM440-440h56l232-232-28-28-29-28-231 231v57Zm260-260-29-28 29 28 28 28-28-28Z" />
                    </svg>
                    Edit Profile
                </div>
                <div onClick={(e) => handleClickFontColorSelector(e)} className="font-picker-container">
                    <svg
                        xmlns="http://www.w3.org/2000/svg"
                        height="20px"
                        viewBox="0 -960 960 960"
                        width="20px"
                        fill={fontColor || userData?.profile_font_color}
                    >
                        <path d="M80 0v-160h800V0H80Zm140-280 210-560h100l210 560h-96l-50-144H368l-52 144h-96Zm176-224h168l-82-232h-4l-82 232Z" />
                    </svg>
                </div>
            </div>
        </div>
    );
};

export default ProfileHeroSection;
