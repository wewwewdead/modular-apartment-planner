import { useRef } from 'react';
import { motion } from 'framer-motion';

const ProfileSetupStep = ({
    goNext,
    goBack,
    name,
    setName,
    bio,
    setBio,
    setupUsername,
    setSetupUsername,
    usernameAvailable,
    usernameChecking,
    profilePreview,
    setProfilePreview,
    imageFile,
    setImageFile,
    checkUsernameDebounced,
    submitting,
    onSubmitProfile,
}) => {
    const imgRef = useRef(null);

    const slugifyForUsername = (val) =>
        String(val || '').toLowerCase().trim()
            .replace(/[^a-z0-9\s-]/g, '')
            .replace(/\s+/g, '-')
            .replace(/-+/g, '-')
            .replace(/^-|-$/g, '');

    const handleClickUploadPhoto = (e) => {
        e.stopPropagation();
        imgRef.current?.click();
    };

    const handleImageChange = (e) => {
        const file = e.target.files[0];
        if (file) {
            setImageFile(file);
            const reader = new FileReader();
            reader.onloadend = () => setProfilePreview(reader.result);
            reader.readAsDataURL(file);
        }
    };

    const handleNameChange = (e) => {
        const newName = e.target.value;
        setName(newName);
        if (!setupUsername || setupUsername === slugifyForUsername(name)) {
            const suggested = slugifyForUsername(newName);
            setSetupUsername(suggested);
            checkUsernameDebounced(suggested);
        }
    };

    const handleUsernameChange = (e) => {
        const raw = e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '');
        setSetupUsername(raw);
        checkUsernameDebounced(raw);
    };

    const handleContinue = async (e) => {
        e.preventDefault();
        const success = await onSubmitProfile();
        if (success) goNext();
    };

    const isValid = name?.trim() && bio?.trim();

    return (
        <div className="onboarding-step profile-setup-step">
            <button className="onboarding-back-btn" onClick={goBack} type="button">
                <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <polyline points="15 18 9 12 15 6" />
                </svg>
            </button>

            <h2 className="onboarding-step-title">Set up your profile</h2>
            <p className="onboarding-step-subtitle">Tell the world who you are.</p>

            <div className="profile-setup-avatar-container">
                <div onClick={handleClickUploadPhoto} className="profile-setup-avatar-wrapper">
                    <img
                        className="profile-setup-avatar-img"
                        src={profilePreview || '/assets/profile.jpg'}
                        alt="Profile"
                    />
                    <div className="profile-setup-avatar-overlay">
                        <svg xmlns="http://www.w3.org/2000/svg" height="24px" viewBox="0 -960 960 960" width="24px" fill="#FFFFFF">
                            <path d="M480-260q75 0 127.5-52.5T660-440q0-75-52.5-127.5T480-620q-75 0-127.5 52.5T300-440q0 75 52.5 127.5T480-260Zm0-80q-42 0-71-29t-29-71q0-42 29-71t71-29q42 0 71 29t29 71q0 42-29 71t-71 29ZM160-120q-33 0-56.5-23.5T80-200v-480q0-33 23.5-56.5T160-760h126l74-80h240l74 80h126q33 0 56.5 23.5T880-680v480q0 33-23.5 56.5T800-120H160Zm0-80h640v-480H638l-73-80H395l-73 80H160v480Zm320-240Z" />
                        </svg>
                    </div>
                </div>
                <input
                    ref={imgRef}
                    type="file"
                    accept="image/*"
                    onChange={handleImageChange}
                    style={{ display: 'none' }}
                />
            </div>

            <form className="profile-setup-form" onSubmit={handleContinue}>
                <div className="onboarding-field">
                    <div className="onboarding-field-header">
                        <label className="onboarding-field-label">Name</label>
                        <span className="onboarding-field-count" style={name?.length > 19 ? { color: 'var(--color-danger)' } : {}}>
                            {name?.length || 0}/20
                        </span>
                    </div>
                    <input
                        value={name}
                        maxLength={20}
                        onChange={handleNameChange}
                        className="onboarding-input"
                        type="text"
                        placeholder="Your name"
                    />
                </div>

                <div className="onboarding-field">
                    <div className="onboarding-field-header">
                        <label className="onboarding-field-label">Bio</label>
                        <span className="onboarding-field-count" style={bio?.length > 149 ? { color: 'var(--color-danger)' } : {}}>
                            {bio?.length || 0}/150
                        </span>
                    </div>
                    <textarea
                        value={bio}
                        maxLength={150}
                        onChange={(e) => setBio(e.target.value)}
                        className="onboarding-textarea"
                        placeholder="A few words about you..."
                    />
                </div>

                <div className="onboarding-field">
                    <div className="onboarding-field-header">
                        <label className="onboarding-field-label">Username</label>
                        <span className={`onboarding-field-status ${usernameChecking ? 'checking' : usernameAvailable === true ? 'available' : usernameAvailable === false ? 'taken' : ''}`}>
                            {usernameChecking ? 'Checking...' : usernameAvailable === true ? '\u2713 Available' : usernameAvailable === false ? '\u2717 Taken' : ''}
                        </span>
                    </div>
                    <input
                        value={setupUsername}
                        maxLength={50}
                        onChange={handleUsernameChange}
                        className="onboarding-input"
                        type="text"
                        placeholder="e.g. john-doe"
                    />
                </div>

                <motion.button
                    type="submit"
                    className="onboarding-cta-primary"
                    disabled={!isValid || submitting}
                    whileHover={isValid ? { scale: 1.02 } : {}}
                    whileTap={isValid ? { scale: 0.98 } : {}}
                >
                    {submitting ? 'Saving...' : 'Continue'}
                </motion.button>
            </form>
        </div>
    );
};

export default ProfileSetupStep;
