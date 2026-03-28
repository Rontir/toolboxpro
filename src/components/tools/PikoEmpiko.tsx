'use client';

import { useState, useCallback } from 'react';
import { useToast } from '@/components/Toast';
import { apiUrl } from '@/lib/config';

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

export default function PikoEmpiko() {
    const [activeMode, setActiveMode] = useState(1);
    const [file, setFile] = useState<File | null>(null);
    const [preview, setPreview] = useState<ExcelPreview | null>(null);
    const [progress, setProgress] = useState(0);
    const [status, setStatus] = useState('Gotowy');
    const [isProcessing, setIsProcessing] = useState(false);
    const [downloadUrl, setDownloadUrl] = useState<string | null>(null);
    const [downloadFilename, setDownloadFilename] = useState<string>('piko_result.zip');
    const [isDownloading, setIsDownloading] = useState(false);
    const [logs, setLogs] = useState<LogEntry[]>([
        { timestamp: new Date().toLocaleTimeString(), message: 'Gotowy do pracy.', type: 'info' }
    ]);

    // Local modes (2-7) state
    const [folderPath, setFolderPath] = useState('');
    const [localResult, setLocalResult] = useState<{ status: string; message: string; file?: string } | null>(null);

    // Toast hook
    const { showSuccess } = useToast();

    // Column options
    const [colIndex, setColIndex] = useState('Indeks MDM');
    const [colMain, setColMain] = useState('Zdjęcie okładki/produktu');
    const [colExtra, setColExtra] = useState('Dodatkowe zdjęcia');

    // Image processing options
    const [compressJpg, setCompressJpg] = useState(false);
    const [convertEnabled, setConvertEnabled] = useState(false);
    const [convertFormat, setConvertFormat] = useState('jpg');
    const [resizeEnabled, setResizeEnabled] = useState(false);
    const [maxResolution, setMaxResolution] = useState(3840);
    const [hoveredBatchBtn, setHoveredBatchBtn] = useState<number | null>(null);

    // Batch options
    const [batchSize, setBatchSize] = useState(0);
    const [customBatchMode, setCustomBatchMode] = useState(false);
    const [resumeEnabled, setResumeEnabled] = useState(false);
    const [zipEachBatch, setZipEachBatch] = useState(false);
    const [savePathsToExcel, setSavePathsToExcel] = useState(false);
    const [pimVersion, setPimVersion] = useState<'PIM3' | 'PIM4'>('PIM3');

    // Image validation options
    const [validateEnabled, setValidateEnabled] = useState(false);
    const [minWidth, setMinWidth] = useState(100);
    const [minHeight, setMinHeight] = useState(100);
    const [ratioTolerance, setRatioTolerance] = useState(0.5);

    // UI options
    const [soundEnabled, setSoundEnabled] = useState(true);
    const [optionsOpen, setOptionsOpen] = useState(true);

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

            if (idx) setColIndex(String(idx));
            if (main) setColMain(String(main));
            if (extra) setColExtra(String(extra));
            if (idx || main || extra) addLog('Auto-wykryto kolumny', 'info');
        } catch (e) {
            addLog(`Błąd: ${e}`, 'error');
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const droppedFile = e.dataTransfer.files[0];
        if (droppedFile) handleFileSelect(droppedFile);
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
            formData.append('col_index', colIndex);
            formData.append('col_main', colMain);
            formData.append('col_extra', colExtra);
            formData.append('batch_size', String(batchSize));
            formData.append('compress', String(compressJpg));
            formData.append('convert', String(convertEnabled));
            formData.append('convert_format', convertFormat);
            formData.append('resize', String(resizeEnabled));
            formData.append('max_resolution', String(maxResolution));
            formData.append('resume', String(resumeEnabled));
            formData.append('zip_each_batch', String(zipEachBatch));
            formData.append('save_paths_to_excel', String(savePathsToExcel));
            formData.append('pim_version', pimVersion);

            const res = await fetch(apiUrl('/api/piko-empiko'), { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Upload failed');

            const { job_id } = await res.json();
            addLog(`Job: ${job_id}`, 'info');

            const poll = setInterval(async () => {
                try {
                    if (document.hidden) {
                        return;
                    }

                    const pRes = await fetch(apiUrl(`/api/progress/${job_id}`));
                    const pData = await pRes.json();

                    // Handle job not found
                    if (pData.error) {
                        addLog(`Błąd: ${pData.error}`, 'error');
                        return; // Stay in the polling loop, job might appear
                    }

                    const prog = pData.progress ?? 0;
                    setProgress(prog);
                    setStatus(`${prog}%`);

                    if (pData.status === 'completed') {
                        clearInterval(poll);
                        setIsProcessing(false);
                        setProgress(100);
                        setStatus('Zakończono!');
                        const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
                        setDownloadFilename(`piko_images_${timestamp}.zip`);
                        setDownloadUrl(apiUrl(`/api/download/${job_id}`));
                        addLog('Zakończono!', 'success');
                        if (soundEnabled) playSound();
                        showSuccess('Success!');
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
            addLog(`Błąd: ${msg}. URL: ${apiUrl('/api/piko-empiko')}. Backend niedostępny?`, 'error');
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
        addLog(`Rozpoczynam tryb ${activeMode}: ${MODES.find(m => m.id === activeMode)?.title}`, 'info');

        try {
            const formData = new FormData();
            formData.append('mode', String(activeMode));
            formData.append('folder_path', folderPath);
            formData.append('options', JSON.stringify({}));

            // For modes 6 and 7, include Excel file
            if ((activeMode === 6 || activeMode === 7) && file) {
                formData.append('file', file);
            }

            const res = await fetch(apiUrl('/api/piko-local'), { method: 'POST', body: formData });
            if (!res.ok) throw new Error('Request failed');

            const { job_id } = await res.json();
            addLog(`Job: ${job_id}`, 'info');

            const poll = setInterval(async () => {
                try {
                    if (document.hidden) {
                        return;
                    }

                    const pRes = await fetch(apiUrl(`/api/progress/${job_id}`));
                    const pData = await pRes.json();

                    if (pData.error) {
                        addLog(`Błąd: ${pData.error}`, 'error');
                        return;
                    }

                    const prog = pData.progress ?? 0;
                    setProgress(prog);
                    setStatus(`${prog}%`);

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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
            {/* Download Loading Overlay */}
            {isDownloading && (
                <div style={{
                    position: 'fixed',
                    top: 0,
                    left: 0,
                    right: 0,
                    bottom: 0,
                    background: 'rgba(0, 0, 0, 0.85)',
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    justifyContent: 'center',
                    zIndex: 9999,
                    backdropFilter: 'blur(4px)'
                }}>
                    <div style={{
                        width: '60px',
                        height: '60px',
                        border: '4px solid rgba(255,255,255,0.1)',
                        borderTop: '4px solid var(--accent)',
                        borderRadius: '50%',
                        animation: 'spin 1s linear infinite'
                    }} />
                    <p style={{ marginTop: '1.5rem', fontSize: '1.25rem', color: 'white', fontWeight: 600 }}>
                        Pobieranie pliku...
                    </p>
                    <p style={{ marginTop: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        Proszę czekać, plik jest przygotowywany
                    </p>
                    <style>{`
                        @keyframes spin {
                            0% { transform: rotate(0deg); }
                            100% { transform: rotate(360deg); }
                        }
                    `}</style>
                </div>
            )}
            {/* Header */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, background: 'linear-gradient(to right, white, var(--accent))', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}>
                    PikoEmpiko
                </h2>
                <span style={{ background: 'var(--accent)', color: 'black', fontSize: '0.7rem', fontWeight: 700, padding: '0.25rem 0.5rem', borderRadius: '9999px' }}>v6.0</span>
            </div>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Zaawansowane narzędzie do pobierania zdjęć i zarządzania plikami.
            </p>

            {/* Mode Cards */}
            <div className="mode-cards">
                {MODES.map(mode => (
                    <button
                        key={mode.id}
                        onClick={() => setActiveMode(mode.id)}
                        className={`mode-card ${activeMode === mode.id ? 'active' : ''}`}
                    >
                        <span className="icon">{mode.icon}</span>
                        <span className="title">{mode.title}</span>
                        <span style={{ fontSize: '0.65rem', color: 'var(--text-muted)', textAlign: 'center' }}>{mode.desc}</span>
                    </button>
                ))}
            </div>

            {/* Excel Preview */}
            {preview && (
                <div className="card">
                    <div className="card-header">
                        <span>📊 Podgląd Excel</span>
                        <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{preview.totalRows} wierszy</span>
                    </div>
                    <div className="card-body" style={{ maxHeight: '10rem', overflow: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.75rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                    {preview.headers.map((h, i) => <th key={i} style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>{h}</th>)}
                                </tr>
                            </thead>
                            <tbody>
                                {preview.rows.map((row, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        {row.map((cell, j) => <td key={j} style={{ padding: '0.5rem', maxWidth: '150px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{String(cell ?? '')}</td>)}
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}

            {/* Two column layout */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left: Upload + Options */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Upload */}
                    {activeMode === 1 && (
                        <div
                            className="upload-zone"
                            onDragOver={(e) => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('piko-file')?.click()}
                        >
                            <input
                                type="file"
                                id="piko-file"
                                accept=".xlsx,.xls"
                                className="hidden"
                                onChange={(e) => e.target.files?.[0] && handleFileSelect(e.target.files[0])}
                            />
                            <span className="icon">{file ? '✅' : '📥'}</span>
                            <p className="title">{file?.name || 'Przeciągnij plik Excel'}</p>
                            <p className="subtitle">lub kliknij aby wybrać</p>
                        </div>
                    )}

                    {activeMode !== 1 && (
                        <>
                            {/* Folder picker - styled like upload zone */}
                            <div
                                className="upload-zone"
                                onClick={async () => {
                                    try {
                                        addLog('Otwieranie okna wyboru folderu...', 'info');
                                        const res = await fetch(apiUrl('/api/browse-folder'));
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
                                style={{ padding: '1.5rem' }}
                            >
                                <span className="icon">{folderPath ? '📂' : '📁'}</span>
                                <p className="title" style={{
                                    fontSize: folderPath && folderPath.length > 40 ? '12px' : '14px',
                                    wordBreak: 'break-all',
                                    maxWidth: '100%'
                                }}>
                                    {folderPath ? (folderPath.length > 50 ? '...' + folderPath.slice(-47) : folderPath) : 'Kliknij aby wybrać folder'}
                                </p>
                                <p className="subtitle">
                                    {activeMode === 2 && 'Generuje raport Excel'}
                                    {activeMode === 3 && 'Naprawa nazw plików'}
                                    {activeMode === 4 && 'Rename na EAN'}
                                    {activeMode === 5 && 'Batch subfoldery'}
                                    {activeMode === 6 && 'Rename wg Excel'}
                                    {activeMode === 7 && 'Inteligentny tryb'}
                                </p>
                            </div>

                            {/* Excel upload for modes 6 and 7 */}
                            {(activeMode === 6 || activeMode === 7) && (
                                <div
                                    className="upload-zone"
                                    onClick={() => document.getElementById('piko-file')?.click()}
                                    style={{ padding: '1.5rem' }}
                                >
                                    <span className="icon">{file ? '✅' : '📥'}</span>
                                    <p className="title">{file?.name || 'Dodaj plik Excel z mapowaniem'}</p>
                                    <p className="subtitle">wymagany dla tego trybu</p>
                                </div>
                            )}

                            {/* Local result */}
                            {localResult && (
                                <div style={{
                                    padding: '0.75rem 1rem',
                                    background: localResult.status === 'success' ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                                    border: `1px solid ${localResult.status === 'success' ? 'var(--accent)' : 'var(--error)'}`,
                                    borderRadius: '8px',
                                    fontSize: '0.85rem'
                                }}>
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: localResult.file ? '0.5rem' : 0 }}>
                                        {localResult.status === 'success' ? '✅' : '❌'}
                                        <span style={{ fontWeight: 600, fontSize: '0.85rem' }}>{localResult.message}</span>
                                    </div>

                                    {localResult.file && (
                                        <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                                            <button
                                                className="btn btn-secondary"
                                                onClick={async () => {
                                                    try {
                                                        await fetch(apiUrl('/api/open-file'), {
                                                            method: 'POST',
                                                            headers: { 'Content-Type': 'application/json' },
                                                            body: JSON.stringify({ file_path: localResult.file })
                                                        });
                                                        addLog('Otwarto lokalizację pliku', 'success');
                                                    } catch (e) {
                                                        addLog('Błąd otwierania pliku', 'error');
                                                    }
                                                }}
                                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                            >
                                                📂 Otwórz lokalizację
                                            </button>
                                            <button
                                                className="btn btn-primary"
                                                onClick={() => {
                                                    const url = apiUrl(`/api/download-file?path=${encodeURIComponent(localResult.file!)}`);
                                                    window.open(url, '_blank');
                                                    addLog('Pobieranie pliku...', 'info');
                                                }}
                                                style={{ fontSize: '0.8rem', padding: '0.4rem 0.75rem' }}
                                            >
                                                ⬇️ Pobierz
                                            </button>
                                        </div>
                                    )}
                                </div>
                            )}
                        </>
                    )}

                    {/* Options Panel */}
                    <div className="card">
                        <div
                            className="card-header"
                            onClick={() => setOptionsOpen(!optionsOpen)}
                            style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between' }}
                        >
                            <span>⚙️ Opcje</span>
                            <span>{optionsOpen ? '▼' : '▶'}</span>
                        </div>
                        {optionsOpen && (
                            <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                                {/* Column inputs */}
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem' }}>
                                    <input className="form-input" value={colIndex} onChange={e => setColIndex(e.target.value)} placeholder="Kolumna indeksu" style={{ padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)', fontSize: '0.8rem' }} />
                                    <input className="form-input" value={colMain} onChange={e => setColMain(e.target.value)} placeholder="Zdjęcie główne" style={{ padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)', fontSize: '0.8rem' }} />
                                    <input className="form-input" value={colExtra} onChange={e => setColExtra(e.target.value)} placeholder="Prefix dodatk." style={{ padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)', fontSize: '0.8rem' }} />
                                </div>

                                {/* Image Processing Options */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem', fontSize: '0.875rem' }}>
                                    {/* Compress */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: compressJpg ? 'var(--accent)' : 'var(--text-gray)' }}>
                                        <input type="checkbox" checked={compressJpg} onChange={e => setCompressJpg(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                        ✓ Kompresuj JPG
                                    </label>

                                    {/* Convert */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: convertEnabled ? 'var(--accent)' : 'var(--text-gray)' }}>
                                            <input type="checkbox" checked={convertEnabled} onChange={e => setConvertEnabled(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                            ✓ Konwertuj do:
                                        </label>
                                        <select
                                            value={convertFormat}
                                            onChange={e => setConvertFormat(e.target.value)}
                                            disabled={!convertEnabled}
                                            style={{ padding: '0.35rem 0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)', fontSize: '0.8rem' }}
                                        >
                                            {FORMAT_OPTIONS.map(f => <option key={f.value} value={f.value}>{f.label}</option>)}
                                        </select>
                                    </div>

                                    {/* Resize */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: resizeEnabled ? 'var(--accent)' : 'var(--text-gray)' }}>
                                            <input type="checkbox" checked={resizeEnabled} onChange={e => setResizeEnabled(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                            ✓ Max rozdzielczość (resize):
                                        </label>
                                        <select
                                            value={maxResolution}
                                            onChange={e => setMaxResolution(Number(e.target.value))}
                                            disabled={!resizeEnabled}
                                            style={{ padding: '0.35rem 0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)', fontSize: '0.8rem' }}
                                        >
                                            {RESOLUTION_PRESETS.map(r => <option key={r.value} value={r.value}>{r.label}</option>)}
                                        </select>
                                    </div>

                                    {/* Resume */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: resumeEnabled ? 'var(--accent)' : 'var(--text-gray)' }}>
                                        <input type="checkbox" checked={resumeEnabled} onChange={e => setResumeEnabled(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                        ⏩ Resume/Continue (kontynuuj przerwane)
                                    </label>

                                    {/* Image Validation */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', flexWrap: 'wrap' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: validateEnabled ? 'var(--accent)' : 'var(--text-gray)' }}>
                                            <input type="checkbox" checked={validateEnabled} onChange={e => setValidateEnabled(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                            🔍 Walidacja obrazów (wymiary):
                                        </label>
                                        {validateEnabled && (
                                            <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min szer:</span>
                                                    <input
                                                        type="number"
                                                        value={minWidth}
                                                        onChange={e => setMinWidth(Number(e.target.value))}
                                                        style={{ width: '60px', padding: '0.25rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-white)', fontSize: '0.75rem' }}
                                                    />
                                                </div>
                                                <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
                                                    <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Min wys:</span>
                                                    <input
                                                        type="number"
                                                        value={minHeight}
                                                        onChange={e => setMinHeight(Number(e.target.value))}
                                                        style={{ width: '60px', padding: '0.25rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '4px', color: 'var(--text-white)', fontSize: '0.75rem' }}
                                                    />
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    {/* Advanced AI Validation */}
                                    <div style={{ marginTop: '0.5rem', padding: '0.5rem', background: 'rgba(255,255,255,0.05)', borderRadius: '6px' }}>
                                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: 'var(--text-white)', fontSize: '0.85rem' }}>
                                            <span style={{ fontSize: '1rem' }}>🤖</span>
                                            AI Walidacja Tła (BETA)
                                            <span style={{ fontSize: '0.7rem', background: 'var(--accent)', color: 'black', padding: '1px 4px', borderRadius: '4px' }}>NEW</span>
                                        </label>
                                        <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginTop: '0.25rem', marginLeft: '1.5rem' }}>
                                            Sprawdza czy tło jest idealnie białe (wymóg Empik). Działa wolniej.
                                        </p>
                                    </div>

                                    {/* Batch Size */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ color: 'var(--text-gray)' }}>📦 Podziel na paczki:</span>
                                        {!customBatchMode ? (
                                            <select
                                                value={batchSize}
                                                onChange={e => {
                                                    if (e.target.value === 'custom') {
                                                        setCustomBatchMode(true);
                                                    } else {
                                                        setBatchSize(Number(e.target.value));
                                                    }
                                                }}
                                                style={{
                                                    padding: '0.4rem 0.6rem',
                                                    background: '#1a1a1a',
                                                    border: '1px solid #333',
                                                    borderRadius: '6px',
                                                    color: '#fff',
                                                    fontSize: '0.85rem',
                                                    cursor: 'pointer',
                                                    minWidth: '160px'
                                                }}
                                            >
                                                <option value={0}>Nie dziel (wyłączone)</option>
                                                <option value={25}>25 produktów</option>
                                                <option value={50}>50 produktów</option>
                                                <option value={75}>75 produktów</option>
                                                <option value={100}>100 produktów</option>
                                                <option value={150}>150 produktów</option>
                                                <option value={200}>200 produktów</option>
                                                <option value={300}>300 produktów</option>
                                                <option value={500}>500 produktów</option>
                                                <option value="custom">Własna wartość...</option>
                                            </select>
                                        ) : (
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <input
                                                    type="number"
                                                    min="0"
                                                    autoFocus
                                                    value={batchSize}
                                                    onChange={e => setBatchSize(Math.max(0, Number(e.target.value)))}
                                                    placeholder="Wpisz liczbę"
                                                    style={{
                                                        width: '100px',
                                                        padding: '0.4rem 0.5rem',
                                                        background: '#1a1a1a',
                                                        border: '1px solid #1db954',
                                                        borderRadius: '6px',
                                                        color: '#fff',
                                                        fontSize: '0.85rem',
                                                        textAlign: 'center'
                                                    }}
                                                />
                                                <span style={{ color: '#888', fontSize: '0.8rem' }}>produktów</span>
                                                <button
                                                    onClick={() => setCustomBatchMode(false)}
                                                    style={{
                                                        padding: '0.3rem 0.5rem',
                                                        background: '#333',
                                                        border: 'none',
                                                        borderRadius: '4px',
                                                        color: '#aaa',
                                                        fontSize: '0.75rem',
                                                        cursor: 'pointer'
                                                    }}
                                                >
                                                    ← Preset
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    {/* Zip each batch */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: zipEachBatch ? 'var(--accent)' : 'var(--text-gray)' }}>
                                        <input type="checkbox" checked={zipEachBatch} onChange={e => setZipEachBatch(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                        📦 Spakuj do ZIP (każdą paczkę)
                                    </label>

                                    {/* PIM Version */}
                                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                                        <span style={{ color: 'var(--text-gray)' }}>📋 Format pliku:</span>
                                        <div style={{ display: 'flex', gap: '0.25rem' }}>
                                            {(['PIM3', 'PIM4'] as const).map(v => (
                                                <button
                                                    key={v}
                                                    onClick={() => setPimVersion(v)}
                                                    style={{
                                                        padding: '0.3rem 0.75rem',
                                                        background: pimVersion === v ? '#1db954' : '#2a2a2a',
                                                        color: pimVersion === v ? 'black' : '#888',
                                                        border: 'none',
                                                        borderRadius: '6px',
                                                        fontSize: '0.8rem',
                                                        fontWeight: pimVersion === v ? 700 : 500,
                                                        cursor: 'pointer',
                                                        transition: 'all 0.15s ease'
                                                    }}
                                                >
                                                    {v}
                                                </button>
                                            ))}
                                        </div>
                                        {pimVersion === 'PIM4' && (
                                            <span style={{ color: '#666', fontSize: '0.75rem' }}>+ kolumna "Typ: singiel"</span>
                                        )}
                                    </div>

                                    {/* Save paths to Excel */}
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: savePathsToExcel ? 'var(--accent)' : 'var(--text-gray)' }}>
                                        <input type="checkbox" checked={savePathsToExcel} onChange={e => setSavePathsToExcel(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                        📝 Zapisz pełne ścieżki w Excel
                                    </label>
                                </div>

                                {/* Sound */}
                                <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer', color: soundEnabled ? 'var(--accent)' : 'var(--text-gray)', fontSize: '0.875rem' }}>
                                    <input type="checkbox" checked={soundEnabled} onChange={e => setSoundEnabled(e.target.checked)} style={{ accentColor: 'var(--accent)' }} />
                                    🔔 Dźwięk po zakończeniu
                                </label>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right: Progress + Log */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Progress */}
                    <div className="card">
                        <div className="card-body">
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                                <span style={{ fontSize: '0.875rem', color: 'var(--text-gray)' }}>{status}</span>
                                <span style={{ fontSize: '1.75rem', fontWeight: 700, color: 'var(--accent)' }}>{progress}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Log */}
                    <div className="card" style={{ flex: 1 }}>
                        <div className="card-header">📋 Log</div>
                        <div className="card-body" style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.8rem', fontFamily: 'monospace' }}>
                            {logs.map((log, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: '0.25rem 0',
                                        color: log.type === 'error' ? '#ef4444' : log.type === 'success' ? 'var(--accent)' : log.type === 'warning' ? '#fbbf24' : 'var(--text-gray)'
                                    }}
                                >
                                    <span style={{ color: 'var(--text-muted)' }}>[{log.timestamp}]</span> {log.message}
                                </div>
                            ))}
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem' }}>
                        <button
                            onClick={activeMode === 1 ? handleStart : handleStartLocal}
                            disabled={isProcessing || (activeMode === 1 ? !file : !folderPath.trim())}
                            className="btn btn-primary"
                            style={{ flex: 1 }}
                        >
                            {isProcessing ? '⏳ Przetwarzanie...' : '🚀 Uruchom'}
                        </button>
                        {downloadUrl && (
                            <button
                                disabled={isDownloading}
                                onClick={async () => {
                                    try {
                                        setIsDownloading(true);
                                        addLog('Pobieranie pliku...', 'info');
                                        const response = await fetch(downloadUrl);
                                        if (!response.ok) throw new Error('Download failed');
                                        const blob = await response.blob();
                                        const url = window.URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url;
                                        a.download = downloadFilename;
                                        document.body.appendChild(a);
                                        a.click();
                                        window.URL.revokeObjectURL(url);
                                        document.body.removeChild(a);
                                        addLog('Plik pobrany!', 'success');
                                    } catch (err) {
                                        addLog('Błąd pobierania pliku', 'error');
                                    } finally {
                                        setIsDownloading(false);
                                    }
                                }}
                                className="btn btn-primary"
                                style={{ minWidth: '120px' }}
                            >
                                {isDownloading ? '⏳ Pobieranie...' : '⬇️ Pobierz'}
                            </button>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
