import React, { useState } from 'react';
import { Rocket, Mail, Lock, Eye, EyeOff, ArrowLeft, LogIn, Zap, GitBranch, Layers } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './AuthPage.module.css';

export const LoginPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.shell}>

      {/* ── LEFT PANEL ── */}
      <div className={styles.leftPanel}>
        <div className={styles.gridDots} />

        {/* Left Header with Back Button and Logo */}
        <div className={styles.leftHeader}>
          <button className={styles.backButton} onClick={() => setCurrentView('landing')}>
            <ArrowLeft size={14} />
            Back to home
          </button>
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
            <button className={styles.socialButton}>
              <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              Google
            </button>
            <button className={styles.socialButton}>
              <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.469h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.469h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" fill="#1877F2"/>
              </svg>
              Facebook
            </button>
          </div>

          {/* Divider */}
          <div className={styles.divider}>or continue with email</div>

          {/* Form */}
          <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
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

            <button type="submit" className={styles.submitButton}>
              <LogIn size={15} />
              Sign in
            </button>
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
