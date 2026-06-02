/**
 * LoginPage — real Supabase email/password and OAuth authentication.
 *
 * No mock data, no localStorage shortcuts. All credentials are validated
 * against the live Supabase Auth backend. Session persistence is handled
 * by the Supabase client (localStorage token) plus AuthProvider's
 * onAuthStateChange subscription.
 */
import React, { useState } from 'react';
import { Mail, Lock, Eye, EyeOff, User, ArrowLeft, LogIn, Zap, GitBranch, Layers, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { supabase, isSupabaseConfigured, getOAuthRedirectUrl } from '../../services/supabase/client';
import { connectNotion } from '../../services/notion/notionImport';
import { activateAuthenticatedSession, getActiveSession, getFriendlyAuthError, isEmailRegistered } from './authFlow';
import styles from './AuthPage.module.css';

export const LoginPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const hasEnteredApp = useStore((state) => state.hasEnteredApp);
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isSupabaseConfigured || !supabase) {
      setError('Authentication is not configured. Please contact the administrator (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
      return;
    }

    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password;
    if (!cleanEmail || !cleanPassword) {
      setError('Email and password are required.');
      return;
    }
    if (cleanPassword.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });
      if (signInError) {
        // Surface a friendly message for the most common case.
        const msg = signInError.message?.toLowerCase() || '';
        if (msg.includes('confirm') || msg.includes('not confirmed')) {
          throw new Error('Your email address has not been confirmed yet. Please check your inbox and confirm your email before signing in.');
        }
        if (msg.includes('invalid') || msg.includes('credentials')) {
          const registered = await isEmailRegistered(cleanEmail);
          if (registered) {
            throw new Error('Invalid email or password. If you just created this account, check your inbox and confirm your email before signing in.');
          }
          throw new Error('Invalid email or password.');
        }
        throw signInError;
      }
      // Session is now in place. AuthProvider will hydrate Zustand via
      // onAuthStateChange. Navigate the user to the canvas.
      const activeSession = data.session ?? await getActiveSession();
      if (activeSession) {
        await activateAuthenticatedSession(activeSession);
        setCurrentView('canvas');
      } else {
        throw new Error('Unable to start a signed-in session. Please try again.');
      }
    } catch (err) {
      setError(getFriendlyAuthError(err));
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError(null);
    setSuccess(null);

    const cleanEmail = email.trim().toLowerCase();
    if (!cleanEmail) {
      setError('Enter your email address before requesting a reset link.');
      return;
    }

    if (!isSupabaseConfigured || !supabase) {
      setError('Authentication is not configured. Please contact the administrator (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
      return;
    }

    setResetLoading(true);
    try {
      const redirectTo =
        typeof window !== 'undefined'
          ? `${window.location.origin}/update-password`
          : 'http://localhost:5173/update-password';
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(cleanEmail, {
        redirectTo,
      });
      if (resetError) throw resetError;
      setSuccess('Reset link sent to your email!');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to send reset link.');
    } finally {
      setResetLoading(false);
    }
  };

  const handleOAuth = async (provider: 'google' | 'facebook' | 'figma') => {
    setError(null);
    if (!isSupabaseConfigured || !supabase) {
      setError('Authentication is not configured. Please contact the administrator (missing VITE_SUPABASE_URL / VITE_SUPABASE_PUBLISHABLE_KEY).');
      return;
    }
    setLoading(true);
    try {
      // Always send Google back to the EXACT URL the user started from.
      // `getOAuthRedirectUrl()` returns `window.location.origin + pathname`
      // so a dev server on :5173 stays on :5173 and prod on chnkit.com
      // stays on chnkit.com. Never hardcode a port.
      const redirectTo = getOAuthRedirectUrl();
      // Diagnostic log — if you ever land on the wrong host after Google
      // sign-in, check the browser console: this is the URL we asked for.
      // If Supabase ignores it, the URL is missing from the Dashboard's
      // Redirect URLs allow-list.
      console.info('[OAuth] requesting redirectTo =', redirectTo);

      const { error: oauthError } = await supabase.auth.signInWithOAuth({
        provider,
        options: {
          redirectTo,
          queryParams:
            provider === 'google'
              ? { access_type: 'offline', prompt: 'select_account' }
              : undefined,
        },
      });
      if (oauthError) throw oauthError;
      // Browser is now navigating away to the OAuth provider; nothing more to do.
    } catch (err) {
      setLoading(false);
      const raw = err instanceof Error ? err.message : String(err);
      // Friendlier wording for the most common misconfiguration.
      if (/provider.*not enabled|unsupported.*provider/i.test(raw)) {
        setError(`The ${provider} provider is not enabled in Supabase. Open your Supabase Dashboard → Authentication → Providers and enable ${provider}.`);
      } else {
        setError(raw);
      }
    }
  };

  return (
    <div className={styles.shell}>

      {/* ── LEFT PANEL ── */}
      <div className={styles.leftPanel}>
        <div className={styles.gridDots} />

        <div className={styles.leftHeader}>
          {hasEnteredApp && (
            <button className={styles.backButton} onClick={() => setCurrentView('landing')}>
              <ArrowLeft size={14} />
              Back to home
            </button>
          )}
          <div className={styles.leftLogo}>
            <img src="/ChnkLogo.svg" alt="Chnk" style={{height: 24}} />
            <span>Chnk it</span>
          </div>
        </div>

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
            Chnk it is your infinite canvas for ideas. Connect thoughts, structure knowledge, and collaborate in real time.
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

        <div className={styles.leftFooter}>
          <div className={styles.leftAvatars}>
            <div className={styles.leftAvatar}>J</div>
            <div className={styles.leftAvatar}>A</div>
            <div className={styles.leftAvatar}>M</div>
            <div className={styles.leftAvatar}>R</div>
          </div>
          <div className={styles.leftProofText}>
            <strong>4,200+ teams</strong> already organising<br />their thoughts with Chnk it
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Welcome back</h1>
            <p className={styles.subtitle}>Sign in to your account to continue.</p>
          </div>

          <div className={styles.socialGroup}>
            <button className={styles.socialButton} type="button" onClick={() => handleOAuth('google')} disabled={loading}>
              <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button className={styles.socialButton} type="button" onClick={() => handleOAuth('facebook')} disabled={loading}>
              <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
              </svg>
              Facebook
            </button>
            <button className={styles.socialButton} type="button" onClick={() => handleOAuth('figma')} disabled={loading}>
              <svg className={styles.socialIcon} viewBox="0 0 38 57" xmlns="http://www.w3.org/2000/svg">
                <path d="M19 28.5a9.5 9.5 0 1 1 19 0 9.5 9.5 0 0 1-19 0z" fill="#1ABCFE"/>
                <path d="M0 47.5A9.5 9.5 0 0 1 9.5 38H19v9.5a9.5 9.5 0 1 1-19 0z" fill="#0ACF83"/>
                <path d="M19 0v19h9.5a9.5 9.5 0 1 0 0-19H19z" fill="#FF7262"/>
                <path d="M0 9.5A9.5 9.5 0 0 0 9.5 19H19V0H9.5A9.5 9.5 0 0 0 0 9.5z" fill="#F24E1E"/>
                <path d="M0 28.5A9.5 9.5 0 0 0 9.5 38H19V19H9.5A9.5 9.5 0 0 0 0 28.5z" fill="#A259FF"/>
              </svg>
              Figma
            </button>
            <button className={styles.socialButton} type="button" onClick={async () => { setError(null); setLoading(true); const result = await connectNotion(); if (!result.ok) { setError(result.error); } setLoading(false); }} disabled={loading}>
              <svg className={styles.socialIcon} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                <rect width="100" height="100" rx="12" fill="white"/>
                <path d="M27 22h35l10 10v46H27V22z" fill="white" stroke="#000" strokeWidth="4"/>
                <path d="M60 22v10h10" fill="none" stroke="#000" strokeWidth="4"/>
                <path d="M35 42h30M35 54h30M35 66h20" stroke="#000" strokeWidth="4" strokeLinecap="round"/>
              </svg>
              Notion
            </button>
          </div>

          <div className={styles.divider}>or continue with email</div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(239, 68, 68, 0.1)', color: '#ef4444', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '12px', background: 'rgba(34, 197, 94, 0.12)', color: '#22c55e', borderRadius: '8px', fontSize: '13px', marginBottom: '16px' }}>
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

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

            <button
              type="button"
              className={styles.forgotLink}
              onClick={handleForgotPassword}
              disabled={loading || resetLoading}
            >
              {resetLoading ? 'Sending reset link...' : 'Forgot your password?'}
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
