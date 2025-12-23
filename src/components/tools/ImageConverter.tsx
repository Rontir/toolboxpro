'use client';

import { useState, useCallback, useEffect } from 'react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { useHistory } from '@/components/History';
import { useDroppedFile } from '@/components/DroppedFileContext';
import { useStats } from '@/components/Stats';
import { useUndoRedo, UndoRedoButtons } from '@/hooks/useUndoRedo';
import JSZip from 'jszip';
import { useETAEstimator, ETADisplay } from '@/hooks/useETA';
import { PresetSelector } from '@/components/BatchPresets';
import { useNotifications } from '@/components/Notifications';
import { ToolHeader } from '../ui/ToolHeader';
import { FileUpload } from '../ui/FileUpload';
import { Section } from '../ui/Section';

interface FilePreview {
    file: File;
    preview: string;
}

interface ConvertedImage {
    name: string;
    url: string;
    originalUrl: string;
    originalSize: number;
    newSize: number;
}

const FORMATS = ['PNG', 'JPG', 'WEBP', 'GIF', 'BMP'];

export default function ImageConverter() {
    const [files, setFiles] = useState<FilePreview[]>([]);
    const {
        state: settings,
        setState: setSettings,
        undo,
        redo,
        canUndo,
        canRedo,
        undoCount,
        redoCount
    } = useUndoRedo({
        format: 'WEBP',
        quality: 85,
        namingOption: 'keep' as 'keep' | 'random',
        packAsZip: true
    });

    const [converted, setConverted] = useState<ConvertedImage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [uploadMode, setUploadMode] = useState<'folder' | 'files'>('files');
    const [compareIndex, setCompareIndex] = useState<number | null>(null);

    const eta = useETAEstimator();

    const { addToHistory } = useHistory();
    const { consumeDroppedFile } = useDroppedFile();
    const { recordUsage } = useStats();
    const { addNotification } = useNotifications();

    // Keyboard shortcuts for Undo/Redo
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
                if (e.shiftKey) {
                    e.preventDefault();
                    redo();
                } else {
                    e.preventDefault();
                    undo();
                }
            } else if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
                e.preventDefault();
                redo();
            } else if (e.key === 'Enter' && !e.ctrlKey && !e.metaKey && !e.shiftKey && !e.altKey) {
                // Trigger conversion on Enter if files are present and not processing
                const activeElement = document.activeElement;
                const isInput = activeElement?.tagName === 'INPUT' || activeElement?.tagName === 'TEXTAREA';
                if (!isInput && files.length > 0 && !isProcessing) {
                    e.preventDefault();
                    convertImages();
                }
            } else if (e.key === 'Escape') {
                setCompareIndex(null);
            }
        };
        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [undo, redo]);

    // Check for dropped file on mount
    useEffect(() => {
        const droppedFile = consumeDroppedFile();
        if (droppedFile && droppedFile.type.startsWith('image/')) {
            const preview = URL.createObjectURL(droppedFile);
            setFiles([{ file: droppedFile, preview }]);
        }
    }, []);

    useEffect(() => {
        return () => files.forEach(f => URL.revokeObjectURL(f.preview));
    }, [files]);

    const addFiles = useCallback(async (newFiles: File[]) => {
        const imageFiles = newFiles.filter(f => f.type.startsWith('image/'));

        // For small sets, process immediately
        if (imageFiles.length <= 20) {
            const previews = imageFiles.map(file => ({
                file,
                preview: URL.createObjectURL(file),
            }));
            setFiles(prev => [...prev, ...previews]);
            return;
        }

        // For large sets, process in batches to keep UI responsive
        const BATCH_SIZE = 15;

        for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
            const batch = imageFiles.slice(i, i + BATCH_SIZE);
            const previews = batch.map(file => ({
                file,
                preview: URL.createObjectURL(file),
            }));

            setFiles(prev => [...prev, ...previews]);
            setLoadingText(`📸 Ładowanie ${Math.min(i + BATCH_SIZE, imageFiles.length)}/${imageFiles.length} plików...`);

            // Yield to event loop to allow UI updates
            if (i + BATCH_SIZE < imageFiles.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        setIsLoading(false);
    }, []);

    // Extract images from ZIP file
    const extractFilesFromZip = useCallback(async (zipFile: File): Promise<File[]> => {
        try {
            setLoadingText(`📦 Rozpakowywanie ${zipFile.name}...`);
            const zip = await JSZip.loadAsync(zipFile);
            const imageFiles: File[] = [];

            const entries = Object.entries(zip.files);
            for (let i = 0; i < entries.length; i++) {
                const [path, zipEntry] = entries[i];

                // Skip directories and hidden files
                if (zipEntry.dir || path.startsWith('__MACOSX') || path.startsWith('.')) continue;

                // Check if it's an image
                const ext = path.toLowerCase().split('.').pop();
                if (!['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'tiff', 'tif'].includes(ext || '')) continue;

                setLoadingText(`📦 Rozpakowywanie ${i + 1}/${entries.length}...`);

                const blob = await zipEntry.async('blob');
                const fileName = path.split('/').pop() || path;
                const file = new File([blob], fileName, { type: `image/${ext === 'jpg' ? 'jpeg' : ext}` });
                imageFiles.push(file);
            }

            return imageFiles;
        } catch (error) {
            console.error('Error extracting ZIP:', error);
            return [];
        }
    }, []);

    const addFilesWithZip = useCallback(async (newFiles: File[]) => {
        // Separate ZIP files from regular image files
        const zipFiles = newFiles.filter(f => f.name.toLowerCase().endsWith('.zip'));
        let imageFiles = newFiles.filter(f => f.type.startsWith('image/'));

        // Extract images from ZIPs
        if (zipFiles.length > 0) {
            setIsLoading(true);
            for (const zipFile of zipFiles) {
                const extractedImages = await extractFilesFromZip(zipFile);
                imageFiles = [...imageFiles, ...extractedImages];
            }
        }

        if (imageFiles.length === 0) {
            setIsLoading(false);
            return;
        }

        // For small sets, process immediately
        if (imageFiles.length <= 20) {
            const previews = imageFiles.map(file => ({
                file,
                preview: URL.createObjectURL(file),
            }));
            setFiles(prev => [...prev, ...previews]);
            setIsLoading(false);
            return;
        }

        // For large sets, process in batches to keep UI responsive
        const BATCH_SIZE = 15;

        for (let i = 0; i < imageFiles.length; i += BATCH_SIZE) {
            const batch = imageFiles.slice(i, i + BATCH_SIZE);
            const previews = batch.map(file => ({
                file,
                preview: URL.createObjectURL(file),
            }));

            setFiles(prev => [...prev, ...previews]);
            setLoadingText(`📸 Ładowanie ${Math.min(i + BATCH_SIZE, imageFiles.length)}/${imageFiles.length} plików...`);

            // Yield to event loop to allow UI updates
            if (i + BATCH_SIZE < imageFiles.length) {
                await new Promise(resolve => setTimeout(resolve, 10));
            }
        }
        setIsLoading(false);
    }, [extractFilesFromZip]);

    const handleDrop = useCallback(async (e: React.DragEvent) => {
        e.preventDefault();
        setIsDragging(false);
        setIsLoading(true);
        setLoadingText('📂 Wczytywanie plików...');

        const items = e.dataTransfer.items;
        const filePromises: Promise<File[]>[] = [];

        for (let i = 0; i < items.length; i++) {
            const item = items[i].webkitGetAsEntry();
            if (item) {
                filePromises.push(traverseFileTree(item));
            }
        }

        const results = await Promise.all(filePromises);
        const allFiles = results.flat();
        setLoadingText(`📸 Przetwarzanie ${allFiles.length} plików...`);

        // addFilesWithZip handles ZIP extraction and sets isLoading(false) when done
        await addFilesWithZip(allFiles);
    }, [addFilesWithZip]);

    const traverseFileTree = (item: FileSystemEntry): Promise<File[]> => {
        return new Promise((resolve) => {
            if (item.isFile) {
                (item as FileSystemFileEntry).file(file => {
                    resolve([file]);
                });
            } else if (item.isDirectory) {
                const dirReader = (item as FileSystemDirectoryEntry).createReader();
                dirReader.readEntries(async entries => {
                    const files: File[] = [];
                    for (const entry of entries) {
                        const subFiles = await traverseFileTree(entry);
                        files.push(...subFiles);
                    }
                    resolve(files);
                });
            } else {
                resolve([]);
            }
        });
    };

    // Wrapper to show loading before processing files
    const handleFilesSelected = async (files: File[]) => {
        if (files.length === 0) return;

        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${files.length} plików...`);

        requestAnimationFrame(() => {
            setTimeout(() => {
                setLoadingText(`📸 Tworzenie podglądów...`);
                requestAnimationFrame(() => {
                    setTimeout(() => {
                        addFilesWithZip(files);
                        setIsLoading(false);
                    }, 50);
                });
            }, 50);
        });
    };

    const removeFile = (index: number) => {
        setFiles(prev => {
            URL.revokeObjectURL(prev[index].preview);
            return prev.filter((_, i) => i !== index);
        });
    };

    const generateRandomName = () => {
        return Math.random().toString(36).substring(2, 10);
    };

    const getOutputName = (originalName: string, fmt: string) => {
        if (settings.namingOption === 'random') {
            return `${generateRandomName()}.${fmt}`;
        }
        return originalName.replace(/\.[^.]+$/, `.${fmt}`);
    };

    const convertImages = async () => {
        if (files.length === 0) return;
        setIsProcessing(true);
        setConverted([]);
        eta.start(files.length);
        const results: ConvertedImage[] = [];
        const fmt = settings.format.toLowerCase();

        for (let i = 0; i < files.length; i++) {
            const { file, preview } = files[i];
            setProgress(Math.round(((i + 1) / files.length) * 100));
            eta.update(i + 1);

            try {
                const img = await loadImage(file);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;
                canvas.width = img.width;
                canvas.height = img.height;
                ctx.drawImage(img, 0, 0);

                const mimeType = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`;
                const blob = await new Promise<Blob>((resolve) => {
                    canvas.toBlob(b => resolve(b!), mimeType, settings.quality / 100);
                });

                results.push({
                    name: getOutputName(file.name, fmt),
                    url: URL.createObjectURL(blob),
                    originalUrl: preview,
                    originalSize: file.size,
                    newSize: blob.size,
                });
            } catch (e) {
                console.error('Error', e);
            }
        }

        setConverted(results);
        setProgress(100);
        eta.complete();
        setIsProcessing(false);

        // Add to history
        if (results.length > 0) {
            const totalOrigSize = results.reduce((sum, r) => sum + r.originalSize, 0);
            const totalNewSize = results.reduce((sum, r) => sum + r.newSize, 0);
            addToHistory({
                tool: 'Konwerter Obrazów',
                toolIcon: '🖼️',
                inputFiles: files.map(f => f.file.name),
                outputFileName: results.length === 1 ? results[0].name : `${results.length}_obrazów.zip`,
                outputBlob: null,
                summary: `${results.length} obrazów → ${settings.format}`,
                stats: {
                    'Plików': results.length,
                    'Oszczędność': `${Math.round((1 - totalNewSize / totalOrigSize) * 100)}%`
                }
            });

            // Update stats counter
            recordUsage('converter', results.length);

            addNotification('success', 'Konwersja zakończona', `Pomyślnie skonwertowano ${results.length} obrazów.`);
        }
    };

    const loadImage = (file: File): Promise<HTMLImageElement> => {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => resolve(img);
            img.onerror = reject;
            img.src = URL.createObjectURL(file);
        });
    };

    const downloadAll = async () => {
        if (converted.length === 0) return;

        // If only 1 file OR ZIP mode is off, download individually
        if (converted.length === 1 || !settings.packAsZip) {
            converted.forEach(img => {
                const a = document.createElement('a');
                a.href = img.url;
                a.download = img.name;
                a.click();
            });
            return;
        }

        // Create ZIP for multiple files
        setIsLoading(true);
        setLoadingText('📦 Pakowanie do ZIP...');

        try {
            const zip = new JSZip();

            // Add each converted image to the ZIP
            for (let i = 0; i < converted.length; i++) {
                const img = converted[i];
                setLoadingText(`📦 Pakowanie ${i + 1}/${converted.length}...`);

                // Fetch blob from URL
                const response = await fetch(img.url);
                const blob = await response.blob();

                zip.file(img.name, blob);
            }

            setLoadingText('📦 Generowanie archiwum ZIP...');

            // Generate ZIP and download
            const zipBlob = await zip.generateAsync({ type: 'blob' });
            const zipUrl = URL.createObjectURL(zipBlob);

            const a = document.createElement('a');
            a.href = zipUrl;
            a.download = `konwersja_${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();

            URL.revokeObjectURL(zipUrl);
        } catch (error) {
            console.error('Error creating ZIP:', error);
            // Fallback to individual downloads
            converted.forEach(img => {
                const a = document.createElement('a');
                a.href = img.url;
                a.download = img.name;
                a.click();
            });
        } finally {
            setIsLoading(false);
            setLoadingText('');
        }
    };

    const formatBytes = (bytes: number) => {
        if (bytes < 1024) return `${bytes} B`;
        if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
        return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    };

    const totalOriginal = files.reduce((a, f) => a + f.file.size, 0);
    const totalConverted = converted.reduce((a, c) => a + c.newSize, 0);

    return (
        <div className="flex flex-col gap-6">
            <ToolHeader
                title="Konwerter Obrazów"
                description="Konwertuj zdjęcia pomiędzy formatami (JPG, PNG, WEBP, GIF, BMP). Obsługuje konwersję wsadową i zmianę rozmiaru."
                icon="🖼️"
            />

            {/* Loading/Processing Overlay */}
            {(isProcessing || isLoading) && (
                <div className="upload-progress-overlay">
                    <div className="upload-progress-spinner" />
                    {isProcessing && (
                        <div className="upload-progress-bar-container">
                            <div className="upload-progress-bar" style={{ width: `${progress}%` }} />
                        </div>
                    )}
                    <div className="upload-progress-text">
                        {isLoading ? loadingText : '🖼️ Konwersja obrazów...'}
                    </div>
                    {isProcessing && (
                        <div className="upload-progress-subtext">
                            {progress}% ({Math.round(progress * files.length / 100)} / {files.length})
                        </div>
                    )}
                </div>
            )}

            <ETADisplay {...eta} />

            {/* Upload Zone */}
            <Section
                actions={
                    files.length > 0 && (
                        <button
                            onClick={() => {
                                setFiles([]);
                                setConverted([]);
                            }}
                            className="text-sm text-red-500 hover:text-red-400 transition-colors flex items-center gap-1"
                        >
                            🗑️ Wyczyść wszystko
                        </button>
                    )
                }
            >
                <div className="flex justify-end mb-4">
                    <div className="flex gap-2 bg-bg-tertiary p-1 rounded-lg">
                        <button
                            onClick={() => setUploadMode('files')}
                            className={`px-3 py-1.5 rounded-md text-sm transition-all ${uploadMode === 'files' ? 'bg-accent text-black font-medium shadow-lg' : 'text-text-muted hover:text-text-white'}`}
                        >
                            Pliki
                        </button>
                        <button
                            onClick={() => setUploadMode('folder')}
                            className={`px-3 py-1.5 rounded-md text-sm transition-all ${uploadMode === 'folder' ? 'bg-accent text-black font-medium shadow-lg' : 'text-text-muted hover:text-text-white'}`}
                        >
                            Folder
                        </button>
                    </div>
                </div>

                <FileUpload
                    onFilesSelect={handleFilesSelected}
                    accept="image/*,.zip"
                    multiple={true}
                    directory={uploadMode === 'folder'}
                    label={uploadMode === 'folder' ? "Wybierz folder z obrazami" : "Wgraj obrazy"}
                    sublabel="Obsługujemy JPG, PNG, WEBP, GIF, BMP. Możesz wgrać wiele plików naraz."
                    icon={uploadMode === 'folder' ? "📁" : "🖼️"}
                    isLoading={isLoading}
                    loadingText={loadingText}
                />
            </Section>

            {/* File Preview Grid */}
            {files.length > 0 && (
                <Section
                    title={`📁 Pliki (${files.length})`}
                    actions={
                        <span className="text-sm text-text-muted">
                            {formatBytes(totalOriginal)}
                        </span>
                    }
                >
                    <div className="file-grid">
                        {files.slice(0, 50).map((f, i) => (
                            <div key={i} className="file-item group" onClick={() => removeFile(i)}>
                                <img src={f.preview} alt={f.file.name} />
                                <div className="file-overlay flex items-center justify-center bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button className="btn-icon danger rounded-full bg-white/10 backdrop-blur-sm p-2">
                                        ✕
                                    </button>
                                </div>
                            </div>
                        ))}
                        {files.length > 50 && (
                            <div className="file-item flex items-center justify-center bg-bg-card text-text-muted text-sm">
                                +{files.length - 50} więcej
                            </div>
                        )}
                    </div>
                </Section>
            )}

            {/* Presets */}
            <Section
                title="📋 Presety i Historia zmian"
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
                <PresetSelector
                    toolId="image-converter"
                    toolIcon="🖼️"
                    onSelect={(s) => setSettings(s as any, 'Apply preset')}
                    currentSettings={settings}
                />
            </Section>

            {/* Settings Section */}
            <Section title="⚙️ Ustawienia konwersji">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    <div>
                        <div className="text-sm text-text-muted mb-2">Format wyjściowy</div>
                        <div className="filter-pills">
                            {FORMATS.map(f => (
                                <button
                                    key={f}
                                    onClick={() => setSettings({ ...settings, format: f }, `Change format to ${f}`)}
                                    className={`filter-pill ${settings.format === f ? 'active' : ''}`}
                                >
                                    {f}
                                </button>
                            ))}
                        </div>
                    </div>
                    <div>
                        <div className="text-sm text-text-muted mb-2">Nazewnictwo plików</div>
                        <div className="flex flex-col gap-2">
                            <label className={`flex items-center gap-2 text-sm cursor-pointer ${settings.namingOption === 'keep' ? 'text-accent' : 'text-text-gray'}`}>
                                <input
                                    type="radio"
                                    name="naming"
                                    checked={settings.namingOption === 'keep'}
                                    onChange={() => setSettings({ ...settings, namingOption: 'keep' }, 'Set naming to Keep')}
                                    className="accent-accent"
                                />
                                Zachowaj nazwy
                            </label>
                            <label className={`flex items-center gap-2 text-sm cursor-pointer ${settings.namingOption === 'random' ? 'text-accent' : 'text-text-gray'}`}>
                                <input
                                    type="radio"
                                    name="naming"
                                    checked={settings.namingOption === 'random'}
                                    onChange={() => setSettings({ ...settings, namingOption: 'random' }, 'Set naming to Random')}
                                    className="accent-accent"
                                />
                                Losowe nazwy
                            </label>
                        </div>
                    </div>
                </div>

                <div className="mt-6">
                    <div className="flex justify-between mb-2">
                        <span className="text-sm text-text-muted">Jakość</span>
                        <span className="text-sm text-accent font-semibold">{settings.quality}%</span>
                    </div>
                    <input
                        type="range"
                        min={10}
                        max={100}
                        value={settings.quality}
                        onChange={e => setSettings({ ...settings, quality: Number(e.target.value) }, 'Change quality')}
                        className="w-full accent-accent"
                    />
                </div>

                {/* Progress Bar */}
                {isProcessing && (
                    <div className="mt-4">
                        <div className="flex justify-between mb-2">
                            <span className="text-text-gray">Konwersja...</span>
                            <span className="text-accent font-semibold">{progress}%</span>
                        </div>
                        <div className="progress-bar">
                            <div className="progress-fill" style={{ width: `${progress}%` }} />
                        </div>
                    </div>
                )}

                {/* Main Actions */}
                <div className="flex gap-3 flex-wrap items-center mt-6">
                    <button
                        onClick={convertImages}
                        disabled={files.length === 0 || isProcessing}
                        className="btn btn-primary"
                    >
                        {isProcessing ? `⏳ ${progress}%` : '🔄 Konwertuj'}
                    </button>
                    {converted.length > 0 && (
                        <>
                            <button onClick={downloadAll} className="btn btn-secondary" disabled={isLoading}>
                                {settings.packAsZip && converted.length > 1 ? '📦 Pobierz ZIP' : '⬇️ Pobierz'} ({converted.length})
                            </button>
                            {converted.length > 1 && (
                                <label className="flex items-center gap-2 text-sm text-text-muted cursor-pointer ml-2">
                                    <input
                                        type="checkbox"
                                        checked={settings.packAsZip}
                                        onChange={(e) => setSettings({ ...settings, packAsZip: e.target.checked }, e.target.checked ? 'Enable ZIP packing' : 'Disable ZIP packing')}
                                        className="accent-accent"
                                    />
                                    Pakuj do ZIP
                                </label>
                            )}
                        </>
                    )}
                </div>
            </Section>

            {/* Results Section */}
            {converted.length > 0 && (
                <Section
                    title={`✅ Skonwertowane (${converted.length})`}
                    actions={
                        totalOriginal - totalConverted > 0 ? (
                            <span className="text-accent text-sm">
                                Oszczędność: {formatBytes(totalOriginal - totalConverted)} ({Math.round((1 - totalConverted / totalOriginal) * 100)}%)
                            </span>
                        ) : (
                            <span className="text-yellow-500 text-sm">
                                +{formatBytes(totalConverted - totalOriginal)}
                            </span>
                        )
                    }
                >
                    <div className="file-grid">
                        {converted.slice(0, 50).map((img, i) => (
                            <div key={i} className="file-item group relative">
                                <img src={img.url} alt={img.name} />
                                <div className="file-overlay flex flex-col items-center justify-center gap-2 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity">
                                    <button
                                        onClick={() => setCompareIndex(i)}
                                        className="px-3 py-1.5 bg-accent text-black rounded text-xs font-semibold hover:bg-accent-hover transition-colors"
                                    >
                                        🔍 Porównaj
                                    </button>
                                    <a
                                        href={img.url}
                                        download={img.name}
                                        className="px-3 py-1.5 bg-white text-black rounded text-xs font-semibold hover:bg-gray-200 transition-colors no-underline"
                                    >
                                        ⬇️ Pobierz
                                    </a>
                                </div>
                            </div>
                        ))}
                    </div>
                </Section>
            )}

            {/* Tips Section */}
            <Section title="💡 Porady i wskazówki">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-accent">📁 Przetwarzanie folderów</h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                            Możesz przeciągnąć cały folder z obrazami lub plik ZIP. Narzędzie automatycznie wypakuje i przygotuje wszystkie zdjęcia do konwersji.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-accent">⚡ Skróty klawiszowe</h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                            Używaj <kbd className="bg-bg-tertiary px-1 rounded">Ctrl+Z</kbd> aby cofnąć zmiany w ustawieniach i <kbd className="bg-bg-tertiary px-1 rounded">Ctrl+Y</kbd> aby je ponowić.
                        </p>
                    </div>
                    <div>
                        <h4 className="text-sm font-semibold mb-2 text-accent">🖼️ Wybór formatu</h4>
                        <p className="text-xs text-text-muted leading-relaxed">
                            <b>WEBP</b> oferuje najlepszą kompresję przy zachowaniu jakości. <b>PNG</b> jest idealny dla grafik z przezroczystością, a <b>JPG</b> dla zdjęć fotograficznych.
                        </p>
                    </div>
                </div>
            </Section>

            {/* Compare Modal */}
            {compareIndex !== null && converted[compareIndex] && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    <div
                        className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        onClick={() => setCompareIndex(null)}
                    />
                    <div className="relative bg-bg-secondary rounded-xl w-full max-w-6xl max-h-[90vh] overflow-hidden flex flex-col shadow-2xl border border-border">
                        <div className="flex justify-between items-center p-4 border-b border-border bg-bg-card">
                            <h3 className="text-lg font-semibold">🔍 Porównanie: {converted[compareIndex].name}</h3>
                            <button
                                onClick={() => setCompareIndex(null)}
                                className="btn-icon hover:bg-bg-tertiary rounded-lg transition-colors"
                            >
                                ✕
                            </button>
                        </div>
                        <div className="flex-1 overflow-auto p-6 bg-bg-main/50">
                            <BeforeAfterSlider
                                beforeImage={converted[compareIndex].originalUrl}
                                afterImage={converted[compareIndex].url}
                                beforeLabel="Oryginał"
                                afterLabel={settings.format}
                                beforeSize={converted[compareIndex].originalSize}
                                afterSize={converted[compareIndex].newSize}
                            />
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
