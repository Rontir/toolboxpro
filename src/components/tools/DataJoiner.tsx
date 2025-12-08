'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';

interface JoinResult {
    matched: number;
    unmatched: number;
    total: number;
}

export default function DataJoiner() {
    const [mainFile, setMainFile] = useState<File | null>(null);
    const [lookupFile, setLookupFile] = useState<File | null>(null);
    const [mainColumns, setMainColumns] = useState<string[]>([]);
    const [lookupColumns, setLookupColumns] = useState<string[]>([]);
    const [mainKeyCol, setMainKeyCol] = useState<string>('');
    const [lookupKeyCol, setLookupKeyCol] = useState<string>('');
    const [selectedLookupCols, setSelectedLookupCols] = useState<string[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [result, setResult] = useState<JoinResult | null>(null);
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [joinType, setJoinType] = useState<'left' | 'inner'>('left');

    const loadFile = async (file: File): Promise<{ headers: string[], rows: Record<string, unknown>[] }> => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        return { headers, rows };
    };

    const handleMainFile = async (file: File) => {
        setMainFile(file);
        setResult(null);
        setOutputBlob(null);
        try {
            const { headers } = await loadFile(file);
            setMainColumns(headers);
            if (headers.length > 0 && !mainKeyCol) setMainKeyCol(headers[0]);
        } catch {
            setError('Błąd wczytywania pliku głównego');
        }
    };

    const handleLookupFile = async (file: File) => {
        setLookupFile(file);
        setResult(null);
        setOutputBlob(null);
        try {
            const { headers } = await loadFile(file);
            setLookupColumns(headers);
            if (headers.length > 0 && !lookupKeyCol) setLookupKeyCol(headers[0]);
            // Select all columns by default except key
            setSelectedLookupCols(headers.filter((_, i) => i > 0));
        } catch {
            setError('Błąd wczytywania pliku słownikowego');
        }
    };

    const toggleColumn = (col: string) => {
        setSelectedLookupCols(prev =>
            prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
        );
    };

    const joinData = async () => {
        if (!mainFile || !lookupFile || !mainKeyCol || !lookupKeyCol || selectedLookupCols.length === 0) return;

        setIsProcessing(true);
        setProgress(10);
        setError(null);
        setResult(null);
        setOutputBlob(null);

        try {
            const { rows: mainRows } = await loadFile(mainFile);
            setProgress(30);
            const { rows: lookupRows } = await loadFile(lookupFile);
            setProgress(50);

            // Build lookup map
            const lookupMap = new Map<string, Record<string, unknown>>();
            for (const row of lookupRows) {
                const key = String(row[lookupKeyCol] || '').trim().toLowerCase();
                if (key) lookupMap.set(key, row);
            }

            setProgress(70);

            // Join data
            let matched = 0;
            let unmatched = 0;
            const resultRows: Record<string, unknown>[] = [];

            for (const mainRow of mainRows) {
                const key = String(mainRow[mainKeyCol] || '').trim().toLowerCase();
                const lookupRow = lookupMap.get(key);

                if (lookupRow) {
                    matched++;
                    const newRow = { ...mainRow };
                    for (const col of selectedLookupCols) {
                        newRow[col] = lookupRow[col];
                    }
                    resultRows.push(newRow);
                } else {
                    unmatched++;
                    if (joinType === 'left') {
                        const newRow = { ...mainRow };
                        for (const col of selectedLookupCols) {
                            newRow[col] = '';
                        }
                        resultRows.push(newRow);
                    }
                }
            }

            setProgress(85);

            // Create output
            const ws = XLSX.utils.json_to_sheet(resultRows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Połączone');

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            setOutputBlob(blob);
            setResult({ matched, unmatched, total: mainRows.length });
            setProgress(100);

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nieznany błąd');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadResult = () => {
        if (!outputBlob || !mainFile) return;
        const baseName = mainFile.name.replace(/\.xlsx?$/i, '');
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}_połączone.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setMainFile(null);
        setLookupFile(null);
        setMainColumns([]);
        setLookupColumns([]);
        setMainKeyCol('');
        setLookupKeyCol('');
        setSelectedLookupCols([]);
        setResult(null);
        setOutputBlob(null);
        setError(null);
        setProgress(0);
    };

    const canProcess = mainFile && lookupFile && mainKeyCol && lookupKeyCol && selectedLookupCols.length > 0;

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Łącz dane z dwóch plików Excel (jak VLOOKUP)
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Main File */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div
                        className="upload-zone"
                        onClick={() => document.getElementById('main-file')?.click()}
                    >
                        <input
                            id="main-file"
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleMainFile(e.target.files[0])}
                        />
                        <span className="icon">{mainFile ? '✅' : '📊'}</span>
                        <p className="title">{mainFile?.name || 'Plik główny'}</p>
                        <p className="subtitle">Plik do którego dołączysz dane</p>
                    </div>

                    {mainColumns.length > 0 && (
                        <div className="card">
                            <div className="card-header">🔑 Kolumna klucza (główny)</div>
                            <div className="card-body">
                                <select
                                    value={mainKeyCol}
                                    onChange={e => setMainKeyCol(e.target.value)}
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
                                    {mainColumns.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Join Type */}
                    <div className="card">
                        <div className="card-header">⚙️ Typ łączenia</div>
                        <div className="card-body" style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setJoinType('left')}
                                className={`selection-card ${joinType === 'left' ? 'active' : ''}`}
                                style={{ flex: 1 }}
                            >
                                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>LEFT JOIN</div>
                                <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Zachowaj wszystkie</div>
                            </button>
                            <button
                                onClick={() => setJoinType('inner')}
                                className={`selection-card ${joinType === 'inner' ? 'active' : ''}`}
                                style={{ flex: 1 }}
                            >
                                <div style={{ fontWeight: 600, fontSize: '0.8rem' }}>INNER JOIN</div>
                                <div style={{ fontSize: '0.65rem', opacity: 0.8 }}>Tylko dopasowane</div>
                            </button>
                        </div>
                    </div>
                </div>

                {/* Lookup File */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div
                        className="upload-zone"
                        onClick={() => document.getElementById('lookup-file')?.click()}
                    >
                        <input
                            id="lookup-file"
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleLookupFile(e.target.files[0])}
                        />
                        <span className="icon">{lookupFile ? '✅' : '📁'}</span>
                        <p className="title">{lookupFile?.name || 'Plik słownikowy'}</p>
                        <p className="subtitle">Plik z danymi do dołączenia</p>
                    </div>

                    {lookupColumns.length > 0 && (
                        <>
                            <div className="card">
                                <div className="card-header">🔑 Kolumna klucza (słownik)</div>
                                <div className="card-body">
                                    <select
                                        value={lookupKeyCol}
                                        onChange={e => setLookupKeyCol(e.target.value)}
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
                                        {lookupColumns.map(col => (
                                            <option key={col} value={col}>{col}</option>
                                        ))}
                                    </select>
                                </div>
                            </div>

                            <div className="card">
                                <div className="card-header">📋 Kolumny do dołączenia ({selectedLookupCols.length})</div>
                                <div className="card-body" style={{ maxHeight: '150px', overflowY: 'auto' }}>
                                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                        {lookupColumns.filter(c => c !== lookupKeyCol).map(col => (
                                            <button
                                                key={col}
                                                onClick={() => toggleColumn(col)}
                                                className={`toggle-button ${selectedLookupCols.includes(col) ? 'active' : ''}`}
                                            >
                                                {col}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        </>
                    )}
                </div>
            </div>

            {/* Process Button */}
            <button
                className="btn btn-primary"
                onClick={result ? downloadResult : joinData}
                disabled={!canProcess || isProcessing}
                style={{ width: '100%' }}
            >
                {isProcessing ? '⏳ Łączenie...' : result ? '📥 Pobierz wynik' : '🔗 Połącz dane'}
            </button>

            {result && (
                <button className="btn btn-secondary" onClick={reset} style={{ width: '100%' }}>
                    🔄 Nowe łączenie
                </button>
            )}

            {/* Result */}
            {result && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{result.matched}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Dopasowane</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>{result.unmatched}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Bez dopasowania</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-white)' }}>
                            {((result.matched / result.total) * 100).toFixed(1)}%
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Skuteczność</div>
                    </div>
                </div>
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
