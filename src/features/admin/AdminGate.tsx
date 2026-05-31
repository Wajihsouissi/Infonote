import { useEffect, useState } from 'react';
import { Loader2, ShieldAlert } from 'lucide-react';
import { AdminDashboard } from './AdminDashboard';
import { useStore } from '../../store/useStore';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';

const OWNER_EMAIL = 'mohebawichewi9@gmail.com';

type GateState =
    | { kind: 'checking' }
    | { kind: 'allowed' }
    | { kind: 'denied'; reason: string };

export default function AdminGate() {
    const setCurrentView = useStore((s) => s.setCurrentView);
    const [state, setState] = useState<GateState>({ kind: 'checking' });

    useEffect(() => {
        let cancelled = false;

        const redirectHome = () => {
            window.history.replaceState({}, '', '/');
            setCurrentView('marketing');
        };

        const verifyOwner = async () => {
            if (!isSupabaseConfigured || !supabase) {
                setState({ kind: 'denied', reason: 'Supabase is not configured.' });
                window.setTimeout(redirectHome, 900);
                return;
            }

            const { data: authData, error: authError } = await supabase.auth.getUser();
            const activeUser = authData.user;
            if (cancelled) return;

            if (authError || !activeUser) {
                setState({ kind: 'denied', reason: 'Owner session required.' });
                window.setTimeout(redirectHome, 900);
                return;
            }

            const sessionEmail = activeUser.email ?? '';
            const verifiedEmail = sessionEmail.trim().toLowerCase();

            if (verifiedEmail !== OWNER_EMAIL) {
                setState({ kind: 'denied', reason: 'Owner account required.' });
                window.setTimeout(redirectHome, 900);
                return;
            }

            setState({ kind: 'allowed' });
        };

        void verifyOwner();

        return () => {
            cancelled = true;
        };
    }, [setCurrentView]);

    if (state.kind === 'allowed') {
        return <AdminDashboard ownerEmail={OWNER_EMAIL} />;
    }

    return (
        <div
            style={{
                minHeight: '100vh',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                background: '#f6f4ef',
                color: '#161616',
                fontFamily: '"Poppins", system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif',
                padding: 24,
            }}
        >
            <div
                style={{
                    width: 'min(420px, 100%)',
                    border: '1px solid rgba(22,22,22,0.1)',
                    background: 'rgba(255,255,255,0.78)',
                    boxShadow: '0 18px 60px rgba(20, 20, 20, 0.08)',
                    borderRadius: 12,
                    padding: 28,
                    textAlign: 'center',
                }}
            >
                {state.kind === 'checking' ? (
                    <>
                        <Loader2 size={28} className="animate-spin" style={{ margin: '0 auto 14px', color: '#2563eb' }} />
                        <h1 style={{ fontSize: 18, margin: 0 }}>Verifying owner session</h1>
                        <p style={{ margin: '8px 0 0', color: 'rgba(22,22,22,0.58)', fontSize: 13 }}>
                            Checking the active Supabase profile before opening operations.
                        </p>
                    </>
                ) : (
                    <>
                        <ShieldAlert size={30} style={{ margin: '0 auto 14px', color: '#dc2626' }} />
                        <h1 style={{ fontSize: 18, margin: 0 }}>Access denied</h1>
                        <p style={{ margin: '8px 0 0', color: 'rgba(22,22,22,0.58)', fontSize: 13 }}>
                            {state.reason}
                        </p>
                    </>
                )}
            </div>
        </div>
    );
}
