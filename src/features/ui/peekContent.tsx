/**
 * peekContent
 * --------------------------------------------------------------------------
 * What a node looks like when it is opened in a pane.
 *
 * There are four of those panes — center peek, left side peek, right side peek
 * and fullscreen — and each used to carry its own copy of the same
 * `type === 'note' ? … : <BlockEditor>` ladder. They had already drifted:
 * fullscreen knew about boards and the other three did not, so a board opened
 * in a side peek came up as an empty block editor. Adding a fifth kind of
 * content to four separate switches would have guaranteed the same bug again.
 *
 * One resolver, four callers. A pane that wants different chrome passes it in
 * rather than forking the ladder.
 */
import type { ReactNode } from 'react';
import type { AppNode, AppNodeData } from '../../types';
import { getNodeBlocks } from '../../types';
import { BlockEditor } from '../editor/BlockEditor';
import { NoteExpandedContent } from '../card/NoteExpandedContent';
import { KanbanNodeComponent } from '../kanban/KanbanNode';
import { FileViewer, fileBlockOf } from '../file';
import { YouTubeStudio } from '../youtube';

export interface PeekContentContext {
    node: AppNode;
    nodeId: string;
    onUpdate: (id: string, data: Partial<AppNodeData>) => void;
    onClose: () => void;
    /** Drill into the node's own nested canvas. Notes only. */
    onNavigate?: () => void;
    /** Square off the card's corners when the pane already provides them. */
    flatCorners?: boolean;
    /**
     * Boards render their real columns only in fullscreen — a side peek is far
     * too narrow for lanes, so there they fall through to their content.
     */
    allowBoard?: boolean;
    /** Class for the bare-editor wrapper, which differs per pane. */
    editorClassName?: string;
    editorStyle?: React.CSSProperties;
}

export function resolvePeekContent({
    node,
    nodeId,
    onUpdate,
    onClose,
    onNavigate,
    flatCorners,
    allowBoard,
    editorClassName,
    editorStyle,
}: PeekContentContext): ReactNode {
    if (node.type === 'youtube') {
        return (
            <YouTubeStudio
                key={nodeId}
                nodeId={nodeId}
                data={node.data}
                onUpdate={onUpdate}
                onClose={onClose}
            />
        );
    }

    if (allowBoard && node.type === 'kanban') {
        return <KanbanNodeComponent key={nodeId} id={nodeId} data={node.data} selected={false} fullscreenView />;
    }

    if (node.type === 'note') {
        return (
            <NoteExpandedContent
                key={nodeId}
                id={nodeId}
                nodeId={nodeId}
                data={node.data}
                onUpdate={onUpdate}
                onClose={onClose}
                flatCorners={flatCorners}
                onNavigate={onNavigate}
            />
        );
    }

    /* A file node is a block node holding a single file block. In a pane it is
       always the document itself — never the closed card, and never the block
       editor, which would show a file as a one-line row inside an empty page. */
    const file = fileBlockOf(getNodeBlocks(node.data));
    if (file) {
        return (
            <FileViewer
                key={nodeId}
                content={file.content}
                name={file.metadata?.name}
                mime={file.metadata?.type}
                size={file.metadata?.size}
                poster={file.metadata?.poster}
                variant="peek"
                onClose={onClose}
                onRename={(name) => onUpdate(nodeId, {
                    content: [{ ...file, metadata: { ...file.metadata, name } }],
                })}
            />
        );
    }

    return (
        <div className={editorClassName} style={editorStyle}>
            <BlockEditor
                key={nodeId}
                nodeId={nodeId}
                initialContent={getNodeBlocks(node.data)}
                onUpdate={(blocks) => onUpdate(nodeId, { content: blocks })}
                autoFocus={true}
            />
        </div>
    );
}
