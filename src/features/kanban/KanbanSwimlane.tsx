import { memo, useMemo } from 'react';
import { SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import type { NoteNode } from '../../types';
import type { KanbanColumn } from '../../types';
import { SortableCard } from './SortableCard';
import styles from './KanbanSwimlane.module.css';

interface KanbanSwimlaneProps {
    label: string;
    columns: KanbanColumn[];
    cards: NoteNode[];
    onCardClick?: (node: NoteNode) => void;
}

export const KanbanSwimlane = memo(({
    label,
    columns,
    cards,
    onCardClick
}: KanbanSwimlaneProps) => {
    // Group cards by column within this swimlane
    const cardsByColumn = useMemo(() => {
        const map: Record<string, NoteNode[]> = {};
        columns.forEach(col => {
            map[col.statusValue] = [];
        });

        cards.forEach(card => {
            const status = card.data.status || columns[0]?.statusValue;
            if (map[status]) {
                map[status].push(card);
            } else if (columns.length > 0) {
                map[columns[0].statusValue].push(card);
            }
        });

        return map;
    }, [cards, columns]);

    const cardCount = cards.length;

    return (
        <div className={styles.swimlane}>
            <div className={styles.header}>
                <span className={styles.label}>{label || 'Unassigned'}</span>
                <span className={styles.count}>{cardCount}</span>
            </div>

            <div className={styles.columnsRow}>
                {columns.map(col => (
                    <div
                        key={col.id}
                        className={`${styles.column} ${col.collapsed ? styles.collapsed : ''}`}
                    >
                        <SortableContext
                            items={cardsByColumn[col.statusValue]?.map(c => c.id) || []}
                            strategy={verticalListSortingStrategy}
                        >
                            <div className={styles.cardList}>
                                {(cardsByColumn[col.statusValue] || []).map((card) => (
                                    <SortableCard
                                        key={card.id}
                                        node={card}
                                        onCardClick={onCardClick}
                                    />
                                ))}
                            </div>
                        </SortableContext>
                    </div>
                ))}
            </div>
        </div>
    );
});
