import { useState, useEffect, useRef } from 'react';
import { Image as ImageIcon, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { IconPicker } from '../card/IconPicker';
import { defaultIconName, CardIcon } from '../card/iconMap';
import { ChipInput } from './ChipInput';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import type { NoteData } from '../../types';
import styles from './MetadataPanel.module.css';

interface MetadataPanelProps {
    nodeId: string | null | undefined;
    isOpen: boolean;
    onClose: () => void;
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MetadataPanel({ nodeId, isOpen, onClose, buttonRef }: MetadataPanelProps) {
    // Atomic Selectors
    const nodes = useStore(s => s.nodes);
    const updateNodeData = useStore(s => s.updateNodeData);

    const panelRef = useRef<HTMLDivElement>(null);
    const node = nodeId ? nodes.find(n => n.id === nodeId) : null;

    // Local state for editing
    const [isEditing, setIsEditing] = useState(false);
    const [showIconPicker, setShowIconPicker] = useState(false);

    // Initialize editedData safely with ALL fields
    const [editedData, setEditedData] = useState<NoteData>({
        label: '',
        description: '',
        icon: defaultIconName,
        coverImage: '',
        category: '',
        date: new Date().toISOString(),
        tags: [],
        status: 'todo',
        priority: 'medium',
        dueDate: '',
        assignee: ''
    });

    const data = node?.data as NoteData | undefined;

    // Sync from store when node or edits change
    useEffect(() => {
        if (data && !isEditing) {
            setEditedData({
                label: data.label || '',
                description: data.description || '',
                icon: data.icon || defaultIconName,
                coverImage: data.coverImage || '',
                category: data.category || '',
                date: data.date || new Date().toISOString(),
                tags: data.tags || [],
                status: data.status || 'todo',
                priority: data.priority || 'medium',
                dueDate: data.dueDate || '',
                assignee: data.assignee || ''
            });
        }
    }, [data, isEditing]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (!isOpen) return;

            // Make sure the clicked element is not inside the panel container,
            // nor is it the toggle button in the toolbar.
            const clickedInsidePanel = panelRef.current?.contains(e.target as Node);
            const clickedOnButton = buttonRef?.current?.contains(e.target as Node);

            if (!clickedInsidePanel && !clickedOnButton) {
                onClose();
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen, onClose, buttonRef]);

    // Close on Esc key press
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (isOpen && e.key === 'Escape') {
                onClose();
            }
        };

        document.addEventListener('keydown', handleKeyDown);
        return () => document.removeEventListener('keydown', handleKeyDown);
    }, [isOpen, onClose]);

    if (!node || node.type !== 'note') {
        // Return a collapsed container to preserve CSS transition smoothness
        return (
            <div
                ref={panelRef}
                className={`${styles.panel} ${styles.panelClosed}`}
                style={{ width: 0 }}
            />
        );
    }

    const handleSave = () => {
        if (nodeId) {
            updateNodeData(nodeId, editedData);
        }
    };

    // Immediate save for selects/chips
    const handleImmediateUpdate = (updates: Partial<NoteData>) => {
        setEditedData(prev => ({ ...prev, ...updates }));
        if (nodeId) {
            updateNodeData(nodeId, updates);
        }
    };

    const handleIconSelect = (newIcon: string) => {
        handleImmediateUpdate({ icon: newIcon });
        setShowIconPicker(false);
    };

    const showPanel = isOpen && !!node;

    return (
        <div
            ref={panelRef}
            className={`${styles.panel} ${showPanel ? styles.panelOpen : styles.panelClosed}`}
        >
            {/* Sticky Header */}
            <div className={styles.header}>
                <div className={styles.headerLeft}>
                    <span className={styles.headerTitle}>Properties</span>
                </div>
                <button className={styles.closeBtn} onClick={onClose} title="Close Panel">
                    <X size={18} />
                </button>
            </div>

            {/* Scrollable Content */}
            <div className={styles.scrollContent}>
                {/* Cover Image */}
                <div className={styles.coverSection}>
                    {editedData.coverImage ? (
                        <div className={styles.coverPreview}>
                            <img src={editedData.coverImage} alt="Cover" loading="lazy" />
                            <button
                                className={styles.removeCoverBtn}
                                onClick={() => handleImmediateUpdate({ coverImage: '' })}
                            >
                                ×
                            </button>
                        </div>
                    ) : (
                        <button
                            className={styles.addCoverBtn}
                            onClick={() => {
                                const url = prompt("Enter Image URL:");
                                if (url) handleImmediateUpdate({ coverImage: url });
                            }}
                        >
                            <ImageIcon size={16} />
                            <span>Add Cover Image</span>
                        </button>
                    )}
                </div>

                {/* Title & Icon */}
                <div className={styles.titleSection}>
                    <button
                        className={styles.iconBtn}
                        onClick={() => setShowIconPicker(true)}
                        title="Change Icon"
                    >
                        <CardIcon icon={editedData.icon || defaultIconName} size={24} />
                    </button>
                    <input
                        className={styles.titleInput}
                        value={editedData.label}
                        onChange={(e) => setEditedData(prev => ({ ...prev, label: e.target.value }))}
                        onBlur={handleSave}
                        onFocus={() => setIsEditing(true)}
                        placeholder="Page Title"
                    />
                </div>

                {/* Description */}
                <div className={styles.fieldGroup}>
                    <label>Description</label>
                    <textarea
                        className={styles.descriptionInput}
                        value={editedData.description}
                        onChange={(e) => setEditedData(prev => ({ ...prev, description: e.target.value }))}
                        onBlur={handleSave}
                        onFocus={() => setIsEditing(true)}
                        placeholder="Add a description..."
                        rows={3}
                    />
                </div>

                <hr className={styles.divider} />

                {/* Properties List */}

                {/* Status */}
                <div className={styles.fieldGroup}>
                    <label>Status</label>
                    <CustomSelect
                        value={editedData.status || 'todo'}
                        options={[
                            { label: 'To Do', value: 'todo' },
                            { label: 'In Progress', value: 'in-progress' },
                            { label: 'Review', value: 'review' },
                            { label: 'Done', value: 'done' },
                        ]}
                        onChange={(val) => handleImmediateUpdate({ status: val as any })}
                    />
                </div>

                {/* Priority */}
                <div className={styles.fieldGroup}>
                    <label>Priority</label>
                    <CustomSelect
                        value={editedData.priority || 'medium'}
                        options={[
                            { label: 'Low', value: 'low' },
                            { label: 'Medium', value: 'medium' },
                            { label: 'High', value: 'high' },
                            { label: 'Urgent', value: 'urgent' },
                        ]}
                        onChange={(val) => handleImmediateUpdate({ priority: val as any })}
                    />
                </div>

                {/* Tags */}
                <div className={styles.fieldGroup}>
                    <label>Tags</label>
                    <ChipInput
                        value={editedData.tags || []}
                        onChange={(tags) => handleImmediateUpdate({ tags })}
                    />
                </div>

                {/* Date */}
                <div className={styles.fieldGroup}>
                    <label>Date</label>
                    <CustomDatePicker
                        value={editedData.date || ''}
                        onChange={(val) => handleImmediateUpdate({ date: val })}
                        placeholder="Set date"
                    />
                </div>

                {/* Due Date */}
                <div className={styles.fieldGroup}>
                    <label>Due Date</label>
                    <CustomDatePicker
                        value={editedData.dueDate || ''}
                        onChange={(val) => handleImmediateUpdate({ dueDate: val })}
                        placeholder="Set due date"
                    />
                </div>
            </div>

            {/* Icon Picker Modal */}
            {showIconPicker && (
                <IconPicker
                    currentIcon={editedData.icon || defaultIconName}
                    onSelect={handleIconSelect}
                    onClose={() => setShowIconPicker(false)}
                    isAbsolute={true}
                />
            )}
        </div>
    );
}
