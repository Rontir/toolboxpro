'use client';

import { useState, useEffect, useRef, useCallback } from 'react';

interface ETAEstimatorOptions {
    smoothingFactor?: number; // 0-1, higher = more weight to recent speed
    minSamples?: number;      // Minimum samples before showing ETA
}

interface ETAState {
    startTime: number;
    processed: number;
    total: number;
    samples: { time: number; count: number }[];
}

/**
 * Hook to estimate time remaining for bulk operations
 */
export function useETAEstimator(options: ETAEstimatorOptions = {}) {
    const { smoothingFactor = 0.3, minSamples = 3 } = options;

    const [state, setState] = useState<ETAState | null>(null);
    const [eta, setEta] = useState<string | null>(null);
    const [speed, setSpeed] = useState<number>(0);
    const [progress, setProgress] = useState<number>(0);

    const start = useCallback((total: number) => {
        setState({
            startTime: Date.now(),
            processed: 0,
            total,
            samples: [],
        });
        setEta(null);
        setSpeed(0);
        setProgress(0);
    }, []);

    const update = useCallback((processed: number) => {
        if (!state) return;

        const now = Date.now();
        const newSamples = [...state.samples, { time: now, count: processed }];

        // Keep last 10 samples
        if (newSamples.length > 10) {
            newSamples.shift();
        }

        setState(prev => prev ? { ...prev, processed, samples: newSamples } : null);
        setProgress((processed / state.total) * 100);

        // Calculate ETA
        if (newSamples.length >= minSamples) {
            const recentSamples = newSamples.slice(-5);
            const firstSample = recentSamples[0];
            const lastSample = recentSamples[recentSamples.length - 1];

            const timeDiff = (lastSample.time - firstSample.time) / 1000; // seconds
            const countDiff = lastSample.count - firstSample.count;

            if (timeDiff > 0 && countDiff > 0) {
                const itemsPerSecond = countDiff / timeDiff;
                const remaining = state.total - processed;
                const secondsRemaining = remaining / itemsPerSecond;

                setSpeed(itemsPerSecond);
                setEta(formatTime(secondsRemaining));
            }
        }
    }, [state, minSamples]);

    const complete = useCallback(() => {
        if (state) {
            const elapsed = (Date.now() - state.startTime) / 1000;
            setEta(`Ukończono w ${formatTime(elapsed)}`);
        }
        setProgress(100);
    }, [state]);

    const reset = useCallback(() => {
        setState(null);
        setEta(null);
        setSpeed(0);
        setProgress(0);
    }, []);

    return {
        start,
        update,
        complete,
        reset,
        eta,
        speed,
        progress,
        isRunning: state !== null && state.processed < state.total,
        processed: state?.processed ?? 0,
        total: state?.total ?? 0,
    };
}

/**
 * Format seconds into human readable time
 */
function formatTime(seconds: number): string {
    if (seconds < 0) return 'Obliczanie...';
    if (seconds < 1) return 'Zaraz...';

    if (seconds < 60) {
        return `${Math.round(seconds)}s`;
    }

    const minutes = Math.floor(seconds / 60);
    const secs = Math.round(seconds % 60);

    if (minutes < 60) {
        return `${minutes}m ${secs}s`;
    }

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    return `${hours}h ${mins}m`;
}

/**
 * ETA Display Component
 */
interface ETADisplayProps {
    eta: string | null;
    progress: number;
    processed: number;
    total: number;
    speed: number;
    isRunning: boolean;
}

export function ETADisplay({
    eta,
    progress,
    processed,
    total,
    speed,
    isRunning
}: ETADisplayProps) {
    if (!isRunning && progress === 0) return null;

    return (
        <div style={{
            background: 'var(--bg-card)',
            border: '1px solid var(--border)',
            borderRadius: '12px',
            padding: '1rem',
            marginBottom: '1rem',
        }}>
            {/* Header */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                marginBottom: '0.75rem',
            }}>
                <span style={{ fontWeight: 600, fontSize: '0.875rem' }}>
                    {isRunning ? '⏳ Przetwarzanie...' : '✅ Zakończono'}
                </span>
                <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                    {processed}/{total} plików
                </span>
            </div>

            {/* Progress bar */}
            <div style={{
                height: '8px',
                background: 'var(--bg-input)',
                borderRadius: '4px',
                overflow: 'hidden',
                marginBottom: '0.75rem',
            }}>
                <div style={{
                    width: `${progress}%`,
                    height: '100%',
                    background: progress === 100
                        ? 'var(--accent)'
                        : 'linear-gradient(90deg, var(--accent), var(--accent-hover))',
                    borderRadius: '4px',
                    transition: 'width 0.3s ease',
                    position: 'relative',
                    overflow: 'hidden',
                }}>
                    {/* Shimmer effect */}
                    {isRunning && (
                        <div style={{
                            position: 'absolute',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'linear-gradient(90deg, transparent, rgba(255,255,255,0.2), transparent)',
                            animation: 'shimmer 1.5s infinite',
                        }} />
                    )}
                </div>
            </div>

            {/* Stats */}
            <div style={{
                display: 'flex',
                justifyContent: 'space-between',
                fontSize: '0.75rem',
                color: 'var(--text-muted)',
            }}>
                <span>
                    {speed > 0 && `${speed.toFixed(1)} plików/s`}
                </span>
                <span style={{ fontWeight: 600, color: isRunning ? 'var(--accent)' : 'var(--text-gray)' }}>
                    {eta || 'Obliczanie...'}
                </span>
            </div>
        </div>
    );
}
