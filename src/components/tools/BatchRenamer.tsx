'use client';

import { useState, useCallback } from 'react';
import { useStats } from '../Stats';
import { useHistory } from '../History';
import { useNotifications } from '../Notifications';
import { useUndoRedo, useUndoRedoKeyboard, UndoRedoButtons } from '@/hooks/useUndoRedo';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

interface FileToRename {
    originalName: string;
    newName: string;
    file: File;
}

type RenameMode = 'prefix' | 'suffix' | 'replace' | 'sequence' | 'regex';

interface Settings {
    mode: RenameMode;
    prefixValue: string;
    suffixValue: string;
    findValue: string;
    replaceValue: string;
    sequenceStart: number;
    sequencePadding: number;
    sequencePattern: string;
    regexPattern: string;
    regexReplace: string;
}

const DEFAULT_SETTINGS: Settings = {
    mode: 'prefix',
    prefixValue: '',
    suffixValue: '',
    findValue: '',
    replaceValue: '',
    sequenceStart: 1,
    sequencePadding: 3,
    sequencePattern: 'file_###',
    regexPattern: '',
    regexReplace: '',
};

export default function BatchRenamer() {
    const [files, setFiles] = useState<FileToRename[]>([]);

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

    const [isProcessing, setIsProcessing] = useState(false);

    // Core hooks
    const { recordUsage } = useStats();
    const { addToHistory } = useHistory();
    const { addNotification } = useNotifications();

    const handleFilesSelected = useCallback((selectedFiles: File[]) => {
        const newFiles: FileToRename[] = selectedFiles.map(file => ({
            originalName: file.name,
            newName: file.name,
            file
        }));
        setFiles(prev => [...prev, ...newFiles]);
    }, []);

    const applyRename = useCallback(() => {
        setFiles((prev: FileToRename[]) => prev.map((file: FileToRename, index: number) => {
            let newName = file.originalName;
            const ext = newName.includes('.') ? '.' + newName.split('.').pop() : '';
            const baseName = newName.replace(ext, '');

            switch (settings.mode) {
                case 'prefix':
                    newName = settings.prefixValue + newName;
                    break;
                case 'suffix':
                    newName = baseName + settings.suffixValue + ext;
                    break;
                case 'replace':
                    newName = newName.replaceAll(settings.findValue, settings.replaceValue);
                    break;
                case 'sequence':
                    const num = (settings.sequenceStart + index).toString().padStart(settings.sequencePadding, '0');
                    newName = settings.sequencePattern.replace(/#+/g, num) + ext;
                    break;
                case 'regex':
                    try {
                        const regex = new RegExp(settings.regexPattern, 'g');
                        newName = newName.replace(regex, settings.regexReplace);
                    } catch {
                        // Invalid regex, skip
                    }
                    break;
            }

            return { ...file, newName };
        }));
    }, [settings]);

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
            recordUsage('batch-renamer', files.length);
            addNotification('success', 'Zmiana nazw zakończona', `Pomyślnie zmieniono nazwy ${files.length} plików.`);
            addToHistory({
                tool: 'Batch Renamer',
                toolIcon: '✏️',
                inputFiles: files.map(f => f.originalName),
                outputFileName: 'renamed_files.zip',
                outputBlob: null,
                summary: `${files.length} plików → zmienione nazwy`,
                stats: { 'Plików': files.length }
            });
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
        setFiles((prev: FileToRename[]) => prev.filter((_, i: number) => i !== index));
    }, []);

    const MODES = [
        { id: 'prefix' as const, label: '➕ Prefix', desc: 'Dodaj na początku' },
        { id: 'suffix' as const, label: '➕ Suffix', desc: 'Dodaj na końcu' },
        { id: 'replace' as const, label: '🔄 Zamień', desc: 'Znajdź i zamień' },
        { id: 'sequence' as const, label: '🔢 Numeracja', desc: 'Sekwencyjna' },
        { id: 'regex' as const, label: '📝 Regex', desc: 'Wyrażenie regularne' },
    ];

    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Batch Renamer"
                description="Zmień nazwy wielu plików jednocześnie. Dodawaj prefixy, suffixy, numerację lub używaj wyrażeń regularnych."
                icon="✏️"
            />

            {/* File Upload */}
            <Section title="📂 Wybierz pliki">
                <FileUpload
                    onFilesSelect={handleFilesSelected}
                    multiple={true}
                    label="Wgraj pliki do zmiany nazwy"
                    sublabel="Obsługujemy wszystkie typy plików"
                    icon="✏️"
                />
            </Section>

            {/* Rename Mode Selection */}
            <Section
                title="🔧 Tryb zmiany nazw"
                actions={
                    <UndoRedoButtons
                        canUndo={canUndo}
                        canRedo={canRedo}
                        onUndo={undo}
                        onRedo={redo}
                        undoCount={undoCount}
                        redoCount={redoCount}
                    />
                }
            >
                <div className="flex flex-col gap-6">
                    <div className="flex flex-wrap gap-2">
                        {MODES.map(m => (
                            <button
                                key={m.id}
                                onClick={() => setSettings({ ...settings, mode: m.id }, `Zmiana trybu na ${m.label}`)}
                                className={`px-4 py-2 rounded-full text-sm transition-colors ${settings.mode === m.id
                                    ? 'bg-accent text-white font-medium'
                                    : 'bg-bg-tertiary text-text-gray hover:bg-bg-tertiary/80'
                                    }`}
                            >
                                {m.label}
                            </button>
                        ))}
                    </div>

                    {/* Mode-specific inputs */}
                    <div className="p-4 bg-bg-tertiary rounded-lg border border-border">
                        {settings.mode === 'prefix' && (
                            <div>
                                <label className="block text-sm text-text-muted mb-2">
                                    Prefix do dodania
                                </label>
                                <input
                                    type="text"
                                    value={settings.prefixValue}
                                    onChange={(e) => setSettings({ ...settings, prefixValue: e.target.value }, 'Zmiana prefixu')}
                                    placeholder="np. produkt_"
                                    className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                />
                            </div>
                        )}
                        {settings.mode === 'suffix' && (
                            <div>
                                <label className="block text-sm text-text-muted mb-2">
                                    Suffix do dodania (przed rozszerzeniem)
                                </label>
                                <input
                                    type="text"
                                    value={settings.suffixValue}
                                    onChange={(e) => setSettings({ ...settings, suffixValue: e.target.value }, 'Zmiana suffixu')}
                                    placeholder="np. _final"
                                    className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                />
                            </div>
                        )}
                        {settings.mode === 'replace' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-text-muted mb-2">
                                        Znajdź tekst
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.findValue}
                                        onChange={(e) => setSettings({ ...settings, findValue: e.target.value }, 'Zmiana szukanego tekstu')}
                                        placeholder="np. stary_"
                                        className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-text-muted mb-2">
                                        Zamień na
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.replaceValue}
                                        onChange={(e) => setSettings({ ...settings, replaceValue: e.target.value }, 'Zmiana tekstu zamiany')}
                                        placeholder="np. nowy_"
                                        className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                    />
                                </div>
                            </div>
                        )}
                        {settings.mode === 'sequence' && (
                            <div className="flex flex-col gap-4">
                                <div>
                                    <label className="block text-sm text-text-muted mb-2">
                                        Wzorzec (### = numer)
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.sequencePattern}
                                        onChange={(e) => setSettings({ ...settings, sequencePattern: e.target.value }, 'Zmiana wzorca sekwencji')}
                                        placeholder="np. produkt_###"
                                        className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                    />
                                </div>
                                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                    <div>
                                        <label className="block text-sm text-text-muted mb-2">
                                            Numeracja od
                                        </label>
                                        <input
                                            type="number"
                                            value={settings.sequenceStart}
                                            onChange={(e) => setSettings({ ...settings, sequenceStart: parseInt(e.target.value) || 1 }, 'Zmiana początku sekwencji')}
                                            className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                            min={0}
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-sm text-text-muted mb-2">
                                            Cyfry (padding)
                                        </label>
                                        <input
                                            type="number"
                                            value={settings.sequencePadding}
                                            onChange={(e) => setSettings({ ...settings, sequencePadding: parseInt(e.target.value) || 1 }, 'Zmiana dopełnienia sekwencji')}
                                            className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                            min={1}
                                            max={10}
                                        />
                                    </div>
                                </div>
                            </div>
                        )}
                        {settings.mode === 'regex' && (
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="block text-sm text-text-muted mb-2">
                                        Wzorzec regex
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.regexPattern}
                                        onChange={(e) => setSettings({ ...settings, regexPattern: e.target.value }, 'Zmiana wzorca regex')}
                                        placeholder="np. \d+"
                                        className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-text-muted mb-2">
                                        Zamień na ($1, $2 dla grup)
                                    </label>
                                    <input
                                        type="text"
                                        value={settings.regexReplace}
                                        onChange={(e) => setSettings({ ...settings, regexReplace: e.target.value }, 'Zmiana zamiany regex')}
                                        placeholder="np. $1_nowy"
                                        className="w-full p-2 bg-bg-input border border-border rounded-lg text-text-white text-sm focus:border-accent outline-none"
                                    />
                                </div>
                            </div>
                        )}
                    </div>

                    <div className="flex justify-end">
                        <button
                            onClick={applyRename}
                            className="btn btn-primary"
                            disabled={files.length === 0}
                        >
                            👁️ Podgląd zmian
                        </button>
                    </div>
                </div>
            </Section>

            {/* Preview Table */}
            {files.length > 0 && (
                <Section
                    title={`📋 Podgląd (${files.length} plików)`}
                    actions={
                        <div className="flex gap-2">
                            <button onClick={clearFiles} className="btn btn-secondary text-xs py-1 px-2">
                                🗑️ Wyczyść
                            </button>
                            <button
                                onClick={downloadRenamed}
                                className="btn btn-primary text-xs py-1 px-2"
                                disabled={isProcessing || files.every((f: FileToRename) => f.originalName === f.newName)}
                            >
                                {isProcessing ? '⏳ Przetwarzanie...' : '📦 Pobierz ZIP'}
                            </button>
                        </div>
                    }
                >
                    <div className="max-h-[400px] overflow-auto border border-border rounded-lg">
                        <table className="w-full text-sm border-collapse">
                            <thead className="bg-bg-tertiary sticky top-0">
                                <tr>
                                    <th className="p-3 text-left text-text-muted font-medium border-b border-border">Oryginalna nazwa</th>
                                    <th className="p-3 text-center text-text-muted font-medium border-b border-border w-10">→</th>
                                    <th className="p-3 text-left text-text-muted font-medium border-b border-border">Nowa nazwa</th>
                                    <th className="p-3 w-10 border-b border-border"></th>
                                </tr>
                            </thead>
                            <tbody>
                                {files.map((file: FileToRename, i: number) => (
                                    <tr key={i} className="border-b border-border/50 hover:bg-bg-tertiary/50 transition-colors">
                                        <td className="p-3 text-text-gray font-mono text-xs">
                                            {file.originalName}
                                        </td>
                                        <td className="p-3 text-center text-accent">→</td>
                                        <td className={`p-3 font-mono text-xs ${file.originalName !== file.newName ? 'text-accent font-bold' : 'text-text-white'
                                            }`}>
                                            {file.newName}
                                        </td>
                                        <td className="p-3 text-center">
                                            <button
                                                onClick={() => removeFile(i)}
                                                className="text-text-muted hover:text-red-400 transition-colors"
                                            >
                                                ✕
                                            </button>
                                        </td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                </Section>
            )}
        </div>
    );
}
