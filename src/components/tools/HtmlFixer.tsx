'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useStats } from '../Stats';
import { useHistory } from '../History';
import { useNotifications } from '../Notifications';
import { useUndoRedo, useUndoRedoKeyboard, UndoRedoButtons } from '@/hooks/useUndoRedo';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

interface ExcelRow {
    rowIndex: number;
    originalHtml: string;
    fixedHtml: string;
}

interface Settings {
    mode: 'single' | 'batch';
    fixOptions: {
        removeStyles: boolean;
        cleanTags: boolean;
        fixEntities: boolean;
        minify: boolean;
    };
    selectedColumn: string;
}

const DEFAULT_SETTINGS: Settings = {
    mode: 'single',
    fixOptions: {
        removeStyles: true,
        cleanTags: true,
        fixEntities: true,
        minify: false,
    },
    selectedColumn: '',
};

export default function HtmlFixer() {
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

    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');

    // Excel batch mode
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [excelData, setExcelData] = useState<ExcelRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedCount, setProcessedCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);
    // Loading state for file upload
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    // Core hooks
    const { recordUsage } = useStats();
    const { addToHistory } = useHistory();
    const { addNotification } = useNotifications();

    const fixHtmlString = useCallback((html: string): string => {
        let result = html;

        if (settings.fixOptions.removeStyles) {
            result = result.replace(/\s*style="[^"]*"/gi, '');
            result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        }

        if (settings.fixOptions.cleanTags) {
            result = result.replace(/<font[^>]*>/gi, '');
            result = result.replace(/<\/font>/gi, '');
            result = result.replace(/<span>\s*<\/span>/gi, '');
            result = result.replace(/class="[^"]*"/gi, '');
        }

        if (settings.fixOptions.fixEntities) {
            result = result.replace(/&nbsp;/gi, ' ');
            result = result.replace(/&amp;/gi, '&');
            result = result.replace(/&lt;/gi, '<');
            result = result.replace(/&gt;/gi, '>');
        }

        if (settings.fixOptions.minify) {
            result = result.replace(/\s+/g, ' ').trim();
            result = result.replace(/>\s+</g, '><');
        }

        result = result.replace(/\n\s*\n/g, '\n');
        result = result.trim();

        return result;
    }, [settings.fixOptions]);

    const fixHtml = () => {
        setOutput(fixHtmlString(input));
    };

    const copyOutput = () => {
        navigator.clipboard.writeText(output);
    };

    const handleFilesSelected = async (files: File[]) => {
        const file = files[0];
        if (!file) return;

        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${file.name}...`);
        setExcelFile(file);
        setExcelData([]);
        setSettings({ ...settings, selectedColumn: '' }, 'Reset kolumny');

        try {
            const buffer = await file.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as unknown[][];

            if (jsonData.length > 0) {
                const headers = (jsonData[0] as string[]).filter(Boolean);
                setColumns(headers);
            }
        } catch (error) {
            console.error('Error reading Excel file:', error);
            alert('Błąd podczas wczytywania pliku Excel');
        }
        setIsLoading(false);
    };

    const processExcel = async () => {
        if (!excelFile || !settings.selectedColumn) return;

        setIsProcessing(true);
        setProcessedCount(0);

        try {
            const buffer = await excelFile.arrayBuffer();
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

            const results: ExcelRow[] = [];

            for (let i = 0; i < jsonData.length; i++) {
                const row = jsonData[i];
                const htmlContent = String(row[settings.selectedColumn] || '');
                const fixedHtml = fixHtmlString(htmlContent);

                results.push({
                    rowIndex: i + 2, // +2 because Excel is 1-indexed and has header row
                    originalHtml: htmlContent,
                    fixedHtml: fixedHtml,
                });

                setProcessedCount(i + 1);

                // Small delay for UI update
                if (i % 50 === 0) {
                    await new Promise(resolve => setTimeout(resolve, 10));
                }
            }

            setExcelData(results);
            recordUsage('html-fixer', results.length);
            addNotification('success', 'Naprawa zakończona', `Pomyślnie naprawiono ${results.length} wierszy HTML.`);
            addToHistory({
                tool: 'HTML Fixer',
                toolIcon: '📝',
                inputFiles: excelFile ? [excelFile.name] : [],
                outputFileName: excelFile?.name.replace(/\.xlsx?$/i, '') + '_FIXED.xlsx',
                outputBlob: null,
                summary: `${results.length} wierszy HTML → naprawione`,
                stats: { 'Wierszy': results.length }
            });
        } catch (error) {
            console.error('Error processing Excel:', error);
            alert('Błąd podczas przetwarzania pliku');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadResults = () => {
        if (excelData.length === 0 || !excelFile) return;

        // Read original file and add fixed column
        excelFile.arrayBuffer().then(buffer => {
            const workbook = XLSX.read(buffer, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];
            const jsonData = XLSX.utils.sheet_to_json(worksheet) as Record<string, unknown>[];

            // Add fixed HTML column
            const fixedColumnName = `${settings.selectedColumn}_FIXED`;
            jsonData.forEach((row, i) => {
                const match = excelData.find(d => d.rowIndex === i + 2);
                if (match) {
                    row[fixedColumnName] = match.fixedHtml;
                }
            });

            // Create new workbook
            const newWorkbook = XLSX.utils.book_new();
            const newWorksheet = XLSX.utils.json_to_sheet(jsonData);
            XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);

            // Download
            const fileName = excelFile.name.replace(/\.xlsx?$/i, '') + '_FIXED.xlsx';
            XLSX.writeFile(newWorkbook, fileName);
        });
    };

    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="HTML Fixer"
                description="Napraw i wyczyść kod HTML. Usuń zbędne style, tagi i napraw encje. Obsługuje tryb pojedynczy i wsadowy (Excel)."
                icon="📝"
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="upload-progress-spinner" />
                    <p className="text-white text-lg mt-5">{loadingText}</p>
                </div>
            )}

            {/* Mode Toggle */}
            <Section
                title="📂 Tryb pracy"
                actions={
                    <UndoRedoButtons
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onUndo={undo}
                        onRedo={redo}
                        undoCount={undoCount}
                        redoCount={redoCount}
                    />
                }
            >
                <div className="flex gap-3">
                    <button
                        onClick={() => setSettings({ ...settings, mode: 'single' }, 'Zmiana trybu na pojedynczy')}
                        className={`btn ${settings.mode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        📝 Pojedynczy HTML
                    </button>
                    <button
                        onClick={() => setSettings({ ...settings, mode: 'batch' }, 'Zmiana trybu na masowy')}
                        className={`btn ${settings.mode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        📊 Masowy z Excel
                    </button>
                </div>
            </Section>

            {settings.mode === 'single' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Input */}
                    <Section title="📝 Wejście">
                        <textarea
                            className="w-full h-64 p-3 bg-bg-input border border-border rounded-lg text-sm font-mono resize-none text-text-white focus:outline-none focus:border-accent transition-colors"
                            placeholder="Wklej kod HTML tutaj..."
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
                            placeholder="Tutaj pojawi się naprawiony HTML..."
                        />
                    </Section>
                </div>
            ) : (
                <>
                    {/* Excel Upload */}
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

                        {excelFile && (
                            <div className="mt-4 p-4 bg-bg-tertiary rounded-lg border border-border">
                                <div className="flex items-center gap-2 mb-4">
                                    <span className="text-accent">✅</span>
                                    <span className="font-medium">{excelFile.name}</span>
                                </div>

                                {columns.length > 0 && (
                                    <div>
                                        <label className="block mb-2 text-text-muted text-sm">
                                            Wybierz kolumnę z HTML:
                                        </label>
                                        <select
                                            value={settings.selectedColumn}
                                            onChange={(e) => setSettings({ ...settings, selectedColumn: e.target.value }, `Wybór kolumny ${e.target.value}`)}
                                            className="w-full md:w-auto min-w-[200px] p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                        >
                                            <option value="">-- Wybierz kolumnę --</option>
                                            {columns.map(col => (
                                                <option key={col} value={col}>{col}</option>
                                            ))}
                                        </select>
                                    </div>
                                )}
                            </div>
                        )}
                    </Section>

                    {/* Results */}
                    {excelData.length > 0 && (
                        <Section
                            title={`✅ Wyniki (${excelData.length} wierszy)`}
                            actions={
                                <button onClick={downloadResults} className="btn btn-primary text-sm py-1.5 px-3">
                                    ⬇️ Pobierz Excel
                                </button>
                            }
                        >
                            <div className="max-h-[400px] overflow-auto border border-border rounded-lg">
                                <table className="w-full text-sm border-collapse">
                                    <thead className="bg-bg-tertiary sticky top-0">
                                        <tr>
                                            <th className="p-2 text-left text-text-muted font-medium border-b border-border">Wiersz</th>
                                            <th className="p-2 text-left text-text-muted font-medium border-b border-border">Oryginalny (skrót)</th>
                                            <th className="p-2 text-left text-text-muted font-medium border-b border-border">Naprawiony (skrót)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {excelData.slice(0, 100).map(row => (
                                            <tr key={row.rowIndex} className="border-b border-border/50 hover:bg-bg-tertiary/50 transition-colors">
                                                <td className="p-2 text-accent font-mono">{row.rowIndex}</td>
                                                <td className="p-2 text-text-gray max-w-[300px] truncate font-mono text-xs">
                                                    {row.originalHtml.substring(0, 50)}...
                                                </td>
                                                <td className="p-2 text-text-white max-w-[300px] truncate font-mono text-xs">
                                                    {row.fixedHtml.substring(0, 50)}...
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {excelData.length > 100 && (
                                    <p className="p-4 text-center text-text-muted text-sm bg-bg-tertiary/30">
                                        ... i {excelData.length - 100} więcej wierszy. Pobierz plik Excel aby zobaczyć wszystkie.
                                    </p>
                                )}
                            </div>
                        </Section>
                    )}

                    {/* Batch Actions */}
                    <div className="flex gap-3">
                        <button
                            onClick={processExcel}
                            disabled={!settings.selectedColumn || isProcessing}
                            className="btn btn-primary"
                        >
                            {isProcessing ? `⏳ Przetwarzanie... ${processedCount}` : '🔧 Napraw wszystkie'}
                        </button>
                        <button
                            onClick={() => {
                                setExcelFile(null);
                                setColumns([]);
                                setSettings({ ...settings, selectedColumn: '' }, 'Wyczyszczenie kolumny');
                                setExcelData([]);
                            }}
                            className="btn btn-secondary"
                        >
                            🗑️ Wyczyść
                        </button>
                    </div>
                </>
            )}

            {/* Options - shared between modes */}
            <Section title="⚙️ Opcje naprawy">
                <div className="flex flex-wrap gap-6">
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={settings.fixOptions.removeStyles}
                            onChange={(e) => setSettings({ ...settings, fixOptions: { ...settings.fixOptions, removeStyles: e.target.checked } }, e.target.checked ? 'Włączenie usuwania styli' : 'Wyłączenie usuwania styli')}
                            className="accent-accent w-4 h-4"
                        />
                        Usuń style inline
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={settings.fixOptions.cleanTags}
                            onChange={(e) => setSettings({ ...settings, fixOptions: { ...settings.fixOptions, cleanTags: e.target.checked } }, e.target.checked ? 'Włączenie czyszczenia tagów' : 'Wyłączenie czyszczenia tagów')}
                            className="accent-accent w-4 h-4"
                        />
                        Usuń zbędne tagi
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={settings.fixOptions.fixEntities}
                            onChange={(e) => setSettings({ ...settings, fixOptions: { ...settings.fixOptions, fixEntities: e.target.checked } }, e.target.checked ? 'Włączenie naprawy encji' : 'Wyłączenie naprawy encji')}
                            className="accent-accent w-4 h-4"
                        />
                        Napraw encje HTML
                    </label>
                    <label className="flex items-center gap-2 text-sm cursor-pointer text-text-gray hover:text-text-white transition-colors">
                        <input
                            type="checkbox"
                            checked={settings.fixOptions.minify}
                            onChange={(e) => setSettings({ ...settings, fixOptions: { ...settings.fixOptions, minify: e.target.checked } }, e.target.checked ? 'Włączenie minifikacji' : 'Wyłączenie minifikacji')}
                            className="accent-accent w-4 h-4"
                        />
                        Minifikuj
                    </label>
                </div>
            </Section>

            {/* Single mode actions */}
            {settings.mode === 'single' && (
                <div className="flex gap-3">
                    <button onClick={fixHtml} disabled={!input} className="btn btn-primary">
                        🔧 Napraw HTML
                    </button>
                    <button onClick={() => { setInput(''); setOutput(''); }} className="btn btn-secondary">
                        🗑️ Wyczyść
                    </button>
                </div>
            )}
        </div>
    );
}
