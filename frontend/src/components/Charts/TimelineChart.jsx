import { useState, useEffect, useRef } from 'react';
import { getDisruptionTimeline } from '../../services/api';

function MiniSparkline({ data, color = '#818cf8', height = 40 }) {
  if (!data || data.length === 0) return null;
  const max = Math.max(...data.map(d => d.congestion_pct), 1);
  const min = 0;
  const w = 300; const h = height;
  const pts = data.map((d, i) => {
    const x = (i / (data.length - 1)) * w;
    const y = h - ((d.congestion_pct - min) / (max - min)) * (h - 4) - 2;
    return `${x},${y}`;
  });
  const areaPts = `0,${h} ${pts.join(' ')} ${w},${h}`;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="none" style={{ width: '100%', height }}>
      <defs>
        <linearGradient id={`spark-grad-${color.replace('#', '')}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="100%" stopColor={color} stopOpacity="0.02" />
        </linearGradient>
      </defs>
      <polygon points={areaPts} fill={`url(#spark-grad-${color.replace('#', '')})`} />
      <polyline points={pts.join(' ')} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
      {/* last point dot */}
      {pts.length > 0 && (() => {
        const last = pts[pts.length - 1].split(',');
        return <circle cx={last[0]} cy={last[1]} r="3" fill={color} />;
      })()}
    </svg>
  );
}

export default function TimelineChart() {
  const [timeline, setTimeline] = useState([]);
  const [loading, setLoading] = useState(false);
  const [currentScore, setCurrentScore] = useState(null);

  const fetchTimeline = async () => {
    setLoading(true);
    try {
      const res = await getDisruptionTimeline();
      setTimeline(res.data.timeline || []);
      setCurrentScore(res.data.current_score);
    } catch (e) {
      console.warn('Timeline fetch failed:', e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchTimeline(); }, []);

  // Find peak and current
  const peak = timeline.length > 0
    ? timeline.reduce((a, b) => a.congestion_pct > b.congestion_pct ? a : b, timeline[0])
    : null;

  // Segment into: night, morning rush, midday, evening rush, night
  const rushHours = timeline.filter(t => (t.hour >= 7 && t.hour <= 9) || (t.hour >= 16 && t.hour <= 19));
  const avgRush = rushHours.length ? rushHours.reduce((s, t) => s + t.congestion_pct, 0) / rushHours.length : 0;

  const currentEntry = timeline[timeline.length - 1];

  return (
    <div className="timeline-chart-card">
      <div className="timeline-header">
        <div className="timeline-title-group">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" style={{ opacity: 0.7 }}>
            <polyline points="22 12 18 12 15 21 9 3 6 12 2 12"/>
          </svg>
          <span className="timeline-title">24-Hour Disruption Timeline</span>
        </div>
        <button className="timeline-refresh" onClick={fetchTimeline} disabled={loading}>
          {loading ? <span className="spinner-sm" /> : '↻'}
        </button>
      </div>

      {loading && timeline.length === 0 ? (
        <div className="timeline-loading">
          <div className="timeline-skeleton" />
        </div>
      ) : (
        <>
          <div className="timeline-kpis">
            <div className="timeline-kpi">
              <span className="timeline-kpi-value" style={{ color: '#818cf8' }}>
                {currentEntry ? `${currentEntry.congestion_pct.toFixed(0)}%` : '—'}
              </span>
              <span className="timeline-kpi-label">Current</span>
            </div>
            <div className="timeline-kpi">
              <span className="timeline-kpi-value" style={{ color: '#f43f5e' }}>
                {peak ? `${peak.congestion_pct.toFixed(0)}%` : '—'}
              </span>
              <span className="timeline-kpi-label">24h Peak</span>
            </div>
            <div className="timeline-kpi">
              <span className="timeline-kpi-value" style={{ color: '#fb923c' }}>
                {avgRush > 0 ? `${avgRush.toFixed(0)}%` : '—'}
              </span>
              <span className="timeline-kpi-label">Avg Rush</span>
            </div>
          </div>

          <div className="timeline-chart-area">
            <MiniSparkline data={timeline} color="#818cf8" height={56} />
          </div>

          {/* Hour labels */}
          <div className="timeline-hours">
            {['12am', '4am', '8am', '12pm', '4pm', '8pm', 'Now'].map(l => (
              <span key={l}>{l}</span>
            ))}
          </div>

          {/* Rush hour markers */}
          <div className="timeline-legend-row">
            <span className="timeline-legend-item rush">🚗 AM Rush 7–9am</span>
            <span className="timeline-legend-item rush">🚗 PM Rush 4–7pm</span>
            <span className="timeline-legend-item current">● Live</span>
          </div>
        </>
      )}
    </div>
  );
}
