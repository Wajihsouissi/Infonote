import { useState, useCallback } from 'react';
import { AdminDashboard } from './AdminDashboard';

const ADMIN_SESSION_KEY = 'infonote_admin_session';

// Admin credentials (in production, these would be server-validated)
const ADMIN_USERNAME = 'owner';
const ADMIN_PASSWORD = 'Inf0note$ecure2024!';

export default function AdminGate() {
    const [authenticated, setAuthenticated] = useState(() => {
        return sessionStorage.getItem(ADMIN_SESSION_KEY) === 'active';
    });
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [error, setError] = useState('');

    const handleLogin = useCallback((e: React.FormEvent) => {
        e.preventDefault();
        if (username === ADMIN_USERNAME && password === ADMIN_PASSWORD) {
            sessionStorage.setItem(ADMIN_SESSION_KEY, 'active');
            setAuthenticated(true);
            setError('');
        } else {
            setError('Invalid credentials');
            setPassword('');
        }
    }, [username, password]);

    if (authenticated) {
        return <AdminDashboard />;
    }

    return (
        <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            height: '100vh',
            background: '#0a0a0f',
        }}>
            <form onSubmit={handleLogin} style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                padding: '32px',
                borderRadius: '12px',
                background: '#1a1a2e',
                border: '1px solid #2a2a3e',
                width: '320px',
            }}>
                <h2 style={{ color: '#fff', margin: 0, fontSize: '18px', textAlign: 'center' }}>
                    System Access
                </h2>
                {error && (
                    <p style={{ color: '#ef4444', margin: 0, fontSize: '13px', textAlign: 'center' }}>
                        {error}
                    </p>
                )}
                <input
                    type="text"
                    placeholder="Username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    autoComplete="off"
                    style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #3a3a4e',
                        background: '#0f0f1a',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none',
                    }}
                />
                <input
                    type="password"
                    placeholder="Password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoComplete="off"
                    style={{
                        padding: '10px 12px',
                        borderRadius: '8px',
                        border: '1px solid #3a3a4e',
                        background: '#0f0f1a',
                        color: '#fff',
                        fontSize: '14px',
                        outline: 'none',
                    }}
                />
                <button type="submit" style={{
                    padding: '10px',
                    borderRadius: '8px',
                    border: 'none',
                    background: '#7c3aed',
                    color: '#fff',
                    fontSize: '14px',
                    fontWeight: 600,
                    cursor: 'pointer',
                    marginTop: '4px',
                }}>
                    Authenticate
                </button>
            </form>
        </div>
    );
}
