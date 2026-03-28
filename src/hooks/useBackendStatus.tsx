'use client';

import { useState, useEffect } from 'react';

interface BackendStatus {
    isOnline: boolean;
    lastChecked: Date | null;
    checking: boolean;
}

export function useBackendStatus(checkInterval: number = 30000) {
    const [status, setStatus] = useState<BackendStatus>({
        isOnline: false,
        lastChecked: null,
        checking: true,
    });

    useEffect(() => {
        const checkBackend = async () => {
            if (typeof document !== 'undefined' && document.hidden) {
                setStatus(prev => ({ ...prev, checking: false }));
                return;
            }

            const url = '/api/health';
            setStatus(prev => ({ ...prev, checking: true }));

            try {
                const controller = new AbortController();
                const timeoutId = setTimeout(() => controller.abort(), 5000);

                const response = await fetch(url, {
                    method: 'GET',
                    signal: controller.signal,
                });

                clearTimeout(timeoutId);

                setStatus({
                    isOnline: response.ok,
                    lastChecked: new Date(),
                    checking: false,
                });
            } catch {
                setStatus({
                    isOnline: false,
                    lastChecked: new Date(),
                    checking: false,
                });
            }
        };

        // Initial check
        checkBackend();

        const hiddenInterval = Math.max(checkInterval * 10, 5 * 60 * 1000);
        let intervalId = setInterval(checkBackend, document.hidden ? hiddenInterval : checkInterval);

        const restartInterval = () => {
            clearInterval(intervalId);
            intervalId = setInterval(checkBackend, document.hidden ? hiddenInterval : checkInterval);

            if (!document.hidden) {
                checkBackend();
            }
        };

        document.addEventListener('visibilitychange', restartInterval);
        window.addEventListener('online', checkBackend);

        return () => {
            clearInterval(intervalId);
            document.removeEventListener('visibilitychange', restartInterval);
            window.removeEventListener('online', checkBackend);
        };
    }, [checkInterval]);

    return status;
}

interface BackendStatusIndicatorProps {
    className?: string;
}

export function BackendStatusIndicator({ className }: BackendStatusIndicatorProps) {
    const { isOnline, checking } = useBackendStatus();

    return (
        <div className={className} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span
                className="status-dot"
                style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background: checking
                        ? '#f59e0b'
                        : isOnline
                            ? 'var(--accent)'
                            : '#ef4444',
                    animation: checking ? 'pulse 1s ease-in-out infinite' : isOnline ? 'pulse 2s ease-in-out infinite' : 'none',
                    boxShadow: isOnline ? '0 0 8px var(--accent-glow)' : 'none',
                }}
            />
            <span style={{
                fontSize: '12px',
                color: checking
                    ? '#f59e0b'
                    : isOnline
                        ? 'var(--text-gray)'
                        : '#ef4444',
            }}>
                {checking ? 'Sprawdzanie...' : isOnline ? 'Backend Online' : 'Backend Offline'}
            </span>
        </div>
    );
}
