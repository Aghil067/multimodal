"""
Chicago Traffic Tracker data collector.
Uses the City of Chicago's open data SODA API to fetch real-time traffic congestion data.
API Docs: https://data.cityofchicago.org/Transportation/Chicago-Traffic-Tracker-Congestion-Estimates-by-Se/n4j6-wkkf
"""
import httpx
import logging
from typing import List, Dict, Any
from datetime import datetime

logger = logging.getLogger(__name__)

# Chicago Traffic Tracker - Congestion Estimates by Segments
CHICAGO_TRAFFIC_URL = "https://data.cityofchicago.org/resource/n4j6-wkkf.json"


def calculate_congestion_level(current_speed: float, free_flow_speed: float) -> str:
    """Classify congestion level based on speed ratio."""
    if free_flow_speed <= 0:
        return "unknown"
    ratio = current_speed / free_flow_speed
    if ratio >= 0.8:
        return "low"
    elif ratio >= 0.5:
        return "medium"
    elif ratio >= 0.25:
        return "high"
    else:
        return "severe"


async def fetch_chicago_traffic(limit: int = 1000) -> List[Dict[str, Any]]:
    """
    Fetch real-time traffic congestion data from Chicago's SODA API.
    Returns a list of traffic segment dictionaries.
    """
    params = {
        "$limit": limit,
        "$order": ":id",
        "$where": "_current_speed IS NOT NULL"
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(CHICAGO_TRAFFIC_URL, params=params)
            response.raise_for_status()
            raw_data = response.json()

        segments = []
        for record in raw_data:
            try:
                current_speed = float(record.get("_current_speed", 0) or 0)
                free_flow_speed = float(record.get("_traffic", 0) or 0)

                # Extract coordinates from the start point
                start_lon = record.get("_start_longitude")
                start_lat = record.get("_start_latitude")

                if not start_lat or not start_lon:
                    # Try the location field
                    location = record.get("_location", {})
                    if isinstance(location, dict):
                        start_lat = location.get("latitude")
                        start_lon = location.get("longitude")

                if not start_lat or not start_lon:
                    continue

                segment = {
                    "segment_id": str(record.get("segmentid", record.get("_segmentid", ""))),
                    "street": record.get("_street", record.get("street", "Unknown")),
                    "direction": record.get("_direction", record.get("_fromst", "")),
                    "from_street": record.get("_fromst", ""),
                    "to_street": record.get("_tost", ""),
                    "current_speed": current_speed,
                    "free_flow_speed": free_flow_speed,
                    "congestion_level": calculate_congestion_level(current_speed, free_flow_speed),
                    "latitude": float(start_lat),
                    "longitude": float(start_lon),
                    "timestamp": datetime.utcnow().isoformat()
                }
                segments.append(segment)
            except (ValueError, TypeError, KeyError) as e:
                logger.debug(f"Skipping malformed traffic record: {e}")
                continue

        logger.info(f"Fetched {len(segments)} traffic segments from Chicago")
        return segments

    except httpx.HTTPStatusError as e:
        logger.error(f"HTTP error fetching Chicago traffic: {e.response.status_code}")
        return []
    except Exception as e:
        logger.error(f"Error fetching Chicago traffic data: {e}")
        return []


async def fetch_traffic_near_location(lat: float, lng: float, radius_km: float = 2.0) -> List[Dict]:
    """
    Fetch traffic data near a specific location.
    Uses simple bounding box filter via SODA API.
    """
    # Approximate degree offset for the given radius
    lat_offset = radius_km / 111.0
    lng_offset = radius_km / (111.0 * 0.7)  # Approximate for Chicago's latitude

    where_clause = (
        f"_start_latitude > '{lat - lat_offset}' AND "
        f"_start_latitude < '{lat + lat_offset}' AND "
        f"_start_longitude > '{lng - lng_offset}' AND "
        f"_start_longitude < '{lng + lng_offset}' AND "
        f"_current_speed IS NOT NULL"
    )

    params = {
        "$limit": 200,
        "$where": where_clause
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(CHICAGO_TRAFFIC_URL, params=params)
            response.raise_for_status()
            raw_data = response.json()

        segments = []
        for record in raw_data:
            try:
                current_speed = float(record.get("_current_speed", 0) or 0)
                free_flow_speed = float(record.get("_traffic", 0) or 0)
                start_lat = record.get("_start_latitude")
                start_lon = record.get("_start_longitude")

                if not start_lat or not start_lon:
                    continue

                segment = {
                    "segment_id": str(record.get("segmentid", "")),
                    "street": record.get("_street", "Unknown"),
                    "current_speed": current_speed,
                    "free_flow_speed": free_flow_speed,
                    "congestion_level": calculate_congestion_level(current_speed, free_flow_speed),
                    "latitude": float(start_lat),
                    "longitude": float(start_lon),
                }
                segments.append(segment)
            except (ValueError, TypeError):
                continue

        return segments

    except Exception as e:
        logger.error(f"Error fetching traffic near ({lat}, {lng}): {e}")
        return []
