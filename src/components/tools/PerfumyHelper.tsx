'use client';

import { useState, useCallback } from 'react';
import { apiUrl } from '@/lib/config';

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

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        const file = Array.from(e.dataTransfer.files).find(f => f.name.match(/\.xlsx?$/i));
        if (file) setSourceFile(file);
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

            const res = await fetch(apiUrl('/api/process-perfumes'), {
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Description */}
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Automatyczne wypełnianie zestawów perfum - pojemności, płeć, kompozycje, linie
            </p>

            {!resultUrl ? (
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                    {/* Left Column */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {/* Source File Upload */}
                        <div
                            className="upload-zone"
                            onDragOver={e => e.preventDefault()}
                            onDrop={handleDrop}
                            onClick={() => document.getElementById('source-upload')?.click()}
                        >
                            <input
                                id="source-upload"
                                type="file"
                                accept=".xlsx,.xls"
                                style={{ display: 'none' }}
                                onChange={e => e.target.files?.[0] && setSourceFile(e.target.files[0])}
                            />
                            <span className="icon">{sourceFile ? '✅' : '📥'}</span>
                            <p className="title">{sourceFile?.name || 'Przeciągnij plik Excel'}</p>
                            <p className="subtitle">
                                {sourceFile ? `${(sourceFile.size / 1024).toFixed(1)} KB` : 'Zestawy perfum'}
                            </p>
                        </div>

                        {/* Dictionary Files */}
                        <div className="card">
                            <div className="card-header">📚 Słowniki (wymagane)</div>
                            <div className="card-body" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.75rem' }}>
                                {dictFiles.map((dict, idx) => (
                                    <div
                                        key={idx}
                                        onClick={() => !dict.file && document.getElementById(`dict-${idx}`)?.click()}
                                        className="selection-card"
                                        style={{
                                            background: dict.file ? 'rgba(74, 222, 128, 0.1)' : 'var(--bg-tertiary)',
                                            border: dict.file ? '1px solid var(--accent)' : '1px solid var(--border)',
                                            cursor: dict.file ? 'default' : 'pointer',
                                            alignItems: 'stretch',
                                            textAlign: 'left'
                                        }}
                                    >
                                        <input
                                            id={`dict-${idx}`}
                                            type="file"
                                            accept=".xlsx,.xls"
                                            style={{ display: 'none' }}
                                            onChange={e => e.target.files?.[0] && handleDictUpload(idx, e.target.files[0])}
                                        />
                                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                                            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                                                <span>{dict.icon}</span>
                                                <span style={{ fontSize: '0.85rem', fontWeight: 600 }}>{dict.name}</span>
                                                {!dict.file && <span style={{ color: 'var(--error)', fontSize: '0.75rem' }}>*</span>}
                                            </div>
                                            {dict.file && (
                                                <button
                                                    onClick={e => { e.stopPropagation(); handleDictUpload(idx, null); }}
                                                    style={{
                                                        background: 'none',
                                                        border: 'none',
                                                        color: 'var(--text-muted)',
                                                        cursor: 'pointer',
                                                        fontSize: '0.75rem'
                                                    }}
                                                >
                                                    ✕
                                                </button>
                                            )}
                                        </div>
                                        <div style={{ fontSize: '0.7rem', color: dict.file ? 'var(--accent)' : 'var(--text-muted)', marginTop: '0.25rem' }}>
                                            {dict.file ? `✓ ${dict.file.name}` : '+ Dodaj słownik'}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Process Button */}
                        <button
                            className="btn btn-primary"
                            onClick={processFiles}
                            disabled={!canProcess || isProcessing}
                            style={{ width: '100%' }}
                        >
                            {isProcessing ? '⏳ Przetwarzanie...' : '🚀 Przetwórz plik'}
                        </button>
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
                                <div style={{ marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                                    {progressText || 'Gotowy do pracy.'}
                                </div>
                                <div className="progress-bar">
                                    <div className="progress-fill" style={{ width: `${progress}%` }} />
                                </div>
                            </div>
                        </div>

                        {/* Info Card */}
                        <div className="card" style={{ flex: 1 }}>
                            <div className="card-header">📋 Informacje</div>
                            <div className="card-body" style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                <p style={{ marginBottom: '0.5rem' }}>
                                    <strong>Wymagane pliki:</strong>
                                </p>
                                <ul style={{ paddingLeft: '1rem', lineHeight: 1.6 }}>
                                    <li>📊 Plik źródłowy z zestawami perfum</li>
                                    <li>🏷️ Słownik marek</li>
                                    <li>📋 Słownik linii</li>
                                    <li>💄 Słownik beauty</li>
                                    <li>🌸 Słownik kompozycji</li>
                                </ul>
                                <p style={{ marginTop: '1rem' }}>
                                    <strong>Wynik:</strong> Archiwum ZIP z kompletnym Excelem, brakującymi słownikami i raportem.
                                </p>
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
            ) : (
                /* Results */
                <div className="card" style={{ textAlign: 'center', padding: '2rem' }}>
                    <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🎉</div>
                    <h3 style={{ marginBottom: '0.5rem', fontSize: '1.25rem', fontWeight: 600 }}>Przetwarzanie zakończone!</h3>
                    <p style={{ marginBottom: '1.5rem', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                        Archiwum zawiera: kompletny Excel, brakujące słowniki, plik do weryfikacji i raport.
                    </p>
                    <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center' }}>
                        <button className="btn btn-primary" onClick={downloadResult}>
                            📥 Pobierz wyniki (ZIP)
                        </button>
                        <button className="btn btn-secondary" onClick={clearAll}>
                            🔄 Nowy plik
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
