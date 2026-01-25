import { memo, useEffect, useCallback, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';
import type { NoteNode } from '../../types';
import { useStore } from '../../store/useStore';
import { NotePropertiesPanel } from '../card/properties/NotePropertiesPanel';
import styles from './KanbanCardModal.module.css';

interface KanbanCardModalProps {
    node: NoteNode;
    onClose: () => void;
}

export const KanbanCardModal = memo(({ node, onClose }: KanbanCardModalProps) => {
    const updateNodeData = useStore(s => s.updateNodeData);
    const modalRef = useRef<HTMLDivElement>(null);

    const [title, setTitle] = useState(node.data.label);
    const [description, setDescription] = useState(node.data.description || '');

    // Sync local state with external changes
    useEffect(() => {
        setTitle(node.data.label);
        setDescription(node.data.description || '');
    }, [node.data.label, node.data.description]);

    // Close on Escape
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [onClose]);

    // Close on backdrop click
    const handleBackdropClick = useCallback((e: React.MouseEvent) => {
        if (e.target === e.currentTarget) {
            onClose();
        }
    }, [onClose]);

    // Save title on blur
    const handleTitleBlur = useCallback(() => {
        if (title.trim() !== node.data.label) {
            updateNodeData(node.id, { label: title.trim() });
        }
    }, [title, node.id, node.data.label, updateNodeData]);

    // Save description on blur
    const handleDescriptionBlur = useCallback(() => {
        const newDesc = description.trim();
        if (newDesc !== (node.data.description || '')) {
            updateNodeData(node.id, { description: newDesc || undefined });
        }
    }, [description, node.id, node.data.description, updateNodeData]);

    // Handle property updates
    const handlePropertyUpdate = useCallback((data: Partial<typeof node.data>) => {
        updateNodeData(node.id, data);
    }, [node.id, updateNodeData]);

    // Auto-resize textarea
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = textareaRef.current.scrollHeight + 'px';
        }
    }, [description]);

    const modalContent = (
        <div className={styles.backdrop} onClick={handleBackdropClick}>
            <div className={styles.modal} ref={modalRef}>
                {/* Close Button */}
                <button className={styles.closeBtn} onClick={onClose}>
                    <X size={20} />
                </button>

                {/* Header - Title */}
                <div className={styles.header}>
                    <input
                        className={styles.titleInput}
                        value={title}
                        onChange={(e) => setTitle(e.target.value)}
                        onBlur={handleTitleBlur}
                        placeholder="Untitled"
                        onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                                e.preventDefault();
                                (e.target as HTMLInputElement).blur();
                            }
                        }}
                    />
                </div>

                {/* Properties Panel */}
                <div className={styles.propertiesSection}>
                    <NotePropertiesPanel
                        data={node.data}
                        onUpdate={handlePropertyUpdate}
                    />
                </div>

                {/* Divider */}
                <div className={styles.divider} />

                {/* Description */}
                <div className={styles.descriptionSection}>
                    <label className={styles.sectionLabel}>Description</label>
                    <textarea
                        ref={textareaRef}
                        className={styles.descriptionInput}
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        onBlur={handleDescriptionBlur}
                        placeholder="Add a description..."
                        rows={3}
                    />
                </div>
            </div>
        </div>
    );

    return createPortal(modalContent, document.body);
});
