'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';

interface ExcelRow {
    [key: string]: string;
}

interface ValidationResult {
    row: number;
    mainEan: string;
    foundEans: string[];
    status: 'OK' | 'KRYTYCZNY' | 'BRAK_EAN';
    message: string;
    eanType: 'EAN_8' | 'EAN_13_14';
}

// EAN validation functions (from Python)
const validateEan14 = (ean: string): boolean => {
    if (ean.length !== 14) return false;
    const digits = ean.split('').map(Number);
    if (digits.some(isNaN)) return false;
    const checksum = digits[13];
    const weightedSum = digits.slice(0, 13).reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (weightedSum % 10)) % 10 === checksum;
};

const validateEan13 = (ean: string): boolean => {
    if (ean.length !== 13) return false;
    const digits = ean.split('').map(Number);
    if (digits.some(isNaN)) return false;
    const checksum = digits[12];
    const weightedSum = digits.slice(0, 12).reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 1 : 3), 0);
    return (10 - (weightedSum % 10)) % 10 === checksum;
};

const validateEan8 = (ean: string): boolean => {
    if (ean.length !== 8) return false;
    const digits = ean.split('').map(Number);
    if (digits.some(isNaN)) return false;
    const checksum = digits[7];
    const weightedSum = digits.slice(0, 7).reduce((sum, d, i) => sum + d * (i % 2 === 0 ? 3 : 1), 0);
    return (10 - (weightedSum % 10)) % 10 === checksum;
};

// Find all valid EANs in text
const findAllEans = (text: string): string[] => {
    if (!text || typeof text !== 'string') return [];

    // Remove URLs first
    const cleanText = text.replace(/(https?:\/\/[^\s]+|www\.[^\s]+)/gi, ' ');

    // Find potential EANs (14, 13, or 8 digits)
    const eanRegex = /\b(\d{14})\b|\b(\d{13})\b|\b(\d{8})\b/g;
    const matches = cleanText.matchAll(eanRegex);

    const potentialEans = new Set<string>();
    for (const match of matches) {
        for (const group of match.slice(1)) {
            if (group) potentialEans.add(group);
        }
    }

    // Validate each EAN
    const validEans: string[] = [];
    for (const ean of potentialEans) {
        let isValid = false;
        if (ean.length === 14) isValid = validateEan14(ean);
        else if (ean.length === 13) isValid = validateEan13(ean);
        else if (ean.length === 8) isValid = validateEan8(ean);

        if (isValid) validEans.push(ean);
    }

    return validEans;
};

// Categorize error by comparing found EANs with main EAN column
const categorizeError = (foundEans: string[], mainEanStr: string): { status: 'OK' | 'KRYTYCZNY' | 'BRAK_EAN'; message: string } => {
    if (foundEans.length === 0) {
        return { status: 'OK', message: 'Brak ukrytych EAN w opisie' };
    }

    // Parse main EANs (can be semicolon-separated)
    const mainEans = mainEanStr
        .split(';')
        .map(e => e.trim())
        .filter(e => e && e.toLowerCase() !== 'nan');

    // Normalize for comparison (remove leading zeros)
    const mainEansNormalized = new Set(mainEans.map(e => e.replace(/^0+/, '')));

    if (mainEansNormalized.size === 0 && foundEans.length > 0) {
        return {
            status: 'KRYTYCZNY',
            message: `Znaleziono EAN w opisie (${foundEans.join(', ')}), brak EAN w kolumnie głównej`
        };
    }

    // Check if found EANs match main EANs
    const mismatchedEans: string[] = [];
    for (const ean of foundEans) {
        const normalized = ean.replace(/^0+/, '');
        if (!mainEansNormalized.has(normalized)) {
            mismatchedEans.push(ean);
        }
    }

    if (mismatchedEans.length > 0) {
        return {
            status: 'KRYTYCZNY',
            message: `Znaleziono EAN niepasujący do głównego: ${mismatchedEans.join(', ')}`
        };
    }

    return { status: 'OK', message: 'Znalezione EAN pasują do głównego' };
};

const determineEanType = (foundEans: string[], mainEan: string): 'EAN_8' | 'EAN_13_14' => {
    const allEans = [...foundEans, ...mainEan.split(';').map(e => e.trim())];
    const hasEan8 = allEans.some(e => {
        const clean = e.replace(/\D/g, '').replace(/^0+/, '');
        return clean.length <= 8 && clean.length > 6;
    });
    return hasEan8 ? 'EAN_8' : 'EAN_13_14';
};

export default function EanChecker() {
    const [file, setFile] = useState<File | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [eanColumn, setEanColumn] = useState('');
    const [searchColumns, setSearchColumns] = useState<string[]>([]);
    const [results, setResults] = useState<ValidationResult[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [rawData, setRawData] = useState<ExcelRow[]>([]);
    const [isDragging, setIsDragging] = useState(false);

    const handleFile = useCallback((f: File) => {
        setFile(f);
        const reader = new FileReader();
        reader.onload = (e) => {
            const data = new Uint8Array(e.target?.result as ArrayBuffer);
            const workbook = XLSX.read(data, { type: 'array' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            const json = XLSX.utils.sheet_to_json<ExcelRow>(sheet, { defval: '' });

            if (json.length > 0) {
                const cols = Object.keys(json[0]);
                setColumns(cols);
                setRawData(json);

                // Auto-detect EAN column
                const eanCol = cols.find(c => c.toLowerCase().includes('ean')) || cols[0];
                setEanColumn(eanCol);

                // Auto-detect description columns
                const descCols = cols.filter(c =>
                    c.toLowerCase().includes('opis') ||
                    c.toLowerCase().includes('description') ||
                    c.toLowerCase().includes('empik')
                );
                setSearchColumns(descCols.length > 0 ? descCols : []);
            }
        };
        reader.readAsArrayBuffer(f);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const f = e.dataTransfer.files[0];
        if (f && (f.name.endsWith('.xlsx') || f.name.endsWith('.xls'))) {
            handleFile(f);
        }
    }, [handleFile]);

    const processData = () => {
        if (!eanColumn || searchColumns.length === 0) return;

        setIsProcessing(true);
        const validationResults: ValidationResult[] = [];

        rawData.forEach((row, idx) => {
            // Combine search columns
            const textToSearch = searchColumns.map(col => String(row[col] || '')).join(' ');
            const mainEan = String(row[eanColumn] || '');

            // Find hidden EANs
            const foundEans = findAllEans(textToSearch);

            // Categorize
            const { status, message } = categorizeError(foundEans, mainEan);
            const eanType = determineEanType(foundEans, mainEan);

            validationResults.push({
                row: idx + 2, // Excel row (1-indexed + header)
                mainEan,
                foundEans,
                status,
                message,
                eanType
            });
        });

        setResults(validationResults);
        setIsProcessing(false);
    };

    const downloadReport = () => {
        // Create workbook with results
        const wb = XLSX.utils.book_new();

        // Full report
        const fullData = results.map(r => ({
            'Wiersz': r.row,
            'Główny EAN': r.mainEan,
            'Znalezione EAN': r.foundEans.join(', '),
            'Status': r.status,
            'Szczegóły': r.message,
            'Typ': r.eanType
        }));
        const fullSheet = XLSX.utils.json_to_sheet(fullData);
        XLSX.utils.book_append_sheet(wb, fullSheet, 'Raport_Pełny');

        // Errors only
        const errorsData = fullData.filter(r => r.Status === 'KRYTYCZNY');
        if (errorsData.length > 0) {
            const errorsSheet = XLSX.utils.json_to_sheet(errorsData);
            XLSX.utils.book_append_sheet(wb, errorsSheet, 'Błędy');
        }

        // Download
        XLSX.writeFile(wb, `${file?.name.replace(/\.[^.]+$/, '')}_walidacja_EAN.xlsx`);
    };

    const criticalCount = results.filter(r => r.status === 'KRYTYCZNY').length;
    const okCount = results.filter(r => r.status === 'OK').length;

    const toggleSearchColumn = (col: string) => {
        setSearchColumns(prev =>
            prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
        );
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Upload */}
            <div
                className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
                onClick={() => document.getElementById('ean-file-input')?.click()}
            >
                <input
                    type="file"
                    id="ean-file-input"
                    accept=".xlsx,.xls"
                    className="hidden"
                    onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
                />
                <span className="icon">📊</span>
                <p className="title">{file ? file.name : 'Przeciągnij plik Excel'}</p>
                <p className="subtitle">lub kliknij aby wybrać</p>
            </div>

            {/* Column Configuration */}
            {columns.length > 0 && (
                <>
                    <div className="card">
                        <div className="card-header">⚙️ Konfiguracja kolumn</div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            <div>
                                <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                    Kolumna z głównym EAN:
                                </label>
                                <select
                                    value={eanColumn}
                                    onChange={(e) => setEanColumn(e.target.value)}
                                    className="form-input"
                                    style={{ width: '100%', padding: '0.75rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '8px', color: 'var(--text-white)' }}
                                >
                                    {columns.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>

                            <div>
                                <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>
                                    Kolumny do przeszukania (ukryte EAN):
                                </label>
                                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                                    {columns.filter(c => c !== eanColumn).map(col => (
                                        <button
                                            key={col}
                                            onClick={() => toggleSearchColumn(col)}
                                            className={`filter-pill ${searchColumns.includes(col) ? 'active' : ''}`}
                                            style={{ fontSize: '0.8rem' }}
                                        >
                                            {col}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Actions */}
                    <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap' }}>
                        <button
                            onClick={processData}
                            disabled={!eanColumn || searchColumns.length === 0 || isProcessing}
                            className="btn btn-primary"
                        >
                            🔍 Szukaj ukrytych EAN
                        </button>
                        {results.length > 0 && (
                            <button onClick={downloadReport} className="btn btn-secondary">
                                ⬇️ Pobierz raport Excel
                            </button>
                        )}
                    </div>
                </>
            )}

            {/* Results Summary */}
            {results.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span>📋 Wyniki analizy ({results.length} wierszy)</span>
                        <div style={{ display: 'flex', gap: '1rem', fontSize: '0.9rem' }}>
                            <span style={{ color: 'var(--accent)' }}>✓ OK: {okCount}</span>
                            <span style={{ color: '#ef4444' }}>✗ Błędy: {criticalCount}</span>
                        </div>
                    </div>
                    <div className="card-body" style={{ maxHeight: '400px', overflowY: 'auto' }}>
                        <table style={{ width: '100%', fontSize: '0.85rem', borderCollapse: 'collapse' }}>
                            <thead>
                                <tr style={{ textAlign: 'left', color: 'var(--text-muted)', borderBottom: '1px solid var(--border)' }}>
                                    <th style={{ padding: '0.75rem 0.5rem' }}>Wiersz</th>
                                    <th style={{ padding: '0.75rem 0.5rem' }}>Główny EAN</th>
                                    <th style={{ padding: '0.75rem 0.5rem' }}>Znalezione</th>
                                    <th style={{ padding: '0.75rem 0.5rem' }}>Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.filter(r => r.status === 'KRYTYCZNY').slice(0, 50).map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem 0.5rem' }}>{r.row}</td>
                                        <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem' }}>
                                            {r.mainEan.slice(0, 20)}{r.mainEan.length > 20 ? '...' : ''}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.5rem', fontFamily: 'monospace', fontSize: '0.8rem', color: '#ef4444' }}>
                                            {r.foundEans.join(', ') || '-'}
                                        </td>
                                        <td style={{ padding: '0.75rem 0.5rem' }}>
                                            <span style={{
                                                color: r.status === 'KRYTYCZNY' ? '#ef4444' : 'var(--accent)',
                                                fontWeight: 600
                                            }}>
                                                {r.status === 'KRYTYCZNY' ? '✗ BŁĄD' : '✓ OK'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {results.filter(r => r.status === 'KRYTYCZNY').length === 0 && (
                                    <tr>
                                        <td colSpan={4} style={{ padding: '2rem', textAlign: 'center', color: 'var(--accent)' }}>
                                            ✓ Brak błędów krytycznych!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                        {results.filter(r => r.status === 'KRYTYCZNY').length > 50 && (
                            <p style={{ textAlign: 'center', color: 'var(--text-muted)', marginTop: '1rem' }}>
                                Pokazano 50 z {criticalCount} błędów. Pobierz raport Excel, aby zobaczyć wszystkie.
                            </p>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
