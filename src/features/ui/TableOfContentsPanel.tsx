import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { 
    X, 
    Search,
    ChevronDown, 
    FileText, 
    Folder, 
    Squircle,
    Sparkles, 
    Lock, 
    Star, 
    Plus, 
    MoreHorizontal, 
    Grid3x3, 
    ChevronsUpDown, 
    ChevronsDownUp,
    Trash2, 
    Copy, 
    Edit3,
    CheckSquare,
    Square,
    Quote,
    Code,
    Info,
    Play,
    Columns2,
    Table,
    Image,
    Link
} from '../../components/icons';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import { useContentNodes } from '../../store/useContentNodes';
import { getNodeBlocks } from '../../types';
import { buildTOCTree, type OutlineItem } from '../../services/tocService';
import styles from './TableOfContentsPanel.module.css';

interface TableOfContentsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function TableOfContentsPanel({ isOpen, onClose, buttonRef }: TableOfContentsPanelProps) {
    const nodes = useContentNodes();
    const currentParentId = useStore(s => s.currentParentId);
    const authEmail = useStore(s => s.auth.email);
    const authDisplayName = useStore(s => s.auth.displayName);
    const addNode = useStore(s => s.addNode);
    const updateNodeData = useStore(s => s.updateNodeData);
    const requestNodeDeletion = useStore(s => s.requestNodeDeletion);
    const bulkDuplicateNodes = useStore(s => s.bulkDuplicateNodes);
    const setSelectedCanvasNodeIds = useStore(s => s.setSelectedCanvasNodeIds);

    const { setCenter, fitView, screenToFlowPosition } = useReactFlow();
    const panelRef = useRef<HTMLDivElement>(null);

    // Resizable panel width state
    const [panelWidth, setPanelWidth] = useState(320);

    // State
    const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
    const [activeItemId, setActiveItemId] = useState<string | null>(null);
    const [hoveredItemId, setHoveredItemId] = useState<string | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: OutlineItem } | null>(null);

    // Handle Drag Resizing (docked on the right side of the canvas)
    const handleMouseDown = useCallback((e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidth = panelWidth;

        if (panelRef.current) {
            panelRef.current.style.transition = 'none';
        }

        const handleMouseMove = (moveEvent: MouseEvent) => {
            // Dragging handle leftwards increases the width of a right-docked panel
            const delta = startX - moveEvent.clientX;
            const nextWidth = Math.min(Math.max(260, startWidth + delta), 650);
            setPanelWidth(nextWidth);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';

            if (panelRef.current) {
                panelRef.current.style.transition = '';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    }, [panelWidth]);

    // Dynamic display name for user / workspace pill
    const displayName = useMemo(() => {
        if (authDisplayName) return authDisplayName;
        if (!authEmail) return 'Morgan Regior';
        const namePart = authEmail.split('@')[0];
        return namePart
            .split(/[._-]/)
            .map((w: string) => w.charAt(0).toUpperCase() + w.slice(1))
            .join(' ') || 'Morgan Regior';
    }, [authDisplayName, authEmail]);

    // Live outline tree strictly built from the current canvas nodes
    const tocTree = useMemo(() => {
        if (!isOpen) return [];
        return buildTOCTree(currentParentId, nodes);
    }, [currentParentId, nodes, isOpen]);

    // Search filtering
    const filteredTOC = useMemo(() => {
        if (!searchQuery.trim()) return tocTree;
        const q = searchQuery.toLowerCase();

        const filterNode = (item: OutlineItem): OutlineItem | null => {
            const labelMatches = item.label.toLowerCase().includes(q);
            const filteredChildren = item.children
                ? item.children.map(filterNode).filter(Boolean) as OutlineItem[]
                : [];

            if (labelMatches || filteredChildren.length > 0) {
                return {
                    ...item,
                    children: filteredChildren
                };
            }
            return null;
        };

        return tocTree.map(filterNode).filter(Boolean) as OutlineItem[];
    }, [tocTree, searchQuery]);

    // Toggle collapse/expand for individual item
    const toggleCollapse = useCallback((id: string, e: React.MouseEvent) => {
        e.stopPropagation();
        setCollapsedItems(prev => {
            const next = new Set(prev);
            if (next.has(id)) {
                next.delete(id);
            } else {
                next.add(id);
            }
            return next;
        });
    }, []);

    // Toggle all items collapse/expand
    const toggleExpandAll = useCallback(() => {
        if (collapsedItems.size > 0) {
            setCollapsedItems(new Set());
        } else {
            const allParentIds = new Set<string>();
            const collectParentIds = (items: OutlineItem[]) => {
                items.forEach(item => {
                    if (item.children && item.children.length > 0) {
                        allParentIds.add(item.id);
                        collectParentIds(item.children);
                    }
                });
            };
            collectParentIds(tocTree);
            setCollapsedItems(allParentIds);
        }
    }, [collapsedItems.size, tocTree]);

    // Toggle Todo status directly from TOC
    const toggleTodoStatus = useCallback((item: OutlineItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const blockId = item.id;
        const ownerNode = nodes.find(n => getNodeBlocks(n.data)?.some(b => b.id === blockId));

        if (ownerNode) {
            const content = (getNodeBlocks(ownerNode.data) ?? []).map((b) => {
                if (b.id === blockId) {
                    return {
                        ...b,
                        metadata: {
                            ...b.metadata,
                            checked: !b.metadata?.checked
                        }
                    };
                }
                return b;
            });

            updateNodeData(ownerNode.id, { content });
            window.dispatchEvent(new CustomEvent('chnk-it-force-editor-sync'));
        }
    }, [nodes, updateNodeData]);

    // Create New Card
    const handleAddNew = useCallback(() => {
        const centerPos = screenToFlowPosition({
            x: window.innerWidth / 2,
            y: window.innerHeight / 2
        });
        addNode('note', centerPos, { label: 'Untitled Note' }, undefined, currentParentId || undefined);
    }, [screenToFlowPosition, addNode, currentParentId]);

    // Add Child inside a specific node
    const handleAddChild = useCallback((parentItem: OutlineItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const parentNode = nodes.find(n => n.id === parentItem.nodeId || n.id === parentItem.id);
        const position = parentNode 
            ? { x: parentNode.position.x + 36, y: parentNode.position.y + 100 }
            : screenToFlowPosition({ x: window.innerWidth / 2, y: window.innerHeight / 2 });

        addNode('note', position, { label: 'New Card' }, undefined, parentItem.nodeId || parentItem.id);
        setCollapsedItems(prev => {
            const next = new Set(prev);
            next.delete(parentItem.id);
            return next;
        });
    }, [nodes, screenToFlowPosition, addNode]);

    // Focus and select the element on the canvas
    const handleItemClick = useCallback((item: OutlineItem) => {
        setActiveItemId(item.id);
        
        // Find owner node
        const ownerNode = nodes.find(n => 
            n.id === item.id || 
            n.id === item.nodeId || 
            getNodeBlocks(n.data)?.some(b => b.id === item.id)
        );

        if (ownerNode) {
            // Select the node on canvas
            setSelectedCanvasNodeIds(new Set([ownerNode.id]));

            const width = (ownerNode.style?.width as number) || 420;
            const height = (ownerNode.style?.height as number) || 300;
            const x = ownerNode.position.x + width / 2;
            const y = ownerNode.position.y + height / 2;

            setCenter(x, y, { zoom: 1.15, duration: 600 });

            // Trigger highlight flash on the card
            const cardEl = document.getElementById(ownerNode.id);
            if (cardEl) {
                cardEl.classList.add('chnk-it-highlight-flash');
                setTimeout(() => cardEl.classList.remove('chnk-it-highlight-flash'), 1600);
            }

            // If it's a specific block inside the card, scroll to it and highlight
            if (item.targetId && item.targetId.startsWith('block-')) {
                setTimeout(() => {
                    const blockEl = document.getElementById(item.targetId);
                    if (blockEl) {
                        blockEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        blockEl.classList.add('chnk-it-highlight-flash');
                        setTimeout(() => blockEl.classList.remove('chnk-it-highlight-flash'), 1600);
                    }
                }, 350);
            }
        }
    }, [nodes, setCenter, setSelectedCanvasNodeIds]);

    // Context Menu Trigger
    const openContextMenu = useCallback((item: OutlineItem, e: React.MouseEvent) => {
        e.stopPropagation();
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setContextMenu({
            x: rect.left,
            y: rect.bottom + 4,
            item
        });
    }, []);

    // Outside click listener
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (contextMenu) {
                setContextMenu(null);
            }
            if (!isOpen) return;

            const clickedInsidePanel = panelRef.current?.contains(e.target as Node);
            const clickedOnButton = buttonRef?.current?.contains(e.target as Node);
            const clickedInMenu = (e.target as HTMLElement | null)?.closest?.('[data-app-menu]');

            if (!clickedInsidePanel && !clickedOnButton && !clickedInMenu && !contextMenu) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, buttonRef, contextMenu]);

    // Render node icons:
    // Card -> Folder icon
    // Fused node -> File icon
    // Headers -> H1, H2, H3 badges
    // Bullet -> Bullet dot
    // Numbered -> Sequential number badge
    // Todo -> Interactive CheckSquare / Square
    const renderNodeIcon = (item: OutlineItem) => {
        if (item.type === 'card' || item.type === 'page' || item.nodeType === 'note') {
            return <Folder size={14} className={styles.iconFolder} />;
        }
        if (item.type === 'fused-note' || item.nodeType === 'fused-note') {
            return <FileText size={14} className={styles.iconFile} />;
        }
        if (item.type === 'kanban' || item.nodeType === 'kanban') {
            return <Columns2 size={14} className={styles.iconFile} />;
        }

        switch (item.iconVariant) {
            case 'h1':
                return <span className={styles.headingBadge}>H1</span>;
            case 'h2':
                return <span className={styles.headingBadge}>H2</span>;
            case 'h3':
                return <span className={styles.headingBadge}>H3</span>;
            case 'bullet':
                return <span className={styles.bulletDot}>•</span>;
            case 'numbered':
                return <span className={styles.numberBadge}>{item.listIndex !== undefined ? `${item.listIndex}.` : '1.'}</span>;
            case 'todo':
                return item.checked ? (
                    <span 
                        title="Mark incomplete"
                        onClick={(e) => toggleTodoStatus(item, e)}
                        className={styles.todoIconWrapper}
                    >
                        <CheckSquare size={13} className={styles.todoChecked} />
                    </span>
                ) : (
                    <span 
                        title="Mark complete"
                        onClick={(e) => toggleTodoStatus(item, e)}
                        className={styles.todoIconWrapper}
                    >
                        <Square size={13} className={styles.todoUnchecked} />
                    </span>
                );
            case 'quote':
                return <Quote size={12} className={styles.iconBlock} />;
            case 'code':
                return <Code size={13} className={styles.iconBlock} />;
            case 'callout':
                return <Info size={13} className={styles.iconBlock} />;
            case 'toggle':
                return <Play size={10} style={{ transform: 'rotate(90deg)' }} className={styles.iconBlock} />;
            case 'table':
                return <Table size={13} className={styles.iconBlock} />;
            case 'image':
                return <Image size={13} className={styles.iconBlock} />;
            case 'link':
                return <Link size={13} className={styles.iconBlock} />;
            case 'ai':
                return <Sparkles size={13} className={styles.iconBlock} />;
            case 'file':
                return <FileText size={14} className={styles.iconFile} />;
            case 'folder':
                return <Folder size={14} className={styles.iconFolder} />;
            default:
                return <Squircle size={13} className={styles.iconBlock} />;
        }
    };

    // Recursive Tree Node Renderer
    const renderTreeNode = (item: OutlineItem, depth = 0) => {
        const hasChildren = item.children && item.children.length > 0;
        const isCollapsed = collapsedItems.has(item.id) && !searchQuery;
        const isActive = activeItemId === item.id;
        const isCompletedTodo = item.type === 'todo' && item.checked;

        return (
            <div key={item.id} className={styles.nodeItemWrapper}>
                {/* Branch elbow connector line */}
                {depth > 0 && (
                    <div 
                        className={styles.branchElbow} 
                        style={{ left: `${(depth - 1) * 16 + 12}px` }} 
                    />
                )}

                <div 
                    className={`
                        ${styles.nodeRow} 
                        ${isActive ? styles.nodeRowActive : ''}
                    `}
                    style={{ paddingLeft: `${depth * 16 + 6}px` }}
                    onClick={() => handleItemClick(item)}
                    onMouseEnter={() => setHoveredItemId(item.id)}
                    onMouseLeave={() => setHoveredItemId(null)}
                >
                    {/* Expand/Collapse Caret */}
                    {hasChildren ? (
                        <button 
                            className={`
                                ${styles.expandBtn} 
                                ${isCollapsed ? styles.expandBtnCollapsed : styles.expandBtnExpanded}
                            `}
                            onClick={(e) => toggleCollapse(item.id, e)}
                            title={isCollapsed ? "Expand" : "Collapse"}
                        >
                            <ChevronDown size={13} />
                        </button>
                    ) : (
                        <div style={{ width: 14, flexShrink: 0 }} />
                    )}

                    {/* Node Icon */}
                    <div className={styles.nodeIcon}>
                        {renderNodeIcon(item)}
                    </div>

                    {/* Node Label */}
                    <span className={`
                        ${styles.nodeLabel} 
                        ${isActive ? styles.nodeLabelActive : ''}
                        ${isCompletedTodo ? styles.todoCompletedText : ''}
                    `}>
                        {item.label}
                    </span>

                    {/* Lock Icon */}
                    {item.isLocked && (
                        <span className={styles.lockIcon} title="Locked item">
                            <Lock size={12} />
                        </span>
                    )}

                    {/* Right-aligned Meta (Counters or Favorite Star) */}
                    <div className={styles.rightMeta}>
                        {item.isFavorite && (
                            <Star size={13} className={styles.starBadge} />
                        )}
                        {item.childCount !== undefined && !item.isFavorite && (
                            <span className={styles.countText}>
                                {item.childCount}
                            </span>
                        )}
                    </div>

                    {/* Hover Quick Actions */}
                    <div className={styles.hoverActions}>
                        <button 
                            className={styles.quickActionBtn}
                            onClick={(e) => handleAddChild(item, e)}
                            title="Add sub-item"
                        >
                            <Plus size={13} />
                        </button>
                        <button 
                            className={styles.quickActionBtn}
                            onClick={(e) => openContextMenu(item, e)}
                            title="Options"
                        >
                            <MoreHorizontal size={13} />
                        </button>
                    </div>
                </div>

                {/* Recursive Children with branch guide */}
                {hasChildren && !isCollapsed && (
                    <div className={styles.treeWrapper}>
                        {/* Vertical line guide for children */}
                        <div 
                            className={styles.verticalGuideLine} 
                            style={{ left: `${depth * 16 + 12}px` }} 
                        />
                        {item.children.map((child) => 
                            renderTreeNode(child, depth + 1)
                        )}
                    </div>
                )}
            </div>
        );
    };

    const showPanel = isOpen;

    return (
        <div 
            ref={panelRef}
            className={`${styles.panel} ${showPanel ? styles.panelOpen : styles.panelClosed}`}
            style={{ width: showPanel ? panelWidth : 0 }}
        >
            {/* Resize Handle on the left edge */}
            {showPanel && (
                <div 
                    className={styles.resizeHandle}
                    onMouseDown={handleMouseDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label="Resize outline panel"
                >
                    <span className={styles.resizeGrip} aria-hidden="true" />
                    <span className={styles.resizeTooltip}>Resize</span>
                </div>
            )}

            {/* Header: Sits on panel chrome matching app topbar */}
            <div className={styles.header}>
                <div className={styles.userChip} title="Workspace Navigator">
                    <div className={styles.avatarContainer}>
                        <img 
                            src="https://images.unsplash.com/photo-1534528741775-53994a69daeb?w=64&h=64&fit=crop&crop=faces" 
                            alt="Avatar" 
                            className={styles.avatarImage} 
                            onError={(e) => {
                                (e.currentTarget as HTMLElement).style.display = 'none';
                            }}
                        />
                    </div>
                    <span className={styles.userNameText}>{displayName}</span>
                    <ChevronsUpDown size={12} className={styles.userChipChevron} />
                </div>

                <div className={styles.headerActions}>
                    <button 
                        className={styles.headerIconBtn} 
                        onClick={toggleExpandAll}
                        title={collapsedItems.size > 0 ? "Expand all" : "Collapse all"}
                    >
                        {collapsedItems.size > 0 ? <ChevronsUpDown size={14} /> : <ChevronsDownUp size={14} />}
                    </button>
                    <button 
                        className={styles.headerIconBtn} 
                        onClick={onClose} 
                        title="Close outline"
                    >
                        <X size={15} />
                    </button>
                </div>
            </div>

            {/* Panel Inset Body */}
            <div className={styles.panelBody}>
                {/* Action Row: + Add new card */}
                <div className={styles.actionRow}>
                    <button className={styles.addNewBtn} onClick={handleAddNew}>
                        <Plus size={14} />
                        <span>Add new</span>
                    </button>
                    <span className={styles.itemCountTotal}>
                        {tocTree.length} {tocTree.length === 1 ? 'item' : 'items'}
                    </span>
                </div>

                {/* Search Bar */}
                <div className={styles.searchContainer}>
                    <Search size={13} className={styles.searchIcon} />
                    <input 
                        type="text" 
                        className={styles.searchInput}
                        placeholder="Search outline..."
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                    />
                    {searchQuery && (
                        <button className={styles.clearSearchBtn} onClick={() => setSearchQuery('')} title="Clear search">
                            <X size={12} />
                        </button>
                    )}
                </div>

                {/* Scrollable Tree Area */}
                <div className={styles.treeScrollArea}>
                    {filteredTOC.length === 0 ? (
                        <div className={styles.emptyState}>
                            <FileText size={26} className={styles.emptyStateIcon} />
                            <span>{searchQuery ? 'No matching items found' : 'No notes on canvas'}</span>
                        </div>
                    ) : (
                        <div className={styles.treeWrapper}>
                            {filteredTOC.map((item) => 
                                renderTreeNode(item, 0)
                            )}
                        </div>
                    )}
                </div>

                {/* Footer: Browse All */}
                <div className={styles.cardFooter}>
                    <button 
                        className={styles.browseAllBtn}
                        onClick={() => fitView({ padding: 0.25, duration: 600 })}
                        title="Fit view to show all canvas items"
                    >
                        <Grid3x3 size={14} />
                        <span>Browse all</span>
                    </button>
                </div>
            </div>

            {/* Context Menu Dropdown */}
            {contextMenu && (
                <div 
                    className={styles.contextMenu}
                    style={{ 
                        left: Math.min(contextMenu.x, window.innerWidth - 160), 
                        top: contextMenu.y 
                    }}
                >
                    <button 
                        className={styles.contextMenuItem}
                        onClick={() => {
                            const newTitle = prompt('Rename note:', contextMenu.item.label);
                            if (newTitle && contextMenu.item.nodeId) {
                                updateNodeData(contextMenu.item.nodeId, { label: newTitle });
                            }
                            setContextMenu(null);
                        }}
                    >
                        <Edit3 size={13} />
                        <span>Rename</span>
                    </button>

                    <button 
                        className={styles.contextMenuItem}
                        onClick={() => {
                            if (contextMenu.item.nodeId) {
                                bulkDuplicateNodes([contextMenu.item.nodeId]);
                            }
                            setContextMenu(null);
                        }}
                    >
                        <Copy size={13} />
                        <span>Duplicate</span>
                    </button>

                    <button 
                        className={styles.contextMenuItem}
                        onClick={() => {
                            if (contextMenu.item.nodeId) {
                                const targetNode = nodes.find(n => n.id === contextMenu.item.nodeId);
                                const isCurrentPinned = (targetNode?.data as any)?.isPinned;
                                updateNodeData(contextMenu.item.nodeId, { isPinned: !isCurrentPinned });
                            }
                            setContextMenu(null);
                        }}
                    >
                        <Star size={13} />
                        <span>Favorite</span>
                    </button>

                    <button 
                        className={styles.contextMenuItem}
                        onClick={() => {
                            if (contextMenu.item.nodeId) {
                                const targetNode = nodes.find(n => n.id === contextMenu.item.nodeId);
                                const isLocked = (targetNode?.data as any)?.isLocked;
                                updateNodeData(contextMenu.item.nodeId, { isLocked: !isLocked });
                            }
                            setContextMenu(null);
                        }}
                    >
                        <Lock size={13} />
                        <span>Toggle Lock</span>
                    </button>

                    <button 
                        className={`${styles.contextMenuItem} ${styles.contextMenuItemDanger}`}
                        onClick={() => {
                            if (contextMenu.item.nodeId) {
                                requestNodeDeletion([contextMenu.item.nodeId]);
                            }
                            setContextMenu(null);
                        }}
                    >
                        <Trash2 size={13} />
                        <span>Delete</span>
                    </button>
                </div>
            )}
        </div>
    );
}
