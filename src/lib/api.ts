// API Helper functions

const API_BASE = process.env.NEXT_PUBLIC_API_URL ||
    (process.env.NODE_ENV === 'development' ? 'http://localhost:8000' : '');

export async function uploadPikoFile(
    file: File,
    options: {
        colIndex: string;
        colMain: string;
        colExtra: string;
        batchSize?: number;
        compress?: boolean;
        convert?: boolean;
        convertFormat?: string;
        resize?: boolean;
        maxResolution?: number;
        zipEachBatch?: boolean;
    }
): Promise<{ jobId: string }> {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('col_index', options.colIndex);
    formData.append('col_main', options.colMain);
    formData.append('col_extra', options.colExtra);
    formData.append('batch_size', String(options.batchSize || 0));
    formData.append('compress', String(options.compress || false));
    formData.append('convert', String(options.convert || false));
    formData.append('convert_format', options.convertFormat || 'jpg');
    formData.append('resize', String(options.resize || false));
    formData.append('max_resolution', String(options.maxResolution || 1920));
    formData.append('zip_each_batch', String(options.zipEachBatch !== false));

    const res = await fetch(`${API_BASE}/api/piko-empiko`, {
        method: 'POST',
        body: formData,
    });

    if (!res.ok) {
        const error = await res.json();
        throw new Error(error.error || 'Upload failed');
    }

    return res.json();
}

export async function getJobProgress(jobId: string): Promise<{
    status: string;
    progress: number;
    current?: number;
    total?: number;
    message?: string;
    logs?: Array<{ timestamp: string; message: string; type: string }>;
}> {
    const res = await fetch(`${API_BASE}/api/progress/${jobId}`);
    if (!res.ok) {
        throw new Error('Failed to get progress');
    }
    return res.json();
}

export function getDownloadUrl(jobId: string): string {
    return `${API_BASE}/api/download/${jobId}`;
}

export async function parseExcelPreview(file: File): Promise<{
    headers: string[];
    rows: (string | number | null)[][];
    totalRows: number;
}> {
    // Client-side Excel parsing using SheetJS
    const XLSX = await import('xlsx');
    const buffer = await file.arrayBuffer();
    const workbook = XLSX.read(buffer);
    const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
    const data = XLSX.utils.sheet_to_json(firstSheet, { header: 1 }) as (string | number | null)[][];

    return {
        headers: (data[0] || []).map(h => String(h || '')),
        rows: data.slice(1, 6), // First 5 data rows for preview
        totalRows: data.length - 1,
    };
}

export async function browseFolder(): Promise<string | null> {
    const res = await fetch(`${API_BASE}/api/browse-folder`, { method: 'POST' });
    if (!res.ok) return null;
    const data = await res.json();
    return data.path || null;
}
