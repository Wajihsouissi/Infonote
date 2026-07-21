import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import {
    Type,
    ClipboardPaste, Camera, Trash2, Crosshair, ChevronRight,
    LayoutGrid, Columns2,
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import html2canvas from 'html2canvas';
import { useStore } from '../../store/useStore';
import type { BlockMetadata } from '../editor/types';
import { MENU_ITEMS } from '../editor/menuConstants';
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
    { label: 'Media', items: ['image', 'video', 'file'] },
    { label: 'Layouts', items: ['columns'] },
    { label: 'Extras', items: ['color'] },
];

export function CanvasContextMenu({ x, y, onClose }: ContextMenuProps) {
    const [activeSubmenu, setActiveSubmenu] = useState<'add-block' | 'select' | null>(null);
    const [showClearConfirm, setShowClearConfirm] = useState(false);
    const menuRef = useRef<HTMLDivElement>(null);

    const nodes = useStore(s => s.nodes);
    const addNode = useStore(s => s.addNode);
    const bulkDeleteNodes = useStore(s => s.bulkDeleteNodes);
    const clearCanvasSelection = useStore(s => s.clearCanvasSelection);
    const setSelectedCanvasNodeIds = useStore(s => s.setSelectedCanvasNodeIds);
    const onNodesChange = useStore(s => s.onNodesChange);
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
                if (showClearConfirm) { setShowClearConfirm(false); return; }
                if (activeSubmenu) { setActiveSubmenu(null); return; }
                onClose();
            }
        };
        window.addEventListener('keydown', handleKey);
        return () => window.removeEventListener('keydown', handleKey);
    }, [onClose, activeSubmenu, showClearConfirm]);

    const handleAddBlock = useCallback((type: string, meta?: BlockMetadata) => {
        const newId = () => crypto.randomUUID?.() || Math.random().toString(36);
        const flowPos = screenToFlowPosition({ x, y });

        // Columns need their metadata seeded with empty column content,
        // otherwise the node renders as an empty box (matches editor slash-command behaviour).
        const metadata = type === 'columns'
            ? {
                columns: Array.from({ length: meta?.count || 2 }).map(() => ({
                    id: newId(),
                    content: [{ id: newId(), type: 'text', content: '' }],
                })),
            }
            : undefined;

        addNode('block', flowPos, {
            content: [{ id: newId(), type, content: '', ...(metadata ? { metadata } : {}) }],
            isStandaloneBlock: true,
        }, { width: type === 'columns' ? Math.max(550, ((meta?.count || 2) === 4 ? 2 : (meta?.count || 2)) * 220) : 432, height: 120 }, currentParentId || undefined);
        onClose();
    }, [x, y, addNode, screenToFlowPosition, onClose, currentParentId]);

    const handlePaste = useCallback(async () => {
        try {
            const text = await navigator.clipboard.readText();
            if (!text) return;
            const flowPos = screenToFlowPosition({ x, y });
            addNode('block', flowPos, {
                content: [{ id: crypto.randomUUID?.() || Math.random().toString(36), type: 'text', content: text }],
                isStandaloneBlock: true,
            }, { width: 432, height: 120 }, currentParentId || undefined);
        } catch (err) {
            console.warn('[CanvasContextMenu] Paste failed:', err);
        }
        onClose();
    }, [x, y, addNode, screenToFlowPosition, onClose, currentParentId]);

    const handleScreenshot = useCallback(async () => {
        const minimap = document.querySelector<HTMLElement>('.react-flow__minimap');
        if (minimap) minimap.style.display = 'none';
        try {
            const canvasEl = document.querySelector('.react-flow') as HTMLElement;
            if (!canvasEl) { onClose(); return; }
            const bg = getComputedStyle(canvasEl).backgroundColor || '#100f12';
            const canvas = await html2canvas(canvasEl, {
                backgroundColor: bg,
                scale: 2,
                useCORS: true,
                logging: false,
            });
            const link = document.createElement('a');
            link.download = `canvas-${Date.now()}.png`;
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (err) {
            console.warn('[CanvasContextMenu] Screenshot failed:', err);
        }
        if (minimap) minimap.style.display = '';
        onClose();
    }, [onClose]);

    const handleClearCanvas = useCallback(() => {
        const targetIds = nodes.filter(n => (n.parentId || null) === (currentParentId || null)).map(n => n.id);
        if (targetIds.length > 0) {
            bulkDeleteNodes(targetIds);
            clearCanvasSelection();
        }
        onClose();
    }, [nodes, bulkDeleteNodes, clearCanvasSelection, onClose, currentParentId]);

    const selectByType = useCallback((type?: string) => {
        const parentCtx = currentParentId || null;
        const filtered = type
            ? nodes.filter(n => (n.parentId || null) === parentCtx && n.type === type)
            : nodes.filter(n => (n.parentId || null) === parentCtx);
        const targetIds = new Set(filtered.map(n => n.id));
        setSelectedCanvasNodeIds(targetIds);
        const changes = nodes.map(n => ({
            type: 'select' as const,
            id: n.id,
            selected: targetIds.has(n.id),
        }));
        onNodesChange(changes);
        onClose();
    }, [nodes, setSelectedCanvasNodeIds, onNodesChange, onClose, currentParentId]);

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

                    <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handlePaste}>
                        <span className={styles.itemContent}><ClipboardPaste size={16} /><span>Paste from clipboard</span></span>
                    </div>

                    <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu('select')} onClick={() => setActiveSubmenu(activeSubmenu === 'select' ? null : 'select')}>
                        <span className={styles.itemContent}><Crosshair size={16} /><span>Select</span></span>
                        <ChevronRight size={14} className={styles.chevron} />
                    </div>

                    <div className={styles.divider} />

                    <div className={styles.menuItem} onMouseEnter={() => setActiveSubmenu(null)} onClick={handleScreenshot}>
                        <span className={styles.itemContent}><Camera size={16} /><span>Screenshot canvas</span></span>
                    </div>

                    {!showClearConfirm ? (
                        <div className={`${styles.menuItem} ${styles.dangerItem}`} onMouseEnter={() => setActiveSubmenu(null)} onClick={() => setShowClearConfirm(true)}>
                            <span className={styles.itemContent}><Trash2 size={16} /><span>Clear canvas</span></span>
                        </div>
                    ) : (
                        <div className={styles.confirmItem} onMouseEnter={() => setActiveSubmenu(null)}>
                            <span className={styles.confirmText}>Clear all nodes?</span>
                            <div className={styles.confirmActions}>
                                <button className={styles.confirmBtn} onClick={handleClearCanvas}>Yes</button>
                                <button className={styles.confirmBtn} onClick={() => setShowClearConfirm(false)}>No</button>
                            </div>
                        </div>
                    )}
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
                                                <div key={item.label} className={styles.submenuItem} onClick={() => handleAddBlock(item.type, item.meta)}>
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
