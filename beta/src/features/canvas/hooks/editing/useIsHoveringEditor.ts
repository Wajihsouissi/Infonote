import { useEffect, useState } from 'react';

/** Whether the pointer is over a block editor (where Ctrl must not start a box selection). */
export function useIsHoveringEditor() {
    const [isHoveringEditor, setIsHoveringEditor] = useState(false);
    useEffect(() => {
        const handleMouseOver = (e: MouseEvent) => {
            const target = e.target as Element | null;
            if (target?.closest) setIsHoveringEditor(Boolean(target.closest('[data-chnk-it-block-editor]')));
        };
        window.addEventListener('mouseover', handleMouseOver);
        return () => window.removeEventListener('mouseover', handleMouseOver);
    }, []);
    return isHoveringEditor;
}
