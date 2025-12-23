'use client';

import { useState, useCallback } from 'react';
import * as XLSX from 'xlsx';
import { useExcelWorker } from '@/hooks/useExcelWorker';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

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
    // Loading state for file upload
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');

    // Web Worker for Excel parsing
    const { parseExcel } = useExcelWorker<ExcelRow>();

    const handleFile = useCallback(async (f: File) => {
        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${f.name}...`);
        setFile(f);

        try {
            // Update text before heavy work
            await new Promise(resolve => setTimeout(resolve, 50));
            setLoadingText(`📊 Parsowanie Excel (${(f.size / 1024 / 1024).toFixed(1)} MB)...`);

            const { headers: cols, rows: json } = await parseExcel(f);

            if (json.length > 0) {
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
        } catch (err) {
            console.error('Error parsing Excel:', err);
        } finally {
            setIsLoading(false);
        }
    }, [parseExcel]);

    const handleFilesSelected = useCallback((files: File[]) => {
        if (files.length > 0) handleFile(files[0]);
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
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="EAN Checker"
                description="Weryfikuj poprawność kodów EAN i znajduj ukryte kody w opisach produktów."
                icon="🔍"
            />

            {/* Loading Overlay */}
            {isLoading && (
                <div className="upload-progress-overlay">
                    <div className="upload-progress-spinner" />
                    <p className="text-white text-lg mt-5">{loadingText}</p>
                </div>
            )}

            <Section title="1. Wgraj plik Excel">
                <FileUpload
                    onFilesSelect={handleFilesSelected}
                    accept=".xlsx,.xls"
                    label="Wgraj plik z produktami"
                    sublabel="Obsługuje formaty Excel (.xlsx, .xls)"
                    icon="📊"
                    isLoading={isLoading}
                    loadingText={loadingText}
                />
            </Section>

            {/* Column Configuration */}
            {columns.length > 0 && (
                <Section title="2. Konfiguracja kolumn">
                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-text-gray block mb-2">
                                Kolumna z głównym EAN:
                            </label>
                            <select
                                value={eanColumn}
                                onChange={(e) => setEanColumn(e.target.value)}
                                className="w-full p-3 bg-bg-input border border-border rounded-lg text-text-white focus:outline-none focus:border-accent transition-colors"
                            >
                                {columns.map(col => (
                                    <option key={col} value={col}>{col}</option>
                                ))}
                            </select>
                        </div>

                        <div>
                            <label className="text-sm text-text-gray block mb-2">
                                Kolumny do przeszukania (ukryte EAN):
                            </label>
                            <div className="flex flex-wrap gap-2">
                                {columns.filter(c => c !== eanColumn).map(col => (
                                    <button
                                        key={col}
                                        onClick={() => toggleSearchColumn(col)}
                                        className={`px-3 py-1.5 rounded-full text-xs font-medium transition-all border ${searchColumns.includes(col)
                                                ? 'bg-accent text-white border-accent'
                                                : 'bg-bg-tertiary text-text-gray border-border hover:border-accent'
                                            }`}
                                    >
                                        {col}
                                    </button>
                                ))}
                            </div>
                        </div>
                    </div>

                    <div className="mt-6 flex gap-3 flex-wrap">
                        <button
                            onClick={processData}
                            disabled={!eanColumn || searchColumns.length === 0 || isProcessing}
                            className="btn btn-primary flex-1 py-3"
                        >
                            {isProcessing ? '⏳ Przetwarzanie...' : '🔍 Szukaj ukrytych EAN'}
                        </button>
                        {results.length > 0 && (
                            <button onClick={downloadReport} className="btn btn-secondary w-full md:w-auto">
                                ⬇️ Pobierz raport Excel
                            </button>
                        )}
                    </div>
                </Section>
            )}

            {/* Results Summary */}
            {results.length > 0 && (
                <Section title={`3. Wyniki analizy (${results.length} wierszy)`}>
                    <div className="flex gap-4 mb-4 text-sm font-medium">
                        <span className="text-green-400">✓ OK: {okCount}</span>
                        <span className="text-red-400">✗ Błędy: {criticalCount}</span>
                    </div>

                    <div className="max-h-96 overflow-y-auto bg-bg-input rounded-lg border border-border">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-bg-tertiary sticky top-0">
                                <tr className="text-left text-text-muted border-b border-border">
                                    <th className="p-3 font-medium">Wiersz</th>
                                    <th className="p-3 font-medium">Główny EAN</th>
                                    <th className="p-3 font-medium">Znalezione</th>
                                    <th className="p-3 font-medium">Status</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-border">
                                {results.filter(r => r.status === 'KRYTYCZNY').slice(0, 50).map((r, i) => (
                                    <tr key={i} className="hover:bg-bg-tertiary/50 transition-colors">
                                        <td className="p-3 text-text-gray">{r.row}</td>
                                        <td className="p-3 font-mono text-xs">{r.mainEan.slice(0, 20)}{r.mainEan.length > 20 ? '...' : ''}</td>
                                        <td className="p-3 font-mono text-xs text-red-400">{r.foundEans.join(', ') || '-'}</td>
                                        <td className="p-3">
                                            <span className={`font-bold text-xs ${r.status === 'KRYTYCZNY' ? 'text-red-400' : 'text-green-400'}`}>
                                                {r.status === 'KRYTYCZNY' ? '✗ BŁĄD' : '✓ OK'}
                                            </span>
                                        </td>
                                    </tr>
                                ))}
                                {results.filter(r => r.status === 'KRYTYCZNY').length === 0 && (
                                    <tr>
                                        <td colSpan={4} className="p-8 text-center text-green-400">
                                            ✓ Brak błędów krytycznych!
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                    {results.filter(r => r.status === 'KRYTYCZNY').length > 50 && (
                        <p className="text-center text-text-muted text-xs mt-4">
                            Pokazano 50 z {criticalCount} błędów. Pobierz raport Excel, aby zobaczyć wszystkie.
                        </p>
                    )}
                </Section>
            )}
        </div>
    );
}
