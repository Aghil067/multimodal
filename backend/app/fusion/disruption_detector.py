"""
Disruption Detection Model.
Uses both rule-based detection and optional ML-based classification
to identify supply chain disruptions.
"""
import logging
from typing import List, Dict, Any, Optional
from datetime import datetime, timezone

logger = logging.getLogger(__name__)

# Try to import ML libraries
try:
    import numpy as np
    from sklearn.ensemble import RandomForestClassifier, GradientBoostingClassifier
    ML_AVAILABLE = True
except Exception as e:
    ML_AVAILABLE = False
    logger.warning(f"ML libraries not available (error: {e}). Using rule-based detection only.")


class DisruptionDetector:
    """
    Detects supply chain disruptions using rule-based logic
    with optional ML model support.
    """

    # Rule-based thresholds
    RULES = {
        "fuel_shortage": {
            "min_traffic_score": 0.5,
            "min_social_score": 0.2,
            "infra_types": ["fuel_station"],
            "base_severity": 0.6,
        },
        "grocery_shortage": {
            "min_traffic_score": 0.4,
            "min_social_score": 0.3,
            "infra_types": ["grocery"],
            "base_severity": 0.65,
        },
        "road_blocked": {
            "min_traffic_score": 0.7,
            "min_social_score": 0.1,
            "infra_types": ["fuel_station", "grocery", "hospital"],
            "base_severity": 0.7,
        },
        "panic_buying": {
            "min_traffic_score": 0.3,
            "min_social_score": 0.5,
            "infra_types": ["grocery", "fuel_station"],
            "base_severity": 0.55,
        },
        "flooding": {
            "min_traffic_score": 0.3,
            "min_social_score": 0.2,
            "infra_types": ["fuel_station", "grocery", "hospital"],
            "base_severity": 0.7,
            "requires_weather": True,
        },
    }

    SEVERITY_LABELS = {
        (0.0, 0.3): "low",
        (0.3, 0.5): "medium",
        (0.5, 0.7): "high",
        (0.7, 1.0): "critical",
    }

    def __init__(self):
        self.ml_model = None
        self.feature_columns = [
            "traffic_score", "social_score", "infra_score",
            "news_score", "nearby_social_posts", "nearby_congested_segments"
        ]

    def detect_disruptions(
        self,
        fused_events: List[Dict],
        use_ml: bool = False
    ) -> List[Dict[str, Any]]:
        """
        Process fused events and detect disruptions.

        Args:
            fused_events: Output from DataFusionEngine.fuse_signals()
            use_ml: Whether to use ML model (if trained)

        Returns:
            List of detected disruption events with severity and confidence.
        """
        disruptions = []

        for event in fused_events:
            # Rule-based detection
            detection = self._rule_based_detect(event)

            if detection:
                # Optionally enhance with ML
                if use_ml and self.ml_model and ML_AVAILABLE:
                    ml_result = self._ml_predict(event)
                    detection = self._merge_predictions(detection, ml_result)

                disruptions.append(detection)

        # Deduplicate nearby disruptions
        disruptions = self._deduplicate(disruptions)

        logger.info(f"Detected {len(disruptions)} disruptions from {len(fused_events)} fused events")
        return disruptions

    def _rule_based_detect(self, event: Dict) -> Optional[Dict]:
        """Apply rule-based detection logic."""
        traffic_score = event.get("traffic_score", 0)
        social_score = event.get("social_score", 0)
        infra_type = event.get("infrastructure_type", "")
        disruption_type = event.get("disruption_type", "general_disruption")
        severity = event.get("severity_score", 0)

        # Check against rules
        matched_rule = None
        for rule_type, rule in self.RULES.items():
            if (traffic_score >= rule["min_traffic_score"] and
                social_score >= rule["min_social_score"] and
                infra_type in rule.get("infra_types", [])):
                if matched_rule is None or self.RULES[rule_type]["base_severity"] > self.RULES.get(matched_rule, {}).get("base_severity", 0):
                    matched_rule = rule_type

        if matched_rule:
            disruption_type = matched_rule
            rule = self.RULES[matched_rule]
            # Adjust severity based on rule
            severity = max(severity, rule["base_severity"])
            severity = min(severity * (1 + social_score * 0.3), 1.0)

        if severity < 0.25:
            return None

        # Determine severity label
        severity_label = "low"
        for (low, high), label in self.SEVERITY_LABELS.items():
            if low <= severity < high:
                severity_label = label
                break

        return {
            "location_name": event.get("location_name", "Unknown"),
            "latitude": event.get("latitude"),
            "longitude": event.get("longitude"),
            "disruption_type": disruption_type,
            "severity_score": round(severity, 3),
            "severity_label": severity_label,
            "confidence": event.get("confidence", 0.5),
            "traffic_score": traffic_score,
            "social_score": social_score,
            "infrastructure_type": infra_type,
            "description": event.get("description", ""),
            "contributing_factors": event.get("contributing_factors", []),
            "detected_at": datetime.now(timezone.utc).isoformat(),
            "rule_matched": matched_rule,
        }

    def _ml_predict(self, event: Dict) -> Optional[Dict]:
        """Use trained ML model for prediction."""
        if not self.ml_model or not ML_AVAILABLE:
            return None

        try:
            features = np.array([[
                event.get(col, 0) for col in self.feature_columns
            ]])

            prediction = self.ml_model.predict(features)[0]
            probability = self.ml_model.predict_proba(features).max()

            return {
                "disruption_type": prediction,
                "ml_confidence": float(probability),
            }
        except Exception as e:
            logger.error(f"ML prediction error: {e}")
            return None

    def _merge_predictions(self, rule_result: Dict, ml_result: Optional[Dict]) -> Dict:
        """Merge rule-based and ML predictions."""
        if not ml_result:
            return rule_result

        # If ML has high confidence, prefer ML classification
        if ml_result.get("ml_confidence", 0) > 0.8:
            rule_result["disruption_type"] = ml_result["disruption_type"]
            rule_result["confidence"] = max(
                rule_result["confidence"],
                ml_result["ml_confidence"]
            )
            rule_result["ml_enhanced"] = True

        return rule_result

    def _deduplicate(
        self,
        disruptions: List[Dict],
        min_distance_km: float = 0.5
    ) -> List[Dict]:
        """Remove duplicate disruptions that are very close together."""
        if len(disruptions) <= 1:
            return disruptions

        from app.processors.traffic_analyzer import haversine_distance

        unique = []
        for d in disruptions:
            is_duplicate = False
            for u in unique:
                if (d.get("disruption_type") == u.get("disruption_type") and
                    d.get("latitude") and u.get("latitude")):
                    dist = haversine_distance(
                        d["latitude"], d["longitude"],
                        u["latitude"], u["longitude"]
                    )
                    if dist < min_distance_km:
                        # Keep the one with higher severity
                        if d["severity_score"] > u["severity_score"]:
                            unique.remove(u)
                            unique.append(d)
                        is_duplicate = True
                        break

            if not is_duplicate:
                unique.append(d)

        return unique

    def train_model(self, training_data: List[Dict], labels: List[str]):
        """
        Train an ML model on historical disruption data.
        This would be called with labeled historical data.
        """
        if not ML_AVAILABLE:
            logger.error("Cannot train model: scikit-learn not installed")
            return

        try:
            X = np.array([
                [d.get(col, 0) for col in self.feature_columns]
                for d in training_data
            ])
            y = np.array(labels)

            self.ml_model = GradientBoostingClassifier(
                n_estimators=100,
                max_depth=5,
                random_state=42
            )
            self.ml_model.fit(X, y)
            logger.info(f"ML model trained on {len(training_data)} samples")

        except Exception as e:
            logger.error(f"Model training error: {e}")


# Singleton
_detector: Optional[DisruptionDetector] = None


def get_disruption_detector() -> DisruptionDetector:
    """Get or create the disruption detector singleton."""
    global _detector
    if _detector is None:
        _detector = DisruptionDetector()
    return _detector
