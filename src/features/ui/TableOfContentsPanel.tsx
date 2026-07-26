import { useState, useEffect, useRef, useMemo } from 'react';
import { 
    X, 
    ChevronDown, 
    ChevronUp,
    FileText,
    ListCollapse,
    ArrowRight,
    StickyNote,
    CheckSquare,
    Square,
    Info,
    Quote,
    Code,
    Play,
    ListTodo,
    ChevronsUpDown,
    ChevronsDownUp
} from 'lucide-react';
import { useReactFlow } from '@xyflow/react';
import { useStore } from '../../store/useStore';
import { type AppNode, getNodeBlocks } from '../../types';
import { buildTOCTree, type OutlineItem } from '../../services/tocService';
import styles from './TableOfContentsPanel.module.css';

interface TableOfContentsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function TableOfContentsPanel({ isOpen, onClose, buttonRef }: TableOfContentsPanelProps) {
    const nodes = useStore(s => s.nodes);
    const currentParentId = useStore(s => s.currentParentId);
    const navigateToNode = useStore(s => s.navigateToNode);
    const { setCenter } = useReactFlow();

    const panelRef = useRef<HTMLDivElement>(null);
    
    // Local state for tracking collapsed items in the TOC tree
    const [collapsedItems, setCollapsedItems] = useState<Set<string>>(new Set());
    
    // Active section state for scroll spy
    const [activeBlockId, setActiveBlockId] = useState<string | null>(null);

    // Search query state
    const [searchQuery, setSearchQuery] = useState('');

    // Compute the outline tree in real-time
    const tocTree = useMemo(() => {
        if (!isOpen) return [];
        return buildTOCTree(currentParentId, nodes);
    }, [currentParentId, nodes, isOpen]);

    // Calculate checklist statistics
    const todoStats = useMemo(() => {
        let total = 0;
        let completed = 0;
        const traverse = (items: OutlineItem[]) => {
            items.forEach(item => {
                if (item.type === 'todo') {
                    total++;
                    if (item.checked) completed++;
                }
                if (item.children && item.children.length > 0) {
                    traverse(item.children);
                }
            });
        };
        traverse(tocTree);
        return { 
            total, 
            completed, 
            percent: total > 0 ? Math.round((completed / total) * 100) : 0 
        };
    }, [tocTree]);

    // Handle completing tasks directly from TOC
    const toggleTodoStatus = (item: OutlineItem, e: React.MouseEvent) => {
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

            useStore.getState().updateNodeData(ownerNode.id, { content });
            window.dispatchEvent(new CustomEvent('chnk-it-force-editor-sync'));
        }
    };

    const renderItemIcon = (item: OutlineItem) => {
        switch (item.type) {
            case 'heading1':
                return <span className={styles.headingBadge} style={{ color: 'var(--accent-ink)' }}>H1</span>;
            case 'heading2':
                return <span className={styles.headingBadge} style={{ color: 'var(--accent-ink)' }}>H2</span>;
            case 'heading3':
                return <span className={styles.headingBadge} style={{ color: 'var(--secondary-ink)' }}>H3</span>;
            case 'page':
                return <StickyNote size={13} className={styles.cardIcon} />;
            case 'toggle':
                return <Play size={10} style={{ fill: '#34d399', stroke: '#34d399', transform: 'rotate(90deg)', marginRight: '4px', opacity: 0.8 }} />;
            case 'todo':
                return item.checked ? (
                    <CheckSquare 
                        size={13} 
                        className={styles.todoCheckedIcon} 
                        onClick={(e) => toggleTodoStatus(item, e)}
                        style={{ cursor: 'pointer', color: '#10b981' }}
                    />
                ) : (
                    <Square 
                        size={13} 
                        className={styles.todoUncheckedIcon} 
                        onClick={(e) => toggleTodoStatus(item, e)}
                        style={{ cursor: 'pointer', color: 'rgba(255,255,255,0.4)' }}
                    />
                );
            case 'callout':
                return <Info size={13} style={{ color: 'var(--secondary-ink)' }} />;
            case 'quote':
                return <Quote size={11} style={{ color: '#fbbf24', opacity: 0.8 }} />;
            case 'code':
                return <Code size={13} style={{ color: '#f87171' }} />;
            default:
                return null;
        }
    };

    // Recursive search filter: retains hierarchical parents for matches
    const filteredTOC = useMemo(() => {
        if (!searchQuery.trim()) return tocTree;
        
        const query = searchQuery.toLowerCase();
        
        const filterNode = (item: OutlineItem): OutlineItem | null => {
            const labelMatches = item.label.toLowerCase().includes(query);
            
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

    // Handle outside clicks to close the TOC panel
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!isOpen) return;

            const clickedInsidePanel = panelRef.current?.contains(e.target as Node);
            const clickedOnButton = buttonRef?.current?.contains(e.target as Node);

            if (!clickedInsidePanel && !clickedOnButton) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, buttonRef]);

    // Close on Escape key
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    // Scroll spy: track active heading element closest to viewport
    useEffect(() => {
        if (!isOpen) return;

        const spyInterval = setInterval(() => {
            const query = '[data-block-type="heading1"], [data-block-type="heading2"], [data-block-type="heading3"], [data-block-type="toggle"], [data-block-type="page"], [id^="block-"], .react-flow__node';
            const elements = document.querySelectorAll(query);
            
            let activeId: string | null = null;
            let closestTop = Infinity;

            elements.forEach(el => {
                const rect = el.getBoundingClientRect();
                
                let rawId = el.id;
                if (rawId.startsWith('block-')) {
                    rawId = rawId.replace('block-', '');
                }

                if (rect.top >= 0 && rect.top < window.innerHeight * 0.35) {
                    if (rect.top < closestTop) {
                        closestTop = rect.top;
                        activeId = rawId;
                    }
                }
            });

            if (activeId && activeId !== activeBlockId) {
                setActiveBlockId(activeId);
            }
        }, 200);

        return () => clearInterval(spyInterval);
    }, [isOpen, activeBlockId]);



    // Rearrange item reorder feature (swaps visual coordinates or block indices)
    const moveItem = (item: OutlineItem, direction: 'up' | 'down') => {
        // Case A: Page Card Node (adjust visual coordinate order)
        if (item.type === 'page' && item.nodeId) {
            const targetNode = nodes.find(n => n.id === item.nodeId);
            if (!targetNode) return;

            const siblings = nodes.filter(n => 
                (n.parentId === targetNode.parentId || (!n.parentId && !targetNode.parentId)) && 
                ['fused-note', 'block', 'note', 'kanban'].includes(n.type)
            );
            
            const sortedSiblings = [...siblings].sort((a, b) => {
                const yDiff = a.position.y - b.position.y;
                if (Math.abs(yDiff) > 15) return yDiff;
                return a.position.x - b.position.x;
            });

            const index = sortedSiblings.findIndex(n => n.id === targetNode.id);
            if (index === -1) return;

            const swapIndex = direction === 'up' ? index - 1 : index + 1;
            if (swapIndex < 0 || swapIndex >= sortedSiblings.length) return;

            const swapNode = sortedSiblings[swapIndex];
            const tempY = targetNode.position.y;
            const tempX = targetNode.position.x;
            
            const updatedNodes = nodes.map(n => {
                if (n.id === targetNode.id) {
                    return { 
                        ...n, 
                        position: { ...n.position, x: swapNode.position.x, y: swapNode.position.y } 
                    };
                }
                if (n.id === swapNode.id) {
                    return { 
                        ...n, 
                        position: { ...n.position, x: tempX, y: tempY } 
                    };
                }
                return n;
            }) as AppNode[];

            useStore.getState().setNodes(updatedNodes);

            // Sync parent node content to reflect the new visual order of children!
            if (targetNode.parentId) {
                useStore.getState().syncParentContent(targetNode.parentId);
            }
            return;
        }

        // Case B: Block/Heading inside Card (swap array elements)
        const blockId = item.id;
        const ownerNode = nodes.find(n => getNodeBlocks(n.data)?.some(b => b.id === blockId));

        if (ownerNode) {
            const content = [...(getNodeBlocks(ownerNode.data) ?? [])];
            const index = content.findIndex((b) => b.id === blockId);
            if (index === -1) return;

            const swapIndex = direction === 'up' ? index - 1 : index + 1;
            if (swapIndex < 0 || swapIndex >= content.length) return;

            const temp = content[index];
            content[index] = content[swapIndex];
            content[swapIndex] = temp;

            // Use the standard and robust store action updateNodeData!
            useStore.getState().updateNodeData(ownerNode.id, { content });

            // Dispatch custom force editor sync event so active editors immediately receive the new blocks list!
            window.dispatchEvent(new CustomEvent('chnk-it-force-editor-sync'));
        }
    };

    // Toggle local branch collapse
    const toggleCollapse = (id: string, e: React.MouseEvent) => {
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
    };

    // Smooth scroll and highlight focus handler
    const handleItemClick = (item: OutlineItem) => {
        // Case 1: Page Block (references a nested canvas card node)
        if (item.type === 'page' && item.nodeId) {
            if (item.nodeId === currentParentId) {
                return;
            }

            const targetNode = nodes.find(n => n.id === item.nodeId);
            
            if (targetNode) {
                if (targetNode.parentId === currentParentId) {
                    const width = targetNode.style?.width as number || 432;
                    const height = targetNode.style?.height as number || 432;
                    const x = targetNode.position.x + width / 2;
                    const y = targetNode.position.y + height / 2;
                    
                    setCenter(x, y, { zoom: 1.1, duration: 800 });

                    setTimeout(() => {
                        const el = document.getElementById(targetNode.id);
                        if (el) {
                            el.classList.add('chnk-it-highlight-flash');
                            setTimeout(() => el.classList.remove('chnk-it-highlight-flash'), 1600);
                        }
                    }, 400);
                } else {
                    const parentNodeId = targetNode.parentId || null;
                    navigateToNode(parentNodeId);
                    
                    setTimeout(() => {
                        const freshTargetNode = useStore.getState().nodes.find(n => n.id === item.nodeId);
                        if (freshTargetNode) {
                            const width = freshTargetNode.style?.width as number || 432;
                            const height = freshTargetNode.style?.height as number || 432;
                            const x = freshTargetNode.position.x + width / 2;
                            const y = freshTargetNode.position.y + height / 2;
                            
                            setCenter(x, y, { zoom: 1.1, duration: 800 });

                            setTimeout(() => {
                                const el = document.getElementById(freshTargetNode.id);
                                if (el) {
                                    el.classList.add('chnk-it-highlight-flash');
                                    setTimeout(() => el.classList.remove('chnk-it-highlight-flash'), 1600);
                                }
                            }, 400);
                        }
                    }, 300);
                }
            }
            return;
        }

        // Case 2: Block within a canvas card (headings, toggles, etc.)
        const blockId = item.id;
        const ownerNode = nodes.find(n => getNodeBlocks(n.data)?.some(b => b.id === blockId));

        if (ownerNode) {
            if (ownerNode.id === currentParentId) {
                const element = document.getElementById(`block-${blockId}`);
                if (element) {
                    element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    element.classList.add('chnk-it-highlight-flash');
                    setTimeout(() => element.classList.remove('chnk-it-highlight-flash'), 1600);
                }
            } else if (
                ownerNode.parentId === currentParentId || 
                (ownerNode.parentId === undefined && currentParentId === null)
            ) {
                const width = ownerNode.style?.width as number || 432;
                const height = ownerNode.style?.height as number || 432;
                const x = ownerNode.position.x + width / 2;
                const y = ownerNode.position.y + height / 2;
                
                setCenter(x, y, { zoom: 1.1, duration: 800 });

                const cardEl = document.getElementById(ownerNode.id);
                if (cardEl) {
                    cardEl.classList.add('chnk-it-highlight-flash');
                    setTimeout(() => cardEl.classList.remove('chnk-it-highlight-flash'), 1600);
                }

                setTimeout(() => {
                    const element = document.getElementById(`block-${blockId}`);
                    if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        element.classList.add('chnk-it-highlight-flash');
                        setTimeout(() => element.classList.remove('chnk-it-highlight-flash'), 1600);
                    }
                }, 500);
            } else {
                const parentNodeId = ownerNode.parentId || null;
                navigateToNode(parentNodeId);
                
                setTimeout(() => {
                    const freshNodes = useStore.getState().nodes;
                    const freshOwnerNode = freshNodes.find(n => n.id === ownerNode.id);
                    if (freshOwnerNode) {
                        const width = freshOwnerNode.style?.width as number || 432;
                        const height = freshOwnerNode.style?.height as number || 432;
                        const x = freshOwnerNode.position.x + width / 2;
                        const y = freshOwnerNode.position.y + height / 2;
                        
                        setCenter(x, y, { zoom: 1.1, duration: 800 });

                        const cardEl = document.getElementById(freshOwnerNode.id);
                        if (cardEl) {
                            cardEl.classList.add('chnk-it-highlight-flash');
                            setTimeout(() => cardEl.classList.remove('chnk-it-highlight-flash'), 1600);
                        }

                        setTimeout(() => {
                            const element = document.getElementById(`block-${blockId}`);
                            if (element) {
                                element.scrollIntoView({ behavior: 'smooth', block: 'center' });
                                element.classList.add('chnk-it-highlight-flash');
                                setTimeout(() => element.classList.remove('chnk-it-highlight-flash'), 1600);
                            }
                        }, 500);
                    }
                }, 300);
            }
        }
    };

    // Recursive renderer for outline items
    const renderTOCItem = (item: OutlineItem, depth = 0) => {
        const isCollapsed = collapsedItems.has(item.id) && !searchQuery;
        const hasChildren = item.children && item.children.length > 0;
        const isActive = activeBlockId === item.id || (item.type === 'page' && activeBlockId === item.nodeId);

        return (
            <div key={item.id} className={item.type === 'page' ? styles.itemWrapper : `${styles.itemWrapper} ${item.type === 'todo' && item.checked ? styles.todoItemCompleted : ''}`}>
                <div 
                    className={`
                        ${styles.itemRow} 
                        ${styles[item.type] || ''} 
                        ${isActive ? styles.itemActive : ''}
                        ${item.type === 'todo' && item.checked ? styles.todoItemCompleted : ''}
                    `}
                    style={{ 
                        paddingLeft: `${depth * 14 + (hasChildren ? 6 : 22)}px`,
                        '--indent-line-left': `${(depth - 1) * 14 + 14}px`,
                        '--indent-line-display': depth > 0 ? 'block' : 'none'
                    } as React.CSSProperties}
                    onClick={() => handleItemClick(item)}
                >
                    {hasChildren && (
                        <button 
                            className={`${styles.collapseIcon} ${isCollapsed ? styles.collapsed : styles.expanded}`}
                            onClick={(e) => toggleCollapse(item.id, e)}
                        >
                            <ChevronDown size={14} />
                        </button>
                    )}
                    <div className={styles.itemIconContainer}>
                        {renderItemIcon(item)}
                    </div>
                    <span className={styles.itemLabel}>{item.label}</span>
                    
                    <div className={styles.rowControls}>
                        <button
                            className={styles.rearrangeBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                moveItem(item, 'up');
                            }}
                            title="Move Up"
                        >
                            <ChevronUp size={12} />
                        </button>
                        <button
                            className={styles.rearrangeBtn}
                            onClick={(e) => {
                                e.stopPropagation();
                                moveItem(item, 'down');
                            }}
                            title="Move Down"
                        >
                            <ChevronDown size={12} />
                        </button>
                        
                        {item.nodeId && (
                            <button
                                className={styles.navigateBtn}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (item.nodeId) {
                                        navigateToNode(item.nodeId);
                                    }
                                }}
                                title="Navigate inside this card"
                            >
                                <ArrowRight size={12} />
                            </button>
                        )}
                    </div>
                </div>

                {hasChildren && (
                    <div 
                        className={`
                            ${styles.childrenContainer} 
                            ${isCollapsed ? styles.childrenContainerCollapsed : ''}
                        `}
                    >
                        {item.children.map(child => renderTOCItem(child, depth + 1))}
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
        >
            {/* Slideout Panel Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <ListCollapse size={16} style={{ color: 'var(--color-primary)' }} />
                    <span className={styles.headerTitle}>Outline</span>
                </div>
                <div className={styles.headerActions}>
                    <div 
                        className={styles.switcherTrack}
                        title={collapsedItems.size === 0 ? "Collapse All Items" : "Expand All Items"}
                    >
                        <div 
                            className={`
                                ${styles.switcherSlider} 
                                ${collapsedItems.size === 0 ? styles.sliderLeft : styles.sliderRight}
                            `} 
                        />
                        <button 
                            className={`${styles.switcherOption} ${collapsedItems.size === 0 ? styles.switcherOptionActive : ''}`}
                            onClick={() => setCollapsedItems(new Set())}
                            title="Expand All"
                        >
                            <ChevronsUpDown size={13} />
                        </button>
                        <button 
                            className={`${styles.switcherOption} ${collapsedItems.size > 0 ? styles.switcherOptionActive : ''}`}
                            onClick={() => {
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
                            }}
                            title="Collapse All"
                        >
                            <ChevronsDownUp size={13} />
                        </button>
                    </div>
                    <div className={styles.headerDivider} />
                    <button className={styles.closeBtn} onClick={onClose} title="Close Outline">
                        <X size={18} />
                    </button>
                </div>
            </div>

            {/* Modern Glassmorphic Search Bar */}
            <div className={styles.searchContainer}>
                <input
                    type="text"
                    className={styles.searchInput}
                    placeholder="Search outline..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                />
                {searchQuery && (
                    <button className={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>
                        <X size={14} />
                    </button>
                )}
            </div>

            {/* Checklist Progress Bar */}
            {todoStats.total > 0 && (
                <div className={styles.progressContainer}>
                    <div className={styles.progressHeader}>
                        <div className={styles.progressLabel}>
                            <ListTodo size={13} style={{ color: '#10b981' }} />
                            <span>Task Progress</span>
                        </div>
                        <span className={styles.progressStats}>
                            {todoStats.completed}/{todoStats.total} ({todoStats.percent}%)
                        </span>
                    </div>
                    <div className={styles.progressBarBg}>
                        <div 
                            className={styles.progressBarFill} 
                            style={{ width: `${todoStats.percent}%` }}
                        />
                    </div>
                </div>
            )}

            {/* Scroll Indicators */}
            <div className={`${styles.scrollIndicator} ${styles.scrollIndicatorTop}`} />
            
            {/* Scrollable document outline list */}
            <div className={styles.scrollContent}>
                {filteredTOC.length === 0 ? (
                    <div className={styles.emptyState}>
                        <FileText className={styles.emptyIcon} size={32} />
                        <span>
                            {searchQuery ? "No matching elements found." : "No structural blocks found."}
                            <br/>
                            {searchQuery ? "Try searching for a different term." : "Add headings, sub-pages, or checklists to populate the outline."}
                        </span>
                    </div>
                ) : (
                    <div className={styles.tree}>
                        {filteredTOC.map(item => renderTOCItem(item, 0))}
                    </div>
                )}
            </div>

            <div className={`${styles.scrollIndicator} ${styles.scrollIndicatorBottom}`} />
        </div>
    );
}
