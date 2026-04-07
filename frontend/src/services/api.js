import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '';

const api = axios.create({
  baseURL: API_BASE,
  timeout: 60000,
  headers: {
    'Content-Type': 'application/json',
  },
});

// ── Traffic ─────────────────────────────────────────
export const getChicagoTraffic = (limit = 500) =>
  api.get(`/api/traffic/chicago?limit=${limit}`);

export const getTrafficNear = (lat, lng, radius = 2.0) =>
  api.get(`/api/traffic/near?lat=${lat}&lng=${lng}&radius=${radius}`);

export const getHereFlow = () =>
  api.get('/api/traffic/here/flow');

export const getHereIncidents = () =>
  api.get('/api/traffic/here/incidents');

export const getTrafficAnalysis = (limit = 500) =>
  api.get(`/api/traffic/analysis?limit=${limit}`);

export const getTravelMidwestCongestion = () =>
  api.get('/api/traffic/travelmidwest/congestion');

export const getTravelMidwestIncidents = () =>
  api.get('/api/traffic/travelmidwest/incidents');

export const getTravelMidwestWeather = () =>
  api.get('/api/traffic/travelmidwest/weather');

export const getTravelMidwestRealtime = () =>
  api.get('/api/traffic/travelmidwest/realtime');

export const getTravelMidwestConstruction = () =>
  api.get('/api/traffic/travelmidwest/construction');


// ── Social Media ────────────────────────────────────
export const getRedditPosts = (limit = 50) =>
  api.get(`/api/social/reddit?limit=${limit}`);

export const searchSocial = (query) =>
  api.get(`/api/social/search?query=${encodeURIComponent(query)}`);

export const analyzeText = (text) =>
  api.post(`/api/social/analyze?text=${encodeURIComponent(text)}`);

// ── Infrastructure ──────────────────────────────────
export const getChicagoInfrastructure = (types = 'grocery,fuel_station,hospital') =>
  api.get(`/api/infrastructure/chicago?types=${types}`);

export const getNearbyInfrastructure = (lat, lng, radius = 2000) =>
  api.get(`/api/infrastructure/near?lat=${lat}&lng=${lng}&radius=${radius}`);

export const getInfrastructureClusters = () =>
  api.get('/api/infrastructure/clusters');

export const getInfrastructureStats = () =>
  api.get('/api/infrastructure/stats');

// ── Disruptions ─────────────────────────────────────
export const detectDisruptions = (trafficLimit = 300, socialLimit = 50) =>
  api.get(`/api/disruptions/detect?traffic_limit=${trafficLimit}&social_limit=${socialLimit}`);

export const getDisruptionSummary = () =>
  api.get('/api/disruptions/summary');

export const getDisruptionTimeline = () =>
  api.get('/api/disruptions/timeline');

export const getAISummary = () =>
  api.get('/api/disruptions/ai-summary');

export const getGeographicClusters = () =>
  api.get('/api/disruptions/geographic-clusters');

// ── Alerts ──────────────────────────────────────────
export const getWeatherAlerts = () =>
  api.get('/api/alerts/weather');

export const getDisasterNews = (limit = 20) =>
  api.get(`/api/alerts/news?limit=${limit}`);

export const getAllAlerts = () =>
  api.get('/api/alerts/all');

// ── Facility Status ─────────────────────────────────
export const getFacilityStatus = (types = 'grocery,fuel_station,hospital') =>
  api.get(`/api/facility-status/analyze?types=${types}`);

// ── Health ──────────────────────────────────────────
export const getHealthCheck = () =>
  api.get('/api/health');

export default api;
