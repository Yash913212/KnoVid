"""Groq LLM client with deterministic template fallbacks."""
import logging

from app.core.config import settings
from app.schemas.schemas import SegmentOut

logger = logging.getLogger(__name__)


def llm_available() -> bool:
    """True when the required LLM key is configured."""
    return bool(settings.llm_api_key)


def get_llm_status() -> dict:
    provider = "Groq" if "groq" in settings.llm_api_url.lower() else "LLM API"
    return {
        "available": bool(settings.llm_api_key),
        "provider": provider,
        "model": settings.llm_model,
        "url": settings.llm_api_url
    }


async def verify_llm_key(api_key: str | None, api_url: str | None = None) -> dict:
    import httpx
    if not api_key:
        return {"valid": False, "error": "No key provided"}
    
    url = api_url or settings.llm_api_url
    try:
        async with httpx.AsyncClient(timeout=10) as client:
            base_url = url.replace("/chat/completions", "").rstrip("/")
            resp = await client.get(
                f"{base_url}/models",
                headers={"Authorization": f"Bearer {api_key}"}
            )
            if resp.status_code == 200:
                return {"valid": True, "data": resp.json()}
            return {"valid": False, "error": f"HTTP {resp.status_code}: {resp.text}"}
    except Exception as e:
        return {"valid": False, "error": str(e)}


async def _call_provider(
    client,
    provider: str,
    url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
) -> str | None:
    import time
    headers = {
        "Content-Type": "application/json",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "KnoVid",
    }
    if api_key:
        headers["Authorization"] = f"Bearer {api_key}"

    payload = {
        "model": model,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": user},
        ],
        "temperature": 0.7,
        "max_tokens": 2048,
    }
    t0 = time.time()
    logger.info(f"→ {provider} {url} model={model} sys={len(system)}c user={len(user)}c")
    resp = await client.post(
        f"{url.rstrip('/')}/chat/completions",
        headers=headers,
        json=payload,
    )
    ms = int((time.time() - t0) * 1000)
    logger.info(f"← {provider} HTTP {resp.status_code} ({ms}ms)")
    if resp.status_code >= 400:
        logger.error(f"✗ {provider} body: {resp.text[:2000]}")
    resp.raise_for_status()
    data = resp.json()
    content = data["choices"][0]["message"]["content"]
    # Also log reasoning if present (nemotron)
    reasoning = data["choices"][0]["message"].get("reasoning", "")
    if reasoning:
        logger.info(f"  {provider} reasoning {len(reasoning)}c")
    if isinstance(content, str) and content.strip():
        logger.info(f"✓ {provider} returned {len(content)} chars — preview: {content[:200].replace(chr(10), ' ')}…")
        return content
    logger.warning(f"⚠ {provider} empty content: {str(data)[:1000]}")
    return None


async def call_llm(system: str, user: str) -> str | None:
    if not settings.llm_api_key:
        logger.warning("⚠ call_llm: LLM_API_KEY missing — will use template fallback")
        return None
    provider_name = "Groq" if "groq" in settings.llm_api_url.lower() else "LLM API"
    provider = (provider_name, settings.llm_api_url, settings.llm_api_key, settings.llm_model)
    logger.info(f"call_llm: using {provider_name} — sys {len(system)}c user {len(user)}c")

    import httpx
    # A 401/402/403 means the key is bad, exhausted, or spend-limited.
    terminal_status = {401, 402, 403}

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            provider_name, url, api_key, model = provider
            for attempt in range(2):
                try:
                    result = await _call_provider(client, provider_name, url, api_key, model, system, user)
                    if result:
                        logger.info(f"✓ call_llm: success via {provider_name} ({len(result)} chars)")
                        return result
                    break
                except Exception as e:  # noqa: BLE001
                    import traceback
                    status = getattr(getattr(e, "response", None), "status_code", None)
                    logger.error(f"✗ {provider_name} attempt {attempt + 1}/2 failed: {e!r} status={status}")
                    if hasattr(e, "response") and getattr(e.response, "text", None):
                        try:
                            logger.error(f"  body: {e.response.text[:1500]}")
                        except Exception:
                            pass
                    traceback.print_exc()
                    if status in terminal_status:
                        logger.warning("%s rejected the request (HTTP %s). Check the LLM key and model access.", provider_name, status)
                        break
                    logger.warning("%s call failed (attempt %d/2): %r", provider_name, attempt + 1, e)
    except Exception as e:  # noqa: BLE001
        import traceback
        logger.error(f"✗ LLM client fatal: {e!r}")
        traceback.print_exc()

    logger.warning("⚠ call_llm: all providers failed — falling back to template")
    return None


def format_transcript(segments: list[SegmentOut]) -> str:
    lines = []
    for s in segments:
        speaker = f"[{s.speaker}] " if s.speaker else ""
        ts = f"{int(s.start//60)}:{int(s.start%60):02d}"
        lines.append(f"({ts}) {speaker}{s.text}")
    return "\n".join(lines)
