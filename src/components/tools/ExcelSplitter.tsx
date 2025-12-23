'use client';

import { useState, useCallback, useEffect } from 'react';
import { useDroppedFile } from '@/components/DroppedFileContext';
import { useExcelWorker } from '@/hooks/useExcelWorker';
import { useUndoRedo, UndoRedoButtons } from '@/hooks/useUndoRedo';
import { PresetSelector } from '@/components/BatchPresets';
import { useNotifications } from '@/components/Notifications';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

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

    // Settings with Undo/Redo
    const {
        state: settings,
        setState: setSettings,
        undo,
        redo,
        canUndo,
        canRedo,
        undoCount,
        redoCount
    } = useUndoRedo({
        rowsPerFile: 1000,
        addSourceColumn: true,
        sortAlphabetically: true,
        removeDuplicates: false
    });

    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<SplitResult[]>([]);
    const [mergeResult, setMergeResult] = useState<{ url: string; name: string; rows: number; cols: number } | null>(null);
    const [totalRows, setTotalRows] = useState(0);
    const [previewData, setPreviewData] = useState<{ headers: string[]; rows: any[] } | null>(null);
    // Loading state for file upload
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    const { consumeDroppedFile } = useDroppedFile();

    // Web Worker for Excel parsing
    const { parseExcel } = useExcelWorker();
    const { addNotification } = useNotifications();

    // Keyboard shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                // Trigger processing on Enter if files are present and not processing
                const activeElement = document.activeElement;
                const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
                if (!isInput && !isProcessing) {
                    if (tab === 'split' && file) {
                        e.preventDefault();
                        processSplit();
                    } else if (tab === 'merge' && mergeFiles.length >= 2) {
                        e.preventDefault();
                        processMerge();
                    }
                }
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // Check for dropped file on mount
    useEffect(() => {
        const droppedFile = consumeDroppedFile();
        if (droppedFile && droppedFile.name.match(/\.xlsx?$/i)) {
            setFile(droppedFile);
        }
    }, []);

    const handleFilesSelected = (files: File[]) => {
        if (files.length === 0) return;

        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${files.length} plików...`);

        requestAnimationFrame(() => {
            setTimeout(() => {
                if (tab === 'split') {
                    setFile(files[0]);
                } else if (tab === 'merge') {
                    setMergeFiles(prev => [...prev, ...files]);
                }
                setIsLoading(false);
            }, 100);
        });
    };

    // Read row count when file is selected (using Web Worker)
    useEffect(() => {
        if (!file) {
            setTotalRows(0);
            return;
        }

        setIsLoading(true);
        setLoadingText(`📊 Liczenie wierszy...`);

        parseExcel(file)
            .then(({ headers, rows, totalRows: rowsCount }) => {
                setTotalRows(rowsCount);
                setPreviewData({ headers, rows: rows.slice(0, 5) });
            })
            .catch(() => {
                setTotalRows(0);
                setPreviewData(null);
            })
            .finally(() => {
                setIsLoading(false);
            });
    }, [file, parseExcel]);

    const estimatedChunks = totalRows > 0 && settings.rowsPerFile > 0
        ? Math.ceil(totalRows / settings.rowsPerFile)
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

            for (let i = 0; i < rows.length; i += settings.rowsPerFile) {
                chunks.push(rows.slice(i, i + settings.rowsPerFile));
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
            addNotification('success', 'Podział zakończony', `Pomyślnie podzielono plik na ${newResults.length} części.`);
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
            if (settings.sortAlphabetically) {
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
                if (settings.addSourceColumn) {
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
            if (settings.removeDuplicates) {
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
            addNotification('success', 'Połączenie zakończone', `Pomyślnie połączono ${mergeFiles.length} plików.`);
        } catch (e) {
            console.error('Error merging files:', e);
        }

        setIsProcessing(false);
    };

    const downloadAll = async () => {
        if (results.length === 0) return;

        // If only 1-2 files, download individually
        if (results.length <= 2) {
            results.forEach(r => {
                const a = document.createElement('a');
                a.href = r.url;
                a.download = r.name;
                a.click();
            });
            return;
        }

        // Create ZIP for 3+ files
        setIsLoading(true);
        setLoadingText('📦 Pakowanie do ZIP...');

        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();

            // Add each file to ZIP
            for (const result of results) {
                const response = await fetch(result.url);
                const blob = await response.blob();
                zip.file(result.name, blob);
            }

            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipUrl = URL.createObjectURL(zipBlob);

            const baseName = file?.name.replace(/\.xlsx?$/i, '') || 'podzielone';
            const a = document.createElement('a');
            a.href = zipUrl;
            a.download = `${baseName}_split_${results.length}czesci.zip`;
            a.click();

            URL.revokeObjectURL(zipUrl);
        } catch (error) {
            console.error('Error creating ZIP:', error);
            // Fallback to individual downloads
            results.forEach(r => {
                const a = document.createElement('a');
                a.href = r.url;
                a.download = r.name;
                a.click();
            });
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    };


    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Excel Splitter & Merger"
                description="Dziel duże pliki Excel na mniejsze części lub łącz wiele plików w jeden. Zachowaj nagłówki i strukturę danych."
                icon="✂️"
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="upload-progress-spinner" />
                    <p className="text-white text-lg mt-5">{loadingText}</p>
                </div>
            )}

            {/* Mode Toggle */}
            <Section title="📂 Tryb pracy">
                <div className="flex gap-3">
                    <button
                        onClick={() => { setTab('split'); setResults([]); setMergeResult(null); }}
                        className={`btn ${tab === 'split' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        ✂️ Dzielenie
                    </button>
                    <button
                        onClick={() => { setTab('merge'); setResults([]); setMergeResult(null); }}
                        className={`btn ${tab === 'merge' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        🔗 Łączenie
                    </button>
                </div>
            </Section>

            {/* Split Tab */}
            {tab === 'split' && (
                <>
                    {/* Upload Zone */}
                    <Section title="📊 Plik do podziału">
                        <FileUpload
                            onFilesSelect={handleFilesSelected}
                            accept=".xlsx,.xls"
                            label="Wgraj plik Excel"
                            sublabel="Obsługujemy formaty .xlsx i .xls"
                            icon="📊"
                            isLoading={isLoading}
                            loadingText={loadingText}
                        />
                    </Section>

                    {/* File Preview */}
                    {file && previewData && (
                        <Section
                            title="👁️ Podgląd danych"
                            actions={
                                <span className="text-xs text-text-muted">
                                    Pierwsze 5 wierszy z {previewData.headers.length} kolumn
                                </span>
                            }
                        >
                            <div className="overflow-x-auto">
                                <table className="w-full text-sm text-left border-collapse">
                                    <thead className="bg-bg-tertiary text-text-gray uppercase text-xs">
                                        <tr>
                                            {previewData.headers.map((h, i) => (
                                                <th key={i} className="px-4 py-3 border-b border-border whitespace-nowrap">
                                                    {h}
                                                </th>
                                            ))}
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {previewData.rows.map((row, i) => (
                                            <tr key={i} className="border-b border-border hover:bg-bg-tertiary/50 transition-colors">
                                                {previewData.headers.map((h, j) => (
                                                    <td key={j} className="px-4 py-3 text-text-gray whitespace-nowrap max-w-[200px] overflow-hidden text-ellipsis">
                                                        {String(row[h] ?? '')}
                                                    </td>
                                                ))}
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        </Section>
                    )}

                    {/* Options */}
                    <Section
                        title="⚙️ Opcje podziału"
                        actions={
                            <div className="flex items-center gap-4">
                                <UndoRedoButtons
                                    canUndo={canUndo}
                                    canRedo={canRedo}
                                    onUndo={undo}
                                    onRedo={redo}
                                    undoCount={undoCount}
                                    redoCount={redoCount}
                                />
                                <PresetSelector
                                    toolId="excel-splitter-split"
                                    toolIcon="✂️"
                                    currentSettings={settings}
                                    onSelect={(s) => setSettings(s as any, 'Apply preset')}
                                />
                            </div>
                        }
                    >
                        <div className="flex flex-wrap items-center gap-4">
                            <div className="flex items-center gap-2">
                                <label className="text-sm text-text-gray">Wierszy na plik:</label>
                                <input
                                    type="number"
                                    className="w-32 p-2 bg-bg-input border border-border rounded-lg text-sm text-text-white focus:outline-none focus:border-accent transition-colors"
                                    value={settings.rowsPerFile}
                                    onChange={e => setSettings({ ...settings, rowsPerFile: Number(e.target.value) }, 'Change rows per file')}
                                    min={1}
                                />
                            </div>
                            <div className="flex gap-2">
                                {[100, 500, 1000, 5000].map(n => (
                                    <button
                                        key={n}
                                        onClick={() => setSettings({ ...settings, rowsPerFile: n }, `Set rows to ${n}`)}
                                        className={`px-3 py-1 rounded-full text-xs transition-colors ${settings.rowsPerFile === n
                                            ? 'bg-accent text-white'
                                            : 'bg-bg-tertiary text-text-gray hover:bg-bg-tertiary/80'
                                            }`}
                                    >
                                        {n}
                                    </button>
                                ))}
                            </div>

                            {/* Live chunk count preview */}
                            {totalRows > 0 && (
                                <div className="flex items-center gap-2 px-3 py-1.5 bg-bg-tertiary rounded-lg border border-border text-sm">
                                    <span className="text-text-muted">
                                        📊 {totalRows.toLocaleString()} wierszy
                                    </span>
                                    <span className="text-text-muted">→</span>
                                    <span className="text-green-500 font-bold">
                                        📁 {estimatedChunks} {estimatedChunks === 1 ? 'plik' : 'plików'}
                                    </span>
                                </div>
                            )}
                        </div>
                    </Section>

                    {/* Progress */}
                    {isProcessing && (
                        <div className="p-4 bg-bg-tertiary rounded-lg border border-border">
                            <div className="flex justify-between mb-2">
                                <span className="text-sm text-text-gray">Dzielenie...</span>
                                <span className="text-sm text-accent font-medium">{progress}%</span>
                            </div>
                            <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden">
                                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
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
                        <Section title={`✅ Podzielone pliki (${results.length})`}>
                            <div className="flex flex-col gap-2">
                                {results.map((r, i) => (
                                    <div key={i} className="flex items-center justify-between p-3 bg-bg-card rounded-lg border border-border hover:border-accent/50 transition-colors">
                                        <div className="flex items-center gap-3">
                                            <span className="text-2xl">📄</span>
                                            <div>
                                                <p className="text-sm font-medium text-text-white">{r.name}</p>
                                                <p className="text-xs text-text-muted">{r.rowCount} wierszy</p>
                                            </div>
                                        </div>
                                        <a href={r.url} download={r.name} className="btn btn-secondary text-sm py-1 px-3">
                                            ⬇️
                                        </a>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}
                </>
            )}

            {/* Merge Tab */}
            {tab === 'merge' && (
                <>
                    {/* Upload Zone */}
                    <Section title="📚 Pliki do połączenia">
                        <FileUpload
                            onFilesSelect={handleFilesSelected}
                            accept=".xlsx,.xls"
                            multiple={true}
                            label="Wgraj pliki Excel"
                            sublabel="Przeciągnij wiele plików (.xlsx, .xls)"
                            icon="📚"
                            isLoading={isLoading}
                            loadingText={loadingText}
                        />
                    </Section>

                    {/* File List */}
                    {mergeFiles.length > 0 && (
                        <Section
                            title={`📁 Lista plików (${mergeFiles.length})`}
                            actions={
                                <button onClick={() => setMergeFiles([])} className="text-xs text-red-500 hover:text-red-400 transition-colors">
                                    Usuń wszystkie
                                </button>
                            }
                        >
                            <div className="flex flex-col gap-2">
                                {mergeFiles.map((f, i) => (
                                    <div key={i} className="flex items-center justify-between p-2 bg-bg-card rounded-lg border border-border">
                                        <span className="text-sm text-text-gray">{f.name}</span>
                                        <button
                                            onClick={() => setMergeFiles(prev => prev.filter((_, j) => j !== i))}
                                            className="text-red-500 hover:text-red-400 transition-colors p-1"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}

                    {/* Merge Options */}
                    {mergeFiles.length > 0 && (
                        <Section
                            title="⚙️ Opcje łączenia"
                            actions={
                                <div className="flex items-center gap-4">
                                    <UndoRedoButtons
                                        canUndo={canUndo}
                                        canRedo={canRedo}
                                        onUndo={undo}
                                        onRedo={redo}
                                        undoCount={undoCount}
                                        redoCount={redoCount}
                                    />
                                    <PresetSelector
                                        toolId="excel-splitter-merge"
                                        toolIcon="🔗"
                                        currentSettings={settings}
                                        onSelect={(s) => setSettings(s as any, 'Apply preset')}
                                    />
                                </div>
                            }
                        >
                            <div className="flex flex-col gap-3">
                                <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={settings.addSourceColumn}
                                        onChange={(e) => setSettings({ ...settings, addSourceColumn: e.target.checked }, e.target.checked ? 'Enable source column' : 'Disable source column')}
                                        className="accent-accent w-4 h-4"
                                    />
                                    Dodaj kolumnę ze źródłem (nazwa pliku)
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={settings.sortAlphabetically}
                                        onChange={(e) => setSettings({ ...settings, sortAlphabetically: e.target.checked }, e.target.checked ? 'Enable alpha sort' : 'Disable alpha sort')}
                                        className="accent-accent w-4 h-4"
                                    />
                                    Sortuj pliki alfabetycznie przed łączeniem
                                </label>
                                <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                                    <input
                                        type="checkbox"
                                        checked={settings.removeDuplicates}
                                        onChange={(e) => setSettings({ ...settings, removeDuplicates: e.target.checked }, e.target.checked ? 'Enable duplicate removal' : 'Disable duplicate removal')}
                                        className="accent-accent w-4 h-4"
                                    />
                                    Usuń duplikaty wierszy
                                </label>
                            </div>
                            <div className="mt-3 p-2 bg-blue-500/10 rounded-lg text-xs text-text-muted border border-blue-500/20">
                                ℹ️ Różne nagłówki zostaną automatycznie zunifikowane
                            </div>
                        </Section>
                    )}

                    {/* Progress */}
                    {isProcessing && (
                        <div className="p-4 bg-bg-tertiary rounded-lg border border-border">
                            <div className="flex justify-between mb-2">
                                <span className="text-sm text-text-gray">Łączenie...</span>
                                <span className="text-sm text-accent font-medium">{progress}%</span>
                            </div>
                            <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden">
                                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-3">
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

            {/* Tips Section */}
            <Section title="💡 Porady i wskazówki">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-accent">
                            🚀 Duże pliki
                        </h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                            Narzędzie używa Web Workerów, dzięki czemu interfejs pozostaje responsywny nawet przy plikach mających setki tysięcy wierszy.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-accent">
                            🔗 Inteligentne łączenie
                        </h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                            Przy łączeniu plików o różnych kolumnach, narzędzie automatycznie zunifikuje nagłówki i wstawi puste wartości tam, gdzie danych brakuje.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-accent">
                            🧹 Usuwanie duplikatów
                        </h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                            Opcja usuwania duplikatów porównuje całe wiersze. Jest to szczególnie przydatne przy scalaniu baz danych z wielu źródeł.
                        </p>
                    </div>
                </div>
            </Section>
        </div>
    );
}
