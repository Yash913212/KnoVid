"""OpenAI-compatible LLM client with Ollama fallback and deterministic
template fallbacks when no model is configured."""
import logging

from app.core.config import settings
from app.schemas.schemas import SegmentOut

logger = logging.getLogger(__name__)


def llm_available() -> bool:
    """True when at least one LLM provider is configured."""
    return bool(settings.llm_api_key) or settings.ollama_enabled


async def _call_provider(
    client,
    provider: str,
    url: str,
    api_key: str,
    model: str,
    system: str,
    user: str,
) -> str | None:
    headers = {"Content-Type": "application/json"}
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

    resp = await client.post(
        f"{url.rstrip('/')}/chat/completions",
        headers=headers,
        json=payload,
    )
    resp.raise_for_status()
    content = resp.json()["choices"][0]["message"]["content"]
    if isinstance(content, str) and content.strip():
        return content
    return None


async def call_llm(system: str, user: str) -> str | None:
    providers = []
    if settings.llm_api_key:
        providers.append(("OpenRouter", settings.llm_api_url, settings.llm_api_key, settings.llm_model))
    if settings.ollama_enabled:
        providers.append(("Ollama", settings.ollama_api_url, settings.ollama_api_key, settings.ollama_model))

    if not providers:
        return None

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
                            return result
                        break
                    except Exception as e:  # noqa: BLE001
                        status = getattr(getattr(e, "response", None), "status_code", None)
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
        logger.error("LLM client failed: %r", e)

    return None


def format_transcript(segments: list[SegmentOut]) -> str:
    lines = []
    for s in segments:
        speaker = f"[{s.speaker}] " if s.speaker else ""
        ts = f"{int(s.start//60)}:{int(s.start%60):02d}"
        lines.append(f"({ts}) {speaker}{s.text}")
    return "\n".join(lines)
