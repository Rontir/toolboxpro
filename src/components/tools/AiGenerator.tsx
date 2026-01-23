'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { apiUrl } from '@/lib/config';

export default function AiGenerator() {
    const [name, setName] = useState('');
    const [features, setFeatures] = useState('');
    const [specs, setSpecs] = useState('');
    const [generatedHtml, setGeneratedHtml] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();

    const handleGenerate = async () => {
        if (!name.trim()) {
            showToast('Podaj nazwę produktu', 'error');
            return;
        }

        setIsLoading(true);
        try {
            const featureList = features.split('\n').filter(f => f.trim());
            const specDict: Record<string, string> = {};
            specs.split('\n').forEach(line => {
                const [key, val] = line.split(':');
                if (key && val) specDict[key.trim()] = val.trim();
            });

            const res = await fetch(apiUrl('/api/ai-description'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    name,
                    features: featureList,
                    specs: specDict
                })
            });

            if (!res.ok) throw new Error('Generation failed');

            const data = await res.json();
            setGeneratedHtml(data.html);
            showToast('Opis wygenerowany!', 'success');
        } catch (e) {
            showToast('Błąd generowania opisu', 'error');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    const copyToClipboard = () => {
        navigator.clipboard.writeText(generatedHtml);
        showToast('Skopiowano do schowka!', 'success');
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-white)' }}>
                    📝 Generator Opisów Empik
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Stwórz profesjonalny opis HTML zgodny z wymogami Empiku.
                </p>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1.5rem' }}>
                {/* Input Form */}
                <div className="card">
                    <div className="card-header">Dane produktu</div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Nazwa produktu</label>
                            <input
                                type="text"
                                value={name}
                                onChange={e => setName(e.target.value)}
                                className="form-input"
                                placeholder="np. Zestaw LEGO City"
                                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Cechy (jedna w linii)</label>
                            <textarea
                                value={features}
                                onChange={e => setFeatures(e.target.value)}
                                className="form-input"
                                rows={5}
                                placeholder="Wysoka jakość wykonania&#10;Idealny na prezent&#10;Dla dzieci 7+"
                                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)' }}
                            />
                        </div>

                        <div>
                            <label style={{ display: 'block', marginBottom: '0.5rem', fontSize: '0.875rem' }}>Specyfikacja (Klucz: Wartość)</label>
                            <textarea
                                value={specs}
                                onChange={e => setSpecs(e.target.value)}
                                className="form-input"
                                rows={5}
                                placeholder="Materiał: Plastik&#10;Wiek: 7+&#10;Liczba elementów: 300"
                                style={{ width: '100%', padding: '0.5rem', background: 'var(--bg-input)', border: '1px solid var(--border)', borderRadius: '6px', color: 'var(--text-white)' }}
                            />
                        </div>

                        <button
                            onClick={handleGenerate}
                            disabled={isLoading}
                            className="btn btn-primary"
                            style={{ padding: '0.75rem' }}
                        >
                            {isLoading ? '✨ Generowanie...' : '✨ Generuj Opis'}
                        </button>
                    </div>
                </div>

                {/* Preview & Output */}
                <div className="card" style={{ display: 'flex', flexDirection: 'column' }}>
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span>Wynik HTML</span>
                        {generatedHtml && (
                            <button onClick={copyToClipboard} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.25rem 0.5rem' }}>
                                📋 Kopiuj
                            </button>
                        )}
                    </div>
                    <div className="card-body" style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        {generatedHtml ? (
                            <>
                                <div style={{
                                    background: '#fff',
                                    color: '#000',
                                    padding: '1rem',
                                    borderRadius: '6px',
                                    maxHeight: '300px',
                                    overflowY: 'auto',
                                    fontSize: '14px'
                                }}>
                                    <div dangerouslySetInnerHTML={{ __html: generatedHtml }} />
                                </div>
                                <textarea
                                    readOnly
                                    value={generatedHtml}
                                    className="form-input"
                                    style={{
                                        flex: 1,
                                        fontFamily: 'monospace',
                                        fontSize: '0.75rem',
                                        background: '#1a1a1a',
                                        color: '#aaa',
                                        padding: '0.5rem',
                                        border: 'none',
                                        resize: 'none'
                                    }}
                                />
                            </>
                        ) : (
                            <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)', flexDirection: 'column', gap: '1rem' }}>
                                <span style={{ fontSize: '3rem', opacity: 0.2 }}>📄</span>
                                <p>Tutaj pojawi się wygenerowany opis</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
