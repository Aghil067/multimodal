import httpx
import logging
from typing import List, Dict, Any
from fastapi import HTTPException
from app.utils.cache import ttl_cache_async

logger = logging.getLogger(__name__)

TRAVEL_MIDWEST_BASE = "https://travelmidwest.com/lmiga"
DEFAULT_BBOX = [-88.7571, 41.5229, -86.9993, 42.0880] # Chicago area


def get_fallback_travelmidwest_congestion() -> Dict[str, Any]:
    """Demo congestion lines so the map still renders when TravelMidwest is unavailable."""
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-87.652, 41.899],
                        [-87.646, 41.894],
                        [-87.640, 41.889],
                        [-87.634, 41.884],
                        [-87.629, 41.879],
                        [-87.624, 41.874],
                    ],
                },
                "properties": {
                    "id": "TM-FALLBACK-DOWNTOWN-HEAVY",
                    "cng": "H",
                    "a": False,
                    "e": False,
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-87.644, 41.905],
                        [-87.637, 41.900],
                        [-87.631, 41.895],
                        [-87.625, 41.891],
                        [-87.619, 41.886],
                    ],
                },
                "properties": {
                    "id": "TM-FALLBACK-DOWNTOWN-MODERATE",
                    "cng": "M",
                    "a": False,
                    "e": False,
                },
            },
            {
                "type": "Feature",
                "geometry": {
                    "type": "LineString",
                    "coordinates": [
                        [-87.666, 41.882],
                        [-87.655, 41.882],
                        [-87.644, 41.882],
                        [-87.633, 41.882],
                        [-87.622, 41.882],
                    ],
                },
                "properties": {
                    "id": "TM-FALLBACK-WEST-TO-LOOP",
                    "cng": "N",
                    "a": False,
                    "e": False,
                },
            },
        ],
    }


def get_fallback_travelmidwest_incidents() -> Dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "GeometryCollection",
                    "geometries": [
                        {
                            "type": "Point",
                            "coordinates": [-87.6298, 41.8786],
                        }
                    ],
                },
                "properties": {
                    "id": "TM-FALLBACK-INC-1",
                    "desc": "Lane blockage",
                    "locDesc": "Downtown Chicago near The Loop",
                    "closure": "Road blocked",
                    "stat": "Active",
                    "start": "Demo",
                    "end": "Unknown",
                    "src": "Demo fallback",
                    "lanes": "full",
                    "ev": False,
                    "locDir": "EB",
                    "dur": "short",
                    "respDet": None,
                    "biDir": "false",
                },
            }
        ],
    }


def get_fallback_travelmidwest_construction() -> Dict[str, Any]:
    return {
        "type": "FeatureCollection",
        "features": [
            {
                "type": "Feature",
                "geometry": {
                    "type": "GeometryCollection",
                    "geometries": [
                        {
                            "type": "Point",
                            "coordinates": [-87.6355, 41.8852],
                        }
                    ],
                },
                "properties": {
                    "id": "TM-FALLBACK-CONST-1",
                    "desc": "Bridge maintenance",
                    "locDesc": "Near West Loop freight corridor",
                    "closure": "Partial lane closure",
                    "sev": "Medium",
                    "time": "Ongoing",
                    "dur": "2 weeks",
                    "src": "Demo fallback",
                },
            }
        ],
    }

@ttl_cache_async(ttl_seconds=120, max_entries=24)
async def fetch_travelmidwest_congestion(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch congestion map data (encoded lines) from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/congestionMap.json?type=encoded_lines"
    payload = {
        "bbox": bbox,
        "exclude": []
    }
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
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
        return get_fallback_travelmidwest_congestion()

@ttl_cache_async(ttl_seconds=90, max_entries=24)
async def fetch_travelmidwest_incidents(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch incident map data (points) from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/incidentMap.json?type=points"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
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
        return get_fallback_travelmidwest_incidents()

@ttl_cache_async(ttl_seconds=180, max_entries=24)
async def fetch_travelmidwest_weather(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch weather map data from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/weatherMap.json"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
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

@ttl_cache_async(ttl_seconds=90, max_entries=24)
async def fetch_travelmidwest_realtime_traffic(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch real-time traffic data (full lines) from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/realTimeTrafficMap.json?type=encoded_lines"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
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
        return get_fallback_travelmidwest_congestion()

@ttl_cache_async(ttl_seconds=300, max_entries=24)
async def fetch_travelmidwest_construction(bbox: List[float] = DEFAULT_BBOX) -> Dict[str, Any]:
    """Fetch construction data from Travel Midwest."""
    url = f"{TRAVEL_MIDWEST_BASE}/constructionMap.json"
    payload = {"bbox": bbox}
    
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
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
        return get_fallback_travelmidwest_construction()
