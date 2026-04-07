"""
Configuration module - loads environment variables for API keys and settings.
"""
import os
from dotenv import load_dotenv

load_dotenv()


class Settings:
    """Application settings loaded from environment variables."""

    # Database
    DATABASE_URL: str = os.getenv(
        "DATABASE_URL",
        "postgresql://postgres:postgres@localhost:5432/multimodal_disruptions"
    )

    # HERE Traffic API
    HERE_API_KEY: str = os.getenv("HERE_API_KEY", "")

    # News API
    NEWS_API_KEY: str = os.getenv("NEWS_API_KEY", "")

    # Reddit API
    REDDIT_CLIENT_ID: str = os.getenv("REDDIT_CLIENT_ID", "")
    REDDIT_CLIENT_SECRET: str = os.getenv("REDDIT_CLIENT_SECRET", "")
    REDDIT_USER_AGENT: str = os.getenv("REDDIT_USER_AGENT", "multimodal-disruption-monitor/1.0")

    # Chicago coordinates (bounding box)
    CHICAGO_LAT: float = 41.8781
    CHICAGO_LNG: float = -87.6298
    CHICAGO_BBOX: dict = {
        "north": 42.023,
        "south": 41.644,
        "east": -87.524,
        "west": -87.940
    }

    # HuggingFace model
    NLP_MODEL: str = os.getenv("NLP_MODEL", "distilbert-base-uncased-finetuned-sst-2-english")

    # Collection intervals (seconds)
    TRAFFIC_INTERVAL: int = int(os.getenv("TRAFFIC_INTERVAL", "300"))  # 5 min
    SOCIAL_INTERVAL: int = int(os.getenv("SOCIAL_INTERVAL", "600"))    # 10 min
    NEWS_INTERVAL: int = int(os.getenv("NEWS_INTERVAL", "900"))        # 15 min

    # CORS — allow all localhost/127 origins during development
    CORS_ORIGINS: list = [
        "http://localhost:5173",
        "http://localhost:5174",
        "http://localhost:3000",
        "http://localhost:8080",
        "http://127.0.0.1:5173",
        "http://127.0.0.1:3000",
    ]

    # Disruption thresholds
    CONGESTION_THRESHOLD: float = float(os.getenv("CONGESTION_THRESHOLD", "0.6"))
    DISRUPTION_CONFIDENCE_MIN: float = float(os.getenv("DISRUPTION_CONFIDENCE_MIN", "0.5"))


settings = Settings()
