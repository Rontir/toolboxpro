'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDroppedFile } from '@/components/DroppedFileContext';

type TabType = 'split' | 'merge';

interface SplitResult {
    name: string;
    url: string;
    rowCount: number;
}

export default function ExcelSplitter() {
    const [tab, setTab] = useState<TabType>('split');
    const [file, setFile] = useState<File | null>(null);
    const [mergeFiles, setMergeFiles] = useState<File[]>([]);
    const [rowsPerFile, setRowsPerFile] = useState(1000);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<SplitResult[]>([]);
    const [mergeResult, setMergeResult] = useState<{ url: string; name: string; rows: number; cols: number } | null>(null);
    const [totalRows, setTotalRows] = useState(0);
    // Merge options
    const [addSourceColumn, setAddSourceColumn] = useState(true);
    const [sortAlphabetically, setSortAlphabetically] = useState(true);
    const [removeDuplicates, setRemoveDuplicates] = useState(false);
    // Loading state for file upload
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    const { consumeDroppedFile } = useDroppedFile();

    // Check for dropped file on mount
    useEffect(() => {
        const droppedFile = consumeDroppedFile();
        if (droppedFile && droppedFile.name.match(/\.xlsx?$/i)) {
            setFile(droppedFile);
        }
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const droppedFiles = Array.from(e.dataTransfer.files).filter(f => f.name.match(/\.xlsx?$/i));
        if (droppedFiles.length === 0) return;

        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${droppedFiles.length} plików...`);

        requestAnimationFrame(() => {
            setTimeout(() => {
                if (tab === 'split' && droppedFiles[0]) {
                    setFile(droppedFiles[0]);
                } else if (tab === 'merge') {
                    setMergeFiles(prev => [...prev, ...droppedFiles]);
                }
                setIsLoading(false);
            }, 100);
        });
    }, [tab]);

    // Read row count when file is selected
    useEffect(() => {
        if (!file) {
            setTotalRows(0);
            return;
        }
        (async () => {
            try {
                const XLSX = await import('xlsx');
                const buffer = await file.arrayBuffer();
                const workbook = XLSX.read(buffer);
                const sheet = workbook.Sheets[workbook.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];
                setTotalRows(Math.max(0, data.length - 1)); // minus header
            } catch {
                setTotalRows(0);
            }
        })();
    }, [file]);

    const estimatedChunks = totalRows > 0 && rowsPerFile > 0
        ? Math.ceil(totalRows / rowsPerFile)
        : 0;

    const processSplit = async () => {
        if (!file) return;
        setIsProcessing(true);
        setResults([]);
        setProgress(10);

        try {
            const XLSX = await import('xlsx');
            const buffer = await file.arrayBuffer();
            setProgress(30);

            const workbook = XLSX.read(buffer);
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const data = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

            const headers = data[0] as string[];
            const rows = data.slice(1);
            const chunks: unknown[][][] = [];

            for (let i = 0; i < rows.length; i += rowsPerFile) {
                chunks.push(rows.slice(i, i + rowsPerFile));
            }

            setProgress(50);
            const newResults: SplitResult[] = [];

            chunks.forEach((chunk, idx) => {
                const newWb = XLSX.utils.book_new();
                const newData = [headers, ...chunk];
                const newSheet = XLSX.utils.aoa_to_sheet(newData);
                XLSX.utils.book_append_sheet(newWb, newSheet, 'Data');

                const wbOut = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
                const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

                const baseName = file.name.replace(/\.xlsx?$/i, '');
                newResults.push({
                    name: `${baseName}_part${idx + 1}.xlsx`,
                    url: URL.createObjectURL(blob),
                    rowCount: chunk.length,
                });

                setProgress(50 + Math.round((idx / chunks.length) * 50));
            });

            setResults(newResults);
            setProgress(100);
        } catch (e) {
            console.error('Error splitting file:', e);
        }

        setIsProcessing(false);
    };

    const processMerge = async () => {
        if (mergeFiles.length < 2) return;
        setIsProcessing(true);
        setMergeResult(null);
        setProgress(10);

        try {
            const XLSX = await import('xlsx');

            // Sort files if needed
            let filesToMerge = [...mergeFiles];
            if (sortAlphabetically) {
                filesToMerge.sort((a, b) => a.name.localeCompare(b.name));
            }

            const allData: Record<string, unknown>[] = [];
            const allColumns = new Set<string>();

            for (let i = 0; i < filesToMerge.length; i++) {
                const buffer = await filesToMerge[i].arrayBuffer();
                const wb = XLSX.read(buffer);
                const sheet = wb.Sheets[wb.SheetNames[0]];
                const data = XLSX.utils.sheet_to_json(sheet) as Record<string, unknown>[];

                // Add source column if enabled
                if (addSourceColumn) {
                    data.forEach(row => {
                        row['_ŹRÓDŁO'] = filesToMerge[i].name;
                    });
                }

                // Collect columns
                if (data.length > 0) {
                    Object.keys(data[0]).forEach(col => allColumns.add(col));
                }

                allData.push(...data);
                setProgress(10 + Math.round((i / filesToMerge.length) * 70));
            }

            // Remove duplicates if enabled
            let finalData = allData;
            if (removeDuplicates) {
                const seen = new Set<string>();
                finalData = allData.filter(row => {
                    const key = JSON.stringify(row);
                    if (seen.has(key)) return false;
                    seen.add(key);
                    return true;
                });
            }

            const newWb = XLSX.utils.book_new();
            const newSheet = XLSX.utils.json_to_sheet(finalData);
            XLSX.utils.book_append_sheet(newWb, newSheet, 'Połączone');

            // Add info sheet
            const infoData = [
                { 'Parametr': 'Data połączenia', 'Wartość': new Date().toLocaleString('pl-PL') },
                { 'Parametr': 'Liczba plików', 'Wartość': filesToMerge.length },
                { 'Parametr': 'Wierszy', 'Wartość': finalData.length },
                { 'Parametr': 'Kolumn', 'Wartość': allColumns.size },
            ];
            const infoSheet = XLSX.utils.json_to_sheet(infoData);
            XLSX.utils.book_append_sheet(newWb, infoSheet, 'Info');

            const wbOut = XLSX.write(newWb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbOut], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            setMergeResult({
                name: `polaczone_${Date.now()}.xlsx`,
                url: URL.createObjectURL(blob),
                rows: finalData.length,
                cols: allColumns.size
            });

            setProgress(100);
        } catch (e) {
            console.error('Error merging files:', e);
        }

        setIsProcessing(false);
    };

    const downloadAll = () => {
        results.forEach(r => {
            const a = document.createElement('a');
            a.href = r.url;
            a.download = r.name;
            a.click();
        });
    };

    // Helper for file input with loading
    const handleFileSelect = (files: FileList | null, isMerge: boolean) => {
        if (!files || files.length === 0) return;
        const excelFiles = Array.from(files).filter(f => f.name.match(/\.xlsx?$/i));
        if (excelFiles.length === 0) return;

        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${excelFiles.length} plików...`);

        requestAnimationFrame(() => {
            setTimeout(() => {
                if (isMerge) {
                    setMergeFiles(prev => [...prev, ...excelFiles]);
                } else {
                    setFile(excelFiles[0]);
                }
                setIsLoading(false);
            }, 100);
        });
    };

    return (
        <div className="max-w-4xl" style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="upload-progress-spinner" />
                    <p style={{ color: 'white', fontSize: '18px', marginTop: '20px' }}>{loadingText}</p>
                </div>
            )}
            {/* Tabs */}
            <div className="filter-pills">
                <button
                    onClick={() => { setTab('split'); setResults([]); setMergeResult(null); }}
                    className={`filter-pill ${tab === 'split' ? 'active' : ''}`}
                >
                    ✂️ Dzielenie
                </button>
                <button
                    onClick={() => { setTab('merge'); setResults([]); setMergeResult(null); }}
                    className={`filter-pill ${tab === 'merge' ? 'active' : ''}`}
                >
                    🔗 Łączenie
                </button>
            </div>

            {/* Split Tab */}
            {tab === 'split' && (
                <>
                    {/* Upload Zone */}
                    <div
                        className="upload-zone"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('excel-input')?.click()}
                    >
                        <input
                            type="file"
                            id="excel-input"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={(e) => handleFileSelect(e.target.files, false)}
                        />
                        <span className="icon">📊</span>
                        <p className="title">{file?.name || 'Przeciągnij plik Excel'}</p>
                        <p className="subtitle">lub kliknij aby wybrać</p>
                    </div>

                    {/* Options */}
                    <div className="card">
                        <div className="card-header">⚙️ Opcje podziału</div>
                        <div className="card-body">
                            <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
                                <label style={{ fontSize: '14px', color: 'var(--text-gray)' }}>Wierszy na plik:</label>
                                <input
                                    type="number"
                                    className="form-input"
                                    style={{ width: '120px' }}
                                    value={rowsPerFile}
                                    onChange={e => setRowsPerFile(Number(e.target.value))}
                                    min={1}
                                />
                                <div className="filter-pills">
                                    {[100, 500, 1000, 5000].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => setRowsPerFile(n)}
                                            className={`filter-pill ${rowsPerFile === n ? 'active' : ''}`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                                {/* Live chunk count preview */}
                                {totalRows > 0 && (
                                    <div style={{
                                        display: 'flex',
                                        alignItems: 'center',
                                        gap: '8px',
                                        padding: '6px 12px',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '8px',
                                        border: '1px solid var(--border)'
                                    }}>
                                        <span style={{ color: 'var(--text-muted)', fontSize: '13px' }}>
                                            📊 {totalRows.toLocaleString()} wierszy
                                        </span>
                                        <span style={{ color: 'var(--text-muted)' }}>→</span>
                                        <span style={{
                                            color: '#1db954',
                                            fontWeight: 700,
                                            fontSize: '14px'
                                        }}>
                                            📁 {estimatedChunks} {estimatedChunks === 1 ? 'plik' : 'plików'}
                                        </span>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    {/* Progress */}
                    {isProcessing && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '14px', color: 'var(--text-gray)' }}>Dzielenie...</span>
                                <span style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 500 }}>{progress}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={processSplit} disabled={!file || isProcessing} className="btn btn-primary">
                            {isProcessing ? `⏳ ${progress}%` : '✂️ Podziel plik'}
                        </button>
                        {results.length > 0 && (
                            <button onClick={downloadAll} className="btn btn-secondary">
                                ⬇️ Pobierz wszystkie ({results.length})
                            </button>
                        )}
                    </div>

                    {/* Results */}
                    {results.length > 0 && (
                        <div className="card">
                            <div className="card-header">✅ Podzielone pliki ({results.length})</div>
                            <div className="card-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
                                    {results.map((r, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                                                <span style={{ fontSize: '24px' }}>📄</span>
                                                <div>
                                                    <p style={{ fontSize: '14px', fontWeight: 500 }}>{r.name}</p>
                                                    <p style={{ fontSize: '12px', color: 'var(--text-muted)' }}>{r.rowCount} wierszy</p>
                                                </div>
                                            </div>
                                            <a href={r.url} download={r.name} className="btn btn-secondary" style={{ padding: '8px 12px' }}>
                                                ⬇️
                                            </a>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}
                </>
            )}

            {/* Merge Tab */}
            {tab === 'merge' && (
                <>
                    {/* Upload Zone */}
                    <div
                        className="upload-zone"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('excel-merge-input')?.click()}
                    >
                        <input
                            type="file"
                            id="excel-merge-input"
                            accept=".xlsx,.xls"
                            multiple
                            className="hidden"
                            onChange={(e) => handleFileSelect(e.target.files, true)}
                        />
                        <span className="icon">📚</span>
                        <p className="title">
                            {mergeFiles.length > 0 ? `${mergeFiles.length} plików do połączenia` : 'Przeciągnij pliki Excel'}
                        </p>
                        <p className="subtitle">lub kliknij aby wybrać</p>
                    </div>

                    {/* File List */}
                    {mergeFiles.length > 0 && (
                        <div className="card">
                            <div className="card-header">
                                <span>📁 Pliki do połączenia ({mergeFiles.length})</span>
                                <button onClick={() => setMergeFiles([])} style={{ fontSize: '12px', color: '#ef4444', background: 'none', border: 'none', cursor: 'pointer' }}>
                                    Usuń wszystkie
                                </button>
                            </div>
                            <div className="card-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                                    {mergeFiles.map((f, i) => (
                                        <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 12px', background: 'var(--bg-card)', borderRadius: '6px' }}>
                                            <span style={{ fontSize: '14px' }}>{f.name}</span>
                                            <button
                                                onClick={() => setMergeFiles(prev => prev.filter((_, j) => j !== i))}
                                                style={{ color: '#ef4444', fontSize: '12px', background: 'none', border: 'none', cursor: 'pointer' }}
                                            >
                                                ✕
                                            </button>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Merge Options */}
                    {mergeFiles.length > 0 && (
                        <div className="card">
                            <div className="card-header">⚙️ Opcje łączenia</div>
                            <div className="card-body">
                                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                                        <input
                                            type="checkbox"
                                            checked={addSourceColumn}
                                            onChange={(e) => setAddSourceColumn(e.target.checked)}
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        Dodaj kolumnę ze źródłem (nazwa pliku)
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                                        <input
                                            type="checkbox"
                                            checked={sortAlphabetically}
                                            onChange={(e) => setSortAlphabetically(e.target.checked)}
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        Sortuj pliki alfabetycznie przed łączeniem
                                    </label>
                                    <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '14px' }}>
                                        <input
                                            type="checkbox"
                                            checked={removeDuplicates}
                                            onChange={(e) => setRemoveDuplicates(e.target.checked)}
                                            style={{ accentColor: 'var(--accent)' }}
                                        />
                                        Usuń duplikaty wierszy
                                    </label>
                                </div>
                                <div style={{ marginTop: '12px', padding: '8px 12px', background: 'rgba(59, 130, 246, 0.1)', borderRadius: '6px', fontSize: '12px', color: 'var(--text-muted)' }}>
                                    ℹ️ Różne nagłówki zostaną automatycznie zunifikowane
                                </div>
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {isProcessing && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '14px', color: 'var(--text-gray)' }}>Łączenie...</span>
                                <span style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 500 }}>{progress}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button onClick={processMerge} disabled={mergeFiles.length < 2 || isProcessing} className="btn btn-primary">
                            {isProcessing ? `⏳ ${progress}%` : '🔗 Połącz pliki'}
                        </button>
                        {mergeResult && (
                            <a href={mergeResult.url} download={mergeResult.name} className="btn btn-secondary">
                                ⬇️ Pobierz połączony plik
                            </a>
                        )}
                    </div>
                </>
            )}
        </div>
    );
}
