"""
News API collector.
Fetches disaster and supply chain disruption news for Chicago.
Also integrates with NWS (National Weather Service) for weather alerts.
"""
import httpx
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone
from app.config import settings

logger = logging.getLogger(__name__)

NEWS_API_URL = "https://newsapi.org/v2/everything"
NWS_ALERTS_URL = "https://api.weather.gov/alerts/active"


async def fetch_disaster_news(
    query: str = None,
    page_size: int = 20
) -> List[Dict[str, Any]]:
    """
    Fetch news articles related to Chicago disasters and supply disruptions
    from NewsAPI.
    """
    if not settings.NEWS_API_KEY:
        logger.warning("News API key not configured, skipping news collection")
        return []

    search_query = query or (
        '("Chicago" AND ("flood" OR "storm" OR "shortage" OR "disruption" '
        'OR "emergency" OR "disaster" OR "supply chain" OR "evacuation" '
        'OR "power outage" OR "road closure"))'
    )

    params = {
        "apiKey": settings.NEWS_API_KEY,
        "q": search_query,
        "language": "en",
        "sortBy": "publishedAt",
        "pageSize": page_size,
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(NEWS_API_URL, params=params)
            response.raise_for_status()
            data = response.json()

        articles = data.get("articles", [])
        results = []

        for article in articles:
            published = article.get("publishedAt", "")
            try:
                published_dt = datetime.fromisoformat(published.replace("Z", "+00:00"))
            except (ValueError, AttributeError):
                published_dt = datetime.now(timezone.utc)

            results.append({
                "source": "newsapi",
                "title": article.get("title", ""),
                "text": f"{article.get('title', '')}. {article.get('description', '')}",
                "url": article.get("url", ""),
                "author": article.get("author") or article.get("source", {}).get("name", "Unknown"),
                "published_at": published_dt.isoformat(),
                "image_url": article.get("urlToImage"),
            })

        logger.info(f"Fetched {len(results)} disaster news articles")
        return results

    except httpx.HTTPStatusError as e:
        logger.error(f"NewsAPI HTTP error: {e.response.status_code}")
        return []
    except Exception as e:
        logger.error(f"Error fetching news: {e}")
        return []


async def fetch_weather_alerts(
    state: str = "IL",
    zone: str = None
) -> List[Dict[str, Any]]:
    """
    Fetch active weather alerts from the National Weather Service (NWS) API.
    This API is completely free with no API key required.
    """
    params = {}
    if zone:
        params["zone"] = zone
    else:
        params["area"] = state

    headers = {
        "User-Agent": "(multimodal-disruption-monitor, contact@example.com)",
        "Accept": "application/geo+json"
    }

    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            response = await client.get(NWS_ALERTS_URL, params=params, headers=headers)
            response.raise_for_status()
            data = response.json()

        features = data.get("features", [])
        alerts = []

        for feature in features:
            props = feature.get("properties", {})
            geometry = feature.get("geometry")

            # Extract coordinates if available
            lat, lng = None, None
            if geometry and geometry.get("type") == "Point":
                coords = geometry.get("coordinates", [])
                if len(coords) >= 2:
                    lng, lat = coords[0], coords[1]

            severity_map = {
                "Extreme": "critical",
                "Severe": "high",
                "Moderate": "medium",
                "Minor": "low",
                "Unknown": "low"
            }

            alerts.append({
                "source": "nws",
                "event": props.get("event", ""),
                "headline": props.get("headline", ""),
                "description": props.get("description", ""),
                "severity": severity_map.get(props.get("severity", "Unknown"), "low"),
                "urgency": props.get("urgency", ""),
                "areas": props.get("areaDesc", ""),
                "effective": props.get("effective", ""),
                "expires": props.get("expires", ""),
                "latitude": lat,
                "longitude": lng,
            })

        # Filter for Chicago-area alerts
        chicago_alerts = [
            a for a in alerts
            if "chicago" in a.get("areas", "").lower()
            or "cook" in a.get("areas", "").lower()
            or "dupage" in a.get("areas", "").lower()
            or "illinois" in a.get("areas", "").lower()
        ]

        logger.info(f"Fetched {len(chicago_alerts)} weather alerts for Chicago area")
        return chicago_alerts if chicago_alerts else alerts[:10]

    except Exception as e:
        logger.error(f"Error fetching NWS alerts: {e}")
        return []
