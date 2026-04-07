"""
OpenStreetMap infrastructure data collector.
Uses the Overpass API to fetch grocery stores, fuel stations, and hospitals in Chicago.
"""
import httpx
import logging
from typing import List, Dict, Any
from app.config import settings

logger = logging.getLogger(__name__)

OVERPASS_URL = "https://overpass-api.de/api/interpreter"


def build_overpass_query(bbox: dict, amenity_types: List[str]) -> str:
    """
    Build an Overpass QL query to fetch amenities within Chicago's bounding box.
    """
    south = bbox["south"]
    west = bbox["west"]
    north = bbox["north"]
    east = bbox["east"]

    # Build union of multiple amenity type queries
    queries = []
    for amenity in amenity_types:
        if amenity == "grocery":
            queries.append(f'  node["shop"="supermarket"]({south},{west},{north},{east});')
            queries.append(f'  node["shop"="grocery"]({south},{west},{north},{east});')
            queries.append(f'  node["shop"="convenience"]({south},{west},{north},{east});')
        elif amenity == "fuel_station":
            queries.append(f'  node["amenity"="fuel"]({south},{west},{north},{east});')
        elif amenity == "hospital":
            queries.append(f'  node["amenity"="hospital"]({south},{west},{north},{east});')
            queries.append(f'  node["amenity"="clinic"]({south},{west},{north},{east});')
        elif amenity == "pharmacy":
            queries.append(f'  node["amenity"="pharmacy"]({south},{west},{north},{east});')

    union_body = "\n".join(queries)
    query = f"""
[out:json][timeout:60];
(
{union_body}
);
out center body;
"""
    return query.strip()


def classify_osm_type(tags: dict) -> str:
    """Classify an OSM node into our infrastructure categories."""
    amenity = tags.get("amenity", "")
    shop = tags.get("shop", "")

    if amenity == "fuel":
        return "fuel_station"
    elif amenity in ("hospital", "clinic"):
        return "hospital"
    elif amenity == "pharmacy":
        return "pharmacy"
    elif shop in ("supermarket", "grocery", "convenience"):
        return "grocery"
    else:
        return "other"


async def fetch_chicago_infrastructure(
    types: List[str] = None
) -> List[Dict[str, Any]]:
    """
    Fetch infrastructure locations in Chicago from OpenStreetMap.

    Args:
        types: List of infrastructure types to fetch.
               Options: 'grocery', 'fuel_station', 'hospital', 'pharmacy'

    Returns:
        List of infrastructure location dictionaries.
    """
    if types is None:
        types = ["grocery", "fuel_station", "hospital"]

    query = build_overpass_query(settings.CHICAGO_BBOX, types)

    try:
        async with httpx.AsyncClient(timeout=90.0) as client:
            response = await client.post(
                OVERPASS_URL,
                data={"data": query}
            )
            response.raise_for_status()
            data = response.json()

        elements = data.get("elements", [])
        locations = []

        for element in elements:
            tags = element.get("tags", {})
            lat = element.get("lat")
            lon = element.get("lon")

            # For ways/relations, use center coordinates
            if not lat or not lon:
                center = element.get("center", {})
                lat = center.get("lat")
                lon = center.get("lon")

            if not lat or not lon:
                continue

            name = tags.get("name", "Unnamed")
            infra_type = classify_osm_type(tags)
            osm_id = str(element.get("id", ""))

            # Build address from tags
            addr_parts = []
            if tags.get("addr:housenumber"):
                addr_parts.append(tags["addr:housenumber"])
            if tags.get("addr:street"):
                addr_parts.append(tags["addr:street"])
            if tags.get("addr:city"):
                addr_parts.append(tags["addr:city"])
            address = ", ".join(addr_parts) if addr_parts else None

            locations.append({
                "osm_id": osm_id,
                "name": name,
                "type": infra_type,
                "latitude": lat,
                "longitude": lon,
                "address": address,
                "brand": tags.get("brand", None),
                "opening_hours": tags.get("opening_hours", None),
            })

        logger.info(f"Fetched {len(locations)} infrastructure locations from OSM")
        return locations

    except httpx.HTTPStatusError as e:
        logger.error(f"Overpass API HTTP error: {e.response.status_code}")
        return []
    except Exception as e:
        logger.error(f"Error fetching OSM infrastructure: {e}")
        return []


async def fetch_nearby_infrastructure(
    lat: float,
    lng: float,
    radius_m: int = 2000,
    types: List[str] = None
) -> List[Dict[str, Any]]:
    """
    Fetch infrastructure within a radius of a given point.
    """
    if types is None:
        types = ["grocery", "fuel_station", "hospital"]

    queries = []
    for amenity in types:
        if amenity == "grocery":
            queries.append(f'  node["shop"="supermarket"](around:{radius_m},{lat},{lng});')
            queries.append(f'  node["shop"="grocery"](around:{radius_m},{lat},{lng});')
        elif amenity == "fuel_station":
            queries.append(f'  node["amenity"="fuel"](around:{radius_m},{lat},{lng});')
        elif amenity == "hospital":
            queries.append(f'  node["amenity"="hospital"](around:{radius_m},{lat},{lng});')

    union_body = "\n".join(queries)
    query = f"""
[out:json][timeout:30];
(
{union_body}
);
out body;
"""

    try:
        async with httpx.AsyncClient(timeout=45.0) as client:
            response = await client.post(OVERPASS_URL, data={"data": query.strip()})
            response.raise_for_status()
            data = response.json()

        locations = []
        for el in data.get("elements", []):
            tags = el.get("tags", {})
            locations.append({
                "osm_id": str(el.get("id", "")),
                "name": tags.get("name", "Unnamed"),
                "type": classify_osm_type(tags),
                "latitude": el.get("lat"),
                "longitude": el.get("lon"),
            })

        return locations

    except Exception as e:
        logger.error(f"Error fetching nearby infrastructure: {e}")
        return []
