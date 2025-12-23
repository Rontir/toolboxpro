'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { useUndoRedo, useUndoRedoKeyboard, UndoRedoButtons } from '@/hooks/useUndoRedo';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

// Use environment variable for API, fallback to localhost for development
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

interface ExcelPreview {
    headers: string[];
    rows: (string | number | null)[][];
    totalRows: number;
}

const MODES = [
    { id: 1, icon: '☁️', title: 'Pobieranie zdjęć', desc: 'z linków Excel' },
    { id: 2, icon: '📊', title: 'Raport folderu', desc: 'do Excel' },
    { id: 3, icon: '🔧', title: 'Naprawa nazw', desc: 'usuwanie nawiasów' },
    { id: 4, icon: '📁', title: 'Rename', desc: 'na nazwę folderu' },
    { id: 5, icon: '⚡', title: 'Batch Subfoldery', desc: 'masowe przetwarzanie' },
    { id: 6, icon: '📋', title: 'Batch Rename', desc: 'wg Excela' },
    { id: 7, icon: '🧠', title: 'Inteligentny', desc: 'z kolumną akcji' },
];

const BATCH_PRESETS = [
    { label: 'Nie dziel (wyłączone)', value: 0 },
    { label: '50 produktów', value: 50 },
    { label: '100 produktów', value: 100 },
    { label: '200 produktów', value: 200 },
    { label: '500 produktów', value: 500 },
];

const RESOLUTION_PRESETS = [
    { label: '3840×2160 (4K)', value: 3840 },
    { label: '1920×1080 (Full HD)', value: 1920 },
    { label: '1280×720 (HD)', value: 1280 },
    { label: '800×800', value: 800 },
];

const FORMAT_OPTIONS = [
    { value: 'jpg', label: 'JPG' },
    { value: 'png', label: 'PNG' },
    { value: 'webp', label: 'WebP' },
];

interface Settings {
    activeMode: number;
    colIndex: string;
    colMain: string;
    colExtra: string;
    compressJpg: boolean;
    convertEnabled: boolean;
    convertFormat: string;
    resizeEnabled: boolean;
    maxResolution: number;
    batchSize: number;
    customBatchMode: boolean;
    resumeEnabled: boolean;
    zipEachBatch: boolean;
    savePathsToExcel: boolean;
    pimVersion: 'PIM3' | 'PIM4';
    validateEnabled: boolean;
    minWidth: number;
    minHeight: number;
    ratioTolerance: number;
    soundEnabled: boolean;
}

const DEFAULT_SETTINGS: Settings = {
    activeMode: 1,
    colIndex: 'Indeks MDM',
    colMain: 'Zdjęcie okładki/produktu',
    colExtra: 'Dodatkowe zdjęcia',
    compressJpg: false,
    convertEnabled: false,
    convertFormat: 'jpg',
    resizeEnabled: false,
    maxResolution: 3840,
    batchSize: 0,
    customBatchMode: false,
    resumeEnabled: false,
    zipEachBatch: false,
    savePathsToExcel: false,
    pimVersion: 'PIM3',
    validateEnabled: false,
    minWidth: 100,
    minHeight: 100,
    ratioTolerance: 0.5,
    soundEnabled: true,
};

export default function PikoEmpiko() {
    const {
        state: settings,
        setState: setSettings,
        undo,
        redo,
        canUndo,
        canRedo,
        undoCount,
        redoCount
    } = useUndoRedo<Settings>(DEFAULT_SETTINGS);

    useUndoRedoKeyboard(undo, redo);

    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ExcelPreview | null>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Gotowy');
    const [isProcessing, setIsProcessing] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [downloadFilename, setDownloadFilename] = useState<string>('piko_result.zip');
    const [logs, setLogs] = useState<LogEntry[]>([
        { timestamp: new Date().toLocaleTimeString(), message: 'Gotowy do pracy.', type: 'info' }
    ]);

    // Local modes (2-7) state
    const [folderPath, setFolderPath] = useState('');
    const [localResult, setLocalResult] = useState<{ status: string; message: string; file?: string } | null>(null);

    // Toast hook
    const { showSuccess } = useToast();

    // UI options
    const [optionsOpen, setOptionsOpen] = useState(true);
    const [hoveredBatchBtn, setHoveredBatchBtn] = useState<number | null>(null);

    const addLog = (message: string, type: LogEntry['type'] = 'info') => {
        setLogs(prev => [...prev, { timestamp: new Date().toLocaleTimeString(), message, type }]);
    };

    const handleFileSelect = useCallback(async (selectedFile: File) => {
        setFile(selectedFile);
        addLog(`Wczytano: ${selectedFile.name}`, 'success');

        try {
            const XLSX = await import('xlsx');
            const buffer = await selectedFile.arrayBuffer();
            const workbook = XLSX.read(buffer);
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as (string | number | null)[][];

            setPreview({
                headers: (data[0] || []).map(h => String(h || '')),
                rows: data.slice(1, 6),
                totalRows: data.length - 1,
            });
            addLog(`${data.length - 1} wierszy`, 'info');

            // Auto-detect columns
            const headers = data[0] || [];
            const findCol = (keywords: string[]) =>
                headers.find(h => keywords.some(k => String(h).toLowerCase().includes(k)));

            const idx = findCol(['indeks', 'sku', 'ean', 'kod']);
            const main = findCol(['zdjęcie', 'photo', 'main', 'okładka']);
            const extra = findCol(['dodatkowe', 'extra', 'galeria']);

            const newSettings = { ...settings };
            if (idx) newSettings.colIndex = String(idx);
            if (main) newSettings.colMain = String(main);
            if (extra) newSettings.colExtra = String(extra);

            if (idx || main || extra) {
                setSettings(newSettings, 'Auto-wykrycie kolumn');
                addLog('Auto-wykryto kolumny', 'info');
            }
        } catch (e) {
            addLog(`Błąd: ${e}`, 'error');
        }
    }, []);

    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) {
            handleFileSelect(files[0]);
        }
    }, [handleFileSelect]);

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
            const formData = new FormData();
            formData.append('file', file);
            formData.append('col_index', settings.colIndex);
            formData.append('col_main', settings.colMain);
            formData.append('col_extra', settings.colExtra);
            formData.append('batch_size', String(settings.batchSize));
            formData.append('compress', String(settings.compressJpg));
            formData.append('convert', String(settings.convertEnabled));
            formData.append('convert_format', settings.convertFormat);
            formData.append('resize', String(settings.resizeEnabled));
            formData.append('max_resolution', String(settings.maxResolution));
            formData.append('resume', String(settings.resumeEnabled));
            formData.append('zip_each_batch', String(settings.zipEachBatch));
            formData.append('save_paths_to_excel', String(settings.savePathsToExcel));
            formData.append('pim_version', settings.pimVersion);

            const res = await fetch(`${API_BASE}/api/piko-empiko`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');

            const { job_id } = await res.json();
            addLog(`Job: ${job_id}`, 'info');

            const poll = setInterval(async () => {
                try {
                    const pRes = await fetch(`${API_BASE}/api/progress/${job_id}`);
                    const pData = await pRes.json();
                    setProgress(pData.progress || 0);
                    setStatus(`${pData.progress}%`);

                    if (pData.status === 'completed') {
                        clearInterval(poll);
                        setIsProcessing(false);
                        setProgress(100);
                        setStatus('Zakończono!');
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        setDownloadFilename(`piko_images_${timestamp}.zip`);
                        setDownloadUrl(`${API_BASE}/api/download/${job_id}`);
                        addLog('Zakończono!', 'success');
                        if (settings.soundEnabled) new Audio().play().catch(() => { });
                        showSuccess('Plik gotowy!');
                    } else if (pData.status === 'error') {
                        clearInterval(poll);
                        setIsProcessing(false);
                        addLog(`Błąd: ${pData.error}`, 'error');
                    }
                } catch { /* ignore poll errors */ }
            }, 1000);
        } catch (e: unknown) {
            setIsProcessing(false);
            const msg = e instanceof Error ? e.message : String(e);
            addLog(`Błąd: ${msg}. Backend niedostępny? Sprawdź połączenie.`, 'error');
        }
    };

    // Handler for local modes (2-7)
    const handleStartLocal = async () => {
        if (!folderPath.trim()) {
            addLog('Podaj ścieżkę do folderu!', 'warning');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setStatus('Przetwarzanie lokalne...');
        setLocalResult(null);
        addLog(`Rozpoczynam tryb ${settings.activeMode}: ${MODES.find(m => m.id === settings.activeMode)?.title}`, 'info');

        try {
            const formData = new FormData();
            formData.append('mode', String(settings.activeMode));
            formData.append('folder_path', folderPath);
            formData.append('options', JSON.stringify({}));

            // For modes 6 and 7, include Excel file
            if ((settings.activeMode === 6 || settings.activeMode === 7) && file) {
                formData.append('file', file);
            }

            const res = await fetch(`${API_BASE}/api/piko-local`, { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Request failed');

            const { job_id } = await res.json();
            addLog(`Job: ${job_id}`, 'info');

            const poll = setInterval(async () => {
                try {
                    const pRes = await fetch(`${API_BASE}/api/progress/${job_id}`);
                    const pData = await pRes.json();
                    setProgress(pData.progress || 0);
                    setStatus(`${pData.progress}%`);

                    if (pData.status === 'completed') {
                        clearInterval(poll);
                        setIsProcessing(false);
                        setProgress(100);
                        setStatus('Zakończono!');
                        setLocalResult(pData.result);
                        if (pData.result?.file) {
                            addLog(`📁 Plik: ${pData.result.file}`, 'success');
                        }
                        addLog(`✅ ${pData.result?.message || 'Zakończono!'}`, 'success');
                        showSuccess(pData.result?.message || 'Gotowe!');
                        playSound();
                    } else if (pData.status === 'error') {
                        clearInterval(poll);
                        setIsProcessing(false);
                        setLocalResult({ status: 'error', message: pData.error });
                        addLog(`❌ ${pData.error}`, 'error');
                    }
                } catch { /* ignore */ }
            }, 1000);
        } catch (e: unknown) {
            setIsProcessing(false);
            const msg = e instanceof Error ? e.message : String(e);
            addLog(`Błąd: ${msg}`, 'error');
        }
    };

    const playSound = () => {
        try {
            const ctx = new AudioContext();
            [880, 1047].forEach((freq, i) => {
                const osc = ctx.createOscillator();
                const gain = ctx.createGain();
                osc.connect(gain).connect(ctx.destination);
                osc.frequency.value = freq;
                gain.gain.setValueAtTime(0.3, ctx.currentTime + i * 0.15);
                gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + i * 0.15 + 0.15);
                osc.start(ctx.currentTime + i * 0.15);
                osc.stop(ctx.currentTime + i * 0.15 + 0.15);
            });
        } catch { /* ignore */ }
    };

    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="PikoEmpiko v6.0"
                description="Zaawansowane narzędzie do pobierania zdjęć i zarządzania plikami. Obsługuje wiele trybów pracy."
                icon="⚡"
            />

            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-7 gap-3">
                {MODES.map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => setSettings({ ...settings, activeMode: mode.id }, `Zmiana trybu na ${mode.title}`)}
                        className={`p-3 rounded-lg border transition-all flex flex-col items-center gap-2 text-center h-full ${settings.activeMode === mode.id
                            ? 'bg-accent/10 border-accent text-accent'
                            : 'bg-bg-tertiary border-border hover:border-accent/50 text-text-gray'
                            }`}
                    >
                        <span className="text-2xl">{mode.icon}</span>
                        <div className="flex flex-col">
                            <span className="font-semibold text-xs">{mode.title}</span>
                            <span className="text-[10px] opacity-70">{mode.desc}</span>
                        </div>
                    </button>
                ))}
            </div>

            {/* Excel Preview */}
            {preview && (
                <Section title="📊 Podgląd Excel" actions={<span className="text-xs text-text-muted">{preview.totalRows} wierszy</span>}>
                    <div className="overflow-x-auto">
                        <table className="w-full text-xs text-left border-collapse">
                            <thead>
                                <tr className="border-b border-border">
                                    {preview.headers.map((h, i) => <th key={i} className="p-2 text-text-muted font-medium">{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {preview.rows.map((row, i) => (
                                    <tr key={i} className="border-b border-border last:border-0 hover:bg-bg-secondary/50">
                                        {row.map((cell, j) => <td key={j} className="p-2 max-w-[150px] truncate">{String(cell ?? '')}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                    <Section title="1. Wejście">
                        {settings.activeMode === 1 ? (
                            <FileUpload
                                onFilesSelect={handleFilesSelected}
                                accept=".xlsx,.xls"
                                label="Wgraj plik Excel"
                                sublabel="Przeciągnij lub kliknij"
                                icon="📥"
                            />
                        ) : (
                            <div className="space-y-4">
                                <div
                                    onClick={async () => {
                                        try {
                                            addLog('Otwieranie okna wyboru folderu...', 'info');
                                            const res = await fetch(`${API_BASE}/api/browse-folder`);
                                            const data = await res.json();
                                            if (data.path) {
                                                setFolderPath(data.path);
                                                addLog(`Wybrano: ${data.path}`, 'success');
                                            } else if (data.error) {
                                                addLog(`Błąd: ${data.error}`, 'error');
                                            }
                                        } catch (e) {
                                            addLog('Kliknij w okno dialogowe wyboru folderu', 'warning');
                                        }
                                    }}
                                    className="border-2 border-dashed border-border rounded-xl p-6 text-center cursor-pointer hover:border-accent hover:bg-accent/5 transition-all group"
                                >
                                    <div className="text-4xl mb-3 group-hover:scale-110 transition-transform">
                                        {folderPath ? '📂' : '📁'}
                                    </div>
                                    <p className="font-medium text-text-white mb-1 break-all">
                                        {folderPath || 'Kliknij aby wybrać folder'}
                                    </p>
                                    <p className="text-sm text-text-muted">
                                        {settings.activeMode === 2 && 'Generuje raport Excel'}
                                        {settings.activeMode === 3 && 'Naprawa nazw plików'}
                                        {settings.activeMode === 4 && 'Rename na EAN'}
                                        {settings.activeMode === 5 && 'Batch subfoldery'}
                                        {settings.activeMode === 6 && 'Rename wg Excel'}
                                        {settings.activeMode === 7 && 'Inteligentny tryb'}
                                    </p>
                                </div>

                                {(settings.activeMode === 6 || settings.activeMode === 7) && (
                                    <FileUpload
                                        onFilesSelect={handleFilesSelected}
                                        accept=".xlsx,.xls"
                                        label="Dodaj plik Excel z mapowaniem"
                                        sublabel="Wymagany dla tego trybu"
                                        icon="📊"
                                    />
                                )}
                            </div>
                        )}
                    </Section>

                    <Section
                        title="2. Opcje"
                        actions={
                            <div className="flex items-center gap-2">
                                <UndoRedoButtons
                                    canUndo={canUndo}
                                    canRedo={canRedo}
                                    onUndo={undo}
                                    onRedo={redo}
                                    undoCount={undoCount}
                                    redoCount={redoCount}
                                />
                                <button onClick={() => setOptionsOpen(!optionsOpen)} className="text-text-muted hover:text-text-white">
                                    {optionsOpen ? '▼' : '▶'}
                                </button>
                            </div>
                        }
                    >
                        {optionsOpen && (
                            <div className="space-y-4">
                                <div className="grid grid-cols-3 gap-2">
                                    <input className="form-input text-xs" value={settings.colIndex} onChange={e => setSettings({ ...settings, colIndex: e.target.value }, 'Zmiana kolumny indeksu')} placeholder="Kolumna indeksu" />
                                    <input className="form-input text-xs" value={settings.colMain} onChange={e => setSettings({ ...settings, colMain: e.target.value }, 'Zmiana kolumny zdjęcia głównego')} placeholder="Zdjęcie główne" />
                                    <input className="form-input text-xs" value={settings.colExtra} onChange={e => setSettings({ ...settings, colExtra: e.target.value }, 'Zmiana kolumny zdjęć dodatkowych')} placeholder="Prefix dodatk." />
                                </div>

                                <div className="space-y-3 text-sm">
                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={settings.compressJpg} onChange={e => setSettings({ ...settings, compressJpg: e.target.checked }, e.target.checked ? 'Włączenie kompresji JPG' : 'Wyłączenie kompresji JPG')} className="accent-accent" />
                                        <span>Kompresuj JPG</span>
                                    </label>

                                    <div className="flex items-center gap-3 flex-wrap">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={settings.convertEnabled} onChange={e => setSettings({ ...settings, convertEnabled: e.target.checked }, e.target.checked ? 'Włączenie konwersji' : 'Wyłączenie konwersji')} className="accent-accent" />
                                            <span>Konwertuj do:</span>
                                        </label>
                                        <select
                                            value={settings.convertFormat}
                                            onChange={e => setSettings({ ...settings, convertFormat: e.target.value }, `Zmiana formatu na ${e.target.value}`)}
                                            disabled={!settings.convertEnabled}
                                            className="form-select text-xs py-1"
                                        >
                                            {FORMAT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                        </select>
                                    </div>

                                    <div className="flex items-center gap-3 flex-wrap">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={settings.resizeEnabled} onChange={e => setSettings({ ...settings, resizeEnabled: e.target.checked }, e.target.checked ? 'Włączenie zmiany rozmiaru' : 'Wyłączenie zmiany rozmiaru')} className="accent-accent" />
                                            <span>Max rozdzielczość:</span>
                                        </label>
                                        <select
                                            value={settings.maxResolution}
                                            onChange={e => setSettings({ ...settings, maxResolution: Number(e.target.value) }, `Zmiana rozdzielczości na ${e.target.value}`)}
                                            disabled={!settings.resizeEnabled}
                                            className="form-select text-xs py-1"
                                        >
                                            {RESOLUTION_PRESETS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select>
                                    </div>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={settings.resumeEnabled} onChange={e => setSettings({ ...settings, resumeEnabled: e.target.checked }, e.target.checked ? 'Włączenie Resume' : 'Wyłączenie Resume')} className="accent-accent" />
                                        <span>Resume/Continue (kontynuuj przerwane)</span>
                                    </label>

                                    <div className="space-y-2">
                                        <label className="flex items-center gap-2 cursor-pointer">
                                            <input type="checkbox" checked={settings.validateEnabled} onChange={e => setSettings({ ...settings, validateEnabled: e.target.checked }, e.target.checked ? 'Włączenie walidacji' : 'Wyłączenie walidacji')} className="accent-accent" />
                                            <span>Walidacja obrazów</span>
                                        </label>
                                        {settings.validateEnabled && (
                                            <div className="flex gap-2 pl-6">
                                                <input type="number" value={settings.minWidth} onChange={e => setSettings({ ...settings, minWidth: Number(e.target.value) }, 'Zmiana min szerokości')} className="form-input w-20 text-xs" placeholder="Min W" />
                                                <input type="number" value={settings.minHeight} onChange={e => setSettings({ ...settings, minHeight: Number(e.target.value) }, 'Zmiana min wysokości')} className="form-input w-20 text-xs" placeholder="Min H" />
                                                <input type="number" value={settings.ratioTolerance} onChange={e => setSettings({ ...settings, ratioTolerance: Number(e.target.value) }, 'Zmiana tolerancji proporcji')} className="form-input w-20 text-xs" placeholder="Tol." />
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex items-center gap-3 flex-wrap">
                                        <span>Paczki:</span>
                                        {!settings.customBatchMode ? (
                                            <select
                                                value={settings.batchSize}
                                                onChange={e => e.target.value === 'custom' ? setSettings({ ...settings, customBatchMode: true }, 'Włączenie własnej paczki') : setSettings({ ...settings, batchSize: Number(e.target.value) }, `Zmiana paczki na ${e.target.value}`)}
                                                className="form-select text-xs py-1"
                                            >
                                                <option value={0}>Nie dziel</option>
                                                {BATCH_PRESETS.slice(1).map(p => <option key={p.value} value={p.value}>{p.label}</option>)}
                                                <option value="custom">Własna...</option>
                                            </select>
                                        ) : (
                                            <div className="flex items-center gap-2">
                                                <input type="number" value={settings.batchSize} onChange={e => setSettings({ ...settings, batchSize: Math.max(0, Number(e.target.value)) }, 'Zmiana rozmiaru paczki')} className="form-input w-20 text-xs" />
                                                <button onClick={() => setSettings({ ...settings, customBatchMode: false }, 'Wyłączenie własnej paczki')} className="text-xs text-accent hover:underline">Preset</button>
                                            </div>
                                        )}
                                    </div>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={settings.zipEachBatch} onChange={e => setSettings({ ...settings, zipEachBatch: e.target.checked }, e.target.checked ? 'Włączenie ZIP dla paczek' : 'Wyłączenie ZIP dla paczek')} className="accent-accent" />
                                        <span>Spakuj każdą paczkę do ZIP</span>
                                    </label>

                                    <div className="flex items-center gap-3">
                                        <span>Format:</span>
                                        <div className="flex gap-1">
                                            {(['PIM3', 'PIM4'] as const).map(v => (
                                                <button
                                                    key={v}
                                                    onClick={() => setSettings({ ...settings, pimVersion: v }, `Zmiana wersji PIM na ${v}`)}
                                                    className={`px-2 py-1 rounded text-xs transition-colors ${settings.pimVersion === v ? 'bg-accent text-black font-bold' : 'bg-bg-input text-text-muted hover:bg-bg-secondary'}`}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                    </div>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={settings.savePathsToExcel} onChange={e => setSettings({ ...settings, savePathsToExcel: e.target.checked }, e.target.checked ? 'Włączenie zapisu ścieżek' : 'Wyłączenie zapisu ścieżek')} className="accent-accent" />
                                        <span>Zapisz ścieżki w Excel</span>
                                    </label>

                                    <label className="flex items-center gap-2 cursor-pointer">
                                        <input type="checkbox" checked={settings.soundEnabled} onChange={e => setSettings({ ...settings, soundEnabled: e.target.checked }, e.target.checked ? 'Włączenie dźwięku' : 'Wyłączenie dźwięku')} className="accent-accent" />
                                        <span>Dźwięk po zakończeniu</span>
                                    </label>
                                </div>
                            </div>
                        )}
                    </Section>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    <Section title="Status">
                        <div className="mb-6">
                            <div className="flex justify-between mb-2 text-sm">
                                <span className="text-text-gray">{status}</span>
                                <span className="font-bold text-accent">{progress}%</span>
                            </div>
                            <div className="w-full bg-bg-input rounded-full h-2.5">
                                <div className="bg-accent h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>

                        {localResult && (
                            <div className={`p-3 rounded-lg border text-sm mb-4 ${localResult.status === 'success' ? 'bg-green-500/10 border-green-500/50 text-green-400' : 'bg-red-500/10 border-red-500/50 text-red-400'}`}>
                                <div className="flex items-center gap-2 font-medium">
                                    {localResult.status === 'success' ? '✅' : '❌'} {localResult.message}
                                </div>
                                {localResult.file && (
                                    <div className="flex gap-2 mt-2">
                                        <button
                                            onClick={async () => {
                                                try {
                                                    await fetch(`${API_BASE}/api/open-file`, {
                                                        method: 'POST',
                                                        headers: { 'Content-Type': 'application/json' },
                                                        body: JSON.stringify({ file_path: localResult.file })
                                                    });
                                                    addLog('Otwarto lokalizację pliku', 'success');
                                                } catch (e) {
                                                    addLog('Błąd otwierania pliku', 'error');
                                                }
                                            }}
                                            className="btn btn-secondary text-xs py-1 px-2"
                                        >
                                            📂 Otwórz
                                        </button>
                                        <button
                                            onClick={() => {
                                                const url = `${API_BASE}/api/download-file?path=${encodeURIComponent(localResult.file!)}`;
                                                window.open(url, '_blank');
                                                addLog('Pobieranie pliku...', 'info');
                                            }}
                                            className="btn btn-primary text-xs py-1 px-2"
                                        >
                                            ⬇️ Pobierz
                                        </button>
                                    </div>
                                )}
                            </div>
                        )}

                        <div className="bg-bg-input rounded-lg border border-border p-3 h-48 overflow-y-auto font-mono text-xs space-y-1">
                            {logs.map((log, i) => (
                                <div key={i} className={`${log.type === 'error' ? 'text-red-400' :
                                    log.type === 'success' ? 'text-green-400' :
                                        log.type === 'warning' ? 'text-yellow-400' :
                                            'text-text-muted'
                                    }`}>
                                    <span className="opacity-50">[{log.timestamp}]</span> {log.message}
                                </div>
                            ))}
                        </div>
                    </Section>

                    <Section title="Akcje">
                        <div className="flex gap-3">
                            <button
                                onClick={settings.activeMode === 1 ? handleStart : handleStartLocal}
                                disabled={isProcessing || (settings.activeMode === 1 ? !file : !folderPath.trim())}
                                className="btn btn-primary flex-1 py-3"
                            >
                                {isProcessing ? '⏳ Przetwarzanie...' : '🚀 Uruchom'}
                            </button>
                            {downloadUrl && (
                                <button
                                    onClick={async () => {
                                        try {
                                            const response = await fetch(downloadUrl);
                                            const blob = await response.blob();
                                            const url = window.URL.createObjectURL(blob);
                                            const a = document.createElement('a');
                                            a.href = url;
                                            a.download = downloadFilename;
                                            document.body.appendChild(a);
                                            a.click();
                                            window.URL.revokeObjectURL(url);
                                            document.body.removeChild(a);
                                        } catch (err) {
                                            addLog('Błąd pobierania pliku', 'error');
                                        }
                                    }}
                                    className="btn btn-secondary"
                                >
                                    ⬇️ Pobierz
                                </button>
                            )}
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
