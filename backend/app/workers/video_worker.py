import time
import asyncio
from typing import Dict, Any

from app.db.repository import (
    update_video, upsert_transcript, upsert_chapters, 
    upsert_graph, upsert_generated
)
from app.schemas.schemas import ProcessRequest, AnalyzeRequest, GenerateRequest
from app.routers.media import process_video as media_process_video, analyze_transcript
from app.routers.content import generate_content

def process_video(payload: Dict[str, Any]):
    video_id = payload["videoId"]
    video_type = payload.get("type", "upload")
    url = payload.get("url")
    file_path = payload.get("filePath")
    target_language = payload.get("targetLanguage", "en")
    
    start_time = time.time()
    print(f"[{time.time()}] [Worker] Processing video {video_id} ({video_type})")

    def set_status(status: str, error_message: str = None, duration: float = 0):
        patch = {"status": status, "duration": duration}
        if error_message:
            patch["error_message"] = error_message
        update_video(video_id, patch)

    try:
        set_status("downloading")
        
        # 1. Process Video (Transcription, Chapters, etc)
        process_req = ProcessRequest(
            videoId=video_id,
            url=url,
            filePath=file_path,
            targetLanguage=target_language
        )
        print(f"[{time.time()}] [Worker] Calling media.process_video internally")
        process_resp = media_process_video(process_req, _auth=None)
        
        patch = {}
        if process_resp.filePath:
            patch["file_path"] = str(process_resp.filePath)
        if process_resp.title:
            patch["original_name"] = process_resp.title
        if patch:
            update_video(video_id, patch)
            
        upsert_transcript(video_id, process_resp.language, process_resp.segments)
        
        if process_resp.chapters:
            upsert_chapters(video_id, process_resp.chapters)
            
        # 2. Analyze (Graph)
        set_status("analyzing")
        print(f"[{time.time()}] [Worker] Calling media.analyze_transcript internally")
        analyze_req = AnalyzeRequest(videoId=video_id, segments=process_resp.segments)
        analyze_resp = analyze_transcript(analyze_req, _auth=None)
        
        upsert_graph(video_id, analyze_resp.nodes, analyze_resp.edges)
            
        # 3. Generate (Summary)
        set_status("summarizing")
        print(f"[{time.time()}] [Worker] Calling content.generate_content internally")
        generate_req = GenerateRequest(videoId=video_id, segments=process_resp.segments, type="summary")
        # Run async generation in new event loop since this is a background worker thread
        generate_resp = asyncio.run(generate_content(generate_req, _auth=None))
        
        upsert_generated(video_id, "summary", generate_resp.content, "markdown")
            
        duration = process_resp.duration or 0
        set_status("done", duration=duration)
        print(f"[{time.time()}] [Worker] DONE in {time.time() - start_time}s")

    except Exception as e:
        print(f"[{time.time()}] [Worker] FAILED: {e}")
        set_status("failed", error_message=str(e)[:500])
