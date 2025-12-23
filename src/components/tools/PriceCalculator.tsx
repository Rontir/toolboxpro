'use client';

import { useState, useMemo } from 'react';

type CalculatorMode = 'margin' | 'discount' | 'vat';

const VAT_RATES = [
    { value: 23, label: '23%' },
    { value: 8, label: '8%' },
    { value: 5, label: '5%' },
    { value: 0, label: '0%' },
];

export default function PriceCalculator() {
    const [mode, setMode] = useState<CalculatorMode>('margin');

    // Margin mode
    const [purchasePrice, setPurchasePrice] = useState<string>('');
    const [sellingPrice, setSellingPrice] = useState<string>('');
    const [targetMargin, setTargetMargin] = useState<string>('');

    // Discount mode
    const [originalPrice, setOriginalPrice] = useState<string>('');
    const [discountPercent, setDiscountPercent] = useState<string>('');

    // VAT mode
    const [netPrice, setNetPrice] = useState<string>('');
    const [vatRate, setVatRate] = useState<number>(23);
    const [vatDirection, setVatDirection] = useState<'add' | 'remove'>('add');

    // Margin calculations
    const marginResults = useMemo(() => {
        const purchase = parseFloat(purchasePrice) || 0;
        const selling = parseFloat(sellingPrice) || 0;
        const target = parseFloat(targetMargin) || 0;

        if (purchase > 0 && selling > 0) {
            const profit = selling - purchase;
            const margin = (profit / selling) * 100;
            const markup = (profit / purchase) * 100;
            return { profit, margin, markup, suggested: null };
        }

        if (purchase > 0 && target > 0) {
            const suggested = purchase / (1 - target / 100);
            return { profit: suggested - purchase, margin: target, markup: ((suggested - purchase) / purchase) * 100, suggested };
        }

        return null;
    }, [purchasePrice, sellingPrice, targetMargin]);

    // Discount calculations
    const discountResults = useMemo(() => {
        const original = parseFloat(originalPrice) || 0;
        const discount = parseFloat(discountPercent) || 0;

        if (original > 0 && discount > 0) {
            const savings = original * (discount / 100);
            const final = original - savings;
            return { final, savings, discount };
        }
        return null;
    }, [originalPrice, discountPercent]);

    // VAT calculations
    const vatResults = useMemo(() => {
        const net = parseFloat(netPrice) || 0;
        if (net <= 0) return null;

        if (vatDirection === 'add') {
            const vatAmount = net * (vatRate / 100);
            const gross = net + vatAmount;
            return { net, vatAmount, gross };
        } else {
            const netFromGross = net / (1 + vatRate / 100);
            const vatAmount = net - netFromGross;
            return { net: netFromGross, vatAmount, gross: net };
        }
    }, [netPrice, vatRate, vatDirection]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Mode Selection */}
            <div className="card">
                <div className="card-header">
                    <span>💰 Tryb kalkulatora</span>
                </div>
                <div className="card-body">
                    <div className="filter-pills">
                        <button
                            onClick={() => setMode('margin')}
                            className={`filter-pill ${mode === 'margin' ? 'active' : ''}`}
                        >
                            📊 Marża / Narzut
                        </button>
                        <button
                            onClick={() => setMode('discount')}
                            className={`filter-pill ${mode === 'discount' ? 'active' : ''}`}
                        >
                            🏷️ Rabat
                        </button>
                        <button
                            onClick={() => setMode('vat')}
                            className={`filter-pill ${mode === 'vat' ? 'active' : ''}`}
                        >
                            🧾 VAT
                        </button>
                    </div>
                </div>
            </div>

            {/* Margin Mode */}
            {mode === 'margin' && (
                <div className="card">
                    <div className="card-header">
                        <span>📊 Kalkulator Marży</span>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Cena zakupu (netto)
                                </label>
                                <input
                                    type="number"
                                    value={purchasePrice}
                                    onChange={(e) => setPurchasePrice(e.target.value)}
                                    placeholder="0.00"
                                    className="input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Cena sprzedaży (netto)
                                </label>
                                <input
                                    type="number"
                                    value={sellingPrice}
                                    onChange={(e) => setSellingPrice(e.target.value)}
                                    placeholder="0.00"
                                    className="input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>

                        <div style={{ textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.875rem' }}>lub</div>

                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Docelowa marża (%)
                            </label>
                            <input
                                type="number"
                                value={targetMargin}
                                onChange={(e) => setTargetMargin(e.target.value)}
                                placeholder="np. 30"
                                className="input"
                                style={{ width: '100%' }}
                            />
                        </div>

                        {marginResults && (
                            <div className="results-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '1rem',
                                marginTop: '1rem',
                                padding: '1rem',
                                background: 'rgba(var(--accent-rgb, 34, 197, 94), 0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(var(--accent-rgb, 34, 197, 94), 0.2)'
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Zysk</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--accent)' }}>
                                        {formatCurrency(marginResults.profit)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Marża</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-white)' }}>
                                        {marginResults.margin.toFixed(1)}%
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Narzut</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-white)' }}>
                                        {marginResults.markup.toFixed(1)}%
                                    </div>
                                </div>
                                {marginResults.suggested && (
                                    <div style={{ gridColumn: '1 / -1', textAlign: 'center', paddingTop: '1rem', borderTop: '1px solid var(--border)' }}>
                                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Sugerowana cena sprzedaży</div>
                                        <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
                                            {formatCurrency(marginResults.suggested)}
                                        </div>
                                    </div>
                                )}
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Discount Mode */}
            {mode === 'discount' && (
                <div className="card">
                    <div className="card-header">
                        <span>🏷️ Kalkulator Rabatu</span>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Cena oryginalna
                                </label>
                                <input
                                    type="number"
                                    value={originalPrice}
                                    onChange={(e) => setOriginalPrice(e.target.value)}
                                    placeholder="0.00"
                                    className="input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Rabat (%)
                                </label>
                                <input
                                    type="number"
                                    value={discountPercent}
                                    onChange={(e) => setDiscountPercent(e.target.value)}
                                    placeholder="np. 20"
                                    className="input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        </div>

                        {discountResults && (
                            <div className="results-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(2, 1fr)',
                                gap: '1rem',
                                marginTop: '1rem',
                                padding: '1rem',
                                background: 'rgba(var(--accent-rgb, 34, 197, 94), 0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(var(--accent-rgb, 34, 197, 94), 0.2)'
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Oszczędzasz</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#ef4444' }}>
                                        -{formatCurrency(discountResults.savings)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Cena końcowa</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
                                        {formatCurrency(discountResults.final)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* VAT Mode */}
            {mode === 'vat' && (
                <div className="card">
                    <div className="card-header">
                        <span>🧾 Kalkulator VAT</span>
                    </div>
                    <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Kierunek konwersji
                            </label>
                            <div className="filter-pills">
                                <button
                                    onClick={() => setVatDirection('add')}
                                    className={`filter-pill ${vatDirection === 'add' ? 'active' : ''}`}
                                >
                                    Netto → Brutto
                                </button>
                                <button
                                    onClick={() => setVatDirection('remove')}
                                    className={`filter-pill ${vatDirection === 'remove' ? 'active' : ''}`}
                                >
                                    Brutto → Netto
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    {vatDirection === 'add' ? 'Cena netto' : 'Cena brutto'}
                                </label>
                                <input
                                    type="number"
                                    value={netPrice}
                                    onChange={(e) => setNetPrice(e.target.value)}
                                    placeholder="0.00"
                                    className="input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Stawka VAT
                                </label>
                                <div className="filter-pills">
                                    {VAT_RATES.map(rate => (
                                        <button
                                            key={rate.value}
                                            onClick={() => setVatRate(rate.value)}
                                            className={`filter-pill ${vatRate === rate.value ? 'active' : ''}`}
                                        >
                                            {rate.label}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {vatResults && (
                            <div className="results-grid" style={{
                                display: 'grid',
                                gridTemplateColumns: 'repeat(3, 1fr)',
                                gap: '1rem',
                                marginTop: '1rem',
                                padding: '1rem',
                                background: 'rgba(var(--accent-rgb, 34, 197, 94), 0.1)',
                                borderRadius: '12px',
                                border: '1px solid rgba(var(--accent-rgb, 34, 197, 94), 0.2)'
                            }}>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Netto</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: 'var(--text-white)' }}>
                                        {formatCurrency(vatResults.net)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>VAT ({vatRate}%)</div>
                                    <div style={{ fontSize: '1.25rem', fontWeight: 700, color: '#f59e0b' }}>
                                        +{formatCurrency(vatResults.vatAmount)}
                                    </div>
                                </div>
                                <div style={{ textAlign: 'center' }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>Brutto</div>
                                    <div style={{ fontSize: '1.5rem', fontWeight: 700, color: 'var(--accent)' }}>
                                        {formatCurrency(vatResults.gross)}
                                    </div>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
