import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
    ExternalLink, 
    Copy, 
    MoreHorizontal, 
    FileText, 
    Tv, 
    Type, 
    RefreshCw, 
    Check, 
    AlertTriangle,
    Edit3
} from 'lucide-react';
import { fetchMetadata, getDomain, getShortUrl } from '../../services/metadataService';
import type { Block, BlockMetadata } from './types';
import styles from './LinkBlock.module.css';

interface LinkBlockProps {
    block: Block;
    readOnly?: boolean;
    onChange: (content: string, metadata?: BlockMetadata) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onPaste?: (e: React.ClipboardEvent) => void;
    domRef?: (el: HTMLDivElement | null) => void;
}

export const LinkBlock: React.FC<LinkBlockProps> = ({
    block,
    readOnly = false,
    onChange,
    onKeyDown,
    domRef
}) => {
    const url = block.content;
    const metadata = block.metadata || {};
    const displayMode = (metadata.displayMode || 'bookmark') as 'bookmark' | 'embed' | 'text';
    const isEmbeddable = metadata.isEmbeddable ?? false;
    const isLoading = metadata.isLoading ?? false;

    const [showMenu, setShowMenu] = useState(false);
    const [copied, setCopied] = useState(false);
    const [isEditingLabel, setIsEditingLabel] = useState(false);
    const [tempLabel, setTempLabel] = useState(metadata.customTitle || metadata.title || getShortUrl(url));
    const containerRef = useRef<HTMLDivElement>(null);
    const menuRef = useRef<HTMLDivElement>(null);

    // 1. Fetch metadata on mount or URL change if not present
    const loadMetadata = useCallback(async (force = false) => {
        if (!url) return;

        // Skip if already loaded and not forcing a reload
        if (!force && metadata.title && !metadata.isLoading) {
            return;
        }

        // Optimistic UI loading state
        onChange(url, {
            ...metadata,
            isLoading: true,
            displayMode // Preserve current mode
        });

        try {
            const data = await fetchMetadata(url);
            onChange(url, {
                ...metadata,
                ...data,
                isLoading: false,
                displayMode: metadata.displayMode || (data.isEmbeddable ? 'embed' : 'bookmark') // Autodetect best default representation
            });
            setTempLabel(metadata.customTitle || data.title || getShortUrl(url));
        } catch (e) {
            console.error('Failed to load metadata in LinkBlock:', e);
            onChange(url, {
                ...metadata,
                isLoading: false,
                error: true
            });
        }
    }, [url, metadata, onChange, displayMode]);

    useEffect(() => {
        loadMetadata();
    }, [url]);

    // Handle clicking outside the menu to close it
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
                setShowMenu(false);
            }
        };

        if (showMenu) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, [showMenu]);

    // Mode toggling
    const handleSwitchMode = useCallback((mode: 'bookmark' | 'embed' | 'text') => {
        onChange(url, {
            ...metadata,
            displayMode: mode
        });
        setShowMenu(false);
    }, [url, metadata, onChange]);

    // Copy URL
    const handleCopy = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        navigator.clipboard.writeText(url);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    }, [url]);

    // Open URL in new window
    const handleOpen = useCallback((e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        window.open(url, '_blank', 'noopener,noreferrer');
    }, [url]);

    // Ref registry
    const handleRef = useCallback((el: HTMLDivElement | null) => {
        if (domRef) domRef(el);
        (containerRef as React.MutableRefObject<HTMLDivElement | null>).current = el;
    }, [domRef]);

    // Text link label change
    const handleSaveLabel = useCallback(() => {
        setIsEditingLabel(false);
        onChange(url, {
            ...metadata,
            customTitle: tempLabel
        });
    }, [url, metadata, tempLabel, onChange]);

    // RENDER: Skeleton Loader
    const renderSkeleton = () => {
        return (
            <div className={styles.skeletonCard}>
                <div className={styles.skeletonInfo}>
                    <div className={`${styles.skeletonTitle} ${styles.shimmer}`} />
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', width: '100%' }}>
                        <div className={`${styles.skeletonDesc} ${styles.shimmer}`} />
                        <div className={`${styles.skeletonDesc2} ${styles.shimmer}`} />
                    </div>
                    <div className={styles.skeletonMeta}>
                        <div className={`${styles.skeletonFavicon} ${styles.shimmer}`} />
                        <div className={`${styles.skeletonDomain} ${styles.shimmer}`} />
                    </div>
                </div>
                <div className={`${styles.skeletonImage} ${styles.shimmer}`} />
            </div>
        );
    };

    // RENDER: Bookmark Card Preview
    const renderBookmark = () => {
        // If metadata is loading and we don't have a title yet, show skeleton
        if (isLoading && !metadata.title) {
            return renderSkeleton();
        }

        const titleText = metadata.title || getShortUrl(url);
        const descText = metadata.description || 'No description available for this link.';
        const domainName = getDomain(url);

        return (
            <div 
                className={styles.bookmarkCard}
                onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    window.open(url, '_blank', 'noopener,noreferrer');
                }}
            >
                <div className={styles.bookmarkInfo}>
                    <div className={styles.bookmarkTitle}>{titleText}</div>
                    <div className={styles.bookmarkDesc}>{descText}</div>
                    <div className={styles.bookmarkMeta}>
                        {metadata.favicon && (
                            <img 
                                src={metadata.favicon} 
                                alt="" 
                                className={styles.bookmarkFavicon}
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />
                        )}
                        <span className={styles.bookmarkDomain}>{domainName}</span>
                    </div>
                </div>
                {metadata.image && (
                    <div className={styles.bookmarkImageContainer}>
                        <img 
                            src={metadata.image} 
                            alt="" 
                            className={styles.bookmarkImage}
                            onError={(e) => {
                                (e.target as HTMLElement).style.display = 'none';
                            }}
                        />
                    </div>
                )}
            </div>
        );
    };

    // RENDER: Embedded Iframe View
    const renderEmbed = () => {
        if (!isEmbeddable || !metadata.embedUrl) {
            return (
                <div className={styles.embedFallback}>
                    <AlertTriangle size={24} className={styles.embedFallbackIcon} />
                    <div className={styles.embedFallbackTitle}>Embed Not Supported</div>
                    <div className={styles.embedFallbackText}>
                        This provider ({getDomain(url)}) doesn't support inline embedding, or the URL format is invalid.
                    </div>
                    <button 
                        onClick={() => handleSwitchMode('bookmark')} 
                        className={styles.dropdownItem}
                        style={{ width: 'auto', background: 'rgba(255,255,255,0.05)', padding: '6px 12px', border: '1px solid rgba(255,255,255,0.1)' }}
                    >
                        Switch to Bookmark Preview
                    </button>
                </div>
            );
        }

        const domain = getDomain(url);
        const isPdf = metadata.provider === 'pdf';

        return (
            <div className={styles.embedContainer}>
                <div className={styles.embedHeader}>
                    <div className={styles.embedTitle}>
                        <Tv size={12} />
                        <span>{metadata.title || `Embedded ${metadata.provider || domain}`}</span>
                    </div>
                </div>
                <div className={`${styles.embedContent} ${isPdf ? styles.pdfContent : ''}`}>
                    <iframe
                        src={metadata.embedUrl}
                        title={metadata.title || "Embedded resource"}
                        className={styles.embedIframe}
                        loading="lazy"
                        sandbox="allow-scripts allow-same-origin allow-presentation allow-forms allow-popups"
                        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
                        allowFullScreen
                    />
                </div>
            </div>
        );
    };

    // RENDER: Simple Text Link
    const renderTextLink = () => {
        const displayText = metadata.customTitle || metadata.title || getShortUrl(url);
        
        return (
            <div className={styles.textLinkContainer} onClick={(e) => e.stopPropagation()}>
                {isEditingLabel ? (
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                        <input
                            type="text"
                            value={tempLabel}
                            onChange={(e) => setTempLabel(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') handleSaveLabel();
                                if (e.key === 'Escape') setIsEditingLabel(false);
                            }}
                            className={styles.textLinkLabel}
                            style={{
                                background: 'var(--input-bg)',
                                border: '1px solid var(--input-border-focus)',
                                borderRadius: 'var(--r-xs)',
                                padding: '2px 6px',
                                color: 'var(--accent-ink)',
                                width: '180px'
                            }}
                            autoFocus
                        />
                        <button onClick={handleSaveLabel} className={styles.controlBtn} style={{ color: 'var(--ok)' }}>
                            <Check size={14} />
                        </button>
                    </div>
                ) : (
                    <span className={styles.textLinkWrapper} onClick={(e) => {
                        e.stopPropagation();
                        handleOpen(e);
                    }} title="Open link">
                        {metadata.favicon && (
                            <img 
                                src={metadata.favicon} 
                                alt="" 
                                className={styles.textLinkIcon} 
                                onError={(e) => {
                                    (e.target as HTMLElement).style.display = 'none';
                                }}
                            />
                        )}
                        <span>{displayText}</span>
                        <ExternalLink size={10} style={{ opacity: 0.6 }} />
                    </span>
                )}
            </div>
        );
    };

    return (
        <div 
            ref={handleRef}
            className={`${styles.container} ${showMenu ? styles.containerHasActiveMenu : ''}`}
            onKeyDown={onKeyDown}
            tabIndex={0}
        >
            {/* Display correct mode */}
            {!url ? (
                <div className={styles.inputContainer} onClick={(e) => e.stopPropagation()}>
                    <div className={styles.inputWrapper}>
                        <ExternalLink size={16} className={styles.inputIcon} />
                        <input
                            type="text"
                            placeholder="Paste a URL or link (e.g. YouTube, Figma, Spotify)..."
                            className={styles.inputField}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    const targetUrl = (e.currentTarget.value || '').trim();
                                    if (targetUrl) {
                                        onChange(targetUrl, {
                                            ...metadata,
                                            isLoading: true,
                                            displayMode: 'bookmark'
                                        });
                                    }
                                }
                            }}
                            autoFocus
                        />
                    </div>
                </div>
            ) : (
                <>
                    {displayMode === 'bookmark' && renderBookmark()}
                    {displayMode === 'embed' && renderEmbed()}
                    {displayMode === 'text' && renderTextLink()}
                </>
            )}

            {/* Hover Floating Actions & Mode Switcher */}
            {!readOnly && (
                <div className={styles.floatingControls}>
                    <button 
                        onClick={handleOpen} 
                        className={styles.controlBtn} 
                        title="Open in new tab"
                    >
                        <ExternalLink size={13} />
                    </button>
                    <button 
                        onClick={handleCopy} 
                        className={styles.controlBtn} 
                        title={copied ? "Copied!" : "Copy link"}
                    >
                        {copied ? <Check size={13} style={{ color: 'var(--ok)' }} /> : <Copy size={13} />}
                    </button>
                    <button 
                        onClick={() => loadMetadata(true)} 
                        className={`${styles.controlBtn} ${isLoading ? styles.shimmer : ''}`} 
                        title="Refresh metadata"
                        disabled={isLoading}
                    >
                        <RefreshCw size={13} className={isLoading ? 'animate-spin' : ''} />
                    </button>
                    
                    <div style={{ width: '1px', height: '14px', background: 'rgba(255,255,255,0.15)', margin: '0 4px' }} />
                    
                    <button 
                        onClick={() => setShowMenu(!showMenu)} 
                        className={`${styles.controlBtn} ${showMenu ? styles.controlBtnActive : ''}`} 
                        title="Link Display Modes"
                    >
                        <MoreHorizontal size={13} />
                    </button>
                </div>
            )}

            {/* Quick switcher dropdown */}
            {showMenu && (
                <div ref={menuRef} className={styles.dropdownMenu}>
                    <div style={{ padding: '6px 8px', fontSize: '10px', color: 'rgba(255,255,255,0.4)', fontWeight: 'bold' }}>
                        DISPLAY ASPECT
                    </div>
                    
                    <button 
                        onClick={() => handleSwitchMode('bookmark')} 
                        className={`${styles.dropdownItem} ${displayMode === 'bookmark' ? styles.dropdownItemActive : ''}`}
                    >
                        <FileText size={13} />
                        <span>Bookmark Preview</span>
                        {displayMode === 'bookmark' && <Check size={12} style={{ marginLeft: 'auto' }} />}
                    </button>
                    
                    <button 
                        onClick={() => handleSwitchMode('embed')} 
                        className={`${styles.dropdownItem} ${displayMode === 'embed' ? styles.dropdownItemActive : ''}`}
                        disabled={!isEmbeddable}
                        style={!isEmbeddable ? { opacity: 0.4, cursor: 'not-allowed' } : {}}
                        title={!isEmbeddable ? "Provider doesn't support embedding" : ""}
                    >
                        <Tv size={13} />
                        <span>Embedded Frame</span>
                        {displayMode === 'embed' && <Check size={12} style={{ marginLeft: 'auto' }} />}
                    </button>
                    
                    <button 
                        onClick={() => handleSwitchMode('text')} 
                        className={`${styles.dropdownItem} ${displayMode === 'text' ? styles.dropdownItemActive : ''}`}
                    >
                        <Type size={13} />
                        <span>Text Link Pill</span>
                        {displayMode === 'text' && <Check size={12} style={{ marginLeft: 'auto' }} />}
                    </button>

                    <div className={styles.dropdownSeparator} />
                    
                    <button 
                        onClick={() => { setIsEditingLabel(true); setShowMenu(false); }}
                        className={styles.dropdownItem}
                    >
                        <Edit3 size={13} />
                        <span>Rename Label</span>
                    </button>
                </div>
            )}
        </div>
    );
};
