/**
 * WelcomeModal — shown immediately after a successful new account sign-up.
 *
 * Auto-dismisses after 4 seconds or on "Get Started" click. Calls onClose
 * in both cases so the parent can navigate to the canvas and clear state.
 */
import React, { useEffect, useRef } from 'react';
import styles from './WelcomeModal.module.css';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FEATURES = [
  { icon: '🎨', label: 'Canvas' },
  { icon: '🧩', label: 'Blocks' },
  { icon: '☁️', label: 'Cloud Sync' },
];

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    // Auto-dismiss after 4 seconds
    timerRef.current = setTimeout(() => {
      onClose();
    }, 4000);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  const handleGetStarted = () => {
    if (timerRef.current) clearTimeout(timerRef.current);
    onClose();
  };

  return (
    <div className={styles.backdrop} role="dialog" aria-modal="true" aria-label="Welcome to Infonote">
      <div className={styles.card}>
        {/* Logo / Icon */}
        <div className={styles.iconWrapper}>
          <div className={styles.iconRing} />
          <div className={styles.iconInner}>
            <img
              src="/ChnkLogo.svg"
              alt="Infonote"
              style={{ width: 32, height: 32, filter: 'brightness(0) invert(1)' }}
              onError={(e) => {
                (e.currentTarget as HTMLImageElement).style.display = 'none';
                const parent = e.currentTarget.parentElement;
                if (parent) parent.textContent = '✨';
              }}
            />
          </div>
        </div>

        {/* Heading */}
        <h2 className={styles.heading}>
          Welcome to{' '}
          <span className={styles.headingGrad}>Infonote!</span>
        </h2>

        {/* Subtext */}
        <p className={styles.subtext}>
          Your workspace is ready.<br />
          Let's build something great.
        </p>

        {/* Feature badges */}
        <div className={styles.featureList}>
          {FEATURES.map((f) => (
            <div key={f.label} className={styles.featureItem}>
              <div className={styles.featureIcon}>{f.icon}</div>
              <span className={styles.featureLabel}>{f.label}</span>
            </div>
          ))}
        </div>

        {/* CTA */}
        <button className={styles.ctaButton} type="button" onClick={handleGetStarted}>
          Get Started →
        </button>

        <p className={styles.skipText}>Auto-continues in 4 seconds</p>
      </div>
    </div>
  );
};
