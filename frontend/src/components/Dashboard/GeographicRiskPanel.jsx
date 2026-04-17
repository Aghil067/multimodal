import { useState, useEffect } from 'react';
import { getGeographicClusters } from '../../services/api';
import { Fuel, ShoppingCart, Activity, Pill, MapPin, Car, AlertTriangle, BarChart2 } from 'lucide-react';

const RISK_CONFIG = {
  critical: { color: '#f43f5e', bg: 'rgba(244,63,94,0.13)', bar: '#f43f5e' },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.13)', bar: '#fb923c' },
  medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.13)', bar: '#fbbf24' },
  low:      { color: '#34d399', bg: 'rgba(52,211,153,0.13)', bar: '#34d399' },
};

const TYPE_ICONS = {
  fuel_station: <Fuel size={12} />,
  grocery: <ShoppingCart size={12} />,
  hospital: <Activity size={12} />,
  pharmacy: <Pill size={12} />,
};

export default function GeographicRiskPanel({ onZoneSelect }) {
  const [zones, setZones] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const fetch = async () => {
    setLoading(true);
    try {
      const res = await getGeographicClusters();
      setZones(res.data.zones || []);
    } catch (e) {
      console.warn('Geographic clusters fetch failed:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetch(); }, []);

  const handleSelect = (zone) => {
    setSelected(zone.zone);
    onZoneSelect?.(zone);
  };

  return (
    <div className="geo-risk-panel">
      <div className="geo-risk-header">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <span className="geo-risk-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polygon points="3 11 22 2 13 21 11 13 3 11"/>
            </svg>
          </span>
          <span className="geo-risk-title">Area Risk Scores</span>
        </div>
        <button className="geo-refresh-btn" onClick={fetch} disabled={loading}>
          {loading ? <span className="spinner-sm" /> : '↻'}
        </button>
      </div>

      <div className="geo-risk-list">
        {loading && zones.length === 0 && (
          <div className="geo-loading">
            {[1,2,3,4].map(i => <div key={i} className="geo-skeleton" />)}
          </div>
        )}
        {zones.map((zone) => {
          const cfg = RISK_CONFIG[zone.risk_label] || RISK_CONFIG.low;
          const isSelected = selected === zone.zone;
          return (
            <div
              key={zone.zone}
              className={`geo-zone-card ${isSelected ? 'geo-zone-selected' : ''}`}
              style={{ borderLeft: `3px solid ${cfg.color}` }}
              onClick={() => handleSelect(zone)}
            >
              <div className="geo-zone-top">
                <div className="geo-zone-name">{zone.zone}</div>
                <span className="geo-zone-badge" style={{ background: cfg.bg, color: cfg.color }}>
                  {zone.risk_label.toUpperCase()}
                </span>
              </div>

              <div className="geo-zone-bar-row">
                <div className="geo-zone-bar-bg">
                  <div
                    className="geo-zone-bar-fill"
                    style={{ width: `${Math.min(100, zone.risk_score * 100)}%`, background: cfg.bar }}
                  />
                </div>
                <span className="geo-zone-pct" style={{ color: cfg.color }}>
                  {(zone.risk_score * 100).toFixed(0)}%
                </span>
              </div>

              <div className="geo-zone-stats flex items-center gap-2">
                <span className="flex items-center gap-1"><Car size={12} /> {zone.traffic_segments} segs</span>
                <span className="flex items-center gap-1"><AlertTriangle size={12} /> {zone.severe_segments} severe</span>
                <span className="flex items-center gap-1"><BarChart2 size={12} /> {zone.avg_congestion}% cong</span>
              </div>

              {zone.infrastructure && Object.keys(zone.infrastructure).length > 0 && (
                <div className="geo-zone-infra">
                  {Object.entries(zone.infrastructure).map(([type, count]) => (
                    <span key={type} className="geo-infra-chip flex items-center gap-1" title={type}>
                      {TYPE_ICONS[type] || <MapPin size={12} />} {count}
                    </span>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
