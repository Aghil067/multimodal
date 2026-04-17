"""
Infrastructure API routes.
"""
from fastapi import APIRouter, Query
from typing import Optional, List

from app.collectors.osm_infrastructure import (
    fetch_chicago_infrastructure,
    fetch_nearby_infrastructure
)
from app.processors.infrastructure_mapper import get_infrastructure_mapper

router = APIRouter(prefix="/api/infrastructure", tags=["Infrastructure"])


@router.get("/chicago")
async def get_chicago_infrastructure(
    types: Optional[str] = Query(
        None,
        description="Comma-separated types: grocery,fuel_station,hospital,pharmacy"
    )
):
    """Fetch infrastructure locations in Chicago from OpenStreetMap."""
    import asyncio
    
    type_list = types.split(",") if types else ["grocery", "fuel_station", "hospital"]
    
    locations = []
    try:
        # Fetch with sufficient timeout for all mirrors to be tried
        locations = await asyncio.wait_for(
            fetch_chicago_infrastructure(types=type_list),
            timeout=20.0  # Keep map loading fast even when Overpass mirrors are degraded
        )
        
        if locations:
            print(f"Fetched {len(locations)} REAL infrastructure locations from Overpass API")
        else:
            print("Overpass API returned empty. Using demo data.")
            from app.utils.demo_data import generate_demo_infrastructure
            locations = generate_demo_infrastructure()
            
    except asyncio.TimeoutError:
        print("Infrastructure fetch timeout. Using demo data.")
        from app.utils.demo_data import generate_demo_infrastructure
        locations = generate_demo_infrastructure()
    except Exception as e:
        print(f"Infrastructure fetch failed: {str(e)[:100]}. Using demo data.")
        from app.utils.demo_data import generate_demo_infrastructure
        locations = generate_demo_infrastructure()

    # Update the mapper
    mapper = get_infrastructure_mapper()
    mapper.load_locations(locations)

    return {
        "locations": locations,
        "count": len(locations),
        "types": mapper.get_type_stats()
    }


@router.get("/near")
async def get_nearby_infrastructure(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: int = Query(2000, description="Radius in meters"),
    types: Optional[str] = Query(None, description="Comma-separated types")
):
    """Find infrastructure near a specific location."""
    type_list = types.split(",") if types else None
    locations = await fetch_nearby_infrastructure(lat, lng, radius, type_list)

    return {
        "locations": locations,
        "count": len(locations),
        "center": {"latitude": lat, "longitude": lng},
        "radius_m": radius
    }


@router.get("/clusters")
async def get_infrastructure_clusters(
    radius: float = Query(2.0, description="Cluster radius in km")
):
    """Get clustered infrastructure for map visualization."""
    mapper = get_infrastructure_mapper()

    if not mapper.locations:
        # Load data first
        locations = await fetch_chicago_infrastructure()
        mapper.load_locations(locations)

    clusters = mapper.create_cluster_summary(cluster_radius_km=radius)

    return {
        "clusters": clusters,
        "count": len(clusters),
        "total_locations": len(mapper.locations)
    }


@router.get("/stats")
async def get_infrastructure_stats():
    """Get statistics about infrastructure."""
    mapper = get_infrastructure_mapper()

    if not mapper.locations:
        locations = await fetch_chicago_infrastructure()
        mapper.load_locations(locations)

    return {
        "total": len(mapper.locations),
        "by_type": mapper.get_type_stats()
    }
