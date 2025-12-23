'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useExcelWorker } from '@/hooks/useExcelWorker';
import { useStats } from '../Stats';
import { useHistory } from '../History';
import { useNotifications } from '../Notifications';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

// Comprehensive emoji regex pattern
const EMOJI_REGEX = /[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F700}-\u{1F77F}]|[\u{1F780}-\u{1F7FF}]|[\u{1F800}-\u{1F8FF}]|[\u{1F900}-\u{1F9FF}]|[\u{1FA00}-\u{1FA6F}]|[\u{1FA70}-\u{1FAFF}]|[\u{2600}-\u{26FF}]|[\u{2700}-\u{27BF}]|[\u{231A}-\u{231B}]|[\u{23E9}-\u{23F3}]|[\u{23F8}-\u{23FA}]|[\u{25AA}-\u{25AB}]|[\u{25B6}]|[\u{25C0}]|[\u{25FB}-\u{25FE}]|[\u{2614}-\u{2615}]|[\u{2648}-\u{2653}]|[\u{267F}]|[\u{2693}]|[\u{26A1}]|[\u{26AA}-\u{26AB}]|[\u{26BD}-\u{26BE}]|[\u{26C4}-\u{26C5}]|[\u{26CE}]|[\u{26D4}]|[\u{26EA}]|[\u{26F2}-\u{26F3}]|[\u{26F5}]|[\u{26FA}]|[\u{26FD}]|[\u{2702}]|[\u{2705}]|[\u{2708}-\u{270D}]|[\u{270F}]|[\u{2712}]|[\u{2714}]|[\u{2716}]|[\u{271D}]|[\u{2721}]|[\u{2728}]|[\u{2733}-\u{2734}]|[\u{2744}]|[\u{2747}]|[\u{274C}]|[\u{274E}]|[\u{2753}-\u{2755}]|[\u{2757}]|[\u{2763}-\u{2764}]|[\u{2795}-\u{2797}]|[\u{27A1}]|[\u{27B0}]|[\u{27BF}]|[\u{2934}-\u{2935}]|[\u{2B05}-\u{2B07}]|[\u{2B1B}-\u{2B1C}]|[\u{2B50}]|[\u{2B55}]|[\u{3030}]|[\u{303D}]|[\u{3297}]|[\u{3299}]|[\u{FE00}-\u{FE0F}]|[\u{200D}]/gu;

const TARGET_COLUMNS = ['tytuł', 'tytul', 'title', 'opis', 'description', 'nazwa', 'name'];

type TabType = 'text' | 'excel';

interface ExcelStats {
    fileName: string;
    totalRows: number;
    columnsProcessed: string[];
    totalEmojisRemoved: number;
}

export default function EmojiRemover() {
    const [tab, setTab] = useState<TabType>('text');
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [stats, setStats] = useState({ removed: 0, original: 0 });
    const [options, setOptions] = useState({
        cleanDoubleSpaces: true,
        trimLines: true,
    });

    // Excel state
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [excelStats, setExcelStats] = useState<ExcelStats | null>(null);
    const [processedWorkbook, setProcessedWorkbook] = useState<XLSX.WorkBook | null>(null);
    const [processing, setProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Loading state for file upload
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    // Web Worker for Excel parsing
    const { parseExcel } = useExcelWorker();

    // Core hooks
    const { recordUsage } = useStats();
    const { addToHistory } = useHistory();
    const { addNotification } = useNotifications();

    const removeEmojisFromText = (text: string): { cleaned: string; count: number } => {
        const matches = text.match(EMOJI_REGEX) || [];
        let cleaned = text.replace(EMOJI_REGEX, '');

        if (options.cleanDoubleSpaces) {
            cleaned = cleaned.replace(/  +/g, ' ');
        }
        if (options.trimLines) {
            cleaned = cleaned.split('\n').map(line => line.trim()).join('\n');
        }

        return { cleaned, count: matches.length };
    };

    const removeEmojis = () => {
        const { cleaned, count } = removeEmojisFromText(input);
        setOutput(cleaned);
        setStats({ removed: count, original: input.length });
    };

    const handleFilesSelected = (files: File[]) => {
        const file = files[0];
        if (file && file.name.match(/\.xlsx?$/i)) {
            setExcelFile(file);
            setExcelStats(null);
            setProcessedWorkbook(null);
        }
    };

    const processExcel = async () => {
        if (!excelFile) return;

        setProcessing(true);
        setProgress(10);

        try {
            const data = await excelFile.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            setProgress(30);

            let totalEmojisRemoved = 0;
            const columnsProcessed: string[] = [];
            let totalRows = 0;

            workbook.SheetNames.forEach((sheetName, sheetIdx) => {
                const sheet = workbook.Sheets[sheetName];
                const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as unknown[][];

                if (jsonData.length === 0) return;

                const headers = jsonData[0] as string[];
                totalRows = Math.max(totalRows, jsonData.length - 1);

                const columnsToProcess: number[] = [];
                headers.forEach((header, index) => {
                    if (header && TARGET_COLUMNS.includes(String(header).toLowerCase().trim())) {
                        columnsToProcess.push(index);
                        if (!columnsProcessed.includes(String(header))) {
                            columnsProcessed.push(String(header));
                        }
                    }
                });

                for (let rowIndex = 1; rowIndex < jsonData.length; rowIndex++) {
                    const row = jsonData[rowIndex];
                    columnsToProcess.forEach(colIndex => {
                        if (row[colIndex] && typeof row[colIndex] === 'string') {
                            const { cleaned, count } = removeEmojisFromText(row[colIndex] as string);
                            row[colIndex] = cleaned;
                            totalEmojisRemoved += count;
                        }
                    });
                }

                const newSheet = XLSX.utils.aoa_to_sheet(jsonData);
                workbook.Sheets[sheetName] = newSheet;
                setProgress(30 + Math.round(((sheetIdx + 1) / workbook.SheetNames.length) * 60));
            });

            setProcessedWorkbook(workbook);
            setExcelStats({
                fileName: excelFile.name,
                totalRows,
                columnsProcessed,
                totalEmojisRemoved
            });
            setProgress(100);

            recordUsage('emoji-remover', totalRows);
            addNotification('success', 'Usuwanie zakończone', `Usunięto ${totalEmojisRemoved} emotek z ${totalRows} wierszy.`);
            addToHistory({
                tool: 'Usuń emotki',
                toolIcon: '🧹',
                inputFiles: [excelFile.name],
                outputFileName: excelFile.name.replace(/\.xlsx?$/i, '_bez_emotek.xlsx'),
                outputBlob: null,
                summary: `${totalEmojisRemoved} emotek usuniętych z ${totalRows} wierszy`,
                stats: {
                    'Wierszy': totalRows,
                    'Emotek': totalEmojisRemoved,
                    'Kolumn': columnsProcessed.length
                }
            });
        } catch (error) {
            console.error('Error processing Excel:', error);
            alert('Błąd podczas przetwarzania pliku Excel');
        } finally {
            setProcessing(false);
        }
    };

    const downloadProcessedExcel = () => {
        if (!processedWorkbook || !excelFile) return;

        const wbout = XLSX.write(processedWorkbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([wbout], { type: 'application/octet-stream' });

        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = excelFile.name.replace(/\.xlsx?$/i, '_bez_emotek.xlsx');
        a.click();
        URL.revokeObjectURL(url);
    };

    const copyOutput = () => {
        navigator.clipboard.writeText(output);
    };

    const pasteFromClipboard = async () => {
        try {
            const text = await navigator.clipboard.readText();
            setInput(text);
        } catch {
            console.error('Failed to read from clipboard');
        }
    };

    const resetAll = () => {
        setInput('');
        setOutput('');
        setStats({ removed: 0, original: 0 });
        setExcelFile(null);
        setExcelStats(null);
        setProcessedWorkbook(null);
        setProgress(0);
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    };

    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Emoji Remover"
                description="Usuń emotki z tekstu lub plików Excel. Wyczyść zbędne znaki i przygotuj dane do dalszej obróbki."
                icon="🧹"
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
                        onClick={() => { setTab('text'); resetAll(); }}
                        className={`btn ${tab === 'text' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        📝 Tekst / HTML
                    </button>
                    <button
                        onClick={() => { setTab('excel'); resetAll(); }}
                        className={`btn ${tab === 'excel' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        📊 Plik Excel
                    </button>
                </div>
            </Section>

            {/* Text Tab */}
            {tab === 'text' && (
                <>
                    {/* Stats */}
                    {stats.removed > 0 && (
                        <div className="p-3 bg-green-500/10 border border-green-500/30 rounded-lg text-sm flex items-center gap-4">
                            <span>✅ Usunięto <strong className="text-accent">{stats.removed}</strong> emotek</span>
                            <span className="text-text-muted">|</span>
                            <span className="text-text-muted">
                                {stats.original} → {output.length} znaków
                            </span>
                        </div>
                    )}

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Input */}
                        <Section
                            title="📝 Wejście"
                            actions={
                                <button onClick={pasteFromClipboard} className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
                                    📋 Wklej
                                </button>
                            }
                        >
                            <textarea
                                className="w-full h-64 p-3 bg-bg-input border border-border rounded-lg text-sm font-mono resize-none text-text-white focus:outline-none focus:border-accent transition-colors"
                                placeholder="Wklej tekst z emotkami... 🎉✨🔥&#10;&#10;Przykład:&#10;Świetny produkt! 🔥 Polecam!&#10;<p>Opis 🎁 z HTML</p>"
                                value={input}
                                onChange={(e) => setInput(e.target.value)}
                            />
                        </Section>

                        {/* Output */}
                        <Section
                            title="✅ Wyjście"
                            actions={
                                output && (
                                    <button onClick={copyOutput} className="text-xs text-accent hover:text-accent-hover transition-colors flex items-center gap-1">
                                        📋 Kopiuj
                                    </button>
                                )
                            }
                        >
                            <textarea
                                className="w-full h-64 p-3 bg-bg-input border border-border rounded-lg text-sm font-mono resize-none text-text-white focus:outline-none"
                                readOnly
                                value={output}
                                placeholder="Tutaj pojawi się tekst bez emotek..."
                            />
                        </Section>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button onClick={removeEmojis} disabled={!input} className="btn btn-primary">
                            🧹 Usuń emotki
                        </button>
                        <button onClick={resetAll} className="btn btn-secondary">
                            🗑️ Wyczyść
                        </button>
                    </div>
                </>
            )}

            {/* Excel Tab */}
            {tab === 'excel' && (
                <>
                    {/* Upload Zone */}
                    <Section title="📊 Plik Excel">
                        <FileUpload
                            onFilesSelect={handleFilesSelected}
                            accept=".xlsx,.xls"
                            label="Wgraj plik Excel"
                            sublabel="Obsługujemy formaty .xlsx i .xls"
                            icon="📊"
                            isLoading={isLoading}
                            loadingText={loadingText}
                        />

                        {/* File Info */}
                        {excelFile && !excelStats && (
                            <div className="mt-4 p-3 bg-bg-tertiary rounded-lg border border-border text-sm text-text-gray">
                                📁 <strong>{excelFile.name}</strong> ({(excelFile.size / 1024).toFixed(1)} KB)
                            </div>
                        )}
                    </Section>

                    {/* Results */}
                    {excelStats && (
                        <Section title="✅ Przetworzono pomyślnie">
                            <div className="grid grid-cols-3 gap-4 mb-4">
                                <div className="text-center p-3 bg-bg-card rounded-lg">
                                    <div className="text-2xl font-bold text-accent">{excelStats.totalRows}</div>
                                    <div className="text-xs text-text-muted">wierszy</div>
                                </div>
                                <div className="text-center p-3 bg-bg-card rounded-lg">
                                    <div className="text-2xl font-bold text-accent">{excelStats.totalEmojisRemoved}</div>
                                    <div className="text-xs text-text-muted">emotek usunięto</div>
                                </div>
                                <div className="text-center p-3 bg-bg-card rounded-lg">
                                    <div className="text-2xl font-bold text-accent">{excelStats.columnsProcessed.length}</div>
                                    <div className="text-xs text-text-muted">kolumn</div>
                                </div>
                            </div>
                            {excelStats.columnsProcessed.length > 0 && (
                                <div className="text-xs text-text-muted">
                                    Przetworzone kolumny: <strong>{excelStats.columnsProcessed.join(', ')}</strong>
                                </div>
                            )}
                        </Section>
                    )}

                    {/* Progress */}
                    {processing && (
                        <div className="p-4 bg-bg-tertiary rounded-lg border border-border">
                            <div className="flex justify-between mb-2">
                                <span className="text-sm text-text-gray">Przetwarzanie...</span>
                                <span className="text-sm text-accent font-medium">{progress}%</span>
                            </div>
                            <div className="w-full h-2 bg-bg-input rounded-full overflow-hidden">
                                <div className="h-full bg-accent transition-all duration-300" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Info */}
                    <div className="p-3 bg-blue-500/10 border border-blue-500/30 rounded-lg text-sm text-text-gray">
                        💡 Automatycznie szukane kolumny: <strong>Tytuł, Opis, Nazwa, Title, Description, Name</strong>
                    </div>

                    {/* Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={processExcel}
                            disabled={!excelFile || processing}
                            className="btn btn-primary"
                        >
                            {processing ? `⏳ ${progress}%` : '🧹 Przetwórz Excel'}
                        </button>
                        {processedWorkbook && (
                            <button onClick={downloadProcessedExcel} className="btn btn-primary">
                                ⬇️ Pobierz plik
                            </button>
                        )}
                        <button onClick={resetAll} className="btn btn-secondary">
                            🗑️ Wyczyść
                        </button>
                    </div>
                </>
            )}

            {/* Options */}
            <Section title="⚙️ Opcje czyszczenia">
                <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={options.cleanDoubleSpaces}
                            onChange={(e) => setOptions({ ...options, cleanDoubleSpaces: e.target.checked })}
                            className="accent-accent w-4 h-4"
                        />
                        Usuń podwójne spacje
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={options.trimLines}
                            onChange={(e) => setOptions({ ...options, trimLines: e.target.checked })}
                            className="accent-accent w-4 h-4"
                        />
                        Przytnij linie (trim)
                    </label>
                </div>
            </Section>
        </div>
    );
}
