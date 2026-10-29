import type { Block, BlockMetadata } from '../types';

/** What caused an edit — the markdown shortcuts only fire on real typing. */
export interface EditOptions {
    inputType?: string;
}

/** The props every block component takes. */
export interface BlockProps {
    block: Block;
    readOnly?: boolean;
    onChange: (content: string, metadata?: BlockMetadata, opts?: EditOptions) => void;
    /** Patch the whole block, including its `type` — the media picker resolves an
     *  unresolved `media` block into `image`/`video`/`file` through this. */
    onReplace?: (patch: Partial<Block>) => void;
    onKeyDown?: (e: React.KeyboardEvent) => void;
    onPaste?: (e: React.ClipboardEvent) => void;
    domRef?: (el: HTMLDivElement | null) => void;
    disableMediaControls?: boolean;
    minimal?: boolean;
    onDeleteBlock?: () => void;
}
