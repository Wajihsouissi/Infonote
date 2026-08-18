import React, { useState } from 'react';
import { AlertCircle, CheckCircle2, Eye, EyeOff, Loader2, Lock } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { supabase, isSupabaseConfigured } from '../../services/supabase/client';
import styles from './AuthPage.module.css';

export const UpdatePasswordPage: React.FC = () => {
  const setCurrentView = useStore((state) => state.setCurrentView);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSuccess(null);

    if (!isSupabaseConfigured || !supabase) {
      setError('Authentication is not configured. Please contact the administrator.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }

    setLoading(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) throw updateError;
      setSuccess('Password updated. You can sign in with your new password.');
      window.history.replaceState({}, '', '/login');
      window.setTimeout(() => setCurrentView('login'), 1200);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update password.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className={styles.shell}>
      <div className={styles.leftPanel}>
        <div className={styles.gridDots} />
      </div>
      <div className={styles.rightPanel}>
        <div className={styles.formContainer}>
          <div className={styles.cardHeader}>
            <h1 className={styles.title}>Set new password</h1>
            <p className={styles.subtitle}>Choose a fresh password for your Infonote account.</p>
          </div>

          {error && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(239,68,68,0.1)', color: '#ef4444', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
              <AlertCircle size={16} />
              <span>{error}</span>
            </div>
          )}
          {success && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: 12, background: 'rgba(34,197,94,0.12)', color: '#22c55e', borderRadius: 8, fontSize: 13, marginBottom: 16 }}>
              <CheckCircle2 size={16} />
              <span>{success}</span>
            </div>
          )}

          <form className={styles.form} onSubmit={handleSubmit}>
            <div className={styles.fieldGroup}>
              <label htmlFor="new-password">New password</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Lock size={14} /></span>
                <input
                  id="new-password"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={loading}
                  required
                />
                <button
                  type="button"
                  className={styles.eyeButton}
                  onClick={() => setShowPassword((value) => !value)}
                  aria-label={showPassword ? 'Hide password' : 'Show password'}
                >
                  {showPassword ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
              </div>
            </div>

            <div className={styles.fieldGroup}>
              <label htmlFor="confirm-new-password">Confirm password</label>
              <div className={styles.inputWrap}>
                <span className={styles.inputIcon}><Lock size={14} /></span>
                <input
                  id="confirm-new-password"
                  type={showPassword ? 'text' : 'password'}
                  className={styles.input}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={loading}
                  required
                />
              </div>
            </div>

            <button type="submit" className={styles.submitButton} disabled={loading || !password || !confirmPassword}>
              {loading ? <Loader2 size={15} className="animate-spin" /> : <Lock size={15} />}
              Update password
            </button>
          </form>
        </div>
      </div>
    </div>
  );
};

export default UpdatePasswordPage;
