'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

interface MatchResult {
    goldMatched: number;
    goldTotal: number;
    empikMatched: number;
    empikTotal: number;
}

interface DetectedColumns {
    gold: string | null;
    empik: string | null;
}

export default function StrukturMatcher() {
    const [batchFile, setBatchFile] = useState<File | null>(null);
    const [goldBaseFile, setGoldBaseFile] = useState<File | null>(null);
    const [empikBaseFile, setEmpikBaseFile] = useState<File | null>(null);
    const [batchColumns, setBatchColumns] = useState<string[]>([]);
    const [detectedColumns, setDetectedColumns] = useState<DetectedColumns>({ gold: null, empik: null });
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [result, setResult] = useState<MatchResult | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    // Normalize path for matching
    const normalizePath = (path: string | null | undefined): string => {
        if (!path) return '';
        let normalized = String(path).toLowerCase();
        normalized = normalized.replace(/["']/g, '');
        normalized = normalized.replace(/\s/g, '');
        normalized = normalized.replace(/>/g, '/');
        normalized = normalized.replace(/\/+/g, '/');
        normalized = normalized.replace(/^\/|\/$/g, '');
        return normalized;
    };

    // Detect column type
    const detectColumnType = (colName: string): 'gold' | 'empik' | null => {
        const lower = colName.toLowerCase();
        if (lower.includes('gold') || lower.includes('struktura towarowa gold')) {
            return 'gold';
        }
        if (lower.includes('empik.com') || lower.includes('empik')) {
            return 'empik';
        }
        return null;
    };

    const handleBatchDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find(f => f.name.match(/\.(xlsx?|csv)$/i));
        if (f) handleBatchFile(f);
    }, []);

    const handleBatchFile = async (file: File) => {
        setBatchFile(file);
        setBatchColumns([]);
        setDetectedColumns({ gold: null, empik: null });
        setOutputBlob(null);
        setResult(null);
        setLogs([]);

        try {
            const data = await file.arrayBuffer();
            let headers: string[] = [];

            if (file.name.match(/\.csv$/i)) {
                const text = new TextDecoder('utf-8').decode(data);
                const firstLine = text.split('\n')[0];
                headers = firstLine.split(/[,;]/).map(h => h.trim().replace(/"/g, ''));
            } else {
                const workbook = XLSX.read(data, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const json: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
                if (json.length > 0) {
                    headers = Object.keys(json[0]);
                }
            }

            setBatchColumns(headers);

            // Auto-detect columns
            let goldCol: string | null = null;
            let empikCol: string | null = null;

            for (const col of headers) {
                const type = detectColumnType(col);
                if (type === 'gold' && !goldCol) goldCol = col;
                if (type === 'empik' && !empikCol) empikCol = col;
            }

            setDetectedColumns({ gold: goldCol, empik: empikCol });

            addLog(`Wczytano plik: ${headers.length} kolumn`);
            if (goldCol) addLog(`✅ Wykryto kolumnę GOLD: "${goldCol}"`);
            if (empikCol) addLog(`✅ Wykryto kolumnę empik.com: "${empikCol}"`);
            if (!goldCol && !empikCol) addLog(`⚠️ Nie wykryto automatycznie kolumn struktur`);

        } catch (err) {
            setError('Błąd wczytywania pliku wsadowego');
        }
    };

    const loadBaseFile = async (file: File): Promise<Map<string, string>> => {
        const data = await file.arrayBuffer();
        let text: string = '';

        // Try different encodings
        const encodings = ['utf-8', 'windows-1250', 'iso-8859-2'];
        for (const encoding of encodings) {
            try {
                text = new TextDecoder(encoding).decode(data);
                if (text.includes('|')) break;
            } catch {
                continue;
            }
        }

        const lines = text.split('\n').filter(l => l.trim());
        const map = new Map<string, string>();

        for (let i = 1; i < lines.length; i++) {
            const parts = lines[i].split('|');
            if (parts.length >= 2) {
                const kod = parts[0].trim().replace(/"/g, '');
                const sciezka = parts[1].trim().replace(/"/g, '');
                const normalizedPath = normalizePath(sciezka);
                if (normalizedPath && kod) {
                    map.set(normalizedPath, kod);
                }
            }
        }

        return map;
    };

    const processFiles = async () => {
        if (!batchFile) return;
        if (!detectedColumns.gold && !detectedColumns.empik) {
            setError('Nie wykryto kolumn struktur w pliku wsadowym');
            return;
        }
        if (detectedColumns.gold && !goldBaseFile) {
            setError('Dodaj plik bazowy dla Struktura towarowa GOLD');
            return;
        }
        if (detectedColumns.empik && !empikBaseFile) {
            setError('Dodaj plik bazowy dla empik.com');
            return;
        }

        setIsProcessing(true);
        setProgress(10);
        setError(null);
        setOutputBlob(null);
        setResult(null);
        setLogs([]);
        addLog('Rozpoczynam przetwarzanie...');

        try {
            // Load batch file
            const batchData = await batchFile.arrayBuffer();
            let batchRows: Record<string, unknown>[];

            if (batchFile.name.match(/\.csv$/i)) {
                const text = new TextDecoder('utf-8').decode(batchData);
                const lines = text.split('\n').filter(l => l.trim());
                const headers = lines[0].split(/[,;]/).map(h => h.trim().replace(/"/g, ''));
                batchRows = lines.slice(1).map(line => {
                    const values = line.split(/[,;]/).map(v => v.trim().replace(/"/g, ''));
                    const row: Record<string, unknown> = {};
                    headers.forEach((h, i) => row[h] = values[i] || '');
                    return row;
                });
            } else {
                const workbook = XLSX.read(batchData, { type: 'array' });
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                batchRows = XLSX.utils.sheet_to_json(sheet);
            }

            addLog(`Wczytano ${batchRows.length} wierszy z pliku wsadowego`);
            setProgress(20);

            // Load base files
            let goldMap: Map<string, string> = new Map();
            let empikMap: Map<string, string> = new Map();

            if (detectedColumns.gold && goldBaseFile) {
                goldMap = await loadBaseFile(goldBaseFile);
                addLog(`Wczytano ${goldMap.size} ścieżek GOLD`);
            }
            setProgress(35);

            if (detectedColumns.empik && empikBaseFile) {
                empikMap = await loadBaseFile(empikBaseFile);
                addLog(`Wczytano ${empikMap.size} ścieżek empik.com`);
            }
            setProgress(50);

            // Match
            let goldMatched = 0;
            let goldTotal = 0;
            let empikMatched = 0;
            let empikTotal = 0;

            const resultRows: Record<string, unknown>[] = [];

            for (const row of batchRows) {
                const newRow: Record<string, unknown> = {};

                // GOLD mapping
                if (detectedColumns.gold) {
                    const goldPath = String(row[detectedColumns.gold] || '');
                    if (goldPath.trim()) {
                        goldTotal++;
                        const normalizedPath = normalizePath(goldPath);
                        const kod = goldMap.get(normalizedPath) || '';
                        if (kod) goldMatched++;
                        newRow['KOD GOLD'] = kod;
                    } else {
                        newRow['KOD GOLD'] = '';
                    }
                }

                // empik.com mapping
                if (detectedColumns.empik) {
                    const empikPath = String(row[detectedColumns.empik] || '');
                    if (empikPath.trim()) {
                        empikTotal++;
                        const normalizedPath = normalizePath(empikPath);
                        const kod = empikMap.get(normalizedPath) || '';
                        if (kod) empikMatched++;
                        newRow['KOD EMPIK'] = kod;
                    } else {
                        newRow['KOD EMPIK'] = '';
                    }
                }

                // Add original columns
                for (const [key, value] of Object.entries(row)) {
                    newRow[key] = value;
                }

                resultRows.push(newRow);
            }

            if (detectedColumns.gold) {
                addLog(`GOLD: ${goldMatched}/${goldTotal} (${goldTotal > 0 ? ((goldMatched / goldTotal) * 100).toFixed(1) : 0}%)`);
            }
            if (detectedColumns.empik) {
                addLog(`empik.com: ${empikMatched}/${empikTotal} (${empikTotal > 0 ? ((empikMatched / empikTotal) * 100).toFixed(1) : 0}%)`);
            }
            setProgress(80);

            // Create output
            const ws = XLSX.utils.json_to_sheet(resultRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Wynik');

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            setOutputBlob(blob);
            setResult({
                goldMatched,
                goldTotal,
                empikMatched,
                empikTotal
            });
            setProgress(100);
            addLog('✅ Gotowe!');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nieznany błąd');
            addLog(`❌ Błąd: ${err instanceof Error ? err.message : 'Nieznany błąd'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadResult = () => {
        if (!outputBlob || !batchFile) return;
        const baseName = batchFile.name.replace(/\.(xlsx?|csv)$/i, '');
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}_mapowanie.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setBatchFile(null);
        setGoldBaseFile(null);
        setEmpikBaseFile(null);
        setBatchColumns([]);
        setDetectedColumns({ gold: null, empik: null });
        setProgress(0);
        setError(null);
        setOutputBlob(null);
        setResult(null);
        setLogs([]);
    };

    const canProcess = batchFile &&
        (detectedColumns.gold || detectedColumns.empik) &&
        (!detectedColumns.gold || goldBaseFile) &&
        (!detectedColumns.empik || empikBaseFile);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Description */}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Automatycznie wykrywa kolumny GOLD i empik.com i mapuje do kodów
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Batch File Upload */}
                    <div
                        className="upload-zone"
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleBatchDrop}
                        onClick={() => document.getElementById('batch-file')?.click()}
                    >
                        <input
                            id="batch-file"
                            type="file"
                            accept=".xlsx,.xls,.csv"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleBatchFile(e.target.files[0])}
                        />
                        <span className="icon">{batchFile ? '✅' : '📊'}</span>
                        <p className="title">{batchFile?.name || 'Plik wsadowy'}</p>
                        <p className="subtitle">Produkty do mapowania (Excel/CSV)</p>
                    </div>

                    {/* Detected Columns Info */}
                    {batchFile && (
                        <div className="card">
                            <div className="card-header">🔍 Wykryte kolumny</div>
                            <div className="card-body" style={{ fontSize: '0.85rem' }}>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.5rem',
                                    background: detectedColumns.gold ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                                    borderRadius: '6px',
                                    marginBottom: '0.5rem'
                                }}>
                                    <span>{detectedColumns.gold ? '✅' : '❌'}</span>
                                    <span style={{ fontWeight: 600 }}>GOLD:</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        {detectedColumns.gold || 'Nie wykryto'}
                                    </span>
                                </div>
                                <div style={{
                                    display: 'flex',
                                    alignItems: 'center',
                                    gap: '0.5rem',
                                    padding: '0.5rem',
                                    background: detectedColumns.empik ? 'rgba(74, 222, 128, 0.1)' : 'rgba(248, 113, 113, 0.1)',
                                    borderRadius: '6px'
                                }}>
                                    <span>{detectedColumns.empik ? '✅' : '❌'}</span>
                                    <span style={{ fontWeight: 600 }}>empik.com:</span>
                                    <span style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                                        {detectedColumns.empik || 'Nie wykryto'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Base Files */}
                    {detectedColumns.gold && (
                        <div
                            className="upload-zone"
                            onClick={() => document.getElementById('gold-base')?.click()}
                            style={{ padding: '1rem' }}
                        >
                            <input
                                id="gold-base"
                                type="file"
                                accept=".csv"
                                style={{ display: 'none' }}
                                onChange={e => e.target.files?.[0] && setGoldBaseFile(e.target.files[0])}
                            />
                            <span className="icon">{goldBaseFile ? '✅' : '🏷️'}</span>
                            <p className="title">{goldBaseFile?.name || 'Plik bazowy GOLD'}</p>
                            <p className="subtitle">Struktura towarowa GOLD (CSV)</p>
                        </div>
                    )}

                    {detectedColumns.empik && (
                        <div
                            className="upload-zone"
                            onClick={() => document.getElementById('empik-base')?.click()}
                            style={{ padding: '1rem' }}
                        >
                            <input
                                id="empik-base"
                                type="file"
                                accept=".csv"
                                style={{ display: 'none' }}
                                onChange={e => e.target.files?.[0] && setEmpikBaseFile(e.target.files[0])}
                            />
                            <span className="icon">{empikBaseFile ? '✅' : '🛒'}</span>
                            <p className="title">{empikBaseFile?.name || 'Plik bazowy empik.com'}</p>
                            <p className="subtitle">Struktura empik.com (CSV)</p>
                        </div>
                    )}

                    {/* Process Button */}
                    <button
                        className="btn btn-primary"
                        onClick={outputBlob ? downloadResult : processFiles}
                        disabled={!canProcess || isProcessing}
                        style={{ width: '100%' }}
                    >
                        {isProcessing ? '⏳ Przetwarzanie...' : outputBlob ? '📥 Pobierz wynik' : '🚀 Mapuj struktury'}
                    </button>

                    {outputBlob && (
                        <button className="btn btn-secondary" onClick={reset} style={{ width: '100%' }}>
                            🔄 Nowe mapowanie
                        </button>
                    )}
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Progress Card */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>📊 Status</span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{progress}%</span>
                        </div>
                        <div className="card-body">
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Result */}
                    {result && (
                        <div className="card">
                            <div className="card-header">✅ Wynik mapowania</div>
                            <div className="card-body">
                                {result.goldTotal > 0 && (
                                    <div style={{
                                        padding: '0.75rem',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '6px',
                                        marginBottom: result.empikTotal > 0 ? '0.5rem' : 0
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600 }}>🏷️ GOLD</span>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                                                {((result.goldMatched / result.goldTotal) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {result.goldMatched} / {result.goldTotal} dopasowanych
                                        </div>
                                    </div>
                                )}
                                {result.empikTotal > 0 && (
                                    <div style={{
                                        padding: '0.75rem',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '6px'
                                    }}>
                                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                            <span style={{ fontWeight: 600 }}>🛒 empik.com</span>
                                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                                                {((result.empikMatched / result.empikTotal) * 100).toFixed(1)}%
                                            </span>
                                        </div>
                                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                            {result.empikMatched} / {result.empikTotal} dopasowanych
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Log */}
                    <div className="card" style={{ flex: 1 }}>
                        <div className="card-header">📋 Log</div>
                        <div className="card-body" style={{ maxHeight: '180px', overflowY: 'auto', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                            {logs.length > 0 ? logs.map((log, i) => (
                                <div key={i} style={{ padding: '0.15rem 0', color: log.includes('✅') ? 'var(--accent)' : log.includes('❌') ? 'var(--error)' : log.includes('⚠️') ? '#fbbf24' : 'var(--text-muted)' }}>
                                    {log}
                                </div>
                            )) : (
                                <div style={{ color: 'var(--text-muted)' }}>
                                    Wgraj plik wsadowy aby wykryć kolumny.
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Error */}
                    {error && (
                        <div style={{
                            padding: '0.75rem 1rem',
                            background: 'rgba(248, 113, 113, 0.1)',
                            border: '1px solid var(--error)',
                            borderRadius: '8px',
                            color: 'var(--error)',
                            fontSize: '0.85rem'
                        }}>
                            ❌ {error}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
