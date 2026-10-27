import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { clsx as cn } from 'clsx';
import styles from './Button.module.css';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  loading?: boolean;
  fullWidth?: boolean;
}

export function Button({
  variant = 'secondary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  loading = false,
  fullWidth = false,
  className,
  children,
  disabled,
  type,
  ...props
}: ButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      type={type ?? 'button'}
      className={cn(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, className)}
      disabled={isDisabled}
      aria-busy={loading || undefined}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : leadingIcon}
      <span className={styles.label}>{children}</span>
      {!loading && trailingIcon}
    </button>
  );
}
