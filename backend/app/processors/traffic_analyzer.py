"""
Traffic Analysis Engine.
Detects anomalous traffic congestion patterns, particularly near critical infrastructure.
"""
import logging
import math
from typing import List, Dict, Any, Optional, Tuple
from collections import defaultdict

logger = logging.getLogger(__name__)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """
    Calculate the distance between two points on Earth using the Haversine formula.
    Returns distance in kilometers.
    """
    R = 6371.0  # Earth's radius in km

    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class TrafficAnalyzer:
    """Analyzes traffic data to detect congestion anomalies."""

    # Congestion level numeric mapping
    CONGESTION_VALUES = {
        "low": 0.2,
        "medium": 0.5,
        "high": 0.8,
        "severe": 1.0,
        "unknown": 0.3
    }

    def __init__(self):
        self.historical_speeds = defaultdict(list)  # segment_id -> list of speeds

    def analyze_segments(self, traffic_segments: List[Dict]) -> Dict[str, Any]:
        """
        Analyze a batch of traffic segments and return congestion summary.
        """
        if not traffic_segments:
            return {
                "total_segments": 0,
                "avg_congestion": 0.0,
                "severe_count": 0,
                "high_count": 0,
                "congestion_hotspots": [],
                "overall_status": "no_data"
            }

        congestion_counts = defaultdict(int)
        total_congestion_score = 0.0
        hotspots = []

        for seg in traffic_segments:
            level = seg.get("congestion_level", "unknown")
            congestion_counts[level] += 1
            score = self.CONGESTION_VALUES.get(level, 0.3)
            total_congestion_score += score

            # Track anomalies
            if level in ("high", "severe"):
                hotspots.append({
                    "segment_id": seg.get("segment_id"),
                    "street": seg.get("street"),
                    "congestion_level": level,
                    "congestion_score": score,
                    "current_speed": seg.get("current_speed", 0),
                    "free_flow_speed": seg.get("free_flow_speed", 0),
                    "latitude": seg.get("latitude"),
                    "longitude": seg.get("longitude"),
                })

            # Update speed history
            seg_id = seg.get("segment_id")
            if seg_id:
                speed = seg.get("current_speed", 0)
                self.historical_speeds[seg_id].append(speed)
                # Keep only last 100 readings
                if len(self.historical_speeds[seg_id]) > 100:
                    self.historical_speeds[seg_id] = self.historical_speeds[seg_id][-100:]

        total = len(traffic_segments)
        avg_congestion = total_congestion_score / total if total > 0 else 0

        # Determine overall status
        severe_ratio = congestion_counts.get("severe", 0) / total if total > 0 else 0
        high_ratio = congestion_counts.get("high", 0) / total if total > 0 else 0

        if severe_ratio > 0.2:
            status = "critical"
        elif severe_ratio > 0.1 or high_ratio > 0.3:
            status = "warning"
        elif avg_congestion > 0.5:
            status = "elevated"
        else:
            status = "normal"

        return {
            "total_segments": total,
            "avg_congestion": round(avg_congestion, 3),
            "severe_count": congestion_counts.get("severe", 0),
            "high_count": congestion_counts.get("high", 0),
            "medium_count": congestion_counts.get("medium", 0),
            "low_count": congestion_counts.get("low", 0),
            "congestion_hotspots": sorted(
                hotspots, key=lambda x: x["congestion_score"], reverse=True
            )[:20],
            "overall_status": status,
            "congestion_distribution": dict(congestion_counts)
        }

    def detect_anomalies(self, traffic_segments: List[Dict]) -> List[Dict]:
        """
        Detect traffic anomalies: segments where current speed is significantly
        lower than their historical average.
        """
        anomalies = []

        for seg in traffic_segments:
            seg_id = seg.get("segment_id")
            current_speed = seg.get("current_speed", 0)

            if seg_id and seg_id in self.historical_speeds:
                history = self.historical_speeds[seg_id]
                if len(history) >= 5:  # Need enough history
                    avg_speed = sum(history) / len(history)
                    if avg_speed > 0 and current_speed < avg_speed * 0.5:
                        anomalies.append({
                            "segment_id": seg_id,
                            "street": seg.get("street"),
                            "current_speed": current_speed,
                            "avg_speed": round(avg_speed, 1),
                            "drop_percentage": round((1 - current_speed / avg_speed) * 100, 1),
                            "latitude": seg.get("latitude"),
                            "longitude": seg.get("longitude"),
                            "anomaly_type": "speed_drop"
                        })

        return anomalies

    def congestion_near_infrastructure(
        self,
        traffic_segments: List[Dict],
        infrastructure: List[Dict],
        radius_km: float = 1.0
    ) -> List[Dict]:
        """
        Find infrastructure locations experiencing high traffic congestion nearby.
        This is a key signal for supply chain disruptions.
        """
        results = []

        for infra in infrastructure:
            infra_lat = infra.get("latitude")
            infra_lng = infra.get("longitude")

            if not infra_lat or not infra_lng:
                continue

            nearby_congestion = []
            for seg in traffic_segments:
                seg_lat = seg.get("latitude")
                seg_lng = seg.get("longitude")

                if not seg_lat or not seg_lng:
                    continue

                distance = haversine_distance(infra_lat, infra_lng, seg_lat, seg_lng)

                if distance <= radius_km:
                    level = seg.get("congestion_level", "unknown")
                    nearby_congestion.append({
                        "segment_id": seg.get("segment_id"),
                        "street": seg.get("street"),
                        "congestion_level": level,
                        "congestion_score": self.CONGESTION_VALUES.get(level, 0.3),
                        "distance_km": round(distance, 2),
                        "current_speed": seg.get("current_speed", 0),
                    })

            if nearby_congestion:
                avg_score = sum(c["congestion_score"] for c in nearby_congestion) / len(nearby_congestion)
                max_score = max(c["congestion_score"] for c in nearby_congestion)

                results.append({
                    "infrastructure_name": infra.get("name"),
                    "infrastructure_type": infra.get("type"),
                    "latitude": infra_lat,
                    "longitude": infra_lng,
                    "nearby_segments": len(nearby_congestion),
                    "avg_congestion_score": round(avg_score, 3),
                    "max_congestion_score": max_score,
                    "high_congestion_count": sum(
                        1 for c in nearby_congestion
                        if c["congestion_level"] in ("high", "severe")
                    ),
                    "congested_streets": [
                        c for c in nearby_congestion
                        if c["congestion_level"] in ("high", "severe")
                    ][:5]
                })

        # Sort by congestion severity
        results.sort(key=lambda x: x["avg_congestion_score"], reverse=True)
        return results


# Singleton
_analyzer: Optional[TrafficAnalyzer] = None


def get_traffic_analyzer() -> TrafficAnalyzer:
    """Get or create the traffic analyzer singleton."""
    global _analyzer
    if _analyzer is None:
        _analyzer = TrafficAnalyzer()
    return _analyzer
