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
import logging
from datetime import datetime
import shutil
import json
import glob
import tempfile
import threading
from typing import List, Dict, Optional
from pydantic import BaseModel
# from backend_processor import process_perfume_data, EanChecker, StructureMatcher, PikoEmpiko, PikoEmpikoLocal
try:
    from clearcut import ClearcutEngine
    # Initialize Clearcut Engine
    clearcut_engine = ClearcutEngine()
    CLEARCUT_AVAILABLE = True
except ImportError as e:
    print(f"⚠️ Clearcut AI module could not be loaded: {e}")
    CLEARCUT_AVAILABLE = False
    clearcut_engine = None

# Auth imports - wrapped in try-except for debugging
AUTH_AVAILABLE = False
try:
    from database import get_db, init_db
    from models import User, ToolPermission, UserRole, RESTRICTED_TOOLS, Group, ActivityLog
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


def get_cors_origins() -> List[str]:
    """Return allowed CORS origins from env or sensible local defaults."""
    raw_origins = os.getenv("CORS_ORIGINS", "")
    if raw_origins.strip():
        return [origin.strip() for origin in raw_origins.split(",") if origin.strip()]

    return [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "https://toolboxpro.onrender.com",
        "https://toolboxpro-api.onrender.com",
    ]

# Security
security = HTTPBearer(auto_error=False)

# Job Store
jobs: Dict[str, dict] = {}
jobs_lock = threading.RLock()


def get_int_env(name: str, default: int) -> int:
    raw_value = os.getenv(name)
    if not raw_value:
        return default
    try:
        return max(0, int(raw_value))
    except ValueError:
        logging.warning("Invalid integer env %s=%s, using default %s", name, raw_value, default)
        return default


JOB_RESULT_TTL_SECONDS = get_int_env("JOB_RESULT_TTL_SECONDS", 600)
TEMP_FILE_TTL_SECONDS = get_int_env("TEMP_FILE_TTL_SECONDS", 600)
MIN_FREE_DISK_MB = get_int_env("MIN_FREE_DISK_MB", 1024)
MAX_DISK_USAGE_PERCENT = get_int_env("MAX_DISK_USAGE_PERCENT", 90)

def update_progress(job_id, current, total):
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id]['progress'] = int((current / total) * 100) if total > 0 else 0
            jobs[job_id]['status'] = 'processing'
            jobs[job_id]['last_accessed_at'] = datetime.now().isoformat()

def _delete_temp_path(path: str) -> None:
    try:
        if os.path.isdir(path):
            shutil.rmtree(path, ignore_errors=True)
        elif os.path.isfile(path):
            os.remove(path)
    except FileNotFoundError:
        pass
    except Exception as exc:
        logging.warning("Failed to delete temp path %s: %s", path, exc)


def _parse_job_timestamp(value: Optional[str]) -> float:
    if not value:
        return 0.0
    try:
        return datetime.fromisoformat(value).timestamp()
    except ValueError:
        return 0.0


def is_disk_pressure_high() -> bool:
    try:
        usage = shutil.disk_usage(tempfile.gettempdir())
    except FileNotFoundError:
        return False

    total_bytes = max(usage.total, 1)
    free_mb = usage.free / (1024 * 1024)
    used_percent = ((usage.used / total_bytes) * 100)
    return free_mb < MIN_FREE_DISK_MB or used_percent >= MAX_DISK_USAGE_PERCENT


def cleanup_finished_jobs(force_all_finished: bool = False) -> int:
    removable_statuses = {'completed', 'error'}
    candidates = []

    with jobs_lock:
        job_items = list(jobs.items())

    for job_id, job in job_items:
        if job.get('status') not in removable_statuses:
            continue

        if force_all_finished:
            candidates.append((job_id, job))
            continue

        last_seen = (
            _parse_job_timestamp(job.get('last_accessed_at'))
            or _parse_job_timestamp(job.get('completed_at'))
            or _parse_job_timestamp(job.get('created_at'))
        )
        if last_seen and last_seen < datetime.now().timestamp() - JOB_RESULT_TTL_SECONDS:
            candidates.append((job_id, job))

    candidates.sort(
        key=lambda item: (
            _parse_job_timestamp(item[1].get('last_accessed_at'))
            or _parse_job_timestamp(item[1].get('completed_at'))
            or _parse_job_timestamp(item[1].get('created_at'))
        )
    )

    removed = 0
    for job_id, _job in candidates:
        cleanup_job(job_id)
        removed += 1
        if force_all_finished and not is_disk_pressure_high():
            break

    return removed


def cleanup_stale_temp_files() -> None:
    now_ts = datetime.now().timestamp()
    cutoff_ts = now_ts - TEMP_FILE_TTL_SECONDS
    temp_root = tempfile.gettempdir()

    protected_paths = set()
    with jobs_lock:
        for job in jobs.values():
            if job.get('status') in {'pending', 'processing'}:
                result = job.get('result') or {}
                file_path = result.get('file_path')
                if file_path:
                    protected_paths.add(os.path.realpath(file_path))

    for path in glob.glob(os.path.join(temp_root, "piko_result_*.zip")):
        try:
            real_path = os.path.realpath(path)
            if real_path in protected_paths:
                continue
            if os.path.getmtime(path) < cutoff_ts:
                _delete_temp_path(path)
        except FileNotFoundError:
            continue

    processing_root = os.path.join(temp_root, "piko_processing")
    if os.path.isdir(processing_root):
        for path in glob.glob(os.path.join(processing_root, "*")):
            try:
                if os.path.getmtime(path) < cutoff_ts:
                    _delete_temp_path(path)
            except FileNotFoundError:
                continue

    cleanup_finished_jobs(force_all_finished=False)

    if is_disk_pressure_high():
        zip_candidates = []
        for path in glob.glob(os.path.join(temp_root, "piko_result_*.zip")):
            try:
                real_path = os.path.realpath(path)
                if real_path in protected_paths:
                    continue
                zip_candidates.append((os.path.getmtime(path), path))
            except FileNotFoundError:
                continue

        for _mtime, path in sorted(zip_candidates):
            _delete_temp_path(path)
            if not is_disk_pressure_high():
                break

        cleanup_finished_jobs(force_all_finished=True)


def touch_job(job_id: str) -> None:
    with jobs_lock:
        if job_id in jobs:
            jobs[job_id]['last_accessed_at'] = datetime.now().isoformat()


def cleanup_job(job_id: str) -> None:
    with jobs_lock:
        job = jobs.pop(job_id, None)
    if not job:
        return

    result = job.get('result') or {}
    file_path = result.get('file_path')
    if file_path and os.path.basename(file_path).startswith("piko_result_"):
        _delete_temp_path(file_path)


def schedule_job_cleanup(job_id: str, delay_seconds: int = JOB_RESULT_TTL_SECONDS) -> None:
    timer = threading.Timer(delay_seconds, cleanup_job, args=(job_id,))
    timer.daemon = True
    timer.start()


# Initialize database on startup (only if auth is available)
@app.on_event("startup")
def startup_event():
    cleanup_stale_temp_files()
    if AUTH_AVAILABLE:
        try:
            init_db()
            print("✅ Database initialized")
        except Exception as e:
            print(f"⚠️ Database init failed: {e}")

origins = get_cors_origins()

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
        "version": "4.3.0-admin-complete",
        "timestamp": datetime.now().isoformat(),
        "auth_available": AUTH_AVAILABLE
    })

# ==================== AUTH HELPERS ====================

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
    """Require admin or owner role."""
    if user.role not in [UserRole.ADMIN, UserRole.OWNER]:
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


def is_desktop_mode_enabled() -> bool:
    return os.getenv("TOOLBOX_ENABLE_DESKTOP_ENDPOINTS", "").lower() == "true"


def ensure_desktop_mode(request: Request) -> None:
    if not is_desktop_mode_enabled():
        raise HTTPException(status_code=404, detail="Desktop-only endpoint is disabled")

    client_host = request.client.host if request.client else ""
    if client_host not in {"127.0.0.1", "::1", "localhost"}:
        raise HTTPException(status_code=403, detail="Desktop-only endpoint is limited to localhost")


def get_allowed_local_paths() -> List[str]:
    backend_dir = os.path.dirname(os.path.abspath(__file__))
    return [
        os.path.join(backend_dir, "temp_processing"),
        os.path.join(backend_dir, "downloads"),
        os.path.join(os.getcwd(), "backend", "temp_processing"),
        os.path.join(os.getcwd(), "backend", "downloads"),
    ]


def ensure_safe_local_file_path(path: str) -> str:
    if not path:
        raise HTTPException(status_code=400, detail="Path is required")

    normalized = os.path.realpath(path)
    allowed_roots = [os.path.realpath(root) for root in get_allowed_local_paths()]

    if not os.path.isfile(normalized):
        raise HTTPException(status_code=404, detail="File not found")

    if not any(normalized.startswith(f"{root}{os.sep}") or normalized == root for root in allowed_roots):
        raise HTTPException(status_code=403, detail="Access to this path is not allowed")

    return normalized

# ==================== EMPIK TOOLS ENDPOINTS ====================

class PriceMonitorRequest(BaseModel):
    eans: List[str]
    my_shop_name: Optional[str] = None

@app.post("/api/price-monitor")
async def price_monitor(request: PriceMonitorRequest, user: User = Depends(require_user)):
    """Check prices and Buy Box status for given EANs."""
    try:
        from empik_tools import PriceMonitor
        results = PriceMonitor.check_prices(request.eans, request.my_shop_name)
        return {"status": "success", "results": results}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class AiDescriptionRequest(BaseModel):
    name: str
    features: List[str]
    specs: Dict[str, str]

@app.post("/api/ai-description")
async def ai_description(request: AiDescriptionRequest, user: User = Depends(require_user)):
    """Generate HTML description for Empik."""
    try:
        from empik_tools import AiGenerator
        html = AiGenerator.generate_description(request.dict())
        return {"status": "success", "html": html}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/validate-image")
async def validate_image(file: UploadFile = File(...), user: User = Depends(require_user)):
    """Validate image for Empik requirements (white background)."""
    try:
        from empik_tools import ImageValidator
        
        # Save temp file
        temp_path = f"temp_{file.filename}"
        with open(temp_path, "wb") as buffer:
            shutil.copyfileobj(file.file, buffer)
            
        result = ImageValidator.check_white_background(temp_path)
        
        # Cleanup
        if os.path.exists(temp_path):
            os.remove(temp_path)
            
        return {"status": "success", "validation": result}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

# ==================== ACTIVITY LOGGING ENDPOINTS ====================

class LogActivityRequest(BaseModel):
    action: str  # tool_use, page_view, etc.
    details: Optional[str] = None


class ChangePasswordRequest(BaseModel):
    current_password: str
    new_password: str


class AdminResetPasswordRequest(BaseModel):
    new_password: str

@app.post("/api/log-activity")
async def log_activity(
    request: LogActivityRequest,
    req: Request,
    db: Session = Depends(get_db),
    user: Optional[User] = Depends(get_current_user)
):
    """Log an activity. Works for both authenticated users and guests."""
    try:
        log = ActivityLog(
            user_id=user.id if user else None,
            action=request.action,
            details=request.details,
            ip_address=req.client.host if req.client else None,
            user_agent=req.headers.get("user-agent", "")[:500]  # Limit length
        )
        db.add(log)
        db.commit()
        return {"status": "success"}
    except Exception as e:
        logging.error(f"Failed to log activity: {e}")
        return {"status": "error", "message": str(e)}

@app.get("/api/admin/activity-logs")
async def get_activity_logs(
    limit: int = 100,
    offset: int = 0,
    action_filter: Optional[str] = None,
    user: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get activity logs (admin only)."""
    query = db.query(ActivityLog).order_by(ActivityLog.created_at.desc())
    
    if action_filter:
        query = query.filter(ActivityLog.action == action_filter)
    
    total = query.count()
    logs = query.offset(offset).limit(limit).all()
    
    return {
        "status": "success",
        "total": total,
        "logs": [
            {
                "id": log.id,
                "user_id": log.user_id,
                "user_email": log.user.email if log.user else None,
                "user_name": log.user.display_name if log.user else "Gość",
                "action": log.action,
                "details": log.details,
                "ip_address": log.ip_address,
                "created_at": log.created_at.isoformat() if log.created_at else None
            }
            for log in logs
        ]
    }

# ==================== AUTHENTICATION ENDPOINTS ====================

@app.post("/api/auth/register", response_model=Token)
async def register(user_data: UserCreate, db: Session = Depends(get_db)):
    """Register a new user."""
    import traceback
    import logging
    
    if not AUTH_AVAILABLE:
        raise HTTPException(status_code=503, detail="Auth system not available - check server logs")
    
    try:
        # Check if email already exists
        existing = db.query(User).filter(User.email == user_data.email).first()
        if existing:
            raise HTTPException(status_code=400, detail="Email already registered")
        
        # Check if this email should be auto-promoted to admin/owner
        admin_emails = os.getenv("ADMIN_EMAILS", "xmikezien@gmail.com").lower().split(",")
        user_role = UserRole.OWNER if user_data.email.lower() in admin_emails else UserRole.USER
        
        # Create user
        user = User(
            email=user_data.email,
            password_hash=hash_password(user_data.password),
            display_name=user_data.display_name or user_data.email.split("@")[0],
            role=user_role
        )
        db.add(user)
        db.commit()
        db.refresh(user)
        
        # Return tokens
        return create_tokens(user.id, user.email, user.role.value)
    except HTTPException:
        raise  # Re-raise HTTP exceptions as-is
    except Exception as e:
        error_msg = f"Registration error: {str(e)}\n{traceback.format_exc()}"
        logging.error(error_msg)
        print(error_msg)  # Also print for Render logs
        raise HTTPException(status_code=500, detail=f"Registration failed: {str(e)}")

@app.post("/api/auth/login", response_model=Token)
async def login(credentials: UserLogin, request: Request, db: Session = Depends(get_db)):
    """Login and get tokens."""
    user = db.query(User).filter(User.email == credentials.email).first()
    if not user or not verify_password(credentials.password, user.password_hash):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    
    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account is disabled")
    
    # Log login activity
    try:
        log = ActivityLog(
            user_id=user.id,
            action="login",
            details=f"Login successful for {user.email}",
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent", "")[:500]
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"Failed to log login: {e}")

    # Auto-promote to OWNER if email matches (self-healing)
    admin_emails = os.getenv("ADMIN_EMAILS", "xmikezien@gmail.com").lower().split(",")
    if user.email.lower() in admin_emails and user.role != UserRole.OWNER:
        user.role = UserRole.OWNER
        db.commit()
        db.refresh(user)
    
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
    elif user.role in [UserRole.ADMIN, UserRole.OWNER, UserRole.PREMIUM]:
        # Full access
        accessible = RESTRICTED_TOOLS
    else:
        # Check group + individual permissions
        accessible = user.get_all_accessible_tools()
    
    return {
        "accessible_tools": accessible,
        "all_restricted": RESTRICTED_TOOLS
    }

# ==================== PROFILE ENDPOINTS ====================

# Helper function to log activity
def log_activity(db: Session, user_id: int, action: str, details: str = None, request: Request = None):
    """Log user activity to database."""
    try:
        log = ActivityLog(
            user_id=user_id,
            action=action,
            details=details,
            ip_address=request.client.host if request else None,
            user_agent=request.headers.get("user-agent", "")[:500] if request else None
        )
        db.add(log)
        db.commit()
    except Exception as e:
        print(f"Failed to log activity: {e}")

@app.post("/api/auth/change-password")
async def change_password(
    payload: ChangePasswordRequest,
    request: Request,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Change user's password."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if not verify_password(payload.current_password, user.password_hash):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="New password must be at least 8 characters")
    
    user.password_hash = hash_password(payload.new_password)
    db.commit()
    
    log_activity(db, user.id, "password_change", "User changed own password", request)
    
    return {"message": "Password changed successfully"}

@app.put("/api/auth/profile")
async def update_profile(
    display_name: str = None,
    request: Request = None,
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db)
):
    """Update user profile."""
    if not user:
        raise HTTPException(status_code=401, detail="Not authenticated")
    
    if display_name is not None:
        user.display_name = display_name.strip() or None
    
    db.commit()
    db.refresh(user)
    
    log_activity(db, user.id, "profile_update", f"Updated display_name to {display_name}", request)
    
    return {
        "id": user.id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role.value
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
        "tool_permissions": [p.tool_id for p in u.tool_permissions],
        "groups": [{"id": g.id, "name": g.name, "color": g.color} for g in u.groups]
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

# ==================== GROUP ENDPOINTS ====================

@app.get("/api/admin/groups")
async def list_groups(admin: User = Depends(require_admin), db: Session = Depends(get_db)):
    """List all groups with their users and tools."""
    groups = db.query(Group).all()
    return [{
        "id": g.id,
        "name": g.name,
        "color": g.color,
        "description": g.description or "",
        "tool_ids": g.get_tool_list(),
        "user_ids": [u.id for u in g.users],
        "user_count": len(g.users),
        "created_at": g.created_at.isoformat() if g.created_at else None
    } for g in groups]

@app.post("/api/admin/groups")
async def create_group(
    name: str,
    color: str = "#6366f1",
    description: str = "",
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Create a new group."""
    existing = db.query(Group).filter(Group.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Group name already exists")
    
    group = Group(name=name, color=color, description=description)
    db.add(group)
    db.commit()
    db.refresh(group)
    
    return {"id": group.id, "name": group.name, "message": "Group created"}

@app.put("/api/admin/groups/{group_id}")
async def update_group(
    group_id: int,
    name: str = None,
    color: str = None,
    description: str = None,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Update group details."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    if name:
        group.name = name
    if color:
        group.color = color
    if description is not None:
        group.description = description
    
    db.commit()
    return {"message": f"Group '{group.name}' updated"}

@app.delete("/api/admin/groups/{group_id}")
async def delete_group(
    group_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Delete a group."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    db.delete(group)
    db.commit()
    return {"message": f"Group deleted"}

@app.put("/api/admin/groups/{group_id}/tools")
async def set_group_tools(
    group_id: int,
    tool_ids: list[str],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Set which tools this group has access to."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    group.set_tool_list(tool_ids)
    db.commit()
    return {"message": f"Group '{group.name}' tools updated", "tools": tool_ids}

@app.put("/api/admin/groups/{group_id}/users")
async def set_group_users(
    group_id: int,
    user_ids: list[int],
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Set which users belong to this group."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    # Get users
    users = db.query(User).filter(User.id.in_(user_ids)).all()
    group.users = users
    db.commit()
    
    return {"message": f"Group '{group.name}' users updated", "user_count": len(users)}

@app.post("/api/admin/groups/{group_id}/add-user/{user_id}")
async def add_user_to_group(
    group_id: int,
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Add a single user to a group."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user not in group.users:
        group.users.append(user)
        db.commit()
    
    return {"message": f"User '{user.email}' added to group '{group.name}'"}

@app.delete("/api/admin/groups/{group_id}/remove-user/{user_id}")
async def remove_user_from_group(
    group_id: int,
    user_id: int,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Remove a user from a group."""
    group = db.query(Group).filter(Group.id == group_id).first()
    if not group:
        raise HTTPException(status_code=404, detail="Group not found")
    
    user = db.query(User).filter(User.id == user_id).first()
    if not user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if user in group.users:
        group.users.remove(user)
        db.commit()
    
    return {"message": f"User '{user.email}' removed from group '{group.name}'"}

# ==================== ADMIN EXTENDED ENDPOINTS ====================

@app.post("/api/admin/reset-password/{user_id}")
async def admin_reset_password(
    user_id: int,
    payload: AdminResetPasswordRequest,
    request: Request,
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Admin resets a user's password."""
    target_user = db.query(User).filter(User.id == user_id).first()
    if not target_user:
        raise HTTPException(status_code=404, detail="User not found")
    
    if len(payload.new_password) < 8:
        raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
    
    target_user.password_hash = hash_password(payload.new_password)
    db.commit()
    
    log_activity(db, admin.id, "admin_password_reset", f"Reset password for user {target_user.email}", request)
    
    return {"message": f"Password reset for {target_user.email}"}

@app.get("/api/admin/dashboard-stats")
async def get_dashboard_stats(
    admin: User = Depends(require_admin),
    db: Session = Depends(get_db)
):
    """Get dashboard statistics for admin panel."""
    from sqlalchemy import func as sqlfunc
    
    total_users = db.query(User).count()
    active_users = db.query(User).filter(User.is_active == True).count()
    total_groups = db.query(Group).count()
    
    # Activity stats (last 24h, 7d, 30d)
    from datetime import datetime, timedelta
    now = datetime.utcnow()
    
    logins_24h = db.query(ActivityLog).filter(
        ActivityLog.action == "login",
        ActivityLog.created_at >= now - timedelta(hours=24)
    ).count()
    
    logins_7d = db.query(ActivityLog).filter(
        ActivityLog.action == "login",
        ActivityLog.created_at >= now - timedelta(days=7)
    ).count()
    
    # Most active users
    top_users = db.query(
        ActivityLog.user_id,
        sqlfunc.count(ActivityLog.id).label('count')
    ).filter(
        ActivityLog.user_id.isnot(None)
    ).group_by(ActivityLog.user_id).order_by(sqlfunc.count(ActivityLog.id).desc()).limit(5).all()
    
    top_users_data = []
    for user_id, count in top_users:
        user = db.query(User).filter(User.id == user_id).first()
        if user:
            top_users_data.append({
                "user_id": user_id,
                "email": user.email,
                "display_name": user.display_name,
                "activity_count": count
            })
    
    return {
        "total_users": total_users,
        "active_users": active_users,
        "total_groups": total_groups,
        "logins_24h": logins_24h,
        "logins_7d": logins_7d,
        "top_users": top_users_data
    }

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
        cleanup_stale_temp_files()
        content = await file.read()
        job_id = str(uuid.uuid4())
        with jobs_lock:
            jobs[job_id] = {
                'status': 'pending',
                'progress': 0,
                'result': None,
                'error': None,
                'created_at': datetime.now().isoformat(),
                'last_accessed_at': datetime.now().isoformat(),
            }
        
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
                
                with jobs_lock:
                    if jid not in jobs:
                        _delete_temp_path(output_path)
                        return
                    jobs[jid]['status'] = 'completed'
                    jobs[jid]['result'] = {'file_path': output_path, 'filename': filename}
                    jobs[jid]['progress'] = 100
                    jobs[jid]['completed_at'] = datetime.now().isoformat()
                schedule_job_cleanup(jid)
            except Exception as e:
                logging.error(f"[{jid}] Error in process_task: {e}")
                logging.error(traceback.format_exc())
                with jobs_lock:
                    if jid in jobs:
                        jobs[jid]['status'] = 'error'
                        jobs[jid]['error'] = str(e)
                schedule_job_cleanup(jid)

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
        cleanup_stale_temp_files()
        excel_content = await file.read() if file else None
        opts = json.loads(options)
        job_id = str(uuid.uuid4())
        with jobs_lock:
            jobs[job_id] = {
                'status': 'pending',
                'progress': 0,
                'result': None,
                'error': None,
                'created_at': datetime.now().isoformat(),
                'last_accessed_at': datetime.now().isoformat(),
            }
        
        def process_task(jid, mode, folder, content, opts):
            try:
                from backend_processor import PikoEmpikoLocal
                result = PikoEmpikoLocal.process_request(
                    mode, folder, content, opts,
                    progress_callback=lambda pct: update_progress(jid, pct, 100)
                )
                
                with jobs_lock:
                    if jid not in jobs:
                        return
                    jobs[jid]['status'] = 'completed'
                    jobs[jid]['result'] = result
                    jobs[jid]['progress'] = 100
                    jobs[jid]['completed_at'] = datetime.now().isoformat()
                schedule_job_cleanup(jid)
            except Exception as e:
                with jobs_lock:
                    if jid in jobs:
                        jobs[jid]['status'] = 'error'
                        jobs[jid]['error'] = str(e)
                schedule_job_cleanup(jid)

        background_tasks.add_task(process_task, job_id, mode, folder_path, excel_content, opts)
        
        return JSONResponse(status_code=200, content={"job_id": job_id})
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/progress/{job_id}")
async def get_progress(job_id: str):
    with jobs_lock:
        if job_id not in jobs:
            return JSONResponse(status_code=404, content={"error": "Job not found"})
    touch_job(job_id)
    with jobs_lock:
        job_snapshot = dict(jobs[job_id])
    return JSONResponse(status_code=200, content=job_snapshot)

@app.get("/api/download/{job_id}")
async def download_result(job_id: str):
    with jobs_lock:
        if job_id not in jobs:
            raise HTTPException(status_code=404, detail="Job not found")
        job = dict(jobs[job_id])
    touch_job(job_id)
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

# ==================== CLEARCUT AI ENDPOINTS ====================

@app.post("/api/clearcut/remove-bg")
async def remove_background(
    file: UploadFile = File(...)
):
    """Remove background from uploaded image."""
    if not CLEARCUT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Clearcut AI service is unavailable on this server (missing dependencies)")
        
    try:
        contents = await file.read()
        
        # Process in thread pool to avoid blocking
        import asyncio
        loop = asyncio.get_event_loop()
        processed_data = await loop.run_in_executor(None, clearcut_engine.remove_background, contents)
        
        return StreamingResponse(io.BytesIO(processed_data), media_type="image/png")
    except Exception as e:
        print(f"Error in remove_background: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/clearcut/process")
async def process_image(
    file: UploadFile = File(...),
    crop_box: Optional[str] = Form(None), # JSON string "[x1, y1, x2, y2]"
    format: str = Form("PNG"),
    quality: int = Form(90)
):
    """Process image (crop, format, resize)."""
    if not CLEARCUT_AVAILABLE:
        raise HTTPException(status_code=503, detail="Clearcut AI service is unavailable on this server (missing dependencies)")

    try:
        contents = await file.read()
        
        # Parse crop box if provided
        crop_tuple = None
        if crop_box:
            try:
                crop_list = json.loads(crop_box)
                if len(crop_list) == 4:
                    crop_tuple = tuple(crop_list)
            except:
                pass
        
        # Process in thread pool
        import asyncio
        loop = asyncio.get_event_loop()
        processed_data = await loop.run_in_executor(
            None, 
            clearcut_engine.process_image, 
            contents, 
            crop_tuple, 
            format, 
            quality
        )
        
        media_type = "image/png"
        if format.upper() == "JPEG":
            media_type = "image/jpeg"
        elif format.upper() == "WEBP":
            media_type = "image/webp"
            
        return StreamingResponse(io.BytesIO(processed_data), media_type=media_type)
    except Exception as e:
        print(f"Error in process_image: {e}")
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/browse-folder")
async def browse_folder(request: Request):
    try:
        ensure_desktop_mode(request)

        # Run in executor to avoid blocking main thread
        from backend_processor import SystemUtils
        import asyncio
        
        loop = asyncio.get_event_loop()
        folder_path = await loop.run_in_executor(None, SystemUtils.browse_folder)
        
        return JSONResponse(status_code=200, content={"path": folder_path})
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.post("/api/open-file")
async def open_file_in_explorer(request: Request):
    """Open file location in Windows Explorer"""
    try:
        ensure_desktop_mode(request)
        data = await request.json()
        file_path = ensure_safe_local_file_path(data.get('file_path', ''))

        if os.name != "nt":
            raise HTTPException(status_code=400, detail="Open file is only supported on Windows desktop")
        
        # Open file location in explorer, selecting the file
        import subprocess
        subprocess.Popen(f'explorer /select,"{file_path}"')
        
        return JSONResponse(status_code=200, content={"success": True})
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/api/download-file")
async def download_local_file(path: str, request: Request):
    """Download a local file by path"""
    try:
        ensure_desktop_mode(request)
        safe_path = ensure_safe_local_file_path(path)
        
        return FileResponse(safe_path, filename=os.path.basename(safe_path), media_type='application/octet-stream')
    except Exception as e:
        if isinstance(e, HTTPException):
            raise e
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    print(f"🚀 ToolBox Pro Backend running on port {port}")
    print("📝 Frontend: http://localhost:3000 (Next.js)")
    uvicorn.run(app, host="0.0.0.0", port=port)
