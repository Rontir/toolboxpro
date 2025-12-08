'use client';

import { useState, useCallback } from 'react';
import { PIKO_MODES, DEFAULT_PIKO_OPTIONS, BATCH_SIZE_PRESETS, RESOLUTION_PRESETS, type PikoOptions, type ExcelPreview, type LogEntry } from '@/lib/types';

// Mode Card Component
function ModeCard({ mode, isActive, onClick }: {
    mode: typeof PIKO_MODES[0];
    isActive: boolean;
    onClick: () => void;
}) {
    return (
        <button
            onClick={onClick}
            className={`mode-card ${isActive ? 'active text-white' : 'text-slate-400'}`}
        >
            <span className="text-xl">{mode.icon}</span>
            <span className="text-[10px] font-semibold text-center leading-tight">{mode.title}</span>
            <span className="text-[9px] text-slate-500 text-center">{mode.description}</span>
        </button>
    );
}

// File Upload Zone
function FileUploadZone({
    onFileSelect,
    fileName,
    accept = '.xlsx,.xls'
}: {
    onFileSelect: (file: File) => void;
    fileName?: string;
    accept?: string;
}) {
    const [isDragging, setIsDragging] = useState(false);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const file = e.dataTransfer.files[0];
        if (file) onFileSelect(file);
    }, [onFileSelect]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) onFileSelect(file);
    };

    return (
        <div
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            className={`
        glass-panel p-4 text-center cursor-pointer transition-all
        ${isDragging ? 'border-blue-500 bg-blue-500/10' : ''}
        ${fileName ? 'border-green-500/50' : ''}
      `}
        >
            <input type="file" accept={accept} onChange={handleChange} className="hidden" id="file-input" />
            <label htmlFor="file-input" className="cursor-pointer block">
                <div className="text-2xl mb-1">{fileName ? '✅' : '📥'}</div>
                <p className="text-xs text-slate-300">{fileName || 'Przeciągnij plik Excel'}</p>
                <p className="text-[10px] text-slate-500">lub kliknij aby wybrać</p>
            </label>
        </div>
    );
}

// Excel Preview Table
function ExcelPreviewTable({ preview }: { preview: ExcelPreview }) {
    return (
        <div className="glass-panel overflow-hidden">
            <div className="flex justify-between items-center px-3 py-2 bg-blue-500/10 border-b border-blue-500/20">
                <span className="text-blue-400 font-semibold text-xs">📊 Podgląd Excel</span>
                <span className="text-slate-500 text-[10px]">{preview.totalRows} wierszy</span>
            </div>
            <div className="max-h-32 overflow-auto">
                <table className="w-full text-[10px]">
                    <thead>
                        <tr>
                            {preview.headers.map((h, i) => (
                                <th key={i} className="sticky top-0 bg-slate-900/95 px-2 py-1.5 text-left font-semibold text-slate-300 whitespace-nowrap border-b border-blue-500/20">
                                    {h}
                                </th>
                            ))}
                        </tr>
                    </thead>
                    <tbody>
                        {preview.rows.map((row, i) => (
                            <tr key={i} className="hover:bg-blue-500/10">
                                {row.map((cell, j) => (
                                    <td key={j} className="px-2 py-1 text-slate-400 max-w-[150px] truncate border-b border-slate-700/30">
                                        {String(cell ?? '')}
                                    </td>
                                ))}
                            </tr>
                        ))}
                    </tbody>
                </table>
            </div>
        </div>
    );
}

// Options Panel
function OptionsPanel({ options, onChange }: {
    options: PikoOptions;
    onChange: (opts: Partial<PikoOptions>) => void;
}) {
    const [isOpen, setIsOpen] = useState(true);

    return (
        <div className="glass-panel overflow-hidden">
            <button
                onClick={() => setIsOpen(!isOpen)}
                className="w-full flex justify-between items-center px-3 py-2 bg-blue-500/10 border-b border-blue-500/20"
            >
                <span className="text-blue-400 font-semibold text-xs">⚙️ Opcje</span>
                <span className="text-slate-500 text-xs">{isOpen ? '▼' : '▶'}</span>
            </button>

            {isOpen && (
                <div className="p-3 space-y-3 text-xs">
                    {/* Column settings */}
                    <div className="grid grid-cols-3 gap-2">
                        <input
                            type="text"
                            value={options.colIndex}
                            onChange={(e) => onChange({ colIndex: e.target.value })}
                            placeholder="Kolumna indeksu"
                            className="bg-slate-900/80 border border-blue-500/20 rounded px-2 py-1.5 text-[11px] text-slate-200 focus:border-blue-500 focus:outline-none"
                        />
                        <input
                            type="text"
                            value={options.colMain}
                            onChange={(e) => onChange({ colMain: e.target.value })}
                            placeholder="Zdjęcie główne"
                            className="bg-slate-900/80 border border-blue-500/20 rounded px-2 py-1.5 text-[11px] text-slate-200 focus:border-blue-500 focus:outline-none"
                        />
                        <input
                            type="text"
                            value={options.colExtra}
                            onChange={(e) => onChange({ colExtra: e.target.value })}
                            placeholder="Prefix dodatk."
                            className="bg-slate-900/80 border border-blue-500/20 rounded px-2 py-1.5 text-[11px] text-slate-200 focus:border-blue-500 focus:outline-none"
                        />
                    </div>

                    {/* Batch size */}
                    <div className="flex items-center gap-2 flex-wrap">
                        <label className="flex items-center gap-1.5 text-slate-300">
                            <input
                                type="checkbox"
                                checked={options.batchSize > 0}
                                onChange={(e) => onChange({ batchSize: e.target.checked ? 100 : 0 })}
                                className="w-3.5 h-3.5"
                            />
                            <span>Podziel na paczki:</span>
                        </label>

                        {options.batchSize > 0 && (
                            <>
                                <select
                                    value={BATCH_SIZE_PRESETS.find(p => p.value === options.batchSize)?.value ?? -1}
                                    onChange={(e) => {
                                        const val = parseInt(e.target.value);
                                        if (val > 0) onChange({ batchSize: val });
                                    }}
                                    className="bg-slate-900/80 border border-blue-500/20 rounded px-1.5 py-1 text-[11px] text-slate-200"
                                >
                                    {BATCH_SIZE_PRESETS.slice(1).map(p => (
                                        <option key={p.value} value={p.value}>{p.label}</option>
                                    ))}
                                </select>

                                <input
                                    type="number"
                                    value={options.batchSize}
                                    onChange={(e) => onChange({ batchSize: parseInt(e.target.value) || 0 })}
                                    placeholder="custom"
                                    className="w-16 bg-slate-900/80 border border-blue-500/20 rounded px-1.5 py-1 text-[11px] text-slate-200"
                                    min={1}
                                />
                            </>
                        )}
                    </div>

                    {/* Image processing options */}
                    <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-1.5 text-slate-300">
                            <input type="checkbox" checked={options.compress} onChange={(e) => onChange({ compress: e.target.checked })} className="w-3.5 h-3.5" />
                            Kompresuj
                        </label>

                        <label className="flex items-center gap-1.5 text-slate-300">
                            <input type="checkbox" checked={options.convert} onChange={(e) => onChange({ convert: e.target.checked })} className="w-3.5 h-3.5" />
                            Konwertuj:
                            <select
                                value={options.convertFormat}
                                onChange={(e) => onChange({ convertFormat: e.target.value as 'jpg' | 'png' | 'webp' })}
                                className="bg-slate-900/80 border border-blue-500/20 rounded px-1 py-0.5 text-[10px]"
                                disabled={!options.convert}
                            >
                                <option value="jpg">JPG</option>
                                <option value="png">PNG</option>
                                <option value="webp">WebP</option>
                            </select>
                        </label>

                        <label className="flex items-center gap-1.5 text-slate-300">
                            <input type="checkbox" checked={options.resize} onChange={(e) => onChange({ resize: e.target.checked })} className="w-3.5 h-3.5" />
                            Resize:
                            <select
                                value={options.maxResolution}
                                onChange={(e) => onChange({ maxResolution: parseInt(e.target.value) })}
                                className="bg-slate-900/80 border border-blue-500/20 rounded px-1 py-0.5 text-[10px]"
                                disabled={!options.resize}
                            >
                                {RESOLUTION_PRESETS.map(r => (
                                    <option key={r.value} value={r.value}>{r.label}</option>
                                ))}
                            </select>
                        </label>
                    </div>

                    {/* Output options */}
                    <div className="flex flex-wrap gap-3">
                        <label className="flex items-center gap-1.5 text-slate-300">
                            <input type="checkbox" checked={options.zipEachBatch} onChange={(e) => onChange({ zipEachBatch: e.target.checked })} className="w-3.5 h-3.5" />
                            ZIP
                        </label>
                        <label className="flex items-center gap-1.5 text-slate-300">
                            <input type="checkbox" checked={options.soundOnComplete} onChange={(e) => onChange({ soundOnComplete: e.target.checked })} className="w-3.5 h-3.5" />
                            🔔 Dźwięk
                        </label>
                    </div>
                </div>
            )}
        </div>
    );
}

// Progress Display
function ProgressDisplay({ progress, status, logs }: { progress: number; status: string; logs: LogEntry[]; }) {
    return (
        <div className="space-y-3">
            <div className="glass-panel p-3">
                <div className="flex justify-between items-center mb-2">
                    <span className="text-slate-300 text-xs">{status}</span>
                    <span className="text-lg font-bold bg-gradient-to-r from-blue-500 to-cyan-400 bg-clip-text text-transparent">
                        {progress}%
                    </span>
                </div>
                <div className="w-full h-2 bg-slate-900/80 rounded-full overflow-hidden">
                    <div
                        className={`h-full transition-all duration-500 rounded-full ${progress > 0 && progress < 100 ? 'progress-shimmer' : 'bg-gradient-to-r from-blue-500 via-cyan-400 to-green-500'}`}
                        style={{ width: `${progress}%` }}
                    />
                </div>
            </div>

            {/* Log viewer */}
            <div className="glass-panel overflow-hidden">
                <div className="flex justify-between items-center px-3 py-1.5 border-b border-blue-500/10">
                    <span className="text-slate-500 text-[10px]">📋 Log</span>
                </div>
                <div className="h-28 overflow-y-auto p-2 font-mono text-[10px] space-y-0.5">
                    {logs.map((log, i) => (
                        <div key={i} className={`
              ${log.type === 'success' ? 'text-green-400' : ''}
              ${log.type === 'error' ? 'text-red-400' : ''}
              ${log.type === 'warning' ? 'text-yellow-400' : ''}
              ${log.type === 'info' ? 'text-slate-400' : ''}
            `}>
                            <span className="text-slate-600">[{log.timestamp}]</span> {log.message}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

// Parse Excel client-side
async function parseExcelPreview(file: File): Promise<ExcelPreview> {
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as (string | number | null)[][];

    return {
        headers: (data[0] || []).map(h => String(h || '')),
        rows: data.slice(1, 6),
        totalRows: data.length - 1,
        totalCols: (data[0] || []).length,
    };
}

// Main PikoEmpiko Component
export default function PikoEmpiko() {
    const [activeMode, setActiveMode] = useState(1);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ExcelPreview | null>(null);
    const [options, setOptions] = useState<PikoOptions>(DEFAULT_PIKO_OPTIONS);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Gotowy');
    const [isProcessing, setIsProcessing] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [logs, setLogs] = useState<LogEntry[]>([
        { timestamp: new Date().toLocaleTimeString(), message: 'Gotowy do pracy.', type: 'info' }
    ]);

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message, type }]);
    };

    const handleFileSelect = async (selectedFile: File) => {
        setFile(selectedFile);
        addLog(`Wczytano: ${selectedFile.name}`, 'success');

        try {
            const previewData = await parseExcelPreview(selectedFile);
            setPreview(previewData);
            addLog(`${previewData.totalRows} wierszy, ${previewData.totalCols} kolumn`, 'info');

            // Auto-detect columns
            const findCol = (keywords: string[]) =>
                previewData.headers.find(h => keywords.some(k => h.toLowerCase().includes(k)));

            const idxCol = findCol(['indeks', 'sku', 'ean', 'kod']);
            const mainCol = findCol(['zdjęcie', 'photo', 'main', 'okładka']);
            const extraCol = findCol(['dodatkowe', 'extra', 'galeria']);

            if (idxCol || mainCol || extraCol) {
                setOptions(prev => ({
                    ...prev,
                    ...(idxCol && { colIndex: idxCol }),
                    ...(mainCol && { colMain: mainCol }),
                    ...(extraCol && { colExtra: extraCol }),
                }));
                addLog('Auto-wykryto kolumny', 'info');
            }
        } catch (e) {
            addLog(`Błąd: ${e}`, 'error');
        }
    };

    const handleStart = async () => {
        if (!file) {
            addLog('Najpierw wczytaj plik Excel!', 'warning');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setStatus('Wysyłanie...');
        addLog('Rozpoczynam przetwarzanie...', 'info');

        try {
            const API_BASE = 'http://localhost:8000';
            const formData = new FormData();
            formData.append('file', file);
            formData.append('col_index', options.colIndex);
            formData.append('col_main', options.colMain);
            formData.append('col_extra', options.colExtra);

            const res = await fetch(`${API_BASE}/api/piko-empiko`, {
                method: 'POST',
                body: formData,
            });

            if (!res.ok) {
                const error = await res.json();
                throw new Error(error.error || 'Upload failed');
            }

            const { job_id } = await res.json();
            addLog(`Job ID: ${job_id}`, 'info');

            // Poll for progress
            const pollInterval = setInterval(async () => {
                try {
                    const progressRes = await fetch(`${API_BASE}/api/progress/${job_id}`);
                    const progressData = await progressRes.json();

                    setProgress(progressData.progress || 0);
                    setStatus(`Przetwarzanie... ${progressData.progress}%`);

                    if (progressData.status === 'completed') {
                        clearInterval(pollInterval);
                        setIsProcessing(false);
                        setStatus('Zakończono!');
                        setProgress(100);
                        setDownloadUrl(`${API_BASE}/api/download/${job_id}`);
                        addLog('Zakończono!', 'success');

                        if (options.soundOnComplete) {
                            playCompletionSound();
                        }
                    } else if (progressData.status === 'error') {
                        clearInterval(pollInterval);
                        setIsProcessing(false);
                        setStatus('Błąd!');
                        addLog(`Błąd: ${progressData.error}`, 'error');
                    }
                } catch (e) {
                    console.error('Poll error:', e);
                }
            }, 1000);

        } catch (e: any) {
            setIsProcessing(false);
            setStatus('Błąd połączenia!');
            addLog(`Błąd: ${e.message}. Sprawdź czy backend Python działa na localhost:8000`, 'error');
        }
    };

    const playCompletionSound = () => {
        try {
            const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
            const beep = (freq: number, duration: number, startTime: number) => {
                const osc = audioContext.createOscillator();
                const gain = audioContext.createGain();
                osc.connect(gain);
                gain.connect(audioContext.destination);
                osc.frequency.value = freq;
                osc.type = 'sine';
                gain.gain.setValueAtTime(0.3, startTime);
                gain.gain.exponentialRampToValueAtTime(0.01, startTime + duration);
                osc.start(startTime);
                osc.stop(startTime + duration);
            };
            beep(880, 0.15, audioContext.currentTime);
            beep(1047, 0.2, audioContext.currentTime + 0.15);
        } catch (e) {
            console.log('Audio not supported');
        }
    };

    return (
        <div className="space-y-4 max-w-full">
            {/* Header */}
            <div className="flex items-center gap-2">
                <h2 className="text-xl font-bold text-white">PikoEmpiko</h2>
                <span className="px-2 py-0.5 text-[10px] font-medium text-white bg-gradient-to-r from-blue-500 to-cyan-400 rounded-full">
                    v6.0
                </span>
            </div>

            {/* Mode Cards */}
            <div className="grid grid-cols-4 lg:grid-cols-7 gap-1.5">
                {PIKO_MODES.map(mode => (
                    <ModeCard
                        key={mode.id}
                        mode={mode}
                        isActive={activeMode === mode.id}
                        onClick={() => setActiveMode(mode.id)}
                    />
                ))}
            </div>

            {/* Excel Preview */}
            {preview && <ExcelPreviewTable preview={preview} />}

            {/* Main content - two panels */}
            <div className="grid lg:grid-cols-2 gap-4">
                {/* Left: Upload + Options */}
                <div className="space-y-3">
                    {activeMode === 1 && (
                        <FileUploadZone
                            onFileSelect={handleFileSelect}
                            fileName={file?.name}
                        />
                    )}
                    {activeMode !== 1 && (
                        <div className="glass-panel p-4 text-center text-slate-500 text-sm">
                            Tryb {activeMode} wymaga backendu Python z dostępem do systemu plików
                        </div>
                    )}

                    <OptionsPanel
                        options={options}
                        onChange={(partial) => setOptions(prev => ({ ...prev, ...partial }))}
                    />
                </div>

                {/* Right: Progress + Actions */}
                <div className="space-y-3">
                    <ProgressDisplay
                        progress={progress}
                        status={status}
                        logs={logs}
                    />

                    <div className="flex gap-2">
                        <button
                            onClick={handleStart}
                            disabled={isProcessing || !file}
                            className="flex-1 py-2 px-4 bg-gradient-to-r from-blue-600 to-blue-500 hover:from-blue-500 hover:to-blue-400 text-white text-sm font-semibold rounded-lg btn-glow disabled:opacity-50 disabled:cursor-not-allowed transition-all"
                        >
                            {isProcessing ? '⏳ Przetwarzanie...' : '🚀 Uruchom'}
                        </button>

                        {downloadUrl && (
                            <a
                                href={downloadUrl}
                                className="py-2 px-4 bg-gradient-to-r from-green-600 to-green-500 hover:from-green-500 hover:to-green-400 text-white text-sm font-semibold rounded-lg transition-all"
                            >
                                ⬇️ Pobierz
                            </a>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
