import type { Block } from '../../../editor/types';
import { IntelligentUIBlock } from '../block/IntelligentUIBlock';

const ignoreChange = () => {};

/** The same visual remains visible; the canvas surface owns unselected dragging. */
export function IntelligentUIPreview({ block }: { block: Block }) {
    // A final debounced control write can arrive just after the editor unmounts.
    // Refresh this inert snapshot when those saved values finish committing.
    const savedValues = JSON.stringify(block.metadata?.intelligentUI?.artifact?.state ?? {});
    return <IntelligentUIBlock key={savedValues} block={block} onChange={ignoreChange} passive />;
}
