'use client';

import { useState, useCallback } from 'react';

interface PipelineStep {
    id: string;
    toolId: string;
    toolName: string;
    toolIcon: string;
    config: Record<string, unknown>;
    status: 'pending' | 'processing' | 'done' | 'error';
    result?: string;
}

const AVAILABLE_OPERATIONS = [
    { id: 'convert-webp', name: 'Konwertuj do WebP', icon: '🖼️', category: 'Image' },
    { id: 'convert-jpg', name: 'Konwertuj do JPG', icon: '🖼️', category: 'Image' },
    { id: 'convert-png', name: 'Konwertuj do PNG', icon: '🖼️', category: 'Image' },
    { id: 'crop-allegro', name: 'Kadruj (Allegro 1:1)', icon: '✂️', category: 'Image' },
    { id: 'crop-shopify', name: 'Kadruj (Shopify 4:5)', icon: '✂️', category: 'Image' },
    { id: 'rename-prefix', name: 'Dodaj prefix', icon: '✏️', category: 'Rename' },
    { id: 'rename-suffix', name: 'Dodaj suffix', icon: '✏️', category: 'Rename' },
    { id: 'rename-sequence', name: 'Numeruj sekwencyjnie', icon: '🔢', category: 'Rename' },
];

export default function BatchProcessor() {
    const [pipeline, setPipeline] = useState<PipelineStep[]>([]);
    const [files, setFiles] = useState<File[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [currentStep, setCurrentStep] = useState<number>(-1);
    const [isDragging, setIsDragging] = useState(false);
    const [progress, setProgress] = useState(0);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;
        setFiles(prev => [...prev, ...Array.from(selectedFiles)]);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = e.dataTransfer.files;
        if (!droppedFiles.length) return;
        setFiles(prev => [...prev, ...Array.from(droppedFiles)]);
    }, []);

    const addStep = useCallback((operation: typeof AVAILABLE_OPERATIONS[0]) => {
        const newStep: PipelineStep = {
            id: `step-${Date.now()}`,
            toolId: operation.id,
            toolName: operation.name,
            toolIcon: operation.icon,
            config: {},
            status: 'pending',
        };
        setPipeline(prev => [...prev, newStep]);
    }, []);

    const removeStep = useCallback((stepId: string) => {
        setPipeline(prev => prev.filter(s => s.id !== stepId));
    }, []);

    const moveStep = useCallback((stepId: string, direction: 'up' | 'down') => {
        setPipeline(prev => {
            const index = prev.findIndex(s => s.id === stepId);
            if (index === -1) return prev;
            if (direction === 'up' && index === 0) return prev;
            if (direction === 'down' && index === prev.length - 1) return prev;

            const newPipeline = [...prev];
            const swapIndex = direction === 'up' ? index - 1 : index + 1;
            [newPipeline[index], newPipeline[swapIndex]] = [newPipeline[swapIndex], newPipeline[index]];
            return newPipeline;
        });
    }, []);

    const runPipeline = useCallback(async () => {
        if (pipeline.length === 0 || files.length === 0) return;

        setIsProcessing(true);
        setProgress(0);
        setPipeline(prev => prev.map(s => ({ ...s, status: 'pending' as const })));

        for (let i = 0; i < pipeline.length; i++) {
            setCurrentStep(i);
            setPipeline(prev => prev.map((s, idx) =>
                idx === i ? { ...s, status: 'processing' as const } : s
            ));

            // Simulate processing
            await new Promise(resolve => setTimeout(resolve, 800 + Math.random() * 700));
            setProgress(Math.round(((i + 1) / pipeline.length) * 100));

            setPipeline(prev => prev.map((s, idx) =>
                idx === i ? { ...s, status: 'done' as const, result: `${files.length} plików` } : s
            ));
        }

        setCurrentStep(-1);
        setIsProcessing(false);
    }, [pipeline, files]);

    const clearAll = useCallback(() => {
        setPipeline([]);
        setFiles([]);
        setProgress(0);
    }, []);

    const groupedOperations = AVAILABLE_OPERATIONS.reduce((acc, op) => {
        if (!acc[op.category]) acc[op.category] = [];
        acc[op.category].push(op);
        return acc;
    }, {} as Record<string, typeof AVAILABLE_OPERATIONS>);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* File Drop Zone */}
            <div
                className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
            >
                <input
                    type="file"
                    multiple
                    accept="image/*"
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="batch-processor-input"
                />
                <label htmlFor="batch-processor-input" style={{ cursor: 'pointer', display: 'block' }}>
                    <span className="icon">⚡</span>
                    <p className="title">
                        {files.length > 0 ? `${files.length} plików wybranych` : 'Przeciągnij obrazy tutaj'}
                    </p>
                    <p className="subtitle">lub kliknij aby wybrać pliki do przetworzenia</p>
                </label>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Available Operations */}
                <div className="card">
                    <div className="card-header">
                        <span>🛠️ Dostępne operacje</span>
                    </div>
                    <div className="card-body">
                        {Object.entries(groupedOperations).map(([category, ops]) => (
                            <div key={category} style={{ marginBottom: '1rem' }}>
                                <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.5rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                                    {category}
                                </div>
                                <div className="filter-pills">
                                    {ops.map(op => (
                                        <button
                                            key={op.id}
                                            onClick={() => addStep(op)}
                                            className="filter-pill"
                                        >
                                            {op.icon} {op.name}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Pipeline Builder */}
                <div className="card">
                    <div className="card-header">
                        <span>⚡ Pipeline ({pipeline.length} kroków)</span>
                        {pipeline.length > 0 && (
                            <button onClick={clearAll} className="btn btn-secondary" style={{ fontSize: '0.7rem', padding: '0.25rem 0.5rem' }}>
                                🗑️ Wyczyść
                            </button>
                        )}
                    </div>
                    <div className="card-body">
                        {pipeline.length === 0 ? (
                            <div style={{ textAlign: 'center', padding: '2rem', color: 'var(--text-muted)' }}>
                                <div style={{ fontSize: '2.5rem', marginBottom: '0.75rem', opacity: 0.5 }}>📋</div>
                                <div>Kliknij operację po lewej aby dodać</div>
                            </div>
                        ) : (
                            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                                {pipeline.map((step, index) => (
                                    <div
                                        key={step.id}
                                        className={`pipeline-step ${step.status}`}
                                        style={{
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: '0.75rem',
                                            padding: '0.75rem 1rem',
                                            background: step.status === 'processing' ? 'rgba(59, 130, 246, 0.15)' :
                                                step.status === 'done' ? 'rgba(34, 197, 94, 0.15)' :
                                                    step.status === 'error' ? 'rgba(239, 68, 68, 0.15)' : 'var(--bg-tertiary)',
                                            borderRadius: '10px',
                                            border: step.status === 'processing' ? '1px solid rgba(59, 130, 246, 0.4)' :
                                                step.status === 'done' ? '1px solid rgba(34, 197, 94, 0.4)' : '1px solid transparent',
                                            transition: 'all 0.3s var(--butter-ease)',
                                        }}
                                    >
                                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)', width: '24px', fontWeight: 600 }}>
                                            {index + 1}.
                                        </span>
                                        <span style={{ fontSize: '1.25rem' }}>{step.toolIcon}</span>
                                        <span style={{ flex: 1, fontSize: '0.875rem', fontWeight: 500 }}>{step.toolName}</span>

                                        {step.status === 'processing' && <span className="loading-spinner" style={{ color: '#3b82f6' }}>⏳</span>}
                                        {step.status === 'done' && <span style={{ color: '#22c55e' }}>✅</span>}
                                        {step.status === 'error' && <span style={{ color: '#ef4444' }}>❌</span>}

                                        {!isProcessing && (
                                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                                                <button
                                                    onClick={() => moveStep(step.id, 'up')}
                                                    className="icon-btn"
                                                    disabled={index === 0}
                                                    style={{ opacity: index === 0 ? 0.3 : 1 }}
                                                >↑</button>
                                                <button
                                                    onClick={() => moveStep(step.id, 'down')}
                                                    className="icon-btn"
                                                    disabled={index === pipeline.length - 1}
                                                    style={{ opacity: index === pipeline.length - 1 ? 0.3 : 1 }}
                                                >↓</button>
                                                <button
                                                    onClick={() => removeStep(step.id)}
                                                    className="icon-btn"
                                                    style={{ color: '#ef4444' }}
                                                >×</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                            </div>
                        )}
                    </div>
                </div>
            </div>

            {/* Progress Bar */}
            {isProcessing && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-gray)' }}>Przetwarzanie kroku {currentStep + 1}/{pipeline.length}...</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{progress}%</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                <button
                    onClick={runPipeline}
                    disabled={pipeline.length === 0 || files.length === 0 || isProcessing}
                    className="btn btn-primary"
                >
                    {isProcessing ? `⏳ ${progress}%` : `▶️ Uruchom pipeline (${files.length} plików)`}
                </button>
                {pipeline.some(s => s.status === 'done') && !isProcessing && (
                    <button className="btn btn-secondary">
                        📦 Pobierz wyniki
                    </button>
                )}
            </div>

            {/* Success Message */}
            {pipeline.every(s => s.status === 'done') && pipeline.length > 0 && !isProcessing && (
                <div className="card" style={{ background: 'rgba(34, 197, 94, 0.1)', border: '1px solid rgba(34, 197, 94, 0.3)' }}>
                    <div className="card-body" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>✅</div>
                        <div style={{ fontSize: '1rem', fontWeight: 600, color: '#22c55e' }}>Pipeline zakończony pomyślnie!</div>
                        <div style={{ fontSize: '0.875rem', color: 'var(--text-gray)', marginTop: '0.25rem' }}>
                            Przetworzono {files.length} plików przez {pipeline.length} kroków
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
