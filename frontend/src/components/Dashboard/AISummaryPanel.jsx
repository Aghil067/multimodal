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

            {data.supply_chain_impact && (
              <div className="ai-actions" style={{ marginTop: '1rem' }}>
                <span className="ai-actions-label" style={{ color: '#fb923c', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M22 12h-4l-3 9L9 3l-3 9H2"></path>
                  </svg>
                  Supply Chain Prediction
                </span>
                <div className="ai-summary-text" style={{ 
                  fontSize: '0.85rem', 
                  color: '#e2e8f0', 
                  margin: '0.5rem 0 0 0',
                  lineHeight: '1.4',
                  whiteSpace: 'pre-line' 
                }}>
                  <TypewriterText text={data.supply_chain_impact} speed={8} key={"sc-" + data.generated_at} />
                </div>
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

            {data.infrastructure_impact && (
              <div className="ai-actions" style={{ marginTop: '1rem' }}>
                <span className="ai-actions-label" style={{ color: '#3b82f6', display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <circle cx="12" cy="12" r="10"/><path d="M12 2v20M2 12h20"/>
                  </svg>
                  Infrastructure Impact
                </span>
                
                <div className="ai-infrastructure-grid" style={{ 
                  display: 'grid', 
                  gridTemplateColumns: 'repeat(2, 1fr)', 
                  gap: '0.5rem',
                  margin: '0.7rem 0',
                  fontSize: '0.8rem'
                }}>
                  <div style={{ background: 'rgba(244,63,94,0.15)', padding: '0.5rem', borderRadius: '4px', borderLeft: '3px solid #f43f5e' }}>
                    <div style={{ color: '#f43f5e', fontWeight: '700' }}>{data.infrastructure_impact.facilities_closed}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>CLOSED</div>
                  </div>
                  <div style={{ background: 'rgba(251,146,60,0.15)', padding: '0.5rem', borderRadius: '4px', borderLeft: '3px solid #fb923c' }}>
                    <div style={{ color: '#fb923c', fontWeight: '700' }}>{data.infrastructure_impact.facilities_impacted}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>IMPACTED</div>
                  </div>
                  <div style={{ background: 'rgba(251,191,36,0.15)', padding: '0.5rem', borderRadius: '4px', borderLeft: '3px solid #fbbf24' }}>
                    <div style={{ color: '#fbbf24', fontWeight: '700' }}>{data.infrastructure_impact.facilities_at_risk}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>AT RISK</div>
                  </div>
                  <div style={{ background: 'rgba(52,211,153,0.15)', padding: '0.5rem', borderRadius: '4px', borderLeft: '3px solid #34d399' }}>
                    <div style={{ color: '#34d399', fontWeight: '700' }}>{data.infrastructure_impact.facilities_at_risk === undefined ? '?' : (data.infrastructure_impact.total_facilities - data.infrastructure_impact.facilities_closed - data.infrastructure_impact.facilities_impacted - data.infrastructure_impact.facilities_at_risk)}</div>
                    <div style={{ color: '#94a3b8', fontSize: '0.75rem' }}>OPERATIONAL</div>
                  </div>
                </div>

                {data.infrastructure_impact.impact_percentage > 0 && (
                  <div style={{ 
                    background: 'rgba(0,0,0,0.2)', 
                    padding: '0.6rem 0.8rem', 
                    borderRadius: '4px',
                    margin: '0.5rem 0',
                    borderLeft: '3px solid #fb923c'
                  }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.3rem' }}>Supply Network Disruption</div>
                    <div style={{ fontSize: '0.9rem', fontWeight: '700', color: '#fb923c' }}>
                      {data.infrastructure_impact.impact_percentage.toFixed(1)}% of facilities affected
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#cbd5e1', marginTop: '0.3rem' }}>
                      Critical resources ({data.infrastructure_impact.type_breakdown?.grocery?.CLOSED || 0} grocery, {data.infrastructure_impact.type_breakdown?.fuel_station?.CLOSED || 0} fuel) compromised
                    </div>
                  </div>
                )}

                {data.infrastructure_impact.impacted_list?.length > 0 && (
                  <div style={{ marginTop: '0.7rem' }}>
                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginBottom: '0.5rem', fontWeight: '600' }}>Top Impacted Facilities:</div>
                    <div style={{ maxHeight: '120px', overflowY: 'auto' }}>
                      {data.infrastructure_impact.impacted_list.slice(0, 5).map((facility, idx) => (
                        <div key={idx} style={{ 
                          fontSize: '0.75rem', 
                          padding: '0.4rem 0.6rem',
                          background: 'rgba(0,0,0,0.2)',
                          borderRadius: '3px',
                          marginBottom: '0.3rem',
                          borderLeft: facility.status === 'CLOSED' ? '3px solid #f43f5e' : '3px solid #fb923c'
                        }}>
                          <div style={{ color: '#e2e8f0', fontWeight: '600' }}>{facility.name}</div>
                          <div style={{ color: '#94a3b8', fontSize: '0.7rem' }}>
                            {facility.type.replace(/_/g, ' ')} • {facility.status}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
