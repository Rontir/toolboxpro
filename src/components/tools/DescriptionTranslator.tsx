'use client';

import { useState } from 'react';
import * as XLSX from 'xlsx';

type Provider = 'google' | 'deepl' | 'libre';

interface TranslateResult {
    translated: number;
    failed: number;
    total: number;
}

export default function DescriptionTranslator() {
    const [file, setFile] = useState<File | null>(null);
    const [columns, setColumns] = useState<string[]>([]);
    const [selectedColumn, setSelectedColumn] = useState<string>('');
    const [sourceLang, setSourceLang] = useState<string>('pl');
    const [targetLang, setTargetLang] = useState<string>('en');
    const [provider, setProvider] = useState<Provider>('libre');
    const [apiKey, setApiKey] = useState<string>('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [progressText, setProgressText] = useState('');
    const [result, setResult] = useState<TranslateResult | null>(null);
    const [outputBlob, setOutputBlob] = useState<Blob | null>(null);
    const [error, setError] = useState<string | null>(null);

    const languages = [
        { code: 'pl', name: 'Polski' },
        { code: 'en', name: 'Angielski' },
        { code: 'de', name: 'Niemiecki' },
        { code: 'fr', name: 'Francuski' },
        { code: 'es', name: 'Hiszpański' },
        { code: 'it', name: 'Włoski' },
        { code: 'cs', name: 'Czeski' },
        { code: 'sk', name: 'Słowacki' },
        { code: 'uk', name: 'Ukraiński' },
        { code: 'ru', name: 'Rosyjski' },
    ];

    const loadFile = async (file: File) => {
        const data = await file.arrayBuffer();
        const workbook = XLSX.read(data, { type: 'array' });
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        const rows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(sheet);
        const headers = rows.length > 0 ? Object.keys(rows[0]) : [];
        return { headers, rows };
    };

    const handleFile = async (f: File) => {
        setFile(f);
        setResult(null);
        setOutputBlob(null);
        try {
            const { headers } = await loadFile(f);
            setColumns(headers);
            // Auto-select column with "opis" in name
            const opisCol = headers.find(h => h.toLowerCase().includes('opis'));
            setSelectedColumn(opisCol || headers[0] || '');
        } catch {
            setError('Błąd wczytywania pliku');
        }
    };

    // LibreTranslate (free, no key needed)
    const translateLibre = async (text: string, source: string, target: string): Promise<string> => {
        const res = await fetch('https://libretranslate.com/translate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ q: text, source, target, format: 'text' })
        });
        if (!res.ok) throw new Error('LibreTranslate error');
        const data = await res.json();
        return data.translatedText;
    };

    // DeepL API
    const translateDeepL = async (text: string, source: string, target: string): Promise<string> => {
        const res = await fetch('https://api-free.deepl.com/v2/translate', {
            method: 'POST',
            headers: {
                'Authorization': `DeepL-Auth-Key ${apiKey}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: new URLSearchParams({
                text,
                source_lang: source.toUpperCase(),
                target_lang: target.toUpperCase()
            })
        });
        if (!res.ok) throw new Error('DeepL error');
        const data = await res.json();
        return data.translations[0].text;
    };

    // Google Translate (unofficial)
    const translateGoogle = async (text: string, source: string, target: string): Promise<string> => {
        const url = `https://translate.googleapis.com/translate_a/single?client=gtx&sl=${source}&tl=${target}&dt=t&q=${encodeURIComponent(text)}`;
        const res = await fetch(url);
        if (!res.ok) throw new Error('Google Translate error');
        const data = await res.json();
        return data[0].map((x: [string]) => x[0]).join('');
    };

    const translateText = async (text: string): Promise<string> => {
        if (!text || !text.trim()) return '';

        switch (provider) {
            case 'libre':
                return await translateLibre(text, sourceLang, targetLang);
            case 'deepl':
                return await translateDeepL(text, sourceLang, targetLang);
            case 'google':
                return await translateGoogle(text, sourceLang, targetLang);
            default:
                throw new Error('Unknown provider');
        }
    };

    const processFile = async () => {
        if (!file || !selectedColumn) return;
        if (provider === 'deepl' && !apiKey) {
            setError('DeepL wymaga klucza API');
            return;
        }

        setIsProcessing(true);
        setProgress(0);
        setProgressText('Wczytywanie pliku...');
        setError(null);
        setResult(null);
        setOutputBlob(null);

        try {
            const { rows } = await loadFile(file);
            const newColumnName = `${selectedColumn} (${targetLang.toUpperCase()})`;

            let translated = 0;
            let failed = 0;

            for (let i = 0; i < rows.length; i++) {
                const text = String(rows[i][selectedColumn] || '');

                if (text.trim()) {
                    try {
                        const result = await translateText(text);
                        rows[i][newColumnName] = result;
                        translated++;
                    } catch {
                        rows[i][newColumnName] = '[BŁĄD TŁUMACZENIA]';
                        failed++;
                    }
                } else {
                    rows[i][newColumnName] = '';
                }

                setProgress(Math.round((i + 1) / rows.length * 100));
                setProgressText(`Tłumaczenie ${i + 1}/${rows.length}...`);

                // Rate limiting
                await new Promise(r => setTimeout(r, provider === 'libre' ? 500 : 100));
            }

            // Create output
            const ws = XLSX.utils.json_to_sheet(rows);
            const wb = XLSX.utils.book_new();
            XLSX.utils.book_append_sheet(wb, ws, 'Tłumaczenia');

            const wbout = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
            const blob = new Blob([wbout], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });

            setOutputBlob(blob);
            setResult({ translated, failed, total: rows.length });
            setProgressText('Gotowe!');

        } catch (err) {
            setError(err instanceof Error ? err.message : 'Nieznany błąd');
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
        a.download = `${baseName}_${targetLang}.xlsx`;
        a.click();
        URL.revokeObjectURL(url);
    };

    const reset = () => {
        setFile(null);
        setColumns([]);
        setSelectedColumn('');
        setResult(null);
        setOutputBlob(null);
        setError(null);
        setProgress(0);
        setProgressText('');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                Automatyczne tłumaczenie opisów produktów
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Left */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Upload */}
                    <div
                        className="upload-zone"
                        onClick={() => document.getElementById('translate-file')?.click()}
                    >
                        <input
                            id="translate-file"
                            type="file"
                            accept=".xlsx,.xls"
                            style={{ display: 'none' }}
                            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
                        />
                        <span className="icon">{file ? '✅' : '📊'}</span>
                        <p className="title">{file?.name || 'Plik z opisami'}</p>
                        <p className="subtitle">Excel z kolumną do tłumaczenia</p>
                    </div>

                    {/* Column Selection */}
                    {columns.length > 0 && (
                        <div className="card">
                            <div className="card-header">📋 Kolumna do tłumaczenia</div>
                            <div className="card-body">
                                <select
                                    value={selectedColumn}
                                    onChange={e => setSelectedColumn(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--text-white)',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    {columns.map(col => (
                                        <option key={col} value={col}>{col}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    )}

                    {/* Language Selection */}
                    <div className="card">
                        <div className="card-header">🌍 Języki</div>
                        <div className="card-body" style={{ display: 'flex', gap: '1rem' }}>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Z:</label>
                                <select
                                    value={sourceLang}
                                    onChange={e => setSourceLang(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--text-white)',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    {languages.map(l => (
                                        <option key={l.code} value={l.code}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                            <div style={{ display: 'flex', alignItems: 'center', paddingTop: '1rem' }}>→</div>
                            <div style={{ flex: 1 }}>
                                <label style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.25rem' }}>Na:</label>
                                <select
                                    value={targetLang}
                                    onChange={e => setTargetLang(e.target.value)}
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--text-white)',
                                        fontSize: '0.85rem'
                                    }}
                                >
                                    {languages.map(l => (
                                        <option key={l.code} value={l.code}>{l.name}</option>
                                    ))}
                                </select>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    {/* Provider */}
                    <div className="card">
                        <div className="card-header">🔧 Silnik tłumaczenia</div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                            {([
                                { id: 'google', name: 'Google Translate', desc: 'Darmowy, bez limitu' },
                                { id: 'libre', name: 'LibreTranslate', desc: 'Open source, wolniejszy' },
                                { id: 'deepl', name: 'DeepL', desc: 'Najlepsza jakość, wymaga klucza' },
                            ] as const).map(p => (
                                <button
                                    key={p.id}
                                    onClick={() => setProvider(p.id)}
                                    className={`provider-button ${provider === p.id ? 'active' : ''}`}
                                >
                                    <div className="provider-name">{p.name}</div>
                                    <div className="provider-desc">{p.desc}</div>
                                </button>
                            ))}
                        </div>
                    </div>

                    {/* DeepL API Key */}
                    {provider === 'deepl' && (
                        <div className="card">
                            <div className="card-header">🔑 Klucz API DeepL</div>
                            <div className="card-body">
                                <input
                                    type="password"
                                    value={apiKey}
                                    onChange={e => setApiKey(e.target.value)}
                                    placeholder="Wklej klucz API..."
                                    style={{
                                        width: '100%',
                                        padding: '0.5rem',
                                        background: 'var(--bg-tertiary)',
                                        border: '1px solid var(--border)',
                                        borderRadius: '6px',
                                        color: 'var(--text-white)',
                                        fontSize: '0.85rem'
                                    }}
                                />
                                <a
                                    href="https://www.deepl.com/pro-api"
                                    target="_blank"
                                    rel="noopener"
                                    style={{ fontSize: '0.7rem', color: 'var(--accent)' }}
                                >
                                    Uzyskaj darmowy klucz →
                                </a>
                            </div>
                        </div>
                    )}

                    {/* Progress */}
                    <div className="card">
                        <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                            <span>📊 Postęp</span>
                            <span style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>{progress}%</span>
                        </div>
                        <div className="card-body">
                            <div className="progress-bar">
                                <div className="progress-fill" style={{ width: `${progress}%` }} />
                            </div>
                            {progressText && (
                                <div style={{ marginTop: '0.5rem', fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                                    {progressText}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {/* Process Button */}
            <button
                className="btn btn-primary"
                onClick={result ? downloadResult : processFile}
                disabled={!file || !selectedColumn || isProcessing || (provider === 'deepl' && !apiKey)}
                style={{ width: '100%' }}
            >
                {isProcessing ? '⏳ Tłumaczenie...' : result ? '📥 Pobierz wynik' : '🌍 Przetłumacz'}
            </button>

            {result && (
                <button className="btn btn-secondary" onClick={reset} style={{ width: '100%' }}>
                    🔄 Nowe tłumaczenie
                </button>
            )}

            {/* Result */}
            {result && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '1rem' }}>
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>{result.translated}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Przetłumaczono</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: '#f87171' }}>{result.failed}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Błędy</div>
                    </div>
                    <div className="card" style={{ textAlign: 'center' }}>
                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-white)' }}>{result.total}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>Razem</div>
                    </div>
                </div>
            )}

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
    );
}
