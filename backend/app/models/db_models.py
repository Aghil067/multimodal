"""
SQLAlchemy ORM models for the database tables.
"""
from sqlalchemy import Column, Integer, String, Float, Boolean, Text, DateTime, ForeignKey
from sqlalchemy.sql import func
from app.database import Base


class TrafficData(Base):
    __tablename__ = "traffic_data"

    id = Column(Integer, primary_key=True, index=True)
    segment_id = Column(String(100), index=True)
    street = Column(String(255))
    direction = Column(String(10))
    from_street = Column(String(255))
    to_street = Column(String(255))
    current_speed = Column(Float)
    free_flow_speed = Column(Float)
    congestion_level = Column(String(20))
    latitude = Column(Float, index=True)
    longitude = Column(Float, index=True)
    timestamp = Column(DateTime(timezone=True), server_default=func.now())


class SocialPost(Base):
    __tablename__ = "social_posts"

    id = Column(Integer, primary_key=True, index=True)
    source = Column(String(50))
    text = Column(Text)
    author = Column(String(255))
    sentiment = Column(String(20))
    disruption_type = Column(String(50))
    confidence = Column(Float)
    latitude = Column(Float, nullable=True)
    longitude = Column(Float, nullable=True)
    posted_at = Column(DateTime(timezone=True))
    collected_at = Column(DateTime(timezone=True), server_default=func.now())


class Infrastructure(Base):
    __tablename__ = "infrastructure"

    id = Column(Integer, primary_key=True, index=True)
    osm_id = Column(String(50), unique=True)
    name = Column(String(255))
    type = Column(String(50), index=True)  # grocery, fuel_station, hospital
    latitude = Column(Float, index=True)
    longitude = Column(Float, index=True)
    address = Column(String(500), nullable=True)
    last_updated = Column(DateTime(timezone=True), server_default=func.now())


class Disruption(Base):
    __tablename__ = "disruptions"

    id = Column(Integer, primary_key=True, index=True)
    location_name = Column(String(255))
    latitude = Column(Float)
    longitude = Column(Float)
    disruption_type = Column(String(50))  # fuel_shortage, grocery_shortage, road_blocked, panic_buying
    severity_score = Column(Float)
    confidence = Column(Float)
    traffic_score = Column(Float)
    social_score = Column(Float)
    infrastructure_type = Column(String(50))
    description = Column(Text)
    detected_at = Column(DateTime(timezone=True), server_default=func.now())
    resolved_at = Column(DateTime(timezone=True), nullable=True)


class Alert(Base):
    __tablename__ = "alerts"

    id = Column(Integer, primary_key=True, index=True)
    disruption_id = Column(Integer, ForeignKey("disruptions.id"))
    message = Column(Text)
    severity = Column(String(20))  # low, medium, high, critical
    acknowledged = Column(Boolean, default=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
