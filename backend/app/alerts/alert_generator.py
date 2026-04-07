"""
Alert Generation System.
Generates human-readable alerts from detected disruptions.
"""
import logging
from typing import List, Dict, Any
from datetime import datetime, timezone

logger = logging.getLogger(__name__)


class AlertGenerator:
    """Generates alerts from detected disruptions."""

    SEVERITY_EMOJI = {
        "critical": "🔴",
        "high": "🟠",
        "medium": "🟡",
        "low": "🟢",
    }

    DISRUPTION_TEMPLATES = {
        "fuel_shortage": (
            "Possible fuel shortage detected near {location} "
            "({area}). Traffic congestion level: {traffic_level}. "
            "{social_info}"
        ),
        "grocery_shortage": (
            "Potential grocery supply shortage at {location} "
            "({area}). {social_info} "
            "Traffic disruption in surrounding area."
        ),
        "road_blocked": (
            "Road blockage or severe congestion detected near {location} "
            "({area}). Access to nearby facilities may be impacted. "
            "{traffic_detail}"
        ),
        "flooding": (
            "Flooding-related disruption near {location} ({area}). "
            "Infrastructure may be inaccessible. "
            "{weather_info}"
        ),
        "panic_buying": (
            "Panic buying activity reported near {location} ({area}). "
            "{social_info} Expect supply shortages."
        ),
        "power_outage": (
            "Power outage affecting area near {location} ({area}). "
            "Facilities may be non-operational."
        ),
        "inaccessible_location": (
            "Location {location} ({area}) reported as inaccessible. "
            "{social_info}"
        ),
        "general_disruption": (
            "Supply chain disruption detected near {location} ({area}). "
            "Multiple signals indicate potential issues. {social_info}"
        ),
    }

    def generate_alerts(
        self,
        disruptions: List[Dict],
        min_severity: float = 0.3
    ) -> List[Dict[str, Any]]:
        """
        Generate alerts from detected disruptions.

        Args:
            disruptions: List of disruption events from DisruptionDetector
            min_severity: Minimum severity score to generate an alert

        Returns:
            List of alert dictionaries
        """
        alerts = []

        for disruption in disruptions:
            severity_score = disruption.get("severity_score", 0)
            if severity_score < min_severity:
                continue

            alert = self._create_alert(disruption)
            if alert:
                alerts.append(alert)

        # Sort by severity (critical first)
        severity_order = {"critical": 0, "high": 1, "medium": 2, "low": 3}
        alerts.sort(key=lambda a: severity_order.get(a["severity"], 4))

        logger.info(f"Generated {len(alerts)} alerts from {len(disruptions)} disruptions")
        return alerts

    def _create_alert(self, disruption: Dict) -> Dict:
        """Create a single alert from a disruption event."""
        d_type = disruption.get("disruption_type", "general_disruption")
        severity_score = disruption.get("severity_score", 0)
        location = disruption.get("location_name", "Unknown Location")
        infra_type = disruption.get("infrastructure_type", "facility")

        # Determine severity label
        if severity_score >= 0.7:
            severity = "critical"
        elif severity_score >= 0.5:
            severity = "high"
        elif severity_score >= 0.3:
            severity = "medium"
        else:
            severity = "low"

        emoji = self.SEVERITY_EMOJI.get(severity, "⚪")

        # Build message from template
        template = self.DISRUPTION_TEMPLATES.get(
            d_type,
            self.DISRUPTION_TEMPLATES["general_disruption"]
        )

        # Contextual info
        traffic_score = disruption.get("traffic_score", 0)
        traffic_level = (
            "severe" if traffic_score > 0.7 else
            "high" if traffic_score > 0.5 else
            "moderate" if traffic_score > 0.3 else
            "normal"
        )

        social_count = disruption.get("nearby_social_posts", 0)
        social_info = (
            f"{social_count} social media reports confirm disruption."
            if social_count > 0
            else "Social media reports are being monitored."
        )

        traffic_detail = (
            f"Congestion score: {traffic_score:.1%}. "
            f"{disruption.get('nearby_congested_segments', 0)} road segments affected."
        )

        message = template.format(
            location=location,
            area=infra_type.replace("_", " "),
            traffic_level=traffic_level,
            social_info=social_info,
            traffic_detail=traffic_detail,
            weather_info="Check weather updates for latest conditions.",
        )

        return {
            "message": f"{emoji} [{severity.upper()}] {message}",
            "severity": severity,
            "severity_score": severity_score,
            "disruption_type": d_type,
            "location_name": location,
            "latitude": disruption.get("latitude"),
            "longitude": disruption.get("longitude"),
            "infrastructure_type": infra_type,
            "contributing_factors": disruption.get("contributing_factors", []),
            "created_at": datetime.now(timezone.utc).isoformat(),
        }


# Singleton
_generator = None


def get_alert_generator() -> AlertGenerator:
    """Get or create the alert generator singleton."""
    global _generator
    if _generator is None:
        _generator = AlertGenerator()
    return _generator
