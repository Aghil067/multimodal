import { useState, useMemo } from 'react';

const SENTIMENT_COLORS = {
  negative: { color: '#f43f5e', bg: 'rgba(244,63,94,0.12)', label: '⬇ Negative' },
  positive: { color: '#34d399', bg: 'rgba(52,211,153,0.12)', label: '⬆ Positive' },
  neutral:  { color: '#94a3b8', bg: 'rgba(148,163,184,0.12)', label: '→ Neutral' },
};

const DISRUPTION_KEYWORDS = [
  'fuel', 'gas', 'shortage', 'line', 'long line', 'empty', 'closed', 'out of stock',
  'flood', 'road', 'blocked', 'closed', 'outage', 'power', 'crowd', 'panic',
];

function highlightKeywords(text) {
  if (!text) return '';
  const regex = new RegExp(`(${DISRUPTION_KEYWORDS.join('|')})`, 'gi');
  const parts = text.split(regex);
  return parts.map((part, i) =>
    regex.test(part)
      ? <mark key={i} className="feed-keyword">{part}</mark>
      : part
  );
}

function SentimentBar({ sentiment }) {
  const cfg = SENTIMENT_COLORS[sentiment] || SENTIMENT_COLORS.neutral;
  const width = sentiment === 'negative' ? 80 : sentiment === 'positive' ? 65 : 45;
  return (
    <div className="sentiment-bar-wrap">
      <div className="sentiment-bar-track">
        <div className="sentiment-bar-fill" style={{ width: `${width}%`, background: cfg.color }} />
      </div>
      <span className="sentiment-label" style={{ color: cfg.color }}>{cfg.label}</span>
    </div>
  );
}

const TABS = [
  { id: 'all',     label: 'All',     icon: '◎' },
  { id: 'weather', label: 'Weather', icon: '☁' },
  { id: 'social',  label: 'Social',  icon: '💬' },
  { id: 'news',    label: 'News',    icon: '📰' },
];

export default function DataFeed({ socialPosts = [], newsArticles = [], weatherAlerts = [] }) {
  const [activeTab, setActiveTab] = useState('all');
  const [expandedIdx, setExpandedIdx] = useState(null);

  const counts = {
    all: weatherAlerts.length + socialPosts.length + newsArticles.length,
    weather: weatherAlerts.length,
    social: socialPosts.length,
    news: newsArticles.length,
  };

  const allItems = useMemo(() => {
    const weather = weatherAlerts.map(a => ({
      type: 'weather', icon: '⛈',
      title: a.title || a.event || 'Weather Alert',
      text: a.message || a.headline || a.description?.slice(0, 300),
      severity: a.severity, time: a.timestamp || a.effective,
      areas: a.areas,
    }));
    const social = socialPosts.slice(0, 30).map(p => ({
      type: 'social', icon: '💬',
      title: p.subreddit ? `r/${p.subreddit}` : 'Social Media',
      text: p.text?.slice(0, 300),
      sentiment: p.sentiment,
      disruption_type: p.disruption_type,
      time: p.posted_at,
      author: p.author,
      score: p.score,
      comments: p.num_comments,
    }));
    const news = newsArticles.slice(0, 15).map(n => ({
      type: 'news', icon: '📰',
      title: n.title?.slice(0, 100) || 'News Article',
      text: n.text?.slice(0, 300) || n.message?.slice(0, 300),
      url: n.url,
      time: n.published_at || n.timestamp,
      source: n.source,
    }));

    const all = [...weather, ...social, ...news];
    all.sort((a, b) => {
      const ta = a.time ? new Date(a.time) : new Date(0);
      const tb = b.time ? new Date(b.time) : new Date(0);
      return tb - ta;
    });
    return all;
  }, [socialPosts, newsArticles, weatherAlerts]);

  const filtered = activeTab === 'all' ? allItems : allItems.filter(i => i.type === activeTab);

  return (
    <div className="data-feed">
      <div className="feed-header">
        <div className="feed-header-left">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" style={{ opacity: 0.7 }}>
            <line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/>
            <line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/>
            <line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/>
          </svg>
          <h3>Live Data Feed</h3>
        </div>
        <span className="feed-count">{filtered.length}</span>
      </div>

      <div className="feed-tabs">
        {TABS.map(tab => (
          <button
            key={tab.id}
            className={`feed-tab-btn ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => { setActiveTab(tab.id); setExpandedIdx(null); }}
          >
            <span className="feed-tab-icon">{tab.icon}</span>
            {tab.label}
            <span className="feed-tab-count">{counts[tab.id]}</span>
          </button>
        ))}
      </div>

      <div className="feed-list">
        {filtered.length === 0 ? (
          <div className="feed-empty">
            <div className="feed-empty-icon">◎</div>
            <p>No {activeTab !== 'all' ? activeTab : ''} data yet.</p>
            <p className="feed-empty-hint">Click "Run Detection" to fetch live data.</p>
          </div>
        ) : (
          filtered.map((item, index) => {
            const isExpanded = expandedIdx === index;
            return (
              <div
                key={index}
                className={`feed-item feed-${item.type} ${isExpanded ? 'expanded' : ''}`}
                onClick={() => setExpandedIdx(isExpanded ? null : index)}
              >
                <div className="feed-item-icon-col">
                  <span className="feed-icon-circle feed-icon-circle-{item.type}">{item.icon}</span>
                  <div className="feed-item-line" />
                </div>

                <div className="feed-content">
                  <div className="feed-item-header">
                    <strong className="feed-title">{item.title}</strong>
                    <div className="feed-badges">
                      {item.severity && (
                        <span className={`feed-severity-badge sev-${item.severity?.toLowerCase()}`}>
                          {item.severity}
                        </span>
                      )}
                      {item.disruption_type && item.disruption_type !== 'general_disruption' && (
                        <span className="feed-tag">{item.disruption_type.replace(/_/g, ' ')}</span>
                      )}
                    </div>
                  </div>

                  <p className="feed-text">
                    {item.type === 'social' ? highlightKeywords(item.text) : item.text}
                  </p>

                  {item.sentiment && <SentimentBar sentiment={item.sentiment} />}

                  {isExpanded && (
                    <div className="feed-expanded-detail">
                      {item.areas && <div className="feed-detail-row"><span>📍</span>{item.areas}</div>}
                      {item.author && <div className="feed-detail-row"><span>👤</span>Posted by u/{item.author}</div>}
                      {item.score != null && <div className="feed-detail-row"><span>⬆</span>{item.score} pts · {item.comments} comments</div>}
                      {item.source && <div className="feed-detail-row"><span>🔗</span>{item.source}</div>}
                      {item.url && (
                        <a href={item.url} target="_blank" rel="noopener noreferrer" className="feed-link" onClick={e => e.stopPropagation()}>
                          Read full article →
                        </a>
                      )}
                    </div>
                  )}

                  <div className="feed-meta">
                    {item.time && (
                      <span className="feed-time">
                        {new Date(item.time).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                    <span className="feed-expand-hint">{isExpanded ? '▲ less' : '▼ more'}</span>
                  </div>
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
