import React from 'react';
import { useViewport } from '@xyflow/react';
import type { RealtimePresenceState } from '../../services/realtimeSync';
import styles from './LiveCursors.module.css';

interface LiveCursorsProps {
    presenceData: Record<string, RealtimePresenceState[]>;
    currentUserId: string | null;
}

export const LiveCursors: React.FC<LiveCursorsProps> = ({ presenceData, currentUserId }) => {
    const { x: vx, y: vy, zoom } = useViewport();

    // Flatten the presence data and filter out the current user and users without a cursor
    const cursors = Object.values(presenceData)
        .flat()
        .filter((presence) => presence.userId !== currentUserId && presence.cursor !== null);

    if (cursors.length === 0) return null;

    return (
        <div className={styles.cursorsContainer} style={{ pointerEvents: 'none' }}>
            {cursors.map((presence) => {
                const { x, y } = presence.cursor!;
                return (
                    <div
                        key={presence.userId}
                        className={styles.cursor}
                        style={{
                            transform: `translate(${x * zoom + vx}px, ${y * zoom + vy}px)`,
                        }}
                    >
                        <svg
                            width="24"
                            height="36"
                            viewBox="0 0 24 36"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                            className={styles.cursorSvg}
                        >
                            <path
                                d="M5.65376 12.3673H5.46026L5.31717 12.4976L0.500002 16.8829L0.500002 1.19841L11.7871 12.3673H5.65376Z"
                                fill={presence.color}
                            />
                        </svg>
                        <div
                            className={styles.cursorName}
                            style={{ backgroundColor: presence.color }}
                        >
                            {presence.userName || 'Unknown'}
                        </div>
                    </div>
                );
            })}
        </div>
    );
};
