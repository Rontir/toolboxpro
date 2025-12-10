'use client';

import { useState, useRef, useCallback } from 'react';
import * as XLSX from 'xlsx';

interface ExcelRow {
    rowIndex: number;
    originalHtml: string;
    fixedHtml: string;
}

export default function HtmlFixer() {
    const [mode, setMode] = useState<'single' | 'batch'>('single');
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [fixOptions, setFixOptions] = useState({
        removeStyles: true,
        cleanTags: true,
        fixEntities: true,
        minify: false,
    });

    // Excel batch mode
    const [excelFile, setExcelFile] = useState<File | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [selectedColumn, setSelectedColumn] = useState('');
    const [excelData, setExcelData] = useState<ExcelRow[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [processedCount, setProcessedCount] = useState(0);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const fixHtmlString = useCallback((html: string): string => {
        let result = html;

        if (fixOptions.removeStyles) {
            result = result.replace(/\s*style="[^"]*"/gi, '');
            result = result.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        }

        if (fixOptions.cleanTags) {
            result = result.replace(/<font[^>]*>/gi, '');
            result = result.replace(/<\/font>/gi, '');
            result = result.replace(/<span>\s*<\/span>/gi, '');
            result = result.replace(/class="[^"]*"/gi, '');
        }

        if (fixOptions.fixEntities) {
            result = result.replace(/&nbsp;/gi, ' ');
            result = result.replace(/&amp;/gi, '&');
            result = result.replace(/&lt;/gi, '<');
            result = result.replace(/&gt;/gi, '>');
        }

        if (fixOptions.minify) {
            result = result.replace(/\s+/g, ' ').trim();
            result = result.replace(/>\s+</g, '><');
        }

        result = result.replace(/\n\s*\n/g, '\n');
        result = result.trim();

        return result;
    }, [fixOptions]);

    const fixHtml = () => {
        setOutput(fixHtmlString(input));
    };

    const copyOutput = () => {
        navigator.clipboard.writeText(output);
    };

    const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const file = e.target.files?.[0];
        if (!file) return;

        setExcelFile(file);
        setExcelData([]);
        setSelectedColumn('');

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
    };

    const processExcel = async () => {
        if (!excelFile || !selectedColumn) return;

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
                const htmlContent = String(row[selectedColumn] || '');
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
            const fixedColumnName = `${selectedColumn}_FIXED`;
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
        <div className="max-w-5xl" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Mode Toggle */}
            <div className="card">
                <div className="card-header">📂 Tryb pracy</div>
                <div className="card-body">
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={() => setMode('single')}
                            className={`btn ${mode === 'single' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                            📝 Pojedynczy HTML
                        </button>
                        <button
                            onClick={() => setMode('batch')}
                            className={`btn ${mode === 'batch' ? 'btn-primary' : 'btn-secondary'}`}
                        >
                            📊 Masowy z Excel
                        </button>
                    </div>
                </div>
            </div>

            {mode === 'single' ? (
                <>
                    {/* Text areas */}
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                        {/* Input */}
                        <div className="card">
                            <div className="card-header">📝 Wejście</div>
                            <div className="card-body">
                                <textarea
                                    style={{
                                        width: '100%',
                                        height: '256px',
                                        padding: '12px',
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontFamily: 'monospace',
                                        resize: 'none',
                                        color: 'var(--text-white)',
                                        outline: 'none',
                                    }}
                                    placeholder="Wklej kod HTML tutaj..."
                                    value={input}
                                    onChange={(e) => setInput(e.target.value)}
                                />
                            </div>
                        </div>

                        {/* Output */}
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
                                    style={{
                                        width: '100%',
                                        height: '256px',
                                        padding: '12px',
                                        background: 'var(--bg-input)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '8px',
                                        fontSize: '13px',
                                        fontFamily: 'monospace',
                                        resize: 'none',
                                        color: 'var(--text-white)',
                                        outline: 'none',
                                    }}
                                    readOnly
                                    value={output}
                                    placeholder="Tutaj pojawi się naprawiony HTML..."
                                />
                            </div>
                        </div>
                    </div>
                </>
            ) : (
                <>
                    {/* Excel Upload */}
                    <div className="card">
                        <div className="card-header">📊 Plik Excel</div>
                        <div className="card-body">
                            <input
                                ref={fileInputRef}
                                type="file"
                                accept=".xlsx,.xls"
                                onChange={handleFileUpload}
                                style={{ display: 'none' }}
                            />
                            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
                                <button
                                    onClick={() => fileInputRef.current?.click()}
                                    className="btn btn-secondary"
                                >
                                    📁 Wybierz plik Excel
                                </button>
                                {excelFile && (
                                    <span style={{ color: 'var(--text-gray)' }}>
                                        ✅ {excelFile.name}
                                    </span>
                                )}
                            </div>

                            {columns.length > 0 && (
                                <div style={{ marginTop: '1rem' }}>
                                    <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                        Wybierz kolumnę z HTML:
                                    </label>
                                    <select
                                        value={selectedColumn}
                                        onChange={(e) => setSelectedColumn(e.target.value)}
                                        style={{
                                            padding: '0.5rem 1rem',
                                            background: 'var(--bg-input)',
                                            border: '1px solid var(--border)',
                                            borderRadius: '8px',
                                            color: 'var(--text-white)',
                                            fontSize: '0.875rem',
                                            minWidth: '200px'
                                        }}
                                    >
                                        <option value="">-- Wybierz kolumnę --</option>
                                        {columns.map(col => (
                                            <option key={col} value={col}>{col}</option>
                                        ))}
                                    </select>
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Results */}
                    {excelData.length > 0 && (
                        <div className="card">
                            <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                                <span>✅ Wyniki ({excelData.length} wierszy)</span>
                                <button onClick={downloadResults} className="btn btn-primary" style={{ fontSize: '0.875rem', padding: '0.5rem 1rem' }}>
                                    ⬇️ Pobierz Excel
                                </button>
                            </div>
                            <div className="card-body" style={{ maxHeight: '400px', overflow: 'auto' }}>
                                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.8rem' }}>
                                    <thead>
                                        <tr style={{ borderBottom: '1px solid var(--border)' }}>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>Wiersz</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>Oryginalny (skrót)</th>
                                            <th style={{ padding: '0.5rem', textAlign: 'left', color: 'var(--text-muted)' }}>Naprawiony (skrót)</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {excelData.slice(0, 100).map(row => (
                                            <tr key={row.rowIndex} style={{ borderBottom: '1px solid var(--border-light)' }}>
                                                <td style={{ padding: '0.5rem', color: 'var(--accent)' }}>{row.rowIndex}</td>
                                                <td style={{ padding: '0.5rem', color: 'var(--text-gray)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {row.originalHtml.substring(0, 50)}...
                                                </td>
                                                <td style={{ padding: '0.5rem', color: 'var(--text-white)', maxWidth: '300px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                                    {row.fixedHtml.substring(0, 50)}...
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                                {excelData.length > 100 && (
                                    <p style={{ marginTop: '1rem', color: 'var(--text-muted)', textAlign: 'center' }}>
                                        ... i {excelData.length - 100} więcej wierszy. Pobierz plik Excel aby zobaczyć wszystkie.
                                    </p>
                                )}
                            </div>
                        </div>
                    )}

                    {/* Batch Actions */}
                    <div style={{ display: 'flex', gap: '12px' }}>
                        <button
                            onClick={processExcel}
                            disabled={!selectedColumn || isProcessing}
                            className="btn btn-primary"
                        >
                            {isProcessing ? `⏳ Przetwarzanie... ${processedCount}` : '🔧 Napraw wszystkie'}
                        </button>
                        <button
                            onClick={() => {
                                setExcelFile(null);
                                setColumns([]);
                                setSelectedColumn('');
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
            <div className="card">
                <div className="card-header">⚙️ Opcje naprawy</div>
                <div className="card-body">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.removeStyles}
                                onChange={(e) => setFixOptions({ ...fixOptions, removeStyles: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Usuń style inline
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.cleanTags}
                                onChange={(e) => setFixOptions({ ...fixOptions, cleanTags: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Usuń zbędne tagi
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.fixEntities}
                                onChange={(e) => setFixOptions({ ...fixOptions, fixEntities: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Napraw encje HTML
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.minify}
                                onChange={(e) => setFixOptions({ ...fixOptions, minify: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Minifikuj
                        </label>
                    </div>
                </div>
            </div>

            {/* Single mode actions */}
            {mode === 'single' && (
                <div style={{ display: 'flex', gap: '12px' }}>
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
