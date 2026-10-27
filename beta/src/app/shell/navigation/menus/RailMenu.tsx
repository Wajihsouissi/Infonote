import { X } from '../../../../shared/icons';
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
    description?: string;
    isOpen: boolean;
    onClose: () => void;
    items: RailMenuItem[];
    columns?: number;
    /** Keyboard-highlighted tile, if any. */
    highlightedIndex?: number | null;
}

/** A readable command menu above the canvas dock. */
export function RailMenu({ title, description, isOpen, onClose, items, columns = 2, highlightedIndex = null }: RailMenuProps) {
    if (!isOpen) return null;

    return (
        <div
            id="canvas-command-menu"
            className={railStyles.hoverMenu}
            role="region"
            aria-label={title}
            data-rail-menu
            onKeyDown={(e) => {
                // Let focused menu buttons use their native Enter/Space click.
                // Canvas shortcuts must not consume the key before that click.
                if ((e.key === 'Enter' || e.key === ' ') && e.target instanceof HTMLButtonElement) e.stopPropagation();
            }}
        >
            <div className={railStyles.menuHeader}>
                <div className={railStyles.menuHeading}>
                    <h3 className={railStyles.menuTitle}>{title}</h3>
                    {description && <p className={railStyles.menuDescription}>{description}</p>}
                </div>
                <button
                    type="button"
                    className={railStyles.menuCloseBtn}
                    onClick={(e) => {
                        e.stopPropagation();
                        onClose();
                    }}
                    title="Close menu"
                    aria-label="Close menu"
                >
                    <X size={16} aria-hidden="true" />
                </button>
            </div>
            <div className={railStyles.menuGrid} style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
                {items.map((item, index) => (
                    <button
                        type="button"
                        key={item.key}
                        data-menu-item
                        className={`${railStyles.draggableItem} ${highlightedIndex === index ? railStyles.draggableItemHighlighted : ''}`}
                        draggable={Boolean(item.onDragStart)}
                        onDragStart={item.onDragStart}
                        onClick={() => {
                            item.onSelect();
                            onClose();
                        }}
                    >
                        <span className={railStyles.itemIconWrapper} aria-hidden="true">
                            <item.icon size={18} />
                        </span>
                        <span className={railStyles.itemCopy}>
                            <span className={railStyles.itemLabel}>{item.label}</span>
                            {item.description && <span className={railStyles.itemDescription}>{item.description}</span>}
                        </span>
                    </button>
                ))}
            </div>
        </div>
    );
}
