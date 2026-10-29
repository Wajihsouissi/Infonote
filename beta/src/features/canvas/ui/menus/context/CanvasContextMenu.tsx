import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Type,
    ClipboardPaste, Trash2, Crosshair, ChevronRight,
    LayoutGrid, Columns2, Copy, Scissors,
} from '../../../../../shared/icons';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../../../../store/useStore';
import { MENU_ITEMS, type MenuItem } from '../../../../editor/ui/menus/block/menuConstants';
import { createMenuBlock, menuBlockNodeSize } from '../../../../editor/ui/menus/block/menuBlocks';
import { pasteCanvasContent } from '../../../../clipboard/pasteCanvasContent';
import styles from './CanvasContextMenu.module.css';

interface ContextMenuProps {
    x: number;
    y: number;
    onClose: () => void;
}

const CATEGORIES = [
    { label: 'Basic', items: ['text', 'heading1', 'heading2', 'heading3'] },
    { label: 'Lists', items: ['bullet', 'numbered', 'todo', 'toggle'] },
    { label: 'Advanced', items: ['callout', 'code', 'quote', 'divider', 'table', 'link'] },
    { label: 'Media', items: ['media', 'gallery'] },
    { label: 'Layouts', items: ['columns'] },
    { label: 'Extras', items: ['color'] },
];

export function CanvasContextMenu({ x, y, onClose }: ContextMenuProps) {
    const [activeSubmenu, setActiveSubmenu] = useState<'add-block' | 'select' | null>(null);
    const [clipboardError, setClipboardError] = useState('');
    const menuRef = useRef<HTMLDivElement>(null);

    const nodes = useStore(s => s.nodes);
    const addNode = useStore(s => s.addNode);
    const requestNodeDeletion = useStore(s => s.requestNodeDeletion);
    const setSelectedCanvasNodeIds = useStore(s => s.setSelectedCanvasNodeIds);
    const organizeCanvas = useStore(s => s.organizeCanvas);
    const currentParentId = useStore(s => s.currentParentId);
    const { screenToFlowPosition } = useReactFlow();

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        const frame = requestAnimationFrame(() => document.addEventListener('mousedown', handleClick));
        const previous = document.activeElement as HTMLElement | null;
        menuRef.current?.focus();
        return () => {
            cancelAnimationFrame(frame);
            document.removeEventListener('mousedown', handleClick);
            if (previous?.isConnected) previous.focus({ preventScroll: true });
        };
    }, [onClose]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.preventDefault();
                e.stopImmediatePropagation();
                if (activeSubmenu) { setActiveSubmenu(null); return; }
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey, true);
        return () => window.removeEventListener('keydown', handleKey, true);
    }, [onClose, activeSubmenu]);

    const handleAddBlock = useCallback((item: MenuItem) => {
        addNode('block', screenToFlowPosition({ x, y }), {
            content: [createMenuBlock(item)],
            isStandaloneBlock: true,
        }, menuBlockNodeSize(item), currentParentId || undefined);
        onClose();
    }, [x, y, addNode, screenToFlowPosition, onClose, currentParentId]);

    /* Copy and Cut simply ask the browser to run its own copy/cut, which the
       canvas already listens for — so the menu and Ctrl+C/Ctrl+X always agree
       instead of being two separate implementations that can drift apart. */
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const hasSelection = selectedCanvasNodeIds.size > 0;
    const activeNodeCount = nodes.filter(
        node => (node.parentId ?? null) === (currentParentId ?? null)
    ).length;
    const canOrganize = activeNodeCount > 1;

    const handleCopySelection = useCallback(() => {
        if (document.execCommand('copy')) onClose();
        else setClipboardError('Copy was blocked. Press Ctrl+C (Cmd+C on Mac) to copy your selection.');
    }, [onClose]);

    const handleCutSelection = useCallback(() => {
        if (document.execCommand('cut')) onClose();
        else setClipboardError('Cut was blocked. Press Ctrl+X (Cmd+X on Mac). Your cards are unchanged.');
    }, [onClose]);

    const handlePaste = useCallback(async () => {
        const flowPos = screenToFlowPosition({ x, y });
        try {
            /* Prefer the HTML flavour: cards and blocks copied inside the app
               carry their real structure there, so pasting through the menu is
               as faithful as Ctrl+V. Plain text is the fallback for anything
               that came from another program. */
            let html = '';
            let text = '';
            try {
                const items = await navigator.clipboard.read();
                for (const item of items) {
                    if (item.types.includes('text/html')) html = await (await item.getType('text/html')).text();
                    if (item.types.includes('text/plain')) text = await (await item.getType('text/plain')).text();
                }
            } catch {
                text = await navigator.clipboard.readText();
            }

            if (html || text) pasteCanvasContent(html, text, flowPos);
            onClose();
        } catch {
            setClipboardError('Clipboard access was blocked. Close this menu and press Ctrl+V (Cmd+V on Mac) to paste. Your cards are unchanged.');
        }
    }, [x, y, screenToFlowPosition, onClose]);

    const handleOrganizeCanvas = useCallback(() => {
        if (!canOrganize) return;

        const flowElement = document.querySelector<HTMLElement>('.react-flow');
        flowElement?.classList.add('is-organizing');
        onClose();

        // Let the transition class reach the DOM before applying the new
        // positions, otherwise the browser sees only the final transform.
        requestAnimationFrame(() => {
            const count = organizeCanvas();
            if (count > 1) {
                window.dispatchEvent(new CustomEvent('chnk-it:canvas-organized', {
                    detail: {
                        count,
                        historyDepth: useStore.temporal.getState().pastStates.length,
                    },
                }));
            }
            window.setTimeout(() => flowElement?.classList.remove('is-organizing'), 320);
        });
    }, [canOrganize, onClose, organizeCanvas]);

    const handleClearCanvas = useCallback(() => {
        const targetIds = nodes.filter(n => (n.parentId || null) === (currentParentId || null)).map(n => n.id);
        if (targetIds.length > 0) {
            requestNodeDeletion(targetIds);
        }
        onClose();
    }, [nodes, requestNodeDeletion, onClose, currentParentId]);

    const selectByType = useCallback((type?: string) => {
        const parentCtx = currentParentId || null;
        const filtered = type
            ? nodes.filter(n => (n.parentId || null) === parentCtx && n.type === type)
            : nodes.filter(n => (n.parentId || null) === parentCtx);
        // Also syncs each node's own `selected` flag, which React Flow renders from.
        setSelectedCanvasNodeIds(new Set(filtered.map(n => n.id)));
        onClose();
    }, [nodes, setSelectedCanvasNodeIds, onClose, currentParentId]);

    const screenMargin = 12;
    const menuWidth = 210;
    const submenuWidth = 200;
    const menuX = Math.max(screenMargin, Math.min(x, window.innerWidth - menuWidth - screenMargin));
    const menuY = Math.max(screenMargin, Math.min(y, window.innerHeight - 380));
    const submenuX = (x + menuWidth + 8 + submenuWidth > window.innerWidth)
        ? menuX - submenuWidth - 8
        : menuX + menuWidth + 8;

    return createPortal(
        <div className={styles.overlay}>
            <div ref={menuRef} tabIndex={-1} data-app-menu="canvas-context" aria-label="Canvas actions" onKeyDown={e => {
                if (['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(e.key)) {
                    e.preventDefault();
                    const buttons = Array.from(menuRef.current!.querySelectorAll<HTMLButtonElement>('button:not(:disabled)'));
                    const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
                    const next = e.key === 'Home' ? 0 : e.key === 'End' ? buttons.length - 1
                        : (index + (e.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
                    buttons[next]?.focus();
                }
                e.stopPropagation();
            }}>
                <div className={styles.menu} style={{ left: menuX, top: menuY }}>
                    <button type="button" className={styles.menuItem} onMouseEnter={() => setActiveSubmenu('add-block')} onClick={() => setActiveSubmenu('add-block')}>
                        <span className={styles.itemContent}><Type size={16} /><span>Add Block</span></span>
                        <ChevronRight size={14} className={styles.chevron} />
                    </button>

                    {hasSelection && (
                        <>
                            <button type="button" className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handleCopySelection}>
                                <span className={styles.itemContent}><Copy size={16} /><span>Copy</span></span>
                            </button>
                            <button type="button" className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handleCutSelection}>
                                <span className={styles.itemContent}><Scissors size={16} /><span>Cut</span></span>
                            </button>
                            <button type="button" className={`${styles.menuItem} ${styles.dangerItem}`} onMouseEnter={() => setActiveSubmenu(null)} onClick={() => {
                                requestNodeDeletion(Array.from(selectedCanvasNodeIds));
                                onClose();
                            }}>
                                <span className={styles.itemContent}><Trash2 size={16} /><span>Delete selection</span></span>
                            </button>
                        </>
                    )}

                    <button type="button" className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handlePaste}>
                        <span className={styles.itemContent}><ClipboardPaste size={16} /><span>Paste</span></span>
                    </button>

                    <button type="button" className={styles.menuItem} onMouseEnter={() => setActiveSubmenu('select')} onClick={() => setActiveSubmenu('select')}>
                        <span className={styles.itemContent}><Crosshair size={16} /><span>Select</span></span>
                        <ChevronRight size={14} className={styles.chevron} />
                    </button>

                    <button
                        type="button"
                        className={`${styles.menuItem} ${styles.menuButton}`}
                        onMouseEnter={() => setActiveSubmenu(null)}
                        onClick={handleOrganizeCanvas}
                        disabled={!canOrganize}
                        title={canOrganize ? 'Group related nodes and align the canvas' : 'Add at least two nodes to organize'}
                    >
                        <span className={styles.itemContent}><LayoutGrid size={16} /><span>Organize canvas</span></span>
                    </button>

                    <div className={styles.divider} />

                    <button type="button" className={`${styles.menuItem} ${styles.dangerItem}`} onMouseEnter={() => setActiveSubmenu(null)} onClick={handleClearCanvas}>
                        <span className={styles.itemContent}><Trash2 size={16} /><span>Clear canvas</span></span>
                    </button>
                    {clipboardError && <p className={styles.clipboardError} role="status">{clipboardError}</p>}
                </div>

                {activeSubmenu === 'add-block' && (
                    <div className={styles.submenu} style={{ left: submenuX, top: menuY }}>
                        <button type="button" className={styles.submenuHeader} onClick={() => setActiveSubmenu(null)}>
                            <ChevronRight size={14} className={styles.chevronBack} />
                            <span>Add Block</span>
                        </button>
                        <div className={styles.submenuScroll}>
                            {CATEGORIES.map(cat => {
                                const matching = MENU_ITEMS.filter(m => cat.items.includes(m.type));
                                if (matching.length === 0) return null;
                                return (
                                    <div key={cat.label}>
                                        <div className={styles.submenuCategory}>{cat.label}</div>
                                        {matching.map(item => {
                                            const Icon = item.icon;
                                            return (
                                                <button type="button" key={item.label} className={styles.submenuItem} onClick={() => handleAddBlock(item)}>
                                                    <Icon size={16} />
                                                    <span>{item.label}</span>
                                                </button>
                                            );
                                        })}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                )}

                {activeSubmenu === 'select' && (
                    <div className={styles.submenu} style={{ left: submenuX, top: menuY }}>
                        <button type="button" className={styles.submenuHeader} onClick={() => setActiveSubmenu(null)}>
                            <ChevronRight size={14} className={styles.chevronBack} />
                            <span>Select</span>
                        </button>
                        <div className={styles.submenuScroll}>
                            <button type="button" className={styles.submenuItem} onClick={() => selectByType()}>
                                <Crosshair size={16} />
                                <span>Select All</span>
                            </button>
                            <button type="button" className={styles.submenuItem} onClick={() => selectByType('note')}>
                                <LayoutGrid size={16} />
                                <span>Select Cards</span>
                            </button>
                            <button type="button" className={styles.submenuItem} onClick={() => selectByType('fused-note')}>
                                <Columns2 size={16} />
                                <span>Select Docs</span>
                            </button>
                            <button type="button" className={styles.submenuItem} onClick={() => selectByType('block')}>
                                <Type size={16} />
                                <span>Select Blocks</span>
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
