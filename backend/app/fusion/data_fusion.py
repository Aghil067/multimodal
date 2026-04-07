"""
Data Fusion Engine.
Combines traffic, social media, infrastructure, and news signals
to produce unified disruption assessments.
"""
import logging
import math
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone
from collections import defaultdict

logger = logging.getLogger(__name__)


def haversine_distance(lat1: float, lon1: float, lat2: float, lon2: float) -> float:
    """Calculate distance in km."""
    R = 6371.0
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    a = (math.sin(dlat / 2) ** 2 +
         math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) *
         math.sin(dlon / 2) ** 2)
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    return R * c


class DataFusionEngine:
    """
    Fuses multiple data modalities into a unified disruption score.

    Signal weights:
    - Traffic congestion: 30%
    - Social media reports: 30%
    - Infrastructure proximity: 20%
    - News/weather alerts: 20%
    """

    WEIGHTS = {
        "traffic": 0.30,
        "social": 0.30,
        "infrastructure": 0.20,
        "news": 0.20,
    }

    # Type mapping from signals
    TYPE_PRIORITY = {
        "fuel_shortage": 5,
        "grocery_shortage": 5,
        "road_blocked": 4,
        "flooding": 4,
        "panic_buying": 3,
        "power_outage": 3,
        "inaccessible_location": 4,
        "general_disruption": 1,
    }

    def fuse_signals(
        self,
        traffic_data: List[Dict],
        social_posts: List[Dict],
        infrastructure: List[Dict],
        news_alerts: List[Dict] = None,
        weather_alerts: List[Dict] = None,
        fusion_radius_km: float = 2.0,
    ) -> List[Dict[str, Any]]:
        """
        Perform multimodal data fusion across all signals.

        Steps:
        1. Create spatial grid of analysis cells
        2. Assign each data point to its nearest cell
        3. Compute per-cell disruption scores
        4. Generate disruption events for cells above threshold
        """
        if not infrastructure:
            logger.warning("No infrastructure data available for fusion")
            return []

        # Use infrastructure locations as anchor points for fusion
        fusion_results = []

        for infra in infrastructure:
            infra_lat = infra.get("latitude")
            infra_lng = infra.get("longitude")
            if not infra_lat or not infra_lng:
                continue

            # ── 1. Traffic signal ────────────────────
            nearby_traffic = [
                seg for seg in traffic_data
                if seg.get("latitude") and seg.get("longitude")
                and haversine_distance(
                    infra_lat, infra_lng,
                    seg["latitude"], seg["longitude"]
                ) <= fusion_radius_km
            ]

            traffic_score = self._compute_traffic_score(nearby_traffic)

            # ── 2. Social media signal ───────────────
            nearby_social = [
                post for post in social_posts
                if self._is_near(post, infra_lat, infra_lng, fusion_radius_km)
            ]

            social_score, social_disruption_type = self._compute_social_score(nearby_social)

            # ── 3. Infrastructure relevance ──────────
            infra_score = self._compute_infrastructure_score(infra)

            # ── 4. News/weather signal ───────────────
            news_score = self._compute_news_score(
                news_alerts or [],
                weather_alerts or [],
                infra_lat, infra_lng, fusion_radius_km
            )

            # ── Fusion: weighted combination ─────────
            fused_score = (
                self.WEIGHTS["traffic"] * traffic_score +
                self.WEIGHTS["social"] * social_score +
                self.WEIGHTS["infrastructure"] * infra_score +
                self.WEIGHTS["news"] * news_score
            )

            # Determine disruption type
            disruption_type = self._determine_disruption_type(
                infra, social_disruption_type, traffic_score
            )

            # Calculate confidence
            signals_present = sum([
                1 if traffic_score > 0.1 else 0,
                1 if social_score > 0.1 else 0,
                1 if news_score > 0.1 else 0,
            ])
            confidence = min(0.3 + signals_present * 0.2 + fused_score * 0.3, 1.0)

            # Generate contributing factors
            factors = []
            if traffic_score > 0.3:
                factors.append(f"High traffic congestion (score: {traffic_score:.2f})")
            if social_score > 0.2:
                factors.append(f"Social media reports ({len(nearby_social)} posts)")
            if news_score > 0.2:
                factors.append(f"Active news/weather alerts")
            if infra_score > 0.5:
                factors.append(f"Critical infrastructure type: {infra.get('type')}")

            if fused_score >= 0.3:  # Minimum threshold for reporting
                fusion_results.append({
                    "location_name": infra.get("name", "Unknown Location"),
                    "latitude": infra_lat,
                    "longitude": infra_lng,
                    "infrastructure_type": infra.get("type"),
                    "disruption_type": disruption_type,
                    "severity_score": round(fused_score, 3),
                    "confidence": round(confidence, 3),
                    "traffic_score": round(traffic_score, 3),
                    "social_score": round(social_score, 3),
                    "news_score": round(news_score, 3),
                    "infra_score": round(infra_score, 3),
                    "contributing_factors": factors,
                    "nearby_social_posts": len(nearby_social),
                    "nearby_congested_segments": len([
                        s for s in nearby_traffic
                        if s.get("congestion_level") in ("high", "severe")
                    ]),
                    "description": self._generate_description(
                        infra, disruption_type, fused_score,
                        traffic_score, social_score, factors
                    ),
                    "detected_at": datetime.now(timezone.utc).isoformat()
                })

        # Sort by severity
        fusion_results.sort(key=lambda x: x["severity_score"], reverse=True)
        logger.info(f"Data fusion produced {len(fusion_results)} disruption events")
        return fusion_results

    def _compute_traffic_score(self, traffic_segments: List[Dict]) -> float:
        """Compute a 0-1 traffic congestion score from nearby segments."""
        if not traffic_segments:
            return 0.0

        congestion_map = {
            "low": 0.2, "medium": 0.5, "high": 0.8, "severe": 1.0
        }

        scores = [
            congestion_map.get(seg.get("congestion_level", "unknown"), 0.3)
            for seg in traffic_segments
        ]

        # Use a combination of average and max for robustness
        avg_score = sum(scores) / len(scores)
        max_score = max(scores)
        return 0.6 * avg_score + 0.4 * max_score

    def _compute_social_score(self, posts: List[Dict]) -> tuple:
        """Compute social media disruption score and dominant type."""
        if not posts:
            return 0.0, "general_disruption"

        type_counts = defaultdict(float)

        for post in posts:
            d_type = post.get("disruption_type", "general_disruption")
            conf = post.get("confidence", 0.5)
            type_counts[d_type] += conf

        # Score scales with number and confidence of reports
        total_weight = sum(type_counts.values())
        score = min(total_weight / 3.0, 1.0)  # 3+ confident reports = max score

        # Dominant disruption type
        best_type = max(type_counts, key=type_counts.get) if type_counts else "general_disruption"

        return score, best_type

    def _compute_infrastructure_score(self, infra: Dict) -> float:
        """Score infrastructure importance (critical facilities score higher)."""
        type_scores = {
            "hospital": 0.9,
            "fuel_station": 0.7,
            "grocery": 0.6,
            "pharmacy": 0.65,
            "other": 0.3
        }
        return type_scores.get(infra.get("type", "other"), 0.3)

    def _compute_news_score(
        self,
        news_alerts: List[Dict],
        weather_alerts: List[Dict],
        lat: float,
        lng: float,
        radius_km: float
    ) -> float:
        """Compute news/weather alert score for the area."""
        score = 0.0

        # Weather alerts (highest priority)
        if weather_alerts:
            severity_map = {
                "critical": 1.0, "high": 0.8, "medium": 0.5, "low": 0.3
            }
            for alert in weather_alerts:
                alert_severity = severity_map.get(alert.get("severity", "low"), 0.3)
                score = max(score, alert_severity)

        # News articles contribute incrementally
        if news_alerts:
            news_bonus = min(len(news_alerts) * 0.15, 0.6)
            score = max(score, news_bonus)

        return min(score, 1.0)

    def _is_near(
        self, post: Dict, lat: float, lng: float, radius_km: float
    ) -> bool:
        """Check if a social post is near a location (uses location hints)."""
        post_lat = post.get("latitude")
        post_lng = post.get("longitude")

        if post_lat and post_lng:
            return haversine_distance(lat, lng, post_lat, post_lng) <= radius_km

        # Check location hints from NLP
        hint = post.get("location_hint")
        if hint and hint.get("latitude") and hint.get("longitude"):
            return haversine_distance(
                lat, lng, hint["latitude"], hint["longitude"]
            ) <= radius_km * 2  # Wider radius for hints

        # If no location, consider it potentially relevant (weak signal)
        return True  # Include but with lower confidence

    def _determine_disruption_type(
        self,
        infra: Dict,
        social_type: str,
        traffic_score: float
    ) -> str:
        """Determine the most likely disruption type based on all signals."""
        infra_type = infra.get("type", "")

        # Direct mapping from infrastructure type
        if social_type != "general_disruption":
            return social_type

        if infra_type == "fuel_station" and traffic_score > 0.5:
            return "fuel_shortage"
        elif infra_type == "grocery" and traffic_score > 0.5:
            return "grocery_shortage"
        elif traffic_score > 0.7:
            return "road_blocked"
        else:
            return "general_disruption"

    def _generate_description(
        self,
        infra: Dict,
        disruption_type: str,
        severity: float,
        traffic_score: float,
        social_score: float,
        factors: List[str]
    ) -> str:
        """Generate a human-readable description of the disruption."""
        severity_label = "severe" if severity > 0.7 else "moderate" if severity > 0.4 else "mild"
        type_labels = {
            "fuel_shortage": "fuel shortage",
            "grocery_shortage": "grocery supply shortage",
            "road_blocked": "road blockage or closure",
            "flooding": "flooding",
            "panic_buying": "panic buying activity",
            "power_outage": "power outage",
            "inaccessible_location": "location inaccessibility",
            "general_disruption": "supply chain disruption"
        }

        type_label = type_labels.get(disruption_type, "disruption")
        name = infra.get("name", "Unknown")

        desc = (
            f"Possible {severity_label} {type_label} detected near "
            f"{name} ({infra.get('type', 'facility')}). "
        )

        if factors:
            desc += "Contributing signals: " + "; ".join(factors) + "."

        return desc


# Singleton
_fusion_engine: Optional[DataFusionEngine] = None


def get_fusion_engine() -> DataFusionEngine:
    """Get or create the fusion engine singleton."""
    global _fusion_engine
    if _fusion_engine is None:
        _fusion_engine = DataFusionEngine()
    return _fusion_engine
