'use client';

import { createContext, useContext, useState, useCallback, ReactNode, useEffect } from 'react';

type NotificationType = 'success' | 'error' | 'warning' | 'info';

interface Notification {
    id: string;
    type: NotificationType;
    title: string;
    message?: string;
    timestamp: Date;
    read: boolean;
}

interface NotificationsContextType {
    notifications: Notification[];
    unreadCount: number;
    addNotification: (type: NotificationType, title: string, message?: string) => void;
    markAsRead: (id: string) => void;
    markAllAsRead: () => void;
    clearAll: () => void;
    removeNotification: (id: string) => void;
}

const NotificationsContext = createContext<NotificationsContextType | null>(null);

const STORAGE_KEY = 'toolbox-notifications';
const MAX_NOTIFICATIONS = 50;

export function NotificationsProvider({ children }: { children: ReactNode }) {
    const [notifications, setNotifications] = useState<Notification[]>([]);

    // Load from localStorage on mount
    useEffect(() => {
        try {
            const saved = localStorage.getItem(STORAGE_KEY);
            if (saved) {
                const parsed = JSON.parse(saved);
                setNotifications(parsed.map((n: Notification) => ({
                    ...n,
                    timestamp: new Date(n.timestamp)
                })));
            }
        } catch (e) {
            console.error('Failed to load notifications', e);
        }
    }, []);

    // Save to localStorage whenever notifications change
    useEffect(() => {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(notifications));
    }, [notifications]);

    const addNotification = useCallback((type: NotificationType, title: string, message?: string) => {
        const newNotification: Notification = {
            id: Date.now().toString(),
            type,
            title,
            message,
            timestamp: new Date(),
            read: false,
        };
        setNotifications(prev => [newNotification, ...prev].slice(0, MAX_NOTIFICATIONS));
    }, []);

    const markAsRead = useCallback((id: string) => {
        setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
    }, []);

    const markAllAsRead = useCallback(() => {
        setNotifications(prev => prev.map(n => ({ ...n, read: true })));
    }, []);

    const clearAll = useCallback(() => {
        setNotifications([]);
    }, []);

    const removeNotification = useCallback((id: string) => {
        setNotifications(prev => prev.filter(n => n.id !== id));
    }, []);

    const unreadCount = notifications.filter(n => !n.read).length;

    return (
        <NotificationsContext.Provider value={{
            notifications,
            unreadCount,
            addNotification,
            markAsRead,
            markAllAsRead,
            clearAll,
            removeNotification,
        }}>
            {children}
        </NotificationsContext.Provider>
    );
}

export function useNotifications() {
    const context = useContext(NotificationsContext);
    if (!context) {
        throw new Error('useNotifications must be used within NotificationsProvider');
    }
    return context;
}

// Notification type icons and colors
const NOTIFICATION_STYLES: Record<NotificationType, { icon: string; color: string }> = {
    success: { icon: '✅', color: '#22c55e' },
    error: { icon: '❌', color: '#ef4444' },
    warning: { icon: '⚠️', color: '#f59e0b' },
    info: { icon: 'ℹ️', color: '#3b82f6' },
};

// Notifications Panel Component
interface NotificationsPanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export function NotificationsPanel({ isOpen, onClose }: NotificationsPanelProps) {
    const { notifications, unreadCount, markAsRead, markAllAsRead, clearAll, removeNotification } = useNotifications();

    if (!isOpen) return null;

    const formatTime = (date: Date) => {
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return 'Teraz';
        if (minutes < 60) return `${minutes} min temu`;
        if (hours < 24) return `${hours}h temu`;
        if (days < 7) return `${days}d temu`;
        return date.toLocaleDateString('pl-PL');
    };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    backdropFilter: 'blur(4px)',
                    zIndex: 999,
                    animation: 'spotlight-fade-in 0.2s ease-out'
                }}
            />
            {/* Panel */}
            <div style={{
                position: 'fixed',
                top: '60px',
                right: '20px',
                width: '380px',
                maxWidth: 'calc(100vw - 40px)',
                maxHeight: 'calc(100vh - 100px)',
                background: 'var(--bg-card)',
                border: '1px solid var(--border)',
                borderRadius: '16px',
                boxShadow: '0 20px 60px rgba(0, 0, 0, 0.3)',
                zIndex: 1000,
                overflow: 'hidden',
                animation: 'spotlight-scale-in 0.3s ease-out',
                display: 'flex',
                flexDirection: 'column',
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <span style={{ fontSize: '1.25rem' }}>🔔</span>
                        <span style={{ fontWeight: 700, fontSize: '1rem' }}>Powiadomienia</span>
                        {unreadCount > 0 && (
                            <span style={{
                                background: 'var(--accent)',
                                color: 'black',
                                padding: '2px 8px',
                                borderRadius: '12px',
                                fontSize: '0.75rem',
                                fontWeight: 700,
                            }}>
                                {unreadCount}
                            </span>
                        )}
                    </div>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'transparent',
                            border: 'none',
                            color: 'var(--text-muted)',
                            cursor: 'pointer',
                            fontSize: '1.25rem',
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Actions */}
                {notifications.length > 0 && (
                    <div style={{
                        padding: '0.75rem 1.25rem',
                        borderBottom: '1px solid var(--border)',
                        display: 'flex',
                        gap: '0.75rem',
                    }}>
                        <button
                            onClick={markAllAsRead}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--accent)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                            }}
                        >
                            Oznacz jako przeczytane
                        </button>
                        <button
                            onClick={clearAll}
                            style={{
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.8rem',
                            }}
                        >
                            Wyczyść wszystko
                        </button>
                    </div>
                )}

                {/* Notifications List */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '0.5rem' }}>
                    {notifications.length === 0 ? (
                        <div style={{
                            padding: '3rem 1rem',
                            textAlign: 'center',
                            color: 'var(--text-muted)',
                        }}>
                            <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>🔕</div>
                            <div>Brak powiadomień</div>
                        </div>
                    ) : (
                        notifications.map(notification => {
                            const style = NOTIFICATION_STYLES[notification.type];
                            return (
                                <div
                                    key={notification.id}
                                    onClick={() => markAsRead(notification.id)}
                                    style={{
                                        padding: '0.875rem 1rem',
                                        borderRadius: '10px',
                                        background: notification.read ? 'transparent' : 'rgba(var(--accent-rgb), 0.05)',
                                        cursor: 'pointer',
                                        marginBottom: '0.25rem',
                                        borderLeft: notification.read ? 'none' : `3px solid ${style.color}`,
                                        transition: 'background 0.2s',
                                    }}
                                >
                                    <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
                                        <span style={{ fontSize: '1.25rem' }}>{style.icon}</span>
                                        <div style={{ flex: 1, minWidth: 0 }}>
                                            <div style={{
                                                fontWeight: notification.read ? 500 : 700,
                                                fontSize: '0.9rem',
                                                marginBottom: '0.25rem',
                                                color: 'var(--text-white)',
                                            }}>
                                                {notification.title}
                                            </div>
                                            {notification.message && (
                                                <div style={{
                                                    fontSize: '0.8rem',
                                                    color: 'var(--text-muted)',
                                                    marginBottom: '0.25rem',
                                                }}>
                                                    {notification.message}
                                                </div>
                                            )}
                                            <div style={{
                                                fontSize: '0.7rem',
                                                color: 'var(--text-muted)',
                                                opacity: 0.7,
                                            }}>
                                                {formatTime(notification.timestamp)}
                                            </div>
                                        </div>
                                        <button
                                            onClick={(e) => { e.stopPropagation(); removeNotification(notification.id); }}
                                            style={{
                                                background: 'transparent',
                                                border: 'none',
                                                color: 'var(--text-muted)',
                                                cursor: 'pointer',
                                                fontSize: '0.875rem',
                                                opacity: 0.5,
                                                padding: '4px',
                                            }}
                                        >
                                            ✕
                                        </button>
                                    </div>
                                </div>
                            );
                        })
                    )}
                </div>
            </div>
        </>
    );
}

// Notification Bell Button with Badge
export function NotificationBell({ onClick }: { onClick: () => void }) {
    const { unreadCount } = useNotifications();

    return (
        <button
            className="navbar-icon"
            onClick={onClick}
            style={{ position: 'relative' }}
        >
            🔔
            {unreadCount > 0 && (
                <span style={{
                    position: 'absolute',
                    top: '-2px',
                    right: '-2px',
                    background: '#ef4444',
                    color: 'white',
                    fontSize: '0.65rem',
                    fontWeight: 700,
                    padding: '2px 5px',
                    borderRadius: '10px',
                    minWidth: '16px',
                    textAlign: 'center',
                    lineHeight: 1,
                }}>
                    {unreadCount > 9 ? '9+' : unreadCount}
                </span>
            )}
        </button>
    );
}
