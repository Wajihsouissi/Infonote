import { useState, useEffect } from 'react';
import { Image as ImageIcon } from '../../components/icons';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import { IconPicker } from '../card/IconPicker';
import { defaultIconName, CardIcon } from '../card/iconMap';
import { ChipInput } from './ChipInput';
import { CustomSelect } from './CustomSelect';
import { CustomDatePicker } from './CustomDatePicker';
import type { NoteData } from '../../types';
import styles from './MetadataPanel.module.css';
import { SidePeek } from './SidePeek';
import { TaskList } from '../card/tasks/TaskList';
import { TaskDetail } from '../card/tasks/TaskDetail';
import { taskProgress } from '../card/cardTasks';

interface MetadataPanelProps {
    nodeId: string | null | undefined;
    isOpen: boolean;
    onClose: () => void;
    buttonRef?: React.RefObject<HTMLButtonElement | null>;
}

export function MetadataPanel({ nodeId, isOpen, onClose, buttonRef }: MetadataPanelProps) {
    // Atomic Selectors
    const updateNodeData = useStore(s => s.updateNodeData);

    const node = useStore(s => getNodeById(s.nodes, nodeId ?? undefined));

    // Local state for editing
    const [isEditing, setIsEditing] = useState(false);
    const [showIconPicker, setShowIconPicker] = useState(false);
    const [openTaskId, setOpenTaskId] = useState<string | null>(null);

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

    if (!node || node.type !== 'note') {
        return <SidePeek isOpen={false} onClose={onClose} title="Properties">{null}</SidePeek>;
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

    const taskCount = taskProgress(node.data);

    const handleIconSelect = (newIcon: string) => {
        handleImmediateUpdate({ icon: newIcon });
        setShowIconPicker(false);
    };

    return (
        <SidePeek
            isOpen={isOpen && !!node}
            onClose={onClose}
            side="right"
            title="Properties"
            width="45vw"
            buttonRef={buttonRef}
        >
            {/* Scrollable Content */}
            <div className={styles.contentWrapper}>
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
                        className={`${styles.iconBtn} icon-hover`}
                        onClick={() => setShowIconPicker(true)}
                        title="Change icon"
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
                        onChange={(val) => handleImmediateUpdate({ status: val as NoteData['status'] })}
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
                        onChange={(val) => handleImmediateUpdate({ priority: val as NoteData['priority'] })}
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
                        withTime
                    />
                </div>

                {/* Tasks.

                    Checklist lines typed into the note body show up here as
                    tasks, indented ones as their subtasks — see
                    features/card/cardTasks.ts. A task added here is the card's
                    own and is not written into the body until you ask for it
                    with the row's "add to note" action. */}
                {node.type === 'note' && (
                    <div className={styles.fieldGroup}>
                        <label>
                            Tasks
                            {taskCount.total > 0 && (
                                <span className={styles.fieldCount}>
                                    {taskCount.done}/{taskCount.total}
                                </span>
                            )}
                        </label>
                        <TaskList
                            data={node.data}
                            onPatch={(patch) => nodeId && updateNodeData(nodeId, patch as Record<string, unknown>)}
                            onOpenTask={setOpenTaskId}
                            dense
                        />
                    </div>
                )}
            </div>

            {/* One task, opened over the panel — the panel column is too narrow
                for dates, a description and an image side by side. */}
            {node.type === 'note' && openTaskId && (
                <div className={styles.taskOverlay} role="dialog" aria-label="Task details">
                    <TaskDetail
                        data={node.data}
                        onPatch={(patch) => nodeId && updateNodeData(nodeId, patch as Record<string, unknown>)}
                        taskId={openTaskId}
                        onBack={() => setOpenTaskId(null)}
                    />
                </div>
            )}

            {/* Icon Picker Modal */}
            {showIconPicker && (
                <IconPicker
                    currentIcon={editedData.icon || defaultIconName}
                    onSelect={handleIconSelect}
                    onClose={() => setShowIconPicker(false)}
                    isAbsolute={true}
                />
            )}
        </SidePeek>
    );
}
