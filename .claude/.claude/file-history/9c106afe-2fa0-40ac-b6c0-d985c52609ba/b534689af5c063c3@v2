import React from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { BarLoader } from "react-spinners";
import Cropper from "react-easy-crop";

const ProfileBackgroundPicker = ({
    show,
    handleBgOnchange,
    bgInputRef,
    gradients,
    gradientPicked,
    handleSelectGradient,
    handleInsertBgImage,
    imageSrc,
    crop,
    zoom,
    setCrop,
    setZoom,
    setCropAreaPixels,
    handleRemoveBgPreview,
    handleHideGradientPicker,
    handleSaveProfileConfig,
    isUpdatingProfileConfig,
}) => {
    if (!show) {
        return null;
    }

    return (
        <AnimatePresence>
            <Motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                transition={{ type: "spring", stiffness: 250, damping: 25 }}
                className="profile-bg-picker-container"
            >
                <div className="profile-bg-picker-header">Pick a gradient or add image</div>

                <input
                    onChange={(e) => handleBgOnchange(e)}
                    style={{ display: "none" }}
                    ref={bgInputRef}
                    type="file"
                    accept="image/*"
                />

                <div className="profile-bg-color-palette">
                    {gradients.map((gradient, index) => {
                        const isSelected =
                            gradientPicked &&
                            JSON.stringify(gradientPicked) === JSON.stringify(gradient.style);
                        return (
                            <div
                                onClick={() => handleSelectGradient(gradient.style)}
                                key={index}
                                className={`gradient-box${isSelected ? " gradient-selected" : ""}`}
                                style={gradient.style}
                            ></div>
                        );
                    })}
                </div>

                <div className="profile-bg-preview">
                    <div onClick={(e) => handleInsertBgImage(e)} className="add-bgImage-bttn">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            height="50px"
                            viewBox="0 -960 960 960"
                            width="50px"
                            fill="currentColor"
                        >
                            <path d="M480-480ZM200-120q-33 0-56.5-23.5T120-200v-560q0-33 23.5-56.5T200-840h320v80H200v560h560v-320h80v320q0 33-23.5 56.5T760-120H200Zm40-160h480L570-480 450-320l-90-120-120 160Zm440-320v-80h-80v-80h80v-80h80v80h80v80h-80v80h-80Z" />
                        </svg>
                    </div>
                    {imageSrc && (
                        <>
                            <Cropper
                                image={imageSrc}
                                crop={crop}
                                zoom={zoom}
                                aspect={16 / 9}
                                onCropChange={setCrop}
                                onZoomChange={setZoom}
                                onCropComplete={(_, croppedPixels) => setCropAreaPixels(croppedPixels)}
                            />
                            <div className="controls">
                                <input
                                    type="range"
                                    min={1}
                                    max={3}
                                    step={0.1}
                                    value={zoom}
                                    onChange={(e) => setZoom(e.target.value)}
                                />
                            </div>
                            <div onClick={() => handleRemoveBgPreview()} className="remove-bg-preview">
                                <svg
                                    xmlns="http://www.w3.org/2000/svg"
                                    height="24px"
                                    viewBox="0 -960 960 960"
                                    width="24px"
                                    fill="currentColor"
                                >
                                    <path d="m336-280-56-56 144-144-144-143 56-56 144 144 143-144 56 56-144 143 144 144-56 56-143-144-144 144Z" />
                                </svg>
                            </div>
                        </>
                    )}
                </div>

                <div className="cancel-save-container">
                    <div onClick={(e) => handleHideGradientPicker(e)} className="cancel-button">
                        Cancel
                    </div>
                    <div
                        onClick={() => handleSaveProfileConfig()}
                        className={`save-button${isUpdatingProfileConfig ? " is-saving" : ""}`}
                    >
                        {isUpdatingProfileConfig ? "Saving..." : "Save"}
                    </div>
                </div>

                {isUpdatingProfileConfig && (
                    <BarLoader
                        loading={isUpdatingProfileConfig}
                        width={"100%"}
                        color="var(--accent-purple)"
                        speedMultiplier={0.7}
                    />
                )}
            </Motion.div>
        </AnimatePresence>
    );
};

export default ProfileBackgroundPicker;
