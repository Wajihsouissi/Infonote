import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import { ArrowLeft, Image as ImageIcon, Settings, X } from 'lucide-react';
import { useStore } from '../../store/useStore';
import { IconPicker } from '../card/IconPicker';
import { iconMap, defaultIconName } from '../card/iconMap';
import { ChipInput } from './ChipInput'; // Import ChipInput
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import type { NoteData } from '../../types';
import styles from './MetadataMenu.module.css';

interface MetadataMenuProps {
    nodeId: string;
}

export function MetadataMenu({ nodeId }: MetadataMenuProps) {
    const { nodes, updateNodeData, navigateToNode } = useStore();

    // Collapsible state
    const [isOpen, setIsOpen] = useState(false);
    const buttonRef = useRef<HTMLButtonElement>(null);
    const modalRef = useRef<HTMLDivElement>(null);
    const [modalPosition, setModalPosition] = useState({ top: 0, left: 0 });

    const node = nodes.find(n => n.id === nodeId);

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

    // Guard: Only show for Notes
    if (!node || node.type !== 'note') return null;

    const data = node.data as NoteData;

    // Sync from store
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

    // Calculate position
    useLayoutEffect(() => {
        if (isOpen && buttonRef.current && modalRef.current) {
            const btnRect = buttonRef.current.getBoundingClientRect();
            const modalRect = modalRef.current.getBoundingClientRect();
            const viewportWidth = window.innerWidth;

            // Default: To the left of the button
            let left = btnRect.left - modalRect.width - 12;
            let top = btnRect.top;

            // If not enough space on left, put on right? No, standard is right side panel.
            // If button is on right edge, left placement is correct.
            // Ensure no overflow
            if (left < 10) left = 10;
            if (left + modalRect.width > viewportWidth - 10) left = viewportWidth - modalRect.width - 10;

            // Height check
            if (top + modalRect.height > window.innerHeight - 20) {
                top = window.innerHeight - modalRect.height - 20;
            }
            // Ensure top > 20
            if (top < 20) top = 20;

            setModalPosition({ top, left });
        }
    }, [isOpen]);

    // Close on click outside
    useEffect(() => {
        const handleClickOutside = (e: MouseEvent) => {
            if (
                modalRef.current &&
                !modalRef.current.contains(e.target as Node) &&
                buttonRef.current &&
                !buttonRef.current.contains(e.target as Node)
            ) {
                setIsOpen(false);
            }
        };
        if (isOpen) {
            document.addEventListener('mousedown', handleClickOutside);
        }
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, [isOpen]);

    const IconComponent = iconMap[editedData.icon || defaultIconName] || iconMap[defaultIconName];

    const handleSave = () => {
        updateNodeData(nodeId, editedData);
    };

    // Immediate save for selects/chips
    const handleImmediateUpdate = (updates: Partial<NoteData>) => {
        setEditedData(prev => ({ ...prev, ...updates }));
        updateNodeData(nodeId, updates);
    };

    const handleIconSelect = (newIcon: string) => {
        handleImmediateUpdate({ icon: newIcon });
        setShowIconPicker(false);
    };

    const handleBack = () => {
        navigateToNode(node.parentId || null);
    };

    return (
        <>
            {/* Toggle Button - Always visible */}
            <button
                ref={buttonRef}
                className={`${styles.toggleBtn} ${isOpen ? styles.toggleBtnActive : ''}`}
                onClick={() => setIsOpen(!isOpen)}
                title={isOpen ? "Close Metadata" : "Open Metadata"}
            >
                {isOpen ? <X size={20} /> : <Settings size={20} />}
            </button>

            {/* Metadata Panel - Portal */}
            {isOpen && createPortal(
                <div
                    ref={modalRef}
                    className={styles.container}
                    style={{
                        top: modalPosition.top,
                        left: modalPosition.left,
                        position: 'fixed', // Override absolute from class
                        margin: 0,
                    }}
                >
                    {/* Header */}
                    <div className={styles.header}>
                        <button className={styles.backBtn} onClick={handleBack} title="Go Back">
                            <ArrowLeft size={20} />
                        </button>
                        <span className={styles.headerTitle}>Metadata</span>
                    </div>

                    <div className={styles.scrollContent}>
                        {/* Cover Image */}
                        <div className={styles.coverSection}>
                            {editedData.coverImage ? (
                                <div className={styles.coverPreview}>
                                    <img src={editedData.coverImage} alt="Cover" />
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
                            >
                                <IconComponent size={28} />
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

                        {/* Properties Grid */}

                        {/* Status */}
                        <div className={styles.fieldGroup}>
                            <label>Status</label>
                            <CustomSelect
                                value={editedData.status}
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
                                value={editedData.priority}
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
                                value={editedData.date}
                                onChange={(val) => handleImmediateUpdate({ date: val })}
                                placeholder="Set date"
                            />
                        </div>

                        {/* Due Date */}
                        <div className={styles.fieldGroup}>
                            <label>Due Date</label>
                            <CustomDatePicker
                                value={editedData.dueDate}
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
                        />
                    )}
                </div>,
                document.body
            )}
        </>
    );
}
