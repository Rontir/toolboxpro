from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
import os
import io
import zipfile
import uuid
from datetime import datetime
import shutil
import json
from typing import List, Dict
from backend_processor import process_perfume_data, EanChecker, StructureMatcher, PikoEmpiko, PikoEmpikoLocal

app = FastAPI(title="ToolBox Pro API")

# Job Store
jobs: Dict[str, dict] = {}

def update_progress(job_id, current, total):
    if job_id in jobs:
        jobs[job_id]['progress'] = int((current / total) * 100) if total > 0 else 0
        jobs[job_id]['status'] = 'processing'

def cleanup_job(job_id):
    # Optional: cleanup old jobs after some time
    pass

# CORS setup
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# API Endpoints
@app.post("/api/process-perfumes")
async def process_perfumes(
    source_file: UploadFile = File(...),
    dict_marki: UploadFile = File(...),
    dict_linie: UploadFile = File(...),
    dict_beauty: UploadFile = File(...),
    dict_kompozycje: UploadFile = File(...)
):
    try:
        # Read files
        source_content = await source_file.read()
        marki_content = await dict_marki.read()
        linie_content = await dict_linie.read()
        beauty_content = await dict_beauty.read()
        kompozycje_content = await dict_kompozycje.read()
        
        # Process data
        main_excel, missing_excel, verify_excel, report_text = process_perfume_data(
            source_content,
            marki_content,
            linie_content,
            beauty_content,
            kompozycje_content
        )
        
        # Create ZIP archive
        zip_buffer = io.BytesIO()
        with zipfile.ZipFile(zip_buffer, "w", zipfile.ZIP_DEFLATED) as zip_file:
            # Add files to ZIP
            zip_file.writestr(f"{source_file.filename.split('.')[0]}_KOMPLETNE.xlsx", main_excel.getvalue())
            zip_file.writestr("BRAKUJACE_slowniki.xlsx", missing_excel.getvalue())
            zip_file.writestr("DO_WERYFIKACJI.xlsx", verify_excel.getvalue())
            zip_file.writestr("RAPORT.txt", report_text)
            
        zip_buffer.seek(0)
        
        # Return ZIP file
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"wyniki_perfumy_{timestamp}.zip"
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={"Content-Disposition": f"attachment; filename={filename}"}
        )
        
    except Exception as e:
        print(f"Error processing files: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/ean-check")
async def check_ean(
    file: UploadFile = File(...),
    col_main: str = Form(...),
    col_search: str = Form(...) # JSON string list
):
    try:
        content = await file.read()
        search_cols = json.loads(col_search)
        
        output_io = EanChecker.process(content, search_cols, col_main)
        
        return StreamingResponse(
            output_io,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=ean_report.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/structure-match")
async def match_structure(
    batch_file: UploadFile = File(...),
    base_file: UploadFile = File(...),
    path_col_idx: int = Form(...)
):
    try:
        batch_content = await batch_file.read()
        base_content = await base_file.read()
        
        output_io = StructureMatcher.process(batch_content, base_content, path_col_idx)
        
        return StreamingResponse(
            output_io,
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": f"attachment; filename=structure_match.xlsx"}
        )
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/piko-empiko")
async def piko_empiko(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    col_index: str = Form(...),
    col_main: str = Form(...),
    col_extra: str = Form(...),
    batch_size: int = Form(0),
    compress: str = Form("false"),
    convert: str = Form("false"),
    convert_format: str = Form("jpg"),
    resize: str = Form("false"),
    max_resolution: int = Form(0),
    resume: str = Form("false"),
    zip_each_batch: str = Form("false"),
    save_paths_to_excel: str = Form("false"),
    pim_version: str = Form("PIM3")
):
    try:
        content = await file.read()
        job_id = str(uuid.uuid4())
        jobs[job_id] = {'status': 'pending', 'progress': 0, 'result': None, 'error': None}
        
        # Parse boolean options
        opts = {
            'batch_size': batch_size,
            'compress_jpg': compress.lower() == 'true',
            'convert_enabled': convert.lower() == 'true',
            'convert_format': convert_format,
            'max_resolution': max_resolution if resize.lower() == 'true' else 0,
            'resume': resume.lower() == 'true',
            'create_zip': zip_each_batch.lower() == 'true',
            'save_paths': save_paths_to_excel.lower() == 'true',
            'pim_version': pim_version
        }
        
        def process_task(jid, content, idx, main, extra, options):
            try:
                output_io = PikoEmpiko.process_safe(
                    content, idx, main, extra, 
                    progress_callback=lambda c, t: update_progress(jid, c, t),
                    batch_size=options['batch_size'],
                    create_zip=options['create_zip'],
                    compress_jpg=options['compress_jpg'],
                    convert_format=options['convert_format'],
                    max_resolution=options['max_resolution'],
                    resume=options['resume'],
                    pim_version=options['pim_version']
                )
                
                # Save result to temp file
                timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
                filename = f"piko_images_{timestamp}.zip"
                temp_path = f"temp_{jid}_{filename}"
                
                with open(temp_path, "wb") as f:
                    f.write(output_io.getvalue())
                    
                jobs[jid]['status'] = 'completed'
                jobs[jid]['result'] = {'file_path': temp_path, 'filename': filename}
                jobs[jid]['progress'] = 100
            except Exception as e:
                jobs[jid]['status'] = 'error'
                jobs[jid]['error'] = str(e)

        background_tasks.add_task(process_task, job_id, content, col_index, col_main, col_extra, opts)
        
        return JSONResponse(status_code=200, content={"job_id": job_id})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/piko-local")
async def piko_local(
    background_tasks: BackgroundTasks,
    mode: int = Form(...),
    folder_path: str = Form(...),
    file: UploadFile = File(None),
    options: str = Form("{}")
):
    try:
        excel_content = await file.read() if file else None
        opts = json.loads(options)
        job_id = str(uuid.uuid4())
        jobs[job_id] = {'status': 'pending', 'progress': 0, 'result': None, 'error': None}
        
        def process_task(jid, mode, folder, content, opts):
            try:
                result = PikoEmpikoLocal.process_request(
                    mode, folder, content, opts,
                    progress_callback=lambda pct: update_progress(jid, pct, 100)
                )
                
                jobs[jid]['status'] = 'completed'
                jobs[jid]['result'] = result
                jobs[jid]['progress'] = 100
            except Exception as e:
                jobs[jid]['status'] = 'error'
                jobs[jid]['error'] = str(e)

        background_tasks.add_task(process_task, job_id, mode, folder_path, excel_content, opts)
        
        return JSONResponse(status_code=200, content={"job_id": job_id})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/progress/{job_id}")
async def get_progress(job_id: str):
    if job_id not in jobs:
        return JSONResponse(status_code=404, content={"error": "Job not found"})
    return JSONResponse(status_code=200, content=jobs[job_id])

@app.get("/api/download/{job_id}")
async def download_result(job_id: str):
    if job_id not in jobs:
        raise HTTPException(status_code=404, detail="Job not found")
    
    job = jobs[job_id]
    if job['status'] != 'completed':
        raise HTTPException(status_code=400, detail="Job not completed")
        
    result = job['result']
    
    # For Mode 1 (File download)
    if 'file_path' in result:
        file_path = result['file_path']
        filename = result['filename']
        
        # Clean up file after sending (using background task)
        # But FileResponse doesn't support background task cleanup easily without custom class
        # We'll rely on OS cleanup or manual cleanup later. 
        # For now, let's just return it.
        return FileResponse(file_path, filename=filename, media_type='application/octet-stream')
    
    # For Local Modes (JSON result)
    return JSONResponse(status_code=200, content=result)

@app.get("/api/browse-folder")
async def browse_folder():
    try:
        # Run in executor to avoid blocking main thread
        from backend_processor import SystemUtils
        import asyncio
        
        loop = asyncio.get_event_loop()
        folder_path = await loop.run_in_executor(None, SystemUtils.browse_folder)
        
        return JSONResponse(status_code=200, content={"path": folder_path})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/open-file")
async def open_file_in_explorer(request: Request):
    """Open file location in Windows Explorer"""
    try:
        data = await request.json()
        file_path = data.get('file_path', '')
        
        if not file_path or not os.path.exists(file_path):
            return JSONResponse(status_code=404, content={"error": "File not found"})
        
        # Open file location in explorer, selecting the file
        import subprocess
        subprocess.Popen(f'explorer /select,"{file_path}"')
        
        return JSONResponse(status_code=200, content={"success": True})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/download-file")
async def download_local_file(path: str):
    """Download a local file by path"""
    try:
        if not path or not os.path.exists(path):
            raise HTTPException(status_code=404, detail="File not found")
        
        return FileResponse(path, filename=os.path.basename(path), media_type='application/octet-stream')
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    print("🚀 ToolBox Pro Backend running on http://localhost:8000")
    print("📝 Frontend: http://localhost:3000 (Next.js)")
    uvicorn.run(app, host="0.0.0.0", port=8000)
