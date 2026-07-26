import { useState, useRef, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { X, Sparkles, Loader2, Check, Eye, ExternalLink, Square, RectangleHorizontal, StickyNote, PanelTop, Heading } from 'lucide-react';
import styles from './ConvertCardModal.module.css';
import noteStyles from './NoteCard.module.css';
import { generateText } from '../../services/aiService';
import { toPastelColor, darkenColor } from '../../utils/colorUtils';
import { useStore } from '../../store/useStore';
import { CardIcon, defaultIconName } from './iconMap';
import type { Block } from '../editor/types';

export interface ConvertCardResult {
    title: string;
    content: Block[];
    color?: string;
    tags: string[];
    viewMode: 'icon' | 'titleview' | 'medium' | 'expanded';
}

interface ConvertCardModalProps {
    initialTitle: string;
    initialColor?: string;
    content: Block[];
    onConfirm: (result: ConvertCardResult) => void;
    onClose: () => void;
}

const PRESET_COLORS = [
    '#c96f4c', // Terracotta
    '#f2795a', // Coral
    '#f59e0b', // Amber
    '#10b981', // Emerald
    '#a5673f', // Clay
    '#ef4444', // Red
    '#cc8b3c', // Ochre
    '#8a4b38', // Sienna
];

export function ConvertCardModal({ initialTitle, initialColor, content, onConfirm, onClose }: ConvertCardModalProps) {
    const theme = useStore(s => s.theme);
    const [title, setTitle] = useState(initialTitle);
    const [tagsInput, setTagsInput] = useState('');
    const [color, setColor] = useState<string | undefined>(initialColor);
    const [viewMode, setViewMode] = useState<'icon' | 'titleview' | 'medium' | 'expanded'>('expanded');
    const [currentContent, setCurrentContent] = useState<Block[]>(content);
    
    const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
    const [isSummarizing, setIsSummarizing] = useState(false);
    
    // Find first heading for extraction
    const firstHeadingIndex = useMemo(() => {
        return currentContent.findIndex(b => b.type && b.type.startsWith('heading'));
    }, [currentContent]);
    const hasHeading = firstHeadingIndex !== -1;
    
    const overlayRef = useRef<HTMLDivElement>(null);

    // Derived states for preview
    const tagsList = useMemo(() => {
        return tagsInput.split(',').map(t => t.trim()).filter(t => t.length > 0);
    }, [tagsInput]);

    const displayColor = color ? toPastelColor(color, theme === 'light') : undefined;

    // Use exact same dynamic styles logic from NoteCard & NoteExpandedContent
    const dynamicStyles = useMemo(() => {
        if (!displayColor) return {};
        const darkText = darkenColor(displayColor, 80);
        const borderColor = darkenColor(displayColor, 40);
        return {
            '--color-text-main': darkText,
            '--glass-border': `${borderColor}40`,
            '--note-bg-dynamic': color,
        } as React.CSSProperties;
    }, [displayColor, color]);

    const headerStyle = useMemo(() => {
        if (!displayColor) return {};
        const bg = displayColor;
        const darkText = darkenColor(displayColor, 80);
        const mutedText = darkenColor(displayColor, 65);
        return {
            backgroundColor: bg,
            color: darkText,
            '--color-text-main': darkText,
            '--color-text-muted': mutedText,
            '--control-btn-bg': `transparent`,
            '--control-btn-border': `${darkText}30`,
            '--control-btn-hover-border': darkText,
            '--control-btn-hover-color': darkText,
        } as React.CSSProperties;
    }, [displayColor]);

    const noteAreaStyles = useMemo(() => {
        if (!color) return { backgroundColor: 'transparent' };
        return {
            backgroundColor: 'transparent',
            boxShadow: `
                inset 4px 0 12px -6px ${color}15,
                inset -4px 0 12px -6px ${color}15,
                inset 0 -6px 12px -6px ${color}15,
                inset 1px 0 0 0 ${color}10,
                inset -1px 0 0 0 ${color}10,
                inset 0 -1px 0 0 ${color}10
            `.trim().replace(/\s+/g, ' '),
            '--color-text-main': 'var(--text-main)',
        } as React.CSSProperties;
    }, [color]);

    const previewText = useMemo(() => {
        let text = '';
        currentContent.forEach(block => {
            if (block.content && typeof block.content === 'string') {
                text += block.content.replace(/<[^>]+>/g, '') + '\n';
            }
        });
        return text;
    }, [currentContent]);

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                onClose();
            }
        };
        window.addEventListener('keydown', handleKeyDown, { capture: true });
        return () => window.removeEventListener('keydown', handleKeyDown, { capture: true });
    }, [onClose]);

    const handleOverlayClick = (e: React.MouseEvent) => {
        if (e.target === overlayRef.current) onClose();
    };

    const handleUseHeadingAsTitle = () => {
        if (firstHeadingIndex !== -1) {
            const headingBlock = currentContent[firstHeadingIndex];
            let headingText = headingBlock.content || '';
            if (typeof headingText === 'string') {
                headingText = headingText.replace(/<[^>]+>/g, '').trim();
            }
            setTitle(headingText || 'Untitled Card');
            
            // Remove heading block from content
            const newContent = [...currentContent];
            newContent.splice(firstHeadingIndex, 1);
            setCurrentContent(newContent);
        }
    };

    const handleAIGenerateTitle = async () => {
        if (!currentContent || currentContent.length === 0) return;
        setIsGeneratingTitle(true);
        try {
            const prompt = `Analyze the following content and suggest a short, catchy title (3-5 words) for it. Respond ONLY with the title, no quotes, no extra text.\n\nContent:\n${previewText.substring(0, 1000)}`;
            const generatedTitle = await generateText(prompt);
            if (generatedTitle) {
                setTitle(generatedTitle.replace(/["']/g, '').trim());
            }
        } catch (error) {
            console.error('Failed to generate title', error);
        } finally {
            setIsGeneratingTitle(false);
        }
    };

    const handleAISummarize = async () => {
        if (!currentContent || currentContent.length === 0) return;
        setIsSummarizing(true);
        try {
            const prompt = `Rewrite and clean up the following text. Organize it into clean bullet points or short paragraphs using markdown. Do not include a top-level # Title, just the body content. Make it concise and clear.\n\nText to clean:\n${previewText}`;
            const cleanedText = await generateText(prompt);
            
            if (cleanedText) {
                // Create a single new page block with the cleaned text
                import('uuid').then(({ v4: uuidv4 }) => {
                    const newBlock: Block = {
                        id: uuidv4(),
                        type: 'page',
                        content: cleanedText
                    };
                    setCurrentContent([newBlock]);
                });
            }
        } catch (error) {
            console.error('Failed to summarize content', error);
        } finally {
            setIsSummarizing(false);
        }
    };

    const handleConfirm = () => {
        onConfirm({
            title: title || 'Untitled Card',
            content: currentContent,
            color,
            tags: tagsList,
            viewMode
        });
    };

    return createPortal(
        <div className={styles.overlay} ref={overlayRef} onClick={handleOverlayClick} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
                <div className={styles.header}>
                    <h3 className={styles.title}>Convert to Card</h3>
                    <button className={styles.closeBtn} onClick={onClose} aria-label="Close">
                        <X size={20} />
                    </button>
                </div>

                <div className={styles.contentWrapper}>
                    {/* Controls Section */}
                    <div className={styles.controlsSection}>
                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Card Title</label>
                            <div className={styles.inputWrapper}>
                                <input
                                    autoFocus
                                    className={styles.input}
                                    value={title}
                                    onChange={(e) => setTitle(e.target.value)}
                                    placeholder="Enter card title..."
                                />
                                {hasHeading && (
                                    <button 
                                        className={styles.aiBtn} 
                                        onClick={handleUseHeadingAsTitle}
                                        title="Use first heading as title and remove it from content"
                                    >
                                        <Heading size={18} />
                                    </button>
                                )}
                                <button 
                                    className={styles.aiBtn} 
                                    onClick={handleAIGenerateTitle}
                                    disabled={isGeneratingTitle}
                                    title="Generate title with AI"
                                >
                                    {isGeneratingTitle ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                </button>
                            </div>
                        </div>

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Tags</label>
                            <input
                                className={styles.input}
                                value={tagsInput}
                                onChange={(e) => setTagsInput(e.target.value)}
                                placeholder="e.g. ideas, draft, important (comma separated)"
                            />
                        </div>

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Card Color</label>
                            <div className={styles.colorPicker}>
                                <button
                                    className={`${styles.colorSwatch} ${!color ? styles.selected : ''}`}
                                    style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-color)' }}
                                    onClick={() => setColor(undefined)}
                                    title="Default"
                                >
                                    {!color && <Check size={14} style={{ margin: 'auto', color: 'var(--text-main)' }} />}
                                </button>
                                {PRESET_COLORS.map(c => (
                                    <button
                                        key={c}
                                        className={`${styles.colorSwatch} ${color === c ? styles.selected : ''}`}
                                        style={{ backgroundColor: c }}
                                        onClick={() => setColor(c)}
                                        title={c}
                                    />
                                ))}
                            </div>
                        </div>

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Default View Mode</label>
                            <div className={styles.viewModeToggle}>
                                <button
                                    className={`${styles.viewModeBtn} ${viewMode === 'icon' ? styles.active : ''}`}
                                    onClick={() => setViewMode('icon')}
                                >
                                    <Square size={16} style={{ marginBottom: 4 }} /><br/>
                                    Icon
                                </button>
                                <button
                                    className={`${styles.viewModeBtn} ${viewMode === 'titleview' ? styles.active : ''}`}
                                    onClick={() => setViewMode('titleview')}
                                >
                                    <RectangleHorizontal size={16} style={{ marginBottom: 4 }} /><br/>
                                    Title
                                </button>
                                <button
                                    className={`${styles.viewModeBtn} ${viewMode === 'medium' ? styles.active : ''}`}
                                    onClick={() => setViewMode('medium')}
                                >
                                    <StickyNote size={16} style={{ marginBottom: 4 }} /><br/>
                                    Medium
                                </button>
                                <button
                                    className={`${styles.viewModeBtn} ${viewMode === 'expanded' ? styles.active : ''}`}
                                    onClick={() => setViewMode('expanded')}
                                >
                                    <PanelTop size={16} style={{ marginBottom: 4 }} /><br/>
                                    Expanded
                                </button>
                            </div>
                        </div>

                        <div className={styles.inputGroup}>
                            <label className={styles.label}>Content Optimization</label>
                            <button 
                                className={styles.aiBtn} 
                                onClick={handleAISummarize}
                                disabled={isSummarizing}
                            >
                                {isSummarizing ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />}
                                <span className={styles.aiBtnText}>Clean Up / Summarize with AI</span>
                            </button>
                        </div>
                    </div>

                    {/* Preview Section */}
                    <div className={styles.previewSection}>
                        <div className={styles.previewTitle}>Live Preview (Hidden Metadata)</div>
                        
                        {/* Using exact NoteCard classes for the preview */}
                        <div 
                            className={`${noteStyles.card} ${noteStyles.expandedView}`}
                            style={{ 
                                ...dynamicStyles,
                                minHeight: '250px', // Ensure it has some height in preview
                                backgroundColor: !displayColor ? 'var(--bg-rail)' : undefined, // Ensure default glass bg works
                            }}
                        >
                            <div className={noteStyles.minimalHeader} style={headerStyle}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1, minWidth: 0 }}>
                                    <div className={noteStyles.minimalIconButton}>
                                        <CardIcon icon={defaultIconName} size={20} />
                                    </div>
                                    <div className={noteStyles.minimalTitleInput} style={{ cursor: 'default', color: 'inherit' }}>
                                        {title || 'Untitled'}
                                    </div>
                                </div>
                                
                                <div className={noteStyles.controlsGroup}>
                                    <button className={noteStyles.controlBtn} style={{ cursor: 'default' }}>
                                        <Eye size={16} />
                                    </button>
                                    <button className={noteStyles.controlBtn} style={{ cursor: 'default' }}>
                                        <ExternalLink size={20} />
                                    </button>
                                    <button className={noteStyles.controlBtn} style={{ cursor: 'default' }}>
                                        <X size={20} />
                                    </button>
                                </div>
                            </div>

                            <div className={noteStyles.noteArea} style={noteAreaStyles}>
                                {tagsList.length > 0 && (
                                    <div style={{ display: 'flex', gap: '6px', flexWrap: 'wrap', marginBottom: '12px' }}>
                                        {tagsList.map(tag => (
                                            <span key={tag} className={styles.previewTag}>{tag}</span>
                                        ))}
                                    </div>
                                )}
                                
                                <div className={styles.previewContent} style={{ color: String((noteAreaStyles as Record<string, unknown>)['--color-text-main'] ?? 'inherit') }}>
                                    {previewText ? (
                                        <div style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
                                            {previewText}
                                        </div>
                                    ) : (
                                        <span style={{ opacity: 0.5 }}>No content</span>
                                    )}
                                </div>
                            </div>
                        </div>

                    </div>
                </div>

                <div className={styles.footer}>
                    <button className={styles.cancelBtn} onClick={onClose}>Cancel</button>
                    <button className={styles.confirmBtn} onClick={handleConfirm} disabled={!title.trim() || isGeneratingTitle || isSummarizing}>
                        Convert
                    </button>
                </div>
            </div>
        </div>,
        document.body
    );
}
