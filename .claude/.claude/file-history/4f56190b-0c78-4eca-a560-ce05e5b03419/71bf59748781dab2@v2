import { Link } from 'react-router-dom';

const NotFound = () => {
    return (
        <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '100vh',
            padding: '2rem',
            textAlign: 'center',
            fontFamily: 'var(--font-body, sans-serif)',
            color: 'var(--text-primary, #333)',
        }}>
            <h1 style={{ fontSize: '4rem', marginBottom: '0.5rem' }}>404</h1>
            <p style={{ fontSize: '1.2rem', marginBottom: '1.5rem', color: 'var(--text-secondary, #666)' }}>
                This page doesn't exist.
            </p>
            <Link to="/home" style={{
                padding: '0.75rem 1.5rem',
                borderRadius: '8px',
                background: 'var(--accent-color, #d4a853)',
                color: '#fff',
                textDecoration: 'none',
                fontWeight: 600,
            }}>
                Go home
            </Link>
        </div>
    );
};

export default NotFound;
