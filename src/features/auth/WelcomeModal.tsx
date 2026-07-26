/**
 * WelcomeModal — shown immediately after a successful new account sign-up.
 *
 * Auto-dismisses after 5 seconds or on "Get Started" click. Calls onClose
 * in both cases so the parent can navigate to the canvas and clear state.
 */
import React, { useEffect, useRef } from 'react';
import { Sparkles, ArrowRight, Layers, Zap, GitBranch } from 'lucide-react';
import styles from './WelcomeModal.module.css';
import { useStore } from '../../store/useStore';

interface WelcomeModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const FEATURES = [
  { icon: <Zap size={16} />, label: 'Infinite Canvas' },
  { icon: <Layers size={16} />, label: 'Smart Blocks' },
  { icon: <GitBranch size={16} />, label: 'Cloud Sync' },
];

export const WelcomeModal: React.FC<WelcomeModalProps> = ({ isOpen, onClose }) => {
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progressRef = useRef<HTMLDivElement>(null);
  const displayName = useStore((s) => s.auth.displayName);
  const firstName = displayName?.split(' ')[0] ?? null;

  useEffect(() => {
    if (!isOpen) return;
    // Auto-dismiss after 5 seconds
    timerRef.current = setTimeout(() => {
      onClose();
    }, 5000);

    // Animate the progress bar
    if (progressRef.current) {
      progressRef.current.style.transition = 'width 5s linear';
      // Force reflow so the transition plays from 0
      void progressRef.current.offsetWidth;
      progressRef.current.style.width = '100%';
    }

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
        {/* Progress bar at top */}
        <div className={styles.progressTrack}>
          <div ref={progressRef} className={styles.progressBar} style={{ width: '0%' }} />
        </div>

        {/* Logo / Icon */}
        <div className={styles.iconWrapper}>
          <div className={styles.iconRing} />
          <div className={styles.iconInner}>
            <Sparkles size={32} color="#ffffff" />
          </div>
        </div>

        {/* Heading */}
        <h2 className={styles.heading}>
          {firstName ? (
            <>Hey <span className={styles.headingGrad}>{firstName}</span>,<br />welcome to Infonote!</>
          ) : (
            <>Welcome to{' '}<span className={styles.headingGrad}>Infonote!</span></>
          )}
        </h2>

        {/* Subtext */}
        <p className={styles.subtext}>
          Your infinite canvas is ready.{' '}
          <strong style={{ color: 'rgba(255,255,255,0.8)' }}>Let's build something brilliant.</strong>
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
          Open My Canvas
          <ArrowRight size={16} />
        </button>

        <p className={styles.skipText}>Auto-continues in 5 seconds</p>
      </div>
    </div>
  );
};
