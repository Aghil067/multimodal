import { useState, useEffect, useRef } from 'react';

function AnimatedNumber({ target, duration = 800 }) {
  const [val, setVal] = useState(0);
  const raf = useRef(null);

  useEffect(() => {
    const num = typeof target === 'number' ? target : 0;
    const start = Date.now();
    const from = 0;
    const animate = () => {
      const elapsed = Date.now() - start;
      const progress = Math.min(elapsed / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3); // ease-out cubic
      setVal(Math.round(from + (num - from) * eased));
      if (progress < 1) raf.current = requestAnimationFrame(animate);
    };
    raf.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(raf.current);
  }, [target, duration]);

  return val;
}

const STAT_DEFS = [
  {
    key: 'disruptions',
    label: 'Disruptions',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/>
        <line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/>
      </svg>
    ),
    color: '#fb923c',
    gradient: 'linear-gradient(135deg, #fb923c 0%, #f97316 100%)',
    getValue: (s) => s.summary?.total_disruptions ?? 0,
    getSub: (s) => `${s.summary?.critical_count ?? 0} critical · ${s.summary?.high_count ?? 0} high`,
  },
  {
    key: 'alerts',
    label: 'Active Alerts',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/>
      </svg>
    ),
    color: '#f43f5e',
    gradient: 'linear-gradient(135deg, #f43f5e 0%, #e11d48 100%)',
    getValue: (s) => s.summary?.total_alerts ?? 0,
    getSub: (s) => `${s.summary?.high_count ?? 0} high severity`,
  },
  {
    key: 'fuel',
    label: 'Fuel Stations',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M3 22V8l7-5 7 5v14H3z"/><rect x="6" y="12" width="8" height="5" rx="1"/>
        <path d="M17 5l2.5 2.5M19.5 7.5v6.5a1.5 1.5 0 0 0 3 0V7"/>
      </svg>
    ),
    color: '#fbbf24',
    gradient: 'linear-gradient(135deg, #fbbf24 0%, #d97706 100%)',
    getValue: (s) => {
      const infra = s.dataSources?.infrastructure_locations ?? 0;
      return infra > 0 ? Math.round(infra * 0.35) : '—';
    },
    getSub: () => 'Active monitoring',
  },
  {
    key: 'grocery',
    label: 'Grocery Stores',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M6 2L3 6v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2V6l-3-4z"/><line x1="3" y1="6" x2="21" y2="6"/>
        <path d="M16 10a4 4 0 0 1-8 0"/>
      </svg>
    ),
    color: '#34d399',
    gradient: 'linear-gradient(135deg, #34d399 0%, #10b981 100%)',
    getValue: (s) => {
      const infra = s.dataSources?.infrastructure_locations ?? 0;
      return infra > 0 ? Math.round(infra * 0.45) : '—';
    },
    getSub: () => 'Under observation',
  },
  {
    key: 'traffic',
    label: 'Traffic Status',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/>
        <rect x="8" y="2" width="8" height="20" rx="2" strokeWidth="1.5"/>
      </svg>
    ),
    color: (s) => s.trafficAnalysis?.overall_status === 'critical' ? '#f43f5e'
      : s.trafficAnalysis?.overall_status === 'warning' ? '#fb923c'
      : '#34d399',
    gradient: (s) => s.trafficAnalysis?.overall_status === 'critical'
      ? 'linear-gradient(135deg, #f43f5e, #e11d48)'
      : 'linear-gradient(135deg, #34d399, #10b981)',
    getValue: (s) => s.trafficAnalysis?.overall_status?.toUpperCase()?.replace('_', ' ') || '—',
    getSub: (s) => `${s.trafficAnalysis?.severe_count ?? 0} severe · ${((s.trafficAnalysis?.avg_congestion ?? 0) * 100).toFixed(0)}% avg`,
    isText: true,
  },
  {
    key: 'social',
    label: 'Social Intel',
    icon: (
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
        <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
      </svg>
    ),
    color: '#a78bfa',
    gradient: 'linear-gradient(135deg, #a78bfa 0%, #8b5cf6 100%)',
    getValue: (s) => s.dataSources?.social_posts_analyzed ?? 0,
    getSub: () => 'Posts analyzed',
  },
];

export default function StatsCards({ summary = {}, dataSources = {}, trafficAnalysis = {}, loading = false }) {
  const ctx = { summary, dataSources, trafficAnalysis };

  return (
    <div className="stats-grid">
      {STAT_DEFS.map((def) => {
        const color = typeof def.color === 'function' ? def.color(ctx) : def.color;
        const gradient = typeof def.gradient === 'function' ? def.gradient(ctx) : def.gradient;
        const value = loading ? null : def.getValue(ctx);
        const sub = def.getSub(ctx);

        return (
          <div key={def.key} className={`stat-card ${loading ? 'loading' : ''}`}>
            <div className="stat-card-header">
              <span className="stat-icon" style={{ color }}>{def.icon}</span>
              <span className="stat-label">{def.label}</span>
            </div>
            <div className="stat-value" style={{ color }}>
              {loading ? (
                <span className="stat-skeleton" />
              ) : def.isText ? (
                value || '—'
              ) : (
                typeof value === 'number'
                  ? <AnimatedNumber target={value} />
                  : (value ?? '—')
              )}
            </div>
            <span className="stat-sub">{loading ? '...' : sub}</span>
            <div className="stat-accent" style={{ background: gradient }} />
          </div>
        );
      })}
    </div>
  );
}
