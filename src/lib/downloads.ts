'use client';

export interface DownloadableFile {
    name: string;
    url: string;
}

interface FileSystemWritableFileStreamLike {
    write(data: Blob): Promise<void>;
    close(): Promise<void>;
}

interface FileSystemFileHandleLike {
    createWritable(): Promise<FileSystemWritableFileStreamLike>;
}

interface FileSystemDirectoryHandleLike {
    getFileHandle(name: string, options?: { create?: boolean }): Promise<FileSystemFileHandleLike>;
}

interface WindowWithDirectoryPicker extends Window {
    showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<FileSystemDirectoryHandleLike>;
}

function isPickerCancelError(error: unknown): boolean {
    if (!error || typeof error !== 'object') {
        return false;
    }

    const maybeError = error as { name?: string };
    return maybeError.name === 'AbortError';
}

function triggerBrowserDownload(file: DownloadableFile): void {
    const anchor = document.createElement('a');
    anchor.href = file.url;
    anchor.download = file.name;
    anchor.rel = 'noopener';
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
}

async function saveViaDirectoryPicker(
    files: DownloadableFile[],
    setProgress?: (message: string) => void,
): Promise<boolean> {
    const picker = (window as WindowWithDirectoryPicker).showDirectoryPicker;
    if (!picker) {
        return false;
    }

    const directoryHandle = await picker({ mode: 'readwrite' });

    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setProgress?.(`💾 Zapisywanie ${i + 1}/${files.length}: ${file.name}`);
        const response = await fetch(file.url);
        const blob = await response.blob();
        const fileHandle = await directoryHandle.getFileHandle(file.name, { create: true });
        const writable = await fileHandle.createWritable();
        await writable.write(blob);
        await writable.close();
    }

    return true;
}

export async function downloadFiles(
    files: DownloadableFile[],
    setProgress?: (message: string) => void,
): Promise<'directory' | 'browser' | 'cancelled'> {
    if (files.length === 0) {
        return 'browser';
    }

    try {
        const saved = await saveViaDirectoryPicker(files, setProgress);
        if (saved) {
            return 'directory';
        }
    } catch (error) {
        if (isPickerCancelError(error)) {
            setProgress?.('');
            return 'cancelled';
        }
        console.warn('Directory save failed, falling back to browser downloads', error);
    }

    for (let i = 0; i < files.length; i++) {
        triggerBrowserDownload(files[i]);
        if (i < files.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 150));
        }
    }

    return 'browser';
}
