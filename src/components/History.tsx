'use client';

import { createContext, useContext, useState, useCallback, ReactNode } from 'react';

export interface HistoryItem {
    id: string;
    timestamp: Date;
    tool: string;
    toolIcon: string;
    inputFiles: string[];
    outputFileName: string;
    outputBlob: Blob | null;
    summary: string;
    stats?: Record<string, number | string>;
}

interface HistoryContextType {
    history: HistoryItem[];
    addToHistory: (item: Omit<HistoryItem, 'id' | 'timestamp'>) => void;
    clearHistory: () => void;
    downloadItem: (id: string) => void;
    removeFromHistory: (id: string) => void;
    removeMultipleFromHistory: (ids: string[]) => void;
}

const HistoryContext = createContext<HistoryContextType | null>(null);

export function useHistory() {
    const context = useContext(HistoryContext);
    if (!context) {
        throw new Error('useHistory must be used within HistoryProvider');
    }
    return context;
}

export function HistoryProvider({ children }: { children: ReactNode }) {
    const [history, setHistory] = useState<HistoryItem[]>([]);

    const addToHistory = useCallback((item: Omit<HistoryItem, 'id' | 'timestamp'>) => {
        const newItem: HistoryItem = {
            ...item,
            id: crypto.randomUUID(),
            timestamp: new Date()
        };
        setHistory(prev => [newItem, ...prev].slice(0, 20)); // Max 20 items
    }, []);

    const clearHistory = useCallback(() => {
        setHistory([]);
    }, []);

    const removeFromHistory = useCallback((id: string) => {
        setHistory(prev => prev.filter(h => h.id !== id));
    }, []);

    const removeMultipleFromHistory = useCallback((ids: string[]) => {
        setHistory(prev => prev.filter(h => !ids.includes(h.id)));
    }, []);

    const downloadItem = useCallback((id: string) => {
        const item = history.find(h => h.id === id);
        if (item?.outputBlob) {
            const url = URL.createObjectURL(item.outputBlob);
            const a = document.createElement('a');
            a.href = url;
            a.download = item.outputFileName;
            a.click();
            URL.revokeObjectURL(url);
        }
    }, [history]);

    return (
        <HistoryContext.Provider value={{
            history,
            addToHistory,
            clearHistory,
            downloadItem,
            removeFromHistory,
            removeMultipleFromHistory
        }}>
            {children}
        </HistoryContext.Provider>
    );
}

// History Panel Component
export function HistoryPanel({ isOpen, onClose }: { isOpen: boolean; onClose: () => void }) {
    const { history, clearHistory, downloadItem, removeFromHistory, removeMultipleFromHistory } = useHistory();
    const [selectedIds, setSelectedIds] = useState<string[]>([]);
    const [isDownloadingZip, setIsDownloadingZip] = useState(false);

    if (!isOpen) return null;

    const toggleSelect = (id: string) => {
        setSelectedIds(prev =>
            prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
        );
    };

    const toggleSelectAll = () => {
        if (selectedIds.length === history.length) {
            setSelectedIds([]);
        } else {
            setSelectedIds(history.map((h: HistoryItem) => h.id));
        }
    };

    const handleDeleteSelected = () => {
        removeMultipleFromHistory(selectedIds);
        setSelectedIds([]);
    };

    const handleDownloadZip = async () => {
        if (selectedIds.length === 0) return;
        setIsDownloadingZip(true);

        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();
            const selectedItems = history.filter((h: HistoryItem) => selectedIds.includes(h.id));

            for (const item of selectedItems) {
                if (item.outputBlob) {
                    zip.file(item.outputFileName, item.outputBlob);
                }
            }

            const content = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(content);
            const a = document.createElement('a');
            a.href = url;
            a.download = `history_export_${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();
            URL.revokeObjectURL(url);
        } catch (e) {
            console.error('Failed to create ZIP:', e);
        } finally {
            setIsDownloadingZip(false);
            setSelectedIds([]);
        }
    };

    const formatTime = (date: Date) => {
        return date.toLocaleTimeString('pl-PL', { hour: '2-digit', minute: '2-digit' });
    };

    const formatDate = (date: Date) => {
        const today = new Date();
        const isToday = date.toDateString() === today.toDateString();
        if (isToday) return 'Dzisiaj';

        const yesterday = new Date(today);
        yesterday.setDate(yesterday.getDate() - 1);
        if (date.toDateString() === yesterday.toDateString()) return 'Wczoraj';

        return date.toLocaleDateString('pl-PL', { day: 'numeric', month: 'short' });
    };

    // Group by date
    const groupedHistory = history.reduce((acc: Record<string, HistoryItem[]>, item: HistoryItem) => {
        const dateKey = item.timestamp.toDateString();
        if (!acc[dateKey]) acc[dateKey] = [];
        acc[dateKey].push(item);
        return acc;
    }, {} as Record<string, HistoryItem[]>);

    return (
        <>
            {/* Overlay */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0,0,0,0.5)',
                    zIndex: 999
                }}
            />

            {/* Panel */}
            <div style={{
                position: 'fixed',
                top: 0,
                right: 0,
                bottom: 0,
                width: '380px',
                background: 'var(--bg-secondary)',
                borderLeft: '1px solid var(--border)',
                zIndex: 1000,
                display: 'flex',
                flexDirection: 'column',
                animation: 'slideIn 0.2s ease-out'
            }}>
                {/* Header */}
                <div style={{
                    padding: '1rem 1.25rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                }}>
                    <h2 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 700 }}>
                        📜 Historia operacji
                    </h2>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {history.length > 0 && (
                            <button
                                onClick={clearHistory}
                                style={{
                                    padding: '0.4rem 0.75rem',
                                    background: 'transparent',
                                    border: '1px solid var(--border)',
                                    borderRadius: '6px',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '0.75rem'
                                }}
                            >
                                Wyczyść
                            </button>
                        )}
                        <button
                            onClick={onClose}
                            style={{
                                padding: '0.4rem 0.6rem',
                                background: 'transparent',
                                border: 'none',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '1.2rem'
                            }}
                        >
                            ✕
                        </button>
                    </div>
                </div>

                {/* Content */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '1rem' }}>
                    {history.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '3rem 1rem',
                            color: 'var(--text-muted)'
                        }}>
                            <div style={{ fontSize: '3rem', marginBottom: '1rem' }}>📭</div>
                            <div style={{ fontSize: '0.9rem' }}>Brak historii</div>
                            <div style={{ fontSize: '0.75rem', marginTop: '0.5rem' }}>
                                Przetworzone pliki pojawią się tutaj
                            </div>
                        </div>
                    ) : (
                        Object.entries(groupedHistory).map(([dateKey, items]: [string, HistoryItem[]]) => (
                            <div key={dateKey} style={{ marginBottom: '1.5rem' }}>
                                <div style={{
                                    fontSize: '0.75rem',
                                    color: 'var(--text-muted)',
                                    marginBottom: '0.5rem',
                                    fontWeight: 600
                                }}>
                                    {formatDate(new Date(dateKey))}
                                </div>

                                {items.map(item => (
                                    <div
                                        key={item.id}
                                        style={{
                                            background: 'var(--bg-tertiary)',
                                            borderRadius: '8px',
                                            padding: '0.75rem',
                                            marginBottom: '0.5rem',
                                            border: selectedIds.includes(item.id) ? '1px solid var(--accent)' : '1px solid var(--border)',
                                            position: 'relative',
                                            transition: 'all 0.2s ease'
                                        }}
                                    >
                                        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem' }}>
                                            <div style={{ paddingTop: '0.25rem' }}>
                                                <input
                                                    type="checkbox"
                                                    checked={selectedIds.includes(item.id)}
                                                    onChange={() => toggleSelect(item.id)}
                                                    style={{ accentColor: 'var(--accent)', cursor: 'pointer' }}
                                                />
                                            </div>
                                            <span style={{ fontSize: '1.5rem' }}>{item.toolIcon}</span>
                                            <div style={{ flex: 1, minWidth: 0 }}>
                                                <div style={{
                                                    display: 'flex',
                                                    justifyContent: 'space-between',
                                                    alignItems: 'center',
                                                    marginBottom: '0.25rem'
                                                }}>
                                                    <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>
                                                        {item.tool}
                                                    </span>
                                                    <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                                                        {formatTime(item.timestamp)}
                                                    </span>
                                                </div>

                                                <div style={{
                                                    fontSize: '0.75rem',
                                                    color: 'var(--text-muted)',
                                                    marginBottom: '0.5rem',
                                                    whiteSpace: 'nowrap',
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis'
                                                }}>
                                                    {item.summary}
                                                </div>

                                                {item.stats && (
                                                    <div style={{
                                                        display: 'flex',
                                                        gap: '0.75rem',
                                                        fontSize: '0.7rem',
                                                        marginBottom: '0.5rem'
                                                    }}>
                                                        {Object.entries(item.stats).map(([key, val]) => (
                                                            <span key={key} style={{ color: 'var(--accent)' }}>
                                                                {key}: {val}
                                                            </span>
                                                        ))}
                                                    </div>
                                                )}

                                                <div style={{ display: 'flex', gap: '0.5rem' }}>
                                                    {item.outputBlob && (
                                                        <button
                                                            onClick={() => downloadItem(item.id)}
                                                            style={{
                                                                padding: '0.35rem 0.6rem',
                                                                background: 'var(--accent)',
                                                                color: 'black',
                                                                border: 'none',
                                                                borderRadius: '4px',
                                                                cursor: 'pointer',
                                                                fontSize: '0.7rem',
                                                                fontWeight: 600
                                                            }}
                                                        >
                                                            📥 Pobierz
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={() => removeFromHistory(item.id)}
                                                        style={{
                                                            padding: '0.35rem 0.6rem',
                                                            background: 'transparent',
                                                            color: '#ef4444',
                                                            border: '1px solid #ef4444',
                                                            borderRadius: '4px',
                                                            cursor: 'pointer',
                                                            fontSize: '0.7rem',
                                                            fontWeight: 600
                                                        }}
                                                    >
                                                        🗑️ Usuń
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        ))
                    )}
                </div>

                {/* Batch Actions Bar */}
                {selectedIds.length > 0 && (
                    <div style={{
                        padding: '1rem',
                        background: 'var(--bg-tertiary)',
                        borderTop: '1px solid var(--border)',
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '0.75rem',
                        boxShadow: '0 -4px 12px rgba(0,0,0,0.1)'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                            <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>
                                Wybrano: {selectedIds.length}
                            </span>
                            <button
                                onClick={() => setSelectedIds([])}
                                style={{ background: 'none', border: 'none', color: 'var(--accent)', fontSize: '0.8rem', cursor: 'pointer' }}
                            >
                                Odznacz wszystko
                            </button>
                        </div>
                        <div style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={handleDownloadZip}
                                disabled={isDownloadingZip}
                                className="btn btn-primary"
                                style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem' }}
                            >
                                {isDownloadingZip ? '⏳ Pakowanie...' : '📦 Pobierz ZIP'}
                            </button>
                            <button
                                onClick={handleDeleteSelected}
                                className="btn btn-secondary"
                                style={{ flex: 1, padding: '0.5rem', fontSize: '0.8rem', color: '#ef4444', borderColor: '#ef4444' }}
                            >
                                🗑️ Usuń wybrane
                            </button>
                        </div>
                    </div>
                )}
            </div>

            <style jsx global>{`
                @keyframes slideIn {
                    from { transform: translateX(100%); }
                    to { transform: translateX(0); }
                }
            `}</style>
        </>
    );
}
