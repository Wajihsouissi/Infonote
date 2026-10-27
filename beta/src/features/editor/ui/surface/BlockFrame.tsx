import type { ComponentProps, ReactNode } from 'react';
import styles from './BlockEditor.module.css';

/** Shared content geometry, including the slot reserved for editing controls. */
export function BlockFrame({ children, controls, contentClassName = '', ...props }: ComponentProps<'div'> & {
    controls?: ReactNode;
    contentClassName?: string;
}) {
    return <div {...props}>{controls}<div className={`${styles.blockContent} ${contentClassName}`}>{children}</div></div>;
}
