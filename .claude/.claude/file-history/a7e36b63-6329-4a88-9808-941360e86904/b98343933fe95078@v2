import { useState } from 'react';
import { useAuth } from '../../Context/useAuth.js';
import supabase from '../../utils/supabaseClient.js';
import { useNavigate, useSearchParams } from 'react-router-dom';
import './SettingsPage.css';

const SettingsPage = () => {
    const { session } = useAuth();
    const navigate = useNavigate();
    const [searchParams, setSearchParams] = useSearchParams();
    const isRecovery = searchParams.get('recovery') === 'true';

    // Password state
    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [showCurrentPass, setShowCurrentPass] = useState(false);
    const [showNewPass, setShowNewPass] = useState(false);
    const [passwordLoading, setPasswordLoading] = useState(false);
    const [passwordError, setPasswordError] = useState('');
    const [passwordSuccess, setPasswordSuccess] = useState('');

    // Email state
    const [newEmail, setNewEmail] = useState('');
    const [emailLoading, setEmailLoading] = useState(false);
    const [emailError, setEmailError] = useState('');
    const [emailSuccess, setEmailSuccess] = useState('');

    const handleChangePassword = async (e) => {
        e.preventDefault();
        setPasswordError('');
        setPasswordSuccess('');

        if (newPassword.length < 6) {
            return setPasswordError('New password must be at least 6 characters.');
        }
        if (newPassword !== confirmPassword) {
            return setPasswordError('Passwords do not match.');
        }

        setPasswordLoading(true);
        try {
            if (!isRecovery) {
                // Verify current password
                const { error: signInError } = await supabase.auth.signInWithPassword({
                    email: session.user.email,
                    password: currentPassword,
                });
                if (signInError) {
                    setPasswordLoading(false);
                    return setPasswordError('Current password is incorrect.');
                }
            }

            // Update to new password
            const { error: updateError } = await supabase.auth.updateUser({
                password: newPassword,
            });
            if (updateError) {
                setPasswordLoading(false);
                return setPasswordError(updateError.message);
            }

            setPasswordSuccess('Password updated successfully.');
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');

            // Clear recovery param from URL
            if (isRecovery) {
                searchParams.delete('recovery');
                setSearchParams(searchParams, { replace: true });
            }
        } catch (err) {
            setPasswordError('Something went wrong. Please try again.');
        } finally {
            setPasswordLoading(false);
        }
    };

    const handleChangeEmail = async (e) => {
        e.preventDefault();
        setEmailError('');
        setEmailSuccess('');

        if (!newEmail || !newEmail.includes('@')) {
            return setEmailError('Please enter a valid email address.');
        }
        if (newEmail === session.user.email) {
            return setEmailError('This is already your current email.');
        }

        setEmailLoading(true);
        try {
            const { error } = await supabase.auth.updateUser({
                email: newEmail,
            });
            if (error) {
                setEmailLoading(false);
                return setEmailError(error.message);
            }

            setEmailSuccess('Confirmation email sent to ' + newEmail + '. Please check your inbox.');
            setNewEmail('');
        } catch (err) {
            setEmailError('Something went wrong. Please try again.');
        } finally {
            setEmailLoading(false);
        }
    };

    if (!session) {
        return null;
    }

    const isPasswordDisabled = (!isRecovery && !currentPassword) || !newPassword || !confirmPassword || passwordLoading;
    const isEmailDisabled = !newEmail || emailLoading;

    return (
        <div className="settings-page">
            <div className="settings-header">
                <button className="settings-back-btn" onClick={() => navigate(-1)} aria-label="Go back">
                    <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M19 12H5"/>
                        <path d="M12 19l-7-7 7-7"/>
                    </svg>
                </button>
                <h1 className="settings-title">Settings</h1>
            </div>

            {/* Change Password Section */}
            <section className="settings-section">
                <h2 className="settings-section-title">
                    {isRecovery ? 'Set New Password' : 'Change Password'}
                </h2>
                <form className="settings-form" onSubmit={handleChangePassword}>
                    {!isRecovery && (
                        <div className="settings-field">
                            <label htmlFor="current-password">Current Password</label>
                            <div className="input-with-action">
                                <input
                                    id="current-password"
                                    type={showCurrentPass ? 'text' : 'password'}
                                    value={currentPassword}
                                    onChange={(e) => setCurrentPassword(e.target.value)}
                                    placeholder="Enter current password"
                                    className="auth-input"
                                    autoComplete="current-password"
                                />
                                <button
                                    className="show-toggle"
                                    type="button"
                                    onClick={() => setShowCurrentPass((p) => !p)}
                                >
                                    {showCurrentPass ? 'Hide' : 'Show'}
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="settings-field">
                        <label htmlFor="new-password">New Password</label>
                        <div className="input-with-action">
                            <input
                                id="new-password"
                                type={showNewPass ? 'text' : 'password'}
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                placeholder="At least 6 characters"
                                className="auth-input"
                                autoComplete="new-password"
                            />
                            <button
                                className="show-toggle"
                                type="button"
                                onClick={() => setShowNewPass((p) => !p)}
                            >
                                {showNewPass ? 'Hide' : 'Show'}
                            </button>
                        </div>
                    </div>

                    <div className="settings-field">
                        <label htmlFor="confirm-password">Confirm New Password</label>
                        <input
                            id="confirm-password"
                            type="password"
                            value={confirmPassword}
                            onChange={(e) => setConfirmPassword(e.target.value)}
                            placeholder="Re-enter new password"
                            className="auth-input"
                            autoComplete="new-password"
                        />
                    </div>

                    <button className="primary-button" type="submit" disabled={isPasswordDisabled}>
                        <span className="button-label">{isRecovery ? 'Set New Password' : 'Update Password'}</span>
                        {passwordLoading && <span className="button-spinner" aria-hidden="true" />}
                    </button>
                </form>

                {passwordError && (
                    <div className="form-message error" role="alert">{passwordError}</div>
                )}
                {passwordSuccess && (
                    <div className="form-message success" role="status">{passwordSuccess}</div>
                )}
            </section>

            {/* Change Email Section */}
            <section className="settings-section">
                <h2 className="settings-section-title">Change Email</h2>
                <p className="settings-current-value">
                    Current email: <strong>{session.user.email}</strong>
                </p>
                <form className="settings-form" onSubmit={handleChangeEmail}>
                    <div className="settings-field">
                        <label htmlFor="new-email">New Email</label>
                        <input
                            id="new-email"
                            type="email"
                            value={newEmail}
                            onChange={(e) => setNewEmail(e.target.value)}
                            placeholder="you@example.com"
                            className="auth-input"
                            autoComplete="email"
                        />
                    </div>

                    <button className="primary-button" type="submit" disabled={isEmailDisabled}>
                        <span className="button-label">Send Confirmation Email</span>
                        {emailLoading && <span className="button-spinner" aria-hidden="true" />}
                    </button>
                </form>

                {emailError && (
                    <div className="form-message error" role="alert">{emailError}</div>
                )}
                {emailSuccess && (
                    <div className="form-message success" role="status">{emailSuccess}</div>
                )}
            </section>
        </div>
    );
};

export default SettingsPage;
