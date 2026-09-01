import { useMemo, useState } from 'react';
import {
    AlertCircle,
    Check,
    ChevronDown,
    CornerDownLeft,
    Crosshair,
    Globe,
    Loader2,
} from '../../components/icons';
import { useStore } from '../../store/useStore';
import { nodeTitle } from './canvasContext';
import type { AITraceEvent } from './aiTypes';
import styles from './AIRunTrace.module.css';

/**
 * The activity log for one assistant turn — ai-Plan.md §5.1 (W1).
 *
 * The old renderer was a flat list of `{icon, string}` rows. It could say
 * "Searching the web" but not *what for*, and "Planning what to build" but not
 * what it decided — so a 24-second run showed two lines and a spinner, and the
 * user's only signal that anything was happening was that the panel had not
 * finished.
 *
 * Every event here carries an optional `detail` payload, and the payload is
 * what the user actually wanted: the four queries, verbatim; the six cards it
 * read, clickable; the artifact plan with the model's own reason for choosing
 * that shape. Events written before the trace existed have no phase and no
 * detail, and render as the plain line they always were.
 */

const PHASE_LABEL: Record<string, string> = {
    route: 'Reading the request',
    clarify: 'Asking',
    gather: 'Gathering',
    compose: 'Writing',
    place: 'Placing',
    attribute: 'Citing',
    verify: 'Checking',
};

function duration(event: AITraceEvent): string | null {
    if (typeof event.startedAt !== 'number' || typeof event.endedAt !== 'number') return null;
    const ms = event.endedAt - event.startedAt;
    if (ms < 100) return null;
    return ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)}s`;
}

function EventIcon({ event }: { event: AITraceEvent }) {
    if (event.status === 'running') return <Loader2 size={12} className={styles.spin} />;
    // A hollow ring for work not started: visibly different from both the
    // spinner and the tick, so the plan reads at a glance.
    if (event.status === 'queued') return <span className={styles.queuedDot} aria-hidden="true" />;
    if (event.kind === 'error') return <AlertCircle size={12} className={styles.iconError} />;
    if (event.kind === 'result' || event.status === 'done') return <Check size={12} className={styles.iconDone} />;
    return <CornerDownLeft size={12} />;
}

/** Cards the turn read — clicking one selects it, which is how you verify. */
function CardChips({ nodeIds }: { nodeIds: string[] }) {
    const nodes = useStore((s) => s.nodes);
    const setSelectedCanvasNodeIds = useStore((s) => s.setSelectedCanvasNodeIds);

    const found = useMemo(
        () => nodeIds.map((id) => nodes.find((n) => n.id === id)).filter((n): n is NonNullable<typeof n> => Boolean(n)),
        [nodeIds, nodes],
    );
    if (found.length === 0) return null;

    const visible = found.slice(0, 4);
    const hidden = found.length - visible.length;

    return (
        <div className={styles.chips}>
            {visible.map((node) => (
                <button
                    key={node.id}
                    type="button"
                    className={styles.chip}
                    onClick={() => {
                        setSelectedCanvasNodeIds(new Set([node.id]));
                        window.dispatchEvent(new CustomEvent('focusCanvasNodes', { detail: { ids: [node.id] } }));
                    }}
                    title={`Show “${nodeTitle(node)}” on the canvas`}
                >
                    <Crosshair size={10} />
                    <span>{nodeTitle(node)}</span>
                </button>
            ))}
            {hidden > 0 && <span className={styles.chipMore}>+{hidden}</span>}
        </div>
    );
}

function EventDetail({ event }: { event: AITraceEvent }) {
    const detail = event.detail;
    if (!detail) return null;

    switch (detail.kind) {
        case 'queries':
            return (
                <div className={styles.queries}>
                    {detail.queries.map((query, index) => (
                        <div key={`${query}-${index}`} className={styles.query}>
                            <Globe size={10} />
                            <span>{query}</span>
                        </div>
                    ))}
                </div>
            );

        case 'cards':
            return <CardChips nodeIds={detail.nodeIds} />;

        case 'plan':
            return (
                <>
                    {detail.why && <p className={styles.why}>{detail.why}</p>}
                    <div className={styles.chips}>
                        {detail.artifacts.map((artifact, index) => (
                            <span key={`${artifact.title}-${index}`} className={styles.planChip}>
                                <i>{artifact.shape}</i>
                                {artifact.title}
                            </span>
                        ))}
                    </div>
                </>
            );

        case 'artifact':
            // Only the artifact actually being written shows a bar; a queued
            // one showing progress would be a lie about work not started.
            if (event.status !== 'running') return detail.note ? <p className={styles.note}>{detail.note}</p> : null;
            return (
                <>
                    <div className={styles.progress}>
                        <div
                            className={styles.progressFill}
                            style={{ width: `${Math.round((detail.index / Math.max(1, detail.total)) * 100)}%` }}
                        />
                    </div>
                    {detail.note && <p className={styles.note}>{detail.note}</p>}
                </>
            );

        case 'sources':
            return (
                <div className={styles.chips}>
                    {detail.sources.map((source) => (
                        <span key={source.kind === 'web' ? source.url : source.id} className={styles.chip}>
                            {source.kind === 'web' ? <Globe size={10} /> : <Crosshair size={10} />}
                            <span>{source.kind === 'web' ? source.host : source.title}</span>
                        </span>
                    ))}
                </div>
            );

        case 'note':
            return <p className={styles.note}>{detail.text}</p>;
    }
}

export function AIRunTrace({
    events,
    running,
    receipt,
}: {
    events: AITraceEvent[];
    running: boolean;
    /** Model and elapsed time, shown once the turn is finished. */
    receipt?: string;
}) {
    // Open while working so progress is never hidden, folded away once the
    // answer is there to read. Either can be overridden without stopping a run.
    const [openOverride, setOpenOverride] = useState<boolean | null>(null);
    const open = openOverride ?? running;
    // The summary is the live status. Keeping that same event in the expanded
    // list produced two identical "Working out what to build" rows and two
    // loaders. Leave prior and queued work visible, but reserve the active
    // event for the animated summary line.
    const activeEvent = useMemo(
        () => (running ? [...events].reverse().find((event) => event.status === 'running') : undefined),
        [events, running],
    );
    const visibleEvents = useMemo(
        () => (activeEvent ? events.filter((event) => event.id !== activeEvent.id) : events),
        [activeEvent, events],
    );

    const summary = useMemo(() => {
        if (running) {
            if (activeEvent) return activeEvent.text;
            return 'Working';
        }
        const failures = events.filter((e) => e.kind === 'error').length;
        const parts: string[] = [`${events.length} step${events.length === 1 ? '' : 's'}`];
        if (failures > 0) parts.push(`${failures} failed`);
        return parts.join(' · ');
    }, [activeEvent, events, running]);

    if (events.length === 0 && !running) return null;

    return (
        <div className={styles.trace}>
            <button
                type="button"
                className={`${styles.toggle} ${running ? styles.toggleRunning : ''}`}
                aria-expanded={visibleEvents.length > 0 ? open : undefined}
                disabled={visibleEvents.length === 0}
                onClick={() => setOpenOverride(!open)}
            >
                {!running && <span className={styles.toggleSignal}><Check size={12} /></span>}
                <span className={styles.toggleLabel}>{summary}</span>
                {receipt && !running && <span className={styles.toggleReceipt}>{receipt}</span>}
                {visibleEvents.length > 0 && <ChevronDown size={14} className={`${styles.chevron} ${open ? styles.chevronOpen : ''}`} />}
            </button>

            {visibleEvents.length > 0 && (
                <div className={styles.events} hidden={!open} aria-live={running ? 'polite' : undefined}>
                    {visibleEvents.map((event) => {
                    const time = duration(event);
                    const queued = event.status === 'queued';
                    return (
                        <div key={event.id} className={`${styles.event} ${queued ? styles.eventQueued : ''}`}>
                            <span className={styles.eventIcon}><EventIcon event={event} /></span>
                            <div className={styles.eventBody}>
                                <div className={styles.eventTop}>
                                    {/* No phase prefix on the label. The label
                                        already names the object ("Read 6 of 31
                                        cards"); "Gathering — Read 6 of 31
                                        cards" is the vaguer half in front of
                                        the useful half. The phase drives the
                                        title attribute instead, for anyone who
                                        wants to know which stage it belonged
                                        to. */}
                                    <span
                                        className={event.kind === 'error' ? styles.eventLabelError : styles.eventLabel}
                                        title={event.phase ? PHASE_LABEL[event.phase] ?? event.phase : undefined}
                                    >
                                        {event.text}
                                    </span>
                                    {time && <span className={styles.eventTime}>{time}</span>}
                                </div>
                                <EventDetail event={event} />
                            </div>
                        </div>
                    );
                    })}
                </div>
            )}
        </div>
    );
}
