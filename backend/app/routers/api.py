import os
import shutil
from typing import Optional, List
from fastapi import APIRouter, Depends, UploadFile, File, Form, HTTPException, BackgroundTasks, Request
from fastapi.responses import FileResponse
from pydantic import BaseModel
from uuid import uuid4

from app.core.auth import get_current_user, get_current_user_optional_query
from app.core.config import settings
from app.workers.video_worker import process_video
from app.db.supabase import supabase
from app.db.repository import (
    create_video, find_video, list_videos, update_video, delete_video, find_video_by_file_name,
    get_transcript, get_chapters, get_graph, get_generated, upsert_generated
)

# Shared httpx client to pass requests to internal generation endpoints if needed.
# Since we merged everything, we can also just import the generation logic, but 
# making an internal HTTP request is easy since FastAPI runs on the same process.
# Alternatively, we can just call the functions. For `api.py`, it's mostly CRUD.
import httpx

router = APIRouter(prefix="/api")

# --- Auth ---
class RegisterRequest(BaseModel):
    email: str
    password: str
    name: str

class LoginRequest(BaseModel):
    email: str
    password: str

@router.post("/auth/register")
def register(req: RegisterRequest):
    res = supabase.auth.sign_up({
        "email": req.email.strip().lower(),
        "password": req.password,
        "options": {"data": {"name": req.name.strip()}}
    })
    # supabase-py sign_up returns an AuthResponse
    if not res.user:
        raise HTTPException(status_code=400, detail="Registration failed")
    
    return {
        "token": res.session.access_token if res.session else None,
        "user": {
            "id": res.user.id,
            "email": res.user.email,
            "name": res.user.user_metadata.get("name", req.name) if res.user.user_metadata else req.name
        },
        "requiresEmailConfirmation": not res.session
    }

@router.post("/auth/login")
def login(req: LoginRequest):
    try:
        res = supabase.auth.sign_in_with_password({
            "email": req.email.strip().lower(),
            "password": req.password
        })
        if not res.user or not res.session:
            raise HTTPException(status_code=401, detail="Invalid credentials")
            
        return {
            "token": res.session.access_token,
            "user": {
                "id": res.user.id,
                "email": res.user.email,
                "name": res.user.user_metadata.get("name", "User") if res.user.user_metadata else "User"
            },
            "requiresEmailConfirmation": False
        }
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid credentials")

# --- Videos ---
class UrlRequest(BaseModel):
    url: str
    targetLanguage: str = "en"

@router.post("/videos/upload", status_code=201)
async def upload_video(
    background_tasks: BackgroundTasks,
    video: UploadFile = File(...), 
    targetLanguage: str = Form("en"),
    user_id: str = Depends(get_current_user)
):
    ext = os.path.splitext(video.filename)[1]
    filename = f"{uuid4()}{ext}"
    file_path = os.path.join(settings.upload_dir, filename)
    
    with open(file_path, "wb") as buffer:
        shutil.copyfileobj(video.file, buffer)
        
    db_video = create_video(
        source="upload", 
        original_name=video.filename, 
        owner_id=user_id, 
        file_path=file_path, 
        target_language=targetLanguage
    )
    
    background_tasks.add_task(
        process_video, 
        {"videoId": db_video["id"], "type": "upload", "filePath": file_path, "targetLanguage": targetLanguage}
    )
    
    return {"id": db_video["id"], "status": db_video["status"]}

@router.post("/videos/url", status_code=201)
def queue_url(req: UrlRequest, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    db_video = create_video(
        source="url",
        original_name=req.url,
        owner_id=user_id,
        url=req.url,
        target_language=req.targetLanguage
    )
    
    background_tasks.add_task(
        process_video,
        {"videoId": db_video["id"], "type": "url", "url": req.url, "targetLanguage": req.targetLanguage}
    )
    
    return {"id": db_video["id"], "status": db_video["status"]}

@router.post("/videos/{video_id}/retry")
def retry_video(video_id: str, background_tasks: BackgroundTasks, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    if video["status"] not in ["failed", "queued"]:
        raise HTTPException(status_code=409, detail=f"Cannot retry a video in state '{video['status']}'")
        
    payload = {"videoId": video_id, "type": video["source"]}
    if video["source"] == "url" and video.get("url"):
        payload["url"] = video["url"]
    elif video["source"] == "upload" and video.get("file_path"):
        payload["filePath"] = video["file_path"]
    payload["targetLanguage"] = video.get("target_language", "en")
    
    update_video(video_id, {"status": "queued", "error_message": None})
    
    background_tasks.add_task(process_video, payload)
    
    return {"id": video_id, "status": "queued"}

@router.get("/videos")
def get_videos(user_id: str = Depends(get_current_user)):
    return list_videos(user_id)

@router.get("/videos/{video_id}")
def get_video(video_id: str, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return video

@router.delete("/videos/{video_id}")
def remove_video(video_id: str, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    delete_video(video_id, user_id)
    return {"id": video_id, "deleted": True}

# --- Transcripts, Chapters, Graphs ---
@router.get("/transcripts/{video_id}")
def fetch_transcript(video_id: str, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    transcript = get_transcript(video_id)
    if not transcript:
        raise HTTPException(status_code=404, detail="Transcript not yet available")
    return transcript

@router.get("/chapters/{video_id}")
def fetch_chapters(video_id: str, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    chapters = get_chapters(video_id)
    # Convert Pydantic models to dicts
    chapters_dict = [c.model_dump() for c in chapters]
    return {"videoId": video_id, "chapters": chapters_dict}

@router.get("/graphs/{video_id}")
def fetch_graphs(video_id: str, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    graph = get_graph(video_id)
    if not graph:
        raise HTTPException(status_code=404, detail="Graph not yet available")
    return graph

# --- Generation & Translation (Proxying to the internal routes) ---
# The backend previously made POST requests to the Python service for generation. 
# Since we are the Python service, we can just call those functions directly.
# However, to avoid tight coupling and messing with the existing schemas, we can 
# route requests to the existing endpoints in `content.py` via HTTP, or directly
# instantiate the routers. The simplest way is internal HTTP proxying using httpx.
class GenerateReq(BaseModel):
    videoId: str
    type: str

@router.post("/generate")
def generate_content(req: GenerateReq, user_id: str = Depends(get_current_user)):
    video = find_video(req.videoId, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    transcript = get_transcript(req.videoId)
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
        
    # We call our own /generate endpoint
    headers = {}
    if settings.processing_auth_token:
        headers["X-Processing-Auth"] = settings.processing_auth_token
        
    try:
        with httpx.Client(timeout=300) as client:
            resp = client.post(
                "http://127.0.0.1:8000/generate", 
                json={"videoId": req.videoId, "segments": transcript["segments"], "type": req.type},
                headers=headers
            )
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
                
            data = resp.json()
            # Save generated content
            upsert_generated(req.videoId, req.type, data.get("content", ""), data.get("format", "markdown"))
            return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/generate/{video_id}")
def get_generated_content(video_id: str, type: Optional[str] = None, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    return get_generated(video_id, type)
    
class ChatReq(BaseModel):
    question: str

@router.post("/generate/chat/{video_id}")
def chat(video_id: str, req: ChatReq, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    transcript = get_transcript(video_id)
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
        
    headers = {}
    if settings.processing_auth_token:
        headers["X-Processing-Auth"] = settings.processing_auth_token
        
    try:
        with httpx.Client(timeout=120) as client:
            resp = client.post(
                f"http://127.0.0.1:8000/generate/chat", 
                json={"videoId": video_id, "segments": transcript["segments"], "question": req.question},
                headers=headers
            )
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class FuseReq(BaseModel):
    a: str
    b: str

@router.post("/generate/fuse/{video_id}")
def fuse(video_id: str, req: FuseReq, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
    
    transcript = get_transcript(video_id)
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
        
    headers = {}
    if settings.processing_auth_token:
        headers["X-Processing-Auth"] = settings.processing_auth_token
        
    try:
        with httpx.Client(timeout=120) as client:
            resp = client.post(
                f"http://127.0.0.1:8000/generate/fuse", 
                json={"videoId": video_id, "segments": transcript["segments"], "a": req.a, "b": req.b},
                headers=headers
            )
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
            return resp.json()
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

class TranslateReq(BaseModel):
    videoId: str
    targetLanguage: str

@router.post("/translate")
def translate(req: TranslateReq, request: Request, user_id: str = Depends(get_current_user)):
    video = find_video(req.videoId, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    transcript = get_transcript(req.videoId)
    if not transcript:
        raise HTTPException(status_code=400, detail="Transcript required")
        
    graph = get_graph(req.videoId)
    nodeLabels = {}
    if graph:
        for node in graph["nodes"]:
            nodeLabels[node["id"]] = node["label"]
            
    headers = {}
    if settings.processing_auth_token:
        headers["X-Processing-Auth"] = settings.processing_auth_token
        
    try:
        with httpx.Client(timeout=120) as client:
            resp = client.post(
                "http://127.0.0.1:8000/translate", 
                json={"videoId": req.videoId, "segments": transcript["segments"], "targetLanguage": req.targetLanguage, "nodeLabels": nodeLabels if nodeLabels else None},
                headers=headers
            )
            if not resp.is_success:
                raise HTTPException(status_code=resp.status_code, detail=resp.text)
                
            data = resp.json()
            # The backend didn't save the translated transcript in the database, it just returned it.
            return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

from fastapi.responses import PlainTextResponse

@router.get("/generate/export/{video_id}/{format}")
def export(video_id: str, format: str, user_id: str = Depends(get_current_user)):
    video = find_video(video_id, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="Video not found")
        
    transcript = get_transcript(video_id)
    graph = get_graph(video_id)
    
    if format == "json":
        return {
            "video": video,
            "transcript": transcript,
            "graph": graph
        }
        
    if format == "markdown":
        lines = [f"# {video['original_name']}\n"]
        if transcript:
            lines.append("## Transcript\n")
            for seg in transcript["segments"]:
                mins = int(seg['start'] // 60)
                secs = int(seg['start'] % 60)
                ts = f"{mins}:{secs:02d}"
                speaker = f" **{seg['speaker']}**" if seg.get('speaker') else ""
                lines.append(f"- [{ts}]{speaker}: {seg['text']}")
                
        if graph:
            lines.append("\n## Knowledge Graph\n")
            for node in graph["nodes"]:
                lines.append(f"- **{node['label']}** (_{node['type']}_)")
            lines.append("\n### Relationships\n")
            for edge in graph["edges"]:
                lines.append(f"- {edge['source']} → {edge['target']} (_{edge['relation']}_)")
                
        return PlainTextResponse("\n".join(lines), media_type="text/markdown")
        
    raise HTTPException(status_code=400, detail="Unsupported format. Use 'markdown' or 'json'.")

# --- Files ---
@router.get("/files/{filename}")
def serve_file(filename: str, user_id: str = Depends(get_current_user_optional_query)):
    video = find_video_by_file_name(filename, user_id)
    if not video:
        raise HTTPException(status_code=404, detail="File not found")
        
    file_path = os.path.join(settings.upload_dir, filename)
    if not os.path.exists(file_path):
        raise HTTPException(status_code=404, detail="File not found on disk")
        
    return FileResponse(file_path)
