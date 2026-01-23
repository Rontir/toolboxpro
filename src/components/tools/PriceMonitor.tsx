'use client';

import { useState } from 'react';
import { useToast } from '@/components/Toast';
import { apiUrl } from '@/lib/config';

interface PriceResult {
    ean: string;
    title?: string;
    price?: string;
    seller?: string;
    url?: string;
    status: 'winning' | 'losing' | 'neutral' | 'error' | 'not_found';
    error?: string;
    timestamp?: string;
}

export default function PriceMonitor() {
    const [eans, setEans] = useState('');
    const [shopName, setShopName] = useState('');
    const [results, setResults] = useState<PriceResult[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const { showToast } = useToast();

    const handleCheck = async () => {
        const eanList = eans.split(/[\n,;]+/).map(e => e.trim()).filter(e => e);
        if (eanList.length === 0) {
            showToast('Wpisz przynajmniej jeden EAN', 'error');
            return;
        }

        setIsLoading(true);
        setResults([]);

        try {
            const res = await fetch(apiUrl('/api/price-monitor'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    eans: eanList,
                    my_shop_name: shopName || undefined
                })
            });

            if (!res.ok) throw new Error('Failed to check prices');

            const data = await res.json();
            setResults(data.results);
            showToast('Sprawdzanie zakończone', 'success');
        } catch (e) {
            showToast('Błąd podczas sprawdzania cen', 'error');
            console.error(e);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Header */}
            <div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--text-white)' }}>
                    🕵️ Monitor Cen Empik
                </h2>
                <p style={{ color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                    Sprawdź kto ma Buy Box i jakie są ceny konkurencji.
                </p>
            </div>

            {/* Input Card */}
            <div className="card">
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            Lista EAN (jeden pod drugim)
                        </label>
                        <textarea
                            value={eans}
                            onChange={e => setEans(e.target.value)}
                            placeholder="590..."
                            rows={5}
                            className="form-input"
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: 'var(--text-white)',
                                fontFamily: 'monospace'
                            }}
                        />
                    </div>

                    <div>
                        <label style={{ display: 'block', marginBottom: '0.5rem', color: 'var(--text-muted)', fontSize: '0.875rem' }}>
                            Nazwa Twojego Sklepu (opcjonalne - do wykrywania Buy Box)
                        </label>
                        <input
                            type="text"
                            value={shopName}
                            onChange={e => setShopName(e.target.value)}
                            placeholder="np. Mój Sklep"
                            className="form-input"
                            style={{
                                width: '100%',
                                padding: '0.75rem',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                color: 'var(--text-white)'
                            }}
                        />
                    </div>

                    <button
                        onClick={handleCheck}
                        disabled={isLoading}
                        className="btn btn-primary"
                        style={{ alignSelf: 'flex-end', padding: '0.75rem 1.5rem' }}
                    >
                        {isLoading ? '⏳ Sprawdzanie...' : '🔍 Sprawdź Ceny'}
                    </button>
                </div>
            </div>

            {/* Results Table */}
            {results.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        Wyniki ({results.length})
                    </div>
                    <div className="card-body" style={{ overflowX: 'auto' }}>
                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
                            <thead>
                                <tr style={{ borderBottom: '1px solid var(--border)', textAlign: 'left' }}>
                                    <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>EAN</th>
                                    <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Produkt</th>
                                    <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Cena</th>
                                    <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Sprzedawca (Buy Box)</th>
                                    <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Status</th>
                                    <th style={{ padding: '0.75rem', color: 'var(--text-muted)' }}>Link</th>
                                </tr>
                            </thead>
                            <tbody>
                                {results.map((r, i) => (
                                    <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                        <td style={{ padding: '0.75rem', fontFamily: 'monospace' }}>{r.ean}</td>
                                        <td style={{ padding: '0.75rem', maxWidth: '200px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                            {r.title || '-'}
                                        </td>
                                        <td style={{ padding: '0.75rem', fontWeight: 700 }}>
                                            {r.price ? `${r.price} zł` : '-'}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {r.seller || '-'}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {r.status === 'winning' && <span style={{ color: '#4ade80', background: 'rgba(74, 222, 128, 0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>🏆 Ty wygrywasz</span>}
                                            {r.status === 'losing' && <span style={{ color: '#ef4444', background: 'rgba(239, 68, 68, 0.1)', padding: '0.25rem 0.5rem', borderRadius: '4px' }}>⚠️ Przegrywasz</span>}
                                            {r.status === 'neutral' && <span style={{ color: 'var(--text-muted)' }}>Neutralny</span>}
                                            {r.status === 'error' && <span style={{ color: '#ef4444' }}>Błąd</span>}
                                            {r.status === 'not_found' && <span style={{ color: 'var(--text-muted)' }}>Nie znaleziono</span>}
                                        </td>
                                        <td style={{ padding: '0.75rem' }}>
                                            {r.url && (
                                                <a href={r.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--accent)', textDecoration: 'none' }}>
                                                    🔗
                                                </a>
                                            )}
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </div>
            )}
        </div>
    );
}
