'use client';

import { useState, useRef, useCallback } from 'react';

interface BeforeAfterSliderProps {
    beforeImage: string;
    afterImage: string;
    beforeLabel?: string;
    afterLabel?: string;
    beforeSize?: number;
    afterSize?: number;
}

export default function BeforeAfterSlider({
    beforeImage,
    afterImage,
    beforeLabel = 'Przed',
    afterLabel = 'Po',
    beforeSize,
    afterSize
}: BeforeAfterSliderProps) {
    const [position, setPosition] = useState(50);
    const [isDragging, setIsDragging] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);

    const handleMove = useCallback((clientX: number) => {
        if (!containerRef.current) return;
        const rect = containerRef.current.getBoundingClientRect();
        const x = clientX - rect.left;
        const percentage = Math.max(0, Math.min(100, (x / rect.width) * 100));
        setPosition(percentage);
    }, []);

    const handleMouseDown = (e: React.MouseEvent) => {
        e.preventDefault();
        setIsDragging(true);
        handleMove(e.clientX);
    };
    const handleMouseUp = () => setIsDragging(false);
    const handleMouseMove = (e: React.MouseEvent) => {
        if (isDragging) handleMove(e.clientX);
    };
    const handleTouchStart = (e: React.TouchEvent) => {
        handleMove(e.touches[0].clientX);
    };
    const handleTouchMove = (e: React.TouchEvent) => {
        handleMove(e.touches[0].clientX);
    };

    const formatSize = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    };

    const reduction = beforeSize && afterSize
        ? Math.round((1 - afterSize / beforeSize) * 100)
        : null;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {/* Labels */}
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem' }}>
                <div style={{ color: 'var(--text-muted)' }}>
                    {beforeLabel}
                    {beforeSize && <span style={{ marginLeft: '0.5rem', color: '#f87171' }}>{formatSize(beforeSize)}</span>}
                </div>
                <div style={{ color: 'var(--text-muted)' }}>
                    {afterSize && <span style={{ marginRight: '0.5rem', color: 'var(--accent)' }}>{formatSize(afterSize)}</span>}
                    {afterLabel}
                </div>
            </div>

            {/* Slider Container */}
            <div
                ref={containerRef}
                onMouseDown={handleMouseDown}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                onMouseMove={handleMouseMove}
                onTouchStart={handleTouchStart}
                onTouchMove={handleTouchMove}
                onTouchEnd={handleMouseUp}
                style={{
                    position: 'relative',
                    width: '100%',
                    aspectRatio: '16 / 10',
                    borderRadius: '12px',
                    overflow: 'hidden',
                    cursor: 'ew-resize',
                    border: '1px solid var(--border)',
                    background: '#1a1a1a',
                    userSelect: 'none'
                }}
            >
                {/* After Image (right side - full background) */}
                <img
                    src={afterImage}
                    alt="After"
                    draggable={false}
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        objectFit: 'contain',
                        pointerEvents: 'none'
                    }}
                />

                {/* Before Image (left side - clipped) */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: 0,
                        width: '100%',
                        height: '100%',
                        clipPath: `inset(0 ${100 - position}% 0 0)`,
                        background: '#1a1a1a'
                    }}
                >
                    <img
                        src={beforeImage}
                        alt="Before"
                        draggable={false}
                        style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            width: '100%',
                            height: '100%',
                            objectFit: 'contain',
                            pointerEvents: 'none'
                        }}
                    />
                </div>

                {/* Slider Line */}
                <div
                    style={{
                        position: 'absolute',
                        top: 0,
                        left: `${position}%`,
                        width: '3px',
                        height: '100%',
                        background: 'white',
                        transform: 'translateX(-50%)',
                        boxShadow: '0 0 10px rgba(0,0,0,0.8)',
                        pointerEvents: 'none'
                    }}
                />

                {/* Slider Handle */}
                <div
                    style={{
                        position: 'absolute',
                        top: '50%',
                        left: `${position}%`,
                        transform: 'translate(-50%, -50%)',
                        width: '44px',
                        height: '44px',
                        borderRadius: '50%',
                        background: 'white',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.5)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '1.2rem',
                        userSelect: 'none',
                        pointerEvents: 'none'
                    }}
                >
                    ⇄
                </div>

                {/* Corner Labels */}
                <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    left: '10px',
                    padding: '4px 10px',
                    background: 'rgba(248, 113, 113, 0.9)',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    color: 'white',
                    fontWeight: 600,
                    pointerEvents: 'none'
                }}>
                    {beforeLabel}
                </div>
                <div style={{
                    position: 'absolute',
                    bottom: '10px',
                    right: '10px',
                    padding: '4px 10px',
                    background: 'rgba(74, 222, 128, 0.9)',
                    borderRadius: '4px',
                    fontSize: '0.7rem',
                    color: 'black',
                    fontWeight: 600,
                    pointerEvents: 'none'
                }}>
                    {afterLabel}
                </div>
            </div>

            {/* Reduction Badge */}
            {reduction !== null && (
                <div style={{
                    textAlign: 'center',
                    padding: '0.6rem',
                    background: reduction > 0 ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                    borderRadius: '8px',
                    fontSize: '0.9rem',
                    color: reduction > 0 ? 'var(--accent)' : '#f87171',
                    fontWeight: 600
                }}>
                    {reduction > 0 ? `📉 Redukcja rozmiaru: ${reduction}%` : `📈 Wzrost rozmiaru: ${Math.abs(reduction)}%`}
                </div>
            )}
        </div>
    );
}
