'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

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

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const f = Array.from(e.dataTransfer.files).find(f => f.name.match(/\.xlsx?$/i));
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Description */}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Konwertuje zwykły tekst opisu na HTML na podstawie szablonu
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left Column */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Upload Zone */}
                    <div
                        className="upload-zone"
                        onDragOver={e => e.preventDefault()}
                        onDrop={handleDrop}
                        onClick={() => document.getElementById('opis-file')?.click()}
                    >
                        <input
                            id="opis-file"
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && setFile(e.target.files[0])}
                        />
                        <span className="icon">{file ? '✅' : '📥'}</span>
                        <p className="title">{file?.name || 'Przeciągnij plik Excel'}</p>
                        <p className="subtitle">
                            {file ? `${(file.size / 1024).toFixed(1)} KB` : 'Indeks Gold | opis | HTML'}
                        </p>
                    </div>

                    {/* Mode Selection */}
                    <div className="card">
                        <div className="card-header">⚙️ Tryb konwersji</div>
                        <div className="card-body" style={{ display: 'flex', gap: '0.5rem' }}>
                            <button
                                onClick={() => setMode('learn')}
                                className={`selection-card ${mode === 'learn' ? 'active' : ''}`}
                                style={{ flex: 1 }}
                            >
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>📚 Nauka</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.25rem' }}>
                                    Dopasowuje strukturę
                                </div>
                            </button>
                            <button
                                onClick={() => setMode('exact')}
                                className={`selection-card ${mode === 'exact' ? 'active' : ''}`}
                                style={{ flex: 1 }}
                            >
                                <div style={{ fontWeight: 600, fontSize: '0.85rem' }}>🎯 Dokładny</div>
                                <div style={{ fontSize: '0.7rem', opacity: 0.8, marginTop: '0.25rem' }}>
                                    Kopia 1:1
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Info Card */}
                    <div className="card">
                        <div className="card-header">📋 Format pliku</div>
                        <div className="card-body" style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                            <p><strong>Kolumna A:</strong> Indeks Gold</p>
                            <p><strong>Kolumna B:</strong> opis (zwykły tekst)</p>
                            <p><strong>Kolumna C:</strong> HTML (wzór w 1. wierszu)</p>
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
                            {rowsProcessed > 0 && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.85rem', color: 'var(--accent)' }}>
                                    ✅ Przetworzono {rowsProcessed} wierszy
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Log */}
                    <div className="card" style={{ flex: 1 }}>
                        <div className="card-header">📋 Log</div>
                        <div className="card-body" style={{ maxHeight: '200px', overflowY: 'auto', fontSize: '0.75rem', fontFamily: 'monospace' }}>
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
