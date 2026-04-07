"""
Alerts API routes.
"""
from fastapi import APIRouter, Query
from typing import Optional

from app.collectors.news_collector import fetch_disaster_news, fetch_weather_alerts

router = APIRouter(prefix="/api/alerts", tags=["Alerts"])


@router.get("/weather")
async def get_weather_alerts():
    """Get active weather alerts for Chicago/Illinois from NWS."""
    alerts = await fetch_weather_alerts(state="IL")
    return {
        "alerts": alerts,
        "count": len(alerts)
    }


@router.get("/news")
async def get_disaster_news(
    query: Optional[str] = None,
    limit: int = Query(20, ge=5, le=100)
):
    """Get disaster-related news articles for Chicago."""
    articles = await fetch_disaster_news(query=query, page_size=limit)
    return {
        "articles": articles,
        "count": len(articles)
    }


@router.get("/all")
async def get_all_alerts():
    """Get all types of alerts combined."""
    import asyncio

    weather_task = fetch_weather_alerts(state="IL")
    news_task = fetch_disaster_news()

    weather, news = await asyncio.gather(
        weather_task, news_task,
        return_exceptions=True
    )

    if isinstance(weather, Exception):
        weather = []
    if isinstance(news, Exception):
        news = []

    # Combine and sort by severity
    combined = []
    for w in weather:
        combined.append({
            "type": "weather",
            "severity": w.get("severity", "low"),
            "title": w.get("event", "Weather Alert"),
            "message": w.get("headline", ""),
            "description": w.get("description", "")[:500],
            "areas": w.get("areas", ""),
            "source": "nws",
            "timestamp": w.get("effective", ""),
        })

    for n in news:
        combined.append({
            "type": "news",
            "severity": "medium",
            "title": n.get("title", ""),
            "message": n.get("text", "")[:300],
            "url": n.get("url", ""),
            "source": "newsapi",
            "timestamp": n.get("published_at", ""),
        })

    # Sort: critical/high first
    severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
    combined.sort(key=lambda x: severity_order.get(x["severity"], 4))

    return {
        "alerts": combined,
        "weather_count": len(weather),
        "news_count": len(news),
        "total": len(combined)
    }
