import type { AnchorHTMLAttributes, ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '../../lib/utils';
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

/** A semantic link with the same visual contract as Button.
 * Use this for navigation CTAs so anchors do not drift into a second
 * button language. */
export interface ButtonLinkProps extends AnchorHTMLAttributes<HTMLAnchorElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  leadingIcon?: ReactNode;
  trailingIcon?: ReactNode;
  fullWidth?: boolean;
}

export function ButtonLink({
  variant = 'secondary',
  size = 'md',
  leadingIcon,
  trailingIcon,
  fullWidth = false,
  className,
  children,
  ...props
}: ButtonLinkProps) {
  return (
    <a
      {...props}
      className={cn(styles.button, styles[variant], styles[size], fullWidth && styles.fullWidth, className)}
    >
      {leadingIcon}
      <span className={styles.label}>{children}</span>
      {trailingIcon}
    </a>
  );
}

export interface IconButtonProps extends Omit<ButtonProps, 'children' | 'leadingIcon' | 'trailingIcon'> {
  label: string;
  children: ReactNode;
}

export function IconButton({ label, className, children, type, variant = 'secondary', size = 'md', loading = false, disabled, ...props }: IconButtonProps) {
  const isDisabled = disabled || loading;

  return (
    <button
      {...props}
      type={type ?? 'button'}
      className={cn(styles.button, styles.iconButton, styles[variant], styles[size], className)}
      aria-label={label}
      aria-busy={loading || undefined}
      disabled={isDisabled}
    >
      {loading ? <span className={styles.spinner} aria-hidden="true" /> : children}
    </button>
  );
}

export interface FloatingActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  children: ReactNode;
}

/** The shared add/create control keeps its established hero treatment,
 * now in the system's squircle shape rather than a circular one. */
export function FloatingActionButton({ label, className, children, type, ...props }: FloatingActionButtonProps) {
  return (
    <button
      {...props}
      type={type ?? 'button'}
      className={cn('special-primary-btn', styles.floatingActionButton, className)}
      aria-label={label}
      data-button-shape="fab"
    >
      {children}
    </button>
  );
}
