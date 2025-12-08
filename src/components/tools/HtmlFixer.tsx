'use client';

import { useState } from 'react';

export default function HtmlFixer() {
    const [input, setInput] = useState('');
    const [output, setOutput] = useState('');
    const [fixOptions, setFixOptions] = useState({
        removeStyles: true,
        cleanTags: true,
        fixEntities: true,
        minify: false,
    });

    const fixHtml = () => {
        let html = input;

        if (fixOptions.removeStyles) {
            html = html.replace(/\s*style="[^"]*"/gi, '');
            html = html.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
        }

        if (fixOptions.cleanTags) {
            html = html.replace(/<font[^>]*>/gi, '');
            html = html.replace(/<\/font>/gi, '');
            html = html.replace(/<span>\s*<\/span>/gi, '');
            html = html.replace(/class="[^"]*"/gi, '');
        }

        if (fixOptions.fixEntities) {
            html = html.replace(/&nbsp;/gi, ' ');
            html = html.replace(/&amp;/gi, '&');
            html = html.replace(/&lt;/gi, '<');
            html = html.replace(/&gt;/gi, '>');
        }

        if (fixOptions.minify) {
            html = html.replace(/\s+/g, ' ').trim();
            html = html.replace(/>\s+</g, '><');
        }

        html = html.replace(/\n\s*\n/g, '\n');
        html = html.trim();

        setOutput(html);
    };

    const copyOutput = () => {
        navigator.clipboard.writeText(output);
    };

    return (
        <div className="max-w-5xl" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            {/* Text areas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                {/* Input */}
                <div className="card">
                    <div className="card-header">📝 Wejście</div>
                    <div className="card-body">
                        <textarea
                            style={{
                                width: '100%',
                                height: '256px',
                                padding: '12px',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontFamily: 'monospace',
                                resize: 'none',
                                color: 'var(--text-white)',
                                outline: 'none',
                            }}
                            placeholder="Wklej kod HTML tutaj..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                        />
                    </div>
                </div>

                {/* Output */}
                <div className="card">
                    <div className="card-header" style={{ display: 'flex', justifyContent: 'space-between' }}>
                        <span>✅ Wyjście</span>
                        {output && (
                            <button onClick={copyOutput} style={{ fontSize: '12px', color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer' }}>
                                📋 Kopiuj
                            </button>
                        )}
                    </div>
                    <div className="card-body">
                        <textarea
                            style={{
                                width: '100%',
                                height: '256px',
                                padding: '12px',
                                background: 'var(--bg-input)',
                                border: '1px solid var(--border)',
                                borderRadius: '8px',
                                fontSize: '13px',
                                fontFamily: 'monospace',
                                resize: 'none',
                                color: 'var(--text-white)',
                                outline: 'none',
                            }}
                            readOnly
                            value={output}
                            placeholder="Tutaj pojawi się naprawiony HTML..."
                        />
                    </div>
                </div>
            </div>

            {/* Options */}
            <div className="card">
                <div className="card-header">⚙️ Opcje naprawy</div>
                <div className="card-body">
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '24px' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.removeStyles}
                                onChange={(e) => setFixOptions({ ...fixOptions, removeStyles: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Usuń style inline
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.cleanTags}
                                onChange={(e) => setFixOptions({ ...fixOptions, cleanTags: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Usuń zbędne tagi
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.fixEntities}
                                onChange={(e) => setFixOptions({ ...fixOptions, fixEntities: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Napraw encje HTML
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px', cursor: 'pointer', color: 'var(--text-gray)' }}>
                            <input
                                type="checkbox"
                                checked={fixOptions.minify}
                                onChange={(e) => setFixOptions({ ...fixOptions, minify: e.target.checked })}
                                style={{ accentColor: 'var(--accent)', width: '16px', height: '16px' }}
                            />
                            Minifikuj
                        </label>
                    </div>
                </div>
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '12px' }}>
                <button onClick={fixHtml} disabled={!input} className="btn btn-primary">
                    🔧 Napraw HTML
                </button>
                <button onClick={() => { setInput(''); setOutput(''); }} className="btn btn-secondary">
                    🗑️ Wyczyść
                </button>
            </div>
        </div>
    );
}
