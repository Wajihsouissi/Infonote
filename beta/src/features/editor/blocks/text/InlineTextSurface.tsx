import type { ComponentProps } from 'react';
import type { Block } from '../../types';
import styles from '../../ui/surface/BlockEditor.module.css';

/** Presentation only: no document subscriptions, input hooks, or DOM writes. */
export function InlineTextSurface({ block, variant = 'text', className = '', style, ...props }: ComponentProps<'div'> & {
    block: Block;
    variant?: 'text' | 'heading1' | 'heading2' | 'heading3';
}) {
    return <div {...props} role={variant === 'text' ? props.role : 'heading'}
        aria-level={variant === 'text' ? props['aria-level'] : Number(variant.slice(-1))}
        className={`${styles.block} ${styles[variant]} ${className}`}
        style={{ color: block.metadata?.textColor, backgroundColor: block.metadata?.backgroundColor, ...style }} />;
}
