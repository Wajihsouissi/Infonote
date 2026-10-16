import { useLayoutEffect } from 'react';
import { useStore } from '../../store/useStore';
import { getNodeById } from '../../store/nodeIndex';
import type { AppNode } from '../../types';
import { ICON_SIZE, MIN_EXPANDED_SIZE } from '../../config/layout';
import { GALLERY_NODE_WIDTH } from '../editor/galleryTypes';
import { sizeForFileView } from '../file';
import type { BlockNodeShape } from './blockNodeShape';

type NodeStyle = Record<string, string | number>;

function patchNodeStyle(id: string, patch: NodeStyle) {
    useStore.getState().setNodes((nodes) => nodes.map((n) => (
        n.id === id ? { ...n, style: { ...n.style, ...patch } } : n
    )));
}

/**
 * Keeps a block node's React Flow size in line with what it holds. Each kind
 * of block owns different dimensions — a standard block sizes itself, a table
 * or board owns its width, a swatch is a fixed square — and a node whose
 * content changes kind has to be moved onto the new rules.
 */
export function useBlockNodeSizing(id: string, shape: BlockNodeShape, isUserSized: boolean) {
    const {
        isSingleColor, isSingleFile, fileView, isStandardBlock, isResizable, isColumns,
        isSingleTable, isTableSized, isLinkCard, isSingleGallery, isMediaEmpty, hasMultipleRootBlocks,
    } = shape;

    // Later rules win, so the order below is the order of precedence.
    useLayoutEffect(() => {
        const node = getNodeById(useStore.getState().nodes, id);
        if (!node) return;
        const style = node.style ?? {};
        const widthUnset = style.width === 'auto' || style.width === undefined;
        const patch: NodeStyle = {};

        // A file is excluded entirely: it owns both dimensions, and they
        // change when it opens (see the next effect).
        if (!isSingleColor && !isSingleFile && style.height !== 'auto') patch.height = 'auto';
        if (isStandardBlock && !isResizable && !isUserSized && style.width !== 'auto') patch.width = 'auto';
        if (!isStandardBlock && !isResizable && !isColumns && !isSingleTable && !isSingleColor && widthUnset) patch.width = 260;
        const needsResizableWidth = isResizable && !isSingleFile && (widthUnset || (isLinkCard && style.width === 260));
        const needsPlaceholderWidth = isMediaEmpty && style.width !== 208 && style.width !== '208px';
        if (needsResizableWidth || needsPlaceholderWidth) {
            patch.width = isSingleGallery ? GALLERY_NODE_WIDTH : isLinkCard ? 432 : 208;
        }
        if (isColumns && widthUnset) patch.width = 550;
        if (isSingleTable && !isTableSized && widthUnset) patch.width = 450;
        if (isTableSized && style.width !== 'auto') patch.width = 'auto';
        if (isSingleColor && (style.width !== ICON_SIZE || style.height !== ICON_SIZE)) {
            patch.width = ICON_SIZE;
            patch.height = ICON_SIZE;
        }

        if (Object.keys(patch).length > 0) patchNodeStyle(id, patch);
    }, [id, isSingleColor, isSingleFile, isStandardBlock, isResizable, isUserSized, isColumns,
        isSingleTable, isTableSized, isLinkCard, isSingleGallery, isMediaEmpty]);

    /**
     * A file's footprint follows its view.
     *
     * Closed it takes the folder card's 120px square, because a file and a
     * folder are the same kind of object to someone scanning a board and should
     * sit at the same weight. Open it takes a page. Once the user has dragged an
     * open file to a size of their own, that size is theirs and this stops
     * writing — but closing and reopening still returns to the page default,
     * which is the behaviour the note card's view modes already have.
     */
    useLayoutEffect(() => {
        if (!isSingleFile) return;
        if (fileView === 'expandedfile' && isUserSized) return;

        const target = sizeForFileView(fileView);
        const node = getNodeById(useStore.getState().nodes, id);
        if (!node) return;
        if (node.style?.width === target.width && node.style?.height === target.height) return;
        patchNodeStyle(id, { width: target.width, height: target.height });
    }, [id, isSingleFile, fileView, isUserSized]);

    // Repair legacy/accidental multi-root standalone blocks as soon as they
    // are encountered. A multi-block document is always represented by the
    // fused-note node, so it keeps the correct document sizing rules.
    useLayoutEffect(() => {
        if (!hasMultipleRootBlocks) return;

        useStore.getState().setNodes((nodes) => nodes.map((node) => {
            if (node.id !== id || node.type !== 'block') return node;
            return {
                ...node,
                type: 'fused-note',
                style: { ...node.style, width: MIN_EXPANDED_SIZE, height: 'auto' },
                data: {
                    ...node.data,
                    userWidth: undefined,
                    userHeight: undefined,
                    lastFusedAt: Date.now(),
                },
            } as AppNode;
        }));
    }, [hasMultipleRootBlocks, id]);
}
