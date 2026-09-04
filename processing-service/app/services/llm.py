"""OpenAI-compatible LLM client with Ollama fallback and deterministic
template fallbacks when no model is configured."""
import logging

from app.core.config import settings
from app.schemas.schemas import SegmentOut

logger = logging.getLogger(__name__)


def llm_available() -> bool:
    """True when at least one LLM provider is configured."""
    return bool(settings.llm_api_key) or settings.ollama_enabled


OPENROUTER_FALLBACK_MODELS = [
    "nvidia/nemotron-3.5-lightning:free",
    "meta-llama/llama-3.3-70b-instruct:free",
    "google/gemini-2.0-flash-lite-preview-02-05:free",
    "deepseek/deepseek-r1:free",
    "google/gemini-2.0-flash-001",
]


def get_llm_status() -> dict:
    """Return the current configuration status of LLM providers."""
    key = settings.llm_api_key
    has_key = bool(key)
    masked_key = f"{key[:8]}...{key[-4:]}" if (has_key and len(key) > 12) else ("***" if has_key else "")
    return {
        "configured": has_key or settings.ollama_enabled,
        "provider": "OpenRouter" if has_key else ("Ollama" if settings.ollama_enabled else "none"),
        "has_openrouter_key": has_key,
        "masked_key": masked_key,
        "model": settings.llm_model,
        "api_url": settings.llm_api_url,
    }


async def verify_openrouter_key(api_key: str | None = None) -> dict:
    """Verify an OpenRouter API key by making a lightweight query or auth check."""
    import httpx
    key = api_key or settings.llm_api_key
    if not key:
        return {"valid": False, "error": "No OpenRouter API key provided"}

    headers = {
        "Authorization": f"Bearer {key}",
        "HTTP-Referer": "http://localhost:5173",
        "X-Title": "KnoVid Knowledge Engine",
    }
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            # OpenRouter provides an auth key inspection endpoint: /api/v1/auth/key
            resp = await client.get("https://openrouter.ai/api/v1/auth/key", headers=headers)
            if resp.status_code == 200:
                data = resp.json()
                label = data.get("data", {}).get("label") or "OpenRouter Key"
                usage = data.get("data", {}).get("usage", 0)
                limit = data.get("data", {}).get("limit", "none")
                return {"valid": True, "label": label, "usage": usage, "limit": limit, "model": settings.llm_model}
            elif resp.status_code == 401:
                return {"valid": False, "error": "Invalid OpenRouter API key (Unauthorized)"}
            elif resp.status_code == 402:
                return {"valid": False, "error": "OpenRouter account credit limit reached"}
            else:
                return {"valid": False, "error": f"OpenRouter returned status {resp.status_code}"}
    except Exception as e:
        return {"valid": False, "error": f"Network error testing key: {str(e)}"}


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
        "X-Title": "KnoVid Knowledge Engine",
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
    if provider == "Ollama":
        payload["reasoning_effort"] = "none"

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
    reasoning = data["choices"][0]["message"].get("reasoning", "")
    if reasoning:
        logger.info(f"  {provider} reasoning {len(reasoning)}c")
    if isinstance(content, str) and content.strip():
        logger.info(f"✓ {provider} returned {len(content)} chars — preview: {content[:200].replace(chr(10), ' ')}…")
        return content
    logger.warning(f"⚠ {provider} empty content: {str(data)[:1000]}")
    return None


async def call_llm(
    system: str,
    user: str,
    api_key_override: str | None = None,
    model_override: str | None = None,
) -> str | None:
    providers = []
    active_key = api_key_override or settings.llm_api_key
    active_model = model_override or settings.llm_model

    if active_key:
        providers.append(("OpenRouter", settings.llm_api_url, active_key, active_model))
        # Add fallback models if primary model is busy/rate-limited
        for fb_model in OPENROUTER_FALLBACK_MODELS:
            if fb_model != active_model:
                providers.append(("OpenRouter", settings.llm_api_url, active_key, fb_model))

    if settings.ollama_enabled:
        providers.append(("Ollama", settings.ollama_api_url, settings.ollama_api_key, settings.ollama_model))

    if not providers:
        logger.warning("⚠ call_llm: NO providers configured (LLM_API_KEY missing and OLLAMA_ENABLED=false) — will use template fallback")

        return None
    logger.info(f"call_llm: trying {len(providers)} provider(s): {[p[0] for p in providers]} — sys {len(system)}c user {len(user)}c")

    import httpx
    # A 401/402/403 means the key is bad, exhausted, or spend-limited. That
    # will not heal with a retry, so remember it and skip to the next provider
    # for the rest of this request.
    terminal_status = {401, 402, 403}

    try:
        async with httpx.AsyncClient(timeout=120) as client:
            for provider, url, api_key, model in providers:
                # Retry once: the first call after a cold start can fail while
                # Ollama is still loading the model.
                for attempt in range(2):
                    try:
                        result = await _call_provider(client, provider, url, api_key, model, system, user)
                        if result:
                            logger.info(f"✓ call_llm: success via {provider} ({len(result)} chars)")
                            return result
                        break
                    except Exception as e:  # noqa: BLE001
                        import traceback
                        status = getattr(getattr(e, "response", None), "status_code", None)
                        logger.error(f"✗ {provider} attempt {attempt + 1}/2 failed: {e!r} status={status}")
                        if hasattr(e, "response") and getattr(e.response, "text", None):
                            try:
                                logger.error(f"  body: {e.response.text[:1500]}")
                            except Exception:
                                pass
                        traceback.print_exc()
                        if status in terminal_status:
                            logger.warning(
                                "%s rejected the request (HTTP %s). Skipping it for this call%s.",
                                provider,
                                status,
                                " — the API key has no credits or is invalid" if status == 402 else "",
                            )
                            break
                        logger.warning("%s call failed (attempt %d/2): %r", provider, attempt + 1, e)
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
