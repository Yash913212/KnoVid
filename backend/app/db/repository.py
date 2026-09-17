from typing import Any, Dict, List, Optional
from pydantic import BaseModel
from app.db.supabase import supabase
from app.schemas.schemas import SegmentOut, GraphNode, GraphEdge, ChapterOut

def fail(response):
    # supabase-py v2.0+ generally raises exceptions on error if the request fails, 
    # but we can check if data is returned appropriately.
    pass

def create_video(source: str, original_name: str, owner_id: str, url: str = None, file_path: str = None, target_language: str = "en") -> dict:
    data = {
        "source": source,
        "original_name": original_name,
        "owner_id": owner_id,
        "target_language": target_language,
        "status": "queued"
    }
    if url:
        data["url"] = url
    if file_path:
        data["file_path"] = file_path

    response = supabase.table("videos").insert(data).execute()
    return response.data[0]

def find_video(video_id: str, owner_id: Optional[str] = None) -> Optional[dict]:
    query = supabase.table("videos").select("*").eq("id", video_id)
    if owner_id:
        query = query.eq("owner_id", owner_id)
    response = query.execute()
    return response.data[0] if response.data else None

def list_videos(owner_id: str) -> List[dict]:
    response = supabase.table("videos").select("*").eq("owner_id", owner_id).order("created_at", desc=True).execute()
    return response.data

def find_video_by_file_name(file_name: str, owner_id: str) -> Optional[dict]:
    response = supabase.table("videos").select("*").eq("owner_id", owner_id).ilike("file_path", f"%/{file_name}").execute()
    return response.data[0] if response.data else None

def update_video(video_id: str, payload: dict) -> dict:
    res = supabase.table("videos").update(payload).eq("id", video_id).execute()
    return res.data[0] if res.data else None

def delete_video(video_id: str, owner_id: str) -> list:
    res = supabase.table("videos").delete().eq("id", video_id).eq("owner_id", owner_id).execute()
    return res.data

def get_transcript(video_id: str) -> Optional[dict]:
    transcript_res = supabase.table("transcripts").select("*").eq("video_id", video_id).execute()
    if not transcript_res.data:
        return None
    transcript = transcript_res.data[0]
    segments_res = supabase.table("transcript_segments").select("*").eq("transcript_id", transcript["id"]).order("position").execute()
    return {
        "_id": transcript["id"],
        "videoId": video_id,
        "language": transcript["language"],
        "segments": [{
            "start": s["start_time"],
            "end": s["end_time"],
            "speaker": s.get("speaker", ""),
            "language": s["language"],
            "text": s["text"],
            "confidence": s.get("confidence", 0.0)
        } for s in segments_res.data]
    }

def upsert_transcript(video_id: str, language: str, segments: List[SegmentOut]) -> None:
    transcript_res = supabase.table("transcripts").upsert({"video_id": video_id, "language": language}, on_conflict="video_id").execute()
    if not transcript_res.data:
        raise ValueError("Transcript upsert failed")
    transcript_id = transcript_res.data[0]["id"]
    supabase.table("transcript_segments").delete().eq("transcript_id", transcript_id).execute()
    
    rows = []
    for pos, seg in enumerate(segments):
        rows.append({
            "transcript_id": transcript_id,
            "position": pos,
            "start_time": seg.start,
            "end_time": seg.end,
            "speaker": seg.speaker or "",
            "language": seg.language,
            "text": seg.text,
            "confidence": seg.confidence or 0.0
        })
    for i in range(0, len(rows), 500):
        supabase.table("transcript_segments").insert(rows[i:i+500]).execute()

def get_graph(video_id: str) -> Optional[dict]:
    graph_res = supabase.table("graphs").select("*").eq("video_id", video_id).execute()
    if not graph_res.data:
        return None
    graph_id = graph_res.data[0]["id"]
    nodes_res = supabase.table("graph_nodes").select("*").eq("graph_id", graph_id).order("created_at").execute()
    edges_res = supabase.table("graph_edges").select("*").eq("graph_id", graph_id).order("created_at").execute()
    
    return {
        "_id": graph_id,
        "videoId": video_id,
        "nodes": [{
            "id": n["node_id"],
            "label": n["label"],
            "type": n["type"],
            "timestampRef": n.get("timestamp_ref"),
            "summary": n.get("summary"),
            "metadata": n.get("metadata", {})
        } for n in nodes_res.data],
        "edges": [{
            "source": e["source_id"],
            "target": e["target_id"],
            "relation": e["relation"]
        } for e in edges_res.data]
    }

def upsert_graph(video_id: str, nodes: List[GraphNode], edges: List[GraphEdge]) -> None:
    graph_res = supabase.table("graphs").upsert({"video_id": video_id}, on_conflict="video_id").execute()
    graph_id = graph_res.data[0]["id"]
    supabase.table("graph_nodes").delete().eq("graph_id", graph_id).execute()
    supabase.table("graph_edges").delete().eq("graph_id", graph_id).execute()
    
    if nodes:
        node_rows = [{
            "graph_id": graph_id,
            "node_id": n.id,
            "label": n.label,
            "type": n.type,
            "timestamp_ref": n.timestampRef,
            "summary": n.summary,
            "metadata": n.metadata
        } for n in nodes]
        for i in range(0, len(node_rows), 500):
            supabase.table("graph_nodes").insert(node_rows[i:i+500]).execute()
            
    if edges:
        edge_rows = [{
            "graph_id": graph_id,
            "source_id": e.source,
            "target_id": e.target,
            "relation": e.relation
        } for e in edges]
        for i in range(0, len(edge_rows), 500):
            supabase.table("graph_edges").insert(edge_rows[i:i+500]).execute()

def get_generated(video_id: str, type: Optional[str] = None) -> List[dict]:
    query = supabase.table("generated_content").select("*").eq("video_id", video_id).order("created_at", desc=True)
    if type:
        query = query.eq("type", type)
    res = query.execute()
    return [{"_id": r["id"], "videoId": r["video_id"], "type": r["type"], "content": r["content"], "format": r["format"]} for r in res.data]

def upsert_generated(video_id: str, type: str, content: str, format: str = "markdown") -> dict:
    res = supabase.table("generated_content").upsert({
        "video_id": video_id,
        "type": type,
        "content": content,
        "format": format
    }, on_conflict="video_id,type").execute()
    r = res.data[0]
    return {"_id": r["id"], "videoId": r["video_id"], "type": r["type"], "content": r["content"], "format": r["format"]}

def get_chapters(video_id: str) -> List[ChapterOut]:
    res = supabase.table("video_chapters").select("*").eq("video_id", video_id).order("chapter_index").execute()
    return [ChapterOut(
        id=r["id"],
        videoId=r["video_id"],
        title=r["title"],
        start=float(r["start_time"]),
        end=float(r["end_time"]),
        summary=r.get("summary", ""),
        keywords=r.get("keywords", [])
    ) for r in res.data]

def upsert_chapters(video_id: str, chapters: List[ChapterOut]) -> None:
    if not chapters:
        return
    rows = []
    for i, c in enumerate(chapters):
        rows.append({
            "video_id": video_id,
            "chapter_index": i,
            "title": c.title,
            "start_time": c.start,
            "end_time": c.end,
            "summary": c.summary or "",
            "keywords": c.keywords or []
        })
    supabase.table("video_chapters").upsert(rows, on_conflict="video_id,chapter_index").execute()
