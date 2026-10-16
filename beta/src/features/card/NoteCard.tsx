import { memo, useCallback, useRef, useEffect, useState, useMemo } from 'react';
import { Handle, Position, type NodeProps, useConnection } from '@xyflow/react';
import { ExternalLink } from '../../components/icons';
import styles from './NoteCard.module.css';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { IconPicker } from './IconPicker';
import { defaultIconName, CardIcon } from './iconMap';
import { FolderArt } from './FolderArt';
import { NoteExpandedContent } from './NoteExpandedContent';
import { CardTitleInput } from './CardTitleInput';
import { CardResizeHandle } from './CardResizeHandle';
import { useCardDraft } from './hooks/useCardDraft';
import { ErrorBoundary } from '../../components/ErrorBoundary';
import { samePropsIgnoringPosition } from '../canvas/nodeMemo';
import { LinkTargetOverlay } from '../canvas/LinkTargetOverlay';
import { PeekMenu } from '../ui/PeekMenu';
import { FloatingActionButton } from '../../components/ui/Button';
import { useCanvasEditorEligibility } from '../canvas/hooks/useCanvasEditorEligibility';

/** How long the "just fused" pulse plays. */
const FUSE_PULSE_MS = 500;

/**
 * While the card is not selected, a wheel over it scrolls the card's note body
 * when that body can scroll, and zooms the canvas otherwise.
 */
function forwardWheelToNoteBody(card: HTMLElement | null, e: WheelEvent) {
    const scrollArea = card?.querySelector('.infonote-scrollable');
    if (!scrollArea) return;
    const before = scrollArea.scrollTop;
    scrollArea.scrollTop += e.deltaY;
    if (Math.abs(scrollArea.scrollTop - before) > 0.5) {
        e.stopPropagation();
        e.preventDefault();
    }
}

export const NoteCard = memo(({ id, data, selected }: NodeProps<NoteNode>) => {
    const connection = useConnection();
    const isConnecting = connection.inProgress;

    // Atomic selectors: re-render only when what this card shows changes.
    const navigateToNode = useStore(s => s.navigateToNode);
    const updateNodeData = useStore(s => s.updateNodeData);
    const showIconPicker = useStore(s => s.activeIconMenuId === id);
    const setActiveIconMenuId = useStore(s => s.setActiveIconMenuId);
    const isMultiSelected = useStore(s => s.selectedCanvasNodeIds.size > 1 && s.selectedCanvasNodeIds.has(id));
    const isLinkingMode = useStore(s => s.isLinkingMode);
    const isDragging = useStore(s => s.interactionState.draggedNodeId === id && !s.interactionState.isMultiDragging);
    const dropType = useStore(s => s.interactionState.dropTarget?.id === id ? s.interactionState.dropTarget.type : null);

    const cardRef = useRef<HTMLDivElement>(null);
    const contentRef = useRef<HTMLDivElement>(null);
    const draft = useCardDraft(id, data, updateNodeData);

    // A short pulse whenever something is fused into this card.
    const [isFusing, setIsFusing] = useState(false);
    const lastFusedTimeRef = useRef(data.lastFusedAt || 0);
    useEffect(() => {
        if (!data.lastFusedAt || data.lastFusedAt <= lastFusedTimeRef.current) return;
        lastFusedTimeRef.current = data.lastFusedAt;
        setIsFusing(true);
        const timer = setTimeout(() => setIsFusing(false), FUSE_PULSE_MS);
        return () => clearTimeout(timer);
    }, [data.lastFusedAt]);

    // Part of a multi-selection stays a drag handle rather than opening for
    // editing — otherwise grabbing one card to move the group lands in its text.
    const isInteractive = selected && !isMultiSelected;
    /* A rich BlockEditor is expensive, so only the selected card mounts one;
       the others show a read-only projection. The promotion goes through the
       shared scheduler once React Flow has finished its own click work. */
    const canMountLiveEditor = useCanvasEditorEligibility(id, isInteractive);

    const viewMode = data.viewMode || 'medium';
    const icon = data.icon || defaultIconName;

    /* A coloured card publishes its accent and lets CSS derive the surfaces
       (`--node-tint-*` in design-system.css). The hue is never painted on
       directly: full-strength accent behind body text is unreadable. */
    const accentStyle = useMemo(() => (data.color
        ? { '--card-indicator-color': data.color, '--node-accent': data.color } as React.CSSProperties
        : undefined), [data.color]);

    const openIconPicker = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        setActiveIconMenuId(id);
    }, [id, setActiveIconMenuId]);

    const selectIcon = useCallback((next: string) => {
        updateNodeData(id, { icon: next });
        setActiveIconMenuId(null);
    }, [id, setActiveIconMenuId, updateNodeData]);

    const handleCardDoubleClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!selected || isLinkingMode) return;
        const target = e.target;
        if (!(target instanceof HTMLElement)) return;
        /* Controls keep their own double-click. The note body does not: once a
           card is selected, a double-click anywhere in it enters its canvas. */
        if (target.closest('button, input, textarea, select, option, a, [role="button"], [role="link"], .mediaViewTarget')) return;
        e.preventDefault();
        e.stopPropagation();
        navigateToNode(id);
    }, [id, isLinkingMode, navigateToNode, selected]);

    const attachWheelForwarding = useCallback((el: HTMLDivElement | null) => {
        if (el) el.onwheel = (e) => forwardWheelToNoteBody(cardRef.current, e);
    }, []);

    const titleInput = (className: string) => (
        <CardTitleInput
            className={className}
            value={draft.valueOf('label')}
            onChange={(value) => draft.edit('label', value)}
            onCommit={() => draft.commit('label')}
        />
    );

    const iconButton = (size: number) => (
        <button className={`${styles.iconButton} icon-hover nodrag`} onClick={openIconPicker} title="Change icon">
            <CardIcon icon={icon} size={size} />
        </button>
    );

    return (
        <div
            className={`
                ${styles.card}
                ${styles[viewMode] ?? ''}
                ${selected ? styles.selected : ''}
                ${isMultiSelected ? styles.multiSelected : ''}
                ${isDragging ? styles.dragging : ''}
                ${dropType === 'nesting' ? styles.dropTarget : ''}
                ${dropType === 'fusion' ? styles.fusionTarget : ''}
                ${isFusing ? styles.fusing : ''}
                custom-drag-handle
            `}
            ref={cardRef}
            onDoubleClick={handleCardDoubleClick}
            data-accented={data.color ? '' : undefined}
            style={{ width: '100%', height: '100%', boxSizing: 'border-box', ...accentStyle }}
        >
            {/* The card's ambient colour field — see .coverAmbient. Decorative. */}
            {data.color && (
                <div className={styles.coverAmbientClip} aria-hidden="true">
                    <span className={styles.coverAmbientHue} />
                </div>
            )}

            <LinkTargetOverlay nodeId={id} />

            {/* Unselected, the whole card is a drag handle; a double-click enters it. */}
            {!isInteractive && !isLinkingMode && (
                <div
                    className="interaction-overlay custom-drag-handle"
                    ref={attachWheelForwarding}
                    style={{ position: 'absolute', inset: 0, zIndex: 10, cursor: 'grab', borderRadius: 'inherit' }}
                    onDoubleClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation(); // not React Flow's double-click
                        navigateToNode(id);
                    }}
                />
            )}

            <CardResizeHandle id={id} cardRef={cardRef} contentRef={contentRef} />

            {/* The hover menu carries `nodrag`: the card root is the drag handle,
                so without it a press on a button would start a node drag and the
                click would never fire. */}
            {!data.hideHoverMenu && (
                <div className={`${styles.hoverMenu} nodrag`}>
                    <PeekMenu nodeId={id} buttonClassName={styles.menuBtn} />
                    <div className={styles.menuDivider} />
                    <FloatingActionButton
                        label="Open card"
                        style={{ width: 32, height: 32, minWidth: 32, minHeight: 32 }}
                        onClick={(e) => {
                            e.stopPropagation();
                            navigateToNode(id);
                        }}
                        title="Open Card"
                    >
                        <ExternalLink size={16} strokeWidth={2.6} />
                    </FloatingActionButton>
                </div>
            )}

            <Handle
                type="target"
                position={Position.Top}
                isConnectableStart={false}
                style={{ top: '50%', left: '50%', width: '100%', height: '100%', border: 'none', background: 'transparent', transform: 'translate(-50%, -50%)', zIndex: -1 }}
            />
            {!isConnecting && (
                <Handle
                    type="source"
                    position={Position.Right}
                    className={styles.topRightHandle}
                    isConnectableEnd={false}
                    id="out"
                />
            )}

            {/* In expanded mode NoteExpandedContent renders its own picker
                against the same `activeIconMenuId`. */}
            {showIconPicker && viewMode !== 'expanded' && (
                <IconPicker
                    currentIcon={icon}
                    onSelect={selectIcon}
                    onClose={() => setActiveIconMenuId(null)}
                />
            )}

            {viewMode === 'icon' && (
                <div className={styles.iconView} key="icon">
                    {iconButton(32)}
                    {titleInput(styles.iconTextInput)}
                </div>
            )}

            {/* Folder art at the icon card's size: the cover shows in the folder's
                top band and the icon presses into the front flap. */}
            {viewMode === 'folder' && (
                <div className={styles.folderView} key="folder">
                    <FolderArt coverImage={data.coverImage} icon={data.icon} size={92} />
                    {titleInput(styles.folderLabel)}
                </div>
            )}

            {viewMode === 'titleview' && (
                <div className={styles.titleView} key="titleview">
                    {iconButton(24)}
                    {titleInput(styles.titleViewInput)}
                </div>
            )}

            {viewMode === 'medium' && (
                <div className={styles.mediumView} key="medium">
                    <div className={styles.mediumHeader}>
                        {titleInput(styles.mediumTitleInput)}
                    </div>
                    {/* Tinted from `--node-accent`, like the card itself. */}
                    <div className={styles.mediumDescContainer}>
                        <textarea
                            className={`${styles.mediumDescInput} nodrag`}
                            value={draft.valueOf('description')}
                            onChange={(e) => draft.edit('description', e.target.value)}
                            onBlur={() => draft.commit('description')}
                            onFocus={(e) => e.stopPropagation()}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onMouseDown={(e) => e.stopPropagation()}
                            onWheelCapture={(e) => e.stopPropagation()}
                            onDoubleClick={(e) => {
                                e.stopPropagation();
                                e.currentTarget.select();
                            }}
                            placeholder="Add description..."
                        />
                    </div>
                </div>
            )}

            {viewMode === 'expanded' && (
                <div className={styles.expandedView} key="expanded">
                    <ErrorBoundary>
                        <NoteExpandedContent
                            id={id}
                            data={data}
                            onUpdate={updateNodeData}
                            showLiveEditor={canMountLiveEditor}
                            hideBlockHandles={!isInteractive}
                            contentRef={contentRef}
                            nodeId={id}
                            selectionIslandPortalId={`selection-island-${id}`}
                            renderAmbient={false}
                        />
                    </ErrorBoundary>
                </div>
            )}

            {/* SelectionCapsule portals in here, positioned outside the card. */}
            <div id={`selection-island-${id}`} className={styles.selectionIslandContainer} />
        </div>
    );
}, samePropsIgnoringPosition);
