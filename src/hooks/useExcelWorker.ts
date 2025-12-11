'use client';

import { useState, useCallback, useRef, useEffect } from 'react';

interface ExcelParseResult<T = Record<string, unknown>> {
    headers: string[];
    rows: T[];
    totalRows: number;
}

interface UseExcelWorkerReturn<T> {
    parseExcel: (file: File) => Promise<ExcelParseResult<T>>;
    isLoading: boolean;
    loadingText: string;
    error: string | null;
}

/**
 * Hook for parsing Excel files using Web Worker
 * Prevents main thread blocking, keeps UI responsive
 */
export function useExcelWorker<T = Record<string, unknown>>(): UseExcelWorkerReturn<T> {
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [error, setError] = useState<string | null>(null);
    const workerRef = useRef<Worker | null>(null);

    // Cleanup worker on unmount
    useEffect(() => {
        return () => {
            workerRef.current?.terminate();
        };
    }, []);

    const parseExcel = useCallback((file: File): Promise<ExcelParseResult<T>> => {
        return new Promise((resolve, reject) => {
            setIsLoading(true);
            setError(null);
            setLoadingText(`📂 Wczytywanie ${file.name}...`);

            // Create worker
            const worker = new Worker('/excelWorker.js');
            workerRef.current = worker;

            worker.onmessage = (e) => {
                const { type, message, headers, rows, totalRows, error: workerError } = e.data;

                if (type === 'progress') {
                    setLoadingText(message);
                } else if (type === 'complete') {
                    setIsLoading(false);
                    setLoadingText('');
                    worker.terminate();
                    resolve({ headers, rows, totalRows });
                } else if (type === 'error') {
                    setIsLoading(false);
                    setError(workerError);
                    worker.terminate();
                    reject(new Error(workerError));
                }
            };

            worker.onerror = (err) => {
                setIsLoading(false);
                setError(err.message);
                worker.terminate();
                reject(err);
            };

            // Read file and send to worker
            const reader = new FileReader();
            reader.onload = (e) => {
                const sizeMB = (file.size / 1024 / 1024).toFixed(1);
                setLoadingText(`📊 Parsowanie Excel (${sizeMB} MB)...`);

                worker.postMessage({
                    arrayBuffer: e.target?.result,
                    fileName: file.name
                });
            };
            reader.onerror = () => {
                setIsLoading(false);
                setError('Błąd odczytu pliku');
                reject(new Error('Failed to read file'));
            };
            reader.readAsArrayBuffer(file);
        });
    }, []);

    return { parseExcel, isLoading, loadingText, error };
}
