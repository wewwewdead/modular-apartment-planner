import React from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { BarLoader } from "react-spinners";

const ProfileFontColorSelector = ({
    show,
    fontColor,
    fontColorInputRef,
    setFontColor,
    handleClickInputColor,
    handleClickCancelFontSelect,
    handleClickSaveFontColor,
    isUpdatingFont,
}) => {
    if (!show) {
        return null;
    }

    return (
        <AnimatePresence>
            <Motion.div
                className="font-selector-container"
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.95, opacity: 0, y: 10 }}
                transition={{ type: "spring", stiffness: 250, damping: 25 }}
            >
                <div
                    onClick={() => handleClickInputColor()}
                    style={{ background: `${fontColor}` }}
                    className="input-color"
                ></div>
                <div className="font-color-hex-label">{fontColor || "No color"}</div>
                <input
                    ref={fontColorInputRef}
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    style={{ display: "none" }}
                    type="color"
                />
                <div className="save-font-color-bttn-container">
                    <div className="cancel-button" onClick={() => handleClickCancelFontSelect()}>
                        Cancel
                    </div>
                    <div
                        className={`save-button${isUpdatingFont ? " is-saving" : ""}`}
                        onClick={() => handleClickSaveFontColor()}
                    >
                        {isUpdatingFont ? "Saving..." : "Save"}
                    </div>
                </div>

                {isUpdatingFont && (
                    <BarLoader
                        loading={isUpdatingFont}
                        width={"100%"}
                        color="var(--accent-purple)"
                        speedMultiplier={0.7}
                    />
                )}
            </Motion.div>
        </AnimatePresence>
    );
};

export default ProfileFontColorSelector;
