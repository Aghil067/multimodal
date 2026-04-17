"""
OpenStreetMap infrastructure data collector.
Uses the Overpass API to fetch grocery stores, fuel stations, and hospitals in Chicago.
"""
import httpx
import logging
from typing import List, Dict, Any
from app.config import settings
from app.utils.cache import ttl_cache_async

logger = logging.getLogger(__name__)

# Multiple Overpass API mirrors (faster and more reliable)
OVERPASS_URLS = [
    "https://overpass.kumi.systems/api/interpreter",  # Faster mirror
    "https://overpass-api.de/api/interpreter",         # Official (might be slow)
    "https://lz4.overpass-api.de/api/interpreter",     # Another mirror
]


def get_fallback_infrastructure():
    return [
        {"osm_id": "fb1", "name": "Rush Medical Center",    "type": "hospital",     "latitude": 41.8750, "longitude": -87.6690, "address": "1620 W Harrison St, Chicago",  "brand": "Rush",                 "opening_hours": "24/7"},
        {"osm_id": "fb2", "name": "Northwestern Memorial",  "type": "hospital",     "latitude": 41.8950, "longitude": -87.6210, "address": "251 E Huron St, Chicago",      "brand": "Northwestern Medicine", "opening_hours": "24/7"},
        {"osm_id": "fb3", "name": "Whole Foods Market",     "type": "grocery",      "latitude": 41.8840, "longitude": -87.6270, "address": "30 W Huron St, Chicago",       "brand": "Whole Foods",          "opening_hours": "Mo-Su 08:00-22:00"},
        {"osm_id": "fb4", "name": "Mariano's",              "type": "grocery",      "latitude": 41.8840, "longitude": -87.6350, "address": "333 E Benton Pl, Chicago",     "brand": "Mariano's",            "opening_hours": "Mo-Su 06:00-23:00"},
        {"osm_id": "fb5", "name": "BP Gas Station",         "type": "fuel_station", "latitude": 41.8950, "longitude": -87.6400, "address": "501 N Clark St, Chicago",      "brand": "BP",                   "opening_hours": "24/7"},
        {"osm_id": "fb6", "name": "Shell Gas Station",      "type": "fuel_station", "latitude": 41.8700, "longitude": -87.6550, "address": "801 S Halsted St, Chicago",    "brand": "Shell",                "opening_hours": "24/7"},
        {"osm_id": "fb7", "name": "Target Grocery",         "type": "grocery",      "latitude": 41.8800, "longitude": -87.6400, "address": "1 S State St, Chicago",        "brand": "Target",               "opening_hours": "Mo-Su 07:00-22:00"},
        {"osm_id": "fb8", "name": "Walgreens Pharmacy",     "type": "pharmacy",     "latitude": 41.8830, "longitude": -87.6450, "address": "2 N State St, Chicago",        "brand": "Walgreens",            "opening_hours": "Mo-Su 08:00-22:00"},
    ]


def build_overpass_query(bbox: dict, amenity_types: List[str]) -> str:
    """
    Build an Overpass QL query to fetch amenities within Chicago's bounding box.
    """
    south = bbox["south"]
    west = bbox["west"]
    north = bbox["north"]
    east = bbox["east"]

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


@ttl_cache_async(ttl_seconds=300, max_entries=16)
async def fetch_chicago_infrastructure(
    types: List[str] = None,
    use_fallback: bool = True
) -> List[Dict[str, Any]]:
    """
    Fetch infrastructure locations in Chicago from OpenStreetMap.
    Uses multiple Overpass API mirrors with automatic fallback to demo data.

    Args:
        types: List of infrastructure types to fetch.
               Options: 'grocery', 'fuel_station', 'hospital', 'pharmacy'
        use_fallback: If True, automatically use demo data when APIs fail

    Returns:
        List of infrastructure location dictionaries.
    """
    if types is None:
        types = ["grocery", "fuel_station", "hospital"]

    query = build_overpass_query(settings.CHICAGO_BBOX, types)

    # Try each Overpass mirror with fast timeouts
    for idx, overpass_url in enumerate(OVERPASS_URLS):
        try:
            timeout = 5.0 if idx > 0 else 8.0
            logger.info(f"Trying {overpass_url} (timeout: {timeout}s)...")

            async with httpx.AsyncClient(timeout=timeout) as client:
                response = await client.post(overpass_url, data={"data": query})
                response.raise_for_status()
                data = response.json()

            elements = data.get("elements", [])
            logger.info(f"✅ Got {len(elements)} elements from {overpass_url}")

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
                address = ", ".join(addr_parts) if addr_parts else "Chicago, IL"

                # Skip items outside Chicago's bounding box (e.g. Lake Michigan)
                bbox = settings.CHICAGO_BBOX
                if not (bbox["south"] <= lat <= bbox["north"] and bbox["west"] <= lon <= bbox["east"]):
                    continue

                locations.append({
                    "osm_id": osm_id,
                    "name": name,
                    "type": infra_type,
                    "latitude": lat,
                    "longitude": lon,
                    "address": address,
                    "brand": tags.get("brand", tags.get("operator", "")),
                    "opening_hours": tags.get("opening_hours", ""),
                })

            if locations:
                logger.info(f"✅ Returning {len(locations)} infrastructure locations")
                return locations

        except Exception as e:
            logger.warning(f"⚠️ Mirror {overpass_url} failed: {e}. Trying next...")
            continue

    # All mirrors failed – use fallback data
    if use_fallback:
        logger.warning("⚠️ All Overpass mirrors failed. Using fallback infrastructure data.")
        return get_fallback_infrastructure()

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
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.post(OVERPASS_URLS[0], data={"data": query.strip()})
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
        fallback_locations = []
        lat_span = radius_m / 111000
        lng_span = radius_m / 85000
        for location in get_fallback_infrastructure():
            if types and location["type"] not in types:
                continue
            if abs(location["latitude"] - lat) <= lat_span and abs(location["longitude"] - lng) <= lng_span:
                fallback_locations.append(location)
        return fallback_locations
