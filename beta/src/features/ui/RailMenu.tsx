import { X } from '../../components/icons';
import railStyles from './RailMenu.module.css';

export interface RailMenuItem {
    key: string;
    label: string;
    description?: string;
    icon: React.ElementType;
    onSelect: () => void;
    /** Makes the tile draggable onto the canvas. */
    onDragStart?: (e: React.DragEvent) => void;
}

interface RailMenuProps {
    title: string;
    isOpen: boolean;
    onClose: () => void;
    items: RailMenuItem[];
    columns?: number;
    /** Keyboard-highlighted tile, if any. */
    highlightedIndex?: number | null;
}

/** A titled grid of tiles that pops up from a button on the bottom rail. */
export function RailMenu({ title, isOpen, onClose, items, columns, highlightedIndex = null }: RailMenuProps) {
    return (
        <div className={`${railStyles.hoverMenu} ${isOpen ? railStyles.menuVisible : ''}`}>
            <div className={railStyles.menuHeader}>
                <h3 className={railStyles.menuTitle}>{title}</h3>
                <button
                    className={railStyles.menuCloseBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    title="Close"
                >
                    <X size={12} />
                </button>
            </div>
            <div className={railStyles.menuGrid} style={columns ? { gridTemplateColumns: `repeat(${columns}, 1fr)` } : undefined}>
                {items.map((item, index) => (
                    <div
                        key={item.key}
                        className={`${railStyles.draggableItem} ${highlightedIndex === index ? railStyles.draggableItemHighlighted : ''}`}
                        draggable={Boolean(item.onDragStart)}
                        onDragStart={item.onDragStart}
                        onClick={() => {
                            item.onSelect();
                            onClose();
                        }}
                    >
                        <div className={railStyles.itemIconWrapper}>
                            <item.icon size={20} />
                        </div>
                        <div className={railStyles.customTooltip}>
                            <div className={railStyles.tooltipLabel}>{item.label}</div>
                            {item.description && <div className={railStyles.tooltipDesc}>{item.description}</div>}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
