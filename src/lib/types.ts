// PikoEmpiko Types

export interface PikoOptions {
    // Column settings
    colIndex: string;
    colMain: string;
    colExtra: string;

    // Image processing
    compress: boolean;
    convert: boolean;
    convertFormat: 'jpg' | 'png' | 'webp';
    resize: boolean;
    maxResolution: number; // 3840, 1920, 1280, or custom
    qualityCheck: boolean;
    quality: number; // 1-95

    // Output options
    batchSize: number; // 0 = no split, otherwise split per X products
    zipEachBatch: boolean;
    savePathsToExcel: boolean;

    // UX options
    soundOnComplete: boolean;
    resumeEnabled: boolean;
}

export interface PikoMode {
    id: number;
    icon: string;
    title: string;
    description: string;
}

export const PIKO_MODES: PikoMode[] = [
    { id: 1, icon: '☁️', title: 'Pobieranie zdjęć', description: 'z linków Excel' },
    { id: 2, icon: '📊', title: 'Raport folderu', description: 'do Excel' },
    { id: 3, icon: '🔧', title: 'Naprawa nazw', description: 'usuwanie nawiasów' },
    { id: 4, icon: '📁', title: 'Rename', description: 'na nazwę folderu' },
    { id: 5, icon: '⚡', title: 'Batch Subfoldery', description: 'masowe przetwarzanie' },
    { id: 6, icon: '📋', title: 'Batch Rename', description: 'wg Excela' },
    { id: 7, icon: '🧠', title: 'Inteligentny', description: 'z kolumną akcji' },
];

export interface JobProgress {
    jobId: string;
    status: 'pending' | 'processing' | 'completed' | 'error';
    progress: number; // 0-100
    current: number;
    total: number;
    message?: string;
    logs: LogEntry[];
}

export interface LogEntry {
    timestamp: string;
    message: string;
    type: 'info' | 'success' | 'warning' | 'error';
}

export interface ExcelPreview {
    headers: string[];
    rows: (string | number | null)[][];
    totalRows: number;
    totalCols: number;
}

// Default options
export const DEFAULT_PIKO_OPTIONS: PikoOptions = {
    colIndex: 'Indeks MDM',
    colMain: 'Zdjęcie okładki/produktu',
    colExtra: 'Dodatkowe zdjęcia',
    compress: false,
    convert: false,
    convertFormat: 'jpg',
    resize: false,
    maxResolution: 1920,
    qualityCheck: false,
    quality: 85,
    batchSize: 0,
    zipEachBatch: true,
    savePathsToExcel: false,
    soundOnComplete: true,
    resumeEnabled: false,
};

export const BATCH_SIZE_PRESETS = [
    { label: 'Nie dziel', value: 0 },
    { label: '50 produktów', value: 50 },
    { label: '100 produktów', value: 100 },
    { label: '200 produktów', value: 200 },
    { label: '500 produktów', value: 500 },
    { label: 'Custom...', value: -1 },
];

export const RESOLUTION_PRESETS = [
    { label: '4K (3840px)', value: 3840 },
    { label: 'Full HD (1920px)', value: 1920 },
    { label: 'HD (1280px)', value: 1280 },
    { label: '800px', value: 800 },
];
