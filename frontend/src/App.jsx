import { useState, useCallback, useEffect, useRef } from 'react';
import ChicagoMap from './components/Map/ChicagoMap';
import AlertsPanel from './components/Alerts/AlertsPanel';
import StatsCards from './components/Dashboard/StatsCards';
import DataFeed from './components/Dashboard/DataFeed';
import AISummaryPanel from './components/Dashboard/AISummaryPanel';
import GeographicRiskPanel from './components/Dashboard/GeographicRiskPanel';
import TimelineChart from './components/Charts/TimelineChart';
import EmergencySimPanel, { SimulationOverlay } from './components/Simulation/EmergencySimulation';
import SimulationView from './components/Simulation/SimulationView';
import {
  CongestionDistributionChart,
  DisruptionTypesChart,
  SeverityDistributionChart,
  DataSourcesChart,
  ScoreRadarChart,
} from './components/Charts/AnalyticsCharts';
import {
  detectDisruptions,
  getChicagoTraffic,
  getChicagoInfrastructure,
  getRedditPosts,
  getAllAlerts,
  getDisruptionSummary,
  getTravelMidwestCongestion,
  getTravelMidwestIncidents,
  getTravelMidwestRealtime,
  getTravelMidwestWeather,
  getTravelMidwestConstruction,
  getFacilityStatus,
} from './services/api';
import './App.css';

const AUTO_REFRESH_OPTIONS = [
  { label: 'Off', value: 0 },
  { label: '5 min', value: 5 },
  { label: '10 min', value: 10 },
  { label: '30 min', value: 30 },
];

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
  const [tmWeather, setTmWeather] = useState([]);
  const [tmConstruction, setTmConstruction] = useState([]);
  const [summary, setSummary] = useState({});
  const [dataSources, setDataSources] = useState({});
  const [trafficAnalysis, setTrafficAnalysis] = useState({});
  const [selectedDisruption, setSelectedDisruption] = useState(null);
  const [simConfig, setSimConfig] = useState({ scenario: null, vehicles: [], running: false, onPhaseChange: null });
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

  // Backend status
  const [backendOnline, setBackendOnline] = useState(null);

  // Check backend health on mount
  useEffect(() => {
    fetch('/api/health').then(r => setBackendOnline(r.ok)).catch(() => setBackendOnline(false));
  }, []);

  // Auto-load infrastructure + TM traffic on mount so the map is live immediately
  useEffect(() => {
    const loadMapData = async () => {
      // Infrastructure
      try {
        const r = await getChicagoInfrastructure();
        setInfrastructure(r.data.locations || []);
      } catch (e) { console.warn('Infrastructure auto-load failed:', e.message); }

      // TravelMidwest congestion lines — the main visible traffic overlay
      try {
        const r = await getTravelMidwestCongestion();
        if (r.data?.features) {
          const features = r.data.features;
          setTmCongestion(features);
          let severe = 0;
          features.forEach(f => {
            const cng = f.properties?.cng || '';
            if (cng === 'H') severe++;
          });
          setTrafficAnalysis({
            overall_status: severe > features.length * 0.1 ? 'critical' : severe > features.length * 0.05 ? 'warning' : 'nominal',
            avg_congestion: features.length > 0 ? severe / features.length : 0,
            severe_count: severe,
          });
          setDataSources(prev => ({ ...prev, traffic_segments: features.length }));
        }
      } catch (e) { console.warn('TM Congestion auto-load failed:', e.message); }

      // TravelMidwest incidents
      try {
        const r = await getTravelMidwestIncidents();
        if (r.data?.features) setTmIncidents(r.data.features);
      } catch (e) { console.warn('TM Incidents auto-load failed:', e.message); }

      // TravelMidwest realtime (merged into congestion)
      try {
        const r = await getTravelMidwestRealtime();
        if (r.data?.features) {
          setTmCongestion(prev => {
            const ids = new Set(prev.map(f => f.properties?.id));
            return [...prev, ...r.data.features.filter(f => !ids.has(f.properties?.id))];
          });
        }
      } catch (e) { console.warn('TM Realtime auto-load failed:', e.message); }

      // TravelMidwest weather
      try {
        const r = await getTravelMidwestWeather();
        if (r.data?.features) setTmWeather(r.data.features);
      } catch (e) { console.warn('TM Weather auto-load failed:', e.message); }

      // TravelMidwest construction
      try {
        const r = await getTravelMidwestConstruction();
        if (r.data?.features) setTmConstruction(r.data.features);
      } catch (e) { console.warn('TM Construction auto-load failed:', e.message); }
    };

    loadMapData();
  }, []);

  const runDetection = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const detectionRes = await detectDisruptions(300, 50);
      const data = detectionRes.data;
      setDisruptions(data.disruptions || []);
      setAlerts(data.alerts || []);
      setSummary(data.summary || {});
      setDataSources(data.data_sources || {});
      setTrafficAnalysis(data.traffic_analysis || {});

      try { const r = await getChicagoTraffic(500); setTrafficData(r.data.segments || []); }
      catch (e) { console.warn('Traffic fetch failed:', e.message); }

      try { const r = await getChicagoInfrastructure(); setInfrastructure(r.data.locations || []); }
      catch (e) { console.warn('Infrastructure fetch failed:', e.message); }

      try { const r = await getRedditPosts(50); setSocialPosts(r.data.posts || []); }
      catch (e) { console.warn('Social media fetch failed:', e.message); }

      try {
        const r = await getAllAlerts();
        setWeatherAlerts((r.data.alerts || []).filter(a => a.type === 'weather'));
        setNewsArticles((r.data.alerts || []).filter(a => a.type === 'news'));
      } catch (e) { console.warn('Alerts fetch failed:', e.message); }

      try {
        const r = await getTravelMidwestCongestion();
        if (r.data?.features) {
          const features = r.data.features;
          setTmCongestion(features);
          let severe = 0;
          features.forEach(f => {
            const color = f.properties.color || '';
            const cng = f.properties.cng || '';
            if (color.includes('red') || color.includes('(255, 0, 0)') || cng === 'H') severe++;
          });
          setTrafficAnalysis(prev => ({
            ...prev,
            overall_status: severe > features.length * 0.1 ? 'critical' : (severe > features.length * 0.05 ? 'warning' : 'nominal'),
            avg_congestion: features.length > 0 ? severe / features.length : 0,
            severe_count: severe,
          }));
          setDataSources(prev => ({ ...prev, traffic: `TravelMidwest (${features.length} segs)` }));
        }
      } catch (e) { console.warn('TM Congestion failed:', e.message); }

      try { const r = await getTravelMidwestIncidents(); if (r.data?.features) setTmIncidents(r.data.features); }
      catch (e) { console.warn('TM Incidents failed:', e.message); }

      try {
        const r = await getTravelMidwestRealtime();
        if (r.data?.features) {
          setTmCongestion(prev => {
            const ids = new Set(prev.map(f => f.properties?.id));
            return [...prev, ...r.data.features.filter(f => !ids.has(f.properties?.id))];
          });
        }
      } catch (e) { console.warn('TM Realtime failed:', e.message); }

      try { const r = await getTravelMidwestWeather(); if (r.data?.features) setTmWeather(r.data.features); }
      catch (e) { console.warn('TM Weather failed:', e.message); }

      try { const r = await getTravelMidwestConstruction(); if (r.data?.features) setTmConstruction(r.data.features); }
      catch (e) { console.warn('TM Construction failed:', e.message); }

      // ── Facility Status Analysis ──
      try {
        const r = await getFacilityStatus();
        if (r.data?.facilities) {
          setFacilityStatus(r.data.facilities);
          console.log(`Facility status: ${r.data.facilities.length} facilities analyzed`);
        }
      } catch (e) { console.warn('Facility status failed:', e.message); }

      setLastUpdated(new Date());
      setBackendOnline(true);
    } catch (err) {
      setError(err.response?.data?.detail || err.message || 'Failed to run detection. Ensure the backend is running.');
      setBackendOnline(false);
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchSummary = useCallback(async () => {
    try {
      const res = await getDisruptionSummary();
      setTrafficAnalysis({
        overall_status: res.data.traffic_status,
        avg_congestion: res.data.avg_congestion,
        severe_count: res.data.severe_segments,
      });
      setWeatherAlerts(res.data.weather_alerts || []);
    } catch (e) { console.warn('Summary fetch failed:', e.message); }
  }, []);

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
      icon: <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2"/></svg>,
      badge: '🚑'
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

  const mapProps = {
    trafficData, infrastructure, disruptions, selectedLocation,
    showTraffic, showInfrastructure, showDisruptions, onLocationClick: handleAlertClick,
    travelMidwestCongestion: tmCongestion, travelMidwestIncidents: tmIncidents,
    travelMidwestWeather: tmWeather, travelMidwestConstruction: tmConstruction,
    simConfig, facilityStatus,
  };

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
          <button className="btn-summary" onClick={fetchSummary}>
            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/></svg>
            Quick Status
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
            <StatsCards summary={summary} dataSources={dataSources} trafficAnalysis={trafficAnalysis} loading={loading} />

            {/* AI Summary + Timeline row */}
            <div className="ai-row">
              <AISummaryPanel autoFetch={false} />
              <TimelineChart />
            </div>

            <div className="dashboard-grid">
              <div className="dashboard-map-section">
                <div className="section-header">
                  <h3>
                    <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6"/>
                      <line x1="8" y1="2" x2="8" y2="18"/><line x1="16" y1="6" x2="16" y2="22"/>
                    </svg>
                    Chicago Disruption Map
                  </h3>
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
                <ChicagoMap {...mapProps} />
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
            <ChicagoMap {...mapProps} />
          </div>
        )}

        {/* ── ANALYTICS ── */}
        {activeTab === 'analytics' && (
          <div className="analytics-layout">
            <div className="analytics-grid">
              <CongestionDistributionChart data={trafficAnalysis.congestion_distribution} />
              <DisruptionTypesChart disruptions={disruptions} />
              <SeverityDistributionChart disruptions={disruptions} />
              <DataSourcesChart sources={dataSources} />
              {selectedDisruption && <ScoreRadarChart disruption={selectedDisruption} />}
            </div>

            {disruptions.length > 0 && (
              <div className="disruptions-table-section">
                <h3>Detected Disruptions</h3>
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
        {activeTab === 'simulation' && (
          <div className="simulation-layout">
            <div className="sim-intro">
              <div className="sim-intro-icon">⚡</div>
              <div>
                <h2 className="sim-intro-title">Emergency Vehicle Routing Simulation</h2>
                <p className="sim-intro-desc">
                  Simulate how emergency vehicles (ambulances, fire trucks, police, supply convoys)
                  navigate around blocked roads during natural disasters in Chicago.
                  Select a disaster scenario and vehicle types, then watch the real-time rerouting simulation.
                </p>
              </div>
            </div>

            <div className="sim-main-grid">
              <div className="sim-map-area">
                <ChicagoMap {...mapProps} isSimulationTab={true} />
              </div>
              <div className="sim-sidebar">
                <EmergencySimPanel onSimChange={(cfg) => setSimConfig({ ...cfg })} />

                <div className="sim-info-card">
                  <div className="sim-info-title">🗺 How it works</div>
                  <div className="sim-info-steps">
                    <div className="sim-info-step"><span className="sim-step-num">1</span>Select a disaster scenario (flood, tornado, fire, collapse)</div>
                    <div className="sim-info-step"><span className="sim-step-num">2</span>Choose which vehicle types to dispatch</div>
                    <div className="sim-info-step"><span className="sim-step-num">3</span>Click "Run Simulation" — watch vehicles reroute around blocked roads</div>
                    <div className="sim-info-step"><span className="sim-step-num">4</span>Red lines = blocked roads · Green lines = alternate route</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ── FEED ── */}
        {activeTab === 'feed' && (
          <div className="feed-layout">
            <DataFeed socialPosts={socialPosts} newsArticles={newsArticles} weatherAlerts={weatherAlerts} />
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
