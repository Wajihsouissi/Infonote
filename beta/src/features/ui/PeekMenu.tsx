import { Monitor, PanelLeft, PanelRight, Scan } from '../../components/icons';
import { useStore } from '../../store/useStore';

export interface PeekMenuProps {
    /** Canvas node id — what every peek is keyed on. */
    nodeId: string;
    /** The host styles the buttons, so each node type keeps its own bar while
     *  the controls inside it stay identical. */
    buttonClassName?: string;
    size?: number;
}

/**
 * The four ways to open a node in a pane: left, fullscreen, centre, right.
 *
 * Lifted out of NoteCard so a file node offers exactly the same thing in
 * exactly the same place. It is one gesture users learn once; a second node
 * type with its own near-miss version of it would be a worse card, not a
 * different one.
 *
 * Renders as a fragment, not a wrapper: NoteCard's bar carries a divider and a
 * drill-in button after these four, and a container here would break that row
 * into two. The host's bar is also where `nodrag` belongs — the node root is
 * the drag handle, so without it a press on a button starts a node drag, the
 * menu vanishes from under the cursor, and no click ever fires.
 */
export function PeekMenu({ nodeId, buttonClassName, size = 16 }: PeekMenuProps) {
    const setFullscreenId = useStore(s => s.setFullscreenId);
    const setCenterPanelId = useStore(s => s.setCenterPanelId);
    const setRightSidePanelId = useStore(s => s.setRightSidePanelId);
    const setLeftSidePanelId = useStore(s => s.setLeftSidePanelId);

    const stop = (e: React.MouseEvent) => e.stopPropagation();

    return (
        <>
            <button
                className={buttonClassName}
                onClick={(e) => { stop(e); setLeftSidePanelId(nodeId); }}
                onMouseDown={stop}
                title="Side Panel (Left)"
                type="button"
            >
                <PanelLeft size={size} />
            </button>
            <button
                className={buttonClassName}
                onClick={(e) => {
                    stop(e);
                    document.documentElement.requestFullscreen().catch(() => undefined);
                    setFullscreenId(nodeId);
                }}
                onMouseDown={stop}
                title="Full Screen"
                type="button"
            >
                <Monitor size={size} />
            </button>
            <button
                className={buttonClassName}
                onClick={(e) => { stop(e); setCenterPanelId(nodeId); }}
                onMouseDown={stop}
                title="Center Peek"
                type="button"
            >
                <Scan size={size} />
            </button>
            <button
                className={buttonClassName}
                onClick={(e) => { stop(e); setRightSidePanelId(nodeId); }}
                onMouseDown={stop}
                title="Side Panel (Right)"
                type="button"
            >
                <PanelRight size={size} />
            </button>
        </>
    );
}
