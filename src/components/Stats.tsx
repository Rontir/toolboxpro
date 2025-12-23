'use client';

import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface ToolUsage {
    [toolId: string]: number;
}

interface StatsData {
    filesProcessed: number;
    toolUsage: ToolUsage;
    totalOperations: number;
    lastUsed: string | null;
}

interface StatsContextType {
    stats: StatsData;
    recordUsage: (toolId: string, filesCount?: number) => void;
    resetStats: () => void;
}

const StatsContext = createContext<StatsContextType | undefined>(undefined);

const STORAGE_KEY = 'toolbox-stats';

const DEFAULT_STATS: StatsData = {
    filesProcessed: 0,
    toolUsage: {},
    totalOperations: 0,
    lastUsed: null,
};

export function StatsProvider({ children }: { children: ReactNode }) {
    const [stats, setStats] = useState<StatsData>(DEFAULT_STATS);
    const [isLoaded, setIsLoaded] = useState(false);

    // Load stats from localStorage on mount
    useEffect(() => {
        try {
            const stored = localStorage.getItem(STORAGE_KEY);
            if (stored) {
                setStats(JSON.parse(stored));
            }
        } catch (e) {
            console.error('Failed to load stats:', e);
        }
        setIsLoaded(true);
    }, []);

    // Save stats to localStorage when changed
    useEffect(() => {
        if (isLoaded) {
            try {
                localStorage.setItem(STORAGE_KEY, JSON.stringify(stats));
            } catch (e) {
                console.error('Failed to save stats:', e);
            }
        }
    }, [stats, isLoaded]);

    const recordUsage = (toolId: string, filesCount = 1) => {
        setStats(prev => ({
            filesProcessed: prev.filesProcessed + filesCount,
            toolUsage: {
                ...prev.toolUsage,
                [toolId]: (prev.toolUsage[toolId] || 0) + 1,
            },
            totalOperations: prev.totalOperations + 1,
            lastUsed: toolId,
        }));
    };

    const resetStats = () => {
        setStats(DEFAULT_STATS);
    };

    return (
        <StatsContext.Provider value={{ stats, recordUsage, resetStats }}>
            {children}
        </StatsContext.Provider>
    );
}

export function useStats() {
    const context = useContext(StatsContext);
    if (!context) {
        throw new Error('useStats must be used within StatsProvider');
    }
    return context;
}

interface StatsPanelProps {
    isOpen: boolean;
    onClose: () => void;
    tools: { id: string; name: string; icon: string }[];
}

export function StatsPanel({ isOpen, onClose, tools }: StatsPanelProps) {
    const { stats, resetStats } = useStats();

    if (!isOpen) return null;

    const topTools = Object.entries(stats.toolUsage)
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5);

    const getToolInfo = (toolId: string) =>
        tools.find(t => t.id === toolId) || { name: toolId, icon: '🔧' };

    return (
        <>
            {/* Backdrop */}
            <div
                onClick={onClose}
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.5)',
                    zIndex: 999,
                    animation: 'fadeIn 0.2s ease',
                }}
            />
            {/* Panel */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    width: '400px',
                    maxWidth: '100%',
                    height: '100%',
                    background: 'var(--bg-card)',
                    borderLeft: '1px solid var(--border)',
                    zIndex: 1000,
                    display: 'flex',
                    flexDirection: 'column',
                    animation: 'slideInRight 0.3s ease',
                }}
            >
                {/* Header */}
                <div style={{
                    padding: '1.5rem',
                    borderBottom: '1px solid var(--border)',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                }}>
                    <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>📊 Statystyki</h2>
                    <button
                        onClick={onClose}
                        style={{
                            background: 'none',
                            border: 'none',
                            fontSize: '1.5rem',
                            cursor: 'pointer',
                            color: 'var(--text-muted)',
                        }}
                    >×</button>
                </div>

                {/* Stats Grid */}
                <div style={{ padding: '1.5rem', flex: 1, overflow: 'auto' }}>
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: '1fr 1fr',
                        gap: '1rem',
                        marginBottom: '2rem',
                    }}>
                        <div style={{
                            padding: '1.25rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '12px',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>
                                {stats.filesProcessed}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                Plików przetworzonych
                            </div>
                        </div>
                        <div style={{
                            padding: '1.25rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '12px',
                            textAlign: 'center',
                        }}>
                            <div style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--accent)' }}>
                                {stats.totalOperations}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                Operacji wykonanych
                            </div>
                        </div>
                    </div>

                    {/* Achievements Section */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            🏆 Osiągnięcia
                        </h3>
                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.75rem' }}>
                            {/* Achievement: First file */}
                            <div style={{
                                padding: '1rem',
                                background: stats.filesProcessed >= 1 ? 'rgba(34, 197, 94, 0.1)' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                textAlign: 'center',
                                border: stats.filesProcessed >= 1 ? '1px solid rgba(34, 197, 94, 0.3)' : '1px solid transparent',
                                opacity: stats.filesProcessed >= 1 ? 1 : 0.5,
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🎯</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600 }}>Pierwszy krok</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>1 plik</div>
                            </div>
                            {/* Achievement: 10 files */}
                            <div style={{
                                padding: '1rem',
                                background: stats.filesProcessed >= 10 ? 'rgba(59, 130, 246, 0.1)' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                textAlign: 'center',
                                border: stats.filesProcessed >= 10 ? '1px solid rgba(59, 130, 246, 0.3)' : '1px solid transparent',
                                opacity: stats.filesProcessed >= 10 ? 1 : 0.5,
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>⭐</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600 }}>Początkujący</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>10 plików</div>
                            </div>
                            {/* Achievement: 50 files */}
                            <div style={{
                                padding: '1rem',
                                background: stats.filesProcessed >= 50 ? 'rgba(168, 85, 247, 0.1)' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                textAlign: 'center',
                                border: stats.filesProcessed >= 50 ? '1px solid rgba(168, 85, 247, 0.3)' : '1px solid transparent',
                                opacity: stats.filesProcessed >= 50 ? 1 : 0.5,
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🚀</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600 }}>Zaawansowany</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>50 plików</div>
                            </div>
                            {/* Achievement: 100 files */}
                            <div style={{
                                padding: '1rem',
                                background: stats.filesProcessed >= 100 ? 'rgba(245, 158, 11, 0.1)' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                textAlign: 'center',
                                border: stats.filesProcessed >= 100 ? '1px solid rgba(245, 158, 11, 0.3)' : '1px solid transparent',
                                opacity: stats.filesProcessed >= 100 ? 1 : 0.5,
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>💯</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600 }}>Setka!</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>100 plików</div>
                            </div>
                            {/* Achievement: 5 tools used */}
                            <div style={{
                                padding: '1rem',
                                background: Object.keys(stats.toolUsage).length >= 5 ? 'rgba(236, 72, 153, 0.1)' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                textAlign: 'center',
                                border: Object.keys(stats.toolUsage).length >= 5 ? '1px solid rgba(236, 72, 153, 0.3)' : '1px solid transparent',
                                opacity: Object.keys(stats.toolUsage).length >= 5 ? 1 : 0.5,
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>🎨</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600 }}>Eksplorator</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>5 narzędzi</div>
                            </div>
                            {/* Achievement: 500 files */}
                            <div style={{
                                padding: '1rem',
                                background: stats.filesProcessed >= 500 ? 'linear-gradient(135deg, rgba(245, 158, 11, 0.2), rgba(236, 72, 153, 0.2))' : 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                textAlign: 'center',
                                border: stats.filesProcessed >= 500 ? '1px solid rgba(245, 158, 11, 0.4)' : '1px solid transparent',
                                opacity: stats.filesProcessed >= 500 ? 1 : 0.5,
                            }}>
                                <div style={{ fontSize: '1.5rem', marginBottom: '0.25rem' }}>👑</div>
                                <div style={{ fontSize: '0.7rem', fontWeight: 600 }}>Legenda</div>
                                <div style={{ fontSize: '0.6rem', color: 'var(--text-muted)' }}>500 plików</div>
                            </div>
                        </div>
                    </div>

                    {/* Top Tools */}
                    <div style={{ marginBottom: '1.5rem' }}>
                        <h3 style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            🔥 Najczęściej używane
                        </h3>
                        {topTools.length > 0 ? (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                                {topTools.map(([toolId, count]) => {
                                    const tool = getToolInfo(toolId);
                                    const maxCount = topTools[0][1];
                                    const percent = (count / maxCount) * 100;
                                    return (
                                        <div key={toolId}>
                                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '4px' }}>
                                                <span>{tool.icon} {tool.name}</span>
                                                <span style={{ color: 'var(--text-muted)' }}>{count}×</span>
                                            </div>
                                            <div style={{
                                                height: '6px',
                                                background: 'var(--bg-input)',
                                                borderRadius: '3px',
                                                overflow: 'hidden',
                                            }}>
                                                <div style={{
                                                    width: `${percent}%`,
                                                    height: '100%',
                                                    background: 'var(--accent)',
                                                    borderRadius: '3px',
                                                    transition: 'width 0.5s ease',
                                                }} />
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        ) : (
                            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: '2rem' }}>
                                Brak danych - zacznij używać narzędzi! 🚀
                            </div>
                        )}
                    </div>
                </div>

                {/* Footer */}
                <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                    <button
                        onClick={resetStats}
                        className="btn btn-secondary"
                        style={{ width: '100%' }}
                    >
                        🗑️ Resetuj statystyki
                    </button>
                </div>
            </div>
        </>
    );
}
