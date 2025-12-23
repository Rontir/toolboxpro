'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useExcelWorker } from '@/hooks/useExcelWorker';
import { useStats } from '../Stats';
import { useHistory } from '../History';
import { useNotifications } from '../Notifications';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

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

    const onFileASelect = (files: File[]) => {
        if (files.length > 0) handleFileA(files[0]);
    };

    const onFileBSelect = (files: File[]) => {
        if (files.length > 0) handleFileB(files[0]);
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

            recordUsage('compare', diffRows.length);
            addNotification('success', 'Porównanie zakończone', `Znaleziono ${different} różnic i ${onlyInA + onlyInB} brakujących.`);
            addToHistory({
                tool: 'Porównywarka',
                toolIcon: '🔀',
                inputFiles: [fileA.name, fileB.name],
                outputFileName: 'porownanie.xlsx',
                outputBlob: blob,
                summary: `${different} różnic, ${onlyInA} tylko w A, ${onlyInB} tylko w B`,
                stats: {
                    'Różnice': different,
                    'Tylko w A': onlyInA,
                    'Tylko w B': onlyInB,
                    'Identyczne': identical
                }
            });

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
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Porównywarka Excel"
                description="Porównaj dwa pliki Excel i znajdź różnice w danych. Idealne do sprawdzania zmian w cennikach lub stanach magazynowych."
                icon="🔀"
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="upload-progress-spinner" />
                    <p className="text-white text-lg mt-5">{loadingText}</p>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* File A */}
                <Section title="1. Plik bazowy (A)">
                    <FileUpload
                        onFilesSelect={onFileASelect}
                        accept=".xlsx,.xls"
                        label="Wgraj plik bazowy"
                        sublabel="Pierwszy plik do porównania"
                        icon="📊"
                        isLoading={isLoading}
                        loadingText={loadingText}
                    />
                    {columnsA.length > 0 && (
                        <div className="mt-4">
                            <p className="text-sm font-medium text-text-gray mb-2">Klucz porównania (A):</p>
                            <select
                                value={keyColumnA}
                                onChange={e => setKeyColumnA(e.target.value)}
                                className="w-full p-2 bg-bg-input border border-border rounded-lg text-sm text-text-white focus:outline-none focus:border-accent transition-colors"
                            >
                                {columnsA.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </Section>

                {/* File B */}
                <Section title="2. Plik nowy (B)">
                    <FileUpload
                        onFilesSelect={onFileBSelect}
                        accept=".xlsx,.xls"
                        label="Wgraj plik nowy"
                        sublabel="Drugi plik do porównania"
                        icon="📊"
                        isLoading={isLoading}
                        loadingText={loadingText}
                    />
                    {columnsB.length > 0 && (
                        <div className="mt-4">
                            <p className="text-sm font-medium text-text-gray mb-2">Klucz porównania (B):</p>
                            <select
                                value={keyColumnB}
                                onChange={e => setKeyColumnB(e.target.value)}
                                className="w-full p-2 bg-bg-input border border-border rounded-lg text-sm text-text-white focus:outline-none focus:border-accent transition-colors"
                            >
                                {columnsB.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>
                    )}
                </Section>
            </div>

            {/* Actions */}
            <div className="flex gap-3">
                <button
                    className="btn btn-primary flex-1 py-4 text-lg"
                    onClick={result ? downloadResult : compare}
                    disabled={!fileA || !fileB || !keyColumnA || !keyColumnB || isProcessing}
                >
                    {isProcessing ? `⏳ Porównywanie... ${progress}%` : result ? '📥 Pobierz wynik' : '🔍 Porównaj pliki'}
                </button>

                {result && (
                    <button className="btn btn-secondary w-32" onClick={reset}>
                        🔄 Reset
                    </button>
                )}
            </div>

            {/* Results */}
            {result && (
                <Section title="✅ Wynik porównania">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                        <div className="p-4 bg-bg-card rounded-lg border border-border text-center">
                            <div className="text-2xl font-bold text-yellow-500">{result.onlyInA}</div>
                            <div className="text-xs text-text-muted mt-1">Tylko w A</div>
                        </div>
                        <div className="p-4 bg-bg-card rounded-lg border border-border text-center">
                            <div className="text-2xl font-bold text-blue-500">{result.onlyInB}</div>
                            <div className="text-xs text-text-muted mt-1">Tylko w B</div>
                        </div>
                        <div className="p-4 bg-bg-card rounded-lg border border-border text-center">
                            <div className="text-2xl font-bold text-red-500">{result.different}</div>
                            <div className="text-xs text-text-muted mt-1">Różnice</div>
                        </div>
                        <div className="p-4 bg-bg-card rounded-lg border border-border text-center">
                            <div className="text-2xl font-bold text-green-500">{result.identical}</div>
                            <div className="text-xs text-text-muted mt-1">Identyczne</div>
                        </div>
                    </div>

                    {/* Filter */}
                    <div className="flex gap-2 mb-4 overflow-x-auto pb-2">
                        {(['all', 'only_a', 'only_b', 'different'] as const).map(f => (
                            <button
                                key={f}
                                onClick={() => setShowFilter(f)}
                                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors whitespace-nowrap ${showFilter === f
                                        ? 'bg-accent text-white'
                                        : 'bg-bg-tertiary text-text-gray hover:bg-bg-tertiary/80'
                                    }`}
                            >
                                {f === 'all' ? 'Wszystkie' : f === 'only_a' ? 'Tylko A' : f === 'only_b' ? 'Tylko B' : 'Różnice'}
                            </button>
                        ))}
                    </div>

                    {/* Diff List */}
                    <div className="max-h-96 overflow-y-auto bg-bg-input rounded-lg border border-border">
                        <div className="p-3 border-b border-border bg-bg-tertiary text-xs font-bold text-text-gray uppercase sticky top-0">
                            Szczegóły ({filteredDiffs.length})
                        </div>
                        <div className="divide-y divide-border">
                            {filteredDiffs.slice(0, 100).map((d, i) => (
                                <div key={i} className="p-3 text-sm flex items-center gap-3 hover:bg-bg-tertiary/50 transition-colors">
                                    <div className={`w-2 h-2 rounded-full flex-shrink-0 ${d.status === 'only_a' ? 'bg-yellow-500' :
                                            d.status === 'only_b' ? 'bg-blue-500' :
                                                d.status === 'different' ? 'bg-red-500' : 'bg-green-500'
                                        }`} />
                                    <span className="font-medium text-text-white">{d.key}</span>
                                    {d.differences && (
                                        <span className="text-text-muted text-xs">
                                            ({d.differences.join(', ')})
                                        </span>
                                    )}
                                </div>
                            ))}
                            {filteredDiffs.length > 100 && (
                                <div className="p-4 text-center text-text-muted text-sm">
                                    ...i {filteredDiffs.length - 100} więcej (zobacz w raporcie)
                                </div>
                            )}
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
