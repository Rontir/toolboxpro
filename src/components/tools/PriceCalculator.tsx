'use client';

import { useState, useMemo, useEffect } from 'react';
import { useStats } from '../Stats';
import { useUndoRedo, useUndoRedoKeyboard, UndoRedoButtons } from '@/hooks/useUndoRedo';

type CalculatorMode = 'margin' | 'discount' | 'vat';

const VAT_RATES = [
    { value: 23, label: '23%' },
    { value: 8, label: '8%' },
    { value: 5, label: '5%' },
    { value: 0, label: '0%' },
];

interface Settings {
    mode: CalculatorMode;
    purchasePrice: string;
    sellingPrice: string;
    targetMargin: string;
    originalPrice: string;
    discountPercent: string;
    netPrice: string;
    vatRate: number;
    vatDirection: 'add' | 'remove';
}

const DEFAULT_SETTINGS: Settings = {
    mode: 'margin',
    purchasePrice: '',
    sellingPrice: '',
    targetMargin: '',
    originalPrice: '',
    discountPercent: '',
    netPrice: '',
    vatRate: 23,
    vatDirection: 'add',
};

export default function PriceCalculator() {
    const {
        state: settings,
        setState: setSettings,
        undo,
        redo,
        canUndo,
        canRedo,
        undoCount,
        redoCount
    } = useUndoRedo<Settings>(DEFAULT_SETTINGS);

    useUndoRedoKeyboard(undo, redo);

    // Stats tracking
    const { recordUsage } = useStats();
    const hasTrackedRef = { current: false };

    // Margin calculations
    const marginResults = useMemo(() => {
        const purchase = parseFloat(settings.purchasePrice) || 0;
        const selling = parseFloat(settings.sellingPrice) || 0;
        const target = parseFloat(settings.targetMargin) || 0;

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
    }, [settings.purchasePrice, settings.sellingPrice, settings.targetMargin]);

    // Discount calculations
    const discountResults = useMemo(() => {
        const original = parseFloat(settings.originalPrice) || 0;
        const discount = parseFloat(settings.discountPercent) || 0;

        if (original > 0 && discount > 0) {
            const savings = original * (discount / 100);
            const final = original - savings;
            return { final, savings, discount };
        }
        return null;
    }, [settings.originalPrice, settings.discountPercent]);

    // VAT calculations
    const vatResults = useMemo(() => {
        const net = parseFloat(settings.netPrice) || 0;
        if (net <= 0) return null;

        if (settings.vatDirection === 'add') {
            const vatAmount = net * (settings.vatRate / 100);
            const gross = net + vatAmount;
            return { net, vatAmount, gross };
        } else {
            const netFromGross = net / (1 + settings.vatRate / 100);
            const vatAmount = net - netFromGross;
            return { net: netFromGross, vatAmount, gross: net };
        }
    }, [settings.netPrice, settings.vatRate, settings.vatDirection]);

    // Track usage when results are calculated
    useEffect(() => {
        if ((marginResults || discountResults || vatResults) && !hasTrackedRef.current) {
            recordUsage('calculator', 1);
            hasTrackedRef.current = true;
        }
    }, [marginResults, discountResults, vatResults, recordUsage]);

    const formatCurrency = (value: number) => {
        return new Intl.NumberFormat('pl-PL', { style: 'currency', currency: 'PLN' }).format(value);
    };

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Mode Selection */}
            <div className="card">
                <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span>💰 Tryb kalkulatora</span>
                    <UndoRedoButtons
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onUndo={undo}
                        onRedo={redo}
                        undoCount={undoCount}
                        redoCount={redoCount}
                    />
                </div>
                <div className="card-body">
                    <div className="filter-pills">
                        <button
                            onClick={() => setSettings({ ...settings, mode: 'margin' }, 'Zmiana trybu na Marża')}
                            className={`filter-pill ${settings.mode === 'margin' ? 'active' : ''}`}
                        >
                            📊 Marża / Narzut
                        </button>
                        <button
                            onClick={() => setSettings({ ...settings, mode: 'discount' }, 'Zmiana trybu na Rabat')}
                            className={`filter-pill ${settings.mode === 'discount' ? 'active' : ''}`}
                        >
                            🏷️ Rabat
                        </button>
                        <button
                            onClick={() => setSettings({ ...settings, mode: 'vat' }, 'Zmiana trybu na VAT')}
                            className={`filter-pill ${settings.mode === 'vat' ? 'active' : ''}`}
                        >
                            🧾 VAT
                        </button>
                    </div>
                </div>
            </div>

            {/* Margin Mode */}
            {settings.mode === 'margin' && (
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
                                    value={settings.purchasePrice}
                                    onChange={(e) => setSettings({ ...settings, purchasePrice: e.target.value }, 'Zmiana ceny zakupu')}
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
                                    value={settings.sellingPrice}
                                    onChange={(e) => setSettings({ ...settings, sellingPrice: e.target.value }, 'Zmiana ceny sprzedaży')}
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
                                value={settings.targetMargin}
                                onChange={(e) => setSettings({ ...settings, targetMargin: e.target.value }, 'Zmiana docelowej marży')}
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
            {settings.mode === 'discount' && (
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
                                    value={settings.originalPrice}
                                    onChange={(e) => setSettings({ ...settings, originalPrice: e.target.value }, 'Zmiana ceny oryginalnej')}
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
                                    value={settings.discountPercent}
                                    onChange={(e) => setSettings({ ...settings, discountPercent: e.target.value }, 'Zmiana procentu rabatu')}
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
            {settings.mode === 'vat' && (
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
                                    onClick={() => setSettings({ ...settings, vatDirection: 'add' }, 'Zmiana kierunku na Netto → Brutto')}
                                    className={`filter-pill ${settings.vatDirection === 'add' ? 'active' : ''}`}
                                >
                                    Netto → Brutto
                                </button>
                                <button
                                    onClick={() => setSettings({ ...settings, vatDirection: 'remove' }, 'Zmiana kierunku na Brutto → Netto')}
                                    className={`filter-pill ${settings.vatDirection === 'remove' ? 'active' : ''}`}
                                >
                                    Brutto → Netto
                                </button>
                            </div>
                        </div>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    {settings.vatDirection === 'add' ? 'Cena netto' : 'Cena brutto'}
                                </label>
                                <input
                                    type="number"
                                    value={settings.netPrice}
                                    onChange={(e) => setSettings({ ...settings, netPrice: e.target.value }, 'Zmiana ceny')}
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
                                            onClick={() => setSettings({ ...settings, vatRate: rate.value }, `Zmiana stawki VAT na ${rate.label}`)}
                                            className={`filter-pill ${settings.vatRate === rate.value ? 'active' : ''}`}
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
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>VAT ({settings.vatRate}%)</div>
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
