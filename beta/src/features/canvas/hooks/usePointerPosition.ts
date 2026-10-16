import { useEffect, useRef } from 'react';

/** The pointer's last screen position, as a ref (read on demand, never re-renders). */
export function usePointerPosition() {
    const positionRef = useRef({ x: window.innerWidth / 2, y: window.innerHeight / 2 });
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            positionRef.current = { x: e.clientX, y: e.clientY };
        };
        window.addEventListener('mousemove', handleMouseMove);
        return () => window.removeEventListener('mousemove', handleMouseMove);
    }, []);
    return positionRef;
}
