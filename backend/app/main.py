"""
Multimodal AI for Situational Awareness of Supply Chain Disruptions
during Disaster Response Operations – Case Study: Chicago

FastAPI Application Entry Point
"""
import logging
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from contextlib import asynccontextmanager

from app.config import settings

# Configure logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s"
)
logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Application lifespan: startup and shutdown."""
    logger.info("🚀 Starting Multimodal Disruption Monitor...")
    logger.info("📍 Monitoring area: Chicago, IL")

    # Try to initialize database (optional - works without DB too)
    try:
        from app.database import init_db
        init_db()
        logger.info("✅ Database initialized")
    except Exception as e:
        logger.warning(f"⚠️ Database not available: {e}. Running in API-only mode.")

    yield

    logger.info("🛑 Shutting down Multimodal Disruption Monitor")


# Create FastAPI app
app = FastAPI(
    title="Multimodal Supply Chain Disruption Monitor",
    description=(
        "AI-powered system for monitoring supply chain disruptions in Chicago "
        "during disaster response operations. Fuses traffic, social media, "
        "infrastructure, and news data for situational awareness."
    ),
    version="1.0.0",
    lifespan=lifespan,
    docs_url="/docs",
    redoc_url="/redoc"
)

# CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.CORS_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Register routers
from app.routes.traffic import router as traffic_router
from app.routes.social import router as social_router
from app.routes.infrastructure import router as infra_router
from app.routes.disruptions import router as disruptions_router
from app.routes.alerts import router as alerts_router
from app.routes.facility_status import router as facility_status_router

app.include_router(traffic_router)
app.include_router(social_router)
app.include_router(infra_router)
app.include_router(disruptions_router)
app.include_router(alerts_router)
app.include_router(facility_status_router)


@app.get("/", tags=["Health"])
async def root():
    """Health check and API info."""
    return {
        "service": "Multimodal Supply Chain Disruption Monitor",
        "version": "1.0.0",
        "status": "operational",
        "monitoring_area": "Chicago, IL",
        "endpoints": {
            "traffic": "/api/traffic/chicago",
            "social": "/api/social/reddit",
            "infrastructure": "/api/infrastructure/chicago",
            "disruptions": "/api/disruptions/detect",
            "alerts": "/api/alerts/all",
            "docs": "/docs"
        }
    }


@app.get("/api/health", tags=["Health"])
async def health_check():
    """Detailed health check."""
    health = {
        "status": "healthy",
        "apis": {
            "chicago_traffic": "configured",
            "here_traffic": "configured" if settings.HERE_API_KEY else "not_configured",
            "news_api": "configured" if settings.NEWS_API_KEY else "not_configured",
            "reddit": "configured" if settings.REDDIT_CLIENT_ID else "fallback_mode",
            "osm_overpass": "configured",
            "nws_weather": "configured",
        }
    }
    return health
