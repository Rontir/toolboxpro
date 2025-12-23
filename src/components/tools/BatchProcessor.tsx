'use client';

import { useState, useCallback } from 'react';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

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

    const handleFilesSelected = useCallback((newFiles: File[]) => {
        setFiles(prev => [...prev, ...newFiles]);
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
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Batch Processor"
                description="Automatyzuj pracę z wieloma plikami. Twórz pipeline'y operacji: konwersja, zmiana nazw, kadrowanie i więcej."
                icon="⚡"
            />

            <Section title="1. Wybierz pliki">
                <FileUpload
                    onFilesSelect={handleFilesSelected}
                    accept="image/*"
                    label="Wgraj obrazy do przetworzenia"
                    sublabel="Obsługuje JPG, PNG, WebP"
                    icon="⚡"
                    isLoading={isProcessing}
                    loadingText={isProcessing ? `Przetwarzanie... ${progress}%` : ''}
                />
                {files.length > 0 && (
                    <div className="mt-4 p-4 bg-bg-tertiary rounded-lg border border-border flex justify-between items-center">
                        <span className="text-text-white font-medium">Wybrano {files.length} plików</span>
                        <button onClick={() => setFiles([])} className="text-red-400 hover:text-red-300 text-sm">
                            Wyczyść listę
                        </button>
                    </div>
                )}
            </Section>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Available Operations */}
                <Section title="2. Dostępne operacje">
                    <div className="space-y-4">
                        {Object.entries(groupedOperations).map(([category, ops]) => (
                            <div key={category}>
                                <div className="text-xs text-text-muted mb-2 uppercase tracking-wider font-semibold">
                                    {category}
                                </div>
                                <div className="flex flex-wrap gap-2">
                                    {ops.map(op => (
                                        <button
                                            key={op.id}
                                            onClick={() => addStep(op)}
                                            className="px-3 py-2 bg-bg-tertiary hover:bg-bg-tertiary/80 border border-border rounded-lg text-sm text-text-white flex items-center gap-2 transition-all hover:border-accent"
                                        >
                                            <span>{op.icon}</span>
                                            <span>{op.name}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>

                {/* Pipeline Builder */}
                <Section
                    title={`3. Pipeline (${pipeline.length})`}
                    actions={
                        pipeline.length > 0 && (
                            <button onClick={clearAll} className="text-xs bg-bg-tertiary hover:bg-red-500/20 text-red-400 px-2 py-1 rounded border border-border transition-colors">
                                🗑️ Wyczyść
                            </button>
                        )
                    }
                >
                    {pipeline.length === 0 ? (
                        <div className="text-center py-12 text-text-muted border-2 border-dashed border-border rounded-lg">
                            <div className="text-4xl mb-3 opacity-50">📋</div>
                            <div>Kliknij operację po lewej aby dodać do kolejki</div>
                        </div>
                    ) : (
                        <div className="space-y-2">
                            {pipeline.map((step, index) => (
                                <div
                                    key={step.id}
                                    className={`flex items-center gap-3 p-3 rounded-lg border transition-all ${step.status === 'processing' ? 'bg-blue-500/10 border-blue-500/40' :
                                            step.status === 'done' ? 'bg-green-500/10 border-green-500/40' :
                                                step.status === 'error' ? 'bg-red-500/10 border-red-500/40' :
                                                    'bg-bg-tertiary border-border'
                                        }`}
                                >
                                    <span className="text-sm text-text-muted font-mono w-6">
                                        {index + 1}.
                                    </span>
                                    <span className="text-xl">{step.toolIcon}</span>
                                    <span className="flex-1 text-sm font-medium text-text-white">{step.toolName}</span>

                                    {step.status === 'processing' && <span className="animate-spin">⏳</span>}
                                    {step.status === 'done' && <span>✅</span>}
                                    {step.status === 'error' && <span>❌</span>}

                                    {!isProcessing && (
                                        <div className="flex gap-1">
                                            <button
                                                onClick={() => moveStep(step.id, 'up')}
                                                disabled={index === 0}
                                                className="p-1 text-text-muted hover:text-text-white disabled:opacity-30"
                                            >↑</button>
                                            <button
                                                onClick={() => moveStep(step.id, 'down')}
                                                disabled={index === pipeline.length - 1}
                                                className="p-1 text-text-muted hover:text-text-white disabled:opacity-30"
                                            >↓</button>
                                            <button
                                                onClick={() => removeStep(step.id)}
                                                className="p-1 text-red-400 hover:text-red-300"
                                            >×</button>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </Section>
            </div>

            {/* Progress Bar */}
            {isProcessing && (
                <div className="w-full bg-bg-tertiary rounded-full h-2.5 mb-4">
                    <div className="bg-accent h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 flex-wrap">
                <button
                    onClick={runPipeline}
                    disabled={pipeline.length === 0 || files.length === 0 || isProcessing}
                    className="btn btn-primary flex-1 py-4 text-lg"
                >
                    {isProcessing ? `⏳ Przetwarzanie... ${progress}%` : `▶️ Uruchom pipeline (${files.length} plików)`}
                </button>
                {pipeline.some(s => s.status === 'done') && !isProcessing && (
                    <button className="btn btn-secondary w-full md:w-auto">
                        📦 Pobierz wyniki
                    </button>
                )}
            </div>

            {/* Success Message */}
            {pipeline.every(s => s.status === 'done') && pipeline.length > 0 && !isProcessing && (
                <div className="p-6 bg-green-500/10 border border-green-500/30 rounded-lg text-center">
                    <div className="text-3xl mb-2">✅</div>
                    <div className="text-green-400 font-bold text-lg">Pipeline zakończony pomyślnie!</div>
                    <div className="text-text-muted text-sm mt-1">
                        Przetworzono {files.length} plików przez {pipeline.length} kroków
                    </div>
                </div>
            )}
        </div>
    );
}
