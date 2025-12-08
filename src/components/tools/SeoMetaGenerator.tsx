'use client';

import { useState, useMemo, useCallback } from 'react';

interface ProductData {
    name: string;
    brand: string;
    category: string;
    price: string;
    description: string;
    keywords: string;
    imageUrl: string;
}

export default function SeoMetaGenerator() {
    const [product, setProduct] = useState<ProductData>({
        name: '',
        brand: '',
        category: '',
        price: '',
        description: '',
        keywords: '',
        imageUrl: '',
    });
    const [copied, setCopied] = useState<string | null>(null);

    const updateField = (field: keyof ProductData, value: string) => {
        setProduct(prev => ({ ...prev, [field]: value }));
    };

    const generatedMeta = useMemo(() => {
        if (!product.name) return null;

        const title = product.brand
            ? `${product.name} - ${product.brand} | Kup teraz`
            : `${product.name} | Kup teraz`;

        const description = product.description
            ? product.description.slice(0, 155) + (product.description.length > 155 ? '...' : '')
            : `Kup ${product.name}${product.brand ? ` od ${product.brand}` : ''}. ${product.category ? `Kategoria: ${product.category}.` : ''} Sprawdź ofertę!`;

        const keywordsArr = [
            product.name,
            product.brand,
            product.category,
            ...product.keywords.split(',').map(k => k.trim()).filter(Boolean)
        ].filter(Boolean);

        const schemaOrg = {
            "@context": "https://schema.org",
            "@type": "Product",
            "name": product.name,
            "brand": product.brand ? { "@type": "Brand", "name": product.brand } : undefined,
            "category": product.category || undefined,
            "description": product.description || description,
            "image": product.imageUrl || undefined,
            "offers": product.price ? {
                "@type": "Offer",
                "price": product.price,
                "priceCurrency": "PLN",
                "availability": "https://schema.org/InStock"
            } : undefined
        };

        return {
            title: title.slice(0, 60),
            description: description.slice(0, 160),
            keywords: keywordsArr.join(', '),
            ogTitle: title.slice(0, 60),
            ogDescription: description.slice(0, 160),
            schemaOrg: JSON.stringify(schemaOrg, null, 2)
        };
    }, [product]);

    const copyToClipboard = useCallback((text: string, label: string) => {
        navigator.clipboard.writeText(text);
        setCopied(label);
        setTimeout(() => setCopied(null), 2000);
    }, []);

    const copyAllHtml = useCallback(() => {
        if (!generatedMeta) return;
        const html = `<title>${generatedMeta.title}</title>
<meta name="description" content="${generatedMeta.description}">
<meta name="keywords" content="${generatedMeta.keywords}">
<meta property="og:title" content="${generatedMeta.ogTitle}">
<meta property="og:description" content="${generatedMeta.ogDescription}">
<meta property="og:type" content="product">
${product.imageUrl ? `<meta property="og:image" content="${product.imageUrl}">` : ''}
<script type="application/ld+json">
${generatedMeta.schemaOrg}
</script>`;
        copyToClipboard(html, 'all');
    }, [generatedMeta, product.imageUrl, copyToClipboard]);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* Product Data Input */}
            <div className="card">
                <div className="card-header">
                    <span>📝 Dane produktu</span>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Nazwa produktu *
                            </label>
                            <input
                                type="text"
                                value={product.name}
                                onChange={(e) => updateField('name', e.target.value)}
                                placeholder="np. iPhone 15 Pro Max 256GB"
                                className="input"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Marka
                            </label>
                            <input
                                type="text"
                                value={product.brand}
                                onChange={(e) => updateField('brand', e.target.value)}
                                placeholder="np. Apple"
                                className="input"
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Kategoria
                            </label>
                            <input
                                type="text"
                                value={product.category}
                                onChange={(e) => updateField('category', e.target.value)}
                                placeholder="np. Smartfony"
                                className="input"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Cena (PLN)
                            </label>
                            <input
                                type="text"
                                value={product.price}
                                onChange={(e) => updateField('price', e.target.value)}
                                placeholder="np. 5999"
                                className="input"
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>

                    <div>
                        <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                            Opis produktu
                        </label>
                        <textarea
                            value={product.description}
                            onChange={(e) => updateField('description', e.target.value)}
                            placeholder="Krótki opis produktu (max 160 znaków dla meta description)"
                            className="input"
                            rows={3}
                            style={{ width: '100%', resize: 'vertical' }}
                        />
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Dodatkowe słowa kluczowe
                            </label>
                            <input
                                type="text"
                                value={product.keywords}
                                onChange={(e) => updateField('keywords', e.target.value)}
                                placeholder="oddzielone przecinkami"
                                className="input"
                                style={{ width: '100%' }}
                            />
                        </div>
                        <div>
                            <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                URL obrazka
                            </label>
                            <input
                                type="text"
                                value={product.imageUrl}
                                onChange={(e) => updateField('imageUrl', e.target.value)}
                                placeholder="https://..."
                                className="input"
                                style={{ width: '100%' }}
                            />
                        </div>
                    </div>
                </div>
            </div>

            {/* Generated Meta Tags */}
            {generatedMeta && (
                <>
                    {/* Google Preview */}
                    <div className="card">
                        <div className="card-header">
                            <span>🔍 Podgląd Google</span>
                        </div>
                        <div className="card-body">
                            <div style={{
                                padding: '1rem',
                                background: 'var(--bg-main)',
                                borderRadius: '8px',
                                fontFamily: 'Arial, sans-serif'
                            }}>
                                <div style={{ fontSize: '18px', color: '#1a0dab', marginBottom: '4px', cursor: 'pointer' }}>
                                    {generatedMeta.title}
                                </div>
                                <div style={{ fontSize: '14px', color: '#006621', marginBottom: '4px' }}>
                                    https://twojsklep.pl/produkt/{product.name.toLowerCase().replace(/\s+/g, '-')}
                                </div>
                                <div style={{ fontSize: '13px', color: '#545454', lineHeight: 1.4 }}>
                                    {generatedMeta.description}
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Meta Tags */}
                    <div className="card">
                        <div className="card-header">
                            <span>🎯 Wygenerowane tagi</span>
                            <button onClick={copyAllHtml} className="btn btn-primary" style={{ fontSize: '0.75rem', padding: '0.5rem 1rem' }}>
                                {copied === 'all' ? '✅ Skopiowano!' : '📋 Kopiuj wszystko'}
                            </button>
                        </div>
                        <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                            {/* Title */}
                            <div className="meta-tag-row" style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '0.75rem 1rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '8px'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                        Title ({generatedMeta.title.length}/60)
                                    </div>
                                    <code style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>
                                        {generatedMeta.title}
                                    </code>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(generatedMeta.title, 'title')}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                                >
                                    {copied === 'title' ? '✅' : '📋'}
                                </button>
                            </div>

                            {/* Description */}
                            <div className="meta-tag-row" style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '0.75rem 1rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '8px'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                        Meta Description ({generatedMeta.description.length}/160)
                                    </div>
                                    <code style={{ fontSize: '0.875rem', color: 'var(--text-gray)', wordBreak: 'break-word' }}>
                                        {generatedMeta.description}
                                    </code>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(generatedMeta.description, 'desc')}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                                >
                                    {copied === 'desc' ? '✅' : '📋'}
                                </button>
                            </div>

                            {/* Keywords */}
                            <div className="meta-tag-row" style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '1rem',
                                padding: '0.75rem 1rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '8px'
                            }}>
                                <div style={{ flex: 1 }}>
                                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: '0.25rem' }}>
                                        Keywords
                                    </div>
                                    <code style={{ fontSize: '0.875rem', color: 'var(--text-gray)', wordBreak: 'break-word' }}>
                                        {generatedMeta.keywords}
                                    </code>
                                </div>
                                <button
                                    onClick={() => copyToClipboard(generatedMeta.keywords, 'keywords')}
                                    className="btn btn-secondary"
                                    style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                                >
                                    {copied === 'keywords' ? '✅' : '📋'}
                                </button>
                            </div>
                        </div>
                    </div>

                    {/* Schema.org */}
                    <div className="card">
                        <div className="card-header">
                            <span>📊 Schema.org (JSON-LD)</span>
                            <button
                                onClick={() => copyToClipboard(generatedMeta.schemaOrg, 'schema')}
                                className="btn btn-secondary"
                                style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}
                            >
                                {copied === 'schema' ? '✅ Skopiowano!' : '📋 Kopiuj'}
                            </button>
                        </div>
                        <div className="card-body">
                            <pre style={{
                                background: 'var(--bg-main)',
                                padding: '1rem',
                                borderRadius: '8px',
                                fontSize: '0.75rem',
                                overflow: 'auto',
                                maxHeight: '200px',
                                color: 'var(--text-gray)'
                            }}>
                                {generatedMeta.schemaOrg}
                            </pre>
                        </div>
                    </div>
                </>
            )}

            {/* Empty State */}
            {!product.name && (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>🎯</div>
                    <div style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
                        Wprowadź dane produktu aby wygenerować meta tagi SEO
                    </div>
                </div>
            )}
        </div>
    );
}
