import React, { useState } from 'react';
import { Rocket, Mail, Lock, Eye, EyeOff, User, ArrowLeft, LogIn, Zap, GitBranch, Layers, Loader2, AlertCircle } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import styles from './AuthPage.module.css';

export const LoginPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const hasEnteredApp = useStore((state) => state.hasEnteredApp);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();
    if (!cleanEmail || !cleanPassword) {
      setError('Email and password are required.');
      return;
    }
    if (cleanPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    
    setLoading(true);
    setError(null);
    
    // ── MOCK AUTH FLOW ──
    if (!isSupabaseConfigured) {
      setTimeout(() => {
        try {
          // Pre-populate standard demo accounts
          const defaultUsers = [
            { id: 'demo-user-id', email: 'demo@infonote.com', password: 'password123', displayName: 'Demo User' },
            { id: 'guest-user-id', email: 'guest@infonote.com', password: 'password', displayName: 'Infonote Guest' }
          ];

          // Fetch mock users from localStorage
          const localUsersRaw = localStorage.getItem('infonote-mock-users');
          const localUsers = localUsersRaw ? JSON.parse(localUsersRaw) : [];
          
          const allUsers = [...defaultUsers, ...localUsers];
          const matchedUser = allUsers.find(u => u.email.toLowerCase() === email.toLowerCase());

          if (!matchedUser) {
            throw new Error('No account found with this email. Please sign up first!');
          }

          if (matchedUser.password !== password) {
            throw new Error('Incorrect password. Please try again!');
          }

          // Create mock session
          const sessionUser = {
            id: matchedUser.id,
            email: matchedUser.email,
            displayName: matchedUser.displayName
          };

          localStorage.setItem('infonote-mock-session', JSON.stringify(sessionUser));
          
          // Set user in Zustand store
          useStore.getState().setAuthUser({
            id: sessionUser.id,
            email: sessionUser.email,
            displayName: sessionUser.displayName
          });

          // Trigger view update
          setCurrentView('canvas');
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        } finally {
          setLoading(false);
        }
      }, 800); // 800ms loading feeling for high-fidelity response
      return;
    }
    
    try {
      const { error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (signInError) throw signInError;
      setCurrentView('canvas');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'facebook') => {
    try {
      const { error: oauthError } = await supabase.auth.signInWithOAuth({ provider });
      if (oauthError) throw oauthError;
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className={styles.shell}>

      {/* ── LEFT PANEL ── */}
      <div className={styles.leftPanel}>
        <div className={styles.gridDots} />

        {/* Left Header with Back Button and Logo */}
        <div className={styles.leftHeader}>
          {hasEnteredApp && (
            <button className={styles.backButton} onClick={() => setCurrentView('landing')}>
              <ArrowLeft size={14} />
              Back to home
            </button>
          )}
          <div className={styles.leftLogo}>
            <Rocket size={22} className={styles.leftLogoIcon} />
            <span>Infonote</span>
          </div>
        </div>

        {/* Hero content */}
        <div className={styles.leftHero}>
          <div className={styles.leftHeroTag}>
            <span />
            Trusted by teams worldwide
          </div>
          <h2 className={styles.leftHeadline}>
            Think visually,<br />
            <span className={styles.leftHeadlineGrad}>build brilliantly.</span>
          </h2>
          <p className={styles.leftSubtext}>
            Infonote is your infinite canvas for ideas. Connect thoughts, structure knowledge, and collaborate in real time.
          </p>
          <div className={styles.leftFeatures}>
            <div className={styles.leftFeature}>
              <div className={styles.leftFeatureDot}><Zap size={13} /></div>
              Infinite canvas with smart blocks
            </div>
            <div className={styles.leftFeature}>
              <div className={styles.leftFeatureDot}><GitBranch size={13} /></div>
              Real-time collaboration
            </div>
            <div className={styles.leftFeature}>
              <div className={styles.leftFeatureDot}><Layers size={13} /></div>
              100+ templates in marketplace
            </div>
          </div>
        </div>

        {/* Social proof */}
        <div className={styles.leftFooter}>
          <div className={styles.leftAvatars}>
            <div className={styles.leftAvatar}>J</div>
            <div className={styles.leftAvatar}>A</div>
            <div className={styles.leftAvatar}>M</div>
            <div className={styles.leftAvatar}>R</div>
          </div>
          <div className={styles.leftProofText}>
            <strong>4,200+ teams</strong> already organising<br />their thoughts with Infonote
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          {/* Header */}
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Welcome back</h1>
            <p className={styles.subtitle}>Sign in to your account to continue.</p>
          </div>

          {/* Social login */}
          <div className={styles.socialGroup}>
            <button className={styles.socialButton} onClick={() => handleOAuth('google')}>
              <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button className={styles.socialButton} onClick={() => handleOAuth('facebook')}>
              <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
              </svg>
              Facebook
            </button>
          </div>

          {/* Divider */}
          <div className={styles.divider}>or continue with email</div>

          {/* Error display */}
          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}

          {/* Form */}
          <form className={styles.form} onSubmit={handleLogin}>
            <div className={styles.fieldGroup}>
              <label htmlFor="login-email">Email address</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Mail size={14} /></span>
                <input
                  id="login-email"
                  type="email"
                  className={styles.input}
                  placeholder="you@example.com"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="login-password">Password</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Lock size={14} /></span>
                <input
                  id="login-password"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  placeholder="••••••••"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className={styles.eyeButton}
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <button type="button" className={styles.forgotLink}>
              Forgot your password?
            </button>

            <button type="submit" className={styles.submitButton} disabled={loading || !email || !password}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <LogIn size={15} />}
              Sign in
            </button>

            {!hasEnteredApp && (
              <button
                type="button"
                className={styles.guestButton}
                onClick={() => setCurrentView('landing')}
              >
                <User size={15} />
                Continue as guest
              </button>
            )}
          </form>

          <p className={styles.footer}>
            Don't have an account?
            <button className={styles.switchLink} onClick={() => setCurrentView('signup')}>
              Create one
            </button>
          </p>
        </div>
      </div>

    </div>
  );
};
