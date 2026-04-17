import { useState, useEffect } from 'react';
import { Fuel, ShoppingCart, Waves, Zap, Ban, AlertCircle, CloudLightning, Newspaper, MapPin, Check } from 'lucide-react';

const SEVERITY_COLORS = {
  critical: { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)', pulse: true },
  high:     { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.25)', pulse: false },
  medium:   { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.2)', pulse: false },
  low:      { color: '#34d399', bg: 'rgba(52,211,153,0.12)', border: 'rgba(52,211,153,0.2)', pulse: false },
};

const TYPE_ICONS = {
  fuel_shortage: <Fuel size={14} />,
  grocery_shortage: <ShoppingCart size={14} />,
  road_blocked: <Ban size={14} />,
  flooding: <Waves size={14} />,
  panic_buying: <Zap size={14} />,
  power_outage: <Zap size={14} />,
  inaccessible_location: <Ban size={14} />,
  general_disruption: <AlertCircle size={14} />,
  weather: <CloudLightning size={14} />,
  news: <Newspaper size={14} />,
};

const SEVERITY_ORDER = { critical: 0, high: 1, medium: 2, low: 3 };

function TimeSince({ time }) {
  const [label, setLabel] = useState('');
  useEffect(() => {
    const compute = () => {
      if (!time) return setLabel('');
      const diff = (Date.now() - new Date(time)) / 1000;
      if (diff < 60) setLabel('just now');
      else if (diff < 3600) setLabel(`${Math.floor(diff / 60)}m ago`);
      else setLabel(`${Math.floor(diff / 3600)}h ago`);
    };
    compute();
    const t = setInterval(compute, 30000);
    return () => clearInterval(t);
  }, [time]);
  return <span className="alert-timestamp">{label}</span>;
}

export default function AlertsPanel({ alerts = [], disruptions = [], onAlertClick = () => {} }) {
  const [filter, setFilter] = useState('all');
  const [expanded, setExpanded] = useState(null);
  const [resolved, setResolved] = useState(new Set());
  const [view, setView] = useState('priority'); // 'priority' | 'time'

  const allItems = [
    ...disruptions.map(d => ({
      ...d,
      itemType: 'disruption',
      severity: d.severity_label || 'medium',
      title: d.location_name,
      message: d.description,
      time: d.detected_at,
    })),
    ...alerts.map(a => ({
      ...a,
      itemType: 'alert',
      title: a.title || a.location_name || 'Alert',
      message: a.message,
      time: a.created_at || a.timestamp,
    })),
  ];

  // Sort
  const sorted = [...allItems].sort((a, b) => {
    if (view === 'priority') {
      return (SEVERITY_ORDER[a.severity] ?? 4) - (SEVERITY_ORDER[b.severity] ?? 4);
    }
    return new Date(b.time || 0) - new Date(a.time || 0);
  });

  const visible = sorted.filter(i => !resolved.has(`${i.itemType}-${i.latitude}-${i.longitude}-${i.title}`));
  const filtered = filter === 'all' ? visible : visible.filter(i => i.severity === filter);

  const counts = {
    critical: visible.filter(i => i.severity === 'critical').length,
    high: visible.filter(i => i.severity === 'high').length,
    medium: visible.filter(i => i.severity === 'medium').length,
    low: visible.filter(i => i.severity === 'low').length,
  };

  const markResolved = (item, e) => {
    e.stopPropagation();
    setResolved(prev => new Set([...prev, `${item.itemType}-${item.latitude}-${item.longitude}-${item.title}`]));
  };

  return (
    <div className="alerts-panel">
      <div className="alerts-header">
        <div className="alerts-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
          </svg>
          <h3>Disruption Feed</h3>
        </div>
        <div className="alerts-header-right">
          <span className="alert-count">{visible.length}</span>
        </div>
      </div>

      {/* View toggle + severity filters */}
      <div className="alerts-controls">
        <div className="alerts-view-toggle">
          <button
            className={`view-toggle-btn ${view === 'priority' ? 'active' : ''}`}
            onClick={() => setView('priority')}
          >Priority</button>
          <button
            className={`view-toggle-btn ${view === 'time' ? 'active' : ''}`}
            onClick={() => setView('time')}
          >Recent</button>
        </div>
      </div>

      <div className="severity-filters">
        <button className={`filter-pill ${filter === 'all' ? 'active' : ''}`} onClick={() => setFilter('all')}>
          All ({visible.length})
        </button>
        {Object.entries(counts).map(([sev, count]) => count > 0 && (
          <button key={sev} className={`filter-pill filter-${sev} ${filter === sev ? 'active' : ''}`} onClick={() => setFilter(sev)}>
            {sev} ({count})
          </button>
        ))}
      </div>

      <div className="alerts-list">
        {filtered.length === 0 ? (
          <div className="no-alerts">
            <span className="no-alerts-icon">✓</span>
            <p>No{filter !== 'all' ? ` ${filter}` : ''} alerts active</p>
          </div>
        ) : (
          filtered.map((item, index) => {
            const cfg = SEVERITY_COLORS[item.severity] || SEVERITY_COLORS.low;
            const isExpanded = expanded === index;
            const itemKey = `${item.itemType}-${index}`;

            return (
              <div
                key={itemKey}
                className={`alert-card ${cfg.pulse ? 'alert-pulse-border' : ''}`}
                style={{ borderLeft: `3px solid ${cfg.color}`, background: isExpanded ? cfg.bg : undefined }}
                onClick={() => { onAlertClick(item); setExpanded(isExpanded ? null : index); }}
              >
                <div className="alert-card-header">
                  <div className="alert-type-icon-wrap" style={{ background: cfg.bg }}>
                    <span className="alert-type-icon flex items-center justify-center">
                      {TYPE_ICONS[item.disruption_type] || TYPE_ICONS[item.type] || <AlertCircle size={14} />}
                    </span>
                  </div>
                  <div className="alert-info">
                    <span className="alert-title">{item.title}</span>
                    <div className="alert-meta-row">
                      <span className="alert-type-tag">
                        {(item.disruption_type || item.type || '').replace(/_/g, ' ')}
                      </span>
                      <TimeSince time={item.time} />
                    </div>
                  </div>
                  <div className="alert-right">
                    <div className="severity-indicator" style={{ background: cfg.color }}>
                      {item.severity_score ? `${(item.severity_score * 100).toFixed(0)}%` : item.severity?.slice(0,3).toUpperCase()}
                    </div>
                  </div>
                </div>

                {isExpanded && (
                  <div className="alert-card-body">
                    <p className="alert-message">{item.message}</p>

                    {item.contributing_factors?.length > 0 && (
                      <div className="contributing-factors">
                        <strong>Contributing Signals</strong>
                        <ul>{item.contributing_factors.map((f, fi) => <li key={fi}>{f}</li>)}</ul>
                      </div>
                    )}

                    {item.traffic_score !== undefined && (
                      <div className="score-bars">
                        {[
                          { label: 'Traffic Signal', score: item.traffic_score, color: '#60a5fa' },
                          { label: 'Social Signal', score: item.social_score, color: '#a78bfa' },
                        ].map(({ label, score, color }) => (
                          <div key={label} className="score-bar-item">
                            <span>{label}</span>
                            <div className="score-bar">
                              <div className="score-bar-fill" style={{ width: `${(score || 0) * 100}%`, background: color }} />
                            </div>
                            <span>{((score || 0) * 100).toFixed(0)}%</span>
                          </div>
                        ))}
                      </div>
                    )}

                    <div className="alert-actions">
                      {item.latitude && item.longitude && (
                        <button className="alert-action-btn btn-view" onClick={(e) => { e.stopPropagation(); onAlertClick(item); }}>
                          <MapPin size={14} className="inline-icon" /> View on Map
                        </button>
                      )}
                      <button className="alert-action-btn btn-resolve" onClick={(e) => markResolved(item, e)}>
                        <Check size={14} className="inline-icon" /> Mark Resolved
                      </button>
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
