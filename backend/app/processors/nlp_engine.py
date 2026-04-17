"""
NLP Processing Engine.
Classifies text from social media and news into disruption categories.
Uses HuggingFace transformers for sentiment analysis and keyword-based disruption classification.
"""
import re
import logging
from typing import Dict, List, Optional, Tuple
from functools import lru_cache

logger = logging.getLogger(__name__)

# Try to load transformers; fall back to keyword-only mode if unavailable
try:
    from transformers import pipeline
    TRANSFORMERS_AVAILABLE = True
except Exception as e:
    TRANSFORMERS_AVAILABLE = False
    logger.warning(f"HuggingFace transformers not available (error: {e}). Using keyword-only NLP mode.")


# ── Disruption category keyword patterns ────────────────

DISRUPTION_PATTERNS = {
    "fuel_shortage": {
        "keywords": [
            r"no fuel", r"out of gas", r"gas shortage", r"fuel shortage",
            r"no gasoline", r"fuel station closed", r"gas station.*empty",
            r"can'?t find gas", r"fuel.*unavailable", r"pumps? (are )?empty",
            r"gas station.*no fuel", r"running out of fuel"
        ],
        "weight": 1.0
    },
    "grocery_shortage": {
        "keywords": [
            r"empty shelves", r"out of stock", r"grocery shortage",
            r"food shortage", r"no food", r"store.*empty",
            r"grocery.*closed", r"can'?t find (food|groceries|bread|milk|water)",
            r"supermarket.*shortage", r"panic buy", r"hoarding",
            r"water shortage", r"bottled water.*gone"
        ],
        "weight": 1.0
    },
    "road_blocked": {
        "keywords": [
            r"road closed", r"road blocked", r"highway closed",
            r"road.*impassable", r"bridge closed", r"road.*flood",
            r"street.*closed", r"can'?t (get through|pass)",
            r"intersection.*blocked", r"detour", r"road.*underwater"
        ],
        "weight": 0.9
    },
    "flooding": {
        "keywords": [
            r"flood", r"flooding", r"water level", r"underwater",
            r"flash flood", r"river.*overflow", r"basement.*flood",
            r"sewage.*overflow", r"water.*rising", r"submerged"
        ],
        "weight": 0.85
    },
    "power_outage": {
        "keywords": [
            r"power outage", r"no power", r"blackout", r"electricity.*out",
            r"power.*down", r"grid.*down", r"lights.*out",
            r"power.*restored", r"generator"
        ],
        "weight": 0.8
    },
    "panic_buying": {
        "keywords": [
            r"panic buy", r"hoarding", r"long lines", r"queue",
            r"fighting over", r"rush to (buy|store)", r"stocking up",
            r"sold out", r"cleaned out", r"shelves.*bare"
        ],
        "weight": 0.95
    },
    "inaccessible_location": {
        "keywords": [
            r"inaccessible", r"can'?t reach", r"cut off",
            r"stranded", r"isolated", r"no access", r"evacuate",
            r"rescue", r"trapped"
        ],
        "weight": 0.9
    }
}

# Chicago neighborhood/area keywords for geolocation hints
CHICAGO_AREAS = {
    "downtown": (41.8827, -87.6233),
    "loop": (41.8819, -87.6278),
    "south side": (41.7753, -87.6145),
    "north side": (41.9403, -87.6555),
    "west side": (41.8769, -87.7074),
    "hyde park": (41.7943, -87.5907),
    "lincoln park": (41.9214, -87.6513),
    "wicker park": (41.9088, -87.6796),
    "logan square": (41.9234, -87.7082),
    "pilsen": (41.8525, -87.6631),
    "chinatown": (41.8517, -87.6336),
    "bronzeville": (41.8152, -87.6102),
    "englewood": (41.7800, -87.6456),
    "austin": (41.8951, -87.7658),
    "humboldt park": (41.9026, -87.7215),
    "uptown": (41.9656, -87.6534),
    "rogers park": (42.0087, -87.6681),
    "bridgeport": (41.8381, -87.6503),
    "back of the yards": (41.8100, -87.6562),
    "midway": (41.7868, -87.7522),
    "o'hare": (41.9742, -87.9073),
    "lakeview": (41.9434, -87.6543),
    "ravenswood": (41.9742, -87.6744),
    "albany park": (41.9681, -87.7233),
    "garfield park": (41.8812, -87.7172),
    "chatham": (41.7410, -87.6125),
}


class NLPEngine:
    """Text analysis engine for disruption classification."""

    def __init__(self, use_transformers: bool = True):
        self.use_transformers = use_transformers
        self.sentiment_pipeline = None
        self.zero_shot_pipeline = None

    def _load_sentiment_pipeline(self):
        """Lazy load sentiment analysis model."""
        if self.sentiment_pipeline is None and self.use_transformers and TRANSFORMERS_AVAILABLE:
            try:
                logger.info("Initializing sentiment analysis pipeline...")
                self.sentiment_pipeline = pipeline(
                    "sentiment-analysis",
                    model="distilbert-base-uncased-finetuned-sst-2-english",
                    device=-1  # Force CPU
                )
                logger.info("✅ Sentiment analysis pipeline loaded")
            except Exception as e:
                logger.warning(f"Failed to load sentiment pipeline: {e}")
        return self.sentiment_pipeline

    def _load_zero_shot_pipeline(self):
        """Lazy load zero-shot classification model."""
        if self.zero_shot_pipeline is None and self.use_transformers and TRANSFORMERS_AVAILABLE:
            try:
                logger.info("Initializing zero-shot classification pipeline (this may take a minute)...")
                self.zero_shot_pipeline = pipeline(
                    "zero-shot-classification",
                    model="facebook/bart-large-mnli",
                    device=-1  # Force CPU
                )
                logger.info("✅ Zero-shot classification pipeline loaded")
            except Exception as e:
                logger.warning(f"Failed to load zero-shot pipeline: {e}")
        return self.zero_shot_pipeline


    def analyze_text(self, text: str) -> Dict:
        """
        Full analysis of a text: sentiment, disruption type, confidence, and keywords.
        """
        text_lower = text.lower()

        # 1. Detect disruption type via keyword patterns
        disruption_type, keyword_confidence, matched_keywords = self._classify_disruption(text_lower)

        # 2. Sentiment analysis
        sentiment = self._analyze_sentiment(text)

        # 3. Enhanced classification with zero-shot if available
        zs_pipeline = self._load_zero_shot_pipeline()
        if zs_pipeline and disruption_type == "general_disruption":
            zs_result = self._zero_shot_classify(text)
            if zs_result["confidence"] > keyword_confidence:
                disruption_type = zs_result["type"]
                keyword_confidence = zs_result["confidence"]

        # 4. Extract location hints
        location = self._extract_chicago_location(text_lower)

        return {
            "text": text[:500],
            "sentiment": sentiment["label"],
            "sentiment_score": sentiment["score"],
            "disruption_type": disruption_type,
            "confidence": round(keyword_confidence, 3),
            "keywords": matched_keywords,
            "location_hint": location,
        }

    def _classify_disruption(self, text: str) -> Tuple[str, float, List[str]]:
        """Keyword-based disruption classification."""
        best_type = "general_disruption"
        best_score = 0.0
        matched = []

        for dtype, config in DISRUPTION_PATTERNS.items():
            matches = []
            for pattern in config["keywords"]:
                if re.search(pattern, text, re.IGNORECASE):
                    matches.append(pattern)

            if matches:
                # Score based on number of matches and weight
                score = min(len(matches) / 3.0, 1.0) * config["weight"]
                if score > best_score:
                    best_score = score
                    best_type = dtype
                    matched = matches

        return best_type, best_score, matched

    def _analyze_sentiment(self, text: str) -> Dict:
        """Analyze sentiment using transformers or fallback."""
        s_pipeline = self._load_sentiment_pipeline()
        if s_pipeline:
            try:
                result = s_pipeline(text[:512])[0]
                return {
                    "label": result["label"].lower(),
                    "score": round(result["score"], 3)
                }
            except Exception as e:
                logger.debug(f"Sentiment analysis error: {e}")

        # Fallback: simple keyword-based sentiment
        negative_words = [
            "shortage", "disaster", "flood", "emergency", "closed",
            "blocked", "panic", "crisis", "destroyed", "damaged",
            "dangerous", "warning", "severe", "terrible", "awful"
        ]
        positive_words = [
            "restored", "reopened", "improving", "recovery",
            "relief", "help", "donate", "volunteer", "safe"
        ]

        text_lower = text.lower()
        neg_count = sum(1 for w in negative_words if w in text_lower)
        pos_count = sum(1 for w in positive_words if w in text_lower)

        if neg_count > pos_count:
            return {"label": "negative", "score": min(neg_count * 0.2 + 0.3, 0.95)}
        elif pos_count > neg_count:
            return {"label": "positive", "score": min(pos_count * 0.2 + 0.3, 0.95)}
        else:
            return {"label": "neutral", "score": 0.5}

    def _zero_shot_classify(self, text: str) -> Dict:
        """Use zero-shot classification for more nuanced categorization."""
        zs_pipeline = self._load_zero_shot_pipeline()
        if not zs_pipeline:
            return {"type": "general_disruption", "confidence": 0.0}

        candidate_labels = [
            "fuel shortage",
            "grocery shortage",
            "road closure or blockage",
            "flooding",
            "power outage",
            "panic buying",
            "general emergency"
        ]

        label_to_type = {
            "fuel shortage": "fuel_shortage",
            "grocery shortage": "grocery_shortage",
            "road closure or blockage": "road_blocked",
            "flooding": "flooding",
            "power outage": "power_outage",
            "panic buying": "panic_buying",
            "general emergency": "general_disruption"
        }

        try:
            result = zs_pipeline(text[:512], candidate_labels)
            top_label = result["labels"][0]
            top_score = result["scores"][0]
            return {
                "type": label_to_type.get(top_label, "general_disruption"),
                "confidence": round(top_score, 3)
            }
        except Exception as e:
            logger.debug(f"Zero-shot classification error: {e}")
            return {"type": "general_disruption", "confidence": 0.0}

    def _extract_chicago_location(self, text: str) -> Optional[Dict]:
        """
        Extract Chicago neighborhood/area mentions from text.
        Returns approximate coordinates.
        """
        for area_name, coords in CHICAGO_AREAS.items():
            if area_name in text:
                return {
                    "area": area_name,
                    "latitude": coords[0],
                    "longitude": coords[1]
                }
        return None

    def batch_analyze(self, texts: List[str]) -> List[Dict]:
        """Analyze multiple texts."""
        return [self.analyze_text(t) for t in texts]


# Singleton instance - lazy loaded
_engine: Optional[NLPEngine] = None


def get_nlp_engine(use_transformers: bool = True) -> NLPEngine:
    """Get or create the NLP engine singleton."""
    global _engine
    if _engine is None:
        _engine = NLPEngine(use_transformers=use_transformers)
    return _engine
