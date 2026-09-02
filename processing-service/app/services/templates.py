"""Deterministic template generators used when no LLM is available.

These guarantee the API still returns useful content (summary, notes, quiz,
answers) without any external model.
"""
from app.core.models import get_spacy


def format_ts(seconds: float) -> str:
    return f"{int(seconds // 60)}:{int(seconds % 60):02d}"


def template_generate(type_: str, full_text: str, segments: list) -> str:
    words = full_text.split()
    sentences = full_text.replace("?", ".").replace("!", ".").split(".")
    sentences = [s.strip() for s in sentences if len(s.strip()) > 20]

    if type_ == "summary":
        parts = ["# Summary", f"**Duration**: ~{len(segments)} segments, {len(words)} words",
                 "This video covers approximately %d key statements.\n" % len(sentences),
                 "## Key Points"]
        for s in sentences[:8]:
            parts.append(f"- {s}")
        return "\n".join(parts)

    if type_ == "notes":
        parts = ["# Study Notes", "## Key Terms"]
        nlp = get_spacy()
        doc = nlp(full_text[:3000])
        seen = set()
        for ent in doc.ents:
            if ent.label_ in ("PERSON", "ORG", "GPE") and ent.text.lower() not in seen:
                seen.add(ent.text.lower())
                parts.append(f"- **{ent.text}** ({ent.label_})")
        parts.append("\n## Timestamps")
        for s in segments[:15]:
            speaker = f" [{s.speaker}]" if s.speaker else ""
            parts.append(f"- **{format_ts(s.start)}**{speaker}: {s.text}")
        return "\n".join(parts)

    if type_ == "quiz":
        parts = ["# Quiz"]
        sentences_q = [s for s in sentences if len(s) > 30][:10]
        for i, s in enumerate(sentences_q[:5]):
            parts.append(f"### Question {i+1}")
            parts.append(f'What is the main idea of this statement: "{s[:100]}..."\n')
        parts.append("\n---\n")
        parts.append("*Note: Install an LLM API key for better quiz generation.*")
        return "\n".join(parts)

    return "Content generation requires an LLM provider (set LLM_API_KEY or enable Ollama)."


def template_answer(question: str, context: str, full_text: str) -> str:
    words_in_q = set(question.lower().split())
    scored = []
    for s in full_text.split("."):
        s = s.strip()
        if len(s) < 10:
            continue
        score = sum(1 for w in words_in_q if w in s.lower())
        scored.append((score, s))

    scored.sort(reverse=True)
    top = [s for score, s in scored if score > 0][:3]

    if top:
        return "Based on the transcript:\n\n" + "\n".join(f"- {t}." for t in top)
    return ("I couldn't find specific information about that in the transcript. "
            "Try rephrasing your question or set LLM_API_KEY / enable Ollama for AI-powered answers.")