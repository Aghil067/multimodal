"""
HERE Traffic API collector.
Fetches traffic flow and incidents data from HERE API.
Docs: https://developer.here.com/documentation/traffic-api/dev_guide/index.html
"""
import httpx
import logging
from typing import List, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)

HERE_FLOW_URL = "https://data.traffic.hereapi.com/v7/flow"
HERE_INCIDENTS_URL = "https://data.traffic.hereapi.com/v7/incidents"


async def fetch_here_traffic_flow(
    lat: float = None,
    lng: float = None,
    radius: int = 15000
) -> List[Dict[str, Any]]:
    """
    Fetch traffic flow data from HERE API around Chicago.
    Returns a list of traffic flow records.
    """
    if not settings.HERE_API_KEY:
        logger.warning("HERE API key not configured, skipping HERE traffic collection")
        return []

    center_lat = lat or settings.CHICAGO_LAT
    center_lng = lng or settings.CHICAGO_LNG

    params = {
        "apiKey": settings.HERE_API_KEY,
        "in": f"circle:{center_lat},{center_lng};r={radius}",
        "locationReferencing": "shape"
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(HERE_FLOW_URL, params=params)
            response.raise_for_status()
            data = response.json()

        results = []
        for result in data.get("results", []):
            location = result.get("location", {})
            description = location.get("description", "")
            shape = location.get("shape", {})
            links = shape.get("links", [])

            for current_flow in result.get("currentFlow", []):
                speed = current_flow.get("speed", 0)
                free_flow = current_flow.get("freeFlow", 0)
                jam_factor = current_flow.get("jamFactor", 0)
                confidence = current_flow.get("confidence", 0)

                # Get coordinates from the first link point
                lat_val = center_lat
                lng_val = center_lng
                if links and len(links) > 0:
                    points = links[0].get("points", [])
                    if points:
                        lat_val = points[0].get("lat", center_lat)
                        lng_val = points[0].get("lng", center_lng)

                # Map jam factor to congestion level
                if jam_factor <= 2:
                    congestion = "low"
                elif jam_factor <= 5:
                    congestion = "medium"
                elif jam_factor <= 8:
                    congestion = "high"
                else:
                    congestion = "severe"

                results.append({
                    "source": "here",
                    "street": description,
                    "current_speed": speed * 3.6,  # m/s to km/h
                    "free_flow_speed": free_flow * 3.6,
                    "jam_factor": jam_factor,
                    "congestion_level": congestion,
                    "confidence": confidence,
                    "latitude": lat_val,
                    "longitude": lng_val,
                })

        logger.info(f"Fetched {len(results)} HERE traffic flow records")
        return results

    except httpx.HTTPStatusError as e:
        logger.error(f"HERE API HTTP error: {e.response.status_code} - {e.response.text}")
        return []
    except Exception as e:
        logger.error(f"Error fetching HERE traffic flow: {e}")
        return []


async def fetch_here_incidents(
    lat: float = None,
    lng: float = None,
    radius: int = 15000
) -> List[Dict[str, Any]]:
    """
    Fetch traffic incidents from HERE API.
    Returns a list of incident records (accidents, road closures, etc.).
    """
    if not settings.HERE_API_KEY:
        logger.warning("HERE API key not configured, skipping HERE incidents")
        return []

    center_lat = lat or settings.CHICAGO_LAT
    center_lng = lng or settings.CHICAGO_LNG

    params = {
        "apiKey": settings.HERE_API_KEY,
        "in": f"circle:{center_lat},{center_lng};r={radius}",
        "locationReferencing": "shape"
    }

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.get(HERE_INCIDENTS_URL, params=params)
            response.raise_for_status()
            data = response.json()

        incidents = []
        for result in data.get("results", []):
            location = result.get("location", {})
            description = location.get("description", "")

            for incident in result.get("incidentDetails", []):
                incident_type = incident.get("type", "UNKNOWN")
                summary = incident.get("description", {}).get("value", "")
                start_time = incident.get("startTime", "")
                end_time = incident.get("endTime", "")
                severity = incident.get("criticality", "minor")

                # Get coordinates
                shape = location.get("shape", {})
                links = shape.get("links", [])
                lat_val = center_lat
                lng_val = center_lng
                if links and len(links) > 0:
                    points = links[0].get("points", [])
                    if points:
                        lat_val = points[0].get("lat", center_lat)
                        lng_val = points[0].get("lng", center_lng)

                incidents.append({
                    "type": incident_type,
                    "description": summary,
                    "street": description,
                    "severity": severity,
                    "start_time": start_time,
                    "end_time": end_time,
                    "latitude": lat_val,
                    "longitude": lng_val,
                })

        logger.info(f"Fetched {len(incidents)} HERE traffic incidents")
        return incidents

    except Exception as e:
        logger.error(f"Error fetching HERE incidents: {e}")
        return []
