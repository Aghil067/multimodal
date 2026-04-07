import httpx
import logging
from typing import List, Dict, Any
from fastapi import HTTPException

logger = logging.getLogger(__name__)

TRAVEL_MIDWEST_BASE = "https://travelmidwest.com/lmiga"
DEFAULT_BBOX = [-88.7571, 41.5229, -86.9993, 42.0880] # Chicago area

async def fetch_travelmidwest_congestion(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch congestion map data (encoded lines) from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/congestionMap.json?type=encoded_lines"
    payload = {
        "bbox": bbox,
        "exclude": []
    }
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                "Referer": "https://travelmidwest.com/lmiga/map.jsp",
                "Origin": "https://travelmidwest.com",
                "Content-Type": "application/json"
            }
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching Travel Midwest congestion: {e}")
        return {"type": "FeatureCollection", "features": []}

async def fetch_travelmidwest_incidents(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch incident map data (points) from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/incidentMap.json?type=points"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                "Referer": "https://travelmidwest.com/lmiga/map.jsp",
                "Origin": "https://travelmidwest.com",
                "Content-Type": "application/json"
            }
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching Travel Midwest incidents: {e}")
        return {"type": "FeatureCollection", "features": []}

async def fetch_travelmidwest_weather(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch weather map data from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/weatherMap.json"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                "Referer": "https://travelmidwest.com/lmiga/map.jsp",
                "Origin": "https://travelmidwest.com",
                "Content-Type": "application/json"
            }
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching Travel Midwest weather: {e}")
        return {"type": "FeatureCollection", "features": []}

async def fetch_travelmidwest_realtime_traffic(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch real-time traffic data (full lines) from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/realTimeTrafficMap.json?type=encoded_lines"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                "Referer": "https://travelmidwest.com/lmiga/map.jsp",
                "Origin": "https://travelmidwest.com",
                "Content-Type": "application/json"
            }
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching Travel Midwest real-time traffic: {e}")
        return {"type": "FeatureCollection", "features": []}

async def fetch_travelmidwest_construction(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch construction data from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/constructionMap.json"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36",
                "Referer": "https://travelmidwest.com/lmiga/map.jsp",
                "Origin": "https://travelmidwest.com",
                "Content-Type": "application/json"
            }
            response = await client.post(url, json=payload, headers=headers)
            response.raise_for_status()
            return response.json()
    except Exception as e:
        logger.error(f"Error fetching Travel Midwest construction: {e}")
        return {"type": "FeatureCollection", "features": []}
