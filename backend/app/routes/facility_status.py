"""
Facility Status Analysis API.
Determines whether critical facilities (grocery, fuel stations, hospitals) are
open, closed, or impacted by disasters using news, social media, weather,
and real-time disruption data.
"""
import asyncio
import math
import logging
from datetime import datetime, timezone
from typing import List, Dict, Any, Optional

from fastapi import APIRouter, Query

from app.collectors.osm_infrastructure import fetch_chicago_infrastructure
from app.collectors.social_media import fetch_reddit_posts
from app.collectors.news_collector import fetch_disaster_news, fetch_weather_alerts
from app.collectors.travelmidwest import (
    fetch_travelmidwest_incidents,
    fetch_travelmidwest_weather,
)
from app.processors.nlp_engine import get_nlp_engine

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api/facility-status", tags=["Facility Status"])

# Disaster keywords that indicate closure/impact
CLOSURE_KEYWORDS = {
    "flood": {"type": "flood", "severity": 0.9},
    "flooding": {"type": "flood", "severity": 0.9},
    "flooded": {"type": "flood", "severity": 0.95},
    "underwater": {"type": "flood", "severity": 1.0},
    "fire": {"type": "fire", "severity": 0.95},
    "burned": {"type": "fire", "severity": 1.0},
    "burning": {"type": "fire", "severity": 0.95},
    "blaze": {"type": "fire", "severity": 0.9},
    "explosion": {"type": "fire", "severity": 1.0},
    "tornado": {"type": "tornado", "severity": 1.0},
    "collapsed": {"type": "structural", "severity": 1.0},
    "collapse": {"type": "structural", "severity": 0.95},
    "destroyed": {"type": "structural", "severity": 1.0},
    "demolished": {"type": "structural", "severity": 1.0},
    "earthquake": {"type": "earthquake", "severity": 1.0},
    "power outage": {"type": "power_outage", "severity": 0.8},
    "blackout": {"type": "power_outage", "severity": 0.85},
    "no power": {"type": "power_outage", "severity": 0.8},
    "closed": {"type": "closure", "severity": 0.7},
    "shut down": {"type": "closure", "severity": 0.75},
    "shutdown": {"type": "closure", "severity": 0.75},
    "evacuated": {"type": "evacuation", "severity": 0.9},
    "evacuation": {"type": "evacuation", "severity": 0.85},
    "inaccessible": {"type": "access_blocked", "severity": 0.8},
    "blocked": {"type": "access_blocked", "severity": 0.7},
    "road closed": {"type": "access_blocked", "severity": 0.75},
    "out of stock": {"type": "shortage", "severity": 0.6},
    "empty shelves": {"type": "shortage", "severity": 0.65},
    "shortage": {"type": "shortage", "severity": 0.6},
    "no fuel": {"type": "shortage", "severity": 0.7},
    "no gas": {"type": "shortage", "severity": 0.7},
    "boil order": {"type": "contamination", "severity": 0.7},
    "contaminated": {"type": "contamination", "severity": 0.8},
    "storm damage": {"type": "storm", "severity": 0.85},
    "severe storm": {"type": "storm", "severity": 0.8},
    "hail": {"type": "storm", "severity": 0.6},
}

# Facility type labels for descriptions
FACILITY_LABELS = {
    "grocery": "Grocery Store",
    "fuel_station": "Gas Station",
    "hospital": "Hospital",
    "pharmacy": "Pharmacy",
}

# Impact type descriptions  
IMPACT_DESCRIPTIONS = {
    "flood": "Flooding in the area",
    "fire": "Fire damage or active fire nearby",
    "tornado": "Tornado damage",
    "structural": "Structural damage or collapse",
    "earthquake": "Earthquake damage",
    "power_outage": "Power outage affecting operations",
    "closure": "Reported closure",
    "evacuation": "Area evacuation in effect",
    "access_blocked": "Access roads blocked or obstructed",
    "shortage": "Supply shortage reported",
    "contamination": "Water/environmental contamination",
    "storm": "Severe storm damage",
    "weather_alert": "Active weather alert in effect",
    "traffic_incident": "Nearby traffic incident affecting access",
}


def haversine_km(lat1, lon1, lat2, lon2):
    """Calculate distance in km between two coordinates."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    return R * 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))


def parse_opening_hours(hours_str: str) -> dict:
    """
    Parse OSM opening_hours string and determine if facility is currently open.
    Returns {"is_open": bool, "schedule": str, "confidence": float}
    """
    if not hours_str:
        return {"is_open": None, "schedule": "Unknown", "confidence": 0.3}
    
    hours_lower = hours_str.lower().strip()
    
    # Common patterns
    if hours_lower in ("24/7", "24 hours"):
        return {"is_open": True, "schedule": "Open 24/7", "confidence": 0.95}
    
    if hours_lower in ("closed", "off"):
        return {"is_open": False, "schedule": "Permanently Closed", "confidence": 0.9}
    
    # Try to parse day/time patterns
    # OSM format: "Mo-Fr 08:00-22:00; Sa 09:00-21:00; Su 10:00-18:00"
    now = datetime.now()
    day_map = {0: "mo", 1: "tu", 2: "we", 3: "th", 4: "fr", 5: "sa", 6: "su"}
    current_day = day_map.get(now.weekday(), "mo")
    current_hour = now.hour + now.minute / 60.0
    
    try:
        # Split by semicolons for different day ranges
        parts = hours_lower.replace(",", ";").split(";")
        for part in parts:
            part = part.strip()
            if not part:
                continue
            
            # Check if current day is in this range
            day_part = ""
            time_part = part
            
            # Look for day indicators
            day_abbrevs = ["mo", "tu", "we", "th", "fr", "sa", "su"]
            for abbrev in day_abbrevs:
                if abbrev in part[:10]:
                    # Split at the time portion
                    tokens = part.split()
                    if len(tokens) >= 2:
                        day_part = tokens[0]
                        time_part = " ".join(tokens[1:])
                    break
            
            # Check if current day matches
            day_matches = True
            if day_part:
                if "-" in day_part:
                    start_day, end_day = day_part.split("-")[:2]
                    start_idx = day_abbrevs.index(start_day.strip()[:2]) if start_day.strip()[:2] in day_abbrevs else 0
                    end_idx = day_abbrevs.index(end_day.strip()[:2]) if end_day.strip()[:2] in day_abbrevs else 6
                    current_idx = day_abbrevs.index(current_day)
                    day_matches = start_idx <= current_idx <= end_idx
                else:
                    day_matches = current_day in day_part
            
            if day_matches and ":" in time_part:
                # Parse time range
                time_ranges = time_part.split("-")
                if len(time_ranges) == 2:
                    open_time = time_ranges[0].strip()
                    close_time = time_ranges[1].strip()
                    
                    oh, om = [int(x) for x in open_time.split(":")[:2]]
                    ch, cm = [int(x) for x in close_time.split(":")[:2]]
                    
                    open_hour = oh + om / 60.0
                    close_hour = ch + cm / 60.0
                    
                    is_open = open_hour <= current_hour <= close_hour
                    return {
                        "is_open": is_open,
                        "schedule": hours_str,
                        "confidence": 0.85
                    }
    except Exception:
        pass
    
    # Fallback: assume open during business hours (8am-10pm)
    is_business_hours = 8 <= now.hour <= 22
    return {
        "is_open": is_business_hours,
        "schedule": hours_str or "Business Hours (est.)",
        "confidence": 0.5
    }


def analyze_text_for_impact(text: str, facility_name: str = "") -> dict:
    """
    Analyze a text (news/social) for disaster/closure keywords
    that might affect a facility.
    Returns {"impacted": bool, "impact_type": str, "severity": float, "reason": str}
    
    IMPORTANT: Only mark as impacted if facility name is explicitly mentioned!
    This prevents false positives from regional disasters.
    """
    text_lower = text.lower()
    facility_lower = facility_name.lower() if facility_name else ""
    
    # STRICT: Only trigger if facility name is mentioned in the text
    if not facility_lower or facility_lower not in text_lower:
        return {"impacted": False}
    
    best_match = None
    best_severity = 0
    
    for keyword, info in CLOSURE_KEYWORDS.items():
        if keyword in text_lower:
            sev = info["severity"]
            if sev > best_severity:
                best_severity = sev
                best_match = {
                    "impacted": True,
                    "impact_type": info["type"],
                    "severity": sev,
                    "reason": f"'{keyword}' detected in report",
                    "keyword": keyword,
                }
    
    if best_match:
        return best_match
    
    return {"impacted": False, "impact_type": None, "severity": 0, "reason": None}


@router.get("/analyze")
async def analyze_facility_status(
    types: Optional[str] = Query(
        "grocery,fuel_station,hospital",
        description="Comma-separated facility types to analyze"
    ),
    radius_km: float = Query(
        2.0,
        description="Radius in km to search for nearby disruption signals"
    ),
):
    """
    Comprehensive facility status analysis.
    
    Cross-references real-time data from:
    - OSM opening hours
    - News articles (floods, fires, closures)
    - Social media (Reddit posts about shortages, closures)
    - NWS weather alerts
    - TravelMidwest incidents (road blockages near facilities)
    
    Returns a status for each facility: OPEN, CLOSED, IMPACTED, or UNKNOWN
    """
    type_list = types.split(",") if types else ["grocery", "fuel_station", "hospital"]
    
    # Parallel data collection with timeout to prevent hanging
    try:
        (
            infrastructure,
            social_raw,
            news_articles,
            weather_alerts,
            tm_incidents,
            tm_weather,
        ) = await asyncio.wait_for(
            asyncio.gather(
                fetch_chicago_infrastructure(types=type_list),
                fetch_reddit_posts(limit=50),
                fetch_disaster_news(),
                fetch_weather_alerts(),
                fetch_travelmidwest_incidents(),
                fetch_travelmidwest_weather(),
                return_exceptions=True,
            ),
            timeout=20.0  # Keep facility analysis responsive when upstream APIs are slow
        )
    except asyncio.TimeoutError:
        from app.collectors.osm_infrastructure import get_fallback_infrastructure

        logger.warning("Facility status analysis timed out after 20s. Using fallback infrastructure.")
        infrastructure = get_fallback_infrastructure()
        social_raw = []
        news_articles = []
        weather_alerts = []
        tm_incidents = {"features": []}
        tm_weather = {"features": []}
    
    # Handle exceptions
    def safe(val, default):
        return val if not isinstance(val, Exception) else default
    
    infrastructure = safe(infrastructure, [])
    social_raw = safe(social_raw, [])
    news_articles = safe(news_articles, [])
    weather_alerts = safe(weather_alerts, [])
    tm_incidents = safe(tm_incidents, {"features": []})
    tm_weather = safe(tm_weather, {"features": []})
    
    # NLP analysis on social posts
    nlp = get_nlp_engine(use_transformers=False)
    social_analyzed = []
    for post in social_raw:
        analysis = nlp.analyze_text(post.get("text", ""))
        social_analyzed.append({
            **post,
            "sentiment": analysis["sentiment"],
            "disruption_type": analysis["disruption_type"],
            "confidence": analysis["confidence"],
        })
    
    # Parse TM incidents into location data
    tm_incident_points = []
    for f in tm_incidents.get("features", []):
        try:
            coords = None
            geom = f.get("geometry", {})
            if geom.get("type") == "Point":
                coords = geom["coordinates"]
            elif geom.get("type") == "GeometryCollection":
                p = next((g for g in geom.get("geometries", []) if g.get("type") == "Point"), None)
                if p:
                    coords = p["coordinates"]
            
            if coords:
                props = f.get("properties", {})
                tm_incident_points.append({
                    "lat": coords[1],
                    "lng": coords[0],
                    "desc": props.get("desc", ""),
                    "locDesc": props.get("locDesc", ""),
                    "severity": "full" if props.get("lanes") == "full" else "partial",
                })
        except Exception:
            continue
    
    # Analyze each facility
    facility_statuses = []
    now = datetime.now(timezone.utc)
    
    # Aggregate disaster context: combine all text signals
    all_text_signals = []
    for article in news_articles:
        all_text_signals.append({
            "text": article.get("text", article.get("title", "")),
            "source": "news",
            "url": article.get("url", ""),
        })
    for post in social_analyzed:
        all_text_signals.append({
            "text": post.get("text", ""),
            "source": "social",
            "url": post.get("url", ""),
            "confidence": post.get("confidence", 0.5),
        })
    
    for facility in infrastructure:
        f_lat = facility.get("latitude")
        f_lng = facility.get("longitude")
        f_name = facility.get("name", "Unknown")
        f_type = facility.get("type", "other")
        
        if not f_lat or not f_lng:
            continue
        
        # ── 1. Opening hours check ──
        hours_info = parse_opening_hours(facility.get("opening_hours"))
        
        # ── 2. Nearby text signal analysis ──
        impacts = []
        
        # News - only if facility is mentioned OR disaster is VERY severe
        for signal in all_text_signals:
            impact = analyze_text_for_impact(signal["text"], f_name)
            if impact["impacted"]:
                # Only add if facility name mentioned in the disaster text
                # This prevents marking all facilities for a distant disaster
                if f_name.lower() in signal["text"].lower() or impact["severity"] >= 0.95:
                    impacts.append({
                        **impact,
                        "source": signal["source"],
                        "text_snippet": signal["text"][:120],
                    })
        
        # ── 3. Weather alerts (disabled - weather alone doesn't impact facility status) ──
        # Only explicit facility mentions trigger impact status
        
        # ── 4. Nearby TM incidents (only if very close AND blocking) ──
        for inc in tm_incident_points:
            dist = haversine_km(f_lat, f_lng, inc["lat"], inc["lng"])
            # Only mark impacted if within 500m AND full closure
            if dist <= 0.5 and inc["severity"] == "full":
                impacts.append({
                    "impacted": True,
                    "impact_type": "traffic_incident",
                    "severity": 0.5,  # Moderate impact - traffic incident alone is not critical
                    "reason": f"Traffic incident {dist:.1f}km away: {inc['desc'][:80]}",
                    "source": "travelmidwest",
                })
        
        # ── 5. Determine overall status ──
        # Sort impacts by severity
        impacts.sort(key=lambda x: x["severity"], reverse=True)
        
        # Determine final status
        max_severity = impacts[0]["severity"] if impacts else 0
        primary_impact = impacts[0] if impacts else None
        
        # STRICT CONSERVATIVE LOGIC: Only mark CLOSED if critical evidence
        # Most facilities should be OPEN by default
        if max_severity >= 0.95:
            status = "CLOSED"
            status_reason = f"Confirmed closed: {IMPACT_DESCRIPTIONS.get(primary_impact['impact_type'], 'disaster impact')}"
        elif max_severity >= 0.75:
            status = "IMPACTED"
            status_reason = f"Operations impacted: {IMPACT_DESCRIPTIONS.get(primary_impact['impact_type'], 'disruption')}"
        elif max_severity >= 0.5:
            status = "AT_RISK"
            status_reason = f"At risk: {IMPACT_DESCRIPTIONS.get(primary_impact['impact_type'], 'nearby disruption')}"
        else:
            # DEFAULT: Most facilities are OPEN
            status = "OPEN"
            status_reason = "Operating normally"
        
        # Confidence: high when no impacts detected
        confidence = 0.85 if not impacts else min(1.0, 0.5 + len(impacts) * 0.1 + max_severity * 0.15)
        
        facility_statuses.append({
            "osm_id": facility.get("osm_id"),
            "name": f_name,
            "type": f_type,
            "type_label": FACILITY_LABELS.get(f_type, f_type.replace("_", " ").title()),
            "latitude": f_lat,
            "longitude": f_lng,
            "address": facility.get("address"),
            "brand": facility.get("brand"),
            "status": status,
            "status_reason": status_reason,
            "confidence": round(confidence, 2),
            "opening_hours": hours_info,
            "impact_count": len(impacts),
            "primary_impact": {
                "type": primary_impact["impact_type"],
                "severity": round(primary_impact["severity"], 2),
                "reason": primary_impact["reason"],
                "source": primary_impact.get("source", "unknown"),
            } if primary_impact else None,
            "all_impacts": [
                {
                    "type": imp["impact_type"],
                    "severity": round(imp["severity"], 2),
                    "reason": imp["reason"],
                    "source": imp.get("source", "unknown"),
                }
                for imp in impacts[:5]  # Top 5 impacts
            ],
            "analyzed_at": now.isoformat(),
        })
    
    # Summary statistics
    status_counts = {}
    type_status = {}
    for fs in facility_statuses:
        s = fs["status"]
        t = fs["type"]
        status_counts[s] = status_counts.get(s, 0) + 1
        if t not in type_status:
            type_status[t] = {"OPEN": 0, "CLOSED": 0, "IMPACTED": 0, "AT_RISK": 0, "UNKNOWN": 0}
        type_status[t][s] = type_status[t].get(s, 0) + 1
    
    return {
        "facilities": facility_statuses,
        "total": len(facility_statuses),
        "summary": {
            "status_counts": status_counts,
            "by_type": type_status,
            "data_sources": {
                "infrastructure_locations": len(infrastructure),
                "news_articles_scanned": len(news_articles),
                "social_posts_scanned": len(social_analyzed),
                "weather_alerts_active": len(weather_alerts),
                "traffic_incidents_nearby": len(tm_incident_points),
            },
        },
        "analyzed_at": now.isoformat(),
    }


# Helper function for AI summary to get infrastructure impact
async def get_infrastructure_impact() -> Dict[str, Any]:
    """
    Quick facility status summary for AI situational intelligence.
    Returns critical impact metrics for supply chain analysis.
    """
    try:
        result = await analyze_facility_status(types="grocery,fuel_station,hospital")
        
        facilities = result.get("facilities", [])
        summary = result.get("summary", {})
        status_counts = summary.get("status_counts", {})
        
        # Count critical facilities (CLOSED or IMPACTED)
        closed_count = status_counts.get("CLOSED", 0)
        impacted_count = status_counts.get("IMPACTED", 0)
        at_risk_count = status_counts.get("AT_RISK", 0)
        open_count = status_counts.get("OPEN", 0)
        
        total_facilities = len(facilities)
        critical_facilities = closed_count + impacted_count
        
        # Break down by facility type
        type_breakdown = summary.get("by_type", {})
        grocery_impact = type_breakdown.get("grocery", {})
        fuel_impact = type_breakdown.get("fuel_station", {})
        hospital_impact = type_breakdown.get("hospital", {})
        
        return {
            "critical_facilities_impacted": critical_facilities,
            "closed_facilities": closed_count,
            "impacted_facilities": impacted_count,
            "at_risk_facilities": at_risk_count,
            "open_facilities": open_count,
            "total_facilities": total_facilities,
            "impact_percentage": (critical_facilities / total_facilities * 100) if total_facilities > 0 else 0,
            "status_breakdown": status_counts,
            "type_breakdown": {
                "grocery": grocery_impact,
                "fuel_station": fuel_impact,
                "hospital": hospital_impact,
            },
            "impacted_facilities_list": [
                {
                    "name": f["name"],
                    "type": f["type"],
                    "status": f["status"],
                    "latitude": f.get("latitude"),
                    "longitude": f.get("longitude"),
                }
                for f in facilities
                if f["status"] in ("CLOSED", "IMPACTED", "AT_RISK")
            ][:10],  # Top 10 impacted facilities
        }
    except Exception as e:
        logger.error(f"Error getting infrastructure impact: {e}")
        return {
            "critical_facilities_impacted": 0,
            "closed_facilities": 0,
            "impacted_facilities": 0,
            "at_risk_facilities": 0,
            "open_facilities": 0,
            "total_facilities": 0,
            "impact_percentage": 0,
            "status_breakdown": {},
            "type_breakdown": {},
            "impacted_facilities_list": []
        }
