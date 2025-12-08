'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

interface ConversionResult {
    inputColumn: string;
    outputColumn: string;
    rowsProcessed: number;
    errors: number;
}

export default function JsonToHtml() {
    const [file, setFile] = useState<File | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [results, setResults] = useState<ConversionResult[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find(f => f.name.match(/\.xlsx?$/i));
        if (f) setFile(f);
    }, []);

    const konwertujJsonNaHtml = (jsonString: string): string => {
        if (!jsonString || typeof jsonString !== 'string' || !jsonString.trim()) {
            return '';
        }

        try {
            const data = JSON.parse(jsonString);
            const htmlOutput: string[] = [];

            if (!data.sections) {
                return 'BŁĄD: Brak klucza "sections" w JSON';
            }

            for (const section of data.sections) {
                if (!section.items) continue;

                const items = section.items;

                // Przypadek 1: Jeden element (pełna szerokość)
                if (items.length === 1) {
                    const item = items[0];
                    if (item.type === 'TEXT') {
                        htmlOutput.push('<div style="padding: 10px;">');
                        htmlOutput.push(item.content || '');
                        htmlOutput.push('</div>');
                    } else if (item.type === 'IMAGE') {
                        htmlOutput.push('<div style="text-align: center; padding: 10px;">');
                        htmlOutput.push(`<img src="${item.url || ''}" alt="Obraz" style="max-width: 100%; height: auto;">`);
                        htmlOutput.push('</div>');
                    }
                }
                // Przypadek 2: Dwa elementy (układ 50/50)
                else if (items.length === 2) {
                    htmlOutput.push('<table width="100%" border="0" cellpadding="10" cellspacing="0" style="margin-top: 15px; margin-bottom: 15px; border-spacing: 0;"><tbody><tr>');

                    for (const item of items) {
                        htmlOutput.push('<td width="50%" style="vertical-align: top; padding: 10px;">');
                        if (item.type === 'TEXT') {
                            htmlOutput.push(item.content || '');
                        } else if (item.type === 'IMAGE') {
                            htmlOutput.push(`<img src="${item.url || ''}" alt="Obraz" style="max-width: 100%; height: auto; display: block;">`);
                        }
                        htmlOutput.push('</td>');
                    }

                    htmlOutput.push('</tr></tbody></table>');
                }
            }

            return htmlOutput.join('\n');
        } catch {
            return 'BŁĄD: Niepoprawny format JSON';
        }
    };

    const processFile = async () => {
        if (!file) return;

        setIsProcessing(true);
        setProgress(10);
        setError(null);
        setResults([]);
        setOutputBlob(null);
        setLogs([]);
        addLog('Rozpoczynam przetwarzanie...');

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Convert to JSON
            const jsonData: Record<string, unknown>[] = XLSX.utils.sheet_to_json(worksheet);

            if (jsonData.length === 0) {
                throw new Error('Plik jest pusty');
            }

            setProgress(20);
            addLog(`Wczytano ${jsonData.length} wierszy`);

            // Find columns starting with "Opis"
            const PREFIX_WEJSCIOWY = 'Opis';
            const PREFIX_WYJSCIOWY = 'Poprawiony opis';

            const headers = Object.keys(jsonData[0]);
            const kolumnyDoObrobki = headers.filter(h => h.startsWith(PREFIX_WEJSCIOWY));

            if (kolumnyDoObrobki.length === 0) {
                throw new Error(`Nie znaleziono kolumn zaczynających się od "${PREFIX_WEJSCIOWY}"`);
            }

            addLog(`Znaleziono ${kolumnyDoObrobki.length} kolumn do konwersji: ${kolumnyDoObrobki.join(', ')}`);
            setProgress(30);

            const conversionResults: ConversionResult[] = [];

            // Process each column
            for (let colIdx = 0; colIdx < kolumnyDoObrobki.length; colIdx++) {
                const staraKolumna = kolumnyDoObrobki[colIdx];
                const resztaNazwy = staraKolumna.slice(PREFIX_WEJSCIOWY.length);
                const nowaKolumna = `${PREFIX_WYJSCIOWY}${resztaNazwy}`;

                addLog(`Przetwarzam: "${staraKolumna}" → "${nowaKolumna}"...`);

                let errorsCount = 0;

                for (let i = 0; i < jsonData.length; i++) {
                    const inputValue = String(jsonData[i][staraKolumna] || '');
                    const outputValue = konwertujJsonNaHtml(inputValue);

                    if (outputValue.startsWith('BŁĄD:')) {
                        errorsCount++;
                    }

                    jsonData[i][nowaKolumna] = outputValue;
                }

                conversionResults.push({
                    inputColumn: staraKolumna,
                    outputColumn: nowaKolumna,
                    rowsProcessed: jsonData.length,
                    errors: errorsCount
                });

                setProgress(30 + Math.round((colIdx + 1) / kolumnyDoObrobki.length * 50));
            }

            setProgress(85);
            addLog('Generowanie pliku wyjściowego...');

            // Create new workbook
            const newWorksheet = XLSX.utils.json_to_sheet(jsonData);
            const newWorkbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, sheetName);

            // Generate blob
            const wbout = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            setOutputBlob(blob);
            setResults(conversionResults);
            setProgress(100);
            addLog('✅ Gotowe!');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nieznany błąd');
            addLog(`❌ Błąd: ${err instanceof Error ? err.message : 'Nieznany błąd'}`);
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadResult = () => {
        if (!outputBlob || !file) return;
        const baseName = file.name.replace(/\.xlsx?$/i, '');
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}_poprawiony.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setFile(null);
        setProgress(0);
        setResults([]);
        setError(null);
        setOutputBlob(null);
        setLogs([]);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Description */}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Konwertuje kolumny JSON (Opis) na HTML w pliku Excel
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Upload Zone */}
                    <div
                        className="upload-zone"
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('json-file')?.click()}
                    >
                        <input
                            id="json-file"
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                        />
                        <span className="icon">{file ? '✅' : '📥'}</span>
                        <p className="title">{file?.name || 'Przeciągnij plik Excel'}</p>
                        <p className="subtitle">
                            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Z kolumnami "Opis..."'}
                        </p>
                    </div>

                    {/* Info Card */}
                    <div className="card">
                        <div className="card-header">📋 Jak to działa</div>
                        <div className="card-body" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            <ol style={{ paddingLeft: '1rem', margin: 0 }}>
                                <li>Szuka kolumn zaczynających się od <strong>"Opis"</strong></li>
                                <li>Konwertuje JSON → HTML dla każdej komórki</li>
                                <li>Tworzy nowe kolumny <strong>"Poprawiony opis..."</strong></li>
                                <li>Zapisuje wynik do nowego pliku Excel</li>
                            </ol>
                        </div>
                    </div>

                    {/* Process Button */}
                    <button
                        className="btn btn-primary"
                        onClick={outputBlob ? downloadResult : processFile}
                        disabled={!file || isProcessing}
                        style={{ width: '100%' }}
                    >
                        {isProcessing ? '⏳ Przetwarzanie...' : outputBlob ? '📥 Pobierz wynik' : '🚀 Konwertuj'}
                    </button>

                    {outputBlob && (
                        <button className="btn btn-secondary" onClick={reset} style={{ width: '100%' }}>
                            🔄 Nowy plik
                        </button>
                    )}
                </div>

                {/* Right Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Progress Card */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>📊 Status</span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{progress}%</span>
                        </div>
                        <div className="card-body">
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                        </div>
                    </div>

                    {/* Results */}
                    {results.length > 0 && (
                        <div className="card">
                            <div className="card-header">✅ Wyniki konwersji</div>
                            <div className="card-body" style={{ fontSize: '0.8rem' }}>
                                {results.map((r, i) => (
                                    <div key={i} style={{
                                        padding: '0.5rem',
                                        background: 'var(--bg-tertiary)',
                                        borderRadius: '6px',
                                        marginBottom: i < results.length - 1 ? '0.5rem' : 0
                                    }}>
                                        <div style={{ fontWeight: 600, color: 'var(--accent)' }}>
                                            {r.inputColumn} → {r.outputColumn}
                                        </div>
                                        <div style={{ color: 'var(--text-muted)', fontSize: '0.75rem' }}>
                                            {r.rowsProcessed} wierszy | {r.errors > 0 ? `${r.errors} błędów` : 'Bez błędów'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}

                    {/* Log */}
                    <div className="card" style={{ flex: 1 }}>
                        <div className="card-header">📋 Log</div>
                        <div className="card-body" style={{ maxHeight: '150px', overflowY: 'auto', fontSize: '0.75rem', fontFamily: 'monospace' }}>
                            {logs.length > 0 ? logs.map((log, i) => (
                                <div key={i} style={{ padding: '0.15rem 0', color: log.includes('✅') ? 'var(--accent)' : log.includes('❌') ? 'var(--error)' : 'var(--text-muted)' }}>
                                    {log}
                                </div>
                            )) : (
                                <div style={{ color: 'var(--text-muted)' }}>Gotowy do pracy.</div>
                            )}
                        </div>
                    </div>

                    {/* Error */}
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
            </div>
        </div>
    );
}
