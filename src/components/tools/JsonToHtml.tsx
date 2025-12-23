'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

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

    const handleFilesSelected = useCallback((files: File[]) => {
        const f = files.find(f => f.name.match(/\.xlsx?$/i));
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
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="JSON to HTML Converter"
                description="Konwertuje kolumny JSON (Opis) na HTML w pliku Excel. Automatycznie wykrywa kolumny i generuje poprawiony plik."
                icon="📝"
            />

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                {/* Left Column */}
                <div className="space-y-6">
                    <Section title="1. Wgraj plik">
                        <FileUpload
                            onFilesSelect={handleFilesSelected}
                            accept=".xlsx,.xls"
                            label="Wgraj plik Excel"
                            sublabel="Wymagane kolumny zaczynające się od 'Opis'"
                            icon="📥"
                            isLoading={isProcessing}
                            loadingText={isProcessing ? `Przetwarzanie... ${progress}%` : ''}
                        />
                        {file && (
                            <div className="mt-4 p-4 bg-bg-tertiary rounded-lg border border-border flex items-center justify-between">
                                <span className="text-text-white font-medium">{file.name}</span>
                                <span className="text-xs text-text-muted">{(file.size / 1024).toFixed(1)} KB</span>
                            </div>
                        )}
                    </Section>

                    <Section title="2. Akcje">
                        <div className="space-y-3">
                            <button
                                className="btn btn-primary w-full py-3"
                                onClick={outputBlob ? downloadResult : processFile}
                                disabled={!file || isProcessing}
                            >
                                {isProcessing ? '⏳ Przetwarzanie...' : outputBlob ? '📥 Pobierz wynik' : '🚀 Konwertuj'}
                            </button>

                            {outputBlob && (
                                <button className="btn btn-secondary w-full" onClick={reset}>
                                    🔄 Nowy plik
                                </button>
                            )}
                        </div>
                    </Section>

                    <Section title="ℹ️ Jak to działa">
                        <ol className="list-decimal list-inside space-y-2 text-sm text-text-muted">
                            <li>Szuka kolumn zaczynających się od <strong className="text-text-white">"Opis"</strong></li>
                            <li>Konwertuje JSON → HTML dla każdej komórki</li>
                            <li>Tworzy nowe kolumny <strong className="text-text-white">"Poprawiony opis..."</strong></li>
                            <li>Zapisuje wynik do nowego pliku Excel</li>
                        </ol>
                    </Section>
                </div>

                {/* Right Column */}
                <div className="space-y-6">
                    <Section title="Status i Logi">
                        {/* Progress */}
                        <div className="mb-6">
                            <div className="flex justify-between mb-2 text-sm">
                                <span className="text-text-gray">Postęp</span>
                                <span className="font-bold text-accent">{progress}%</span>
                            </div>
                            <div className="w-full bg-bg-input rounded-full h-2.5">
                                <div className="bg-accent h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                            </div>
                        </div>

                        {/* Logs */}
                        <div className="bg-bg-input rounded-lg border border-border p-4 h-48 overflow-y-auto font-mono text-xs space-y-1">
                            {logs.length > 0 ? logs.map((log, i) => (
                                <div key={i} className={`${log.includes('✅') ? 'text-green-400' : log.includes('❌') ? 'text-red-400' : 'text-text-muted'}`}>
                                    {log}
                                </div>
                            )) : (
                                <div className="text-text-muted opacity-50 italic">Oczekiwanie na rozpoczęcie...</div>
                            )}
                        </div>

                        {/* Error */}
                        {error && (
                            <div className="mt-4 p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                ❌ {error}
                            </div>
                        )}
                    </Section>

                    {results.length > 0 && (
                        <Section title="Wyniki konwersji">
                            <div className="space-y-2">
                                {results.map((r, i) => (
                                    <div key={i} className="p-3 bg-bg-tertiary rounded-lg border border-border">
                                        <div className="font-medium text-accent text-sm mb-1">
                                            {r.inputColumn} → {r.outputColumn}
                                        </div>
                                        <div className="text-xs text-text-muted flex justify-between">
                                            <span>Przetworzono: {r.rowsProcessed}</span>
                                            <span className={r.errors > 0 ? 'text-red-400' : 'text-green-400'}>
                                                {r.errors > 0 ? `${r.errors} błędów` : 'Bez błędów'}
                                            </span>
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>
                    )}
                </div>
            </div>
        </div>
    );
}
