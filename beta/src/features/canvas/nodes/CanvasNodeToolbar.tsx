import type { AppNodeData } from '../../../types';
import { ChevronsDownUp, ExternalLink, Maximize2 } from '../../../shared/icons';
import { PeekMenu } from '../../../app/shell/panels/peek/PeekMenu';
import { useStore } from '../../../store/useStore';
import styles from './CanvasNodeToolbar.module.css';

/** Canvas chrome stays outside passive content so hover actions work before selection. */
export function CanvasNodeToolbar({ id, nodeType, data }: { id: string; nodeType: string; data: AppNodeData }) {
    const navigate = useStore(s => s.navigateToNode);
    const updateNodeData = useStore(s => s.updateNodeData);
    const blocks = Array.isArray(data.content) ? data.content : [];
    const file = nodeType === 'block' && blocks.length === 1 && blocks[0].type === 'file' ? blocks[0] : undefined;
    const fileOpen = file?.metadata?.fileView === 'expandedfile';
    return <div className={`${styles.toolbar} nodrag nopan`} role="toolbar" aria-label="Node view options"
        onMouseDown={event => event.stopPropagation()} onClick={event => event.stopPropagation()}>
        <PeekMenu nodeId={id} buttonClassName={styles.button} />
        {(nodeType === 'note' || file) && <>
            <span className={styles.divider} aria-hidden="true" />
            {file ? <button className={styles.button} type="button" title={fileOpen ? 'Close the file' : 'Open the file'}
                aria-label={fileOpen ? 'Close the file' : 'Open the file'} onClick={() => updateNodeData(id, {
                    content: [{ ...file, metadata: { ...file.metadata, fileView: fileOpen ? 'file' : 'expandedfile' } }],
                    userWidth: undefined, userHeight: undefined,
                })}>
                {fileOpen ? <ChevronsDownUp size={16} /> : <Maximize2 size={16} />}
            </button> : <button className={styles.button} type="button" title="Open Card" aria-label="Open card" onClick={() => navigate(id)}>
                <ExternalLink size={16} />
            </button>}
        </>}
    </div>;
}
