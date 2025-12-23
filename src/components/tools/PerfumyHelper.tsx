'use client';

import { useState, useCallback } from 'react';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

interface DictFile {
    name: string;
    file: File | null;
    required: boolean;
    icon: string;
    key: string;
}

export default function PerfumyHelper() {
    const [sourceFile, setSourceFile] = useState<File | null>(null);
    const [dictFiles, setDictFiles] = useState<DictFile[]>([
        { name: 'Marki', file: null, required: true, icon: '🏷️', key: 'dict_marki' },
        { name: 'Linie', file: null, required: true, icon: '📋', key: 'dict_linie' },
        { name: 'Beauty', file: null, required: true, icon: '💄', key: 'dict_beauty' },
        { name: 'Kompozycje', file: null, required: true, icon: '🌸', key: 'dict_kompozycje' },
    ]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');
    const [resultUrl, setResultUrl] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);

    const handleFilesSelected = useCallback((files: File[]) => {
        const f = files.find(f => f.name.match(/\.xlsx?$/i));
        if (f) setSourceFile(f);
    }, []);

    const handleDictUpload = (index: number, file: File | null) => {
        setDictFiles(prev => prev.map((d, i) => i === index ? { ...d, file } : d));
    };

    const allDictsFilled = dictFiles.every(d => d.file !== null);
    const canProcess = sourceFile && allDictsFilled;

    const processFiles = async () => {
        if (!sourceFile || !allDictsFilled) return;

        setIsProcessing(true);
        setProgress(10);
        setProgressText('Przesyłanie plików...');
        setError(null);
        setResultUrl(null);

        try {
            const formData = new FormData();
            formData.append('source_file', sourceFile);
            formData.append('dict_marki', dictFiles[0].file!);
            formData.append('dict_linie', dictFiles[1].file!);
            formData.append('dict_beauty', dictFiles[2].file!);
            formData.append('dict_kompozycje', dictFiles[3].file!);

            setProgress(30);
            setProgressText('Przetwarzanie danych...');

            const res = await fetch('http://localhost:8000/api/process-perfumes', {
                method: 'POST',
                body: formData
            });

            if (!res.ok) {
                const err = await res.json().catch(() => ({ detail: 'Błąd serwera' }));
                throw new Error(err.detail || 'Błąd przetwarzania');
            }

            setProgress(80);
            setProgressText('Przygotowywanie wyników...');

            const blob = await res.blob();
            const url = URL.createObjectURL(blob);

            setProgress(100);
            setProgressText('Gotowe!');
            setResultUrl(url);
        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nieznany błąd');
        } finally {
            setIsProcessing(false);
        }
    };

    const downloadResult = () => {
        if (!resultUrl) return;
        const a = document.createElement('a');
        a.href = resultUrl;
        a.download = `perfumy_wynik_${new Date().toISOString().slice(0, 10)}.zip`;
        a.click();
    };

    const clearAll = () => {
        setSourceFile(null);
        setDictFiles(prev => prev.map(d => ({ ...d, file: null })));
        if (resultUrl) URL.revokeObjectURL(resultUrl);
        setResultUrl(null);
        setError(null);
        setProgress(0);
    };

    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Perfumy Helper"
                description="Automatyczne wypełnianie zestawów perfum - pojemności, płeć, kompozycje, linie. Wymaga plików słownikowych."
                icon="✨"
            />

            {!resultUrl ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                    {/* Left Column */}
                    <div className="space-y-6">
                        <Section title="1. Plik źródłowy">
                            <FileUpload
                                onFilesSelect={handleFilesSelected}
                                accept=".xlsx,.xls"
                                label="Wgraj plik z zestawami"
                                sublabel="Plik Excel z danymi do uzupełnienia"
                                icon="📥"
                                isLoading={isProcessing}
                                loadingText={isProcessing ? `Przetwarzanie... ${progress}%` : ''}
                            />
                            {sourceFile && (
                                <div className="mt-4 p-4 bg-bg-tertiary rounded-lg border border-border flex items-center justify-between">
                                    <span className="text-text-white font-medium">{sourceFile.name}</span>
                                    <span className="text-xs text-text-muted">{(sourceFile.size / 1024).toFixed(1)} KB</span>
                                </div>
                            )}
                        </Section>

                        <Section title="2. Słowniki (wymagane)">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                {dictFiles.map((dict, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => !dict.file && document.getElementById(`dict-${idx}`)?.click()}
                                        className={`p-3 rounded-lg border transition-all cursor-pointer flex flex-col justify-between h-24 ${dict.file
                                                ? 'bg-green-500/10 border-green-500/50'
                                                : 'bg-bg-tertiary border-border hover:border-accent/50'
                                            }`}
                                    >
                                        <input
                                            id={`dict-${idx}`}
                                            type="file"
                                            accept=".xlsx,.xls"
                                            className="hidden"
                                            onChange={e => e.target.files?.[0] && handleDictUpload(idx, e.target.files[0])}
                                        />
                                        <div className="flex items-center justify-between">
                                            <div className="flex items-center gap-2">
                                                <span className="text-lg">{dict.icon}</span>
                                                <span className="font-semibold text-sm">{dict.name}</span>
                                            </div>
                                            {dict.file ? (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDictUpload(idx, null); }}
                                                    className="text-text-muted hover:text-red-400 transition-colors"
                                                >
                                                    ✕
                                                </button>
                                            ) : (
                                                <span className="text-red-400 text-xs">*</span>
                                            )}
                                        </div>
                                        <div className={`text-xs truncate ${dict.file ? 'text-green-400' : 'text-text-muted'}`}>
                                            {dict.file ? dict.file.name : '+ Dodaj plik'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </Section>

                        <Section title="3. Akcje">
                            <button
                                className="btn btn-primary w-full py-3"
                                onClick={processFiles}
                                disabled={!canProcess || isProcessing}
                            >
                                {isProcessing ? '⏳ Przetwarzanie...' : '🚀 Przetwórz plik'}
                            </button>
                        </Section>
                    </div>

                    {/* Right Column */}
                    <div className="space-y-6">
                        <Section title="Status">
                            {/* Progress */}
                            <div className="mb-6">
                                <div className="flex justify-between mb-2 text-sm">
                                    <span className="text-text-gray">Postęp</span>
                                    <span className="font-bold text-accent">{progress}%</span>
                                </div>
                                <div className="w-full bg-bg-input rounded-full h-2.5">
                                    <div className="bg-accent h-2.5 rounded-full transition-all duration-300" style={{ width: `${progress}%` }}></div>
                                </div>
                                <div className="mt-2 text-xs text-text-muted text-center">
                                    {progressText || 'Gotowy do pracy.'}
                                </div>
                            </div>

                            {/* Error */}
                            {error && (
                                <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-red-400 text-sm">
                                    ❌ {error}
                                </div>
                            )}
                        </Section>

                        <Section title="ℹ️ Informacje">
                            <div className="text-sm text-text-muted space-y-4">
                                <div>
                                    <strong className="text-text-white block mb-1">Wymagane pliki:</strong>
                                    <ul className="list-disc list-inside space-y-1 pl-1">
                                        <li>📊 Plik źródłowy z zestawami perfum</li>
                                        <li>🏷️ Słownik marek</li>
                                        <li>📋 Słownik linii</li>
                                        <li>💄 Słownik beauty</li>
                                        <li>🌸 Słownik kompozycji</li>
                                    </ul>
                                </div>
                                <div>
                                    <strong className="text-text-white block mb-1">Wynik:</strong>
                                    <p>Archiwum ZIP z kompletnym Excelem, brakującymi słownikami i raportem.</p>
                                </div>
                            </div>
                        </Section>
                    </div>
                </div>
            ) : (
                /* Results */
                <div className="max-w-2xl mx-auto w-full">
                    <Section>
                        <div className="text-center py-8">
                            <div className="text-6xl mb-4">🎉</div>
                            <h3 className="text-xl font-bold mb-2 text-text-white">Przetwarzanie zakończone!</h3>
                            <p className="text-text-muted mb-6">
                                Archiwum zawiera: kompletny Excel, brakujące słowniki, plik do weryfikacji i raport.
                            </p>
                            <div className="flex gap-4 justify-center">
                                <button className="btn btn-primary" onClick={downloadResult}>
                                    📥 Pobierz wyniki (ZIP)
                                </button>
                                <button className="btn btn-secondary" onClick={clearAll}>
                                    🔄 Nowy plik
                                </button>
                            </div>
                        </div>
                    </Section>
                </div>
            )}
        </div>
    );
}
