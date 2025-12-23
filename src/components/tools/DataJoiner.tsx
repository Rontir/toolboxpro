'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';
import { useExcelWorker } from '@/hooks/useExcelWorker';
import { useStats } from '../Stats';
import { useHistory } from '../History';
import { useNotifications } from '../Notifications';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

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
    // Loading state for file upload
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    // Web Worker for Excel parsing
    const { parseExcel } = useExcelWorker();

    // Core hooks
    const { recordUsage } = useStats();
    const { addToHistory } = useHistory();
    const { addNotification } = useNotifications();

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
        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${file.name}...`);

        try {
            const { headers } = await parseExcel(file);
            setMainColumns(headers);
            if (headers.length > 0 && !mainKeyCol) setMainKeyCol(headers[0]);
        } catch {
            setError('Błąd wczytywania pliku głównego');
        } finally {
            setIsLoading(false);
        }
    };

    const handleLookupFile = async (file: File) => {
        setLookupFile(file);
        setResult(null);
        setOutputBlob(null);
        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${file.name}...`);

        try {
            const { headers } = await parseExcel(file);
            setLookupColumns(headers);
            if (headers.length > 0 && !lookupKeyCol) setLookupKeyCol(headers[0]);
            // Select all columns by default except key
            setSelectedLookupCols(headers.filter((_, i) => i > 0));
        } catch {
            setError('Błąd wczytywania pliku słownikowego');
        } finally {
            setIsLoading(false);
        }
    };

    const onMainFileSelect = (files: File[]) => {
        if (files.length > 0) handleMainFile(files[0]);
    };

    const onLookupFileSelect = (files: File[]) => {
        if (files.length > 0) handleLookupFile(files[0]);
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

            recordUsage('data-joiner', mainRows.length);
            addNotification('success', 'Łączenie zakończone', `Dopasowano ${matched} z ${mainRows.length} wierszy.`);
            addToHistory({
                tool: 'Łącznik danych',
                toolIcon: '🔗',
                inputFiles: [mainFile.name, lookupFile!.name],
                outputFileName: mainFile.name.replace(/\.xlsx?$/i, '') + '_połączone.xlsx',
                outputBlob: blob,
                summary: `${matched}/${mainRows.length} dopasowanych (${((matched / mainRows.length) * 100).toFixed(1)}%)`,
                stats: {
                    'Dopasowane': matched,
                    'Brak dopasowania': unmatched,
                    'Skuteczność': `${((matched / mainRows.length) * 100).toFixed(1)}%`
                }
            });

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
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Łącznik Danych (VLOOKUP)"
                description="Łącz dane z dwóch plików Excel na podstawie wspólnej kolumny (klucza). Działa jak funkcja VLOOKUP."
                icon="🔗"
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="upload-progress-spinner" />
                    <p className="text-white text-lg mt-5">{loadingText}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Main File */}
                <Section title="1. Plik główny (Baza)">
                    <FileUpload
                        onFilesSelect={onMainFileSelect}
                        accept=".xlsx,.xls"
                        label="Wgraj plik główny"
                        sublabel="Do tego pliku dołączymy dane"
                        icon="📊"
                        isLoading={isLoading}
                        loadingText={loadingText}
                    />
                    {mainFile && (
                        <div className="mt-4">
                            <p className="text-sm font-medium text-text-gray mb-2">Klucz łączenia (główny):</p>
                            <select
                                value={mainKeyCol}
                                onChange={e => setMainKeyCol(e.target.value)}
                                className="w-full p-2 bg-bg-input border border-border rounded-lg text-sm text-text-white focus:outline-none focus:border-accent transition-colors"
                            >
                                {mainColumns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </Section>

                {/* Lookup File */}
                <Section title="2. Plik słownikowy (Dane)">
                    <FileUpload
                        onFilesSelect={onLookupFileSelect}
                        accept=".xlsx,.xls"
                        label="Wgraj plik słownikowy"
                        sublabel="Z tego pliku pobierzemy dane"
                        icon="📁"
                        isLoading={isLoading}
                        loadingText={loadingText}
                    />
                    {lookupFile && (
                        <div className="mt-4">
                            <p className="text-sm font-medium text-text-gray mb-2">Klucz łączenia (słownik):</p>
                            <select
                                value={lookupKeyCol}
                                onChange={e => setLookupKeyCol(e.target.value)}
                                className="w-full p-2 bg-bg-input border border-border rounded-lg text-sm text-text-white focus:outline-none focus:border-accent transition-colors"
                            >
                                {lookupColumns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </Section>
            </div>

            {/* Settings */}
            {(mainFile && lookupFile) && (
                <Section title="3. Ustawienia łączenia">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        <div>
                            <p className="text-sm font-medium text-text-gray mb-3">Typ łączenia:</p>
                            <div className="flex gap-3">
                                <button
                                    onClick={() => setJoinType('left')}
                                    className={`flex-1 p-3 rounded-lg border transition-all text-left ${joinType === 'left'
                                            ? 'bg-accent/10 border-accent text-accent'
                                            : 'bg-bg-input border-border text-text-gray hover:border-accent/50'
                                        }`}
                                >
                                    <div className="font-semibold text-sm">LEFT JOIN</div>
                                    <div className="text-xs opacity-80 mt-1">Zachowaj wszystkie z głównego</div>
                                </button>
                                <button
                                    onClick={() => setJoinType('inner')}
                                    className={`flex-1 p-3 rounded-lg border transition-all text-left ${joinType === 'inner'
                                            ? 'bg-accent/10 border-accent text-accent'
                                            : 'bg-bg-input border-border text-text-gray hover:border-accent/50'
                                        }`}
                                >
                                    <div className="font-semibold text-sm">INNER JOIN</div>
                                    <div className="text-xs opacity-80 mt-1">Tylko pasujące rekordy</div>
                                </button>
                            </div>
                        </div>

                        <div>
                            <p className="text-sm font-medium text-text-gray mb-3">
                                Kolumny do dołączenia ({selectedLookupCols.length}):
                            </p>
                            <div className="max-h-40 overflow-y-auto p-2 bg-bg-input rounded-lg border border-border flex flex-wrap gap-2">
                                {lookupColumns.filter(c => c !== lookupKeyCol).map(col => (
                                    <button
                                        key={col}
                                        onClick={() => toggleColumn(col)}
                                        className={`px-2 py-1 rounded text-xs transition-colors ${selectedLookupCols.includes(col)
                                                ? 'bg-accent text-white'
                                                : 'bg-bg-tertiary text-text-gray hover:bg-bg-tertiary/80'
                                            }`}
                                    >
                                        {col}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>
                </Section>
            )}

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    className="btn btn-primary flex-1 py-4 text-lg"
                    onClick={result ? downloadResult : joinData}
                    disabled={!canProcess || isProcessing}
                >
                    {isProcessing ? `⏳ Łączenie... ${progress}%` : result ? '📥 Pobierz wynik' : '🔗 Połącz dane'}
                </button>

                {result && (
                    <button className="btn btn-secondary w-32" onClick={reset}>
                        🔄 Reset
                    </button>
                )}
            </div>

            {/* Results */}
            {result && (
                <Section title="✅ Wynik łączenia">
                    <div className="grid grid-cols-3 gap-4">
                        <div className="p-4 bg-bg-card rounded-lg border border-border text-center">
                            <div className="text-2xl font-bold text-green-500">{result.matched}</div>
                            <div className="text-xs text-text-muted mt-1">Dopasowane</div>
                        </div>
                        <div className="p-4 bg-bg-card rounded-lg border border-border text-center">
                            <div className="text-2xl font-bold text-red-500">{result.unmatched}</div>
                            <div className="text-xs text-text-muted mt-1">Bez dopasowania</div>
                        </div>
                        <div className="p-4 bg-bg-card rounded-lg border border-border text-center">
                            <div className="text-2xl font-bold text-text-white">
                                {((result.matched / result.total) * 100).toFixed(1)}%
                            </div>
                            <div className="text-xs text-text-muted mt-1">Skuteczność</div>
                        </div>
                    </div>
                </Section>
            )}

            {error && (
                <div className="p-4 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-sm flex items-center gap-2">
                    ❌ {error}
                </div>
            )}
        </div>
    );
}
