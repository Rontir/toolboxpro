'use client';

import * as XLSX from 'xlsx';

/**
 * Parse Excel file asynchronously with loading callback
 * Uses setTimeout to yield to event loop, allowing UI to update
 */
export async function parseExcelAsync<T>(
    file: File,
    onProgress?: (message: string) => void
): Promise<{ headers: string[]; rows: T[]; totalRows: number }> {
    return new Promise((resolve, reject) => {
        onProgress?.(`📂 Wczytywanie ${file.name}...`);

        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read file'));

        reader.onload = (e) => {
            const sizeMB = (file.size / 1024 / 1024).toFixed(1);
            onProgress?.(`📊 Parsowanie Excel (${sizeMB} MB)...`);

            // Yield to event loop before heavy XLSX.read
            setTimeout(() => {
                try {
                    const data = new Uint8Array(e.target?.result as ArrayBuffer);
                    const workbook = XLSX.read(data, { type: 'array' });
                    const sheetName = workbook.SheetNames[0];
                    const sheet = workbook.Sheets[sheetName];
                    const json = XLSX.utils.sheet_to_json<T>(sheet, { defval: '' });

                    const headers = json.length > 0 ? Object.keys(json[0] as object) : [];

                    resolve({
                        headers,
                        rows: json,
                        totalRows: json.length
                    });
                } catch (err) {
                    reject(err);
                }
            }, 50);
        };

        reader.readAsArrayBuffer(file);
    });
}

/**
 * Helper to wrap file processing with loading states
 */
export function withLoadingWrapper(
    setIsLoading: (v: boolean) => void,
    setLoadingText: (v: string) => void
) {
    return async <T>(
        operation: (onProgress: (msg: string) => void) => Promise<T>
    ): Promise<T> => {
        setIsLoading(true);
        try {
            return await operation(setLoadingText);
        } finally {
            setIsLoading(false);
        }
    };
}
