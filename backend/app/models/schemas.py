"""
Pydantic schemas for request/response validation.
"""
from pydantic import BaseModel
from typing import Optional, List
from datetime import datetime


# ── Traffic ──────────────────────────────────────────────

class TrafficDataBase(BaseModel):
    segment_id: str
    street: str
    direction: Optional[str] = None
    from_street: Optional[str] = None
    to_street: Optional[str] = None
    current_speed: float
    free_flow_speed: Optional[float] = None
    congestion_level: str
    latitude: float
    longitude: float


class TrafficDataResponse(TrafficDataBase):
    id: int
    timestamp: datetime

    class Config:
        from_attributes = True


class TrafficSegment(BaseModel):
    """Simplified traffic segment for map display."""
    segment_id: str
    street: str
    congestion_level: str
    current_speed: float
    latitude: float
    longitude: float
    congestion_ratio: Optional[float] = None


# ── Social Posts ─────────────────────────────────────────

class SocialPostBase(BaseModel):
    source: str
    text: str
    author: Optional[str] = None
    sentiment: Optional[str] = None
    disruption_type: Optional[str] = None
    confidence: Optional[float] = None
    latitude: Optional[float] = None
    longitude: Optional[float] = None
    posted_at: Optional[datetime] = None


class SocialPostResponse(SocialPostBase):
    id: int
    collected_at: datetime

    class Config:
        from_attributes = True


# ── Infrastructure ───────────────────────────────────────

class InfrastructureBase(BaseModel):
    osm_id: str
    name: str
    type: str
    latitude: float
    longitude: float
    address: Optional[str] = None


class InfrastructureResponse(InfrastructureBase):
    id: int
    last_updated: datetime

    class Config:
        from_attributes = True


# ── Disruptions ──────────────────────────────────────────

class DisruptionBase(BaseModel):
    location_name: str
    latitude: float
    longitude: float
    disruption_type: str
    severity_score: float
    confidence: float
    traffic_score: float
    social_score: float
    infrastructure_type: Optional[str] = None
    description: Optional[str] = None


class DisruptionResponse(DisruptionBase):
    id: int
    detected_at: datetime
    resolved_at: Optional[datetime] = None

    class Config:
        from_attributes = True


# ── Alerts ───────────────────────────────────────────────

class AlertBase(BaseModel):
    disruption_id: int
    message: str
    severity: str


class AlertResponse(AlertBase):
    id: int
    acknowledged: bool
    created_at: datetime

    class Config:
        from_attributes = True


class AlertAcknowledge(BaseModel):
    acknowledged: bool = True


# ── Dashboard Summary ────────────────────────────────────

class DashboardSummary(BaseModel):
    total_disruptions: int
    active_alerts: int
    critical_alerts: int
    avg_congestion_level: float
    top_disruption_types: List[dict]
    recent_alerts: List[AlertResponse]


# ── Data Collection Status ───────────────────────────────

class CollectionStatus(BaseModel):
    source: str
    last_collected: Optional[datetime] = None
    record_count: int
    status: str  # active, error, idle


# ── Analysis Results ─────────────────────────────────────

class NLPAnalysisResult(BaseModel):
    text: str
    sentiment: str
    disruption_type: Optional[str] = None
    confidence: float
    keywords: List[str]


class DisruptionScoreResult(BaseModel):
    location_name: str
    latitude: float
    longitude: float
    disruption_type: str
    severity_score: float
    confidence: float
    contributing_factors: List[str]
