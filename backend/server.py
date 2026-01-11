from fastapi import FastAPI, UploadFile, File, Form, HTTPException, BackgroundTasks, Request, Depends
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse, JSONResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from sqlalchemy.orm import Session
import os
import io
import zipfile
import uuid
from datetime import datetime
import shutil
import json
from typing import List, Dict, Optional
# from backend_processor import process_perfume_data, EanChecker, StructureMatcher, PikoEmpiko, PikoEmpikoLocal

# Auth imports - wrapped in try-except for debugging
AUTH_AVAILABLE = False
try:
    from database import get_db, init_db
    from models import User, ToolPermission, UserRole, RESTRICTED_TOOLS
    from auth import (
        hash_password, verify_password, create_tokens, verify_token,
        UserCreate, UserLogin, UserResponse, Token, GrantToolRequest
    )
    AUTH_AVAILABLE = True
    print("✅ Auth modules loaded successfully")
except Exception as e:
    print(f"⚠️ Auth modules failed to load: {e}")
    import traceback
    traceback.print_exc()
    # Define dummy classes to prevent import errors
    class UserCreate: pass
    class UserLogin: pass
    class Token: pass
    class GrantToolRequest: pass
    RESTRICTED_TOOLS = []

app = FastAPI(title="ToolBox Pro API")

# Initialize database on startup (only if auth is available)
@app.on_event("startup")
def startup_event():
    if AUTH_AVAILABLE:
        try:
            init_db()
            print("✅ Database initialized")
        except Exception as e:
            print(f"⚠️ Database init failed: {e}")

# Security
security = HTTPBearer(auto_error=False)

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
origins = [
    "http://localhost:3000",
    "https://toolboxpro.onrender.com",
    "https://toolboxpro-api.onrender.com"
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.get("/")
async def root():
    return {"message": "ToolBox Pro API is running"}

# Rate Limit Middleware removed for stability

# API Endpoints

@app.get("/api/health")
async def health_check():
    """Health check endpoint for frontend status monitoring"""
    return JSONResponse(status_code=200, content={
        "status": "ok",
        "service": "ToolBox Pro API",
        "timestamp": datetime.now().isoformat(),
        "auth_available": AUTH_AVAILABLE
    })

# ==================== AUTHENTICATION ENDPOINTS ====================

def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security),
    db: Session = Depends(get_db)
) -> Optional[User]:
    """Get current user from JWT token."""
    if not credentials:
        return None
    token_data = verify_token(credentials.credentials)
    if not token_data or not token_data.user_id:
        return None
    return db.query(User).filter(User.id == token_data.user_id).first()

def require_user(user: Optional[User] = Depends(get_current_user)) -> User:
    """Require authenticated user."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    return user

def require_admin(user: User = Depends(require_user)) -> User:
    """Require admin role."""
    if user.role != UserRole.ADMIN:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user

@app.post("/api/auth/register", response_model=Token)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    if not AUTH_AVAILABLE:
        raise HTTPException(status_code=503, detail="Auth system not available - check server logs")
    
    # Check if email already exists
    existing = db.query(User).filter(User.email == user_data.email).first()
    if existing:
        raise HTTPException(status_code=400, detail="Email already registered")
    
    # Create user
    user = User(
        email=user_data.email,
        password_hash=hash_password(user_data.password),
        display_name=user_data.display_name or user_data.email.split("@")[0],
        role=UserRole.USER
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    
    # Return tokens
    return create_tokens(user.id, user.email, user.role.value)

@app.post("/api/auth/login", response_model=Token)
async def login(credentials: UserLogin, db: Session = Depends(get_db)):
    """Login and get tokens."""
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    
    return create_tokens(user.id, user.email, user.role.value)

@app.post("/api/auth/refresh", response_model=Token)
async def refresh_token(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: Session = Depends(get_db)
):
    """Refresh access token using refresh token."""
    token_data = verify_token(credentials.credentials, token_type="refresh")
    if not token_data or not token_data.user_id:
        raise HTTPException(status_code=401, detail="Invalid refresh token")
    
    user = db.query(User).filter(User.id == token_data.user_id).first()
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")
    
    return create_tokens(user.id, user.email, user.role.value)

@app.get("/api/auth/me")
async def get_me(user: User = Depends(require_user), db: Session = Depends(get_db)):
    """Get current user data."""
    tool_permissions = [p.tool_id for p in user.tool_permissions]
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role.value,
        "is_active": user.is_active,
        "tool_permissions": tool_permissions,
        "restricted_tools": RESTRICTED_TOOLS
    }

@app.get("/api/auth/tools")
async def get_accessible_tools(user: Optional[User] = Depends(get_current_user)):
    """Get list of tools user can access."""
    if not user:
        # Guest - no restricted tools
        accessible = []
    elif user.role in [UserRole.ADMIN, UserRole.PREMIUM]:
        # Full access
        accessible = RESTRICTED_TOOLS
    else:
        # Check explicit permissions
        accessible = [p.tool_id for p in user.tool_permissions]
    
    return {
        "accessible_tools": accessible,
        "all_restricted": RESTRICTED_TOOLS
    }

# ==================== ADMIN ENDPOINTS ====================

@app.get("/api/admin/users")
async def list_users(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """List all users (admin only)."""
    users = db.query(User).all()
    return [{
        "id": u.id,
        "email": u.email,
        "display_name": u.display_name,
        "role": u.role.value,
        "is_active": u.is_active,
        "created_at": u.created_at.isoformat() if u.created_at else None,
        "tool_permissions": [p.tool_id for p in u.tool_permissions]
    } for u in users]

@app.post("/api/admin/grant-tool")
async def grant_tool_access(
    request: GrantToolRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Grant a user access to a restricted tool."""
    user = db.query(User).filter(User.id == request.user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if request.tool_id not in RESTRICTED_TOOLS:
        raise HTTPException(status_code=400, detail="Invalid tool ID")
    
    # Check if already granted
    existing = db.query(ToolPermission).filter(
        ToolPermission.user_id == user.id,
        ToolPermission.tool_id == request.tool_id
    ).first()
    
    if existing:
        return {"message": "Permission already exists"}
    
    # Grant permission
    permission = ToolPermission(
        user_id=user.id,
        tool_id=request.tool_id,
        granted_by=admin.id
    )
    db.add(permission)
    db.commit()
    
    return {"message": f"Granted {request.tool_id} access to {user.email}"}

@app.post("/api/admin/revoke-tool")
async def revoke_tool_access(
    request: GrantToolRequest,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Revoke a user's access to a restricted tool."""
    permission = db.query(ToolPermission).filter(
        ToolPermission.user_id == request.user_id,
        ToolPermission.tool_id == request.tool_id
    ).first()
    
    if not permission:
        raise HTTPException(status_code=404, detail="Permission not found")
    
    db.delete(permission)
    db.commit()
    
    return {"message": f"Revoked {request.tool_id} access"}

@app.post("/api/admin/set-role")
async def set_user_role(
    user_id: int,
    role: str,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Set user role (admin only)."""
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    try:
        user.role = UserRole(role)
        db.commit()
        return {"message": f"Set {user.email} role to {role}"}
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid role")


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
        
        # Lazy import
        from backend_processor import process_perfume_data
        
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
        
        from backend_processor import EanChecker
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
        
        from backend_processor import StructureMatcher
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
            import logging
            import traceback
            try:
                logging.info(f"[{jid}] Starting process_safe...")
                from backend_processor import PikoEmpiko
                # Returns path to the generated ZIP file
                output_path = PikoEmpiko.process_safe(
                    content, idx, main, extra, 
                    progress_callback=lambda c, t: update_progress(jid, c, t),
                    batch_size=options['batch_size'],
                    create_zip=options['create_zip'],
                    compress_jpg=options['compress_jpg'],
                    convert_format=options['convert_format'],
                    max_resolution=options['max_resolution'],
                    resume=options['resume'],
                    pim_version=options['pim_version'],
                    job_id=jid
                )
                
                logging.info(f"[{jid}] process_safe completed: {output_path}")
                filename = os.path.basename(output_path)
                
                jobs[jid]['status'] = 'completed'
                jobs[jid]['result'] = {'file_path': output_path, 'filename': filename}
                jobs[jid]['progress'] = 100
            except Exception as e:
                logging.error(f"[{jid}] Error in process_task: {e}")
                logging.error(traceback.format_exc())
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
                from backend_processor import PikoEmpikoLocal
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
        # Check if running on Render (or any headless env)
        if os.environ.get("RENDER") or os.environ.get("CI"):
            return JSONResponse(status_code=400, content={"error": "Folder browsing not available on server"})

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
    port = int(os.environ.get("PORT", 8000))
    print(f"🚀 ToolBox Pro Backend running on port {port}")
    print("📝 Frontend: http://localhost:3000 (Next.js)")
    uvicorn.run(app, host="0.0.0.0", port=port)

