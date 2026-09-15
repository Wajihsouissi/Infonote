import { useState, useMemo } from 'react';
import { Image as ImageIcon, CircleDot, Flag, Calendar, Tag, CheckSquare } from '../../components/icons';
import { Tabs, type TabItem } from '../../components/ui/Tabs';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import { IconPicker } from '../card/IconPicker';
import { CoverPicker } from '../card/CoverPicker';
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
import { parseCardDate } from '../../utils/cardDate';

type PanelTab = 'details' | 'planning' | 'tasks';

/** One read-only value reported from a tab you are not currently on. */
type SummaryChip = { key: string; icon: React.ReactNode; text: string };

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
    const [showCoverPicker, setShowCoverPicker] = useState(false);
    const [openTaskId, setOpenTaskId] = useState<string | null>(null);
    const [tab, setTab] = useState<PanelTab>('details');

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
    const [previousSource, setPreviousSource] = useState<{ data: NoteData | undefined; isEditing: boolean }>({ data: undefined, isEditing: false });
    if (previousSource.data !== data || previousSource.isEditing !== isEditing) {
        setPreviousSource({ data, isEditing });
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
    }

    /* Everything below runs BEFORE the early return: a hook after a conditional
       return makes React throw "rendered more hooks than during the previous
       render" the moment a non-note node is selected. */
    const taskCount = node && node.type === 'note'
        ? taskProgress(node.data)
        : { done: 0, total: 0 };

    /* Three short screens instead of one long column. */
    const tabItems = useMemo<TabItem<PanelTab>[]>(() => [
        { id: 'details', label: 'Details' },
        { id: 'planning', label: 'Planning' },
        { id: 'tasks', label: 'Tasks', badge: taskCount.total > 0 ? `${taskCount.done}/${taskCount.total}` : undefined },
    ], [taskCount.done, taskCount.total]);

    /* What is set on the tabs you are NOT looking at. Splitting a panel into
       tabs hides two thirds of it, and without this the only way to learn
       whether a due date exists is to go and look. Read-only on purpose — it
       reports, the tab edits. */
    const summary = useMemo(() => {
        const STATUS: Record<string, string> = { todo: 'To Do', 'in-progress': 'In Progress', review: 'Review', done: 'Done' };
        const PRIORITY: Record<string, string> = { low: 'Low', medium: 'Medium', high: 'High', urgent: 'Urgent' };
        /* Card dates come in two stored shapes; cardDate.ts is the only safe
           reader for them — never `new Date(string)` here. */
        const dateLabel = (iso?: string) => {
            const parsed = iso ? parseCardDate(iso) : null;
            return parsed ? parsed.toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : null;
        };
        const date = dateLabel(editedData.date);
        const due = dateLabel(editedData.dueDate);

        const planning: (SummaryChip | null)[] = [
            editedData.status ? { key: 'status', icon: <CircleDot size={12} />, text: STATUS[editedData.status] ?? editedData.status } : null,
            editedData.priority ? { key: 'priority', icon: <Flag size={12} />, text: PRIORITY[editedData.priority] ?? editedData.priority } : null,
            date ? { key: 'date', icon: <Calendar size={12} />, text: date } : null,
            due ? { key: 'due', icon: <Calendar size={12} />, text: `Due ${due}` } : null,
        ];

        const byTab: Record<PanelTab, SummaryChip[]> = {
            details: editedData.tags?.length
                ? [{ key: 'tags', icon: <Tag size={12} />, text: `${editedData.tags.length} tag${editedData.tags.length === 1 ? '' : 's'}` }]
                : [],
            planning: planning.filter((chip): chip is SummaryChip => chip !== null),
            tasks: taskCount.total > 0
                ? [{ key: 'tasks', icon: <CheckSquare size={12} />, text: `${taskCount.done}/${taskCount.total} tasks` }]
                : [],
        };

        return (Object.keys(byTab) as PanelTab[])
            .filter((key) => key !== tab)
            .flatMap((key) => byTab[key]);
    }, [editedData.status, editedData.priority, editedData.date, editedData.dueDate, editedData.tags, taskCount.done, taskCount.total, tab]);

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
                            onClick={() => setShowCoverPicker(true)}
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

                {/* Three groups instead of one column — see the layout study.
                    The cover and the title stay above the strip: they identify
                    the card, so they belong to all three tabs, not one. */}
                <Tabs
                    className={styles.tabs}
                    items={tabItems}
                    value={tab}
                    onChange={setTab}
                    radius="md"
                    fullWidth
                    aria-label="Card properties sections"
                />

                {tab === 'details' && (<>
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
                        rows={6}
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
                </>)}

                {tab === 'planning' && (<>
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
                </>)}

                {/* Tasks.

                    Checklist lines typed into the note body show up here as
                    tasks, indented ones as their subtasks — see
                    features/card/cardTasks.ts. A task added here is the card's
                    own and is not written into the body until you ask for it
                    with the row's "add to note" action. */}
                {tab === 'tasks' && (
                    <div className={styles.fieldGroup}>
                        <TaskList
                            data={node.data}
                            onPatch={(patch) => nodeId && updateNodeData(nodeId, patch as Record<string, unknown>)}
                            onOpenTask={setOpenTaskId}
                            dense
                        />
                    </div>
                )}

                {/* The other tabs, reported. */}
                {summary.length > 0 && (
                    <div className={styles.summaryStrip}>
                        {summary.map((chip) => (
                            <span key={chip.key} className={styles.summaryChip}>
                                {chip.icon}
                                {chip.text}
                            </span>
                        ))}
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

            {/* The same picker the card and the expanded view use — upload, drop,
                paste a link or choose from the library. This button used to call
                window.prompt() for a URL, which is the only place in the app a
                cover could not be uploaded. */}
            {showCoverPicker && (
                <CoverPicker
                    currentCover={editedData.coverImage || ''}
                    onSelect={(url) => handleImmediateUpdate({ coverImage: url })}
                    onClose={() => setShowCoverPicker(false)}
                />
            )}
        </SidePeek>
    );
}
