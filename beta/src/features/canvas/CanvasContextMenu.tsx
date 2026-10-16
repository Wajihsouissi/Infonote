import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { v4 as uuidv4 } from 'uuid';
import {
    Type,
    ClipboardPaste, Trash2, Crosshair, ChevronRight,
    LayoutGrid, Columns2, Copy, Scissors,
} from '../../components/icons';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import { MENU_ITEMS, type MenuItem } from '../editor/menuConstants';
import { createMenuBlock, menuBlockNodeSize } from '../editor/menuBlocks';
import { decodePayload, payloadBlocks } from '../clipboard/clipboardPayload';
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
    const menuRef = useRef<HTMLDivElement>(null);

    const nodes = useStore(s => s.nodes);
    const addNode = useStore(s => s.addNode);
    const requestNodeDeletion = useStore(s => s.requestNodeDeletion);
    const setSelectedCanvasNodeIds = useStore(s => s.setSelectedCanvasNodeIds);
    const pasteClipboardNodes = useStore(s => s.pasteClipboardNodes);
    const organizeCanvas = useStore(s => s.organizeCanvas);
    const currentParentId = useStore(s => s.currentParentId);
    const { screenToFlowPosition } = useReactFlow();

    useEffect(() => {
        const handleClick = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                onClose();
            }
        };
        requestAnimationFrame(() => {
            document.addEventListener('mousedown', handleClick);
        });
        return () => document.removeEventListener('mousedown', handleClick);
    }, [onClose]);

    useEffect(() => {
        const handleKey = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                if (activeSubmenu) { setActiveSubmenu(null); return; }
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
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
        document.execCommand('copy');
        onClose();
    }, [onClose]);

    const handleCutSelection = useCallback(() => {
        document.execCommand('cut');
        onClose();
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

            const payload = decodePayload(html);
            if (payload?.kind === 'nodes') {
                pasteClipboardNodes(payload, flowPos);
                onClose();
                return;
            }

            const blocks = payload ? payloadBlocks(payload) : null;
            if (blocks && blocks.length > 0) {
                addNode('fused-note', flowPos, { content: blocks, isStandaloneBlock: true },
                    { width: 432, height: 120 }, currentParentId || undefined);
                onClose();
                return;
            }

            if (!text) return;
            addNode('block', flowPos, {
                content: [{ id: uuidv4(), type: 'text', content: text }],
                isStandaloneBlock: true,
            }, { width: 432, height: 120 }, currentParentId || undefined);
        } catch (err) {
            console.warn('[CanvasContextMenu] Paste failed:', err);
        }
        onClose();
    }, [x, y, addNode, screenToFlowPosition, onClose, currentParentId, pasteClipboardNodes]);

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
    const menuX = Math.min(x, window.innerWidth - menuWidth - screenMargin);
    const menuY = Math.min(y, window.innerHeight - 380);
    const submenuX = (x + menuWidth + 8 + submenuWidth > window.innerWidth)
        ? menuX - submenuWidth - 8
        : menuX + menuWidth + 8;

    return createPortal(
        <div className={styles.overlay}>
            <div ref={menuRef}>
                <div className={styles.menu} style={{ left: menuX, top: menuY }}>
                    <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu('add-block')} onClick={() => setActiveSubmenu(activeSubmenu === 'add-block' ? null : 'add-block')}>
                        <span className={styles.itemContent}><Type size={16} /><span>Add Block</span></span>
                        <ChevronRight size={14} className={styles.chevron} />
                    </div>

                    {hasSelection && (
                        <>
                            <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handleCopySelection}>
                                <span className={styles.itemContent}><Copy size={16} /><span>Copy</span></span>
                            </div>
                            <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handleCutSelection}>
                                <span className={styles.itemContent}><Scissors size={16} /><span>Cut</span></span>
                            </div>
                        </>
                    )}

                    <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handlePaste}>
                        <span className={styles.itemContent}><ClipboardPaste size={16} /><span>Paste</span></span>
                    </div>

                    <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu('select')} onClick={() => setActiveSubmenu(activeSubmenu === 'select' ? null : 'select')}>
                        <span className={styles.itemContent}><Crosshair size={16} /><span>Select</span></span>
                        <ChevronRight size={14} className={styles.chevron} />
                    </div>

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

                    <div className={`${styles.menuItem} ${styles.dangerItem}`} onMouseEnter={() => setActiveSubmenu(null)} onClick={handleClearCanvas}>
                        <span className={styles.itemContent}><Trash2 size={16} /><span>Clear canvas</span></span>
                    </div>
                </div>

                {activeSubmenu === 'add-block' && (
                    <div className={styles.submenu} style={{ left: submenuX, top: menuY }}>
                        <div className={styles.submenuHeader} onClick={() => setActiveSubmenu(null)}>
                            <ChevronRight size={14} className={styles.chevronBack} />
                            <span>Add Block</span>
                        </div>
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
                                                <div key={item.label} className={styles.submenuItem} onClick={() => handleAddBlock(item)}>
                                                    <Icon size={16} />
                                                    <span>{item.label}</span>
                                                </div>
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
                        <div className={styles.submenuHeader} onClick={() => setActiveSubmenu(null)}>
                            <ChevronRight size={14} className={styles.chevronBack} />
                            <span>Select</span>
                        </div>
                        <div className={styles.submenuScroll}>
                            <div className={styles.submenuItem} onClick={() => selectByType()}>
                                <Crosshair size={16} />
                                <span>Select All</span>
                            </div>
                            <div className={styles.submenuItem} onClick={() => selectByType('note')}>
                                <LayoutGrid size={16} />
                                <span>Select Cards</span>
                            </div>
                            <div className={styles.submenuItem} onClick={() => selectByType('fused-note')}>
                                <Columns2 size={16} />
                                <span>Select Docs</span>
                            </div>
                            <div className={styles.submenuItem} onClick={() => selectByType('block')}>
                                <Type size={16} />
                                <span>Select Blocks</span>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>,
        document.body
    );
}
