"""Knowledge-graph extraction from a transcript: NER entities, TF-IDF
keywords, and per-segment topic groups."""
import logging
import re

from sklearn.feature_extraction.text import TfidfVectorizer

from app.core.config import settings
from app.core.models import get_spacy
from app.schemas.schemas import GraphEdge, GraphNode, SegmentOut
from app.services.media import extract_keyword_fallback, find_timestamp, slug

logger = logging.getLogger(__name__)

ENTITY_TYPES = ("PERSON", "ORG", "GPE", "LOC", "PRODUCT", "EVENT", "WORK_OF_ART", "LAW")


def extract_entities(
    segments: list[SegmentOut], full_text: str, seen_id: set[str]
) -> dict:
    nlp = get_spacy()
    doc = nlp(full_text)

    node_map: dict[str, GraphNode] = {}
    seg_texts = [(s.start, s.text.lower()) for s in segments]

    for ent in doc.ents:
        if ent.label_ not in ENTITY_TYPES:
            continue

        node_id = slug(ent.text)
        if node_id in seen_id:
            continue
        seen_id.add(node_id)

        ts = find_timestamp(ent.text, seg_texts)
        node_map[node_id] = GraphNode(
            id=node_id,
            label=ent.text,
            type="entity",
            timestampRef=ts,
            summary=f"{ent.label_}: {ent.text}",
            metadata={"entityType": ent.label_},
        )

    return {"nodes": list(node_map.values()), "edges": []}


def extract_keywords(
    segments: list[SegmentOut], full_text: str, seen_id: set[str]
) -> dict:
    seg_texts = [s.text for s in segments if s.text.strip()]
    if len(seg_texts) < 2:
        return {"nodes": [], "edges": []}

    try:
        vectorizer = TfidfVectorizer(
            max_features=30,
            stop_words="english",
            ngram_range=(1, 2),
        )
        matrix = vectorizer.fit_transform(seg_texts)
        scores = zip(vectorizer.get_feature_names_out(), matrix.sum(axis=0).tolist()[0])
        top_keywords = sorted(scores, key=lambda x: x[1], reverse=True)[:20]
    except Exception:  # noqa: BLE001
        logger.debug("TF-IDF keyword extraction failed; using regex fallback")
        top_keywords = extract_keyword_fallback(full_text)

    seg_lookup = [(s.start, s.text.lower()) for s in segments]
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    seen_kw: set[str] = set()
    for kw, _score in top_keywords:
        node_id = slug(kw)
        if node_id in seen_id or node_id in seen_kw:
            continue
        seen_id.add(node_id)
        seen_kw.add(node_id)

        ts = find_timestamp(kw, seg_lookup)
        nodes.append(GraphNode(
            id=node_id,
            label=kw.title(),
            type="keyword",
            timestampRef=ts,
        ))

    return {"nodes": nodes, "edges": edges}


def extract_topics(
    segments: list[SegmentOut], full_text: str, seen_id: set[str]
) -> dict:
    seg_texts = [s.text for s in segments if s.text.strip()]
    if len(seg_texts) < 3:
        return {"nodes": [], "edges": []}

    try:
        vectorizer = TfidfVectorizer(
            max_features=50,
            stop_words="english",
            max_df=0.85,
            min_df=1,
        )
        matrix = vectorizer.fit_transform(seg_texts)
        feature_names = vectorizer.get_feature_names_out()

        topic_labels: list[str] = []
        topic_keywords: list[list[str]] = []

        # Each row is a transcript segment and each column is a term. Build
        # compact topic labels from high-signal terms in representative
        # segments.
        for topic_idx in range(min(8, matrix.shape[0])):
            row = matrix[topic_idx].toarray().flatten()
            top_indices = row.argsort()[-5:][::-1]
            words = [feature_names[i] for i in top_indices if row[i] > 0.1]
            if words:
                label = ", ".join(words[:3])
                topic_labels.append(label)
                topic_keywords.append(words)
    except Exception:  # noqa: BLE001
        return {"nodes": [], "edges": []}

    seg_lookup = [(s.start, s.text.lower()) for s in segments]
    nodes: list[GraphNode] = []
    edges: list[GraphEdge] = []

    for i, label in enumerate(topic_labels):
        node_id = f"topic_{i}"
        if node_id in seen_id:
            continue
        seen_id.add(node_id)

        first_word = topic_keywords[i][0] if topic_keywords[i] else label
        ts = find_timestamp(first_word, seg_lookup)
        nodes.append(GraphNode(
            id=node_id,
            label=label[:60],
            type="topic",
            timestampRef=ts,
            summary=f"Topic group: {label}",
        ))

        for kw in topic_keywords[i]:
            kw_id = slug(kw)
            if kw_id in seen_id:
                edges.append(GraphEdge(
                    source=node_id,
                    target=kw_id,
                    relation="includes",
                ))

    return {"nodes": nodes, "edges": edges}