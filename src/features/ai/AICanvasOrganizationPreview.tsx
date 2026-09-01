import { Check, Network, Undo2, X } from '../../components/icons';
import type { CanvasOrganizationProposal } from './aiCanvasOperations';
import styles from './AICanvasOrganizationPreview.module.css';

type Status = 'ready' | 'applied' | 'undone';

export function AICanvasOrganizationPreview({
    proposal,
    status,
    onApply,
    onUndo,
    onDismiss,
}: {
    proposal: CanvasOrganizationProposal;
    status: Status;
    onApply: () => void;
    onUndo: () => void;
    onDismiss: () => void;
}) {
    const isApplied = status === 'applied';
    const isUndone = status === 'undone';

    return (
        <section className={styles.workbench} aria-label="Canvas organization proposal">
            <div className={styles.heading}>
                <span className={styles.mark}><Network size={15} /></span>
                <div>
                    <h3>{isApplied ? 'Canvas organized' : isUndone ? 'Organization undone' : 'Organize existing cards'}</h3>
                    <p>{isApplied ? 'Positions and proposed connections are now on the canvas.' : proposal.summary}</p>
                </div>
                <button type="button" className={styles.dismiss} onClick={onDismiss} aria-label="Dismiss organization proposal">
                    <X size={14} />
                </button>
            </div>

            {!isApplied && !isUndone && (
                <div className={styles.clusterList}>
                    {proposal.clusters.map((cluster) => (
                        <div key={cluster.id} className={styles.cluster}>
                            <strong>{cluster.title}</strong>
                            <span>{cluster.nodeIds.length} card{cluster.nodeIds.length === 1 ? '' : 's'}</span>
                        </div>
                    ))}
                </div>
            )}

            <div className={styles.actions}>
                {status === 'ready' && (
                    <button type="button" className={styles.primary} onClick={onApply}>
                        <Check size={14} /> Apply to canvas
                    </button>
                )}
                {isApplied && (
                    <button type="button" className={styles.secondary} onClick={onUndo}>
                        <Undo2 size={14} /> Undo changes
                    </button>
                )}
                <button type="button" className={styles.quiet} onClick={onDismiss}>
                    {isUndone ? 'Close' : 'Keep reviewing'}
                </button>
            </div>
        </section>
    );
}
