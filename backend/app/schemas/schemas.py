"""Pydantic request/response schemas for the processing service."""
from pydantic import BaseModel, Field


class ProcessRequest(BaseModel):
    videoId: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    url: str | None = Field(None, max_length=4096)
    # A relative path into the uploads sandbox, or a fully-resolved path that
    # must live inside it. Never accepted as an arbitrary host path.
    filePath: str | None = Field(None, max_length=1024)
    # ISO 639-1 target language for the transcript. "en" makes Whisper
    # translate any-language audio straight to English.
    targetLanguage: str = Field("en", max_length=16)


class SegmentOut(BaseModel):
    start: float
    end: float
    speaker: str = ""
    language: str = "en"
    text: str
    confidence: float = 0.0


class ProcessResponse(BaseModel):
    videoId: str
    status: str
    duration: float
    language: str
    segments: list[SegmentOut]
    # Chapters auto-segmented from the transcript (semantic boundaries).
    chapters: list["ChapterOut"] = []
    filePath: str | None = None
    # Real media title from the source platform (None for uploads).
    title: str | None = None


class AnalyzeRequest(BaseModel):
    videoId: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    segments: list[SegmentOut] = Field(..., max_length=5000)


class GraphNode(BaseModel):
    id: str
    label: str
    type: str
    timestampRef: float | None = None
    summary: str | None = None
    metadata: dict = Field(default_factory=dict)


class GraphEdge(BaseModel):
    source: str
    target: str
    relation: str


class AnalyzeResponse(BaseModel):
    videoId: str
    nodes: list[GraphNode]
    edges: list[GraphEdge]


class GenerateRequest(BaseModel):
    videoId: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    segments: list[SegmentOut] = Field(..., max_length=5000)
    type: str  # summary | notes | quiz


class ChatRequest(BaseModel):
    videoId: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    segments: list[SegmentOut] = Field(..., max_length=5000)
    question: str = Field(..., min_length=1, max_length=4096)


class GenerateResponse(BaseModel):
    videoId: str
    type: str
    content: str
    format: str = "markdown"


class ChatResponse(BaseModel):
    videoId: str
    answer: str


class FuseCitation(BaseModel):
    time: float
    speaker: str
    text: str


class FuseRequest(BaseModel):
    videoId: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    segments: list[SegmentOut] = Field(..., max_length=5000)
    a: str = Field(..., min_length=1, max_length=256)
    b: str = Field(..., min_length=1, max_length=256)


class FuseResponse(BaseModel):
    videoId: str
    explanation: str
    citations: list[FuseCitation]


class TranslateRequest(BaseModel):
    videoId: str = Field(..., min_length=1, max_length=64, pattern=r"^[a-zA-Z0-9_\-]+$")
    segments: list[SegmentOut] = Field(..., max_length=5000)
    targetLanguage: str = Field(..., min_length=1, max_length=16)
    nodeLabels: dict[str, str] | None = None


class TranslateResponse(BaseModel):
    videoId: str
    targetLanguage: str
    segments: list[SegmentOut]
    nodeLabels: dict[str, str] | None = None


class ChapterOut(BaseModel):
    id: str
    title: str
    start: float
    end: float
    summary: str = ""
    keywords: list[str] = []


ProcessResponse.model_rebuild()
