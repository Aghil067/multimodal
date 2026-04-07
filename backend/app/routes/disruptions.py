"""
Disruptions API routes.
Main endpoint that orchestrates data fusion and disruption detection.
"""
from fastapi import APIRouter, Query
from typing import Optional

from app.collectors.chicago_traffic import fetch_chicago_traffic
from app.collectors.social_media import fetch_reddit_posts
from app.collectors.osm_infrastructure import fetch_chicago_infrastructure
from app.collectors.news_collector import fetch_disaster_news, fetch_weather_alerts
from app.collectors.travelmidwest import (
    fetch_travelmidwest_congestion, 
    fetch_travelmidwest_incidents,
    fetch_travelmidwest_weather
)
from app.processors.nlp_engine import get_nlp_engine
from app.processors.traffic_analyzer import get_traffic_analyzer
from app.processors.infrastructure_mapper import get_infrastructure_mapper
from app.fusion.data_fusion import get_fusion_engine
from app.fusion.disruption_detector import get_disruption_detector

router = APIRouter(prefix="/api/disruptions", tags=["Disruptions"])


@router.get("/detect")
async def detect_disruptions(
    traffic_limit: int = Query(300, description="Number of traffic segments to fetch"),
    social_limit: int = Query(50, description="Number of social posts to fetch"),
    infra_types: Optional[str] = Query(
        "grocery,fuel_station,hospital",
        description="Infrastructure types to monitor"
    )
):
    """
    Main disruption detection endpoint.
    Collects data from all sources, performs fusion, and detects disruptions.
    """
    type_list = infra_types.split(",") if infra_types else ["grocery", "fuel_station", "hospital"]

    # ── 1. Collect data from all sources ──
    import asyncio

    traffic_task = fetch_chicago_traffic(limit=traffic_limit)
    social_task = fetch_reddit_posts(limit=social_limit)
    infra_task = fetch_chicago_infrastructure(types=type_list)
    news_task = fetch_disaster_news()
    weather_task = fetch_weather_alerts()
    
    # Travel Midwest tasks
    tm_congestion_task = fetch_travelmidwest_congestion()
    tm_incidents_task = fetch_travelmidwest_incidents()

    (
        traffic_data, social_raw, infrastructure, news_articles, weather_alerts,
        tm_congestion, tm_incidents
    ) = await asyncio.gather(
        traffic_task, social_task, infra_task, news_task, weather_task,
        tm_congestion_task, tm_incidents_task,
        return_exceptions=True
    )

    # Handle exceptions gracefully
    def clean(val, default): return val if not isinstance(val, Exception) else default
    
    traffic_data = clean(traffic_data, [])
    social_raw = clean(social_raw, [])
    infrastructure = clean(infrastructure, [])
    news_articles = clean(news_articles, [])
    weather_alerts = clean(weather_alerts, [])
    tm_congestion = clean(tm_congestion, {"features": []})
    tm_incidents = clean(tm_incidents, {"features": []})

    # ── 2. Process Travel Midwest into Traffic/Incidents signals ──
    # Convert Travel Midwest congestion into the common traffic format for fusion
    # (Simple mapping for now: use property 'cng' and a midpoint)
    tm_traffic_segments = []
    for f in tm_congestion.get("features", []):
        try:
            # We don't decode polyline here for performance, just use first coordinate if available
            # or skip if we can't easily get a point. For high-quality fusion, we'd need midpoints.
            # But let's look for any 'id' or properties that help.
            # For now, we'll mostly rely on incidents which are points.
            pass
        except: continue
        
    # Convert Travel Midwest incidents into traffic-like signals or news-like signals
    # DataFusionEngine expects traffic_data to be a list of segments
    # Let's map incidents to "severe" traffic points for the fusion engine
    for f in tm_incidents.get("features", []):
        try:
            coords = None
            if f["geometry"]["type"] == "Point":
                coords = f["geometry"]["coordinates"]
            elif f["geometry"]["type"] == "GeometryCollection":
                p = next((g for g in f["geometry"]["geometries"] if g["type"] == "Point"), None)
                if p: coords = p["coordinates"]
            
            if coords:
                traffic_data.append({
                    "segment_id": f["properties"].get("id", "tm-inc"),
                    "latitude": coords[1],
                    "longitude": coords[0],
                    "congestion_level": "severe" if "crash" in f["properties"].get("desc", "").lower() else "high",
                    "description": f["properties"].get("desc", ""),
                    "source": "TravelMidwest"
                })
        except: continue


    # ── 2. Process social media with NLP ──
    nlp = get_nlp_engine(use_transformers=False)
    social_analyzed = []
    for post in social_raw:
        analysis = nlp.analyze_text(post.get("text", ""))
        social_analyzed.append({
            **post,
            "sentiment": analysis["sentiment"],
            "disruption_type": analysis["disruption_type"],
            "confidence": analysis["confidence"],
            "location_hint": analysis.get("location_hint"),
        })

    # ── 3. Analyze traffic ──
    analyzer = get_traffic_analyzer()
    traffic_analysis = analyzer.analyze_segments(traffic_data)

    # ── 4. Load infrastructure mapper ──
    mapper = get_infrastructure_mapper()
    mapper.load_locations(infrastructure)

    # ── 5. Data fusion ──
    fusion_engine = get_fusion_engine()
    fused_events = fusion_engine.fuse_signals(
        traffic_data=traffic_data,
        social_posts=social_analyzed,
        infrastructure=infrastructure,
        news_alerts=news_articles,
        weather_alerts=weather_alerts,
    )

    # ── 6. Disruption detection ──
    detector = get_disruption_detector()
    disruptions = detector.detect_disruptions(fused_events)

    # ── 7. Generate alerts ──
    from app.alerts.alert_generator import get_alert_generator
    alert_gen = get_alert_generator()
    alerts = alert_gen.generate_alerts(disruptions)

    return {
        "disruptions": disruptions,
        "alerts": alerts,
        "summary": {
            "total_disruptions": len(disruptions),
            "total_alerts": len(alerts),
            "critical_count": sum(1 for d in disruptions if d.get("severity_label") == "critical"),
            "high_count": sum(1 for d in disruptions if d.get("severity_label") == "high"),
            "medium_count": sum(1 for d in disruptions if d.get("severity_label") == "medium"),
            "low_count": sum(1 for d in disruptions if d.get("severity_label") == "low"),
        },
        "data_sources": {
            "traffic_segments": len(traffic_data),
            "social_posts_analyzed": len(social_analyzed),
            "infrastructure_locations": len(infrastructure),
            "news_articles": len(news_articles),
            "weather_alerts": len(weather_alerts),
        },
        "traffic_analysis": traffic_analysis,
    }


@router.get("/summary")
async def get_disruption_summary():
    """Get a quick summary of current disruption status."""
    import asyncio

    traffic_data = await fetch_chicago_traffic(limit=200)
    analyzer = get_traffic_analyzer()
    analysis = analyzer.analyze_segments(traffic_data)

    weather_alerts = await fetch_weather_alerts()

    return {
        "traffic_status": analysis.get("overall_status", "unknown"),
        "avg_congestion": analysis.get("avg_congestion", 0),
        "severe_segments": analysis.get("severe_count", 0),
        "active_weather_alerts": len(weather_alerts),
        "weather_alerts": weather_alerts[:5],
        "hotspots": analysis.get("congestion_hotspots", [])[:10],
    }


@router.get("/timeline")
async def get_disruption_timeline():
    """
    Get a simulated 24-hour timeline of disruption intensity.
    Uses current traffic data to compute a rolling score (no DB required).
    """
    import asyncio
    from datetime import datetime, timedelta
    import random

    traffic_data = await fetch_chicago_traffic(limit=200)
    analyzer = get_traffic_analyzer()
    analysis = analyzer.analyze_segments(traffic_data)

    base_congestion = analysis.get("avg_congestion", 0.1)
    severe = analysis.get("severe_count", 0)
    total = len(traffic_data) or 1

    # Generate plausible 24-hour timeline with current state as anchor
    now = datetime.utcnow()
    timeline = []
    for h in range(24, -1, -1):
        ts = now - timedelta(hours=h)
        hour_of_day = ts.hour
        # Rush hour multipliers
        if 7 <= hour_of_day <= 9 or 16 <= hour_of_day <= 19:
            mult = 1.6 + random.uniform(-0.1, 0.3)
        elif 0 <= hour_of_day <= 5:
            mult = 0.3 + random.uniform(-0.05, 0.1)
        else:
            mult = 0.9 + random.uniform(-0.15, 0.25)
        if h == 0:
            # Current hour reflects live data
            disruption_score = min(1.0, base_congestion * 1.5 + severe / total * 0.5)
        else:
            disruption_score = min(1.0, base_congestion * mult + random.uniform(-0.05, 0.05))
        timeline.append({
            "timestamp": ts.strftime("%Y-%m-%dT%H:00:00Z"),
            "hour": hour_of_day,
            "disruption_score": round(max(0.0, disruption_score), 3),
            "congestion_pct": round(max(0.0, min(100, disruption_score * 100)), 1),
        })

    return {"timeline": timeline, "current_score": round(base_congestion, 3)}


@router.get("/ai-summary")
async def get_ai_summary():
    """
    Generate a situational awareness summary using live data + templates.
    """
    import asyncio
    from datetime import datetime

    traffic_task = fetch_chicago_traffic(limit=150)
    weather_task = fetch_weather_alerts()
    news_task = fetch_disaster_news()

    traffic_data, weather_alerts, news_articles = await asyncio.gather(
        traffic_task, weather_task, news_task, return_exceptions=True
    )
    def clean(v, d): return v if not isinstance(v, Exception) else d
    traffic_data = clean(traffic_data, [])
    weather_alerts = clean(weather_alerts, [])
    news_articles = clean(news_articles, [])

    analyzer = get_traffic_analyzer()
    analysis = analyzer.analyze_segments(traffic_data)
    status = analysis.get("overall_status", "nominal")
    avg_cong = analysis.get("avg_congestion", 0)
    severe = analysis.get("severe_count", 0)
    hotspots = analysis.get("congestion_hotspots", [])[:3]

    now_str = datetime.utcnow().strftime("%H:%M UTC")
    status_phrase = {
        "critical": "CRITICAL — significant disruptions detected",
        "warning": "ELEVATED — moderate disruptions in progress",
        "elevated": "ELEVATED — pockets of congestion observed",
        "nominal": "NOMINAL — conditions within expected parameters"
    }.get(status, "MONITORING")

    hotspot_str = ""
    if hotspots:
        names = [h.get("nearest_location", h.get("segment_id", "unknown area")) for h in hotspots[:2]]
        hotspot_str = f" Highest congestion near: {', '.join(names)}."
    
    weather_str = ""
    if weather_alerts:
        evt = weather_alerts[0].get("event", "weather event")
        weather_str = f" Active NWS alert: {evt}."

    news_str = ""
    if news_articles:
        title = news_articles[0].get("title", "")[:80]
        news_str = f" Latest intel: {title}."

    summary_text = (
        f"[{now_str}] Chicago supply chain status: {status_phrase}. "
        f"{severe} high-severity traffic segments detected ({avg_cong*100:.0f}% avg congestion across {len(traffic_data)} monitored corridors)."
        f"{hotspot_str}{weather_str}{news_str}"
    )

    key_actions = []
    if status in ("critical", "warning"):
        key_actions.append("Deploy mobile fuel supply units to high-congestion corridors")
        key_actions.append("Alert grocery distribution centers to expedite deliveries")
    if weather_alerts:
        key_actions.append("Pre-position emergency resources ahead of weather event")
    if not key_actions:
        key_actions.append("Continue monitoring — no immediate action required")

    return {
        "summary": summary_text,
        "status": status,
        "key_actions": key_actions,
        "data_points": {
            "traffic_segments": len(traffic_data),
            "weather_alerts": len(weather_alerts),
            "news_articles": len(news_articles),
            "severe_corridors": severe,
        },
        "generated_at": datetime.utcnow().isoformat() + "Z",
    }


@router.get("/geographic-clusters")
async def get_geographic_clusters():
    """
    Group detected signals by Chicago neighborhood/geographic zone and score each area.
    """
    import asyncio
    import math

    traffic_task = fetch_chicago_traffic(limit=300)
    infra_task = fetch_chicago_infrastructure(types=["grocery", "fuel_station", "hospital"])

    traffic_data, infrastructure = await asyncio.gather(
        traffic_task, infra_task, return_exceptions=True
    )
    def clean(v, d): return v if not isinstance(v, Exception) else d
    traffic_data = clean(traffic_data, [])
    infrastructure = clean(infrastructure, [])

    # Chicago neighborhood zones (lat/lng bounding boxes)
    zones = [
        {"name": "The Loop / Downtown",   "lat": 41.882, "lng": -87.629, "radius": 2.5},
        {"name": "North Side",             "lat": 41.944, "lng": -87.654, "radius": 4.0},
        {"name": "South Side",             "lat": 41.769, "lng": -87.617, "radius": 5.0},
        {"name": "West Side",              "lat": 41.877, "lng": -87.726, "radius": 3.5},
        {"name": "Near North (Gold Coast)","lat": 41.903, "lng": -87.631, "radius": 2.0},
        {"name": "O\'Hare / Northwest",    "lat": 41.977, "lng": -87.905, "radius": 4.0},
        {"name": "South Shore / SE",       "lat": 41.756, "lng": -87.566, "radius": 3.0},
    ]

    def haversine_km(lat1, lng1, lat2, lng2):
        R = 6371
        dlat = math.radians(lat2-lat1)
        dlng = math.radians(lng2-lng1)
        a = math.sin(dlat/2)**2 + math.cos(math.radians(lat1))*math.cos(math.radians(lat2))*math.sin(dlng/2)**2
        return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))

    def congestion_value(seg):
        cl = seg.get("congestion_level", "").lower()
        return {"severe": 1.0, "heavy": 0.8, "high": 0.75, "moderate": 0.5, "medium": 0.4, "light": 0.2, "low": 0.15}.get(cl, 0.1)

    results = []
    for zone in zones:
        nearby_traffic = [s for s in traffic_data
            if s.get("latitude") and s.get("longitude")
            and haversine_km(zone["lat"], zone["lng"], s["latitude"], s["longitude"]) <= zone["radius"]]
        nearby_infra = [i for i in infrastructure
            if i.get("latitude") and i.get("longitude")
            and haversine_km(zone["lat"], zone["lng"], i["latitude"], i["longitude"]) <= zone["radius"]]

        traffic_scores = [congestion_value(s) for s in nearby_traffic]
        avg_traffic = sum(traffic_scores)/len(traffic_scores) if traffic_scores else 0.0
        severe_segs = sum(1 for s in nearby_traffic if congestion_value(s) >= 0.7)

        infra_by_type = {}
        for loc in nearby_infra:
            t = loc.get("type", "other")
            infra_by_type[t] = infra_by_type.get(t, 0) + 1

        risk = min(1.0, avg_traffic * 1.4 + severe_segs * 0.02)
        risk_label = "critical" if risk >= 0.6 else "high" if risk >= 0.4 else "medium" if risk >= 0.2 else "low"

        results.append({
            "zone": zone["name"],
            "center": {"lat": zone["lat"], "lng": zone["lng"]},
            "radius_km": zone["radius"],
            "risk_score": round(risk, 3),
            "risk_label": risk_label,
            "traffic_segments": len(nearby_traffic),
            "severe_segments": severe_segs,
            "avg_congestion": round(avg_traffic * 100, 1),
            "infrastructure": infra_by_type,
        })

    results.sort(key=lambda x: x["risk_score"], reverse=True)
    return {"zones": results, "total_zones": len(results)}
