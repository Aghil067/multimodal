import { useState, useEffect, useRef } from 'react';
import { getAISummary } from '../../services/api';

const STATUS_CONFIG = {
  critical: { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', border: 'rgba(244,63,94,0.3)', label: 'CRITICAL', pulse: true },
  warning:  { color: '#fb923c', bg: 'rgba(251,146,60,0.12)', border: 'rgba(251,146,60,0.3)', label: 'ELEVATED', pulse: false },
  elevated: { color: '#fbbf24', bg: 'rgba(251,191,36,0.12)', border: 'rgba(251,191,36,0.3)', label: 'ELEVATED', pulse: false },
  nominal:  { color: '#34d399', bg: 'rgba(52,211,153,0.12)',  border: 'rgba(52,211,153,0.3)',  label: 'NOMINAL',  pulse: false },
};

function TypewriterText({ text, speed = 18 }) {
  const [displayed, setDisplayed] = useState('');
  const [done, setDone] = useState(false);
  const idx = useRef(0);
  const timerRef = useRef(null);

  useEffect(() => {
    idx.current = 0;
    setDisplayed('');
    setDone(false);
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      idx.current += 1;
      setDisplayed(text.slice(0, idx.current));
      if (idx.current >= text.length) {
        clearInterval(timerRef.current);
        setDone(true);
      }
    }, speed);
    return () => clearInterval(timerRef.current);
  }, [text, speed]);

  return <span>{displayed}{!done && <span className="ai-cursor">▋</span>}</span>;
}

export default function AISummaryPanel({ autoFetch = false }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetch, setLastFetch] = useState(null);

  const fetchSummary = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await getAISummary();
      setData(res.data);
      setLastFetch(new Date());
    } catch (e) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (autoFetch) fetchSummary();
  }, [autoFetch]);

  const statusCfg = STATUS_CONFIG[data?.status] || STATUS_CONFIG.nominal;

  return (
    <div className="ai-summary-panel">
      <div className="ai-panel-header">
        <div className="ai-header-left">
          <div className="ai-brain-icon">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
              <path d="M12 2C8.5 2 6 4.5 6 7.5c0 1-.3 1.9-.8 2.7C4.4 11.4 4 12.4 4 13.5 4 17 7.1 20 11 20h2c3.9 0 7-3 7-6.5 0-1.1-.4-2.1-1.2-2.8-.5-.8-.8-1.7-.8-2.7C18 4.5 15.5 2 12 2z" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9 20v1a2 2 0 0 0 4 0v-1" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
              <path d="M9 10h6M9.5 13.5h5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round"/>
            </svg>
          </div>
          <span className="ai-panel-title">AI Situational Intel</span>
          {data && (
            <span className="ai-status-badge" style={{ background: statusCfg.bg, border: `1px solid ${statusCfg.border}`, color: statusCfg.color }}>
              {statusCfg.pulse && <span className="ai-status-pulse" style={{ background: statusCfg.color }} />}
              {statusCfg.label}
            </span>
          )}
        </div>
        <div className="ai-header-right">
          {lastFetch && <span className="ai-fetch-time">{lastFetch.toLocaleTimeString()}</span>}
          <button className="ai-refresh-btn" onClick={fetchSummary} disabled={loading}>
            {loading ? <span className="spinner-sm" /> : (
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <polyline points="1 4 1 10 7 10"/><polyline points="23 20 23 14 17 14"/>
                <path d="M20.49 9A9 9 0 0 0 5.64 5.64L1 10m22 4l-4.64 4.36A9 9 0 0 1 3.51 15"/>
              </svg>
            )}
          </button>
        </div>
      </div>

      <div className="ai-panel-body">
        {!data && !loading && !error && (
          <div className="ai-empty">
            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" opacity="0.4">
              <path d="M12 2C8.5 2 6 4.5 6 7.5c0 1-.3 1.9-.8 2.7C4.4 11.4 4 12.4 4 13.5 4 17 7.1 20 11 20h2c3.9 0 7-3 7-6.5 0-1.1-.4-2.1-1.2-2.8-.5-.8-.8-1.7-.8-2.7C18 4.5 15.5 2 12 2z" />
            </svg>
            <p>Click refresh for AI situational analysis</p>
          </div>
        )}

        {loading && (
          <div className="ai-loading">
            <div className="ai-loading-dots">
              <span /><span /><span />
            </div>
            <p>Analyzing multimodal data streams...</p>
          </div>
        )}

        {error && (
          <div className="ai-error">⚠ {error}</div>
        )}

        {data && !loading && (
          <div className="ai-content">
            <div className="ai-summary-text" style={{ borderLeft: `2px solid ${statusCfg.color}` }}>
              <TypewriterText text={data.summary} speed={14} key={data.generated_at} />
            </div>

            {data.key_actions?.length > 0 && (
              <div className="ai-actions">
                <span className="ai-actions-label">Recommended Actions</span>
                <ul className="ai-action-list">
                  {data.key_actions.map((action, i) => (
                    <li key={i} className="ai-action-item">
                      <span className="ai-action-num">{i + 1}</span>
                      {action}
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {data.data_points && (
              <div className="ai-data-points">
                {[
                  { label: 'Corridors', value: data.data_points.traffic_segments },
                  { label: 'Severe', value: data.data_points.severe_corridors },
                  { label: 'Weather', value: data.data_points.weather_alerts },
                  { label: 'News', value: data.data_points.news_articles },
                ].map(dp => (
                  <div key={dp.label} className="ai-dp">
                    <span className="ai-dp-value">{dp.value}</span>
                    <span className="ai-dp-label">{dp.label}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
