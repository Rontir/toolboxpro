// Web Worker for parsing Excel files
// This runs in a separate thread, preventing main thread blocking

importScripts('https://cdn.sheetjs.com/xlsx-0.20.1/package/dist/xlsx.full.min.js');

self.onmessage = function (e) {
    const { arrayBuffer, fileName } = e.data;

    try {
        self.postMessage({ type: 'progress', message: `📊 Parsowanie ${fileName}...` });

        const data = new Uint8Array(arrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        const sheet = workbook.Sheets[sheetName];
        const json = XLSX.utils.sheet_to_json(sheet, { defval: '' });

        const headers = json.length > 0 ? Object.keys(json[0]) : [];

        self.postMessage({
            type: 'complete',
            headers,
            rows: json,
            totalRows: json.length
        });
    } catch (err) {
        self.postMessage({
            type: 'error',
            error: err.message
        });
    }
};
