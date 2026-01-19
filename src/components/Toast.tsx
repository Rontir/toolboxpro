'use client';

import { useState, useEffect, createContext, useContext, useCallback } from 'react';
import { triggerConfetti } from '@/utils/confetti';

interface Toast {
    id: string;
    message: string;
    type: 'success' | 'error' | 'info' | 'warning';
    icon?: string;
}

interface ToastContextType {
    showToast: (message: string, type?: Toast['type'], icon?: string) => void;
    showSuccess: (message: string) => void;
    showError: (message: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast() {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within ToastProvider');
    }
    return context;
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);
    const [showOverlay, setShowOverlay] = useState(false);
    const [overlayMessage, setOverlayMessage] = useState('');

    const showToast = useCallback((message: string, type: Toast['type'] = 'info', icon?: string) => {
        const id = Date.now().toString();
        const defaultIcons = {
            success: '✅',
            error: '❌',
            warning: '⚠️',
            info: 'ℹ️'
        };

        setToasts(prev => [...prev, { id, message, type, icon: icon || defaultIcons[type] }]);



        // ... (inside ToastProvider)

        // Show blur overlay for success
        if (type === 'success') {
            setOverlayMessage(message);
            setShowOverlay(true);
            triggerConfetti();
            setTimeout(() => setShowOverlay(false), 2000);
        }

        // Auto dismiss
        setTimeout(() => {
            setToasts(prev => prev.filter(t => t.id !== id));
        }, 4000);
    }, []);

    const showSuccess = useCallback((message: string) => showToast(message, 'success', '🎉'), [showToast]);
    const showError = useCallback((message: string) => showToast(message, 'error'), [showToast]);

    return (
        <ToastContext.Provider value={{ showToast, showSuccess, showError }}>
            {children}

            {/* Blur Overlay */}
            <div
                className="toast-overlay"
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.6)',
                    backdropFilter: showOverlay ? 'blur(8px)' : 'blur(0px)',
                    opacity: showOverlay ? 1 : 0,
                    pointerEvents: showOverlay ? 'auto' : 'none',
                    transition: 'all 0.4s ease',
                    zIndex: 9998,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                }}
            >
                {showOverlay && overlayMessage && (
                    <div
                        style={{
                            display: 'flex',
                            flexDirection: 'column',
                            alignItems: 'center',
                            gap: '1rem',
                            animation: 'toast-pop 0.4s ease',
                        }}
                    >
                        <div style={{ fontSize: '4rem' }}>🎉</div>
                        <div style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            color: 'var(--accent)',
                            textShadow: '0 0 20px var(--accent-glow)',
                            textAlign: 'center',
                            padding: '0 1rem'
                        }}>
                            {overlayMessage}
                        </div>
                    </div>
                )}
            </div>

            {/* Toast Stack */}
            <div
                style={{
                    position: 'fixed',
                    bottom: '1.5rem',
                    right: '1.5rem',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.75rem',
                    zIndex: 9999,
                }}
            >
                {toasts.map(toast => (
                    <div
                        key={toast.id}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '1rem 1.5rem',
                            background: toast.type === 'success' ? 'rgba(34, 197, 94, 0.15)'
                                : toast.type === 'error' ? 'rgba(239, 68, 68, 0.15)'
                                    : toast.type === 'warning' ? 'rgba(251, 191, 36, 0.15)'
                                        : 'rgba(255, 255, 255, 0.1)',
                            border: `1px solid ${toast.type === 'success' ? 'var(--accent)'
                                : toast.type === 'error' ? '#ef4444'
                                    : toast.type === 'warning' ? '#fbbf24'
                                        : 'var(--border)'
                                }`,
                            borderRadius: '12px',
                            backdropFilter: 'blur(10px)',
                            boxShadow: '0 10px 40px rgba(0,0,0,0.3)',
                            animation: 'toast-slide 0.3s ease',
                            minWidth: '280px',
                        }}
                    >
                        <span style={{ fontSize: '1.5rem' }}>{toast.icon}</span>
                        <span style={{
                            color: 'var(--text-white)',
                            fontWeight: 500,
                            fontSize: '0.95rem'
                        }}>
                            {toast.message}
                        </span>
                    </div>
                ))}
            </div>


        </ToastContext.Provider>
    );
}
