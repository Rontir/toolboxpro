'use client';

import { useState, ReactNode } from 'react';

interface TooltipProps {
    text: string;
    children: ReactNode;
    position?: 'top' | 'bottom' | 'left' | 'right';
    delay?: number;
}

export function Tooltip({ text, children, position = 'bottom', delay = 200 }: TooltipProps) {
    const [show, setShow] = useState(false);
    const [timeoutId, setTimeoutId] = useState<NodeJS.Timeout | null>(null);

    const handleMouseEnter = () => {
        const id = setTimeout(() => setShow(true), delay);
        setTimeoutId(id);
    };

    const handleMouseLeave = () => {
        if (timeoutId) clearTimeout(timeoutId);
        setShow(false);
    };

    const positionStyles: Record<string, React.CSSProperties> = {
        top: { bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: '8px' },
        bottom: { top: '100%', left: '50%', transform: 'translateX(-50%)', marginTop: '8px' },
        left: { right: '100%', top: '50%', transform: 'translateY(-50%)', marginRight: '8px' },
        right: { left: '100%', top: '50%', transform: 'translateY(-50%)', marginLeft: '8px' },
    };

    return (
        <div
            style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            {children}
            {show && (
                <div
                    style={{
                        position: 'absolute',
                        ...positionStyles[position],
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '8px',
                        padding: '6px 12px',
                        fontSize: '12px',
                        fontWeight: 500,
                        color: 'var(--text-white)',
                        whiteSpace: 'nowrap',
                        zIndex: 1100,
                        boxShadow: '0 4px 12px rgba(0, 0, 0, 0.3)',
                        animation: 'tooltipFadeIn 0.2s ease',
                    }}
                >
                    {text}
                </div>
            )}
        </div>
    );
}
