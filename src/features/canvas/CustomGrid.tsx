import { memo } from 'react';
import { useViewport, Background, BackgroundVariant } from '@xyflow/react';
import { BASE_UNIT, GRID_GAP } from '../../config/layout';

/**
 * Optimized CustomGrid using React Flow's built-in Background component.
 * This is much more performant than a custom SVG with manual viewport tracking.
 */
export const CustomGrid = memo(() => {
    // We use the built-in Background but customize it via CSS in index.css or a style tag
    // to achieve the "rounded square" look if needed.
    // For now, let's use a very performant variant that matches the spacing.
    
    return (
        <Background
            id="infonote-grid"
            gap={BASE_UNIT}
            size={1} // We'll use CSS to style it
            color="rgba(69, 43, 129, 0.08)"
            variant={BackgroundVariant.Lines}
            style={{ 
                opacity: 0.4,
                // We can use a CSS mask or background-image override if we really want squares
            }}
        />
    );
});
