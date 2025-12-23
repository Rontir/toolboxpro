'use client';

import { createContext, useContext, useState, ReactNode, useCallback, useMemo } from 'react';
import { useDragReorder, DragHandle } from '@/hooks/useDragReorder';

export type JobStatus = 'pending' | 'processing' | 'done' | 'error';

export interface QueueJob {
    id: string;
    toolId: string;
    toolName: string;
    toolIcon: string;
    files: string[];
    status: JobStatus;
    progress: number;
    result?: string;
    error?: string;
    createdAt: Date;
    completedAt?: Date;
    [key: string]: any;
}

interface QueueContextType {
    jobs: QueueJob[];
    addJob: (job: Omit<QueueJob, 'id' | 'status' | 'progress' | 'createdAt'>) => string;
    updateJob: (id: string, updates: Partial<QueueJob>) => void;
    removeJob: (id: string) => void;
    clearCompleted: () => void;
    cancelJob: (id: string) => void;
    retryJob: (id: string) => void;
    reorderJobs: (newJobs: QueueJob[]) => void;
}

const QueueContext = createContext<QueueContextType | undefined>(undefined);

export function QueueProvider({ children }: { children: ReactNode }) {
    const [jobs, setJobs] = useState<QueueJob[]>([]);

    const addJob = useCallback((job: Omit<QueueJob, 'id' | 'status' | 'progress' | 'createdAt'>) => {
        const id = `job-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
        const newJob: QueueJob = {
            ...job,
            id,
            status: 'pending',
            progress: 0,
            createdAt: new Date(),
        } as QueueJob;
        setJobs(prev => [...prev, newJob]);
        return id;
    }, []);

    const updateJob = useCallback((id: string, updates: Partial<QueueJob>) => {
        setJobs(prev => prev.map(job =>
            job.id === id ? { ...job, ...updates } : job
        ));
    }, []);

    const removeJob = useCallback((id: string) => {
        setJobs(prev => prev.filter(job => job.id !== id));
    }, []);

    const clearCompleted = useCallback(() => {
        setJobs(prev => prev.filter(job => job.status !== 'done' && job.status !== 'error'));
    }, []);

    const cancelJob = useCallback((id: string) => {
        setJobs(prev => prev.map(job =>
            job.id === id && (job.status === 'pending' || job.status === 'processing')
                ? { ...job, status: 'error' as JobStatus, error: 'Anulowano przez użytkownika' }
                : job
        ));
    }, []);

    const retryJob = useCallback((id: string) => {
        setJobs(prev => prev.map(job =>
            job.id === id && job.status === 'error'
                ? { ...job, status: 'pending' as JobStatus, progress: 0, error: undefined }
                : job
        ));
    }, []);

    const reorderJobs = useCallback((newJobs: QueueJob[]) => {
        setJobs(newJobs);
    }, []);

    return (
        <QueueContext.Provider value={{ jobs, addJob, updateJob, removeJob, clearCompleted, cancelJob, retryJob, reorderJobs }}>
            {children}
        </QueueContext.Provider>
    );
}

export function useQueue() {
    const context = useContext(QueueContext);
    if (!context) {
        throw new Error('useQueue must be used within QueueProvider');
    }
    return context;
}

interface QueuePanelProps {
    isOpen: boolean;
    onClose: () => void;
}

export function QueuePanel({ isOpen, onClose }: QueuePanelProps) {
    const { jobs, removeJob, clearCompleted, cancelJob, retryJob, reorderJobs } = useQueue();
    const { getDragHandleProps, getItemStyle } = useDragReorder({
        items: jobs,
        onReorder: reorderJobs
    });

    if (!isOpen) return null;

    const getStatusColor = (status: JobStatus) => {
        switch (status) {
            case 'pending': return 'var(--text-muted)';
            case 'processing': return '#3b82f6';
            case 'done': return 'var(--accent)';
            case 'error': return '#ef4444';
        }
    };

    const getStatusIcon = (status: JobStatus) => {
        switch (status) {
            case 'pending': return '⏳';
            case 'processing': return '⚡';
            case 'done': return '✅';
            case 'error': return '❌';
        }
    };

    const pendingCount = jobs.filter(j => j.status === 'pending' || j.status === 'processing').length;

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
                }}
            />
            {/* Panel */}
            <div
                style={{
                    position: 'fixed',
                    top: 0,
                    right: 0,
                    width: '450px',
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
                    <div>
                        <h2 style={{ fontSize: '1.25rem', fontWeight: 700 }}>📋 Kolejka zadań</h2>
                        {pendingCount > 0 && (
                            <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                {pendingCount} w trakcie
                            </span>
                        )}
                    </div>
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

                {/* Jobs List */}
                <div style={{ flex: 1, overflow: 'auto', padding: '1rem' }}>
                    {jobs.length === 0 ? (
                        <div style={{
                            textAlign: 'center',
                            padding: '3rem 1rem',
                            color: 'var(--text-muted)',
                        }}>
                            <span style={{ fontSize: '3rem', display: 'block', marginBottom: '1rem' }}>📭</span>
                            <p>Brak zadań w kolejce</p>
                            <p style={{ fontSize: '0.875rem', marginTop: '0.5rem' }}>
                                Dodaj pliki do przetworzenia
                            </p>
                        </div>
                    ) : (
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                            {jobs.map(job => (
                                <div
                                    key={job.id}
                                    style={{
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '12px',
                                        padding: '1rem',
                                        border: '1px solid var(--border)',
                                        position: 'relative',
                                        ...getItemStyle(job)
                                    }}
                                >
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
                                        <div {...getDragHandleProps(job)}>
                                            <DragHandle />
                                        </div>
                                        <span style={{ fontSize: '1.5rem' }}>{job.toolIcon}</span>
                                        <div style={{ flex: 1 }}>
                                            <div style={{ fontWeight: 600 }}>{job.toolName}</div>
                                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                                {job.files.length} plik(ów)
                                            </div>
                                        </div>
                                        <span style={{ color: getStatusColor(job.status) }}>
                                            {getStatusIcon(job.status)}
                                        </span>
                                        {/* Cancel button - for pending/processing jobs */}
                                        {(job.status === 'pending' || job.status === 'processing') && (
                                            <button
                                                onClick={() => cancelJob(job.id)}
                                                style={{
                                                    background: 'rgba(239, 68, 68, 0.1)',
                                                    border: '1px solid rgba(239, 68, 68, 0.3)',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    color: '#ef4444',
                                                    fontSize: '0.75rem',
                                                    padding: '4px 8px',
                                                }}
                                                title="Anuluj"
                                            >⏹️ Anuluj</button>
                                        )}
                                        {/* Retry button - for failed jobs */}
                                        {job.status === 'error' && (
                                            <button
                                                onClick={() => retryJob(job.id)}
                                                style={{
                                                    background: 'rgba(59, 130, 246, 0.1)',
                                                    border: '1px solid rgba(59, 130, 246, 0.3)',
                                                    borderRadius: '6px',
                                                    cursor: 'pointer',
                                                    color: '#3b82f6',
                                                    fontSize: '0.75rem',
                                                    padding: '4px 8px',
                                                }}
                                                title="Ponów"
                                            >🔄 Ponów</button>
                                        )}
                                        <button
                                            onClick={() => removeJob(job.id)}
                                            style={{
                                                background: 'none',
                                                border: 'none',
                                                cursor: 'pointer',
                                                color: 'var(--text-muted)',
                                                fontSize: '1rem',
                                            }}
                                            title="Usuń"
                                        >🗑️</button>
                                    </div>

                                    {/* Progress bar */}
                                    {job.status === 'processing' && (
                                        <div style={{
                                            height: '4px',
                                            background: 'var(--bg-input)',
                                            borderRadius: '2px',
                                            overflow: 'hidden',
                                        }}>
                                            <div style={{
                                                width: `${job.progress}%`,
                                                height: '100%',
                                                background: '#3b82f6',
                                                transition: 'width 0.3s ease',
                                            }} />
                                        </div>
                                    )}

                                    {/* Error message */}
                                    {job.error && (
                                        <div style={{
                                            marginTop: '0.5rem',
                                            padding: '0.5rem',
                                            background: 'rgba(239, 68, 68, 0.1)',
                                            borderRadius: '6px',
                                            fontSize: '0.75rem',
                                            color: '#ef4444',
                                        }}>
                                            {job.error}
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </div>

                {/* Footer */}
                {jobs.length > 0 && (
                    <div style={{ padding: '1rem 1.5rem', borderTop: '1px solid var(--border)' }}>
                        <button
                            onClick={clearCompleted}
                            className="btn btn-secondary"
                            style={{ width: '100%' }}
                        >
                            🧹 Wyczyść ukończone
                        </button>
                    </div>
                )}
            </div>
        </>
    );
}
