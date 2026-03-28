'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import BeforeAfterSlider from '@/components/BeforeAfterSlider';
import { useHistory } from '@/components/History';
import { useDroppedFile } from '@/components/DroppedFileContext';
import { useStats } from '@/components/Stats';
import JSZip from 'jszip';
import { downloadFiles } from '@/lib/downloads';

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

function splitFileName(name: string): { base: string; ext: string } {
    const lastDot = name.lastIndexOf('.');
    if (lastDot <= 0) {
        return { base: name, ext: '' };
    }
    return {
        base: name.slice(0, lastDot),
        ext: name.slice(lastDot),
    };
}

function ensureUniqueName(name: string, usedNames: Map<string, number>): string {
    const currentCount = usedNames.get(name) || 0;
    if (currentCount === 0) {
        usedNames.set(name, 1);
        return name;
    }

    const { base, ext } = splitFileName(name);
    let nextIndex = currentCount + 1;
    let candidate = `${base}_${nextIndex}${ext}`;

    while (usedNames.has(candidate)) {
        nextIndex += 1;
        candidate = `${base}_${nextIndex}${ext}`;
    }

    usedNames.set(name, nextIndex);
    usedNames.set(candidate, 1);
    return candidate;
}

function getZipEntryOutputName(path: string, usedNames: Map<string, number>): string {
    const normalized = path.replace(/^\/+/, '').replace(/\\/g, '/');
    const segments = normalized.split('/').filter(Boolean);
    const rawName = segments.join('__') || path;
    return ensureUniqueName(rawName, usedNames);
}

async function readAllDirectoryEntries(
    dirReader: FileSystemDirectoryReader,
): Promise<FileSystemEntry[]> {
    const allEntries: FileSystemEntry[] = [];

    while (true) {
        const batch = await new Promise<FileSystemEntry[]>((resolve, reject) => {
            dirReader.readEntries(resolve, reject);
        });

        if (batch.length === 0) {
            return allEntries;
        }

        allEntries.push(...batch);
    }
}

export default function ImageConverter() {
    const [files, setFiles] = useState<FilePreview[]>([]);
    const [format, setFormat] = useState('WEBP');
    const [quality, setQuality] = useState(85);
    const [converted, setConverted] = useState<ConvertedImage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [namingOption, setNamingOption] = useState<'keep' | 'random'>('keep');
    const [uploadMode, setUploadMode] = useState<'folder' | 'files'>('files');
    const [inputSource, setInputSource] = useState<'files' | 'folder' | 'zip' | 'mixed' | null>(null);
    const [compareIndex, setCompareIndex] = useState<number | null>(null);
    const [processingErrors, setProcessingErrors] = useState<string[]>([]);

    // ZIP export option
    const [packAsZip, setPackAsZip] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const zipInputRef = useRef<HTMLInputElement>(null);

    const { addToHistory } = useHistory();
    const { consumeDroppedFile } = useDroppedFile();
    const { recordUsage } = useStats();

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

    const updateInputSource = useCallback((selectedFiles: File[], mode: 'files' | 'folder') => {
        const hasZip = selectedFiles.some(file => file.name.toLowerCase().endsWith('.zip'));
        const hasImages = selectedFiles.some(file => file.type.startsWith('image/'));

        if (mode === 'folder') {
            setInputSource('folder');
            setPackAsZip(selectedFiles.length > 1);
            return;
        }

        if (hasZip && hasImages) {
            setInputSource('mixed');
            setPackAsZip(true);
            return;
        }

        if (hasZip) {
            setInputSource('zip');
            setPackAsZip(true);
            return;
        }

        if (hasImages) {
            setInputSource('files');
            setPackAsZip(selectedFiles.length > 1);
        }
    }, []);

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
            const usedNames = new Map<string, number>();

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
                const fileName = getZipEntryOutputName(path, usedNames);
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
                readAllDirectoryEntries(dirReader).then(async entries => {
                    const files: File[] = [];
                    for (const entry of entries) {
                        const subFiles = await traverseFileTree(entry);
                        files.push(...subFiles);
                    }
                    resolve(files);
                }).catch(() => resolve([]));
            } else {
                resolve([]);
            }
        });
    };

    // Wrapper to show loading before processing files
    const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;
        updateInputSource(selectedFiles, 'files');
        setProcessingErrors([]);

        setIsLoading(true);
        setLoadingText(`📂 Wczytywanie ${selectedFiles.length} plików...`);

        await new Promise(resolve => setTimeout(resolve, 50));
        setLoadingText('📸 Tworzenie podglądów...');

        try {
            await addFilesWithZip(selectedFiles);
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const handleFolderSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;
        updateInputSource(selectedFiles, 'folder');
        setProcessingErrors([]);

        setIsLoading(true);
        setLoadingText(`📁 Wczytywanie folderu (${selectedFiles.length} plików)...`);

        await new Promise(resolve => setTimeout(resolve, 50));
        setLoadingText('📸 Tworzenie podglądów...');

        try {
            await addFilesWithZip(selectedFiles);
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const handleZipSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFiles = Array.from(e.target.files || []);
        if (selectedFiles.length === 0) return;
        updateInputSource(selectedFiles, 'files');
        setUploadMode('files');
        setProcessingErrors([]);

        setIsLoading(true);
        setLoadingText(`📦 Wczytywanie ${selectedFiles.length} archiwów ZIP...`);

        await new Promise(resolve => setTimeout(resolve, 50));
        setLoadingText('📸 Rozpakowywanie i tworzenie podglądów...');

        try {
            await addFilesWithZip(selectedFiles);
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
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
        if (namingOption === 'random') {
            return `${generateRandomName()}.${fmt}`;
        }
        return originalName.replace(/\.[^.]+$/, `.${fmt}`);
    };

    const convertImages = async () => {
        if (files.length === 0) return;
        setIsProcessing(true);
        setConverted([]);
        setProcessingErrors([]);
        const results: ConvertedImage[] = [];
        const failedFiles: string[] = [];
        const usedOutputNames = new Map<string, number>();
        const fmt = format.toLowerCase();

        for (let i = 0; i < files.length; i++) {
            const { file, preview } = files[i];
            setProgress(Math.round(((i + 1) / files.length) * 100));

            try {
                const img = await loadImage(file);
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;
                canvas.width = img.width;
                canvas.height = img.height;

                // Check if target format supports transparency
                const supportsTransparency = fmt === 'png' || fmt === 'webp';

                // For formats that don't support transparency (jpg, gif, bmp),
                // fill with white background first to avoid black background
                if (!supportsTransparency) {
                    ctx.fillStyle = '#ffffff';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                }

                ctx.drawImage(img, 0, 0);

                const mimeType = fmt === 'jpg' ? 'image/jpeg' : `image/${fmt}`;
                const blob = await new Promise<Blob>((resolve) => {
                    canvas.toBlob(b => resolve(b!), mimeType, quality / 100);
                });

                results.push({
                    name: ensureUniqueName(getOutputName(file.name, fmt), usedOutputNames),
                    url: URL.createObjectURL(blob),
                    originalUrl: preview,
                    originalSize: file.size,
                    newSize: blob.size,
                });
            } catch (e) {
                console.error('Error converting file', file.name, e);
                failedFiles.push(file.name);
            }
        }

        setConverted(results);
        setProcessingErrors(failedFiles);
        setProgress(100);
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
                summary: `${results.length} obrazów → ${format}`,
                stats: {
                    'Plików': results.length,
                    'Oszczędność': `${Math.round((1 - totalNewSize / totalOrigSize) * 100)}%`
                }
            });

            // Update stats counter
            recordUsage('converter', results.length);
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
        if (converted.length === 1 || !packAsZip) {
            setIsLoading(true);
            setLoadingText(converted.length === 1 ? '⬇️ Pobieranie pliku...' : '📁 Wybierz folder docelowy...');

            try {
                const mode = await downloadFiles(
                    converted.map(img => ({ name: img.name, url: img.url })),
                    setLoadingText,
                );

                if (mode === 'browser' && converted.length > 20) {
                    alert('Przeglądarka może ograniczać masowe pobieranie pojedynczych plików. Jeśli chcesz pobrać bardzo dużo obrazów naraz, najlepiej zostawić pakowanie do ZIP albo wybrać folder zapisu, gdy przeglądarka o to poprosi.');
                }
            } finally {
                setIsLoading(false);
                setLoadingText('');
            }
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

    const openFilePicker = useCallback(() => {
        fileInputRef.current?.click();
    }, []);

    const openFolderPicker = useCallback(() => {
        folderInputRef.current?.click();
    }, []);

    const openZipPicker = useCallback(() => {
        zipInputRef.current?.click();
    }, []);

    return (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
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
            {/* Upload Zone */}
            <div
                className={`upload-zone ${files.length > 0 ? 'has-files' : ''} ${isDragging ? 'dragging' : ''}`}
                onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={handleDrop}
            >
                <input
                    type="file"
                    id="img-input"
                    ref={fileInputRef}
                    accept="image/*,.zip"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <input
                    type="file"
                    id="folder-input"
                    ref={folderInputRef}
                    // @ts-expect-error webkitdirectory is not in types
                    webkitdirectory=""
                    multiple
                    className="hidden"
                    onChange={handleFolderSelect}
                />
                <input
                    type="file"
                    id="zip-input"
                    ref={zipInputRef}
                    accept=".zip,application/zip"
                    multiple
                    className="hidden"
                    onChange={handleZipSelect}
                />
                <span className="icon" style={{ pointerEvents: 'none' }}>🖼️</span>
                <p className="title" style={{ pointerEvents: 'none' }}>
                    {files.length > 0 ? `${files.length} obrazów wybranych` : 'Przeciągnij obrazy lub folder tutaj'}
                </p>
                <p className="subtitle" style={{ marginBottom: inputSource ? '0.5rem' : '1rem', pointerEvents: 'none' }}>uzyj przyciskow ponizej albo wrzuc ZIP</p>
                {inputSource && (
                    <p className="subtitle" style={{ marginBottom: '1rem', color: 'var(--accent)', pointerEvents: 'none' }}>
                        Wejście: {inputSource === 'folder' ? 'folder' : inputSource === 'zip' ? 'ZIP' : inputSource === 'mixed' ? 'pliki + ZIP' : 'pliki'} | Wyjście: {packAsZip ? 'ZIP' : 'pojedyncze pliki'}
                    </p>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setUploadMode('files');
                            openFilePicker();
                        }}
                        className={`btn ${uploadMode === 'files' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        🖼️ Wybierz pliki
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setUploadMode('folder');
                            openFolderPicker();
                        }}
                        className={`btn ${uploadMode === 'folder' ? 'btn-primary' : 'btn-secondary'}`}
                    >
                        📁 Wybierz folder
                    </button>
                    <button
                        type="button"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openZipPicker();
                        }}
                        className="btn btn-secondary"
                    >
                        📦 Wybierz ZIP
                    </button>
                    {files.length > 0 && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                setFiles([]);
                                setConverted([]);
                                setInputSource(null);
                                setProcessingErrors([]);
                            }}
                            className="btn btn-secondary"
                            style={{ background: 'var(--bg-tertiary)' }}
                        >
                            🗑️ Wyczyść
                        </button>
                    )}
                </div>
            </div>

            {/* File Preview Grid */}
            {files.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span>📁 Pliki ({files.length})</span>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                            {formatBytes(totalOriginal)}
                        </span>
                    </div>
                    <div className="card-body">
                        <div className="file-grid">
                            {files.slice(0, 50).map((f, i) => (
                                <div key={i} className="file-item" onClick={() => removeFile(i)}>
                                    <img src={f.preview} alt={f.file.name} />
                                    <div className="file-overlay">
                                        <span style={{ fontSize: '1.25rem' }}>✕</span>
                                    </div>
                                </div>
                            ))}
                            {files.length > 50 && (
                                <div className="file-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--bg-card)' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>+{files.length - 50} więcej</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {processingErrors.length > 0 && (
                <div className="card" style={{ borderColor: '#f59e0b' }}>
                    <div className="card-header">
                        <span>⚠️ Pominięte pliki ({processingErrors.length})</span>
                    </div>
                    <div className="card-body" style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>
                        {processingErrors.slice(0, 10).join(', ')}
                        {processingErrors.length > 10 ? ` i jeszcze ${processingErrors.length - 10}` : ''}
                    </div>
                </div>
            )}

            {/* Format Selection */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
                        <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Format wyjściowy</span>
                        <button
                            onClick={() => { setFormat('WEBP'); setQuality(85); setNamingOption('keep'); }}
                            title="Resetuj ustawienia"
                            style={{
                                padding: '0.2rem 0.4rem',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                borderRadius: '4px',
                                cursor: 'pointer',
                                fontSize: '0.7rem',
                                color: 'var(--text-gray)',
                            }}
                        >
                            🔄
                        </button>
                    </div>
                    <div className="filter-pills">
                        {FORMATS.map(f => (
                            <button
                                key={f}
                                onClick={() => setFormat(f)}
                                className={`filter-pill ${format === f ? 'active' : ''}`}
                            >
                                {f}
                            </button>
                        ))}
                    </div>
                </div>
                <div>
                    <div style={{ marginBottom: '0.5rem', fontSize: '0.875rem', color: 'var(--text-muted)' }}>Nazewnictwo plików</div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', color: namingOption === 'keep' ? 'var(--accent)' : 'var(--text-gray)' }}>
                            <input
                                type="radio"
                                name="naming"
                                checked={namingOption === 'keep'}
                                onChange={() => setNamingOption('keep')}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            Zachowaj nazwy
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '0.875rem', cursor: 'pointer', color: namingOption === 'random' ? 'var(--accent)' : 'var(--text-gray)' }}>
                            <input
                                type="radio"
                                name="naming"
                                checked={namingOption === 'random'}
                                onChange={() => setNamingOption('random')}
                                style={{ accentColor: 'var(--accent)' }}
                            />
                            Losowe nazwy
                        </label>
                    </div>
                </div>
            </div>

            {/* Quality Slider */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Jakość</span>
                    <span style={{ fontSize: '0.875rem', color: 'var(--accent)', fontWeight: 600 }}>{quality}%</span>
                </div>
                <input
                    type="range"
                    min={10}
                    max={100}
                    value={quality}
                    onChange={e => setQuality(Number(e.target.value))}
                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                />
            </div>

            {/* Progress */}
            {isProcessing && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-gray)' }}>Konwersja...</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{progress}%</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
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
                            {packAsZip && converted.length > 1 ? '📦 Pobierz ZIP' : '⬇️ Pobierz'} ({converted.length})
                        </button>
                        {converted.length > 1 && (
                            <label style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                fontSize: '0.85rem',
                                color: 'var(--text-muted)',
                                cursor: 'pointer'
                            }}>
                                <input
                                    type="checkbox"
                                    checked={packAsZip}
                                    onChange={(e) => setPackAsZip(e.target.checked)}
                                    style={{ accentColor: 'var(--accent)' }}
                                />
                                Pakuj do ZIP
                            </label>
                        )}
                    </>
                )}
            </div>

            {/* Results */}
            {converted.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span>✅ Skonwertowane ({converted.length})</span>
                        {totalOriginal - totalConverted > 0 ? (
                            <span style={{ color: 'var(--accent)' }}>
                                Oszczędność: {formatBytes(totalOriginal - totalConverted)} ({Math.round((1 - totalConverted / totalOriginal) * 100)}%)
                            </span>
                        ) : (
                            <span style={{ color: '#f59e0b' }}>
                                +{formatBytes(totalConverted - totalOriginal)}
                            </span>
                        )}
                    </div>
                    <div className="card-body">
                        <div className="file-grid">
                            {converted.slice(0, 50).map((img, i) => (
                                <div key={i} className="file-item" style={{ position: 'relative' }}>
                                    <img src={img.url} alt={img.name} />
                                    <div className="file-overlay" style={{ justifyContent: 'center', alignItems: 'center', gap: '0.5rem' }}>
                                        <button
                                            onClick={() => setCompareIndex(i)}
                                            style={{
                                                padding: '0.4rem 0.6rem',
                                                background: 'var(--accent)',
                                                color: 'black',
                                                border: 'none',
                                                borderRadius: '4px',
                                                cursor: 'pointer',
                                                fontSize: '0.7rem',
                                                fontWeight: 600
                                            }}
                                        >
                                            🔍 Porównaj
                                        </button>
                                        <a
                                            href={img.url}
                                            download={img.name}
                                            style={{
                                                padding: '0.4rem 0.6rem',
                                                background: 'white',
                                                color: 'black',
                                                borderRadius: '4px',
                                                fontSize: '0.7rem',
                                                fontWeight: 600,
                                                textDecoration: 'none'
                                            }}
                                        >
                                            ⬇️ Pobierz
                                        </a>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </div>
            )}

            {/* Compare Modal */}
            {compareIndex !== null && converted[compareIndex] && (
                <>
                    <div
                        onClick={() => setCompareIndex(null)}
                        style={{
                            position: 'fixed',
                            top: 0,
                            left: 0,
                            right: 0,
                            bottom: 0,
                            background: 'rgba(0,0,0,0.8)',
                            zIndex: 1000
                        }}
                    />
                    <div style={{
                        position: 'fixed',
                        top: '50%',
                        left: '50%',
                        transform: 'translate(-50%, -50%)',
                        width: '95vw',
                        maxWidth: '1200px',
                        maxHeight: '90vh',
                        background: 'var(--bg-secondary)',
                        borderRadius: '12px',
                        padding: '1.5rem',
                        zIndex: 1001,
                        overflow: 'auto'
                    }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
                            <h3 style={{ margin: 0, fontSize: '1rem' }}>🔍 Porównanie: {converted[compareIndex].name}</h3>
                            <button
                                onClick={() => setCompareIndex(null)}
                                style={{
                                    background: 'transparent',
                                    border: 'none',
                                    color: 'var(--text-muted)',
                                    cursor: 'pointer',
                                    fontSize: '1.5rem'
                                }}
                            >
                                ✕
                            </button>
                        </div>
                        <BeforeAfterSlider
                            beforeImage={converted[compareIndex].originalUrl}
                            afterImage={converted[compareIndex].url}
                            beforeLabel="Oryginał"
                            afterLabel={format}
                            beforeSize={converted[compareIndex].originalSize}
                            afterSize={converted[compareIndex].newSize}
                        />
                    </div>
                </>
            )}
        </div>
    );
}
