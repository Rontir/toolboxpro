'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

type Mode = 'learn' | 'exact';

interface TemplateInfo {
    entities: Record<string, string>;
    hasList: boolean;
    listStartLine: number;
    separator: string;
}

export default function OpisToHtml() {
    const [file, setFile] = useState<File | null>(null);
    const [mode, setMode] = useState<Mode>('learn');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [error, setError] = useState<string | null>(null);
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [rowsProcessed, setRowsProcessed] = useState(0);
    const [logs, setLogs] = useState<string[]>([]);

    const addLog = (msg: string) => setLogs(prev => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);

    const handleFilesSelected = useCallback((files: File[]) => {
        const f = files.find(f => f.name.match(/\.xlsx?$/i));
        if (f) setFile(f);
    }, []);

    // Extract HTML entities mapping
    const extractEntitiesMapping = (htmlText: string): Record<string, string> => {
        const entities: Record<string, string> = {};
        const entityPattern = /&[a-zA-Z]+;|&#\d+;|&#x[0-9a-fA-F]+;/g;
        const matches = htmlText.match(entityPattern) || [];

        const uniqueMatches = [...new Set(matches)];
        for (const entity of uniqueMatches) {
            const textarea = document.createElement('textarea');
            textarea.innerHTML = entity;
            const decoded = textarea.value;
            if (decoded !== entity) {
                entities[decoded] = entity;
            }
        }
        return entities;
    };

    // Analyze first example to learn structure
    const analyzeFirstExample = (plainText: string, htmlText: string): TemplateInfo => {
        const plainLines = String(plainText).split('\n').map(l => l.trim()).filter(l => l);
        const entities = extractEntitiesMapping(htmlText);

        const ulPosition = htmlText.indexOf('<ul>');
        const hasList = ulPosition !== -1;
        let listStartLine = -1;

        if (hasList) {
            const pMatch = htmlText.match(/<p>([\s\S]*?)<\/p>\s*<ul>/);
            if (pMatch) {
                const pParts = pMatch[1].split('<br />');
                listStartLine = pParts.length - 1;
            }
        }

        let separator = '<br />';
        if (htmlText.includes('<br>') && !htmlText.includes('<br />')) {
            separator = '<br>';
        } else if (htmlText.includes('<br/>')) {
            separator = '<br/>';
        }

        return {
            entities,
            hasList,
            listStartLine,
            separator
        };
    };

    // Learn mode conversion
    const convertLearnMode = (plainText: string, template: TemplateInfo): string => {
        if (!plainText) return '';

        let text = String(plainText);

        // Replace characters with entities
        for (const [decoded, entity] of Object.entries(template.entities)) {
            text = text.split(decoded).join(entity);
        }

        const plainLines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (plainLines.length === 0) return '';

        // If no list
        if (!template.hasList) {
            const pText = plainLines.join(template.separator + '\n');
            return `<p>${pText}</p>`;
        }

        // If has list
        const listStart = template.listStartLine;

        if (listStart === -1 || listStart >= plainLines.length) {
            const pText = plainLines.join(template.separator + '\n');
            return `<p>${pText}</p>`;
        }

        const paragraphLines = plainLines.slice(0, listStart + 1);
        const listLines = plainLines.slice(listStart + 1);

        let html = '<p>' + paragraphLines.join(template.separator + '\n') + '</p>';

        if (listLines.length > 0) {
            html += '\n<ul>';
            for (const line of listLines) {
                html += `\n\t<li>${line}</li>`;
            }
            html += '\n</ul>';
        }

        return html;
    };

    // Exact mode conversion
    const convertExactMode = (plainText: string, templateHtml: string): string => {
        if (!plainText || !templateHtml) return '';

        let text = String(plainText);

        // Extract entities from template
        const entities = extractEntitiesMapping(templateHtml);

        // Replace characters with entities
        for (const [decoded, entity] of Object.entries(entities)) {
            text = text.split(decoded).join(entity);
        }

        const plainLines = text.split('\n').map(l => l.trim()).filter(l => l);
        if (plainLines.length === 0) return '';

        // Analyze template
        const pMatch = templateHtml.match(/<p>([\s\S]*?)<\/p>/);
        if (!pMatch) return text;

        const pContent = pMatch[1];
        const pParts = pContent.split('<br />');
        const numPLines = pParts.length;

        const hasList = templateHtml.includes('<ul>');

        if (!hasList) {
            return '<p>' + plainLines.join('<br />\n') + '</p>';
        }

        if (numPLines > plainLines.length) {
            return '<p>' + plainLines.join('<br />\n') + '</p>';
        }

        const paragraphLines = plainLines.slice(0, numPLines);
        const listLines = plainLines.slice(numPLines);

        let html = '<p>' + paragraphLines.join('<br />\n') + '</p>';

        if (listLines.length > 0) {
            html += '\n<ul>';
            for (const line of listLines) {
                html += `\n\t<li>${line}</li>`;
            }
            html += '\n</ul>';
        }

        return html;
    };

    const processFile = async () => {
        if (!file) return;

        setIsProcessing(true);
        setProgress(10);
        setError(null);
        setOutputBlob(null);
        setRowsProcessed(0);
        setLogs([]);
        addLog(`Tryb: ${mode === 'learn' ? 'Nauka' : 'Dokładny'}`);
        addLog('Wczytywanie pliku...');

        try {
            const data = await file.arrayBuffer();
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const worksheet = workbook.Sheets[sheetName];

            // Get range
            const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1');

            setProgress(20);

            // Get first row template (B2 = opis, C2 = HTML template)
            const firstPlain = worksheet['B2']?.v?.toString() || '';
            const firstHtml = worksheet['C2']?.v?.toString() || '';

            if (!firstPlain || !firstHtml) {
                throw new Error('Pierwszy wiersz musi mieć zarówno "opis" jak i "HTML"!');
            }

            addLog('Analizuję szablon HTML...');
            const templateInfo = analyzeFirstExample(firstPlain, firstHtml);
            addLog(`Znaleziono ${Object.keys(templateInfo.entities).length} encji HTML`);
            addLog(`Lista: ${templateInfo.hasList ? 'TAK' : 'NIE'}`);

            setProgress(30);

            const rows: { indeks: string; opis: string; html: string }[] = [];

            // Process rows starting from row 2
            for (let row = 2; row <= range.e.r + 1; row++) {
                const indeksCell = worksheet[`A${row}`];
                const opisCell = worksheet[`B${row}`];

                if (!indeksCell?.v) break;

                const indeks = String(indeksCell.v).trim();
                const opis = opisCell?.v ? String(opisCell.v).trim() : '';

                if (indeks && opis) {
                    let htmlResult: string;
                    if (mode === 'learn') {
                        htmlResult = convertLearnMode(opis, templateInfo);
                    } else {
                        htmlResult = convertExactMode(opis, firstHtml);
                    }
                    rows.push({ indeks, opis, html: htmlResult });
                }

                setProgress(30 + Math.round((row - 2) / (range.e.r - 1) * 50));
            }

            addLog(`Przetworzono ${rows.length} wierszy`);
            setProgress(85);

            // Create output workbook
            const outputData = [
                ['Indeks Gold', 'opis', 'HTML'],
                ...rows.map(r => [r.indeks, r.opis, r.html])
            ];

            const newWorksheet = XLSX.utils.aoa_to_sheet(outputData);

            // Set column widths
            newWorksheet['!cols'] = [
                { wch: 15 },
                { wch: 50 },
                { wch: 70 }
            ];

            const newWorkbook = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(newWorkbook, newWorksheet, 'Sheet1');

            const wbout = XLSX.write(newWorkbook, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            setOutputBlob(blob);
            setRowsProcessed(rows.length);
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
        const modeName = mode === 'learn' ? 'nauka' : 'dokładny';
        const url = URL.createObjectURL(outputBlob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${baseName}_HTML_${modeName}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setFile(null);
        setProgress(0);
        setError(null);
        setOutputBlob(null);
        setRowsProcessed(0);
        setLogs([]);
    };

    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Opis to HTML Converter"
                description="Konwertuje zwykły tekst opisu na HTML na podstawie szablonu. Obsługuje tryb nauki (dopasowanie struktury) i dokładny (kopia 1:1)."
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
                            sublabel="Wymagane kolumny: Indeks Gold, opis, HTML"
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

                    <Section title="2. Tryb konwersji">
                        <div className="flex gap-3">
                            <button
                                onClick={() => setMode('learn')}
                                className={`flex-1 p-4 rounded-lg border transition-all text-left ${mode === 'learn'
                                        ? 'bg-accent/10 border-accent text-accent'
                                        : 'bg-bg-tertiary border-border text-text-muted hover:border-accent/50'
                                    }`}
                            >
                                <div className="font-semibold text-sm mb-1">📚 Nauka</div>
                                <div className="text-xs opacity-80">Dopasowuje strukturę na podstawie analizy</div>
                            </button>
                            <button
                                onClick={() => setMode('exact')}
                                className={`flex-1 p-4 rounded-lg border transition-all text-left ${mode === 'exact'
                                        ? 'bg-accent/10 border-accent text-accent'
                                        : 'bg-bg-tertiary border-border text-text-muted hover:border-accent/50'
                                    }`}
                            >
                                <div className="font-semibold text-sm mb-1">🎯 Dokładny</div>
                                <div className="text-xs opacity-80">Kopiuje strukturę 1:1 z szablonu</div>
                            </button>
                        </div>
                    </Section>

                    <Section title="3. Akcje">
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
                            {rowsProcessed > 0 && (
                                <div className="mt-2 text-xs text-green-400 text-right">
                                    ✅ Przetworzono {rowsProcessed} wierszy
                                </div>
                            )}
                        </div>

                        {/* Logs */}
                        <div className="bg-bg-input rounded-lg border border-border p-4 h-64 overflow-y-auto font-mono text-xs space-y-1">
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

                    <Section title="ℹ️ Format pliku">
                        <div className="text-sm text-text-muted space-y-1">
                            <p><strong className="text-text-white">Kolumna A:</strong> Indeks Gold</p>
                            <p><strong className="text-text-white">Kolumna B:</strong> opis (zwykły tekst)</p>
                            <p><strong className="text-text-white">Kolumna C:</strong> HTML (wzór w 1. wierszu)</p>
                        </div>
                    </Section>
                </div>
            </div>
        </div>
    );
}
