import React, { useEffect, useRef, useState } from 'react';
import { X } from '../../components/icons';
import styles from './SidePeek.module.css';

export interface SidePeekProps {
    isOpen: boolean;
    onClose: () => void;
    side?: 'left' | 'right';
    title?: string;
    icon?: React.ReactNode;
    children: React.ReactNode;
    width?: number | string;
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
    hideHeader?: boolean;
}

export function SidePeek({ 
    isOpen, 
    onClose, 
    side = 'right', 
    title, 
    icon, 
    children, 
    width = 320,
    buttonRef,
    hideHeader = false
}: SidePeekProps) {
    const panelRef = useRef<HTMLDivElement>(null);
    const [currentWidth, setCurrentWidth] = useState<string | number>(width);
    
    useEffect(() => {
        setCurrentWidth(width);
    }, [width]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!isOpen) return;

            const clickedInsidePanel = panelRef.current?.contains(e.target as Node);
            const clickedOnButton = buttonRef?.current?.contains(e.target as Node);
            // Child dialogs are portalled to body, so DOM containment cannot
            // see them. A cover picker belongs to this peek, not the canvas.
            const clickedInChildDialog = (e.target as HTMLElement | null)?.closest?.('[data-cover-picker]');
            // The app menu is chrome, not canvas — it docks to the side while
            // this panel is open, so closing on its clicks would pull the rail
            // away mid-press and swallow the button hit.
            const clickedInMenu = (e.target as HTMLElement | null)?.closest?.('[data-app-menu]');

            if (!clickedInsidePanel && !clickedOnButton && !clickedInMenu && !clickedInChildDialog) {
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

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        const startX = e.clientX;
        const startWidthPx = panelRef.current?.getBoundingClientRect().width || 0;
        
        // Temporarily disable transitions during drag
        if (panelRef.current) {
            panelRef.current.style.transition = 'none';
        }

        const handleMouseMove = (moveEvent: MouseEvent) => {
            const deltaX = moveEvent.clientX - startX;
            // If side is left, dragging right increases width. If side is right, dragging left increases width.
            let newWidthPx = startWidthPx + (side === 'left' ? deltaX : -deltaX);
            const maxPx = window.innerWidth * 0.5; // Max 50%
            const minPx = window.innerWidth * 0.2; // Min 20%
            if (newWidthPx > maxPx) newWidthPx = maxPx;
            if (newWidthPx < minPx) newWidthPx = minPx;
            setCurrentWidth(newWidthPx);
        };

        const handleMouseUp = () => {
            document.removeEventListener('mousemove', handleMouseMove);
            document.removeEventListener('mouseup', handleMouseUp);
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
            
            // Re-enable transitions
            if (panelRef.current) {
                panelRef.current.style.transition = '';
            }
        };

        document.addEventListener('mousemove', handleMouseMove);
        document.addEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = 'col-resize';
        document.body.style.userSelect = 'none';
    };

    // Ensure we don't render content if completely closed to save performance,
    // but keep the container in the DOM for CSS transitions.
    const showPanel = isOpen;

    return (
        <div 
            ref={panelRef}
            className={`
                ${styles.panel} 
                ${showPanel ? styles.panelOpen : styles.panelClosed}
                ${side === 'left' ? styles.sideLeft : styles.sideRight}
            `}
            style={{ 
                width: showPanel ? currentWidth : 0,
                order: side === 'left' ? -1 : 1,
                // Adjust transform origin/direction based on side
                transform: showPanel 
                    ? 'translateX(0)' 
                    : `translateX(${side === 'left' ? '-' : ''}15px)`
            }}
        >
            {/* Resize Handle */}
            {showPanel && (
                <div 
                    className={styles.resizeHandle}
                    onMouseDown={handleMouseDown}
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${side} panel`}
                    style={{
                        [side === 'left' ? 'right' : 'left']: 0
                    }}
                >
                    <span className={styles.resizeGrip} aria-hidden="true" />
                    <span className={styles.resizeTooltip}>Resize</span>
                </div>
            )}
            {/* Sticky Header */}
            {!hideHeader && title && (
                <div className={styles.header}>
                    <div className={styles.headerLeft}>
                        {icon && <div className={styles.headerIcon}>{icon}</div>}
                        <span className={styles.headerTitle}>{title}</span>
                    </div>
                    <div className={styles.headerActions}>
                        <button className={`${styles.closeBtn} icon-hover`} onClick={onClose} title="Close Panel">
                            <X size={18} />
                        </button>
                    </div>
                </div>
            )}

            {/* Scrollable Content */}
            <div className={styles.scrollContent} style={{ 
                ...(hideHeader ? { padding: 0 } : {}),
                overflowX: 'hidden'
            }}>
                <div style={{ width: isOpen ? '100%' : currentWidth, minHeight: '100%', display: 'flex', flexDirection: 'column' }}>
                    {children}
                </div>
            </div>
        </div>
    );
}
