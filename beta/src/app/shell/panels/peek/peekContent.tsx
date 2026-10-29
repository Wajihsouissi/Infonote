/**
 * peekContent
 * --------------------------------------------------------------------------
 * What a node looks like when it is opened in a pane.
 *
 * There are four of those panes — center peek, left side peek, right side peek
 * and fullscreen. Each used to carry its own copy of the same
 * `type === 'note' ? … : <BlockEditor>` ladder, and the copies drifted apart.
 *
 * One resolver, four callers. A pane that wants different chrome passes it in
 * rather than forking the ladder.
 */
import type { ReactNode } from 'react';
import type { AppNode, AppNodeData } from '../../../../types';
import { getNodeBlocks } from '../../../../types';
import { BlockEditor } from '../../../../features/editor/ui/surface/BlockEditor';
import { NoteExpandedContent } from '../../../../features/card/ui/content/NoteExpandedContent';
import { FileViewer, fileBlockOf } from '../../../../features/file';

export interface PeekContentContext {
    node: AppNode;
    nodeId: string;
    onUpdate: (id: string, data: Partial<AppNodeData>) => void;
    onClose: () => void;
    /** Drill into the node's own nested canvas. Notes only. */
    onNavigate?: () => void;
    /** Square off the card's corners when the pane already provides them. */
    flatCorners?: boolean;
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
    editorClassName,
    editorStyle,
}: PeekContentContext): ReactNode {
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
