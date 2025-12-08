'use client';

import { useState, useEffect, useRef } from 'react';
import { useDroppedFile } from './DroppedFileContext';

interface Tool {
    id: string;
    icon: string;
    name: string;
    desc: string;
    accepts?: string[];
}

interface GlobalDragDropProps {
    tools: Tool[];
    currentTool: string;
    onSelectTool: (toolId: string) => void;
}

export function GlobalDragDrop({ tools, currentTool, onSelectTool }: GlobalDragDropProps) {
    const [isDragging, setIsDragging] = useState(false);
    const [droppedFileLocal, setDroppedFileLocal] = useState<File | null>(null);
    const [showToolSelector, setShowToolSelector] = useState(false);
    const { setDroppedFile } = useDroppedFile();

    // Only enable on Dashboard
    const isOnDashboard = currentTool === 'dashboard';

    useEffect(() => {
        if (!isOnDashboard) return;

        const handleDragEnter = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.dataTransfer?.types.includes('Files')) {
                setIsDragging(true);
            }
        };

        const handleDragLeave = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            if (e.relatedTarget === null) {
                setIsDragging(false);
            }
        };

        const handleDragOver = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
        };

        const handleDrop = (e: DragEvent) => {
            e.preventDefault();
            e.stopPropagation();
            setIsDragging(false);

            if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
                const file = e.dataTransfer.files[0];
                setDroppedFileLocal(file);
                setShowToolSelector(true);
            }
        };

        window.addEventListener('dragenter', handleDragEnter);
        window.addEventListener('dragleave', handleDragLeave);
        window.addEventListener('dragover', handleDragOver);
        window.addEventListener('drop', handleDrop);

        return () => {
            window.removeEventListener('dragenter', handleDragEnter);
            window.removeEventListener('dragleave', handleDragLeave);
            window.removeEventListener('dragover', handleDragOver);
            window.removeEventListener('drop', handleDrop);
        };
    }, [isOnDashboard]);

    const handleSelectTool = (toolId: string) => {
        if (droppedFileLocal) {
            // Set file in context so tool can consume it
            setDroppedFile(droppedFileLocal);
            // Navigate to tool
            onSelectTool(toolId);
            // Close modal
            setShowToolSelector(false);
            setDroppedFileLocal(null);
        }
    };

    const handleClose = () => {
        setShowToolSelector(false);
        setDroppedFileLocal(null);
    };

    // Get file extension for matching
    const getFileExtension = (filename: string) => {
        return filename.split('.').pop()?.toLowerCase() || '';
    };

    // Filter tools that can handle this file type
    const getCompatibleTools = () => {
        if (!droppedFileLocal) return tools.filter(t => t.id !== 'dashboard');

        const ext = getFileExtension(droppedFileLocal.name);
        const allTools = tools.filter(t => t.id !== 'dashboard');

        // Simple file type matching
        const excelTools = ['piko-empiko', 'excel-splitter', 'ean-checker', 'struktur', 'compare', 'joiner', 'emoji-remover'];
        const imageTools = ['image-converter', 'cropper'];
        const htmlTools = ['html-fixer', 'desc-html'];
        const jsonTools = ['json-html', 'perfume'];

        if (['xlsx', 'xls', 'csv'].includes(ext)) {
            return allTools.filter(t => excelTools.includes(t.id));
        }
        if (['jpg', 'jpeg', 'png', 'webp', 'gif', 'bmp'].includes(ext)) {
            return allTools.filter(t => imageTools.includes(t.id));
        }
        if (['html', 'htm'].includes(ext)) {
            return allTools.filter(t => htmlTools.includes(t.id));
        }
        if (['json'].includes(ext)) {
            return allTools.filter(t => jsonTools.includes(t.id));
        }

        // Return all tools if unknown type
        return allTools;
    };

    // Mouse tracking for glow effect
    const handleMouseMove = (e: React.MouseEvent<HTMLButtonElement>) => {
        const card = e.currentTarget;
        const rect = card.getBoundingClientRect();
        const x = ((e.clientX - rect.left) / rect.width) * 100;
        const y = ((e.clientY - rect.top) / rect.height) * 100;
        card.style.setProperty('--mouse-x', `${x}%`);
        card.style.setProperty('--mouse-y', `${y}%`);
    };

    if (!isOnDashboard) return null;

    // Drag overlay
    if (isDragging) {
        return (
            <div style={{
                position: 'fixed',
                inset: 0,
                background: 'rgba(0, 0, 0, 0.85)',
                backdropFilter: 'blur(8px)',
                zIndex: 9999,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexDirection: 'column',
                gap: '1.5rem',
                animation: 'spotlight-fade-in 0.2s ease-out'
            }}>
                <div style={{
                    fontSize: '5rem',
                    animation: 'bounce 1s infinite',
                    filter: 'drop-shadow(0 0 20px var(--accent))'
                }}>📂</div>
                <h2 style={{ fontSize: '2rem', fontWeight: 700, color: 'var(--text-white)' }}>
                    Upuść plik tutaj
                </h2>
                <p style={{ color: 'var(--text-muted)' }}>
                    Wybierzesz narzędzie do przetworzenia
                </p>
            </div>
        );
    }

    // Tool selector modal
    if (showToolSelector && droppedFileLocal) {
        const compatibleTools = getCompatibleTools();

        return (
            <div
                style={{
                    position: 'fixed',
                    inset: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    backdropFilter: 'blur(12px)',
                    zIndex: 9999,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    animation: 'spotlight-fade-in 0.2s ease-out'
                }}
                onClick={handleClose}
            >
                <div
                    style={{
                        background: 'var(--bg-card)',
                        border: '1px solid var(--border)',
                        borderRadius: '16px',
                        padding: '2rem',
                        maxWidth: '700px',
                        width: '90%',
                        maxHeight: '80vh',
                        overflow: 'auto',
                        animation: 'spotlight-scale-in 0.3s ease-out',
                        boxShadow: '0 20px 60px rgba(0, 0, 0, 0.5)'
                    }}
                    onClick={e => e.stopPropagation()}
                >
                    {/* Header */}
                    <div style={{ marginBottom: '1.5rem', textAlign: 'center' }}>
                        <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem' }}>📄</div>
                        <h2 style={{
                            fontSize: '1.5rem',
                            fontWeight: 700,
                            marginBottom: '0.5rem',
                            color: 'var(--text-white)'
                        }}>
                            Wybierz narzędzie
                        </h2>
                        <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                            Plik: <strong style={{ color: 'var(--accent)' }}>{droppedFileLocal.name}</strong>
                        </p>
                    </div>

                    {/* Tool Grid */}
                    <div style={{
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                        gap: '1rem'
                    }}>
                        {compatibleTools.map((tool, index) => (
                            <button
                                key={tool.id}
                                onClick={() => handleSelectTool(tool.id)}
                                onMouseMove={handleMouseMove}
                                className="card"
                                style={{
                                    padding: '1.25rem',
                                    cursor: 'pointer',
                                    display: 'flex',
                                    flexDirection: 'column',
                                    alignItems: 'center',
                                    gap: '0.75rem',
                                    background: 'var(--bg-tertiary)',
                                    border: '1px solid var(--border)',
                                    borderRadius: '12px',
                                    textAlign: 'center',
                                    animation: `spotlight-slide-up 0.3s ease-out ${index * 0.05}s both`
                                }}
                            >
                                <span style={{ fontSize: '2rem', position: 'relative', zIndex: 1 }}>{tool.icon}</span>
                                <span style={{ fontWeight: 600, color: 'var(--text-white)', position: 'relative', zIndex: 1 }}>{tool.name}</span>
                            </button>
                        ))}
                    </div>

                    {/* Cancel button */}
                    <div style={{ marginTop: '1.5rem', textAlign: 'center' }}>
                        <button
                            onClick={handleClose}
                            style={{
                                padding: '0.5rem 1.5rem',
                                background: 'transparent',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: 'var(--text-muted)',
                                cursor: 'pointer',
                                fontSize: '0.9rem'
                            }}
                        >
                            Anuluj
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return null;
}
