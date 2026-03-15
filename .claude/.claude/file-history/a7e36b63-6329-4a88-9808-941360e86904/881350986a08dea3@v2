import './login.css';
import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from '../../Context/useAuth.js';
import supabase from '../../utils/supabaseClient.js';

const LoginPage = () => {
    const [showPass, setShowPass] = useState(false);
    const [password, setPassword] = useState('');
    const [email, setEmail] = useState('');
    const [errorMessage, setErrorMessage] = useState('');
    const [successMessage, setSuccessMessage] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [forgotMode, setForgotMode] = useState(false);

    const { session } = useAuth();
    const navigate = useNavigate();

    const handleShowPass = (e) => {
        e.preventDefault();
        setShowPass((prev) => !prev);
    };

    const handleNavigate = (e) => {
        e.preventDefault();
        navigate('/signUp');
    };

    const handleLogin = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.signInWithPassword({ email, password });
            if (error) {
                setIsLoading(false);
                return setErrorMessage(error.message);
            }
            setSuccessMessage('Signed in. Redirecting...');
            setTimeout(() => navigate('/home'), 600);
        } catch (error) {
            console.error('Error during sign-in:', error.message);
            setErrorMessage(error.message);
            setIsLoading(false);
        }
    };

    const handleForgotPassword = async (e) => {
        e.preventDefault();
        setErrorMessage('');
        setSuccessMessage('');
        setIsLoading(true);
        try {
            const { error } = await supabase.auth.resetPasswordForEmail(email, {
                redirectTo: window.location.origin + '/home/settings?recovery=true',
            });
            if (error) {
                setIsLoading(false);
                return setErrorMessage(error.message);
            }
            setSuccessMessage('Check your email for a password reset link.');
        } catch (error) {
            console.error('Error sending reset email:', error.message);
            setErrorMessage(error.message);
        } finally {
            setIsLoading(false);
        }
    };

    const toggleForgotMode = () => {
        setForgotMode((prev) => !prev);
        setErrorMessage('');
        setSuccessMessage('');
    };

    useEffect(() => {
        if (session) {
            navigate('/home');
        }
    }, [session, navigate]);

    const isSubmitDisabled = forgotMode ? !email || isLoading : !email || !password || isLoading;

    return (
        <div className='auth-shell login-shell'>
            <section className='auth-panel'>
                <div className='brand'>Iskrib</div>
                <h1 className='panel-title'>A calm place to write, reflect, and share.</h1>
                <p className='panel-copy'>
                    Keep your thoughts in one quiet space. Publish when you are ready.
                </p>
                <div className='panel-details'>
                    Minimalist editor · Private drafts · Thoughtful community
                </div>
            </section>

            <section className='auth-form-panel'>
                <div className='auth-form-card'>
                    <header>
                        <h2 className='form-title'>
                            {forgotMode ? 'Reset your password' : 'Welcome back'}
                        </h2>
                        <p className='form-subtitle'>
                            {forgotMode
                                ? "Enter your email and we'll send a reset link."
                                : 'Sign in to continue your writing journey.'}
                        </p>
                    </header>

                    {forgotMode ? (
                        <form className='auth-form' onSubmit={handleForgotPassword} aria-busy={isLoading ? 'true' : 'false'}>
                            <div className='form-field'>
                                <label htmlFor='login-email'>Email</label>
                                <input
                                    id='login-email'
                                    type='email'
                                    autoComplete='email'
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder='you@example.com'
                                    className='auth-input'
                                    required
                                />
                            </div>

                            <button className='primary-button' type='submit' disabled={isSubmitDisabled}>
                                <span className='button-label'>Send Reset Link</span>
                                {isLoading && <span className='button-spinner' aria-hidden='true' />}
                            </button>

                            <button
                                className='link-button'
                                type='button'
                                onClick={toggleForgotMode}
                            >
                                Back to login
                            </button>
                        </form>
                    ) : (
                        <form className='auth-form' onSubmit={handleLogin} aria-busy={isLoading ? 'true' : 'false'}>
                            <div className='form-field'>
                                <label htmlFor='login-email'>Email</label>
                                <input
                                    id='login-email'
                                    type='email'
                                    autoComplete='email'
                                    value={email}
                                    onChange={(e) => setEmail(e.target.value)}
                                    placeholder='you@example.com'
                                    className='auth-input'
                                    required
                                />
                            </div>

                            <div className='form-field'>
                                <div className='forgot-password-row'>
                                    <label htmlFor='login-password'>Password</label>
                                    <button
                                        className='link-button'
                                        type='button'
                                        onClick={toggleForgotMode}
                                    >
                                        Forgot password?
                                    </button>
                                </div>
                                <div className='input-with-action'>
                                    <input
                                        id='login-password'
                                        type={showPass ? 'text' : 'password'}
                                        autoComplete='current-password'
                                        value={password}
                                        onChange={(e) => setPassword(e.target.value)}
                                        placeholder='Enter your password'
                                        className='auth-input'
                                        required
                                    />
                                    <button
                                        className='show-toggle'
                                        type='button'
                                        onClick={handleShowPass}
                                        aria-label={showPass ? 'Hide password' : 'Show password'}
                                    >
                                        {showPass ? 'Hide' : 'Show'}
                                    </button>
                                </div>
                            </div>

                            <button className='primary-button' type='submit' disabled={isSubmitDisabled}>
                                <span className='button-label'>Log in</span>
                                {isLoading && <span className='button-spinner' aria-hidden='true' />}
                            </button>

                            <button
                                className='secondary-button'
                                type='button'
                                onClick={() => navigate('/home')}
                                disabled={isLoading}
                            >
                                Explore Iskrib
                            </button>
                        </form>
                    )}

                    <footer className='auth-footer'>
                        <span>Don&apos;t have an account?</span>
                        <button className='link-button' type='button' onClick={handleNavigate}>
                            Sign up
                        </button>
                    </footer>

                    {errorMessage && (
                        <div className='form-message error' role='alert'>
                            {errorMessage}
                        </div>
                    )}

                    {successMessage && (
                        <div className='form-message success' role='status'>
                            {successMessage}
                        </div>
                    )}
                </div>
            </section>
        </div>
    );
};

export default LoginPage;
