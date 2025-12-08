'use client';

import { useEffect } from 'react';

/**
 * Global hook that adds mouse tracking to all elements with .card class
 * Creates a glow effect that follows the cursor
 */
export function useGlobalMouseTracking() {
    useEffect(() => {
        const handleMouseMove = (e: MouseEvent) => {
            const target = e.target as HTMLElement;
            const card = target.closest('.card') as HTMLElement;

            if (card) {
                const rect = card.getBoundingClientRect();
                const x = ((e.clientX - rect.left) / rect.width) * 100;
                const y = ((e.clientY - rect.top) / rect.height) * 100;
                card.style.setProperty('--mouse-x', `${x}%`);
                card.style.setProperty('--mouse-y', `${y}%`);
            }
        };

        document.addEventListener('mousemove', handleMouseMove);

        return () => {
            document.removeEventListener('mousemove', handleMouseMove);
        };
    }, []);
}

/**
 * Component wrapper that enables global mouse tracking
 * Use this in layout.tsx or page.tsx
 */
export function GlobalMouseTracker() {
    useGlobalMouseTracking();
    return null;
}
