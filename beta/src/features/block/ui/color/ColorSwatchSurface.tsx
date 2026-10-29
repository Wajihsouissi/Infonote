import { useEffect, useRef, useState } from 'react';
import { Check, Copy } from '../../../../shared/icons';
import { ColorBlockModal } from '../../../editor/ui/dialogs/color/ColorBlockModal';
import { useStore } from '../../../../store/useStore';
import type { Block } from '../../../editor/types';
import swatchStyles from './ColorSwatchSurface.module.css';

const COPIED_MS = 2000;

interface ColorSwatchSurfaceProps {
    nodeId: string;
    swatch: string;
    blocks: Block[];
}

/**
 * The clickable face of a colour block on the canvas: click to edit the colour,
 * hover for a chip that copies its hex. It sits over the node so the press
 * never reaches React Flow as a drag start.
 */
export function ColorSwatchSurface({ nodeId, swatch, blocks }: ColorSwatchSurfaceProps) {
    const updateNodeData = useStore((s) => s.updateNodeData);
    /** The colour when the editor opened, so the modal can offer "revert". */
    const [editingFrom, setEditingFrom] = useState<string | null>(null);
    const [copied, setCopied] = useState(false);
    const copiedTimer = useRef<number | undefined>(undefined);

    useEffect(() => () => window.clearTimeout(copiedTimer.current), []);

    const copyHex = () => {
        navigator.clipboard.writeText(swatch).then(() => {
            setCopied(true);
            window.clearTimeout(copiedTimer.current);
            copiedTimer.current = window.setTimeout(() => setCopied(false), COPIED_MS);
        }, () => undefined);
    };

    return (
        <>
            <div
                className={swatchStyles.swatchOverlay}
                // Keep the press away from React Flow, or it starts a node drag.
                onMouseDown={(e) => e.stopPropagation()}
            >
                <button type="button" aria-label="Edit color" aria-haspopup="dialog" title="Edit color"
                    className={swatchStyles.swatchEdit} onClick={() => setEditingFrom(swatch)} />
                <button
                    type="button"
                    className={swatchStyles.swatchChip}
                    data-copied={copied || undefined}
                    aria-label={copied ? 'Copied' : `Copy ${swatch.toUpperCase()}`}
                    onClick={(e) => {
                        e.stopPropagation();
                        copyHex();
                    }}
                >
                    {copied ? <Check size={12} /> : <Copy size={12} />}
                    {copied ? 'Copied!' : swatch.toUpperCase()}
                </button>
            </div>

            {editingFrom !== null && (
                <ColorBlockModal
                    color={swatch}
                    originalColor={editingFrom}
                    metadata={blocks[0]?.metadata}
                    onChange={(color, metadata) => {
                        updateNodeData(nodeId, {
                            content: blocks.map((b, i) => (i === 0 ? { ...b, content: color, metadata } : b)),
                        });
                    }}
                    onClose={() => setEditingFrom(null)}
                />
            )}
        </>
    );
}
