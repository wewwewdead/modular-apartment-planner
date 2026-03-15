import React from "react";
import { AnimatePresence, motion as Motion } from "framer-motion";
import { BarLoader } from "react-spinners";

const ProfileFontColorSelector = ({
    show,
    fontColor,
    fontColorInputRef,
    setFontColor,
    handleClickInputColor,
    hancleClickCancelFontSelect,
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
                initial={{ scale: 0, opacity: 0.8 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.8, opacity: 0 }}
                transition={{ type: "spring", stiffness: 250, damping: 25 }}
            >
                <div
                    onClick={() => handleClickInputColor()}
                    style={{ background: `${fontColor}` }}
                    className="input-color"
                ></div>
                <input
                    ref={fontColorInputRef}
                    value={fontColor}
                    onChange={(e) => setFontColor(e.target.value)}
                    style={{ display: "none" }}
                    type="color"
                />
                <div className="save-font-color-bttn-container">
                    <div className="cancel-button" onClick={() => hancleClickCancelFontSelect()}>
                        Cancel
                    </div>
                    <div className="save-button" onClick={() => handleClickSaveFontColor()}>
                        Save
                    </div>
                </div>

                {isUpdatingFont && (
                    <BarLoader
                        loading={isUpdatingFont}
                        width={"100%"}
                        color="rgb(40, 115, 255)"
                        speedMultiplier={0.7}
                    />
                )}
            </Motion.div>
        </AnimatePresence>
    );
};

export default ProfileFontColorSelector;
