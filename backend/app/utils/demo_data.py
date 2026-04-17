"""
Demo data generator - provides realistic sample disruptions when live data is limited.
Used as fallback to ensure dashboard always shows meaningful data.
"""
import random
from datetime import datetime, timezone, timedelta
from typing import List, Dict, Any

# Chicago area hotspots
CHICAGO_LOCATIONS = [
    {"name": "O'Hare Airport", "lat": 41.9742, "lng": -87.9073, "type": "airport"},
    {"name": "Dan Ryan Expressway", "lat": 41.8200, "lng": -87.6210, "type": "highway"},
    {"name": "Lake Shore Drive", "lat": 41.8800, "lng": -87.6150, "type": "highway"},
    {"name": "Downtown Chicago", "lat": 41.8819, "lng": -87.6278, "type": "commercial"},
    {"name": "Midway Airport", "lat": 41.7861, "lng": -87.7522, "type": "airport"},
    {"name": "Navy Pier", "lat": 41.8919, "lng": -87.6070, "type": "commercial"},
    {"name": "Willis Tower Area", "lat": 41.8789, "lng": -87.6359, "type": "commercial"},
    {"name": "McCormick Place", "lat": 41.8529, "lng": -87.6161, "type": "commercial"},
    {"name": "Garfield Park", "lat": 41.8894, "lng": -87.7162, "type": "park"},
    {"name": "North Shore", "lat": 42.0100, "lng": -87.6800, "type": "residential"},
]

DISRUPTION_TYPES = {
    "traffic_congestion": {
        "base_severity": 0.5,
        "label": "Traffic Congestion",
        "icon": "🚗"
    },
    "supply_shortage": {
        "base_severity": 0.7,
        "label": "Supply Shortage",
        "icon": "📦"
    },
    "road_closed": {
        "base_severity": 0.75,
        "label": "Road Closed",
        "icon": "🚫"
    },
    "facility_issue": {
        "base_severity": 0.65,
        "label": "Facility Issue",
        "icon": "🏢"
    },
    "weather_impact": {
        "base_severity": 0.6,
        "label": "Weather Impact",
        "icon": "⛈️"
    },
}

CONTRIBUTING_FACTORS = [
    "High traffic volume",
    "Social media reports",
    "Weather conditions",
    "Infrastructure issues",
    "Supply chain delays",
    "Accident on major route",
    "Demand surge",
    "Seasonal impact",
]


def generate_demo_disruptions(count: int = 3) -> List[Dict[str, Any]]:
    """Generate realistic sample disruptions for demo purposes."""
    disruptions = []
    now = datetime.now(timezone.utc)

    for _ in range(count):
        location = random.choice(CHICAGO_LOCATIONS)
        disruption_type = random.choice(list(DISRUPTION_TYPES.keys()))
        type_info = DISRUPTION_TYPES[disruption_type]

        severity = type_info["base_severity"] + random.uniform(-0.15, 0.2)
        severity = max(0.1, min(1.0, severity))

        # Severity label
        if severity < 0.3:
            severity_label = "low"
        elif severity < 0.5:
            severity_label = "medium"
        elif severity < 0.7:
            severity_label = "high"
        else:
            severity_label = "critical"

        detected_at = now - timedelta(minutes=random.randint(5, 120))

        disruptions.append({
            "location_name": location["name"],
            "latitude": location["lat"] + random.uniform(-0.02, 0.02),
            "longitude": location["lng"] + random.uniform(-0.02, 0.02),
            "disruption_type": disruption_type,
            "severity_score": round(severity, 3),
            "severity_label": severity_label,
            "confidence": round(random.uniform(0.6, 0.95), 2),
            "traffic_score": round(random.uniform(0.2, 0.9), 2),
            "social_score": round(random.uniform(0.1, 0.7), 2),
            "infrastructure_type": random.choice(["fuel_station", "grocery", "hospital"]),
            "description": f"Demo: {type_info['label']} detected at {location['name']}. "
                          f"Multiple data sources indicate potential supply chain impact.",
            "contributing_factors": random.sample(CONTRIBUTING_FACTORS, k=random.randint(2, 4)),
            "detected_at": detected_at.isoformat(),
            "rule_matched": disruption_type,
            "is_demo": True,
        })

    return disruptions


def generate_demo_alerts(disruptions: List[Dict]) -> List[Dict[str, Any]]:
    """Generate alerts from demo disruptions."""
    alerts = []

    for disruption in disruptions:
        alert = {
            "id": f"alert-{hash(disruption['location_name']) % 10000}",
            "type": "disruption",
            "title": f"{disruption['disruption_type'].replace('_', ' ').title()} at {disruption['location_name']}",
            "description": disruption["description"],
            "severity": disruption["severity_label"],
            "latitude": disruption["latitude"],
            "longitude": disruption["longitude"],
            "timestamp": disruption["detected_at"],
            "contributing_factors": disruption["contributing_factors"],
            "is_demo": True,
        }
        alerts.append(alert)

    return alerts


def generate_demo_infrastructure() -> List[Dict[str, Any]]:
    """Generate comprehensive demo infrastructure locations across Chicago for fallback when OSM is unavailable."""
    # Realistic Chicago locations across multiple neighborhoods/zones
    demo_locations = [
        # Downtown/Loop
        {"name": "Whole Foods - Downtown", "latitude": 41.8819, "longitude": -87.6278, "type": "grocery"},
        {"name": "Mariano's - Loop", "latitude": 41.8850, "longitude": -87.6300, "type": "grocery"},
        {"name": "Jewel-Osco - Illinois Center", "latitude": 41.8900, "longitude": -87.6150, "type": "grocery"},
        {"name": "Shell Downtown", "latitude": 41.8800, "longitude": -87.6250, "type": "fuel_station"},
        {"name": "BP Station - Congress", "latitude": 41.8750, "longitude": -87.6350, "type": "fuel_station"},
        {"name": "Rush University Medical", "latitude": 41.8683, "longitude": -87.6821, "type": "hospital"},
        {"name": "Northwestern Memorial", "latitude": 41.8950, "longitude": -87.6220, "type": "hospital"},
        {"name": "CVS Pharmacy - Loop", "latitude": 41.8819, "longitude": -87.6278, "type": "pharmacy"},
        {"name": "Walgreens - Michigan Ave", "latitude": 41.8860, "longitude": -87.6240, "type": "pharmacy"},
        
        # River North / Gold Coast
        {"name": "Trader Joe's - River North", "latitude": 41.8950, "longitude": -87.6350, "type": "grocery"},
        {"name": "Whole Foods - Old Town", "latitude": 41.9100, "longitude": -87.6450, "type": "grocery"},
        {"name": "Target - River North", "latitude": 41.8920, "longitude": -87.6380, "type": "grocery"},
        {"name": "Shell - North Ave", "latitude": 41.9100, "longitude": -87.6400, "type": "fuel_station"},
        
        # North Shore
        {"name": "Jewel-Osco - Evanston", "latitude": 42.0100, "longitude": -87.6800, "type": "grocery"},
        {"name": "Target - Skokie", "latitude": 42.0300, "longitude": -87.7200, "type": "grocery"},
        {"name": "Whole Foods - Winnetka", "latitude": 42.1100, "longitude": -87.7300, "type": "grocery"},
        {"name": "BP Station - Evanston", "latitude": 42.0150, "longitude": -87.6850, "type": "fuel_station"},
        {"name": "Speedway - Skokie", "latitude": 42.0350, "longitude": -87.7250, "type": "fuel_station"},
        {"name": "Loyola University Hospital", "latitude": 42.0208, "longitude": -87.6729, "type": "hospital"},
        {"name": "Evanston Hospital", "latitude": 42.0450, "longitude": -87.6950, "type": "hospital"},
        
        # Near West Side
        {"name": "Mariano's - West Madison", "latitude": 41.8800, "longitude": -87.7100, "type": "grocery"},
        {"name": "Jewel-Osco - Pilsen", "latitude": 41.8450, "longitude": -87.6550, "type": "grocery"},
        {"name": "Stroger Hospital", "latitude": 41.8747, "longitude": -87.6744, "type": "hospital"},
        {"name": "Shell - Madison", "latitude": 41.8820, "longitude": -87.7150, "type": "fuel_station"},
        
        # South Loop / Bridgeport
        {"name": "Whole Foods - South Loop", "latitude": 41.8500, "longitude": -87.6200, "type": "grocery"},
        {"name": "Target - Midway", "latitude": 41.7861, "longitude": -87.7522, "type": "grocery"},
        {"name": "Jewel-Osco - Bridgeport", "latitude": 41.8300, "longitude": -87.6400, "type": "grocery"},
        {"name": "Mercy Hospital", "latitude": 41.8379, "longitude": -87.6278, "type": "hospital"},
        
        # Near North / Chicago Avenue
        {"name": "Mariano's - Chicago Ave", "latitude": 41.8950, "longitude": -87.6200, "type": "grocery"},
        {"name": "Trader Joe's - Lincoln Park", "latitude": 41.9300, "longitude": -87.6400, "type": "grocery"},
        {"name": "CVS - Clark St", "latitude": 41.9350, "longitude": -87.6450, "type": "pharmacy"},
        {"name": "Speedway - Lincoln", "latitude": 41.9250, "longitude": -87.6500, "type": "fuel_station"},
        
        # West Loop
        {"name": "Whole Foods - West Loop", "latitude": 41.8850, "longitude": -87.6750, "type": "grocery"},
        {"name": "Target - Lakeview", "latitude": 41.9400, "longitude": -87.6350, "type": "grocery"},
        
        # Hyde Park
        {"name": "Whole Foods - Hyde Park", "latitude": 41.7970, "longitude": -87.5970, "type": "grocery"},
        {"name": "UChicago Medical Center", "latitude": 41.7820, "longitude": -87.5968, "type": "hospital"},
        
        # O'Hare / Northwest
        {"name": "Mariano's - O'Hare", "latitude": 41.9700, "longitude": -87.9100, "type": "grocery"},
        {"name": "Shell Station - O'Hare", "latitude": 41.9742, "longitude": -87.9073, "type": "fuel_station"},
        {"name": "Target - Rosemont", "latitude": 41.9950, "longitude": -87.8750, "type": "grocery"},
        
        # Lakeview / Boystown
        {"name": "Whole Foods - Lakeview", "latitude": 41.9450, "longitude": -87.6300, "type": "grocery"},
        {"name": "Jewel-Osco - Lakeview", "latitude": 41.9500, "longitude": -87.6250, "type": "grocery"},
        {"name": "CVS - Lakeview", "latitude": 41.9400, "longitude": -87.6350, "type": "pharmacy"},
        
        # Multiple pharmacy locations
        {"name": "Walgreens - State St", "latitude": 41.8900, "longitude": -87.6270, "type": "pharmacy"},
        {"name": "CVS - N Halsted", "latitude": 41.9350, "longitude": -87.6480, "type": "pharmacy"},
        {"name": "Walgreens - Division St", "latitude": 41.9030, "longitude": -87.6450, "type": "pharmacy"},
        {"name": "CVS - Ashland", "latitude": 41.8750, "longitude": -87.6650, "type": "pharmacy"},
    ]
    
    # Add small randomization to coordinates for realism
    for loc in demo_locations:
        loc["latitude"] += random.uniform(-0.003, 0.003)
        loc["longitude"] += random.uniform(-0.003, 0.003)
        loc["osm_id"] = f"demo-{hash(loc['name']) % 1000000}"
        loc["address"] = f"Chicago, IL"
        loc["brand"] = random.choice([None, "Shell", "BP", "Walgreens", "CVS", "Target", "Whole Foods", "Jewel", "Mariano's"])
    
    return demo_locations
