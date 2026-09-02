"""LLM-backed content endpoints: /generate, /chat, /fuse, /translate.

Every endpoint has a deterministic template fallback so it still works when
no LLM provider (OpenRouter / Ollama) is configured.
"""
import logging
import re

from fastapi import APIRouter, Depends, HTTPException

from app.schemas.schemas import (
    ChatRequest,
    ChatResponse,
    FuseCitation,
    FuseRequest,
    FuseResponse,
    GenerateRequest,
    GenerateResponse,
    TranslateRequest,
    TranslateResponse,
)
from app.services.llm import call_llm, format_transcript, llm_available
from app.services.media import require_auth
from app.services.templates import (
    format_ts,
    template_answer,
    template_generate,
)

logger = logging.getLogger(__name__)
router = APIRouter()


@router.post("/generate", response_model=GenerateResponse)
async def generate_content(req: GenerateRequest, _auth: None = Depends(require_auth)):
    transcript_text = format_transcript(req.segments)
    full_text = " ".join(s.text for s in req.segments)

    system_prompts = {
        "summary": (
            "You are a study assistant. Summarize the following lecture/transcript "
            "concisely, highlighting key concepts, arguments, and conclusions. "
            "Format in markdown with bullet points and sections."
        ),
        "notes": (
            "You are a study assistant. Create structured study notes from the "
            "following transcript. Extract key terms, definitions, important quotes "
            "(with timestamps), and main ideas. Format in markdown with headings "
            "and bullet points."
        ),
        "quiz": (
            "You are a quiz creator. Generate 5-10 review questions based on the "
            "following transcript. Include a mix of multiple-choice and short-answer "
            "questions. Provide an answer key. Format in markdown."
        ),
    }

    prompt = system_prompts.get(req.type)
    if not prompt:
        raise HTTPException(400, f"Unknown generation type: {req.type}")

    llm_content = await call_llm(prompt, transcript_text)
    if llm_content:
        return GenerateResponse(videoId=req.videoId, type=req.type, content=llm_content)

    fallback = template_generate(req.type, full_text, req.segments)
    return GenerateResponse(videoId=req.videoId, type=req.type, content=fallback)


@router.post("/chat", response_model=ChatResponse)
async def chat_with_video(req: ChatRequest, _auth: None = Depends(require_auth)):
    transcript_text = format_transcript(req.segments)
    full_text = " ".join(s.text for s in req.segments)

    relevant = [
        s for s in req.segments
        if any(w.lower() in s.text.lower() for w in req.question.split())
    ]
    context = format_transcript(relevant[:10]) if relevant else transcript_text[:3000]

    system = (
        "You are a helpful assistant answering questions about a video transcript. "
        "Answer concisely using the provided context. If the answer isn't in the "
        "transcript, say so."
    )
    llm_answer = await call_llm(system, f"Context:\n{context}\n\nQuestion: {req.question}")
    if llm_answer:
        return ChatResponse(videoId=req.videoId, answer=llm_answer)

    fallback = template_answer(req.question, context, full_text)
    return ChatResponse(videoId=req.videoId, answer=fallback)


def _fuse_context(segments, a: str, b: str) -> list[FuseCitation]:
    """Real evidence: transcript moments where concept A, B, or both appear."""
    a_mentions = [s for s in segments if a.lower() in s.text.lower()]
    b_mentions = [s for s in segments if b.lower() in s.text.lower()]
    b_ids = {id(s) for s in b_mentions}
    both = [s for s in a_mentions if id(s) in b_ids]

    citations: list[FuseCitation] = []
    seen = set()
    for s in both + a_mentions + b_mentions:
        key = (s.start, s.text)
        if key in seen:
            continue
        seen.add(key)
        citations.append(FuseCitation(time=s.start, speaker=s.speaker, text=s.text))
        if len(citations) >= 5:
            break
    return citations


@router.post("/fuse", response_model=FuseResponse)
async def fuse_concepts(req: FuseRequest, _auth: None = Depends(require_auth)):
    citations = _fuse_context(req.segments, req.a, req.b)

    if not citations:
        return FuseResponse(
            videoId=req.videoId,
            explanation=(
                f'"{req.a}" and "{req.b}" never appear in the transcript, so no '
                "connection can be grounded in this video. They may be related by "
                "topic instead — try asking the AI chat about the link."
            ),
            citations=[],
        )

    context = []
    for c in citations:
        speaker = f"[{c.speaker}] " if c.speaker else ""
        context.append(f"({format_ts(c.time)}) {speaker}{c.text}")
    context_text = "\n".join(context)

    system = (
        "You are an analyst for a video knowledge graph. Two concepts from the "
        "video were dragged together on a spatial canvas to be 'fused'. Using ONLY "
        "the transcript moments below, explain how the two concepts are connected "
        "in this specific video. Reference the speaker and timestamp where useful. "
        "Keep it to 2-4 sentences, plain text, no markdown."
    )
    user = (
        f"Concept A: {req.a}\nConcept B: {req.b}\n\n"
        f"Transcript moments where these concepts appear:\n{context_text}"
    )

    llm_explanation = await call_llm(system, user)
    if llm_explanation:
        return FuseResponse(videoId=req.videoId, explanation=llm_explanation, citations=citations)

    return FuseResponse(
        videoId=req.videoId,
        explanation=(
            f'In this video, "{req.a}" and "{req.b}" are discussed close together:\n\n'
            + "\n".join(
                f"- [{c.speaker or 'Speaker'} @ {format_ts(c.time)}] {c.text[:140]}"
                for c in citations[:3]
            )
            + "\n\nSet an LLM_API_KEY for a fully synthesized connection."
        ),
        citations=citations,
    )


@router.post("/translate", response_model=TranslateResponse)
async def translate_content(req: TranslateRequest, _auth: None = Depends(require_auth)):
    if not llm_available():
        return TranslateResponse(
            videoId=req.videoId,
            targetLanguage=req.targetLanguage,
            segments=req.segments,
            nodeLabels=req.nodeLabels,
        )

    texts_to_translate = [s.text for s in req.segments]
    node_label_items = list((req.nodeLabels or {}).items())
    all_texts = texts_to_translate + [label for _, label in node_label_items]

    batch_text = "\n".join(f"[{i}] {t}" for i, t in enumerate(all_texts))
    system = (
        f"You are a translator. Translate the following numbered texts to "
        f"{req.targetLanguage}. Respond with each line in the format '[index] "
        "translation', preserving the line numbering exactly. Only output the "
        "translations, no explanations."
    )

    translated = await call_llm(system, batch_text)
    if not translated:
        return TranslateResponse(
            videoId=req.videoId,
            targetLanguage=req.targetLanguage,
            segments=req.segments,
            nodeLabels=req.nodeLabels,
        )

    translated_map: dict[int, str] = {}
    for line in translated.strip().split("\n"):
        if line.strip():
            m = re.match(r"^\[(\d+)\]\s*(.*)", line.strip())
            if m:
                translated_map[int(m.group(1))] = m.group(2).strip()

    translated_segments = [
        SegmentOut(
            start=s.start,
            end=s.end,
            speaker=s.speaker,
            language=req.targetLanguage,
            text=translated_map.get(i, s.text),
            confidence=s.confidence,
        )
        for i, s in enumerate(req.segments)
    ]

    translated_labels: dict[str, str] | None = None
    if node_label_items:
        translated_labels = {}
        offset = len(texts_to_translate)
        for j, (key, _) in enumerate(node_label_items):
            translated_labels[key] = translated_map.get(offset + j, "")

    return TranslateResponse(
        videoId=req.videoId,
        targetLanguage=req.targetLanguage,
        segments=translated_segments,
        nodeLabels=translated_labels,
    )