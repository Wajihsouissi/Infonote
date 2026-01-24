
import { type ReactNode } from 'react';
import { EyeOff, type LucideIcon } from 'lucide-react';
import styles from './Properties.module.css';

interface PropertyRowProps {
    icon: LucideIcon;
    label: string;
    children: ReactNode;
    onHide?: () => void;
}

/**
 * Generic container for a single property row.
 * Handles layout: [Icon] [Label] [Content] [Controls]
 */
export function PropertyRow({ icon: Icon, label, children, onHide }: PropertyRowProps) {
    return (
        <div className={styles.propertyRow}>
            <div className={styles.iconCol}>
                <Icon size={16} />
            </div>
            <div className={styles.labelCol}>
                {label}
            </div>
            <div className={styles.valueCol}>
                {children}
            </div>
            {onHide && (
                <div className={styles.controlsCol}>
                    <button
                        className={styles.iconBtn}
                        onClick={(e) => {
                            e.stopPropagation();
                            onHide();
                        }}
                        title="Hide property"
                    >
                        <EyeOff size={14} />
                    </button>
                </div>
            )}
        </div>
    );
}
