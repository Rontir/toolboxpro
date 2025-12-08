'use client';

import { useState, useEffect } from 'react';

export interface UploadFile {
    name: string;
    size: number;
    progress: number;
    status: 'pending' | 'uploading' | 'complete' | 'error';
    error?: string;
}

interface UploadProgressProps {
    files: UploadFile[];
    onCancel?: (fileName: string) => void;
    onRetry?: (fileName: string) => void;
}

const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export function UploadProgress({ files, onCancel, onRetry }: UploadProgressProps) {
    if (files.length === 0) return null;

    const totalFiles = files.length;
    const completedFiles = files.filter(f => f.status === 'complete').length;
    const hasErrors = files.some(f => f.status === 'error');
    const isAllComplete = completedFiles === totalFiles;

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
                    {isAllComplete ? '✅ Przesłano' : '📤 Przesyłanie...'} {completedFiles}/{totalFiles}
                </span>
                {hasErrors && (
                    <span style={{ fontSize: '0.75rem', color: '#ef4444' }}>
                        ⚠️ Błędy
                    </span>
                )}
            </div>

            {/* Overall Progress */}
            <div style={{
                height: '6px',
                background: 'var(--bg-input)',
                borderRadius: '3px',
                overflow: 'hidden',
                marginBottom: '1rem',
            }}>
                <div style={{
                    width: `${(completedFiles / totalFiles) * 100}%`,
                    height: '100%',
                    background: hasErrors ? '#f59e0b' : 'var(--accent)',
                    borderRadius: '3px',
                    transition: 'width 0.3s ease',
                }} />
            </div>

            {/* Individual Files */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', maxHeight: '200px', overflow: 'auto' }}>
                {files.map((file, i) => (
                    <div
                        key={i}
                        style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '0.75rem',
                            padding: '0.5rem',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            fontSize: '0.875rem',
                        }}
                    >
                        {/* Status Icon */}
                        <span style={{ fontSize: '1rem' }}>
                            {file.status === 'complete' && '✅'}
                            {file.status === 'uploading' && '⏳'}
                            {file.status === 'pending' && '⏸️'}
                            {file.status === 'error' && '❌'}
                        </span>

                        {/* File Info */}
                        <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                            }}>
                                {file.name}
                            </div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                                {formatSize(file.size)}
                                {file.status === 'uploading' && ` • ${file.progress}%`}
                                {file.error && <span style={{ color: '#ef4444' }}> • {file.error}</span>}
                            </div>
                        </div>

                        {/* Progress bar for uploading files */}
                        {file.status === 'uploading' && (
                            <div style={{
                                width: '60px',
                                height: '4px',
                                background: 'var(--bg-input)',
                                borderRadius: '2px',
                                overflow: 'hidden',
                            }}>
                                <div style={{
                                    width: `${file.progress}%`,
                                    height: '100%',
                                    background: '#3b82f6',
                                    transition: 'width 0.2s ease',
                                }} />
                            </div>
                        )}

                        {/* Actions */}
                        {file.status === 'error' && onRetry && (
                            <button
                                onClick={() => onRetry(file.name)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--accent)',
                                    fontSize: '0.875rem',
                                }}
                            >🔄</button>
                        )}
                        {file.status !== 'complete' && onCancel && (
                            <button
                                onClick={() => onCancel(file.name)}
                                style={{
                                    background: 'none',
                                    border: 'none',
                                    cursor: 'pointer',
                                    color: 'var(--text-muted)',
                                    fontSize: '0.875rem',
                                }}
                            >✕</button>
                        )}
                    </div>
                ))}
            </div>
        </div>
    );
}

// Hook to manage upload progress
export function useUploadProgress() {
    const [files, setFiles] = useState<UploadFile[]>([]);

    const addFiles = (newFiles: File[]) => {
        const uploadFiles: UploadFile[] = newFiles.map(f => ({
            name: f.name,
            size: f.size,
            progress: 0,
            status: 'pending',
        }));
        setFiles(prev => [...prev, ...uploadFiles]);
    };

    const updateProgress = (fileName: string, progress: number) => {
        setFiles(prev => prev.map(f =>
            f.name === fileName
                ? { ...f, progress, status: progress >= 100 ? 'complete' : 'uploading' }
                : f
        ));
    };

    const setError = (fileName: string, error: string) => {
        setFiles(prev => prev.map(f =>
            f.name === fileName ? { ...f, status: 'error', error } : f
        ));
    };

    const removeFile = (fileName: string) => {
        setFiles(prev => prev.filter(f => f.name !== fileName));
    };

    const clearCompleted = () => {
        setFiles(prev => prev.filter(f => f.status !== 'complete'));
    };

    const reset = () => setFiles([]);

    return { files, addFiles, updateProgress, setError, removeFile, clearCompleted, reset };
}
