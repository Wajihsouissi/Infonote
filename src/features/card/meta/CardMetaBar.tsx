/**
 * A card's metadata, as one wrapping row of chips.
 *
 * The compact replacement for NotePropertiesPanel's stacked rows. That panel
 * spent 303px — 56% of a 542px card — rendering seven words, because every
 * property took a full 444px line to show a value that used under a quarter of
 * it. A chip is the width of its own value, and the row wraps.
 *
 * Nothing is hidden: every set property is a chip, every unset one is behind
 * the "+", and clicking any chip edits it in place. Tasks are the one
 * exception and deliberately so — they collapse to a `3/7` chip that opens the
 * task modal, because the card's body already lists them as checkboxes and the
 * old panel was drawing that same list a second time.
 *
 * Labels are gone because the values say what they are: a calendar beside a
 * date needs no "Due Date" caption. The two that are not self-evident,
 * assignee and URL, keep an icon and a tooltip.
 */

import { memo, useCallback, useMemo, useState } from 'react';
import {
    BarChart3,
    Calendar,
    CheckSquare,
    Flag,
    Link2,
    Plus,
    Tag,
    User,
} from '../../../components/icons';

import { useStore } from '../../../store/useStore';
import { CustomDatePicker } from '../../ui/CustomDatePicker';
import { ChipInput } from '../../ui/ChipInput';
import { dayKeyOf, diffDays, formatTimeOfDay, parseCardDate, parseCardTime } from '../../../utils/cardDate';
import type { NoteData } from '../../../types';
import { taskProgress } from '../cardTasks';
import { MetaPopover } from './MetaPopover';
import styles from './CardMetaBar.module.css';

/** The properties a chip can stand for. Tasks are not here — they open a modal. */
type Field = 'status' | 'priority' | 'startDate' | 'dueDate' | 'dates' | 'assignee' | 'progress' | 'completion' | 'url' | 'tags';

/**
 * Four statuses that can actually be told apart.
 *
 * Not the shared `amber`/`azure` tone names the lanes use: in
 * design-system.css `--a-amber`, `--a-azure` and `--a-rose` all resolve to
 * #ff5040, so In Progress and In Review render the SAME colour there. These map
 * to hues that are genuinely distinct in both themes, which is the whole point
 * of colouring a status at all. (The shared tokens still collide — worth fixing
 * at the palette, but that is an app-wide change, not this bar's to make.)
 */
const STATUS_OPTIONS = [
    { value: 'todo', label: 'To Do', tone: 'neutral' },
    { value: 'in-progress', label: 'In Progress', tone: 'warn' },
    { value: 'review', label: 'In Review', tone: 'magenta' },
    { value: 'done', label: 'Done', tone: 'jade' },
] as const;

/**
 * Only urgent gets a colour.
 *
 * Status and the due date already carry the row's hue; a third one beside them
 * turns the run into a stripe of colour with no order to it. The rest read
 * through the flag's own tint, which is enough to tell high from low without
 * competing for the eye.
 */
const PRIORITY_OPTIONS = [
    { value: 'urgent', label: 'Urgent', tone: 'danger' },
    { value: 'high', label: 'High', tone: 'quiet-warn' },
    { value: 'medium', label: 'Medium', tone: 'quiet' },
    { value: 'low', label: 'Low', tone: 'quiet' },
] as const;

/** A completion ring — the fraction as a shape, not just a number. */
const ProgressRing = memo(({ percent }: { percent: number }) => {
    const circumference = 2 * Math.PI * 8;
    return (
        <svg width="13" height="13" viewBox="0 0 22 22" fill="none" aria-hidden="true" style={{ flex: 'none' }}>
            <circle cx="11" cy="11" r="8" stroke="currentColor" strokeWidth="3" opacity="0.28" />
            <circle
                cx="11" cy="11" r="8"
                /* Jade whether or not it is finished: the arc reports how much
                   is done, and the accent red would read as an alert on a chip
                   that is only saying "1 of 5". */
                stroke="var(--a-jade)"
                strokeWidth="3"
                strokeLinecap="round"
                strokeDasharray={circumference}
                strokeDashoffset={circumference * (1 - Math.max(0, Math.min(1, percent / 100)))}
                transform="rotate(-90 11 11)"
            />
        </svg>
    );
});
ProgressRing.displayName = 'CardMetaProgressRing';

const ADDABLE: ReadonlyArray<readonly [Exclude<Field, 'dates' | 'completion'>, string, typeof Flag]> = [
    ['status', 'Status', Flag],
    ['priority', 'Priority', Flag],
    ['startDate', 'Start date', Calendar],
    ['dueDate', 'Due date', Calendar],
    ['assignee', 'Assignee', User],
    ['progress', 'Progress', BarChart3],
    ['url', 'Link', Link2],
    ['tags', 'Tags', Tag],
];

/** Tag chips drawn before the rest collapse into a count. */
const MAX_TAGS = 3;

const statusOf = (v?: string) => STATUS_OPTIONS.find((o) => o.value === v);
const priorityOf = (v?: string) => PRIORITY_OPTIONS.find((o) => o.value === v);

/** A date as a chip reads it: short, and with the time only when there is one. */
function dateChipText(raw?: string): string | null {
    const d = parseCardDate(raw);
    if (!d) return null;
    const time = parseCardTime(raw);
    const day = d.toLocaleDateString(undefined, {
        day: 'numeric',
        month: 'short',
        year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric',
    });
    return time === null ? day : `${day}, ${formatTimeOfDay(time)}`;
}

/** How alarming a due date is — the same states the board card uses. */
function dueTone(raw?: string): string {
    const d = parseCardDate(raw);
    if (!d) return 'neutral';
    const days = diffDays(new Date(), d);
    if (days < 0) return 'danger';
    if (days === 0) return 'accent';
    if (days <= 7) return 'warn';
    return 'neutral';
}

/** A URL without its scheme — the host is what identifies it in a chip. */
const shortUrl = (url: string): string => {
    try {
        const u = new URL(url.includes('://') ? url : `https://${url}`);
        return u.host + (u.pathname !== '/' ? u.pathname : '');
    } catch {
        return url;
    }
};

/**
 * One chip. `onPick` is handed the element so the editor can anchor to it.
 *
 * Defined at module scope, not inside the bar: a component declared in a render
 * body is a new type on every pass, and React remounts its whole subtree each
 * time — which for a chip means losing focus mid-click.
 */
const Chip = memo(({ tone, title, onPick, children }: {
    tone: string;
    title: string;
    onPick: (anchor: HTMLElement) => void;
    children: React.ReactNode;
}) => (
    <button
        type="button"
        className={`${styles.chip} nodrag`}
        data-tone={tone}
        title={title}
        aria-label={title}
        onPointerDown={(e) => e.stopPropagation()}
        onClick={(e) => {
            e.stopPropagation();
            onPick(e.currentTarget);
        }}
    >
        {children}
    </button>
));
Chip.displayName = 'CardMetaChip';

export interface CardMetaBarProps {
    nodeId: string;
    data: NoteData;
    onUpdate: (updates: Partial<NoteData>) => void;
}

export const CardMetaBar = memo(({ nodeId, data, onUpdate }: CardMetaBarProps) => {
    const setTasksCardId = useStore((s) => s.setTasksCardId);

    /* The open editor carries its own anchor element, captured from the click
       that opened it. Keeping anchors in a ref and reading them while rendering
       the popover would be a ref read during render — unsound, and the React
       compiler is right to reject it. */
    const [open, setOpen] = useState<{ field: Field; anchor: HTMLElement } | null>(null);
    const [addAnchor, setAddAnchor] = useState<HTMLElement | null>(null);

    const tasks = useMemo(() => taskProgress(data), [data]);

    const set = useCallback((patch: Partial<NoteData>) => {
        onUpdate(patch);
    }, [onUpdate]);

    /** Open this chip's editor, or close it if it was already the open one. */
    const toggle = useCallback((field: Field, anchor: HTMLElement) => {
        setAddAnchor(null);
        setOpen((cur) => (cur?.field === field ? null : { field, anchor }));
    }, []);

    const close = useCallback(() => setOpen(null), []);

    const has = useCallback((f: Exclude<Field, 'dates' | 'completion'>): boolean => {
        const v = data[f as keyof NoteData];
        if (f === 'tags') return Array.isArray(v) && v.length > 0;
        return v !== undefined && v !== null && v !== '';
    }, [data]);

    /* A hand-set percentage on a card that also has a checklist has no chip of
       its own — the checklist won the label. Keeping Progress in the "+" menu
       is what stops that number from becoming unreachable and unclearable. */
    const unset = ADDABLE.filter(([f]) => !has(f) || (f === 'progress' && tasks.total > 0));
    const tags = data.tags ?? [];
    const startText = dateChipText(data.startDate);
    const dueText = dateChipText(data.dueDate);
    const field = open?.field;

    /* A span that begins and ends on one day is one chip rather than two, and
       the second half is a time rather than the same date repeated. */
    const startDay = dayKeyOf(data.startDate);
    const sameDayRange = !!startDay && startDay === dayKeyOf(data.dueDate);
    const dueMinutes = parseCardTime(data.dueDate);
    const rangeText = sameDayRange
        ? `${startText}${dueMinutes !== null ? ` → ${formatTimeOfDay(dueMinutes)}` : ''}`
        : null;

    /**
     * How far along the card is, as one fact.
     *
     * A checklist is something the card can prove, so it wins the label when
     * there is one; a hand-set percentage is a claim and reads as the number.
     * Either way it is one chip — "40%" sitting beside "0/3" was the same
     * question asked twice.
     */
    const hasProgress = typeof data.progress === 'number';
    const completion = tasks.total > 0
        ? {
            percent: tasks.percent ?? 0,
            done: tasks.done === tasks.total,
            label: `${tasks.done} of ${tasks.total}`,
            title: `${tasks.done} of ${tasks.total} tasks done — open the list`,
        }
        : hasProgress
            ? {
                percent: data.progress ?? 0,
                done: (data.progress ?? 0) >= 100,
                label: `${data.progress ?? 0}%`,
                title: `Progress: ${data.progress ?? 0}%`,
            }
            : null;

    /* PLAN answers where it stands and when it is due; WORK answers who has it
       and how far along it is. Two runs that never trade places, so the eye
       learns one position per question instead of re-reading nine chips. */
    const planChips = [
        has('status') && (
            <Chip
                key="status"
                tone={statusOf(data.status)?.tone ?? 'neutral'}
                title={`Status: ${statusOf(data.status)?.label ?? data.status}`}
                onPick={(a) => toggle('status', a)}
            >
                <span className={styles.dot} />
                {statusOf(data.status)?.label ?? data.status}
            </Chip>
        ),

        /* Both ends on one day are one chip, "13:00 → 15:30", because that is
           how a span is read — and because two chips there would say the date
           twice. Different days stay two chips, and a lone start is prefixed
           "from": a bare arrow in front of a date reads as "to". */
        sameDayRange ? (
            <Chip
                key="dates"
                tone={dueTone(data.dueDate)}
                title={`${startText} to ${dueText}`}
                onPick={(a) => toggle('dates', a)}
            >
                <Calendar size={11} strokeWidth={2.5} />
                {rangeText}
            </Chip>
        ) : [
            startText && (
                <Chip key="start" tone="neutral" title={`Starts ${startText}`} onPick={(a) => toggle('startDate', a)}>
                    <span className={styles.glyph}>from</span>
                    {startText}
                </Chip>
            ),
            dueText && (
                <Chip key="due" tone={dueTone(data.dueDate)} title={`Due ${dueText}`} onPick={(a) => toggle('dueDate', a)}>
                    <Calendar size={11} strokeWidth={2.5} />
                    {dueText}
                </Chip>
            ),
        ],

        /* Priority stays quiet unless it is urgent. Status and the due date
           already carry the row's colour; a third hue beside them would make
           the run a stripe of colour with no order to it. */
        has('priority') && (
            <Chip
                key="priority"
                tone={priorityOf(data.priority)?.tone ?? 'neutral'}
                title={`Priority: ${priorityOf(data.priority)?.label ?? data.priority}`}
                onPick={(a) => toggle('priority', a)}
            >
                {/* The icon set writes `color: currentcolor` inline on the svg,
                    which outranks any class, so the tint has to live on a
                    wrapper the svg can inherit from. */}
                <span className={styles.flag}>
                    <Flag size={11} strokeWidth={2.5} />
                </span>
                {priorityOf(data.priority)?.label ?? data.priority}
            </Chip>
        ),
    ].flat().filter(Boolean);

    const workChips = [
        /* One completion chip, not a progress chip beside a tasks chip — "40%"
           next to "0/3" was the same question asked twice. The ring shows
           whichever the card can actually prove, and the popover keeps both
           reachable. */
        completion && (
            <Chip
                key="completion"
                tone={completion.done ? 'jade' : 'neutral'}
                title={completion.title}
                /* With a checklist, the chip IS the way into it — a menu whose
                   only real offer is "open the list" is a hop for nothing.
                   Without one there is nothing to open, so it edits the
                   percentage in place as any other chip does. */
                onPick={(a) => (tasks.total > 0 ? setTasksCardId(nodeId) : toggle('completion', a))}
            >
                <ProgressRing percent={completion.percent} />
                {completion.label}
            </Chip>
        ),

        has('assignee') && (
            <Chip key="assignee" tone="neutral" title={`Assigned to ${data.assignee}`} onPick={(a) => toggle('assignee', a)}>
                <User size={11} strokeWidth={2.5} />
                {data.assignee}
            </Chip>
        ),

        /* Reference, not status — no fill at all. */
        has('url') && (
            <Chip key="url" tone="bare" title={data.url!} onPick={(a) => toggle('url', a)}>
                <Link2 size={11} strokeWidth={2.5} />
                <span className={styles.clip}>{shortUrl(data.url!)}</span>
            </Chip>
        ),

        tags.length > 0 && (
            <Chip key="tags" tone="bare" title={tags.join(', ')} onPick={(a) => toggle('tags', a)}>
                <span className={styles.tagRun}>
                    {tags.slice(0, MAX_TAGS).map((tag) => (
                        <span key={tag} className={styles.tagItem}>
                            <span className={styles.hash}>#</span>{tag}
                        </span>
                    ))}
                    {tags.length > MAX_TAGS && (
                        <span className={styles.tagItem}>+{tags.length - MAX_TAGS}</span>
                    )}
                </span>
            </Chip>
        ),
    ].flat().filter(Boolean);

    const addChip = unset.length > 0 && (
        <button
            key="add"
            type="button"
            className={`${styles.chip} ${styles.add} nodrag`}
            title="Add a property"
            aria-label="Add a property"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => {
                e.stopPropagation();
                setOpen(null);
                setAddAnchor((cur) => (cur ? null : e.currentTarget));
            }}
        >
            <Plus size={12} strokeWidth={2.5} />
            Add
        </button>
    );

    const empty = planChips.length === 0 && workChips.length === 0;

    return (
        <div
            className={styles.bar}
            onPointerDown={(e) => e.stopPropagation()}
            onClick={(e) => e.stopPropagation()}
        >
            {/* A run with nothing in it prints no label — an empty "Plan" would
                be a heading for something the card does not have. The "+" rides
                the last run that exists, so it never orphans a label of its own. */}
            {planChips.length > 0 && (
                <div className={styles.run}>
                    <span className={styles.runLabel}>Plan</span>
                    <div className={styles.runChips}>
                        {planChips}
                        {workChips.length === 0 && addChip}
                    </div>
                </div>
            )}

            {workChips.length > 0 && (
                <div className={styles.run}>
                    <span className={styles.runLabel}>Work</span>
                    <div className={styles.runChips}>
                        {workChips}
                        {addChip}
                    </div>
                </div>
            )}

            {/* Nothing set at all: one unlabelled row holding the invitation. */}
            {empty && <div className={styles.runChips}>{addChip}</div>}

            {/* ------------------------------------------------------ editors */}

            {open && (field === 'status' || field === 'priority') && (
                <MetaPopover
                    anchor={open.anchor}
                    title={field === 'status' ? 'Status' : 'Priority'}
                    onClose={close}
                >
                    <div className={styles.options}>
                        {(field === 'status' ? STATUS_OPTIONS : PRIORITY_OPTIONS).map((o) => (
                            <button
                                key={o.value}
                                type="button"
                                className={styles.option}
                                data-tone={o.tone}
                                aria-pressed={
                                    field === 'status' ? data.status === o.value : data.priority === o.value
                                }
                                onClick={() => {
                                    set(field === 'status'
                                        ? { status: o.value as NoteData['status'] }
                                        : { priority: o.value as NoteData['priority'] });
                                    close();
                                }}
                            >
                                <span className={styles.dot} />
                                {o.label}
                            </button>
                        ))}
                        <button
                            type="button"
                            className={styles.clear}
                            onClick={() => {
                                set(field === 'status' ? { status: undefined } : { priority: undefined });
                                close();
                            }}
                        >
                            Clear
                        </button>
                    </div>
                </MetaPopover>
            )}

            {open && (field === 'startDate' || field === 'dueDate') && (
                <MetaPopover
                    anchor={open.anchor}
                    title={field === 'startDate' ? 'Start date' : 'Due date'}
                    onClose={close}
                >
                    <CustomDatePicker
                        value={(field === 'startDate' ? data.startDate : data.dueDate) ?? ''}
                        placeholder="Pick a date"
                        withTime
                        defaultOpen
                        onChange={(v) => set({ [field]: v || undefined })}
                    />
                    <button
                        type="button"
                        className={styles.clear}
                        onClick={() => { set({ [field]: undefined }); close(); }}
                    >
                        Clear
                    </button>
                </MetaPopover>
            )}

            {/* One chip, so one editor holding both ends. Two separate popovers
                for a thing shown as a single span would be a worse trade. */}
            {open && field === 'dates' && (
                <MetaPopover anchor={open.anchor} title="Start and end" onClose={close}>
                    <div className={styles.stack}>
                        <label className={styles.stackField}>
                            <span className={styles.stackLabel}>Starts</span>
                            <CustomDatePicker
                                value={data.startDate ?? ''}
                                placeholder="No start"
                                withTime
                                onChange={(v) => set({ startDate: v || undefined })}
                            />
                        </label>
                        <label className={styles.stackField}>
                            <span className={styles.stackLabel}>Ends</span>
                            <CustomDatePicker
                                value={data.dueDate ?? ''}
                                placeholder="No end"
                                withTime
                                onChange={(v) => set({ dueDate: v || undefined })}
                            />
                        </label>
                    </div>
                    <button
                        type="button"
                        className={styles.clear}
                        onClick={() => { set({ startDate: undefined, dueDate: undefined }); close(); }}
                    >
                        Clear both
                    </button>
                </MetaPopover>
            )}

            {open && (field === 'assignee' || field === 'url') && (
                <MetaPopover
                    anchor={open.anchor}
                    title={field === 'assignee' ? 'Assignee' : 'Link'}
                    onClose={close}
                >
                    <input
                        className={styles.input}
                        defaultValue={(field === 'assignee' ? data.assignee : data.url) ?? ''}
                        placeholder={field === 'assignee' ? 'Who is on this?' : 'https://'}
                        aria-label={field === 'assignee' ? 'Assignee' : 'Link'}
                        autoFocus
                        onBlur={(e) => set({ [field]: e.target.value.trim() || undefined })}
                        onKeyDown={(e) => { if (e.key === 'Enter') e.currentTarget.blur(); }}
                    />
                </MetaPopover>
            )}

            {/* One chip, so one editor — and it has to keep BOTH ends of
                completion reachable, or merging them would have hidden one. */}
            {open && (field === 'completion' || field === 'progress') && (
                <MetaPopover anchor={open.anchor} title="Completion" onClose={close}>
                    {tasks.total > 0 && (
                        <button
                            type="button"
                            className={styles.option}
                            onClick={() => { close(); setTasksCardId(nodeId); }}
                        >
                            <CheckSquare size={13} />
                            {tasks.done} of {tasks.total} tasks · open the list
                        </button>
                    )}

                    <div className={styles.progressField}>
                        <span className={styles.stackLabel}>
                            {tasks.total > 0 ? 'Or set a percentage by hand' : 'Progress'}
                        </span>
                        <div className={styles.progressRow}>
                            <input
                                type="range"
                                min={0}
                                max={100}
                                step={5}
                                value={data.progress ?? 0}
                                aria-label="Progress"
                                onChange={(e) => set({ progress: Number(e.target.value) })}
                            />
                            <span className={styles.progressValue}>{data.progress ?? 0}%</span>
                        </div>
                    </div>

                    {hasProgress && (
                        <button
                            type="button"
                            className={styles.clear}
                            onClick={() => { set({ progress: undefined }); close(); }}
                        >
                            Clear the percentage
                        </button>
                    )}
                </MetaPopover>
            )}

            {open && field === 'tags' && (
                <MetaPopover anchor={open.anchor} title="Tags" onClose={close}>
                    <ChipInput value={tags} placeholder="Add tag…" onChange={(next) => set({ tags: next })} />
                </MetaPopover>
            )}

            {addAnchor && (
                <MetaPopover anchor={addAnchor} title="Add a property" onClose={() => setAddAnchor(null)}>
                    <div className={styles.options}>
                        {unset.map(([f, label, Icon]) => (
                            <button
                                key={f}
                                type="button"
                                className={styles.option}
                                onClick={(e) => {
                                    /* Seeded with a value so the chip appears at
                                       all — `has` is what decides visibility, and
                                       an undefined field has no chip to click. */
                                    set(
                                        f === 'status' ? { status: 'todo' }
                                            : f === 'priority' ? { priority: 'medium' }
                                                : f === 'progress' ? { progress: 0 }
                                                    : f === 'tags' ? { tags: [] }
                                                        : { [f]: '' },
                                    );
                                    /* Straight into its editor, anchored to the
                                       "+" the user just used: adding a date and
                                       then hunting for the new chip to fill it in
                                       would be two steps for one intent. */
                                    const anchor = addAnchor;
                                    setAddAnchor(null);
                                    if (anchor) setOpen({ field: f, anchor });
                                    e.stopPropagation();
                                }}
                            >
                                <Icon size={13} />
                                {label}
                            </button>
                        ))}
                    </div>
                </MetaPopover>
            )}
        </div>
    );
});

CardMetaBar.displayName = 'CardMetaBar';
