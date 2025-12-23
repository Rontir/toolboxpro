'use client';

import { useState, useCallback } from 'react';

interface FileToRename {
    originalName: string;
    newName: string;
    file: File;
}

type RenameMode = 'prefix' | 'suffix' | 'replace' | 'sequence' | 'regex';

export default function BatchRenamer() {
    const [files, setFiles] = useState<FileToRename[]>([]);
    const [mode, setMode] = useState<RenameMode>('prefix');
    const [prefixValue, setPrefixValue] = useState('');
    const [suffixValue, setSuffixValue] = useState('');
    const [findValue, setFindValue] = useState('');
    const [replaceValue, setReplaceValue] = useState('');
    const [sequenceStart, setSequenceStart] = useState(1);
    const [sequencePadding, setSequencePadding] = useState(3);
    const [sequencePattern, setSequencePattern] = useState('file_###');
    const [regexPattern, setRegexPattern] = useState('');
    const [regexReplace, setRegexReplace] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);
    const [isDragging, setIsDragging] = useState(false);

    const handleFileSelect = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = e.target.files;
        if (!selectedFiles) return;

        const newFiles: FileToRename[] = Array.from(selectedFiles).map(file => ({
            originalName: file.name,
            newName: file.name,
            file
        }));
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const handleDrop = useCallback((e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        const droppedFiles = e.dataTransfer.files;
        if (!droppedFiles.length) return;

        const newFiles: FileToRename[] = Array.from(droppedFiles).map(file => ({
            originalName: file.name,
            newName: file.name,
            file
        }));
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const applyRename = useCallback(() => {
        setFiles(prev => prev.map((file, index) => {
            let newName = file.originalName;
            const ext = newName.includes('.') ? '.' + newName.split('.').pop() : '';
            const baseName = newName.replace(ext, '');

            switch (mode) {
                case 'prefix':
                    newName = prefixValue + newName;
                    break;
                case 'suffix':
                    newName = baseName + suffixValue + ext;
                    break;
                case 'replace':
                    newName = newName.replaceAll(findValue, replaceValue);
                    break;
                case 'sequence':
                    const num = (sequenceStart + index).toString().padStart(sequencePadding, '0');
                    newName = sequencePattern.replace(/#+/g, num) + ext;
                    break;
                case 'regex':
                    try {
                        const regex = new RegExp(regexPattern, 'g');
                        newName = newName.replace(regex, regexReplace);
                    } catch {
                        // Invalid regex, skip
                    }
                    break;
            }

            return { ...file, newName };
        }));
    }, [mode, prefixValue, suffixValue, findValue, replaceValue, sequenceStart, sequencePadding, sequencePattern, regexPattern, regexReplace]);

    const downloadRenamed = useCallback(async () => {
        if (files.length === 0) return;
        setIsProcessing(true);

        try {
            const JSZip = (await import('jszip')).default;
            const zip = new JSZip();

            for (const file of files) {
                const content = await file.file.arrayBuffer();
                zip.file(file.newName, content);
            }

            const blob = await zip.generateAsync({ type: 'blob' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'renamed_files.zip';
            a.click();
            URL.revokeObjectURL(url);
        } catch (error) {
            console.error('Error creating zip:', error);
        } finally {
            setIsProcessing(false);
        }
    }, [files]);

    const clearFiles = useCallback(() => {
        setFiles([]);
    }, []);

    const removeFile = useCallback((index: number) => {
        setFiles(prev => prev.filter((_, i) => i !== index));
    }, []);

    const MODES = [
        { id: 'prefix' as const, label: '➕ Prefix', desc: 'Dodaj na początku' },
        { id: 'suffix' as const, label: '➕ Suffix', desc: 'Dodaj na końcu' },
        { id: 'replace' as const, label: '🔄 Zamień', desc: 'Znajdź i zamień' },
        { id: 'sequence' as const, label: '🔢 Numeracja', desc: 'Sekwencyjna' },
        { id: 'regex' as const, label: '📝 Regex', desc: 'Wyrażenie regularne' },
    ];

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
            {/* File Drop Zone */}
            <div
                className={`upload-zone ${isDragging ? 'dragging' : ''}`}
                onDrop={handleDrop}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
            >
                <input
                    type="file"
                    multiple
                    onChange={handleFileSelect}
                    style={{ display: 'none' }}
                    id="batch-file-input"
                />
                <label htmlFor="batch-file-input" style={{ cursor: 'pointer', display: 'block' }}>
                    <span className="icon">✏️</span>
                    <p className="title">
                        {files.length > 0 ? `${files.length} plików wybranych` : 'Przeciągnij pliki tutaj'}
                    </p>
                    <p className="subtitle">lub kliknij aby wybrać pliki do zmiany nazw</p>
                </label>
            </div>

            {/* Rename Mode Selection */}
            <div className="card">
                <div className="card-header">
                    <span>🔧 Tryb zmiany nazw</span>
                </div>
                <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                    <div className="filter-pills">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setMode(m.id)}
                                className={`filter-pill ${mode === m.id ? 'active' : ''}`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {/* Mode-specific inputs */}
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
                        {mode === 'prefix' && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Prefix do dodania
                                </label>
                                <input
                                    type="text"
                                    value={prefixValue}
                                    onChange={(e) => setPrefixValue(e.target.value)}
                                    placeholder="np. produkt_"
                                    className="input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        )}
                        {mode === 'suffix' && (
                            <div>
                                <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                    Suffix do dodania (przed rozszerzeniem)
                                </label>
                                <input
                                    type="text"
                                    value={suffixValue}
                                    onChange={(e) => setSuffixValue(e.target.value)}
                                    placeholder="np. _final"
                                    className="input"
                                    style={{ width: '100%' }}
                                />
                            </div>
                        )}
                        {mode === 'replace' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Znajdź tekst
                                    </label>
                                    <input
                                        type="text"
                                        value={findValue}
                                        onChange={(e) => setFindValue(e.target.value)}
                                        placeholder="np. stary_"
                                        className="input"
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Zamień na
                                    </label>
                                    <input
                                        type="text"
                                        value={replaceValue}
                                        onChange={(e) => setReplaceValue(e.target.value)}
                                        placeholder="np. nowy_"
                                        className="input"
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            </div>
                        )}
                        {mode === 'sequence' && (
                            <>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Wzorzec (### = numer)
                                    </label>
                                    <input
                                        type="text"
                                        value={sequencePattern}
                                        onChange={(e) => setSequencePattern(e.target.value)}
                                        placeholder="np. produkt_###"
                                        className="input"
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Numeracja od
                                        </label>
                                        <input
                                            type="number"
                                            value={sequenceStart}
                                            onChange={(e) => setSequenceStart(parseInt(e.target.value) || 1)}
                                            className="input"
                                            min={0}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                    <div>
                                        <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                            Cyfry (padding)
                                        </label>
                                        <input
                                            type="number"
                                            value={sequencePadding}
                                            onChange={(e) => setSequencePadding(parseInt(e.target.value) || 1)}
                                            className="input"
                                            min={1}
                                            max={10}
                                            style={{ width: '100%' }}
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                        {mode === 'regex' && (
                            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Wzorzec regex
                                    </label>
                                    <input
                                        type="text"
                                        value={regexPattern}
                                        onChange={(e) => setRegexPattern(e.target.value)}
                                        placeholder="np. \d+"
                                        className="input"
                                        style={{ width: '100%' }}
                                    />
                                </div>
                                <div>
                                    <label style={{ display: 'block', fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                        Zamień na ($1, $2 dla grup)
                                    </label>
                                    <input
                                        type="text"
                                        value={regexReplace}
                                        onChange={(e) => setRegexReplace(e.target.value)}
                                        placeholder="np. $1_nowy"
                                        className="input"
                                        style={{ width: '100%' }}
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <button
                        onClick={applyRename}
                        className="btn btn-primary"
                        disabled={files.length === 0}
                    >
                        👁️ Podgląd zmian
                    </button>
                </div>
            </div>

            {/* Preview Table */}
            {files.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span>📋 Podgląd ({files.length} plików)</span>
                        <button onClick={clearFiles} className="btn btn-secondary" style={{ fontSize: '0.75rem', padding: '0.4rem 0.75rem' }}>
                            🗑️ Wyczyść
                        </button>
                    </div>
                    <div className="card-body" style={{ padding: 0 }}>
                        <div style={{ maxHeight: '400px', overflow: 'auto' }}>
                            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                                <thead>
                                    <tr style={{ background: 'var(--bg-tertiary)' }}>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Oryginalna nazwa</th>
                                        <th style={{ padding: '0.75rem 0.5rem', textAlign: 'center', fontSize: '0.75rem', color: 'var(--text-muted)', width: '40px' }}>→</th>
                                        <th style={{ padding: '0.75rem 1rem', textAlign: 'left', fontSize: '0.75rem', color: 'var(--text-muted)', fontWeight: 600 }}>Nowa nazwa</th>
                                        <th style={{ padding: '0.75rem 0.5rem', width: '40px' }}></th>
                                    </tr>
                                </thead>
                                <tbody>
                                    {files.map((file, i) => (
                                        <tr key={i} style={{ borderBottom: '1px solid var(--border)' }}>
                                            <td style={{ padding: '0.75rem 1rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                                                {file.originalName}
                                            </td>
                                            <td style={{ textAlign: 'center', color: 'var(--accent)', fontSize: '1rem' }}>→</td>
                                            <td style={{
                                                padding: '0.75rem 1rem',
                                                fontSize: '0.875rem',
                                                fontWeight: file.originalName !== file.newName ? 600 : 400,
                                                color: file.originalName !== file.newName ? 'var(--accent)' : 'var(--text-white)'
                                            }}>
                                                {file.newName}
                                            </td>
                                            <td>
                                                <button
                                                    onClick={() => removeFile(i)}
                                                    className="icon-btn"
                                                    style={{ color: 'var(--text-muted)' }}
                                                >×</button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </div>
            )}

            {/* Download Button */}
            {files.length > 0 && (
                <div style={{ display: 'flex', gap: '0.75rem' }}>
                    <button
                        onClick={downloadRenamed}
                        className="btn btn-primary"
                        disabled={isProcessing || files.every(f => f.originalName === f.newName)}
                    >
                        {isProcessing ? '⏳ Przetwarzanie...' : '📦 Pobierz jako ZIP'}
                    </button>
                </div>
            )}

            {/* Empty State */}
            {files.length === 0 && (
                <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
                    <div style={{ fontSize: '3rem', marginBottom: '1rem', opacity: 0.5 }}>✏️</div>
                    <div style={{ fontSize: '1rem', color: 'var(--text-muted)' }}>
                        Przeciągnij pliki powyżej aby rozpocząć zmianę nazw
                    </div>
                </div>
            )}
        </div>
    );
}
