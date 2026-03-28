'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useStats } from '../Stats';
import { useUndoRedo, useUndoRedoKeyboard, UndoRedoButtons } from '@/hooks/useUndoRedo';
import JSZip from 'jszip';
import { downloadFiles } from '@/lib/downloads';

interface FilePreview {
    file: File;
    preview: string;
}

interface ProcessedImage {
    name: string;
    url: string;
    originalSize: { w: number; h: number };
    newSize: { w: number; h: number };
}

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

const PLATFORMS = [
    { id: 'original', label: 'Oryginał', icon: '📐', width: 0, height: 0 },
    { id: 'allegro', label: 'Allegro', icon: '🛒', width: 1000, height: 1000 },
    { id: 'empik', label: 'Empik', icon: '📚', width: 800, height: 800 },
    { id: 'shopify', label: 'Shopify', icon: '🛍️', width: 2048, height: 2048 },
    { id: 'amazon', label: 'Amazon', icon: '📦', width: 1000, height: 1000 },
    { id: 'instagram', label: 'Instagram', icon: '📸', width: 1080, height: 1080 },
    { id: 'wlasny', label: 'Własny', icon: '✏️', width: 0, height: 0 },
];

const BG_COLORS = [
    { id: 'original', color: 'keep', label: 'Oryginalne' },
    { id: 'transparent', color: 'transparent', label: 'Przezroczyste' },
    { id: 'white', color: '#ffffff', label: 'Białe' },
    { id: 'black', color: '#000000', label: 'Czarne' },
    { id: 'custom', color: '', label: 'Własne' },
];

export default function ProductCropper() {
    const [files, setFiles] = useState<FilePreview[]>([]);
    const [platform, setPlatform] = useState('original');
    const [customWidth, setCustomWidth] = useState(1000);
    const [customHeight, setCustomHeight] = useState(1000);
    const [bgOption, setBgOption] = useState('original');
    const [customBgColor, setCustomBgColor] = useState('#ffffff');
    const [processed, setProcessed] = useState<ProcessedImage[]>([]);
    const [isProcessing, setIsProcessing] = useState(false);
    const [progress, setProgress] = useState(0);
    const [isDragging, setIsDragging] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const [loadingText, setLoadingText] = useState('');
    const [uploadMode, setUploadMode] = useState<'folder' | 'files'>('files');
    const [inputSource, setInputSource] = useState<'files' | 'folder' | 'zip' | 'mixed' | null>(null);
    const [processingErrors, setProcessingErrors] = useState<string[]>([]);

    // Stats tracking
    const { recordUsage } = useStats();

    // Format options
    const [outputFormat, setOutputFormat] = useState<'original' | 'jpg' | 'png' | 'webp'>('original');

    // Manual crop mode
    const [manualCropMode, setManualCropMode] = useState(false);
    const [currentEditIndex, setCurrentEditIndex] = useState(0);
    const [cropAreas, setCropAreas] = useState<{ left: number; top: number; right: number; bottom: number }[]>([]);

    // Helper to get current crop area
    const getCurrentCropArea = () => cropAreas[currentEditIndex] || { left: 0, top: 0, right: 100, bottom: 100 };

    // Helper to set current crop area
    const setCurrentCropArea = (area: { left: number; top: number; right: number; bottom: number }) => {
        setCropAreas(prev => {
            const newAreas = [...prev];
            newAreas[currentEditIndex] = area;
            return newAreas;
        });
    };

    // Alias for backward compatibility
    const cropArea = getCurrentCropArea();
    const setCropArea = (updater: { left?: number; top?: number; right?: number; bottom?: number } | ((prev: { left: number; top: number; right: number; bottom: number }) => { left: number; top: number; right: number; bottom: number })) => {
        if (typeof updater === 'function') {
            setCurrentCropArea(updater(cropArea));
        } else {
            setCurrentCropArea({ ...cropArea, ...updater });
        }
    };

    // Auto-crop options (from Python script)
    const [autoCrop, setAutoCrop] = useState(false);
    const [cropTolerance, setCropTolerance] = useState(10);
    const [cropPadding, setCropPadding] = useState(10);

    // Naming options
    const [namingOption, setNamingOption] = useState<'keep' | 'suffix'>('keep');

    // ZIP export option
    const [packAsZip, setPackAsZip] = useState(true);
    const fileInputRef = useRef<HTMLInputElement>(null);
    const folderInputRef = useRef<HTMLInputElement>(null);
    const zipInputRef = useRef<HTMLInputElement>(null);

    // Drag state for crop box
    const [dragCorner, setDragCorner] = useState<'tl' | 'tr' | 'bl' | 'br' | 'move' | null>(null);
    const cropContainerRef = useRef<HTMLDivElement>(null);

    // Handle mouse move for crop drag
    const handleCropMouseMove = useCallback((e: React.MouseEvent) => {
        if (!dragCorner || !cropContainerRef.current) return;

        const rect = cropContainerRef.current.getBoundingClientRect();
        const x = Math.max(0, Math.min(100, ((e.clientX - rect.left) / rect.width) * 100));
        const y = Math.max(0, Math.min(100, ((e.clientY - rect.top) / rect.height) * 100));

        setCropArea(prev => {
            const minSize = 10; // Minimum 10% size
            switch (dragCorner) {
                case 'tl':
                    return {
                        ...prev,
                        left: Math.min(x, prev.right - minSize),
                        top: Math.min(y, prev.bottom - minSize)
                    };
                case 'tr':
                    return {
                        ...prev,
                        right: Math.max(x, prev.left + minSize),
                        top: Math.min(y, prev.bottom - minSize)
                    };
                case 'bl':
                    return {
                        ...prev,
                        left: Math.min(x, prev.right - minSize),
                        bottom: Math.max(y, prev.top + minSize)
                    };
                case 'br':
                    return {
                        ...prev,
                        right: Math.max(x, prev.left + minSize),
                        bottom: Math.max(y, prev.top + minSize)
                    };
                default:
                    return prev;
            }
        });
    }, [dragCorner, setCropArea]);

    const handleCropMouseUp = useCallback(() => {
        setDragCorner(null);
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

    const addFiles = useCallback(async (newFiles: File[]) => {
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
        const totalBatches = Math.ceil(imageFiles.length / BATCH_SIZE);

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

        // addFiles handles ZIP extraction and sets isLoading(false) when done
        await addFiles(allFiles);
    }, [addFiles]);

    const traverseFileTree = (item: FileSystemEntry): Promise<File[]> => {
        return new Promise((resolve) => {
            if (item.isFile) {
                (item as FileSystemFileEntry).file(file => resolve([file]));
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

        // Small delay to render loading UI
        await new Promise(resolve => setTimeout(resolve, 50));

        try {
            await addFiles(selectedFiles);
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
            await addFiles(selectedFiles);
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
            await addFiles(selectedFiles);
        } finally {
            setIsLoading(false);
            e.target.value = '';
        }
    };

    const getPlatformSize = () => {
        if (platform === 'wlasny') return { width: customWidth, height: customHeight };
        return PLATFORMS.find(p => p.id === platform) || { width: 1000, height: 1000 };
    };

    const getBackgroundColor = () => {
        if (bgOption === 'custom') return customBgColor;
        const bg = BG_COLORS.find(b => b.id === bgOption);
        return bg?.color || '#ffffff';
    };

    // Improved auto-crop - specifically for white backgrounds
    // Uses edge sampling to detect background color more accurately
    const autoCropImage = (
        imgData: ImageData,
        tolerance: number,
        padding: number
    ): { left: number; top: number; right: number; bottom: number } | null => {
        const { width, height, data } = imgData;

        // Sample background from all edges (not just corners)
        // This is more robust when products are near corners
        const samples: number[][] = [];
        const sampleCount = 10; // samples per edge

        // Top edge
        for (let i = 0; i < sampleCount; i++) {
            const x = Math.floor((i / sampleCount) * width);
            const idx = x * 4;
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
        // Bottom edge
        for (let i = 0; i < sampleCount; i++) {
            const x = Math.floor((i / sampleCount) * width);
            const idx = ((height - 1) * width + x) * 4;
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
        // Left edge
        for (let i = 0; i < sampleCount; i++) {
            const y = Math.floor((i / sampleCount) * height);
            const idx = (y * width) * 4;
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }
        // Right edge
        for (let i = 0; i < sampleCount; i++) {
            const y = Math.floor((i / sampleCount) * height);
            const idx = (y * width + width - 1) * 4;
            samples.push([data[idx], data[idx + 1], data[idx + 2]]);
        }

        // Calculate median background color (more robust than average)
        samples.sort((a, b) => (a[0] + a[1] + a[2]) - (b[0] + b[1] + b[2]));
        const medianIdx = Math.floor(samples.length / 2);
        const bgR = samples[medianIdx][0];
        const bgG = samples[medianIdx][1];
        const bgB = samples[medianIdx][2];

        // Relaxed white detection (220 instead of 230)
        const isLikelyWhite = bgR > 220 && bgG > 220 && bgB > 220;
        const targetR = isLikelyWhite ? 255 : bgR;
        const targetG = isLikelyWhite ? 255 : bgG;
        const targetB = isLikelyWhite ? 255 : bgB;

        let minX = width, minY = height, maxX = 0, maxY = 0;

        // More aggressive tolerance for white backgrounds
        // For white: higher tolerance to catch shadows and gradients
        const baseTol = isLikelyWhite ? 80 : 40;
        const tol = baseTol + (tolerance * 2);

        for (let y = 0; y < height; y++) {
            for (let x = 0; x < width; x++) {
                const idx = (y * width + x) * 4;
                const r = data[idx];
                const g = data[idx + 1];
                const b = data[idx + 2];
                const a = data[idx + 3];

                // Skip transparent pixels
                if (a < 50) continue;

                // Check if pixel differs from background
                const diff = Math.abs(r - targetR) + Math.abs(g - targetG) + Math.abs(b - targetB);

                if (diff > tol) {
                    if (x < minX) minX = x;
                    if (x > maxX) maxX = x;
                    if (y < minY) minY = y;
                    if (y > maxY) maxY = y;
                }
            }
        }

        // Check if we found any content
        if (maxX <= minX || maxY <= minY) {
            console.log('Auto-crop: No content found');
            return null;
        }

        // Add padding
        minX = Math.max(0, minX - padding);
        minY = Math.max(0, minY - padding);
        maxX = Math.min(width - 1, maxX + padding);
        maxY = Math.min(height - 1, maxY + padding);

        // Only return null if the result is suspiciously tiny (likely noise)
        const croppedW = maxX - minX;
        const croppedH = maxY - minY;
        if (croppedW < 10 || croppedH < 10) {
            console.log('Auto-crop: Result too small', croppedW, croppedH);
            return null;
        }

        console.log(`Auto-crop: Found content at (${minX},${minY}) to (${maxX},${maxY}), bg: rgb(${bgR},${bgG},${bgB}), isWhite: ${isLikelyWhite}`);
        return { left: minX, top: minY, right: maxX, bottom: maxY };
    };

    const processImages = async () => {
        if (files.length === 0) return;

        setIsProcessing(true);
        setProcessed([]);
        setProcessingErrors([]);
        const results: ProcessedImage[] = [];
        const failedFiles: string[] = [];
        const usedOutputNames = new Map<string, number>();
        const platformData = getPlatformSize();
        const bgColor = getBackgroundColor();
        // 'keep' means preserve original transparency, 'transparent' means explicit transparent
        const isTransparent = bgColor === 'transparent' || bgColor === 'keep';

        let autoCropFailures = 0;

        for (let i = 0; i < files.length; i++) {
            const { file } = files[i];
            setProgress(Math.round(((i + 1) / files.length) * 100));

            try {
                const img = await loadImage(file);
                let srcX = 0, srcY = 0, srcW = img.width, srcH = img.height;

                // Get image data for auto-crop/trim operations
                const tempCanvas = document.createElement('canvas');
                tempCanvas.width = img.width;
                tempCanvas.height = img.height;
                const tempCtx = tempCanvas.getContext('2d')!;
                tempCtx.drawImage(img, 0, 0);
                const imgData = tempCtx.getImageData(0, 0, img.width, img.height);

                // Manual crop mode - apply user-defined crop area for this image
                const imageCropArea = cropAreas[i] || { left: 0, top: 0, right: 100, bottom: 100 };
                if (manualCropMode && cropAreas[i]) {
                    // Convert percentage to pixels
                    srcX = Math.round(img.width * imageCropArea.left / 100);
                    srcY = Math.round(img.height * imageCropArea.top / 100);
                    srcW = Math.round(img.width * (imageCropArea.right - imageCropArea.left) / 100);
                    srcH = Math.round(img.height * (imageCropArea.bottom - imageCropArea.top) / 100);
                }
                // Auto-crop white margins if enabled (and no manual crop set for this image)
                else if (autoCrop) {
                    const cropResult = autoCropImage(imgData, cropTolerance, cropPadding);
                    if (cropResult) {
                        srcX = cropResult.left;
                        srcY = cropResult.top;
                        srcW = cropResult.right - cropResult.left;
                        srcH = cropResult.bottom - cropResult.top;
                    } else {
                        // Auto-crop failed (no background detected or too small)
                        console.warn(`Auto-crop skipped for ${file.name}: No clear background detected or result too small.`);
                        autoCropFailures++;
                    }
                }

                // Determine output size
                let targetW: number, targetH: number;
                if (platform === 'original') {
                    // Keep size (original or after trim if autoCrop enabled)
                    targetW = srcW;
                    targetH = srcH;
                } else if (platform === 'wlasny') {
                    targetW = customWidth;
                    targetH = customHeight;
                } else {
                    targetW = platformData.width;
                    targetH = platformData.height;
                }

                // Create output canvas
                const canvas = document.createElement('canvas');
                const ctx = canvas.getContext('2d')!;
                canvas.width = targetW;
                canvas.height = targetH;

                // Fill background
                if (!isTransparent) {
                    ctx.fillStyle = bgColor;
                    ctx.fillRect(0, 0, targetW, targetH);
                }

                // Calculate scale and position
                let drawX: number, drawY: number, drawW: number, drawH: number;
                if (platform === 'original') {
                    // No scaling, just draw directly
                    drawX = 0;
                    drawY = 0;
                    drawW = srcW;
                    drawH = srcH;
                } else {
                    // Scale to fit and center
                    const scale = Math.min(targetW / srcW, targetH / srcH);
                    drawW = srcW * scale;
                    drawH = srcH * scale;
                    drawX = (targetW - drawW) / 2;
                    drawY = (targetH - drawH) / 2;
                }

                // Draw image
                ctx.drawImage(img, srcX, srcY, srcW, srcH, drawX, drawY, drawW, drawH);

                // Determine output format
                let finalFormat: string;
                let finalExt: string;

                if (outputFormat === 'original') {
                    // Preserve original format
                    const originalExt = file.name.split('.').pop()?.toLowerCase() || 'jpg';
                    if (['jpg', 'jpeg'].includes(originalExt)) {
                        // If transparent background is selected and original is JPG,
                        // force PNG to preserve transparency
                        if (isTransparent) {
                            finalFormat = 'image/png';
                            finalExt = 'png';
                        } else {
                            finalFormat = 'image/jpeg';
                            finalExt = 'jpg';
                        }
                    } else if (originalExt === 'png') {
                        finalFormat = 'image/png';
                        finalExt = 'png';
                    } else if (originalExt === 'webp') {
                        finalFormat = 'image/webp';
                        finalExt = 'webp';
                    } else {
                        // Fallback for unknown formats
                        finalFormat = isTransparent ? 'image/png' : 'image/jpeg';
                        finalExt = isTransparent ? 'png' : 'jpg';
                    }
                } else {
                    // Use selected format, but override to PNG if transparent background
                    // and selected format doesn't support transparency (jpg)
                    if (isTransparent && outputFormat === 'jpg') {
                        finalFormat = 'image/png';
                        finalExt = 'png';
                    } else {
                        switch (outputFormat) {
                            case 'jpg':
                                finalFormat = 'image/jpeg';
                                finalExt = 'jpg';
                                break;
                            case 'png':
                                finalFormat = 'image/png';
                                finalExt = 'png';
                                break;
                            case 'webp':
                                finalFormat = 'image/webp';
                                finalExt = 'webp';
                                break;
                            default:
                                finalFormat = 'image/jpeg';
                                finalExt = 'jpg';
                        }
                    }
                }

                // Generate output
                const blob = await new Promise<Blob>((resolve) => {
                    canvas.toBlob(b => resolve(b!), finalFormat, 0.92);
                });

                const baseName = file.name.replace(/\.[^.]+$/, '');
                const outputNameBase = namingOption === 'suffix'
                    ? `${baseName}_${platform}.${finalExt}`
                    : `${baseName}.${finalExt}`;

                results.push({
                    name: ensureUniqueName(outputNameBase, usedOutputNames),
                    url: URL.createObjectURL(blob),
                    originalSize: { w: img.width, h: img.height },
                    newSize: { w: targetW, h: targetH },
                });
            } catch (e) {
                console.error('Error processing', file.name, e);
                failedFiles.push(file.name);
            }
        }

        setProcessed(results);
        setProcessingErrors(failedFiles);
        setProgress(100);
        setIsProcessing(false);

        // Update stats counter
        if (results.length > 0) {
            recordUsage('cropper', results.length);
        }

        // Notify user about auto-crop failures
        if (autoCropFailures > 0) {
            alert(`⚠️ Uwaga: Dla ${autoCropFailures} zdjęć nie udało się wykryć jednolitego tła. Zostały przetworzone bez przycinania.\n\nSpróbuj zwiększyć tolerancję.`);
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
        if (processed.length === 0) return;

        // If only 1 file OR ZIP mode is off, download individually
        if (processed.length === 1 || !packAsZip) {
            setIsLoading(true);
            setLoadingText(processed.length === 1 ? '⬇️ Pobieranie pliku...' : '📁 Wybierz folder docelowy...');

            try {
                const mode = await downloadFiles(
                    processed.map(img => ({ name: img.name, url: img.url })),
                    setLoadingText,
                );

                if (mode === 'cancelled') {
                    return;
                }

                if (mode === 'browser' && processed.length > 20) {
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

            // Add each processed image to the ZIP
            for (let i = 0; i < processed.length; i++) {
                const img = processed[i];
                setLoadingText(`📦 Pakowanie ${i + 1}/${processed.length}...`);

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
            a.download = `kadrowanie_${new Date().toISOString().slice(0, 10)}.zip`;
            a.click();

            URL.revokeObjectURL(zipUrl);
        } catch (error) {
            console.error('Error creating ZIP:', error);
            // Fallback to individual downloads
            processed.forEach(img => {
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

    const clearAll = () => {
        files.forEach(f => URL.revokeObjectURL(f.preview));
        processed.forEach(p => URL.revokeObjectURL(p.url));
        setFiles([]);
        setProcessed([]);
        setInputSource(null);
        setProcessingErrors([]);
    };

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
                        {isLoading ? loadingText : '✂️ Kadrowanie zdjęć...'}
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
                    id="crop-input"
                    ref={fileInputRef}
                    accept="image/*,.zip"
                    multiple
                    className="hidden"
                    onChange={handleFileSelect}
                />
                <input
                    type="file"
                    id="crop-folder-input"
                    ref={folderInputRef}
                    // @ts-expect-error webkitdirectory not in types
                    webkitdirectory=""
                    multiple
                    className="hidden"
                    onChange={handleFolderSelect}
                />
                <input
                    type="file"
                    id="crop-zip-input"
                    ref={zipInputRef}
                    accept=".zip,application/zip"
                    multiple
                    className="hidden"
                    onChange={handleZipSelect}
                />
                <span className="icon" style={{ pointerEvents: 'none' }}>✏️</span>
                <p className="title" style={{ pointerEvents: 'none' }}>
                    {files.length > 0 ? `${files.length} zdjęć produktów` : 'Przeciągnij zdjęcia lub folder'}
                </p>
                <p className="subtitle" style={{ marginBottom: inputSource ? '0.5rem' : '1rem', pointerEvents: 'none' }}>uzyj przyciskow ponizej albo wrzuc archiwum ZIP ze zdjeciami. Przycisk plikow tez akceptuje ZIP.</p>
                {inputSource && (
                    <p className="subtitle" style={{ marginBottom: '1rem', color: 'var(--accent)', pointerEvents: 'none' }}>
                        Wejście: {inputSource === 'folder' ? 'folder' : inputSource === 'zip' ? 'ZIP' : inputSource === 'mixed' ? 'pliki + ZIP' : 'pliki'} | Wyjście: {packAsZip ? 'ZIP' : 'pojedyncze pliki'}
                    </p>
                )}

                <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', flexWrap: 'wrap' }} onClick={(e) => e.stopPropagation()}>
                    <button
                        type="button"
                        className={`btn ${uploadMode === 'files' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setUploadMode('files');
                            openFilePicker();
                        }}
                    >
                        🖼️ Pliki / ZIP
                    </button>
                    <button
                        type="button"
                        className={`btn ${uploadMode === 'folder' ? 'btn-primary' : 'btn-secondary'}`}
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            setUploadMode('folder');
                            openFolderPicker();
                        }}
                    >
                        📁 Folder
                    </button>
                    <button
                        type="button"
                        className="btn btn-secondary"
                        onClick={(e) => {
                            e.preventDefault();
                            e.stopPropagation();
                            openZipPicker();
                        }}
                    >
                        📦 Import ZIP
                    </button>
                    {files.length > 0 && (
                        <button
                            type="button"
                            onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                clearAll();
                            }}
                            className="btn btn-secondary"
                            style={{ background: 'var(--bg-tertiary)' }}
                        >
                            🗑️ Wyczyść
                        </button>
                    )}
                </div>
            </div>

            {/* File Preview */}
            {files.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span>📁 Wybrane ({files.length})</span>
                    </div>
                    <div className="card-body">
                        <div className="file-grid">
                            {files.slice(0, 20).map((f, i) => (
                                <div key={i} className="file-item" style={{ position: 'relative' }}>
                                    <img src={f.preview} alt={f.file.name} />
                                    <button
                                        onClick={() => {
                                            URL.revokeObjectURL(f.preview);
                                            setFiles(prev => prev.filter((_, index) => index !== i));
                                        }}
                                        className="file-remove-btn"
                                        style={{
                                            position: 'absolute',
                                            top: '0.5rem',
                                            right: '0.5rem',
                                            width: '2rem',
                                            height: '2rem',
                                            borderRadius: '50%',
                                            background: 'rgba(220, 38, 38, 0.9)',
                                            border: 'none',
                                            color: 'white',
                                            cursor: 'pointer',
                                            display: 'flex',
                                            alignItems: 'center',
                                            justifyContent: 'center',
                                            fontSize: '1.2rem',
                                            fontWeight: 'bold',
                                            transition: 'all 0.2s'
                                        }}
                                        onMouseOver={(e) => e.currentTarget.style.background = 'rgba(220, 38, 38, 1)'}
                                        onMouseOut={(e) => e.currentTarget.style.background = 'rgba(220, 38, 38, 0.9)'}
                                    >
                                        ×
                                    </button>
                                </div>
                            ))}
                            {files.length > 20 && (
                                <div className="file-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>+{files.length - 20}</span>
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

            {/* Platform Selection */}
            <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Preset platformy:</p>
                <div className="filter-pills">
                    {PLATFORMS.map(p => (
                        <button
                            key={p.id}
                            onClick={() => setPlatform(p.id)}
                            className={`filter-pill ${platform === p.id ? 'active' : ''}`}
                            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '2px', padding: '0.75rem 1.25rem' }}
                        >
                            <span>{p.icon} {p.label}</span>
                            {p.width > 0 && <span style={{ fontSize: '0.7rem', opacity: 0.7 }}>{p.width}×{p.height}</span>}
                        </button>
                    ))}
                </div>
            </div>

            {/* Custom Size */}
            {platform === 'wlasny' && (
                <div style={{ display: 'flex', gap: '1rem' }}>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Szerokość</label>
                        <input
                            type="number"
                            className="form-input"
                            value={customWidth}
                            onChange={e => setCustomWidth(Number(e.target.value))}
                        />
                    </div>
                    <div style={{ flex: 1 }}>
                        <label style={{ fontSize: '0.875rem', color: 'var(--text-muted)', display: 'block', marginBottom: '0.5rem' }}>Wysokość</label>
                        <input
                            type="number"
                            className="form-input"
                            value={customHeight}
                            onChange={e => setCustomHeight(Number(e.target.value))}
                        />
                    </div>
                </div>
            )}

            {/* Background Color */}
            <div>
                <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.75rem' }}>Kolor tła:</p>
                <div style={{ display: 'flex', gap: '0.75rem', alignItems: 'center', flexWrap: 'wrap' }}>
                    {BG_COLORS.map(bg => (
                        <button
                            key={bg.id}
                            onClick={() => setBgOption(bg.id)}
                            className={`filter-pill ${bgOption === bg.id ? 'active' : ''}`}
                            style={{
                                display: 'flex',
                                alignItems: 'center',
                                gap: '0.5rem',
                                padding: '0.5rem 1rem'
                            }}
                        >
                            <span
                                style={{
                                    width: '1.25rem',
                                    height: '1.25rem',
                                    borderRadius: '4px',
                                    background: bg.id === 'transparent' ? 'linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%), linear-gradient(45deg, #ddd 25%, transparent 25%, transparent 75%, #ddd 75%)' : bg.color || '#888',
                                    backgroundSize: bg.id === 'transparent' ? '8px 8px' : 'auto',
                                    backgroundPosition: bg.id === 'transparent' ? '0 0, 4px 4px' : 'auto',
                                    border: '1px solid var(--border)'
                                }}
                            />
                            {bg.label}
                        </button>
                    ))}
                    {bgOption === 'custom' && (
                        <input
                            type="color"
                            value={customBgColor}
                            onChange={e => setCustomBgColor(e.target.value)}
                            style={{ width: '2.5rem', height: '2.5rem', borderRadius: '8px', cursor: 'pointer', border: 'none' }}
                        />
                    )}
                </div>
            </div>

            {/* Output Format Selector */}
            <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.75rem' }}>
                    <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', margin: 0 }}>Format wyjściowy:</p>
                    <div style={{ display: 'flex', gap: '0.25rem' }}>
                        <button
                            onClick={() => {
                                // Simple undo: reset to defaults
                                setPlatform('original');
                                setBgOption('white');
                                setOutputFormat('original');
                            }}
                            title="Resetuj ustawienia"
                            style={{
                                padding: '0.25rem 0.5rem',
                                background: 'var(--bg-tertiary)',
                                border: '1px solid var(--border)',
                                borderRadius: '6px',
                                cursor: 'pointer',
                                fontSize: '0.75rem',
                                color: 'var(--text-gray)',
                            }}
                        >
                            🔄 Reset
                        </button>
                    </div>
                </div>
                <div className="filter-pills">
                    <button
                        onClick={() => setOutputFormat('original')}
                        className={`filter-pill ${outputFormat === 'original' ? 'active' : ''}`}
                    >
                        📄 Oryginalny
                    </button>
                    <button
                        onClick={() => setOutputFormat('jpg')}
                        className={`filter-pill ${outputFormat === 'jpg' ? 'active' : ''}`}
                    >
                        🖼️ JPG
                    </button>
                    <button
                        onClick={() => setOutputFormat('png')}
                        className={`filter-pill ${outputFormat === 'png' ? 'active' : ''}`}
                    >
                        🎨 PNG
                    </button>
                    <button
                        onClick={() => setOutputFormat('webp')}
                        className={`filter-pill ${outputFormat === 'webp' ? 'active' : ''}`}
                    >
                        ⚡ WebP
                    </button>
                </div>
            </div>

            {/* Auto-Crop Options */}
            <div className="card">
                <div className="card-header">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={autoCrop}
                            onChange={e => setAutoCrop(e.target.checked)}
                            style={{ accentColor: 'var(--accent)', width: '1.25rem', height: '1.25rem' }}
                        />
                        ✂️ Przytnij według koloru tła
                    </label>
                </div>
                {autoCrop && (
                    <div className="card-body">
                        <div style={{ display: 'flex', gap: '2rem', flexWrap: 'wrap' }}>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Tolerancja</span>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>{cropTolerance}</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={50}
                                    value={cropTolerance}
                                    onChange={e => setCropTolerance(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                                />
                            </div>
                            <div style={{ flex: 1, minWidth: '150px' }}>
                                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--text-muted)' }}>Margines</span>
                                    <span style={{ fontSize: '0.875rem', color: 'var(--accent)' }}>{cropPadding}px</span>
                                </div>
                                <input
                                    type="range"
                                    min={0}
                                    max={50}
                                    value={cropPadding}
                                    onChange={e => setCropPadding(Number(e.target.value))}
                                    style={{ width: '100%', accentColor: 'var(--accent)' }}
                                />
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Naming Options */}
            <div className="card">
                <div className="card-header">📝 Nazewnictwo</div>
                <div className="card-body">
                    <div style={{ display: 'flex', gap: '1.5rem', flexWrap: 'wrap' }}>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', cursor: 'pointer', color: namingOption === 'keep' ? 'var(--accent)' : 'var(--text-gray)' }}>
                            <input
                                type="radio"
                                name="naming"
                                checked={namingOption === 'keep'}
                                onChange={() => setNamingOption('keep')}
                                style={{ accentColor: 'var(--accent)', width: '1.25rem', height: '1.25rem' }}
                            />
                            Zachowaj nazwę
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(photo.jpg)</span>
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', fontSize: '1rem', cursor: 'pointer', color: namingOption === 'suffix' ? 'var(--accent)' : 'var(--text-gray)' }}>
                            <input
                                type="radio"
                                name="naming"
                                checked={namingOption === 'suffix'}
                                onChange={() => setNamingOption('suffix')}
                                style={{ accentColor: 'var(--accent)', width: '1.25rem', height: '1.25rem' }}
                            />
                            Dodaj sufiks
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>(photo_allegro.jpg)</span>
                        </label>
                    </div>
                </div>
            </div>

            {/* Progress */}
            {isProcessing && (
                <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                        <span style={{ color: 'var(--text-gray)' }}>Przetwarzanie...</span>
                        <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{progress}%</span>
                    </div>
                    <div className="progress-bar">
                        <div className="progress-fill" style={{ width: `${progress}%` }} />
                    </div>
                </div>
            )}

            {/* Manual Crop Mode Toggle */}
            <div className="card">
                <div className="card-header">
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', cursor: 'pointer' }}>
                        <input
                            type="checkbox"
                            checked={manualCropMode}
                            onChange={e => {
                                setManualCropMode(e.target.checked);
                                if (e.target.checked && files.length > 0) {
                                    setCurrentEditIndex(0);
                                    setCropArea({ left: 0, top: 0, right: 100, bottom: 100 });
                                }
                            }}
                            style={{ accentColor: 'var(--accent)', width: '1.25rem', height: '1.25rem' }}
                        />
                        🎯 Tryb ręcznego kadrowania
                    </label>
                    <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>Edytuj każde zdjęcie osobno</span>
                </div>
                {manualCropMode && files.length > 0 && (
                    <div className="card-body">
                        {/* Gallery thumbnails */}
                        <div style={{ marginBottom: '1rem' }}>
                            <p style={{ fontSize: '0.875rem', color: 'var(--text-muted)', marginBottom: '0.5rem' }}>
                                Zdjęcie {currentEditIndex + 1} z {files.length}
                            </p>
                            <div style={{ display: 'flex', gap: '0.5rem', overflowX: 'auto', paddingBottom: '0.5rem' }}>
                                {files.map((f, i) => (
                                    <div
                                        key={i}
                                        onClick={() => {
                                            setCurrentEditIndex(i);
                                            setCropArea({ left: 0, top: 0, right: 100, bottom: 100 });
                                        }}
                                        style={{
                                            width: '60px',
                                            height: '60px',
                                            borderRadius: '8px',
                                            overflow: 'hidden',
                                            cursor: 'pointer',
                                            border: currentEditIndex === i ? '3px solid var(--accent)' : '2px solid var(--border)',
                                            flexShrink: 0
                                        }}
                                    >
                                        <img
                                            src={f.preview}
                                            alt={f.file.name}
                                            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                                        />
                                    </div>
                                ))}
                            </div>
                        </div>

                        {/* Preview with crop overlay - DRAGGABLE CORNERS */}
                        <div
                            ref={cropContainerRef}
                            style={{
                                position: 'relative',
                                width: '100%',
                                maxWidth: '500px',
                                margin: '0 auto 1.5rem',
                                background: 'var(--bg-tertiary)',
                                borderRadius: '12px',
                                overflow: 'visible',
                                cursor: dragCorner ? 'grabbing' : 'default'
                            }}
                            onMouseMove={handleCropMouseMove}
                            onMouseUp={handleCropMouseUp}
                            onMouseLeave={handleCropMouseUp}
                        >
                            <img
                                src={files[currentEditIndex].preview}
                                alt="Preview"
                                style={{ width: '100%', display: 'block', borderRadius: '12px', userSelect: 'none' }}
                                draggable={false}
                            />
                            {/* Crop overlay - dark areas */}
                            <div style={{
                                position: 'absolute',
                                top: 0,
                                left: 0,
                                right: 0,
                                bottom: 0,
                                pointerEvents: 'none',
                                borderRadius: '12px',
                                overflow: 'hidden'
                            }}>
                                {/* Top dark area */}
                                <div style={{
                                    position: 'absolute',
                                    top: 0,
                                    left: 0,
                                    right: 0,
                                    height: `${cropArea.top}%`,
                                    background: 'rgba(0,0,0,0.6)'
                                }} />
                                {/* Bottom dark area */}
                                <div style={{
                                    position: 'absolute',
                                    bottom: 0,
                                    left: 0,
                                    right: 0,
                                    height: `${100 - cropArea.bottom}%`,
                                    background: 'rgba(0,0,0,0.6)'
                                }} />
                                {/* Left dark area */}
                                <div style={{
                                    position: 'absolute',
                                    top: `${cropArea.top}%`,
                                    left: 0,
                                    width: `${cropArea.left}%`,
                                    height: `${cropArea.bottom - cropArea.top}%`,
                                    background: 'rgba(0,0,0,0.6)'
                                }} />
                                {/* Right dark area */}
                                <div style={{
                                    position: 'absolute',
                                    top: `${cropArea.top}%`,
                                    right: 0,
                                    width: `${100 - cropArea.right}%`,
                                    height: `${cropArea.bottom - cropArea.top}%`,
                                    background: 'rgba(0,0,0,0.6)'
                                }} />
                            </div>

                            {/* Crop box border */}
                            <div style={{
                                position: 'absolute',
                                top: `${cropArea.top}%`,
                                left: `${cropArea.left}%`,
                                width: `${cropArea.right - cropArea.left}%`,
                                height: `${cropArea.bottom - cropArea.top}%`,
                                border: '2px solid var(--accent)',
                                boxSizing: 'border-box',
                                pointerEvents: 'none'
                            }}>
                                {/* Grid lines */}
                                <div style={{ position: 'absolute', left: '33.33%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />
                                <div style={{ position: 'absolute', left: '66.66%', top: 0, bottom: 0, width: '1px', background: 'rgba(255,255,255,0.3)' }} />
                                <div style={{ position: 'absolute', top: '33.33%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
                                <div style={{ position: 'absolute', top: '66.66%', left: 0, right: 0, height: '1px', background: 'rgba(255,255,255,0.3)' }} />
                            </div>

                            {/* Draggable corners */}
                            {/* Top-Left */}
                            <div
                                onMouseDown={(e) => { e.preventDefault(); setDragCorner('tl'); }}
                                style={{
                                    position: 'absolute',
                                    top: `${cropArea.top}%`,
                                    left: `${cropArea.left}%`,
                                    width: '20px',
                                    height: '20px',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'var(--accent)',
                                    borderRadius: '50%',
                                    cursor: 'nwse-resize',
                                    border: '3px solid white',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    zIndex: 10
                                }}
                            />
                            {/* Top-Right */}
                            <div
                                onMouseDown={(e) => { e.preventDefault(); setDragCorner('tr'); }}
                                style={{
                                    position: 'absolute',
                                    top: `${cropArea.top}%`,
                                    left: `${cropArea.right}%`,
                                    width: '20px',
                                    height: '20px',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'var(--accent)',
                                    borderRadius: '50%',
                                    cursor: 'nesw-resize',
                                    border: '3px solid white',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    zIndex: 10
                                }}
                            />
                            {/* Bottom-Left */}
                            <div
                                onMouseDown={(e) => { e.preventDefault(); setDragCorner('bl'); }}
                                style={{
                                    position: 'absolute',
                                    top: `${cropArea.bottom}%`,
                                    left: `${cropArea.left}%`,
                                    width: '20px',
                                    height: '20px',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'var(--accent)',
                                    borderRadius: '50%',
                                    cursor: 'nesw-resize',
                                    border: '3px solid white',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    zIndex: 10
                                }}
                            />
                            {/* Bottom-Right */}
                            <div
                                onMouseDown={(e) => { e.preventDefault(); setDragCorner('br'); }}
                                style={{
                                    position: 'absolute',
                                    top: `${cropArea.bottom}%`,
                                    left: `${cropArea.right}%`,
                                    width: '20px',
                                    height: '20px',
                                    transform: 'translate(-50%, -50%)',
                                    background: 'var(--accent)',
                                    borderRadius: '50%',
                                    cursor: 'nwse-resize',
                                    border: '3px solid white',
                                    boxShadow: '0 2px 8px rgba(0,0,0,0.3)',
                                    zIndex: 10
                                }}
                            />

                            {/* Size indicator */}
                            <div style={{
                                position: 'absolute',
                                bottom: '-30px',
                                left: '50%',
                                transform: 'translateX(-50%)',
                                background: 'var(--bg-card)',
                                padding: '4px 12px',
                                borderRadius: '6px',
                                fontSize: '0.8rem',
                                color: 'var(--accent)',
                                whiteSpace: 'nowrap'
                            }}>
                                {Math.round(cropArea.right - cropArea.left)}% × {Math.round(cropArea.bottom - cropArea.top)}%
                            </div>
                        </div>

                        {/* Instructions */}
                        <p style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '1rem' }}>
                            🎯 Przeciągnij zielone rogi żeby przyciąć zdjęcie
                        </p>

                        {/* Reset button */}
                        <div style={{ display: 'flex', justifyContent: 'center', marginTop: '0.5rem' }}>
                            <button
                                onClick={() => setCropArea({ left: 0, top: 0, right: 100, bottom: 100 })}
                                className="btn btn-secondary"
                                style={{ fontSize: '0.875rem' }}
                            >
                                🔄 Reset (pełny obraz)
                            </button>
                        </div>

                        {/* Navigation */}
                        <div style={{ display: 'flex', gap: '0.75rem', justifyContent: 'center', marginTop: '1rem' }}>
                            <button
                                onClick={() => {
                                    if (currentEditIndex > 0) {
                                        setCurrentEditIndex(prev => prev - 1);
                                    }
                                }}
                                disabled={currentEditIndex === 0}
                                className="btn btn-secondary"
                            >
                                ← Poprzednie
                            </button>
                            <button
                                onClick={() => {
                                    if (currentEditIndex < files.length - 1) {
                                        setCurrentEditIndex(prev => prev + 1);
                                    }
                                }}
                                disabled={currentEditIndex === files.length - 1}
                                className="btn btn-primary"
                            >
                                Następne →
                            </button>
                        </div>
                    </div>
                )}
            </div>

            {/* Actions */}
            <div style={{ display: 'flex', gap: '0.75rem', flexWrap: 'wrap', alignItems: 'center' }}>
                <button onClick={processImages} disabled={files.length === 0 || isProcessing} className="btn btn-primary">
                    {isProcessing ? `⏳ ${progress}%` : '✂️ Kadruj zdjęcia'}
                </button>
                {processed.length > 0 && (
                    <>
                        <button onClick={downloadAll} className="btn btn-secondary" disabled={isLoading}>
                            {packAsZip && processed.length > 1 ? '📦 Pobierz ZIP' : '⬇️ Pobierz'} ({processed.length})
                        </button>
                        {processed.length > 1 && (
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
            {processed.length > 0 && (
                <div className="card">
                    <div className="card-header">
                        <span>✅ Przetworzone ({processed.length})</span>
                        <span style={{ color: 'var(--accent)' }}>
                            → {getPlatformSize().width}×{getPlatformSize().height}px
                        </span>
                    </div>
                    <div className="card-body">
                        <div className="file-grid">
                            {processed.slice(0, 30).map((img, i) => (
                                <a key={i} href={img.url} download={img.name} className="file-item" style={{ display: 'block' }}>
                                    <img src={img.url} alt={img.name} />
                                    <div className="file-overlay" style={{ justifyContent: 'center', alignItems: 'center' }}>
                                        <span style={{ fontSize: '1.5rem' }}>⬇️</span>
                                    </div>
                                </a>
                            ))}
                            {processed.length > 30 && (
                                <div className="file-item" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                                    <span style={{ color: 'var(--text-muted)' }}>+{processed.length - 30}</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
