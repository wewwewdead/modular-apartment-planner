import React from "react";
import { BarLoader } from "react-spinners";
import { motion as Motion } from "framer-motion";

const ProfileEditModal = ({
    showProfileEditor,
    closeEditor,
    croppedImage,
    gradientPicked,
    insertImageFromFile,
    handleImageOnChange,
    inputRef,
    editImagePreview,
    userData,
    handleShowGradientPicker,
    profileEditName,
    setProfileEditName,
    profileEditBio,
    setProfileEditBio,
    handleSaveProfileEdit,
    isSavingProfile,
}) => {
    if (!showProfileEditor) {
        return null;
    }

    return (
        <div key={"profile-editor"} className="profile-editor-bg">
            <Motion.div
                className="profile-editor-container"
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 250, damping: 25 }}
            >
                <div className="profile-editor-close-button-container">
                    <div onClick={(e) => closeEditor(e)} className="profile-editor-close-button">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="24px"
                            viewBox="0 -960 960 960"
                            width="24px"
                            fill="currentColor"
                        >
                            <path d="m256-200-56-56 224-224-224-224 56-56 224 224 224-224 56 56-224 224 224 224-56 56-224-224-224 224Z" />
                        </svg>
                    </div>
                </div>

                <div style={croppedImage || gradientPicked} className="edit-profile-hero-section">
                    <div className="profile-edit-image-container">
                        <div className="profile-edit-image-bg">
                            <div onClick={(e) => insertImageFromFile(e)} className="edit-profile-addImage-icon">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    height="34px"
                                    viewBox="0 -960 960 960"
                                    width="34px"
                                    fill="currentColor"
                                >
                                    <path d="M440-440ZM120-120q-33 0-56.5-23.5T40-200v-480q0-33 23.5-56.5T120-760h126l74-80h240v80H355l-73 80H120v480h640v-360h80v360q0 33-23.5 56.5T760-120H120Zm640-560v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80ZM440-260q75 0 127.5-52.5T620-440q0-75-52.5-127.5T440-620q-75 0-127.5 52.5T260-440q0 75 52.5 127.5T440-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29Z" />
                                </svg>
                                <input
                                    onChange={(e) => handleImageOnChange(e)}
                                    ref={inputRef}
                                    type="file"
                                    accept="image/*"
                                    style={{ display: "none" }}
                                />
                            </div>
                        </div>

                        <div className="profile-edit-image-child-container">
                            <img
                                className="my-profile-image-editable"
                                src={editImagePreview || userData?.image_url || "/assets/profile.jpg"}
                                alt={`${userData?.name || "User"} profile picture preview`}
                            />
                        </div>

                        <div onClick={(e) => handleShowGradientPicker(e)} className="add-profile-background">
                            <svg
                                xmlns="http://www.w3.org/2000/svg"
                                height="24px"
                                viewBox="0 -960 960 960"
                                width="24px"
                                fill="currentColor"
                            >
                                <path d="M200-120q-33 0-56.5-23.5T120-200v-240h80v240h240v80H200Zm320 0v-80h240v-240h80v240q0 33-23.5 56.5T760-120H520ZM240-280l120-160 90 120 120-160 150 200H240ZM120-520v-240q0-33 23.5-56.5T200-840h240v80H200v240h-80Zm640 0v-240H520v-80h240q33 0 56.5 23.5T840-760v240h-80Zm-140-40q-26 0-43-17t-17-43q0-26 17-43t43-17q26 0 43 17t17 43q0 26-17 43t-43 17Z" />
                            </svg>
                            Add background
                        </div>
                    </div>

                    <div className="edit-profile-input-name-container">
                        <div className="input-identifier-container">
                            <div className="input-identifier">
                                <p>Name</p>
                            </div>
                            <div className="profile-edit-name-length">
                                <p
                                    style={
                                        profileEditName.length > 19
                                            ? { color: "rgba(255, 29, 29, 0.81)", fontWeight: "850" }
                                            : {}
                                    }
                                >
                                    {profileEditName.length}/20
                                </p>
                            </div>
                        </div>
                        <input
                            maxLength={20}
                            value={profileEditName}
                            onChange={(e) => setProfileEditName(e.target.value)}
                            className="edit-profile-input"
                            type="text"
                        />
                    </div>

                    <div className="edit-profile-input-bio-container">
                        <div className="input-bio-identifier-container">
                            <div className="bio-identifier">
                                <p>Bio</p>
                            </div>

                            <div className="profile-edit-bio-length">
                                <p
                                    style={
                                        profileEditBio.length > 149
                                            ? { color: "rgba(255, 29, 29, 0.81)", fontWeight: "850" }
                                            : {}
                                    }
                                >
                                    {profileEditBio.length}/150
                                </p>
                            </div>
                        </div>
                        <textarea
                            onChange={(e) => setProfileEditBio(e.target.value)}
                            value={profileEditBio}
                            maxLength={150}
                            className="bio-textarea"
                            name="bio"
                            id=""
                        ></textarea>
                    </div>
                </div>

                <div onClick={() => handleSaveProfileEdit()} className="profile-edit-save-bttn">
                    Save
                </div>

                {isSavingProfile && (
                    <BarLoader
                        width={"100%"}
                        loading={isSavingProfile}
                        color="rgb(40, 115, 255)"
                        speedMultiplier={0.7}
                    />
                )}
            </Motion.div>
        </div>
    );
};

export default ProfileEditModal;
