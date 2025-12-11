'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useExcelWorker } from '@/hooks/useExcelWorker';

interface CompareResult {
    onlyInA: number;
    onlyInB: number;
    inBoth: number;
    different: number;
    identical: number;
}

interface DiffRow {
    key: string;
    status: 'only_a' | 'only_b' | 'different' | 'identical';
    dataA?: Record<string, unknown>;
    dataB?: Record<string, unknown>;
    differences?: string[];
}

export default function ExcelCompare() {
    const [fileA, setFileA] = useState<File | null>(null);
    const [fileB, setFileB] = useState<File | null>(null);
    const [columnsA, setColumnsA] = useState<string[]>([]);
    const [columnsB, setColumnsB] = useState<string[]>([]);
    const [keyColumnA, setKeyColumnA] = useState<string>('');
    const [keyColumnB, setKeyColumnB] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<CompareResult | null>(null);
    const [diffs, setDiffs] = useState<DiffRow[]>([]);
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [showFilter, setShowFilter] = useState<'all' | 'only_a' | 'only_b' | 'different'>('all');
    // Loading state for file upload
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    // Web Worker for Excel parsing
    const { parseExcel } = useExcelWorker();

    const loadFile = async (file: File): Promise<{ headers: string[], rows: Record<string, unknown>[] }> => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        return { headers, rows };
    };

    const handleFileA = async (file: File) => {
        setFileA(file);
        setResult(null);
        setDiffs([]);
        setOutputBlob(null);
        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${file.name}...`);
        try {
            const { headers } = await parseExcel(file);
            setColumnsA(headers);
            // Auto-select first column as key
            if (headers.length > 0 && !keyColumnA) setKeyColumnA(headers[0]);
        } catch {
            setError('Błąd wczytywania pliku A');
        } finally {
            setIsLoading(false);
        }
    };

    const handleFileB = async (file: File) => {
        setFileB(file);
        setResult(null);
        setDiffs([]);
        setOutputBlob(null);
        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${file.name}...`);
        try {
            const { headers } = await parseExcel(file);
            setColumnsB(headers);
            // Auto-select first column as key
            if (headers.length > 0 && !keyColumnB) setKeyColumnB(headers[0]);
        } catch {
            setError('Błąd wczytywania pliku B');
        } finally {
            setIsLoading(false);
        }
    };

    const compare = async () => {
        if (!fileA || !fileB || !keyColumnA || !keyColumnB) return;

        setIsProcessing(true);
        setProgress(10);
        setError(null);
        setResult(null);
        setDiffs([]);
        setOutputBlob(null);

        try {
            const { rows: rowsA } = await loadFile(fileA);
            setProgress(30);
            const { rows: rowsB } = await loadFile(fileB);
            setProgress(50);

            // Build maps
            const mapA = new Map<string, Record<string, unknown>>();
            const mapB = new Map<string, Record<string, unknown>>();

            for (const row of rowsA) {
                const key = String(row[keyColumnA] || '').trim();
                if (key) mapA.set(key, row);
            }

            for (const row of rowsB) {
                const key = String(row[keyColumnB] || '').trim();
                if (key) mapB.set(key, row);
            }

            setProgress(70);

            // Compare
            const diffRows: DiffRow[] = [];
            let onlyInA = 0, onlyInB = 0, different = 0, identical = 0;

            // Check A against B
            for (const [key, dataA] of mapA) {
                const dataB = mapB.get(key);

                if (!dataB) {
                    onlyInA++;
                    diffRows.push({ key, status: 'only_a', dataA });
                } else {
                    // Compare values
                    const diffs: string[] = [];
                    const allKeys = new Set([...Object.keys(dataA), ...Object.keys(dataB)]);

                    for (const col of allKeys) {
                        const valA = String(dataA[col] ?? '').trim();
                        const valB = String(dataB[col] ?? '').trim();
                        if (valA !== valB) {
                            diffs.push(col);
                        }
                    }

                    if (diffs.length > 0) {
                        different++;
                        diffRows.push({ key, status: 'different', dataA, dataB, differences: diffs });
                    } else {
                        identical++;
                        diffRows.push({ key, status: 'identical', dataA, dataB });
                    }
                }
            }

            // Check B for items not in A
            for (const [key, dataB] of mapB) {
                if (!mapA.has(key)) {
                    onlyInB++;
                    diffRows.push({ key, status: 'only_b', dataB });
                }
            }

            setProgress(90);

            // Create output Excel
            const outputData = diffRows.map(d => ({
                'Status': d.status === 'only_a' ? 'Tylko w A' :
                    d.status === 'only_b' ? 'Tylko w B' :
                        d.status === 'different' ? 'Różnice' : 'Identyczny',
                'Klucz': d.key,
                'Różniące się kolumny': d.differences?.join(', ') || '',
                ...d.dataA,
                ...(d.dataB ? Object.fromEntries(Object.entries(d.dataB).map(([k, v]) => [`${k} (B)`, v])) : {})
            }));

            const ws = XLSX.utils.json_to_sheet(outputData);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Porównanie');

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            setOutputBlob(blob);
            setResult({ onlyInA, onlyInB, inBoth: different + identical, different, identical });
            setDiffs(diffRows);
            setProgress(100);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nieznany błąd');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadResult = () => {
        if (!outputBlob) return;
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'porownanie.xlsx';
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setFileA(null);
        setFileB(null);
        setColumnsA([]);
        setColumnsB([]);
        setKeyColumnA('');
        setKeyColumnB('');
        setResult(null);
        setDiffs([]);
        setOutputBlob(null);
        setError(null);
        setProgress(0);
    };

    const filteredDiffs = diffs.filter(d =>
        showFilter === 'all' ? d.status !== 'identical' : d.status === showFilter
    );

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem', position: 'relative' }}>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="spinner"></div>
                    <p>{loadingText}</p>
                </div>
            )}

            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Porównaj dwa pliki Excel i znajdź różnice
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left - File A */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div
                        className="upload-zone"
                        onClick={() => document.getElementById('file-a')?.click()}
                        style={{ borderColor: fileA ? 'var(--accent)' : undefined }}
                    >
                        <input
                            id="file-a"
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleFileA(e.target.files[0])}
                        />
                        <span className="icon">{fileA ? '📊' : '📁'}</span>
                        <p className="title">{fileA?.name || 'Plik A (bazowy)'}</p>
                        <p className="subtitle">Pierwszy plik do porównania</p>
                    </div>

                    {columnsA.length > 0 && (
                        <div className="card">
                            <div className="card-header">🔑 Kolumna klucza (A)</div>
                            <div className="card-body">
                                <select
                                    value={keyColumnA}
                                    onChange={e => setKeyColumnA(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--text-white)',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    {columnsA.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>

                {/* Right - File B */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div
                        className="upload-zone"
                        onClick={() => document.getElementById('file-b')?.click()}
                        style={{ borderColor: fileB ? '#60a5fa' : undefined }}
                    >
                        <input
                            id="file-b"
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleFileB(e.target.files[0])}
                        />
                        <span className="icon">{fileB ? '📊' : '📁'}</span>
                        <p className="title">{fileB?.name || 'Plik B (nowy)'}</p>
                        <p className="subtitle">Drugi plik do porównania</p>
                    </div>

                    {columnsB.length > 0 && (
                        <div className="card">
                            <div className="card-header">🔑 Kolumna klucza (B)</div>
                            <div className="card-body">
                                <select
                                    value={keyColumnB}
                                    onChange={e => setKeyColumnB(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--text-white)',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    {columnsB.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Compare Button */}
            <button
                className="btn btn-primary"
                onClick={result ? downloadResult : compare}
                disabled={!fileA || !fileB || !keyColumnA || !keyColumnB || isProcessing}
                style={{ width: '100%' }}
            >
                {isProcessing ? '⏳ Porównywanie...' : result ? '📥 Pobierz raport' : '🔍 Porównaj pliki'}
            </button>

            {result && (
                <button className="btn btn-secondary" onClick={reset} style={{ width: '100%' }}>
                    🔄 Nowe porównanie
                </button>
            )}

            {/* Results */}
            {result && (
                <>
                    {/* Stats */}
                    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#fbbf24' }}>{result.onlyInA}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tylko w A</div>
                        </div>
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#60a5fa' }}>{result.onlyInB}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Tylko w B</div>
                        </div>
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>{result.different}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Różnice</div>
                        </div>
                        <div className="card" style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{result.identical}</div>
                            <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Identyczne</div>
                        </div>
                    </div>

                    {/* Filter */}
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                        {(['all', 'only_a', 'only_b', 'different'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setShowFilter(f)}
                                style={{
                                    flex: 1,
                                    padding: '0.5rem',
                                    background: showFilter === f ? 'var(--accent)' : 'var(--bg-tertiary)',
                                    color: showFilter === f ? 'black' : 'var(--text-muted)',
                                    border: 'none',
                                    borderRadius: '6px',
                                    cursor: 'pointer',
                                    fontSize: '0.8rem',
                                    fontWeight: showFilter === f ? 700 : 500
                                }}
                            >
                                {f === 'all' ? 'Wszystkie' : f === 'only_a' ? 'Tylko A' : f === 'only_b' ? 'Tylko B' : 'Różnice'}
                            </button>
                        ))}
                    </div>

                    {/* Diff List */}
                    <div className="card" style={{ maxHeight: '300px', overflow: 'auto' }}>
                        <div className="card-header">📋 Szczegóły ({filteredDiffs.length})</div>
                        <div className="card-body" style={{ padding: 0 }}>
                            {filteredDiffs.slice(0, 100).map((d, i) => (
                                <div
                                    key={i}
                                    style={{
                                        padding: '0.5rem 1rem',
                                        borderBottom: '1px solid var(--border)',
                                        fontSize: '0.8rem',
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '0.75rem'
                                    }}
                                >
                                    <span style={{
                                        width: '8px',
                                        height: '8px',
                                        borderRadius: '50%',
                                        background: d.status === 'only_a' ? '#fbbf24' :
                                            d.status === 'only_b' ? '#60a5fa' :
                                                d.status === 'different' ? '#f87171' : 'var(--accent)'
                                    }} />
                                    <span style={{ fontWeight: 600 }}>{d.key}</span>
                                    {d.differences && (
                                        <span style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                            ({d.differences.join(', ')})
                                        </span>
                                    )}
                                </div>
                            ))}
                            {filteredDiffs.length > 100 && (
                                <div style={{ padding: '1rem', textAlign: 'center', color: 'var(--text-muted)' }}>
                                    ...i {filteredDiffs.length - 100} więcej (zobacz w raporcie)
                                </div>
                            )}
                        </div>
                    </div>
                </>
            )}

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
    );
}
