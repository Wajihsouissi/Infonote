import { SearchResults } from './SearchResults';
import { FEATURES } from '../../config/featureFlags';
import {
    Plus,
    LayoutGrid,
    KanbanSquare,
    Search,
    X,
    Filter,
    Tag,
    Calendar,
    Flag,
    CheckCircle,
    Table2,
    Clock,
    Sparkles,
    Send,
    ImagePlus,
    Loader2,
    LayoutTemplate,
    Square,
    RectangleHorizontal,
    File,
    AppWindow
} from 'lucide-react';
import { useState, useMemo, useEffect, useRef } from 'react';
import { useReactFlow, type Edge } from '@xyflow/react';
import { v4 as uuidv4 } from 'uuid';
import { useStore } from '../../store/useStore';
import { type AppNode, type NoteNode, getNodeLabel, getNodeBlocks } from '../../types';
import type { AppState } from '../../store/types';
import styles from './BottomMenu.module.css';
import { MENU_ITEMS } from '../editor/menuConstants';
import { findNonOverlappingPosition } from '../../utils/findNonOverlappingPosition';
import { parseSearchQuery } from './searchUtils';
import { MultiSelectionToolbar } from './MultiSelectionToolbar';
import { EdgeEditingToolbar } from './EdgeEditingToolbar';
import { generateImage, parseStructuredAction, generateText } from '../../services/aiService';
import { parsePlainText } from '../editor/pasteUtils';
import { TEMPLATES } from '../templates/templateDefinitions';
import { TemplatePreviewModal } from '../templates/TemplatePreviewModal';

export function BottomMenu() {
    // Atomic Selectors
    const addNode = useStore(s => s.addNode);
    const nodes = useStore(s => s.nodes);
    const centerPanelId = useStore(s => s.centerPanelId);
    const fullscreenId = useStore(s => s.fullscreenId);
    const currentParentId = useStore(s => s.currentParentId);
    const updateNodeData = useStore(s => s.updateNodeData);
    const selectedCanvasNodeIds = useStore(s => s.selectedCanvasNodeIds);
    const selectedEdgeId = useStore(s => s.selectedEdgeId);
    const selectedEdgeIds = useStore(s => s.selectedEdgeIds);
    const hasSelectedEdges = selectedEdgeId || (selectedEdgeIds && selectedEdgeIds.size > 0);

    const { screenToFlowPosition, getViewport } = useReactFlow();
    const [isSearchMode, setIsSearchMode] = useState(false);
    const [searchQuery, setSearchQuery] = useState('');
    const [isAIMode, setIsAIMode] = useState(false);
    const [aiQuery, setAiQuery] = useState('');
    const [aiModeType, setAiModeType] = useState<'text' | 'image'>('text');
    const [showFilters, setShowFilters] = useState(false);
    const [activeMenu, setActiveMenu] = useState<'views' | 'blocks' | 'templates' | 'addNoteModes' | null>(null);
    const [hoveredTemplateId, setHoveredTemplateId] = useState<string | null>(null);
    const hoverTimeoutRef = useRef<number | null>(null);
    const [highlightedIndex, setHighlightedIndex] = useState<number | null>(null);
    const [aiError, setAiError] = useState<string | null>(null);
    const menuRef = useRef<HTMLDivElement>(null);
    const handleAddNoteRef = useRef<() => void>(() => {});

    // Hide templates that depend on a beta-deferred surface (e.g. Kanban) so a
    // disabled feature can't leak back in through a template drop.
    const templates = useMemo(
        () => TEMPLATES.filter(t => !t.requiresKanban || FEATURES.kanban),
        []
    );

    // Compute the hovered template's preview once. getPreviewData() mints fresh
    // node ids on every call, so calling it separately for nodes and edges made
    // the edges reference ids that no longer existed — they never rendered.
    const hoveredPreview = useMemo(
        () => templates.find(t => t.id === hoveredTemplateId)?.getPreviewData() ?? null,
        [hoveredTemplateId, templates]
    );
    const hoveredTemplate = useMemo(
        () => templates.find(t => t.id === hoveredTemplateId) ?? null,
        [hoveredTemplateId, templates]
    );

    // Reset highlighted index when activeMenu changes
    useEffect(() => {
        if (activeMenu) {
            setHighlightedIndex(0);
        } else {
            setHighlightedIndex(null);
        }
    }, [activeMenu]);

    // Click-away listener to dismiss active menus and modes when clicking outside
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
                setActiveMenu(null);
                if (isAIMode) {
                    setIsAIMode(false);
                }
                if (isSearchMode) {
                    setIsSearchMode(false);
                    setShowFilters(false);
                }
            }
        };

        if (activeMenu || isAIMode || isSearchMode) {
            document.addEventListener('mousedown', handleClickOutside, true);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside, true);
        };
    }, [activeMenu, isAIMode, isSearchMode]);

    // Handle keyboard navigation inside the open menu
    useEffect(() => {
        if (!activeMenu || highlightedIndex === null) return;

        const columns = activeMenu === 'views' ? 4 : activeMenu === 'templates' ? 4 : 6;
        const totalItems = activeMenu === 'views' ? 4 : activeMenu === 'templates' ? templates.length : MENU_ITEMS.length;

        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                setActiveMenu(null);
                e.preventDefault();
                return;
            }

            if (e.key === 'ArrowRight') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.min(totalItems - 1, prev + 1)));
                e.preventDefault();
            } else if (e.key === 'ArrowLeft') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.max(0, prev - 1)));
                e.preventDefault();
            } else if (e.key === 'ArrowDown') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.min(totalItems - 1, prev + columns)));
                e.preventDefault();
            } else if (e.key === 'ArrowUp') {
                setHighlightedIndex(prev => (prev === null ? 0 : Math.max(0, prev - columns)));
                e.preventDefault();
            } else if (e.key === 'Enter') {
                if (activeMenu === 'views') {
                    const index = highlightedIndex;
                    if (index === 0) {
                        useStore.getState().setKanbanModalOpen(true);
                    } else if (index === 1) {
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                        const BOARD_WIDTH = 700;
                        const BOARD_HEIGHT = 500;
                        const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, nodes, currentParentId, vp());
                        addNode('kanban', position, {
                            label: 'My Table',
                            columns: [
                                { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                            ],
                            viewMode: 'table',
                        }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                    } else if (index === 2) {
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                        const BOARD_WIDTH = 800;
                        const BOARD_HEIGHT = 600;
                        const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, nodes, currentParentId, vp());
                        addNode('kanban', position, {
                            label: 'Calendar',
                            columns: [
                                { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                            ],
                            viewMode: 'calendar',
                        }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                    } else if (index === 3) {
                        const centerX = window.innerWidth / 2;
                        const centerY = window.innerHeight / 2;
                        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                        const BOARD_WIDTH = 800;
                        const BOARD_HEIGHT = 400;
                        const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, nodes, currentParentId, vp());
                        addNode('kanban', position, {
                            label: 'Timeline',
                            columns: [
                                { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                            ],
                            viewMode: 'timeline',
                        }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                    }
                } else if (activeMenu === 'templates') {
                    const template = templates[highlightedIndex];
                    if (template) {
                        handleTemplateClick(template.id);
                    }
                } else {
                    const block = MENU_ITEMS[highlightedIndex];
                    if (block) {
                        handleBlockClick(block);
                    }
                }
                setActiveMenu(null);
                e.preventDefault();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => {
            window.removeEventListener('keydown', handleKeyDown);
        };
    }, [activeMenu, highlightedIndex, screenToFlowPosition, addNode, currentParentId, nodes]);

    // Global keyboard shortcuts for BottomMenu
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement;
            if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return;

            if (e.key === 'b' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setActiveMenu(prev => prev === 'blocks' ? null : 'blocks');
            } else if (e.key === 'v' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setActiveMenu(prev => prev === 'views' ? null : 'views');
            } else if (e.key === 't' && !e.metaKey && !e.ctrlKey && !e.altKey) {
                e.preventDefault();
                setActiveMenu(prev => prev === 'templates' ? null : 'templates');
            } else if (e.key === 'f' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (isSearchMode) {
                    setIsSearchMode(false);
                    setSearchQuery('');
                } else {
                    setIsSearchMode(true);
                    setIsAIMode(false);
                }
            } else if (e.key === 'j' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (isAIMode && aiModeType === 'text') {
                    setIsAIMode(false);
                    setAiQuery('');
                    setAiError(null);
                } else {
                    setIsAIMode(true);
                    setAiModeType('text');
                    setIsSearchMode(false);
                    setAiError(null);
                }
            } else if (e.key === 'i' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                if (isAIMode && aiModeType === 'image') {
                    setIsAIMode(false);
                    setAiQuery('');
                    setAiError(null);
                } else {
                    setIsAIMode(true);
                    setAiModeType('image');
                    setIsSearchMode(false);
                    setAiError(null);
                }
            } else if (e.key === 'n' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                handleAddNoteRef.current();
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isSearchMode]);

    const activeFilters = useMemo(() => parseSearchQuery(searchQuery), [searchQuery]);

    // Extract all unique tags from nodes
    const allTags = useMemo(() => {
        const tags = new Set<string>();
        nodes.forEach(node => {
            const nodeTags = 'tags' in node.data ? node.data.tags : undefined;
            if (Array.isArray(nodeTags)) {
                nodeTags.forEach(tag => tags.add(tag));
            }
        });
        return Array.from(tags);
    }, [nodes]);

    const toggleFilter = (key: string, value: string) => {
        const filters = { ...activeFilters };
        if (key === 'tag') {
            if (filters.tags.includes(value)) {
                filters.tags = filters.tags.filter(t => t !== value);
            } else {
                filters.tags.push(value);
            }
        } else {
            const filterRecord = filters as unknown as Record<string, string | undefined>;
            if (filterRecord[key] === value) {
                delete filterRecord[key];
            } else {
                filterRecord[key] = value;
            }
        }

        // Reconstruct query string
        let newQuery = filters.text;
        filters.tags.forEach(t => newQuery += ` #${t}`);
        if (filters.status) newQuery += ` status:${filters.status}`;
        if (filters.priority) newQuery += ` priority:${filters.priority}`;
        if (filters.type) newQuery += ` is:${filters.type}`;
        if (filters.date) newQuery += ` date:${filters.date}`;
        if (filters.startDate) newQuery += ` after:${filters.startDate}`;
        if (filters.endDate) newQuery += ` before:${filters.endDate}`;

        const cleanedQuery = newQuery.trim();
        setSearchQuery(cleanedQuery);
        if (cleanedQuery && !isSearchMode) setIsSearchMode(true);
    };

    const vp = () => {
        const { x, y, zoom } = getViewport();
        return { x, y, zoom, screenW: window.innerWidth, screenH: window.innerHeight };
    };

    const handleAddNote = () => {
        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

        const NOTE_WIDTH = 432;
        const NOTE_HEIGHT = 432;

        const position = findNonOverlappingPosition(flowPos, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, nodes, currentParentId, vp());

        addNode('note', position, { viewMode: 'expanded' }, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, currentParentId || undefined);
    };
    handleAddNoteRef.current = handleAddNote;

    const [isGenerating, setIsGenerating] = useState(false);

    const handleAISubmit = async () => {
        if (!aiQuery.trim() || isGenerating) return;
        setIsGenerating(true);
        setAiError(null);
        const query = aiQuery.trim();
        try {
            const centerX = window.innerWidth / 2;
            const centerY = window.innerHeight / 2;
            const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

             if (aiModeType === 'text') {
                 if (selectedCanvasNodeIds.size > 0) {
                     const selectedIds = Array.from(selectedCanvasNodeIds);
                     for (const nodeId of selectedIds) {
                         const node = nodes.find(n => n.id === nodeId);
                         if (node && (node.type === 'note' || node.type === 'block' || node.type === 'fused-note')) {
                             const nodeTitle = node.type === 'note' ? node.data.label : 'Untitled';
                             const nodeDescription = node.type === 'note' ? node.data.description || '' : '';
                             
                             const contentBlocks = node.data.content;
                             const contentText = Array.isArray(contentBlocks)
                                 ? contentBlocks.map(b => b.content).join('\n')
                                 : '';
 
                             const prompt = `You are editing an existing node.
 Here is the node's current title (if applicable): "${nodeTitle}"
 Here is the node's current description (if applicable): "${nodeDescription}"
 Here is the node's current body content:
 "${contentText}"
 
 The user has given the following instruction to modify this node:
 "${query}"
 
 Respond ONLY with a valid JSON object matching this structure. Do not include markdown, code blocks, or explanations.
 {
   "title": "...", // updated title if the user asked to change the title, or the same title
   "description": "...", // updated description (2-line summary with bullet points) based on the user's instructions and body text
   "content": "..." // updated full body content based on the user's instructions (e.g. translate, add details, edit, format, outline, etc.)
 }`;
 
                             const responseText = await generateText(prompt);
                             const jsonMatch = responseText.match(/\{[\s\S]*\}/);
                             let updateData: Record<string, unknown> = {};
                             
                             if (jsonMatch) {
                                 try {
                                     const result = JSON.parse(jsonMatch[0]);
                                     const parsedBlocks = parsePlainText(result.content || contentText);
                                     updateData = {
                                         content: parsedBlocks.length > 0 ? parsedBlocks : [
                                             { id: uuidv4(), type: 'text', content: result.content || contentText }
                                         ]
                                     };
                                     if (node.type === 'note') {
                                         updateData.label = result.title || nodeTitle;
                                         updateData.description = result.description || nodeDescription;
                                     }
                                 } catch (e) {
                                     console.error("Failed to parse AI update result JSON:", e);
                                     const parsedBlocks = parsePlainText(responseText);
                                     updateData = {
                                         content: parsedBlocks.length > 0 ? parsedBlocks : [
                                             { id: uuidv4(), type: 'text', content: responseText }
                                         ]
                                     };
                                 }
                             } else {
                                 const parsedBlocks = parsePlainText(responseText);
                                 updateData = {
                                     content: parsedBlocks.length > 0 ? parsedBlocks : [
                                         { id: uuidv4(), type: 'text', content: responseText }
                                     ]
                                 };
                             }
                             updateNodeData(nodeId, updateData);
                         }
                     }
                     setAiQuery('');
                     setIsAIMode(false);
                     return;
                 }
 
                 const selectedNode = nodes.find(n => n.selected);
                 let activeNodeColor: string | undefined = selectedNode && 'color' in selectedNode.data ? selectedNode.data.color : undefined;
                 if (!activeNodeColor) {
                     const coloredNodes = nodes.filter((n): n is NoteNode => n.type === 'note' && !!n.data.color);
                     if (coloredNodes.length > 0) {
                         activeNodeColor = coloredNodes[Math.floor(Math.random() * coloredNodes.length)].data.color;
                     }
                 }

                 // Spawn skeleton loading node(s)
                 const isMindmapQuery = query.toLowerCase().includes('mindmap') || query.toLowerCase().includes('mind map');
                 const skeletonId = uuidv4();
                 
                 if (isMindmapQuery) {
                     const rootPos = findNonOverlappingPosition(flowPos, { width: 260, height: 80 }, nodes, currentParentId, vp());
                     const skelNodes: AppNode[] = [{
                         id: skeletonId,
                         type: 'block',
                         position: rootPos,
                         style: { width: 260, height: 80 },
                         data: { 
                             content: [{ id: uuidv4(), type: 'heading2', content: 'AI is thinking...' }],
                             isStandaloneBlock: true,
                             isAISkeleton: true
                         },
                         parentId: currentParentId || undefined
                     }];
                     const skelEdges: Edge[] = [];
                     
                     for (let i = 0; i < 3; i++) {
                         const childId = uuidv4();
                         const angle = (i * 2 * Math.PI) / 3;
                         skelNodes.push({
                             id: childId,
                             type: 'block',
                             position: { 
                                 x: rootPos.x + 200 * Math.cos(angle), 
                                 y: rootPos.y + 200 * Math.sin(angle) 
                             },
                             style: { width: 220, height: 70 },
                             data: { 
                                 content: [{ id: uuidv4(), type: 'text', content: 'Generating...' }],
                                 isStandaloneBlock: true,
                                 isAISkeleton: true
                             },
                             parentId: currentParentId || undefined
                         });
                         skelEdges.push({
                             id: `skel-${skeletonId}-${childId}`,
                             source: skeletonId,
                             target: childId,
                             type: 'centered',
                             data: { parentId: currentParentId ?? null }
                         });
                     }
                     useStore.getState().setNodes(prev => [...prev, ...skelNodes]);
                     useStore.setState((prev: AppState) => ({ edges: [...prev.edges, ...skelEdges] }));
                 } else {
                     addNode(
                         'note',
                         findNonOverlappingPosition(flowPos, { width: 432, height: 432 }, nodes, currentParentId, vp()),
                         {
                             label: 'AI is thinking...',
                             content: [{ id: uuidv4(), type: 'text', content: 'Generating your structured request...' }],
                             color: activeNodeColor || undefined,
                             viewMode: 'expanded',
                             showMetadata: false,
                             icon: 'Sparkles',
                             isAISkeleton: true,
                         },
                         { width: 432, height: 432 },
                         currentParentId || undefined,
                         skeletonId
                     );
                 }

                 try {
                     const currentNodes = useStore.getState().nodes;
                     const siblingNodes = currentNodes.filter(n => n.parentId === (currentParentId || null));
                     const contextString = siblingNodes.length > 0 
                         ? `Existing nodes on canvas: ` + siblingNodes.map(n => `${getNodeLabel(n.data) || 'Untitled'} (${n.type})`).join(', ')
                         : '';

                     const actions = await parseStructuredAction(query, contextString);
                     
                     // Remove skeleton node(s) and edges
                     useStore.getState().setNodes(nds => nds.filter(n => !('isAISkeleton' in n.data && n.data.isAISkeleton)));
                     useStore.setState((prev: AppState) => ({ edges: prev.edges.filter((e: Edge) => !e.id.startsWith('skel-')) }));

                     actions.forEach((action, idx) => {
                         const width = action.type === 'kanban' ? 700 : action.type === 'fused-note' ? 800 : 432;
                         const height = action.type === 'kanban' ? 500 : action.type === 'fused-note' ? 600 : 432;
     
                         const position = findNonOverlappingPosition(
                             {
                                 x: flowPos.x + (idx % 3) * 340,
                                 y: flowPos.y + Math.floor(idx / 3) * 260
                             },
                             { width, height },
                             nodes, currentParentId, vp()
                         );
     
                         if (action.type === 'note') {
                             const parsedBlocks = parsePlainText(action.content || '');
                             addNode(
                                 'note',
                                 position,
                                 {
                                     label: action.title,
                                     content: parsedBlocks.length > 0 ? parsedBlocks : [{ id: uuidv4(), type: 'text', content: action.content || '' }],
                                     color: action.color || activeNodeColor || undefined,
                                     viewMode: 'expanded',
                                     showMetadata: false,
                                     icon: 'Sparkles',
                                     createdAt: new Date().toISOString(),
                                     updatedAt: new Date().toISOString(),
                                 },
                                 { width, height },
                                 currentParentId || undefined
                             );
                         } else if (action.type === 'fused-note') {
                             const markdownContent = `# ${action.title}\n\n${action.content || ''}`;
                             const parsedBlocks = parsePlainText(markdownContent);
                             addNode(
                                 'fused-note',
                                 position,
                                 {
                                     content: parsedBlocks.length > 0 ? parsedBlocks : [{ id: uuidv4(), type: 'text', content: markdownContent }]
                                 },
                                 { width, height },
                                 currentParentId || undefined
                             );
                         } else if (action.type === 'kanban') {
                             const viewMode = action.viewMode || 'board';
                             const BOARD_WIDTH = viewMode === 'timeline' ? 800 : viewMode === 'calendar' ? 800 : 700;
                             const BOARD_HEIGHT = viewMode === 'calendar' ? 600 : viewMode === 'timeline' ? 400 : 500;
                             
                             addNode(
                                 'kanban',
                                 position,
                                 {
                                     label: action.title || 'Board',
                                     columns: action.columns && action.columns.length > 0 ? action.columns : [
                                         { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                         { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                         { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' }
                                     ],
                                     viewMode: viewMode,
                                     createdAt: new Date().toISOString(),
                                     updatedAt: new Date().toISOString(),
                                 },
                                 { width: BOARD_WIDTH, height: BOARD_HEIGHT },
                                 currentParentId || undefined
                             );
                         } else if (action.type === 'mindmap') {
                             if (!action.nodes || action.nodes.length === 0) return;
                             
                             const newNodes: AppNode[] = [];
                             const newEdges: Edge[] = [];

                             // Build node hierarchy
                             type MindmapNode = (typeof action.nodes)[number];
                             const nodeMap = new Map(action.nodes.map(n => [n.id, n]));
                             const childrenMap = new Map<string, MindmapNode[]>();
                             action.nodes.forEach(n => {
                                 if (n.parentId) {
                                     if (!childrenMap.has(n.parentId)) childrenMap.set(n.parentId, []);
                                     childrenMap.get(n.parentId)!.push(n);
                                 }
                             });
                             
                             const rootNode = action.nodes.find(n => !n.parentId) || action.nodes[0];
                             
                             const buildTree = (nodeId: string, cx: number, cy: number, depth: number, arcStart: number, arcEnd: number) => {
                                 const node = nodeMap.get(nodeId);
                                 if (!node) return;
                             
                                 // Create node
                                 newNodes.push({
                                     id: node.id,
                                     type: 'block',
                                     position: { x: cx, y: cy },
                                     style: depth === 0 ? { width: 260, height: 80 } : { width: 220, height: 70 },
                                     data: { 
                                         content: [{ id: uuidv4(), type: depth === 0 ? 'heading2' : 'text', content: node.label }],
                                         isStandaloneBlock: true
                                     },
                                     parentId: currentParentId || undefined
                                 });
                             
                                 // Create edge from parent
                                 if (node.parentId) {
                                     newEdges.push({
                                         id: `e-${node.parentId}-${node.id}`,
                                         source: node.parentId,
                                         target: node.id,
                                         type: 'centered',
                                         data: { parentId: currentParentId ?? null }
                                     });
                                 }
                             
                                 // Process children
                                 const children = childrenMap.get(nodeId) || [];
                                 if (children.length > 0) {
                                     const radius = depth === 0 ? Math.max(300, children.length * 60) : 250;
                                     const totalArc = arcEnd - arcStart;
                                     const step = totalArc / children.length;
                                     
                                     children.forEach((child, i) => {
                                         const childAngle = arcStart + (i + 0.5) * step;
                                         const childX = cx + radius * Math.cos(childAngle);
                                         const childY = cy + radius * Math.sin(childAngle);
                                         
                                         // Padding prevents child sub-trees from perfectly touching
                                         const padding = step * 0.05;
                                         buildTree(child.id, childX, childY, depth + 1, arcStart + i * step + padding, arcStart + (i + 1) * step - padding);
                                     });
                                 }
                             };
                             
                             if (rootNode) {
                                 buildTree(rootNode.id, position.x, position.y, 0, 0, 2 * Math.PI);
                             }
                             
                             // Push to store
                             useStore.getState().setNodes(prev => [...prev, ...newNodes]);
                             if (newEdges.length > 0) {
                                 useStore.setState((prev: AppState) => ({ edges: [...prev.edges, ...newEdges] }));
                             }
                         }
                     });
                     setAiQuery('');
                     setIsAIMode(false);
                 } catch (err) {
                     // Clean up skeleton on failure
                     useStore.getState().setNodes(nds => nds.filter(n => !('isAISkeleton' in n.data && n.data.isAISkeleton)));
                     useStore.setState((prev: AppState) => ({ edges: prev.edges.filter((e: Edge) => !e.id.startsWith('skel-')) }));
                     throw err;
                 }
            } else {
                const imageUrl = await generateImage(query);
                const BLOCK_WIDTH = 380;
                const BLOCK_HEIGHT = 380;
                const position = findNonOverlappingPosition(flowPos, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }, nodes, currentParentId, vp());
                addNode(
                    'block',
                    position,
                    {
                        content: [
                            { 
                                id: uuidv4(), 
                                type: 'image', 
                                content: imageUrl, 
                                metadata: { 
                                    prompt: query, 
                                    width: 380, 
                                    alignment: 'center' 
                                } 
                            }
                        ],
                        isStandaloneBlock: true,
                        createdAt: new Date().toISOString(),
                        updatedAt: new Date().toISOString(),
                    },
                    { width: BLOCK_WIDTH, height: BLOCK_HEIGHT },
                    currentParentId || undefined
                );
                setAiQuery('');
                setIsAIMode(false);
            }
        } catch (error) {
            console.error("AI Generation failed:", error);
            setAiError(error instanceof Error ? error.message : "AI Generation failed. Please try again.");
        } finally {
            setIsGenerating(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, type: string, metadata?: Record<string, unknown>) => {
        e.dataTransfer.setData('application/reactflow-block-type', type);

        const blockData = {
            block: {
                id: uuidv4(),
                type: type,
                content: '',
                metadata: metadata
            },
            sourceNodeId: null
        };
        e.dataTransfer.setData('application/chnk-it-block-data', JSON.stringify(blockData));

        if (metadata) {
            e.dataTransfer.setData('application/chnk-it-block-metadata', JSON.stringify(metadata));
        }
        e.dataTransfer.effectAllowed = 'copy';
    };

    const handleTemplateClick = (templateId: string) => {
        const template = templates.find(t => t.id === templateId);
        if (!template) return;

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;
        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
        
        // Use a large size approximation for template to find non-overlapping space
        const position = findNonOverlappingPosition(flowPos, { width: 1200, height: 1000 }, nodes, currentParentId, vp());

        const { nodes: newNodes, edges: newEdges } = template.generateNodes(position, currentParentId || null);
        
        useStore.getState().setNodes(prev => [...prev, ...newNodes]);
        if (newEdges.length > 0) {
            useStore.setState((prev: AppState) => ({ edges: [...prev.edges, ...newEdges] }));
        }
    };

    const handleBlockClick = (block: typeof MENU_ITEMS[0]) => {
        // Columns need their metadata seeded with empty column content, otherwise the
        // node renders as an empty box (matches editor slash-command behaviour).
        const metadata = block.type === 'columns'
            ? {
                columns: Array.from({ length: block.meta?.count || 2 }).map(() => ({
                    id: uuidv4(),
                    content: [{ id: uuidv4(), type: 'text', content: '' }],
                })),
            }
            : block.meta;

        const newBlock = {
            id: uuidv4(),
            type: block.type,
            content: '',
            metadata
        };

        const targetNodeId = centerPanelId || fullscreenId;

        if (targetNodeId) {
            const activeNode = nodes.find(n => n.id === targetNodeId);
            if (activeNode) {
                const safeContent = getNodeBlocks(activeNode.data) ?? [];
                updateNodeData(targetNodeId, {
                    content: [...safeContent, newBlock]
                });
                return;
            }
        }

        const centerX = window.innerWidth / 2;
        const centerY = window.innerHeight / 2;

        const flowPos = screenToFlowPosition({ x: centerX, y: centerY });

        // Each column needs ~200px to be comfortably editable; scale node width with the
        // number of columns per row (4 columns render as a 2x2 grid, so only 2 per row).
        const columnCount = block.type === 'columns' ? (block.meta?.count || 2) : 0;
        const columnsPerRow = columnCount === 4 ? 2 : columnCount;
        const BLOCK_WIDTH = block.type === 'columns' ? Math.max(550, columnsPerRow * 220) : ['image', 'video', 'file'].includes(block.type) ? 208 : 300;
        const BLOCK_HEIGHT = 100;

        const position = findNonOverlappingPosition(flowPos, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }, nodes, currentParentId, vp());

        addNode('block', position, {
            content: [newBlock],
            isStandaloneBlock: true
        }, { width: BLOCK_WIDTH, height: BLOCK_HEIGHT }, currentParentId || undefined);
    };

    return (
        <>
            <div ref={menuRef} className={`${styles.bottomMenu} ${isAIMode ? (aiModeType === 'text' ? styles.bottomMenuAIText : styles.bottomMenuAIImage) : ''}`}>
                {isAIMode ? (
                    <div style={{ position: 'relative', display: 'flex', width: '100%' }}>
                        {aiError && (
                            <div style={{
                                position: 'absolute',
                                bottom: '100%',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                marginBottom: '12px',
                                background: 'rgba(239, 68, 68, 0.95)',
                                color: 'white',
                                padding: '8px 16px',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontWeight: 500,
                                whiteSpace: 'nowrap',
                                pointerEvents: 'none',
                                animation: 'fadeIn 0.2s ease-out'
                            }}>
                                {aiError}
                            </div>
                        )}
                        <div className={aiModeType === 'text' ? styles.aiContainer : styles.aiImageContainer}>
                        <div className={styles.aiModeSwitcher}>
                            <button 
                                className={`${styles.modeToggleBtn} ${aiModeType === 'text' ? styles.modeActiveText : ''}`}
                                onClick={() => !isGenerating && setAiModeType('text')}
                                disabled={isGenerating}
                                title="Text Generation"
                            >
                                {isGenerating && aiModeType === 'text' ? (
                                    <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)" }} />
                                ) : (
                                    <Sparkles size={16} color={aiModeType === 'text' ? "var(--accent)" : "gray"} />
                                )}
                            </button>
                            <button 
                                className={`${styles.modeToggleBtn} ${aiModeType === 'image' ? styles.modeActiveImage : ''}`}
                                onClick={() => !isGenerating && setAiModeType('image')}
                                disabled={isGenerating}
                                title="Image Generation"
                            >
                                {isGenerating && aiModeType === 'image' ? (
                                    <Loader2 size={16} className="animate-spin" style={{ color: "var(--accent)" }} />
                                ) : (
                                    <ImagePlus size={16} color={aiModeType === 'image' ? "var(--accent)" : "gray"} />
                                )}
                            </button>
                        </div>
                        <textarea
                            className={aiModeType === 'text' ? styles.aiInput : styles.aiImageInput}
                            placeholder={
                                isGenerating 
                                    ? "AI is dreaming up your request..." 
                                    : aiModeType === 'text' 
                                        ? selectedCanvasNodeIds.size > 0 
                                            ? `Ask AI to modify the selected card...` 
                                            : "Ask AI to generate, summarize, or edit..." 
                                        : "Describe an image to generate..."
                            }
                            value={aiQuery}
                            onChange={(e) => {
                                setAiQuery(e.target.value);
                                e.target.style.height = 'auto';
                                e.target.style.height = `${e.target.scrollHeight}px`;
                            }}
                            disabled={isGenerating}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAISubmit();
                                } else if (e.key === 'Escape' && !isGenerating) {
                                    setIsAIMode(false);
                                }
                            }}
                            rows={1}
                            autoFocus
                        />
                        <button
                            className={aiModeType === 'text' ? styles.aiSendBtn : styles.aiImageSendBtn}
                            onClick={handleAISubmit}
                            disabled={isGenerating || !aiQuery.trim()}
                            title={isGenerating ? "AI is processing" : aiModeType === 'text' ? "Send to AI" : "Generate Image"}
                        >
                            {isGenerating ? (
                                <Loader2 size={16} className="animate-spin" />
                            ) : (
                                <Send size={16} />
                            )}
                        </button>
                    </div>
                    </div>
                ) : isSearchMode ? (
                    <div className={styles.searchContainer}>
                        <SearchResults
                            query={searchQuery}
                            onClose={() => {
                                setIsSearchMode(false);
                                setSearchQuery('');
                            }}
                        />
                        <Search size={20} className="text-muted-foreground" style={{ opacity: 0.5, marginLeft: 12 }} />
                        <input
                            type="text"
                            className={styles.searchInput}
                            placeholder="Search your notes"
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            autoFocus
                        />

                        <button
                            className={`${styles.filterToggleBtn} ${showFilters ? styles.active : ''}`}
                            onClick={() => setShowFilters(!showFilters)}
                            title="Filters"
                        >
                            <Filter size={16} />
                        </button>

                        <button
                            className={styles.closeSearchBtn}
                            onClick={() => {
                                setIsSearchMode(false);
                                setSearchQuery('');
                                setShowFilters(false);
                            }}
                            title="Close Search"
                        >
                            <X size={16} />
                        </button>

                        {showFilters && (
                            <div className={styles.filterPanel}>
                                <div className={styles.filterGroup}>
                                    <label><Tag size={12} /> Tags</label>
                                    <div className={styles.filterChips}>
                                        {allTags.map(tag => (
                                            <span
                                                key={tag}
                                                className={`${styles.filterChip} ${activeFilters.tags.includes(tag.toLowerCase()) ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('tag', tag.toLowerCase())}
                                            >
                                                #{tag}
                                            </span>
                                        ))}
                                        {allTags.length === 0 && <span className={styles.emptyText}>No tags found</span>}
                                    </div>
                                </div>

                                <div className={styles.filterRow}>
                                    <div className={styles.filterGroup}>
                                        <label><CheckCircle size={12} /> Status</label>
                                        <div className={styles.filterChips}>
                                            {['todo', 'in-progress', 'done', 'backlog'].map(s => (
                                                <span
                                                    key={s}
                                                    className={`${styles.filterChip} ${activeFilters.status === s ? styles.selected : ''}`}
                                                    onClick={() => toggleFilter('status', s)}
                                                >
                                                    {s}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.filterGroup}>
                                        <label><Flag size={12} /> Priority</label>
                                        <div className={styles.filterChips}>
                                            {['low', 'medium', 'high', 'urgent'].map(p => (
                                                <span
                                                    key={p}
                                                    className={`${styles.filterChip} ${activeFilters.priority === p ? styles.selected : ''}`}
                                                    onClick={() => toggleFilter('priority', p)}
                                                >
                                                    {p}
                                                </span>
                                            ))}
                                        </div>
                                    </div>
                                </div>

                                <div className={styles.filterRow}>
                                    <div className={styles.filterGroup}>
                                        <label><Calendar size={12} /> Type</label>
                                        <div className={styles.filterChips}>
                                            {['note', 'kanban', 'block'].map(t => (
                                                <span
                                                    key={t}
                                                    className={`${styles.filterChip} ${activeFilters.type === t ? styles.selected : ''}`}
                                                    onClick={() => toggleFilter('is', t)}
                                                >
                                                    {t}
                                                </span>
                                            ))}
                                        </div>
                                    </div>

                                    <div className={styles.filterGroup}>
                                        <label><Calendar size={12} /> Time</label>
                                        <div className={styles.filterChips}>
                                            <span
                                                className={`${styles.filterChip} ${activeFilters.startDate === new Date().toISOString().split('T')[0] ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('after', new Date().toISOString().split('T')[0])}
                                            >
                                                Today
                                            </span>
                                            <span
                                                className={`${styles.filterChip} ${activeFilters.date?.includes(new Date().toISOString().split('T')[0].substring(0, 7)) ? styles.selected : ''}`}
                                                onClick={() => toggleFilter('date', new Date().toISOString().split('T')[0].substring(0, 7))}
                                            >
                                                This Month
                                            </span>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                ) : selectedCanvasNodeIds.size > 0 ? (
                    <MultiSelectionToolbar 
                        onOpenAI={() => { setIsAIMode(true); setAiModeType('text'); }} 
                        onOpenSearch={() => setIsSearchMode(true)}
                    />
                ) : hasSelectedEdges ? (
                    <EdgeEditingToolbar />
                ) : (
                    <>
                        <button
                            className={styles.aiIconBtn}
                            onClick={() => { setIsAIMode(true); setAiModeType('text'); }}
                            title="Ask AI (Ctrl+J)"
                        >
                            <Sparkles size={20} />
                        </button>
                        <button
                            className={styles.iconBtn}
                            onClick={() => setIsSearchMode(true)}
                            title="Search (Ctrl+F)"
                        >
                            <Search size={20} />
                        </button>

                        <div 
                            className={styles.blocksWrapper}
                            onMouseEnter={() => {
                                hoverTimeoutRef.current = window.setTimeout(() => {
                                    setActiveMenu('addNoteModes');
                                }, 1000);
                            }}
                            onMouseLeave={() => {
                                if (hoverTimeoutRef.current) {
                                    clearTimeout(hoverTimeoutRef.current);
                                }
                            }}
                        >
                            <button 
                                className="special-primary-btn" 
                                onClick={() => {
                                    if (hoverTimeoutRef.current) clearTimeout(hoverTimeoutRef.current);
                                    handleAddNote();
                                }} 
                                title="Add New Note Card (Hover for modes)"
                            >
                                <Plus size={24} />
                            </button>

                            <div className={`${styles.hoverMenu} ${activeMenu === 'addNoteModes' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Card Modes</h3>
                                    <button 
                                        className={styles.menuCloseBtn} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(null);
                                        }} 
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <div className={styles.menuGrid} style={{ gridTemplateColumns: 'repeat(2, 1fr)' }}>
                                    {[
                                        { id: 'expanded', label: 'Expanded', desc: 'Full card view', icon: Square },
                                        { id: 'medium', label: 'Medium', desc: 'Compact view', icon: RectangleHorizontal },
                                        { id: 'icon', label: 'Icon', desc: 'Minimal icon', icon: File },
                                        { id: 'titleview', label: 'Title Only', desc: 'Just the title', icon: AppWindow }
                                    ].map((mode) => (
                                        <div
                                            key={mode.id}
                                            className={styles.draggableItem}
                                            onClick={() => {
                                                const centerX = window.innerWidth / 2;
                                                const centerY = window.innerHeight / 2;
                                                const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                                const NOTE_WIDTH = mode.id === 'icon' ? 120 : 432;
                                                const NOTE_HEIGHT = mode.id === 'icon' ? 120 : 432;
                                                const position = findNonOverlappingPosition(flowPos, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, nodes, currentParentId, vp());
                                                addNode('note', position, { viewMode: mode.id, showMetadata: false }, { width: NOTE_WIDTH, height: NOTE_HEIGHT }, currentParentId || undefined);
                                                setActiveMenu(null);
                                            }}
                                        >
                                            <div className={styles.itemIconWrapper}>
                                                <mode.icon size={20} />
                                            </div>
                                            <div className={styles.customTooltip}>
                                                <div className={styles.tooltipLabel}>{mode.label}</div>
                                                <div className={styles.tooltipDesc}>{mode.desc}</div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {FEATURES.kanban && (
                        <div className={styles.blocksWrapper}>
                            <button
                                className={`${styles.iconBtn} ${activeMenu === 'views' ? styles.iconBtnActive : ''}`}
                                onClick={() => setActiveMenu(activeMenu === 'views' ? null : 'views')}
                                title="Add View"
                                style={{ marginLeft: 8 }}
                            >
                                <KanbanSquare size={20} />
                            </button>

                            <div className={`${styles.hoverMenu} ${activeMenu === 'views' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Views</h3>
                                    <button 
                                        className={styles.menuCloseBtn} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(null);
                                        }} 
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <div className={styles.menuGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                                    {/* Kanban Board */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 0 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            useStore.getState().setKanbanModalOpen(true);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <KanbanSquare size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Board</div>
                                            <div className={styles.tooltipDesc}>Kanban board view</div>
                                        </div>
                                    </div>

                                    {/* Table View */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 1 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                            const BOARD_WIDTH = 700;
                                            const BOARD_HEIGHT = 500;
                                            const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, nodes, currentParentId, vp());
                                            addNode('kanban', position, {
                                                label: 'My Table',
                                                columns: [
                                                    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                                    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                                    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                                                ],
                                                viewMode: 'table',
                                            }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <Table2 size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Table</div>
                                            <div className={styles.tooltipDesc}>Data table view</div>
                                        </div>
                                    </div>

                                    {/* Calendar View */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 2 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                            const BOARD_WIDTH = 800;
                                            const BOARD_HEIGHT = 600;
                                            const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, nodes, currentParentId, vp());
                                            addNode('kanban', position, {
                                                label: 'Calendar',
                                                columns: [
                                                    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                                    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                                    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                                                ],
                                                viewMode: 'calendar',
                                            }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <Calendar size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Calendar</div>
                                            <div className={styles.tooltipDesc}>Calendar view</div>
                                        </div>
                                    </div>

                                    {/* Timeline View */}
                                    <div
                                        className={`${styles.draggableItem} ${highlightedIndex === 3 ? styles.draggableItemHighlighted : ''}`}
                                        onClick={() => {
                                            const centerX = window.innerWidth / 2;
                                            const centerY = window.innerHeight / 2;
                                            const flowPos = screenToFlowPosition({ x: centerX, y: centerY });
                                            const BOARD_WIDTH = 800;
                                            const BOARD_HEIGHT = 400;
                                            const position = findNonOverlappingPosition(flowPos, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, nodes, currentParentId, vp());
                                            addNode('kanban', position, {
                                                label: 'Timeline',
                                                columns: [
                                                    { id: 'todo', label: 'To Do', statusValue: 'todo', color: '#ef4444' },
                                                    { id: 'in-progress', label: 'In Progress', statusValue: 'in-progress', color: '#f59e0b' },
                                                    { id: 'done', label: 'Done', statusValue: 'done', color: '#22c55e' },
                                                ],
                                                viewMode: 'timeline',
                                            }, { width: BOARD_WIDTH, height: BOARD_HEIGHT }, currentParentId || undefined);
                                            setActiveMenu(null);
                                        }}
                                    >
                                        <div className={styles.itemIconWrapper}>
                                            <Clock size={20} />
                                        </div>
                                        <div className={styles.customTooltip}>
                                            <div className={styles.tooltipLabel}>Timeline</div>
                                            <div className={styles.tooltipDesc}>Timeline view</div>
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </div>
                        )}

                        <div className={styles.blocksWrapper}>
                            <button 
                                className={`${styles.iconBtn} ${activeMenu === 'templates' ? styles.iconBtnActive : ''}`}
                                onClick={() => setActiveMenu(activeMenu === 'templates' ? null : 'templates')}
                                title="Templates"
                                style={{ marginLeft: 8 }}
                            >
                                <LayoutTemplate size={20} />
                            </button>

                            <div className={`${styles.hoverMenu} ${activeMenu === 'templates' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Templates</h3>
                                    <button 
                                        className={styles.menuCloseBtn} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(null);
                                        }} 
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <div className={styles.menuGrid} style={{ gridTemplateColumns: 'repeat(4, 1fr)' }}>
                                    {templates.map((template, index) => {
                                        const TemplateIcon = template.icon;
                                        return (
                                        <div
                                            key={template.id}
                                            className={`${styles.draggableItem} ${highlightedIndex === index ? styles.draggableItemHighlighted : ''}`}
                                            onClick={() => {
                                                handleTemplateClick(template.id);
                                                setActiveMenu(null);
                                            }}
                                            onMouseEnter={() => {
                                                if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
                                                hoverTimeoutRef.current = window.setTimeout(() => setHoveredTemplateId(template.id), 400);
                                            }}
                                            onMouseLeave={() => {
                                                if (hoverTimeoutRef.current) window.clearTimeout(hoverTimeoutRef.current);
                                                setHoveredTemplateId(null);
                                            }}
                                        >
                                            <div className={styles.itemIconWrapper}>
                                                <TemplateIcon size={20} />
                                            </div>
                                            <div className={styles.customTooltip}>
                                                <div className={styles.tooltipLabel}>{template.name}</div>
                                                <div className={styles.tooltipDesc}>{template.description}</div>
                                            </div>
                                        </div>
                                    )})}
                                </div>
                            </div>
                        </div>

                        <div className={styles.separator} />

                        <div className={styles.blocksWrapper}>
                            <button 
                                className={`${styles.iconBtn} ${activeMenu === 'blocks' ? styles.iconBtnActive : ''}`}
                                onClick={() => setActiveMenu(activeMenu === 'blocks' ? null : 'blocks')}
                                title="Browse Blocks"
                            >
                                <LayoutGrid size={20} />
                            </button>

                            <div className={`${styles.hoverMenu} ${activeMenu === 'blocks' ? styles.menuVisible : ''}`}>
                                <div className={styles.menuHeader}>
                                    <h3 className={styles.menuTitle}>Blocks</h3>
                                    <button 
                                        className={styles.menuCloseBtn} 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            setActiveMenu(null);
                                        }} 
                                        title="Close"
                                    >
                                        <X size={12} />
                                    </button>
                                </div>
                                <div className={styles.menuGrid}>
                                    {MENU_ITEMS.map((block, index) => {
                                        const Icon = block.icon;
                                        return (
                                            <div
                                                key={block.label}
                                                className={`${styles.draggableItem} ${highlightedIndex === index ? styles.draggableItemHighlighted : ''}`}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, block.type, block.meta)}
                                                onClick={() => {
                                                    handleBlockClick(block);
                                                    setActiveMenu(null);
                                                }}
                                            >
                                                <div className={styles.itemIconWrapper}>
                                                    <Icon size={20} />
                                                </div>
                                                <div className={styles.customTooltip}>
                                                    <div className={styles.tooltipLabel}>{block.label}</div>
                                                    <div className={styles.tooltipDesc}>{block.description}</div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </>
                )}
            </div>
            
            {/* Modal is rendered outside the menu container */}
            <TemplatePreviewModal
                nodes={hoveredPreview?.nodes || []}
                edges={hoveredPreview?.edges || []}
                name={hoveredTemplate?.name}
                description={hoveredTemplate?.description}
                isVisible={hoveredTemplateId !== null}
            />
        </>
    );
}
