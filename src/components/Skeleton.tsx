'use client';

import React from 'react';

interface SkeletonProps {
    width?: string | number;
    height?: string | number;
    borderRadius?: string;
    className?: string;
    style?: React.CSSProperties;
}

/**
 * Animated skeleton placeholder component
 */
export function Skeleton({
    width = '100%',
    height = '1rem',
    borderRadius = '0.5rem',
    className,
    style
}: SkeletonProps) {
    return (
        <div
            className={className}
            style={{
                width,
                height,
                borderRadius,
                background: 'linear-gradient(90deg, var(--bg-card) 25%, var(--bg-tertiary) 50%, var(--bg-card) 75%)',
                backgroundSize: '200% 100%',
                animation: 'skeleton-shimmer 1.5s ease-in-out infinite',
                ...style,
            }}
        />
    );
}

/**
 * Loading skeleton for Dashboard stats cards
 */
export function DashboardSkeleton() {
    return (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto' }}>
            {/* Header skeleton */}
            <header style={{ marginBottom: '2rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <Skeleton width="200px" height="2.5rem" />
                    <Skeleton width="2.5rem" height="2.5rem" borderRadius="50%" />
                </div>
                <Skeleton width="350px" height="1.25rem" />
            </header>

            {/* Tip skeleton */}
            <div style={{
                padding: '1rem 1.5rem',
                marginBottom: '2rem',
                background: 'var(--bg-card)',
                borderRadius: '0.75rem',
                borderLeft: '3px solid var(--border)',
                display: 'flex',
                alignItems: 'center',
                gap: '1rem',
            }}>
                <Skeleton width="1.5rem" height="1.5rem" borderRadius="50%" />
                <Skeleton width="80%" height="1rem" />
            </div>

            {/* Stats grid skeleton */}
            <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '1.5rem',
                marginBottom: '3rem'
            }}>
                {[1, 2, 3].map((i) => (
                    <div
                        key={i}
                        style={{
                            padding: '1.5rem',
                            background: 'var(--bg-card)',
                            borderRadius: '1rem',
                        }}
                    >
                        <Skeleton width="2rem" height="2rem" borderRadius="50%" style={{ marginBottom: '0.75rem' }} />
                        <Skeleton width="100px" height="0.875rem" style={{ marginBottom: '0.5rem' }} />
                        <Skeleton width="80px" height="2.5rem" />
                    </div>
                ))}
            </div>

            {/* Tools grid skeleton */}
            <section>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1.5rem' }}>
                    <Skeleton width="1.25rem" height="1.25rem" borderRadius="50%" />
                    <Skeleton width="180px" height="1.25rem" />
                </div>
                <div style={{
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))',
                    gap: '1.5rem'
                }}>
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                        <div
                            key={i}
                            style={{
                                padding: '1.5rem',
                                background: 'var(--bg-card)',
                                borderRadius: '1rem',
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                            }}
                        >
                            <Skeleton width="2rem" height="2rem" borderRadius="50%" />
                            <div style={{ flex: 1 }}>
                                <Skeleton width="120px" height="1rem" style={{ marginBottom: '0.5rem' }} />
                                <Skeleton width="80px" height="0.75rem" />
                            </div>
                        </div>
                    ))}
                </div>
            </section>
        </div>
    );
}
