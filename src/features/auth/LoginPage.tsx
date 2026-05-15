import React, { useState } from 'react';
import { Rocket, Mail, Lock, Eye, EyeOff, ArrowLeft, LogIn } from 'lucide-react';
import { useStore } from '../../store/useStore';
import styles from './AuthPage.module.css';

export const LoginPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div className={styles.shell}>
      {/* Back to landing */}
      <button className={styles.backButton} onClick={() => setCurrentView('landing')}>
        <ArrowLeft size={15} />
        Back to home
      </button>

      <div className={styles.card}>
        {/* Logo */}
        <div className={styles.cardHeader}>
          <div className={styles.logo}>
            <Rocket size={20} className={styles.logoIcon} />
            <span>Infonote</span>
          </div>
          <h1 className={styles.title}>Welcome back</h1>
          <p className={styles.subtitle}>Sign in to your account to continue.</p>
        </div>

        {/* Social login */}
        <div className={styles.socialGroup}>
          <button className={styles.socialButton}>
            {/* Google SVG */}
            <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Continue with Google
          </button>

          <button className={styles.socialButton}>
            {/* GitHub SVG */}
            <svg className={styles.socialIcon} viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
              <path fill="currentColor" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z"/>
            </svg>
            Continue with GitHub
          </button>
        </div>

        {/* Divider */}
        <div className={styles.divider}>or continue with email</div>

        {/* Form */}
        <form className={styles.form} onSubmit={(e) => e.preventDefault()}>
          {/* Email */}
          <div className={styles.fieldGroup}>
            <label htmlFor="login-email">Email address</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}><Mail size={15} /></span>
              <input
                id="login-email"
                type="email"
                className={styles.input}
                placeholder="you@example.com"
                autoComplete="email"
              />
            </div>
          </div>

          {/* Password */}
          <div className={styles.fieldGroup}>
            <label htmlFor="login-password">Password</label>
            <div className={styles.inputWrap}>
              <span className={styles.inputIcon}><Lock size={15} /></span>
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
                {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
              </button>
            </div>
          </div>

          {/* Forgot password */}
          <button type="button" className={styles.forgotLink}>
            Forgot your password?
          </button>

          {/* Submit */}
          <button type="submit" className={styles.submitButton}>
            <LogIn size={16} />
            Sign in
          </button>
        </form>

        {/* Switch to signup */}
        <p className={styles.footer}>
          Don't have an account?
          <button className={styles.switchLink} onClick={() => setCurrentView('signup')}>
            Create one
          </button>
        </p>
      </div>
    </div>
  );
};
