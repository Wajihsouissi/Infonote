import { memo, useState, type ReactNode } from 'react';
import type { Block } from '../../../editor/types';
import { NoteBodyPreview } from './NoteBodyPreview';
import styles from './NoteBody.module.css';
import { ReadingLayoutBoundary } from './ReadingLayoutBoundary';
import { useCanvasOverview } from '../../../canvas/hooks/navigation/useCanvasOverview';
import { useReadingAdmission } from '../../reading/useReadingAdmission';

interface NoteBodyProps {
    blocks: Block[];
    showLiveEditor: boolean;
    renderEditor: () => ReactNode;
    onBlockChange?: (id: string, patch: Partial<Block>) => void;
    reserveHandles?: boolean;
    canvas?: boolean;
}

/** One layout owner: reading and editing never overlap or dissolve. */
export const NoteBody = memo(function NoteBody({ blocks, showLiveEditor, renderEditor, onBlockChange, reserveHandles, canvas = false }: NoteBodyProps) {
    const overview = useCanvasOverview(canvas);
    const { host, admitted } = useReadingAdmission(overview, canvas);
    const [hasEdited, setHasEdited] = useState(showLiveEditor);
    if (showLiveEditor && !hasEdited) setHasEdited(true);
    return <ReadingLayoutBoundary editing={showLiveEditor}><div ref={host} className={styles.body}>
        {showLiveEditor ? renderEditor() : <NoteBodyPreview content={blocks} complete deferReading={!admitted && !hasEdited} progressive={!hasEdited}
            onBlockChange={onBlockChange} reserveHandles={reserveHandles} />}
    </div></ReadingLayoutBoundary>;
});
