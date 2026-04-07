"""
Social media API routes.
"""
from fastapi import APIRouter, Query
from typing import Optional

from app.collectors.social_media import (
    fetch_reddit_posts,
    search_reddit_disruptions
)
from app.processors.nlp_engine import get_nlp_engine

router = APIRouter(prefix="/api/social", tags=["Social Media"])


@router.get("/reddit")
async def get_reddit_posts(limit: int = Query(50, ge=5, le=200)):
    """Fetch and analyze Reddit posts about Chicago disruptions."""
    posts = await fetch_reddit_posts(limit=limit)

    # Run NLP analysis on each post
    nlp = get_nlp_engine(use_transformers=False)  # Use keyword mode for speed
    analyzed = []

    for post in posts:
        analysis = nlp.analyze_text(post.get("text", ""))
        analyzed.append({
            **post,
            "sentiment": analysis["sentiment"],
            "disruption_type": analysis["disruption_type"],
            "confidence": analysis["confidence"],
            "keywords": analysis["keywords"],
            "location_hint": analysis.get("location_hint"),
        })

    return {
        "posts": analyzed,
        "count": len(analyzed),
        "disruption_summary": _summarize_disruptions(analyzed)
    }


@router.get("/search")
async def search_social(
    query: str = Query("chicago shortage OR flood OR storm")
):
    """Search Reddit for specific disruption-related queries."""
    posts = await search_reddit_disruptions(query)
    nlp = get_nlp_engine(use_transformers=False)
    analyzed = []

    for post in posts:
        analysis = nlp.analyze_text(post.get("text", ""))
        analyzed.append({
            **post,
            "sentiment": analysis["sentiment"],
            "disruption_type": analysis["disruption_type"],
            "confidence": analysis["confidence"],
        })

    return {"posts": analyzed, "count": len(analyzed)}


@router.post("/analyze")
async def analyze_text(text: str):
    """Analyze a single text for disruption indicators."""
    nlp = get_nlp_engine(use_transformers=False)
    result = nlp.analyze_text(text)
    return result


def _summarize_disruptions(posts: list) -> dict:
    """Summarize disruption types from analyzed posts."""
    summary = {}
    for post in posts:
        d_type = post.get("disruption_type", "unknown")
        if d_type not in summary:
            summary[d_type] = {"count": 0, "avg_confidence": 0.0}
        summary[d_type]["count"] += 1
        summary[d_type]["avg_confidence"] += post.get("confidence", 0)

    for d_type in summary:
        count = summary[d_type]["count"]
        summary[d_type]["avg_confidence"] = round(
            summary[d_type]["avg_confidence"] / count, 3
        ) if count > 0 else 0

    return summary
