'use client';

import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { useExcelWorker } from '@/hooks/useExcelWorker';

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

    const handleFileDrop = (e: React.DragEvent) => {
        e.preventDefault();
        const file = e.dataTransfer.files[0];
        if (file && file.name.match(/\.xlsx?$/i)) {
            setExcelFile(file);
            setExcelStats(null);
            setProcessedWorkbook(null);
        }
    };

    const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (file) {
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
        <div className="max-w-4xl" style={{ display: 'flex', flexDirection: 'column', gap: '24px', position: 'relative' }}>
            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="spinner"></div>
                    <p>{loadingText}</p>
                </div>
            )}

            {/* Tabs */}
            <div className="filter-pills">
                <button
                    onClick={() => { setTab('text'); resetAll(); }}
                    className={`filter-pill ${tab === 'text' ? 'active' : ''}`}
                >
                    📝 Tekst / HTML
                </button>
                <button
                    onClick={() => { setTab('excel'); resetAll(); }}
                    className={`filter-pill ${tab === 'excel' ? 'active' : ''}`}
                >
                    📊 Plik Excel
                </button>
            </div>

            {/* Text Tab */}
            {tab === 'text' && (
                <>
                    {/* Stats */}
                    {stats.removed > 0 && (
                        <div style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: '16px',
                            padding: '12px 16px',
                            background: 'rgba(16, 185, 129, 0.1)',
                            border: '1px solid rgba(16, 185, 129, 0.3)',
                            borderRadius: '8px',
                            fontSize: '14px'
                        }}>
                            <span>✅ Usunięto <strong style={{ color: 'var(--accent)' }}>{stats.removed}</strong> emotek</span>
                            <span style={{ color: 'var(--text-muted)' }}>|</span>
                            <span style={{ color: 'var(--text-muted)' }}>
                                {stats.original} → {output.length} znaków
                            </span>
                        </div>
                    )}

                    {/* Text areas */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        <div className="card">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>📝 Wejście</span>
                                <button onClick={pasteFromClipboard} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                    📋 Wklej
                                </button>
                            </div>
                            <div className="card-body">
                                <textarea
                                    className="form-input"
                                    style={{ width: '100%', height: '250px', resize: 'none', fontFamily: 'monospace', fontSize: '13px' }}
                                    placeholder="Wklej tekst z emotkami... 🎉✨🔥&#10;&#10;Przykład:&#10;Świetny produkt! 🔥 Polecam!&#10;<p>Opis 🎁 z HTML</p>"
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                />
                            </div>
                        </div>

                        <div className="card">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                                <span>✅ Wyjście</span>
                                {output && (
                                    <button onClick={copyOutput} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                        📋 Kopiuj
                                    </button>
                                )}
                            </div>
                            <div className="card-body">
                                <textarea
                                    className="form-input"
                                    style={{ width: '100%', height: '250px', resize: 'none', fontFamily: 'monospace', fontSize: '13px' }}
                                    readOnly
                                    value={output}
                                    placeholder="Tutaj pojawi się tekst bez emotek..."
                                />
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '12px' }}>
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
                    <div
                        className="upload-zone"
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={handleFileDrop}
                        onClick={() => fileInputRef.current?.click()}
                    >
                        <input
                            ref={fileInputRef}
                            type="file"
                            accept=".xlsx,.xls"
                            className="hidden"
                            onChange={handleFileSelect}
                        />
                        <span className="icon">📊</span>
                        <p className="title">{excelFile?.name || 'Przeciągnij plik Excel'}</p>
                        <p className="subtitle">lub kliknij aby wybrać (.xlsx, .xls)</p>
                    </div>

                    {/* File Info */}
                    {excelFile && !excelStats && (
                        <div style={{
                            padding: '12px 16px',
                            background: 'var(--bg-tertiary)',
                            borderRadius: '8px',
                            border: '1px solid var(--border)',
                            fontSize: '14px',
                            color: 'var(--text-gray)'
                        }}>
                            📁 <strong>{excelFile.name}</strong> ({(excelFile.size / 1024).toFixed(1)} KB)
                        </div>
                    )}

                    {/* Results */}
                    {excelStats && (
                        <div className="card" style={{ background: 'rgba(16, 185, 129, 0.05)', border: '1px solid rgba(16, 185, 129, 0.3)' }}>
                            <div className="card-header">✅ Przetworzono pomyślnie</div>
                            <div className="card-body">
                                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '16px' }}>
                                    <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{excelStats.totalRows}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>wierszy</div>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{excelStats.totalEmojisRemoved}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>emotek usunięto</div>
                                    </div>
                                    <div style={{ textAlign: 'center', padding: '12px', background: 'var(--bg-card)', borderRadius: '8px' }}>
                                        <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--accent)' }}>{excelStats.columnsProcessed.length}</div>
                                        <div style={{ fontSize: '12px', color: 'var(--text-muted)' }}>kolumn</div>
                                    </div>
                                </div>
                                {excelStats.columnsProcessed.length > 0 && (
                                    <div style={{ marginTop: '12px', fontSize: '13px', color: 'var(--text-muted)' }}>
                                        Przetworzone kolumny: <strong>{excelStats.columnsProcessed.join(', ')}</strong>
                                    </div>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    {processing && (
                        <div>
                            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
                                <span style={{ fontSize: '14px', color: 'var(--text-gray)' }}>Przetwarzanie...</span>
                                <span style={{ fontSize: '14px', color: 'var(--accent)', fontWeight: 500 }}>{progress}%</span>
                            </div>
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    )}

                    {/* Info */}
                    <div style={{
                        padding: '12px 16px',
                        background: 'rgba(59, 130, 246, 0.1)',
                        borderRadius: '8px',
                        border: '1px solid rgba(59, 130, 246, 0.3)',
                        fontSize: '13px',
                        color: 'var(--text-gray)'
                    }}>
                        💡 Automatycznie szukane kolumny: <strong>Tytuł, Opis, Nazwa, Title, Description, Name</strong>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '12px' }}>
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
            <div className="card">
                <div className="card-header">⚙️ Opcje czyszczenia</div>
                <div className="card-body">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={options.cleanDoubleSpaces}
                                onChange={(e) => setOptions({ ...options, cleanDoubleSpaces: e.target.checked })}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            Usuń podwójne spacje
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer' }}>
                            <input
                                type="checkbox"
                                checked={options.trimLines}
                                onChange={(e) => setOptions({ ...options, trimLines: e.target.checked })}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            Przytnij linie (trim)
                        </label>
                    </div>
                </div>
            </div>
        </div>
    );
}
