"""
Traffic data API routes.
"""
import asyncio
import httpx
from fastapi import APIRouter, Query, HTTPException
from typing import Optional

from app.collectors.chicago_traffic import fetch_chicago_traffic, fetch_traffic_near_location
from app.collectors.here_traffic import fetch_here_traffic_flow, fetch_here_incidents
from app.processors.traffic_analyzer import get_traffic_analyzer

from app.collectors.travelmidwest import (
    fetch_travelmidwest_congestion, 
    fetch_travelmidwest_incidents,
    fetch_travelmidwest_weather,
    fetch_travelmidwest_realtime_traffic,
    fetch_travelmidwest_construction
)

router = APIRouter(prefix="/api/traffic", tags=["Traffic"])


@router.get("/chicago")
async def get_chicago_traffic(limit: int = Query(500, ge=10, le=2000)):
    """Fetch real-time Chicago traffic congestion data."""
    try:
        segments = await fetch_chicago_traffic(limit=limit)
        analyzer = get_traffic_analyzer()
        analysis = analyzer.analyze_segments(segments)
        return {"segments": segments, "analysis": analysis, "count": len(segments)}
    except Exception as e:
        # Return empty data rather than crashing so the frontend still loads
        return {"segments": [], "analysis": {}, "count": 0, "error": str(e)}


@router.get("/near")
async def get_traffic_near(
    lat: float = Query(..., description="Latitude"),
    lng: float = Query(..., description="Longitude"),
    radius: float = Query(2.0, description="Radius in km")
):
    """Get traffic data near a specific location."""
    segments = await fetch_traffic_near_location(lat, lng, radius)
    analyzer = get_traffic_analyzer()
    analysis = analyzer.analyze_segments(segments)

    return {
        "segments": segments,
        "analysis": analysis,
        "count": len(segments)
    }


@router.get("/here/flow")
async def get_here_flow(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: int = Query(15000, description="Radius in meters")
):
    """Fetch HERE traffic flow data."""
    flow = await fetch_here_traffic_flow(lat, lng, radius)
    return {"flow": flow, "count": len(flow)}


@router.get("/here/incidents")
async def get_here_incidents(
    lat: Optional[float] = None,
    lng: Optional[float] = None,
    radius: int = Query(15000, description="Radius in meters")
):
    """Fetch HERE traffic incidents."""
    incidents = await fetch_here_incidents(lat, lng, radius)
    return {"incidents": incidents, "count": len(incidents)}


@router.get("/analysis")
async def get_traffic_analysis(limit: int = Query(500, ge=10, le=2000)):
    """Get comprehensive traffic analysis with anomaly detection."""
    segments = await fetch_chicago_traffic(limit=limit)
    analyzer = get_traffic_analyzer()

    analysis = analyzer.analyze_segments(segments)
    anomalies = analyzer.detect_anomalies(segments)

    return {
        "analysis": analysis,
        "anomalies": anomalies,
        "anomaly_count": len(anomalies)
    }

@router.get("/travelmidwest/congestion")
async def get_travelmidwest_congestion(
    bbox: str = Query("-88.7571,41.5229,-86.9993,42.0880", description="Bounding box")
):
    """Fetch encoded lines from Travel Midwest for Chicago area"""
    try:
        bbox_list = [float(x) for x in bbox.split(",")]
        return await fetch_travelmidwest_congestion(bbox_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/travelmidwest/incidents")
async def get_travelmidwest_incidents(
    bbox: str = Query("-88.7571,41.5229,-86.9993,42.0880", description="Bounding box")
):
    """Fetch incidents from Travel Midwest for Chicago area"""
    try:
        bbox_list = [float(x) for x in bbox.split(",")]
        return await fetch_travelmidwest_incidents(bbox_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/travelmidwest/realtime")
async def get_travelmidwest_realtime(
    bbox: str = Query("-88.7571,41.5229,-86.9993,42.0880", description="Bounding box")
):
    """Fetch more comprehensive real-time traffic from Travel Midwest"""
    try:
        bbox_list = [float(x) for x in bbox.split(",")]
        return await fetch_travelmidwest_realtime_traffic(bbox_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/travelmidwest/weather")
async def get_travelmidwest_weather(
    bbox: str = Query("-88.7571,41.5229,-86.9993,42.0880", description="Bounding box")
):
    """Fetch weather from Travel Midwest for Chicago area"""
    try:
        bbox_list = [float(x) for x in bbox.split(",")]
        return await fetch_travelmidwest_weather(bbox_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/travelmidwest/construction")
async def get_travelmidwest_construction(
    bbox: str = Query("-88.7571,41.5229,-86.9993,42.0880", description="Bounding box")
):
    """Fetch construction projects from Travel Midwest"""
    try:
        bbox_list = [float(x) for x in bbox.split(",")]
        return await fetch_travelmidwest_construction(bbox_list)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

