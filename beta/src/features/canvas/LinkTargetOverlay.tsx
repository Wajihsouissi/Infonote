import { useStore } from '../../store/useStore';
import styles from './LinkTargetOverlay.module.css';

/** Swallow the event so neither React Flow nor the node beneath reacts to it. */
const swallow = (e: React.SyntheticEvent) => {
    e.stopPropagation();
    e.preventDefault();
};

/**
 * Covers a node while linking mode is on: clicking it connects every other
 * selected node to this one, then leaves linking mode. Shared by every node
 * type so the gesture looks and behaves the same whatever is under it.
 */
export function LinkTargetOverlay({ nodeId }: { nodeId: string }) {
    const isLinkingMode = useStore((s) => s.isLinkingMode);
    if (!isLinkingMode) return null;

    const link = (e: React.MouseEvent) => {
        swallow(e);
        const { linkSelectedNodes, selectedCanvasNodeIds, setIsLinkingMode, clearCanvasSelection } = useStore.getState();
        linkSelectedNodes(nodeId, Array.from(selectedCanvasNodeIds));
        setIsLinkingMode(false);
        clearCanvasSelection();
    };

    return (
        <div
            className={styles.overlay}
            role="button"
            aria-label="Link the selected cards to this one"
            onClick={link}
            onPointerDown={swallow}
            onMouseDown={swallow}
            onMouseUp={swallow}
            onDoubleClick={swallow}
        />
    );
}
