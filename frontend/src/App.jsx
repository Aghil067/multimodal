import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import AlertsPanel from './components/Alerts/AlertsPanel';
import StatsCards from './components/Dashboard/StatsCards';
import GeographicRiskPanel from './components/Dashboard/GeographicRiskPanel';
import {
  CongestionDistributionChart,
  DisruptionTypesChart,
  SeverityDistributionChart,
  DataSourcesChart,
  ScoreRadarChart,
} from './components/Charts/AnalyticsCharts';
import { Activity, Map, BarChart2, AlertTriangle, Newspaper } from 'lucide-react';
import SectionHeader from './components/SectionHeader';
import {
  detectDisruptions,
  getChicagoTraffic,
  getChicagoInfrastructure,
  getRedditPosts,
  getAllAlerts,
  getTravelMidwestCongestion,
  getTravelMidwestIncidents,
  getTravelMidwestRealtime,
  getTravelMidwestConstruction,
  getFacilityStatus,
} from './services/api';
import './App.css';

const ChicagoMap = lazy(() => import('./components/Map/ChicagoMap'));
const DataFeed = lazy(() => import('./components/Dashboard/DataFeed'));
const TimelineChart = lazy(() => import('./components/Charts/TimelineChart'));
const SimulationView = lazy(() => import('./components/Simulation/SimulationView'));

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '30 min', value: 30 },
];

const MAP_FALLBACK = <div className="empty-state">Loading map intelligence...</div>;
const LOCAL_TRAFFIC_FALLBACK = [
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-87.652, 41.899],
        [-87.646, 41.894],
        [-87.640, 41.889],
        [-87.634, 41.884],
        [-87.629, 41.879],
        [-87.624, 41.874],
      ],
    },
    properties: {
      id: 'frontend-fallback-downtown-heavy',
      cng: 'H',
    },
  },
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-87.644, 41.905],
        [-87.637, 41.900],
        [-87.631, 41.895],
        [-87.625, 41.891],
        [-87.619, 41.886],
      ],
    },
    properties: {
      id: 'frontend-fallback-downtown-moderate',
      cng: 'M',
    },
  },
  {
    type: 'Feature',
    geometry: {
      type: 'LineString',
      coordinates: [
        [-87.666, 41.882],
        [-87.655, 41.882],
        [-87.644, 41.882],
        [-87.633, 41.882],
        [-87.622, 41.882],
      ],
    },
    properties: {
      id: 'frontend-fallback-west-to-loop',
      cng: 'N',
    },
  },
];

function mergeFeatureCollections(primary = [], supplemental = []) {
  const seen = new Set();
  const merged = [];

  [...primary, ...supplemental].forEach((feature, index) => {
    const props = feature?.properties || {};
    const geometry = feature?.geometry || {};
    const key = props.id || props.event_id || geometry.coordinates?.join?.(',') || `feature-${index}`;
    if (seen.has(key)) return;
    seen.add(key);
    merged.push(feature);
  });

  return merged;
}

function summarizeTravelMidwestTraffic(features = []) {
  const severeCount = features.reduce((count, feature) => {
    const color = feature?.properties?.color || '';
    const congestion = feature?.properties?.cng || '';
    return count + (color.includes('red') || color.includes('(255, 0, 0)') || congestion === 'H' ? 1 : 0);
  }, 0);

  return {
    overall_status: severeCount > features.length * 0.1 ? 'critical' : severeCount > features.length * 0.05 ? 'warning' : 'nominal',
    avg_congestion: features.length > 0 ? severeCount / features.length : 0,
    severe_count: severeCount,
  };
}

async function collectMapData() {
  const [
    infrastructureRes,
    congestionRes,
    incidentsRes,
    realtimeRes,
    constructionRes,
    facilityStatusRes,
  ] = await Promise.allSettled([
    getChicagoInfrastructure(),
    getTravelMidwestCongestion(),
    getTravelMidwestIncidents(),
    getTravelMidwestRealtime(),
    getTravelMidwestConstruction(),
    getFacilityStatus(),
  ]);

  const infrastructure = infrastructureRes.status === 'fulfilled' ? infrastructureRes.value.data?.locations || [] : [];
  const congestion = congestionRes.status === 'fulfilled' ? congestionRes.value.data?.features || [] : [];
  const realtime = realtimeRes.status === 'fulfilled' ? realtimeRes.value.data?.features || [] : [];
  const incidents = incidentsRes.status === 'fulfilled' ? incidentsRes.value.data?.features || [] : [];
  const construction = constructionRes.status === 'fulfilled' ? constructionRes.value.data?.features || [] : [];
  const facilityStatus = facilityStatusRes.status === 'fulfilled' ? facilityStatusRes.value.data?.facilities || [] : [];
  const mergedCongestion = mergeFeatureCollections(congestion, realtime);
  const infrastructureFromStatus = facilityStatus.map((facility) => ({
    osm_id: facility.osm_id,
    name: facility.name,
    type: facility.type,
    latitude: facility.latitude,
    longitude: facility.longitude,
    address: facility.address,
    brand: facility.brand,
    opening_hours: facility.opening_hours?.schedule || null,
  })).filter((facility) => facility.latitude && facility.longitude);
  const effectiveInfrastructure = infrastructure.length > 0 ? infrastructure : infrastructureFromStatus;
  const effectiveCongestion = mergedCongestion.length > 0 ? mergedCongestion : LOCAL_TRAFFIC_FALLBACK;

  return {
    infrastructure: effectiveInfrastructure,
    tmCongestion: effectiveCongestion,
    tmIncidents: incidents,
    tmConstruction: construction,
    facilityStatus,
    trafficAnalysis: summarizeTravelMidwestTraffic(effectiveCongestion),
  };
}

function renderLazy(children, fallback = <div className="empty-state">Loading...</div>) {
  return <Suspense fallback={fallback}>{children}</Suspense>;
}

function LiveClock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(t);
  }, []);
  return (
    <span className="live-clock">
      {time.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
    </span>
  );
}

function CountdownBadge({ seconds }) {
  const mins = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return (
    <span className="countdown-badge">
      Next: {mins}:{secs.toString().padStart(2, '0')}
    </span>
  );
}

function App() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastUpdated, setLastUpdated] = useState(null);

  const [trafficData, setTrafficData] = useState([]);
  const [infrastructure, setInfrastructure] = useState([]);
  const [disruptions, setDisruptions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [socialPosts, setSocialPosts] = useState([]);
  const [weatherAlerts, setWeatherAlerts] = useState([]);
  const [newsArticles, setNewsArticles] = useState([]);
  const [tmCongestion, setTmCongestion] = useState([]);
  const [tmIncidents, setTmIncidents] = useState([]);
  const [tmConstruction, setTmConstruction] = useState([]);
  const [summary, setSummary] = useState({});
  const [dataSources, setDataSources] = useState({});
  const [trafficAnalysis, setTrafficAnalysis] = useState({});
  const [selectedDisruption, setSelectedDisruption] = useState(null);
  const [simConfig] = useState({ scenario: null, vehicles: [], running: false, onPhaseChange: null });
  const [facilityStatus, setFacilityStatus] = useState([]);

  const [showTraffic, setShowTraffic] = useState(true);
  const [showInfrastructure, setShowInfrastructure] = useState(true);
  const [showDisruptions, setShowDisruptions] = useState(true);
  const [selectedLocation, setSelectedLocation] = useState(null);

  const [activeTab, setActiveTab] = useState('dashboard');

  // Auto-refresh
  const [autoRefresh, setAutoRefresh] = useState(0);
  const [countdown, setCountdown] = useState(0);
  const refreshTimerRef = useRef(null);
  const countdownRef = useRef(null);
  const requestIdRef = useRef(0);

  // Backend status
  const [backendOnline, setBackendOnline] = useState(null);

  // Check backend health on mount
  useEffect(() => {
    fetch('/api/health').then(r => setBackendOnline(r.ok)).catch(() => setBackendOnline(false));
  }, []);

  const runDetection = useCallback(async () => {
    const requestId = requestIdRef.current + 1;
    requestIdRef.current = requestId;
    setLoading(true);
    setError(null);
    try {
      const [detectionRes, trafficRes, socialRes, alertsRes, mapData] = await Promise.all([
        detectDisruptions(300, 50),
        getChicagoTraffic(300),
        getRedditPosts(50),
        getAllAlerts(),
        collectMapData(),
      ]);

      if (requestId !== requestIdRef.current) return;

      const detectionData = detectionRes.data || {};
      const alertsData = alertsRes.data?.alerts || [];

      setDisruptions(detectionData.disruptions || []);
      setAlerts(detectionData.alerts || []);
      setSummary(detectionData.summary || {});
      setTrafficData(trafficRes.data?.segments || []);
      setSocialPosts(socialRes.data?.posts || []);
      setWeatherAlerts(alertsData.filter(a => a.type === 'weather'));
      setNewsArticles(alertsData.filter(a => a.type === 'news'));
      setInfrastructure(mapData.infrastructure);
      setTmCongestion(mapData.tmCongestion);
      setTmIncidents(mapData.tmIncidents);
      setTmConstruction(mapData.tmConstruction);
      setFacilityStatus(mapData.facilityStatus);
      setTrafficAnalysis({
        ...(detectionData.traffic_analysis || {}),
        ...mapData.trafficAnalysis,
      });
      setDataSources({
        ...(detectionData.data_sources || {}),
        traffic: `TravelMidwest (${mapData.tmCongestion.length} segs)`,
        traffic_segments: mapData.tmCongestion.length || detectionData.data_sources?.traffic_segments || 0,
        infrastructure_locations: mapData.infrastructure.length || detectionData.data_sources?.infrastructure_locations || 0,
      });

      setLastUpdated(new Date());
      setBackendOnline(true);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to run detection. Ensure the backend is running.');
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  // Auto-run disruption detection on mount
  useEffect(() => {
    const timer = setTimeout(() => {
      runDetection();
    }, 350);
    return () => clearTimeout(timer);
  }, [runDetection]);

  // Auto-refresh logic
  useEffect(() => {
    clearInterval(refreshTimerRef.current);
    clearInterval(countdownRef.current);
    if (autoRefresh > 0) {
      setCountdown(autoRefresh * 60);
      refreshTimerRef.current = setInterval(() => {
        runDetection();
        setCountdown(autoRefresh * 60);
      }, autoRefresh * 60 * 1000);
      countdownRef.current = setInterval(() => {
        setCountdown(prev => (prev <= 1 ? autoRefresh * 60 : prev - 1));
      }, 1000);
    } else {
      setCountdown(0);
    }
    return () => {
      clearInterval(refreshTimerRef.current);
      clearInterval(countdownRef.current);
    };
  }, [autoRefresh, runDetection]);

  const handleAlertClick = item => {
    if (item.latitude && item.longitude) {
      setSelectedLocation(item);
      setSelectedDisruption(item);
    }
  };

  const handleZoneSelect = zone => {
    setSelectedLocation({ latitude: zone.center.lat, longitude: zone.center.lng });
    setActiveTab('map');
  };

  const tabs = [
    {
      id: 'dashboard', label: 'Dashboard',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/></svg>
    },
    {
      id: 'map', label: 'Live Map',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/><line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/></svg>
    },
    {
      id: 'simulation', label: 'Simulation',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>
    },
    {
      id: 'analytics', label: 'Analytics',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
    },
    {
      id: 'feed', label: 'Data Feed',
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
    },
  ];

  const mapProps = useMemo(() => ({
    trafficData, infrastructure, disruptions, selectedLocation,
    showTraffic, showInfrastructure, showDisruptions, onLocationClick: handleAlertClick,
    travelMidwestCongestion: tmCongestion, travelMidwestIncidents: tmIncidents,
    travelMidwestConstruction: tmConstruction,
    simConfig, facilityStatus,
  }), [
    trafficData, infrastructure, disruptions, selectedLocation,
    showTraffic, showInfrastructure, showDisruptions, tmCongestion,
    tmIncidents, tmConstruction, simConfig, facilityStatus,
  ]);

  return (
    <div className="app">
      {/* ── Header ── */}
      <header className="app-header">
        <div className="header-left">
          <div className="logo">
            <div className="logo-icon">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
                <path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/>
              </svg>
            </div>
            <div className="logo-text">
              <h1>ChiGuard</h1>
              <span className="logo-subtitle">Supply Chain Monitor • Chicago</span>
            </div>
          </div>

          {/* Backend status */}
          <div className={`backend-status ${backendOnline === null ? 'checking' : backendOnline ? 'online' : 'offline'}`}>
            <span className="backend-dot" />
            <span className="backend-label">
              {backendOnline === null ? 'Checking...' : backendOnline ? 'Live' : 'Offline'}
            </span>
          </div>
        </div>

        <nav className="header-nav">
          {tabs.map(tab => (
            <button
              key={tab.id}
              className={`nav-tab ${activeTab === tab.id ? 'active' : ''}`}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.icon} {tab.label}
            </button>
          ))}
        </nav>

        <div className="header-right">
          {/* Auto-refresh selector */}
          <div className="auto-refresh-wrap">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.5 }}>
              <polyline points="23 4 23 10 17 10"/><polyline points="1 20 1 14 7 14"/>
              <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"/>
            </svg>
            <select
              className="auto-refresh-select"
              value={autoRefresh}
              onChange={e => setAutoRefresh(Number(e.target.value))}
            >
              {AUTO_REFRESH_OPTIONS.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
            {countdown > 0 && <CountdownBadge seconds={countdown} />}
          </div>

          <LiveClock />

          <button className="btn-detect" onClick={runDetection} disabled={loading}>
            {loading
              ? <><span className="spinner" /> Analyzing...</>
              : <><svg width="11" height="11" viewBox="0 0 24 24" fill="white"><polygon points="5 3 19 12 5 21 5 3"/></svg> Run Detection</>
            }
          </button>
          {lastUpdated && (
            <span className="last-updated">
              {lastUpdated.toLocaleTimeString()}
            </span>
          )}
        </div>
      </header>

      {/* ── Error ── */}
      {error && (
        <div className="error-banner">
          <span>⚠ {error}</span>
          <button onClick={() => setError(null)}>✕</button>
        </div>
      )}

      {/* ── Content ── */}
      <main className="app-main">
        {/* ── DASHBOARD ── */}
        {activeTab === 'dashboard' && (
          <div className="dashboard-layout">
            {/* Stats Cards Section */}
            <SectionHeader 
              icon={<Activity size={18} className="text-indigo-400" />}
              title="Live Disruption Metrics"
              subtitle="Real-time supply chain status"
              description="Monitor critical supply chain disruptions across Chicago. These metrics aggregate data from traffic patterns, social media reports, infrastructure monitoring, and news sources to provide a comprehensive view of supply chain health."
            />
            <StatsCards summary={summary} dataSources={dataSources} trafficAnalysis={trafficAnalysis} loading={loading} />

            {/* Timeline row */}
            <div className="ai-row" style={{ gridTemplateColumns: '1fr' }}>
              {renderLazy(<TimelineChart />)}
            </div>

            {/* Map Section */}
            <SectionHeader 
              icon={<Map size={18} className="text-blue-400" />}
              title="Live Geographic Intelligence"
              subtitle="Real-time situational awareness"
              description="Interactive map showing real-time traffic congestion, infrastructure locations (fuel stations, grocery stores, hospitals), and detected disruption hotspots. The overlay includes Travel Midwest congestion data, incident reports, and weather conditions affecting supply chains."
            />
            <div className="dashboard-grid">
              <div className="dashboard-map-section">
                <div className="section-controls">
                  <div className="map-controls">
                    <label className="toggle-label">
                      <input type="checkbox" checked={showTraffic} onChange={e => setShowTraffic(e.target.checked)} />
                      Traffic
                    </label>
                    <label className="toggle-label">
                      <input type="checkbox" checked={showInfrastructure} onChange={e => setShowInfrastructure(e.target.checked)} />
                      Infrastructure
                    </label>
                    <label className="toggle-label">
                      <input type="checkbox" checked={showDisruptions} onChange={e => setShowDisruptions(e.target.checked)} />
                      Disruptions
                    </label>
                  </div>
                </div>
                {renderLazy(<ChicagoMap {...mapProps} />, MAP_FALLBACK)}
              </div>

              <div className="dashboard-right-col">
                <AlertsPanel alerts={alerts} disruptions={disruptions} onAlertClick={handleAlertClick} />
                <GeographicRiskPanel onZoneSelect={handleZoneSelect} />
                
                {/* Facility Status Summary */}
                {facilityStatus.length > 0 && (
                  <div className="facility-status-card">
                    <div className="facility-status-header">
                      <h3>
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                          <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
                          <polyline points="9 22 9 12 15 12 15 22"/>
                        </svg>
                        Facility Status Analysis
                      </h3>
                      <span className="facility-count">{facilityStatus.length} facilities</span>
                    </div>
                    <div className="facility-status-grid">
                      {[
                        { status: 'OPEN', label: 'Open', color: '#22c55e', icon: '✓' },
                        { status: 'CLOSED', label: 'Closed', color: '#ef4444', icon: '✕' },
                        { status: 'IMPACTED', label: 'Impacted', color: '#f97316', icon: '⚠' },
                        { status: 'AT_RISK', label: 'At Risk', color: '#eab308', icon: '!' },
                      ].map(({ status, label, color, icon }) => {
                        const count = facilityStatus.filter(f => f.status === status).length;
                        return (
                          <div key={status} className="facility-stat-item" style={{ borderColor: color }}>
                            <div className="facility-stat-icon" style={{ background: color }}>{icon}</div>
                            <div className="facility-stat-count">{count}</div>
                            <div className="facility-stat-label">{label}</div>
                          </div>
                        );
                      })}
                    </div>
                    {/* Top impacted facilities */}
                    {facilityStatus.filter(f => f.status === 'CLOSED' || f.status === 'IMPACTED').length > 0 && (
                      <div className="facility-alerts-list">
                        {facilityStatus
                          .filter(f => f.status === 'CLOSED' || f.status === 'IMPACTED')
                          .slice(0, 5)
                          .map((f, i) => (
                            <div key={i} className="facility-alert-item" onClick={() => {
                              setSelectedLocation({ latitude: f.latitude, longitude: f.longitude });
                              setActiveTab('map');
                            }}>
                              <span className="facility-alert-dot" style={{ 
                                background: f.status === 'CLOSED' ? '#ef4444' : '#f97316'
                              }} />
                              <div className="facility-alert-info">
                                <span className="facility-alert-name">{f.name}</span>
                                <span className="facility-alert-reason">{f.status_reason}</span>
                              </div>
                              <span className="facility-alert-type">{f.type_label}</span>
                            </div>
                          ))
                        }
                      </div>
                    )}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* ── MAP ── */}
        {activeTab === 'map' && (
          <div className="fullscreen-map">
            <div className="map-toolbar">
              <div className="map-controls">
                <label className="toggle-label"><input type="checkbox" checked={showTraffic} onChange={e => setShowTraffic(e.target.checked)} /> Traffic</label>
                <label className="toggle-label"><input type="checkbox" checked={showInfrastructure} onChange={e => setShowInfrastructure(e.target.checked)} /> Infrastructure</label>
                <label className="toggle-label"><input type="checkbox" checked={showDisruptions} onChange={e => setShowDisruptions(e.target.checked)} /> Disruptions</label>
              </div>
              <span className="map-info">
                {trafficData.length} segments · {infrastructure.length} locations · {disruptions.length} disruptions
              </span>
            </div>
            {renderLazy(<ChicagoMap {...mapProps} />, MAP_FALLBACK)}
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {activeTab === 'analytics' && (
          <div className="analytics-layout">
            <SectionHeader 
              icon={<BarChart2 size={18} className="text-green-400" />}
              title="Advanced Analytics & Insights"
              subtitle="Data-driven disruption analysis"
              description="Comprehensive visualization of disruption patterns, severity distribution, traffic congestion analysis, and multimodal data source contributions. Use these charts to understand disruption trends and identify critical supply chain vulnerabilities."
            />
            <div className="analytics-grid">
              <CongestionDistributionChart data={trafficAnalysis.congestion_distribution} />
              <DisruptionTypesChart disruptions={disruptions} />
              <SeverityDistributionChart disruptions={disruptions} />
              <DataSourcesChart sources={dataSources} />
              {selectedDisruption && <ScoreRadarChart disruption={selectedDisruption} />}
            </div>

            {disruptions.length > 0 && (
              <div>
              <SectionHeader 
                icon={<AlertTriangle size={18} className="text-orange-400" />}
                title="Detected Supply Chain Disruptions"
                subtitle="Prioritized by severity and impact"
                description="All identified disruptions with multimodal score breakdown. Each disruption is characterized by traffic impact, social media sentiment, infrastructure proximity, and news relevance. Click to view on map or inspect detailed factors."
              />
              <div className="disruptions-table-section">
                <div className="table-wrapper">
                  <table className="disruptions-table">
                    <thead>
                      <tr>
                        <th>Location</th><th>Type</th><th>Severity</th>
                        <th>Confidence</th><th>Traffic</th><th>Social</th><th></th>
                      </tr>
                    </thead>
                    <tbody>
                      {disruptions.map((d, i) => (
                        <tr key={i} className={`table-row severity-row-${d.severity_label}`}
                          onClick={() => { setSelectedDisruption(d); setSelectedLocation(d); }}>
                          <td style={{ fontWeight: 600, color: 'var(--text-100)' }}>{d.location_name}</td>
                          <td><span className="type-badge">{d.disruption_type?.replace(/_/g, ' ')}</span></td>
                          <td><span className={`severity-badge severity-${d.severity_label}`}>{d.severity_label}</span></td>
                          <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}>{(d.confidence * 100).toFixed(0)}%</td>
                          <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}>{(d.traffic_score * 100).toFixed(0)}%</td>
                          <td style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: '0.75rem' }}>{(d.social_score * 100).toFixed(0)}%</td>
                          <td>
                            <button className="btn-small" onClick={e => {
                              e.stopPropagation();
                              setSelectedDisruption(d); setActiveTab('map'); setSelectedLocation(d);
                            }}>View ›</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
              </div>
            )}

            {disruptions.length === 0 && !loading && (
              <div className="empty-state">
                <span className="empty-icon">◈</span>
                <h3>No Analytics Available</h3>
                <p>Click "Run Detection" to analyze Chicago's supply chain status</p>
              </div>
            )}
          </div>
        )}

        {/* ── SIMULATION ── */}
        {activeTab === 'simulation' && renderLazy(<SimulationView />)}

        {/* ── FEED ── */}
        {activeTab === 'feed' && (
          <div className="feed-layout">
            <SectionHeader 
              icon={<Newspaper size={18} className="text-violet-400" />}
              title="Live Multi-Source Data Feed"
              subtitle="Aggregated disruption intelligence"
              description="Real-time aggregation of all disruption signals: social media posts from Chicago communities, weather alerts from the National Weather Service, and news articles. Each source contributes to the multimodal analysis of supply chain disruptions."
            />
            {renderLazy(
              <DataFeed socialPosts={socialPosts} newsArticles={newsArticles} weatherAlerts={weatherAlerts} />
            )}
          </div>
        )}
      </main>

      <footer className="app-footer">
        <span>ChiGuard · Multimodal AI Supply Chain Monitor</span>
        <span>Chicago, IL</span>
        <span>City of Chicago · TravelMidwest · NWS · Reddit</span>
      </footer>
    </div>
  );
}

export default App;
