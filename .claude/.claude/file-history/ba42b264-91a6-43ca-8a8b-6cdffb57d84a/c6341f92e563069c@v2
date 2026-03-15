import React, { useCallback, useEffect, useRef, useState } from "react";
import "./myprofile.css";
import { useAuth } from "../../Context/useAuth";
import { Outlet, useLocation, useNavigate } from "react-router-dom";
import Sidebar from "../SideBar/Sidebar";
import { updateFontColor, updateProfileData } from "../../../API/Api";
import { AnimatePresence } from "framer-motion";
import { useQueryClient } from "@tanstack/react-query";
import Editor from "../HomePage/Editor/Editor";
import getCroppedImage from "../../utils/getCroppedImage";
import extractDominantColors from "../../utils/extractDominantColors";
import MobileNavlink from "../mobileNavLink/MobileNavLink";
import MobileSidebarLink from "../MobileSidebarLink/MobileSidebarLink";
import WriteJournalButton from "../WriteJournalButton/WriteJournalButton";
import Loader from "../loadingComponent/BgLoader";
import ProfileBackgroundPicker from "./components/ProfileBackgroundPicker";
import ProfileEditModal from "./components/ProfileEditModal";
import ProfileFontColorSelector from "./components/ProfileFontColorSelector";
import ProfileHeroSection from "./components/ProfileHeroSection";
import ProfileTabList from "./components/ProfileTabList";
import { PROFILE_GRADIENTS } from "./constants/profileGradients";
import { createProfileSidebarLinks } from "./constants/profileSidebarLinks";
import { PROFILE_TABS } from "./constants/profileTabs";

const MyProfile = () => {
    const { user, session, isLoading, notifCount, loading } = useAuth();

    const userData = user?.userData?.[0];

    const [showMobileSideBar, setShowMobileSideBar] = useState(false);

    const [showProfileEditor, setShowProfileEditor] = useState(false);
    const [editImagePreview, setEditImagePreview] = useState("");
    const [profileEditAvatar, setProfileEditAvatar] = useState(null);
    const [profileEditName, setProfileEditName] = useState("");
    const [profileEditBio, setProfileEditBio] = useState("");

    const [showEditor, setShowEditor] = useState(false);
    const [showBgPicker, setShowBgPicker] = useState(false);

    const [imageSrc, setImageSrc] = useState(null);
    const [crop, setCrop] = useState({ x: 0, y: 0 });
    const [zoom, setZoom] = useState(1);
    const [croppedAreaPixels, setCropAreaPixels] = useState(null);
    const [gradientPicked, setGradientPicked] = useState(null);
    const [croppedImage, setCroppedImage] = useState({});

    const [showFontColorSelector, setShowFontColorSelector] = useState(false);
    const [fontColor, setFontColor] = useState("");

    const inputRef = useRef();
    const bgInputRef = useRef();
    const fontColorInputRef = useRef();

    const [dominantColors, setDominantColors] = useState("#ffffffff");
    const [secondaryColors, setSecondaryColors] = useState("#ffffffff");

    const [isUpdatingFont, setIsUpdatingFont] = useState(false);
    const [isUpdatingProfileConfig, setIsUpdatingProfileConfig] = useState(false);
    const [isSavingProfile, setIsSavingProfile] = useState(false);
    const [saveError, setSaveError] = useState("");

    const navigate = useNavigate();
    const navigatePath = (path) => {
        return navigate(path);
    };
    const location = useLocation();

    const queryClient = useQueryClient();

    const links = createProfileSidebarLinks({
        location,
        navigatePath,
        navigate,
        notifCount,
        setShowEditor,
    });
    const gradients = PROFILE_GRADIENTS;
    const tablists = PROFILE_TABS;

    useEffect(() => {
        setCroppedImage(userData?.background || null);
        setFontColor(userData?.profile_font_color || "");
    }, [userData?.background, userData?.profile_font_color]);

    const showError = (msg) => {
        setSaveError(msg);
        setTimeout(() => setSaveError(""), 4000);
    };

    const openRichTextEditor = () => {
        setShowEditor(true);
    };

    const handleClickOpenSidebar = () => {
        setShowMobileSideBar(true);
    };

    const handleCloseSidebar = () => {
        setShowMobileSideBar(false);
    };

    const handleClickEdit = (e) => {
        e.stopPropagation();
        setShowFontColorSelector(false);
        setEditImagePreview(userData?.image_url);
        setProfileEditName(userData?.name);
        setProfileEditBio(userData?.bio);
        setShowProfileEditor(true);
    };

    const closeEditor = (e) => {
        e.stopPropagation();
        setEditImagePreview("");
        handleHideGradientPicker(e);
        setImageSrc(null);
        setProfileEditAvatar(null);
        setShowProfileEditor(false);
    };

    const handleCloseRichTextEditor = useCallback(() => {
        setShowEditor(false);
    }, []);

    const handleImageOnChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setProfileEditAvatar(file);
            const reader = new FileReader();
            reader.onloadend = () => {
                setEditImagePreview(reader.result);
            };

            reader.readAsDataURL(file);
        } else {
            setEditImagePreview("");
        }
    };

    const insertImageFromFile = (e) => {
        e.stopPropagation();
        if (inputRef.current) {
            inputRef.current.click();
        }
    };

    const handleShowGradientPicker = (e) => {
        e.stopPropagation();
        setShowBgPicker(true);
    };

    const handleHideGradientPicker = (e) => {
        e.stopPropagation();
        setShowBgPicker(false);
        setCroppedImage(userData?.background);
        setImageSrc(null);
        setGradientPicked(null);
    };

    const handleSaveProfileEdit = async () => {
        if (isSavingProfile) return;
        setIsSavingProfile(true);
        const data = {
            name: profileEditName,
            image: profileEditAvatar,
            bio: profileEditBio,
            profileBg: croppedImage,
            dominantColors: dominantColors,
            secondaryColors: secondaryColors,
        };

        try {
            const formdata = new FormData();
            Object.entries(data).forEach(([key, value]) => {
                if (value === undefined || value === null) {
                    return;
                }
                if (typeof value === "object" && value !== null && !(value instanceof File)) {
                    formdata.append(key, JSON.stringify(value));
                    return;
                }

                formdata.append(key, value);
            });

            await updateProfileData(formdata, session?.access_token);
            setProfileEditAvatar(null);
            queryClient.invalidateQueries({ queryKey: ["userData", session?.user?.id] });
            setShowProfileEditor(false);
        } catch {
            showError("Failed to save profile. Please try again.");
        } finally {
            setIsSavingProfile(false);
        }
    };

    const handleSaveProfileConfig = async () => {
        if (isUpdatingProfileConfig) return;
        setIsUpdatingProfileConfig(true);
        try {
            if (imageSrc) {
                const croppedImageUrl = await getCroppedImage(imageSrc, croppedAreaPixels, userData.id, session?.access_token);
                if (croppedImageUrl) {
                    setCroppedImage({
                        backgroundImage: `url(${croppedImageUrl?.url})`,
                        backgroundSize: "cover",
                        backgroundPosition: "center",
                        backgroundRepeat: "no-repeat",
                    });
                }
            } else if (gradientPicked) {
                setCroppedImage(gradientPicked);
            }
            setGradientPicked(null);
            setImageSrc(null);
            setShowBgPicker(false);
            queryClient.invalidateQueries({ queryKey: ["userData", session?.user?.id] });
        } catch {
            showError("Failed to update background. Please try again.");
        } finally {
            setIsUpdatingProfileConfig(false);
        }
    };

    const handleRemoveBgPreview = () => {
        setImageSrc(null);
    };

    const handleSelectGradient = useCallback((gradient) => {
        setCroppedImage(null);
        setImageSrc(null);
        setGradientPicked(gradient);
    }, []);

    const handleInsertBgImage = (e) => {
        e.stopPropagation();
        if (bgInputRef.current) {
            bgInputRef.current.value = "";
            bgInputRef.current.click();
        }
    };

    const handleBgOnchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onloadend = () => {
                const img = new Image();
                img.crossOrigin = "anonymous";

                img.src = reader.result;

                img.onload = () => {
                    const colors = extractDominantColors(img);
                    setDominantColors(colors.primary);
                    setSecondaryColors(colors.secondary);
                };

                setImageSrc(reader.result);
            };

            reader.readAsDataURL(file);
        } else {
            return setGradientPicked({});
        }
    };

    const handleClickFontColorSelector = (e) => {
        e.stopPropagation();
        setShowFontColorSelector(true);
    };

    const handleClickInputColor = () => {
        if (fontColorInputRef.current) {
            fontColorInputRef.current.click();
        }
    };

    const handleClickSaveFontColor = async () => {
        if (isUpdatingFont) return;
        setIsUpdatingFont(true);
        const formdata = new FormData();
        formdata.append("fontColor", fontColor);
        try {
            await updateFontColor(session?.access_token, formdata);
            queryClient.invalidateQueries({ queryKey: ["userData", session?.user?.id] });
            setShowFontColorSelector(false);
        } catch {
            showError("Failed to update font color. Please try again.");
        } finally {
            setIsUpdatingFont(false);
        }
    };

    const handleClickCancelFontSelect = () => {
        setShowFontColorSelector(false);
        setFontColor(userData?.profile_font_color || "");
    };

    useEffect(() => {
        if (!session && !loading) {
            return navigate("/login");
        }
    }, [session, loading, navigate]);

    if (isLoading) {
        return <Loader />;
    }

    return (
        <>
            <ProfileFontColorSelector
                show={showFontColorSelector}
                fontColor={fontColor}
                fontColorInputRef={fontColorInputRef}
                setFontColor={setFontColor}
                handleClickInputColor={handleClickInputColor}
                handleClickCancelFontSelect={handleClickCancelFontSelect}
                handleClickSaveFontColor={handleClickSaveFontColor}
                isUpdatingFont={isUpdatingFont}
            />
            <ProfileBackgroundPicker
                show={showBgPicker}
                handleBgOnchange={handleBgOnchange}
                bgInputRef={bgInputRef}
                gradients={gradients}
                gradientPicked={gradientPicked}
                handleSelectGradient={handleSelectGradient}
                handleInsertBgImage={handleInsertBgImage}
                imageSrc={imageSrc}
                crop={crop}
                zoom={zoom}
                setCrop={setCrop}
                setZoom={setZoom}
                setCropAreaPixels={setCropAreaPixels}
                handleRemoveBgPreview={handleRemoveBgPreview}
                handleHideGradientPicker={handleHideGradientPicker}
                handleSaveProfileConfig={handleSaveProfileConfig}
                isUpdatingProfileConfig={isUpdatingProfileConfig}
            />
            <AnimatePresence>
                <ProfileEditModal
                    key={"profile-edit-modal"}
                    showProfileEditor={showProfileEditor}
                    closeEditor={closeEditor}
                    croppedImage={croppedImage}
                    gradientPicked={gradientPicked}
                    insertImageFromFile={insertImageFromFile}
                    handleImageOnChange={handleImageOnChange}
                    inputRef={inputRef}
                    editImagePreview={editImagePreview}
                    userData={userData}
                    handleShowGradientPicker={handleShowGradientPicker}
                    profileEditName={profileEditName}
                    setProfileEditName={setProfileEditName}
                    profileEditBio={profileEditBio}
                    setProfileEditBio={setProfileEditBio}
                    handleSaveProfileEdit={handleSaveProfileEdit}
                    isSavingProfile={isSavingProfile}
                />

                {showEditor && <Editor key={"main-editor"} onClose={handleCloseRichTextEditor} />}

                <div
                    key={"profile-page-layout"}
                    className="profile-parent-container"
                    style={croppedImage ? { background: `linear-gradient(135deg, ${dominantColors}0%, ${secondaryColors} 100%)` } : gradientPicked}
                >
                    {gradientPicked && <div className="blurred-gradient-bg" style={gradientPicked} />}

                    {croppedImage && <div style={croppedImage} className="blurred-img-bg" />}

                    <div className="side-bar-holder-container">
                        <Sidebar links={links} />
                    </div>

                    <div style={{ color: fontColor || userData?.profile_font_color }} className="profile-center-bar-container">
                        <ProfileHeroSection
                            userData={userData}
                            user={user}
                            fontColor={fontColor}
                            handleClickEdit={handleClickEdit}
                            handleClickFontColorSelector={handleClickFontColorSelector}
                            croppedImage={croppedImage}
                            gradientPicked={gradientPicked}
                        />

                        <ProfileTabList tablists={tablists} navigate={navigate} location={location} />

                        <Outlet />
                    </div>

                    <div className="profile-sidebar-right-holder-container">{/* Log out */}</div>

                    {showMobileSideBar && <MobileSidebarLink onclose={handleCloseSidebar} />}

                    <MobileNavlink clickOpenSidebar={handleClickOpenSidebar} />
                    <WriteJournalButton onOpen={openRichTextEditor} />
                </div>
            </AnimatePresence>

            {saveError && (
                <div key={saveError} className="profile-save-error-toast">
                    {saveError}
                </div>
            )}
        </>
    );
};

export default MyProfile;

