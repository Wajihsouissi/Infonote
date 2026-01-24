import { memo } from 'react';
import { useViewport } from '@xyflow/react';
import { BASE_UNIT } from '../../config/layout';

/**
 * CustomGrid that renders a soft rounded squares pattern.
 * Synchronized with the React Flow viewport for seamless panning and zooming.
 */
export const CustomGrid = memo(() => {
    const { x, y, zoom } = useViewport();
    
    // We use a CSS-based approach with an SVG data URI for performance and sharp rendering.
    // The pattern consists of a 40x40 rounded square inside a 56x56 cell (matches BASE_UNIT).
    
    return (
        <div 
            style={{
                position: 'absolute',
                top: 0,
                left: 0,
                width: '100%',
                height: '100%',
                pointerEvents: 'none',
                zIndex: -1,
                backgroundPosition: `${x}px ${y}px`,
                backgroundSize: `${BASE_UNIT * zoom}px ${BASE_UNIT * zoom}`,
                // Very soft purple rounded squares (rx=12)
                backgroundImage: `url("data:image/svg+xml,%3Csvg width='56' height='56' viewBox='0 0 56 56' xmlns='http://www.w3.org/2000/svg'%3E%3Crect x='8' y='8' width='40' height='40' rx='12' fill='rgba(139, 92, 246, 0.04)'/%3E%3C/svg%3E")`,
                backgroundRepeat: 'repeat',
            }}
        />
    );
});
