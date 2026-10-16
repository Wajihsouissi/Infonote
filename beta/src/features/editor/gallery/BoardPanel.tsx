import { LayoutGrid, Rows3, Squircle, Layers, Plus, Scaling, Crosshair, Expand, RotateCcw } from '../../../components/icons';
import { Tabs, type TabItem } from '../../../components/ui/Tabs';
import type { GalleryFit, GalleryLayout } from '../galleryTypes';
import styles from '../GalleryBlock.module.css';
import panelStyles from './BoardPanel.module.css';

const LAYOUTS: { id: GalleryLayout; label: string; icon: typeof LayoutGrid }[] = [
    { id: 'bento', label: 'Bento — mixed sizes', icon: Squircle },
    { id: 'grid', label: 'Grid — equal tiles', icon: LayoutGrid },
    { id: 'masonry', label: 'Masonry — natural heights', icon: Rows3 },
    { id: 'scatter', label: 'Collage — pinned, tilted, overlapping', icon: Layers },
];

/* The same four layouts as tab items. The label doubles as the tooltip and
   the accessible name, since these tabs are glyphs only. */
const LAYOUT_TABS: TabItem<GalleryLayout>[] = LAYOUTS.map(({ id, label, icon: Icon }) => ({
    id,
    ariaLabel: label,
    icon: <Icon size={15} />,
}));

interface BoardPanelProps {
    layout: GalleryLayout;
    fit: GalleryFit;
    /** Focal points only mean something when pictures are cropped. */
    canAdjustFocus: boolean;
    focusMode: boolean;
    /** Offer "reset sizes" only when there is something to reset. */
    canResetSpans: boolean;
    hasItems: boolean;
    onLayout: (layout: GalleryLayout) => void;
    onToggleFit: () => void;
    onToggleFocusMode: () => void;
    onResetSpans: () => void;
    onPresent: () => void;
    onAdd: () => void;
}

/**
 * The board's floating control panel.
 *
 * It lives over the pictures on hover rather than taking a permanent bar, so at
 * rest a board is nothing but its images. Grouped by what each control *is*,
 * not by what fits: a segmented control for the one-of-four layout, then the
 * display toggles, then the things that aren't editing at all, then the single
 * primary action. Seven identical buttons in a row said nothing about which
 * choices were exclusive, which were toggles, and which left the page.
 */
export function BoardPanel({
    layout, fit, canAdjustFocus, focusMode, canResetSpans, hasItems,
    onLayout, onToggleFit, onToggleFocusMode, onResetSpans, onPresent, onAdd,
}: BoardPanelProps) {
    return (
        <div className={styles.panel} onMouseDown={(e) => e.stopPropagation()}>
            {/* `nodrag` on the strip rather than each tab — React Flow looks for
                the nearest such ancestor, so one is enough to stop a click here
                from dragging the node. */}
            <Tabs
                className="nodrag"
                items={LAYOUT_TABS}
                value={layout}
                onChange={onLayout}
                iconOnly
                radius="control"
                semantics="radio"
                aria-label="Board layout"
            />

            <span className={panelStyles.panelDivider} />

            <button
                type="button"
                className={`${panelStyles.panelBtn} ${fit === 'contain' ? panelStyles.panelActive : ''} nodrag`}
                title={fit === 'cover' ? 'Cropped to fill — click to show whole frames' : 'Whole frames — click to crop to fill'}
                aria-label="Whole frames"
                aria-pressed={fit === 'contain'}
                onClick={onToggleFit}
            >
                <Scaling size={16} />
            </button>
            {canAdjustFocus && (
                <button
                    type="button"
                    className={`${panelStyles.panelBtn} ${focusMode ? panelStyles.panelActive : ''} nodrag`}
                    title={focusMode
                        ? 'Setting focal points — drag a picture to aim its crop, double-click to recentre, Esc to finish'
                        : 'Set focal points — choose what stays in frame when a picture is cropped'}
                    aria-label="Set focal points"
                    aria-pressed={focusMode}
                    onClick={onToggleFocusMode}
                >
                    <Crosshair size={16} />
                </button>
            )}
            {/* Only offered once there is something to undo — on an untouched
                board it would be a control for a state the board is already in. */}
            {canResetSpans && (
                <button
                    type="button"
                    className={`${panelStyles.panelBtn} nodrag`}
                    title="Reset tile sizes — hand the board back to its automatic rhythm"
                    aria-label="Reset tile sizes"
                    onClick={onResetSpans}
                >
                    <RotateCcw size={15} />
                </button>
            )}

            {hasItems && (
                <>
                    <span className={panelStyles.panelDivider} />
                    <button
                        type="button"
                        className={`${panelStyles.panelPresent} nodrag`}
                        title="Present this board full screen"
                        aria-label="Present this board full screen"
                        onClick={onPresent}
                    >
                        <Expand size={15} />
                    </button>
                </>
            )}

            <span className={panelStyles.panelDivider} />
            <button
                type="button"
                className={`${panelStyles.panelAdd} nodrag`}
                title="Add media"
                aria-label="Add media"
                onClick={onAdd}
            >
                <Plus size={18} />
            </button>
        </div>
    );
}
