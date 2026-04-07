import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    PieChart, Pie, Cell, Legend,
    RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
} from 'recharts';

const SEVERITY_COLORS = {
    critical: '#f43f5e',
    high: '#fb923c',
    medium: '#fbbf24',
    low: '#34d399',
};

const CHART_TOOLTIP = {
    contentStyle: {
        background: '#161d3a',
        border: '1px solid rgba(255,255,255,0.08)',
        borderRadius: '10px',
        color: '#e2e8f0',
        fontSize: '0.75rem',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
        padding: '8px 12px',
        boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
    },
    cursor: { fill: 'rgba(99, 102, 241, 0.06)' },
};

export function CongestionDistributionChart({ data }) {
    if (!data) return null;
    const chartData = Object.entries(data).map(([level, count]) => ({
        name: level.charAt(0).toUpperCase() + level.slice(1),
        value: count,
        fill: SEVERITY_COLORS[level] || '#64748b',
    }));

    return (
        <div className="chart-card">
            <h4>Traffic Congestion</h4>
            <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" innerRadius={55} outerRadius={85} paddingAngle={4}
                        dataKey="value" strokeWidth={0}
                        label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}

export function DisruptionTypesChart({ disruptions = [] }) {
    if (!disruptions.length) return null;
    const typeCounts = {};
    disruptions.forEach(d => {
        const type = (d.disruption_type || 'unknown').replace(/_/g, ' ');
        typeCounts[type] = (typeCounts[type] || 0) + 1;
    });
    const chartData = Object.entries(typeCounts)
        .map(([type, count]) => ({ type: type.charAt(0).toUpperCase() + type.slice(1), count }))
        .sort((a, b) => b.count - a.count);

    return (
        <div className="chart-card">
            <h4>Disruption Types</h4>
            <ResponsiveContainer width="100%" height={230}>
                <BarChart data={chartData} layout="vertical" margin={{ left: 90, right: 16 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" horizontal={false} />
                    <XAxis type="number" tick={{ fill: '#64748b', fontSize: 11, fontFamily: "'JetBrains Mono'" }} axisLine={false} tickLine={false} />
                    <YAxis type="category" dataKey="type" tick={{ fill: '#94a3b8', fontSize: 11 }} axisLine={false} tickLine={false} width={85} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Bar dataKey="count" fill="#818cf8" radius={[0, 5, 5, 0]} barSize={18} />
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export function SeverityDistributionChart({ disruptions = [] }) {
    if (!disruptions.length) return null;
    const sevCounts = { critical: 0, high: 0, medium: 0, low: 0 };
    disruptions.forEach(d => { sevCounts[d.severity_label || 'medium']++; });
    const chartData = Object.entries(sevCounts)
        .filter(([, c]) => c > 0)
        .map(([level, count]) => ({
            name: level.charAt(0).toUpperCase() + level.slice(1),
            value: count,
            fill: SEVERITY_COLORS[level],
        }));

    return (
        <div className="chart-card">
            <h4>Severity Breakdown</h4>
            <ResponsiveContainer width="100%" height={230}>
                <PieChart>
                    <Pie data={chartData} cx="50%" cy="50%" outerRadius={85} dataKey="value" strokeWidth={0}
                        label={({ name, value }) => `${name}: ${value}`}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Pie>
                    <Tooltip {...CHART_TOOLTIP} />
                    <Legend iconType="circle" iconSize={8}
                        wrapperStyle={{ fontSize: '0.7rem', color: '#94a3b8', fontFamily: "'Plus Jakarta Sans'" }} />
                </PieChart>
            </ResponsiveContainer>
        </div>
    );
}

export function DataSourcesChart({ sources }) {
    if (!sources) return null;
    const chartData = [
        { name: 'Traffic', value: sources.traffic_segments || 0, fill: '#60a5fa' },
        { name: 'Social', value: sources.social_posts_analyzed || 0, fill: '#a78bfa' },
        { name: 'Infrastructure', value: sources.infrastructure_locations || 0, fill: '#34d399' },
        { name: 'News', value: sources.news_articles || 0, fill: '#fb923c' },
        { name: 'Weather', value: sources.weather_alerts || 0, fill: '#f43f5e' },
    ];

    return (
        <div className="chart-card">
            <h4>Data Sources</h4>
            <ResponsiveContainer width="100%" height={230}>
                <BarChart data={chartData} margin={{ bottom: 24 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.04)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fill: '#64748b', fontSize: 10, fontFamily: "'Plus Jakarta Sans'" }}
                        angle={0} axisLine={false} tickLine={false} />
                    <YAxis tick={{ fill: '#64748b', fontSize: 11, fontFamily: "'JetBrains Mono'" }} axisLine={false} tickLine={false} />
                    <Tooltip {...CHART_TOOLTIP} />
                    <Bar dataKey="value" radius={[6, 6, 0, 0]} barSize={28}>
                        {chartData.map((e, i) => <Cell key={i} fill={e.fill} />)}
                    </Bar>
                </BarChart>
            </ResponsiveContainer>
        </div>
    );
}

export function ScoreRadarChart({ disruption }) {
    if (!disruption) return null;
    const radarData = [
        { signal: 'Traffic', value: (disruption.traffic_score || 0) * 100 },
        { signal: 'Social', value: (disruption.social_score || 0) * 100 },
        { signal: 'Severity', value: (disruption.severity_score || 0) * 100 },
        { signal: 'Confidence', value: (disruption.confidence || 0) * 100 },
    ];

    return (
        <div className="chart-card">
            <h4>Signal Analysis — {disruption.location_name}</h4>
            <ResponsiveContainer width="100%" height={230}>
                <RadarChart data={radarData}>
                    <PolarGrid stroke="rgba(255,255,255,0.06)" />
                    <PolarAngleAxis dataKey="signal" tick={{ fill: '#94a3b8', fontSize: 11 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: '#475569', fontSize: 9 }} />
                    <Radar name="Score" dataKey="value" stroke="#818cf8" fill="#818cf8" fillOpacity={0.2} strokeWidth={2} />
                    <Tooltip {...CHART_TOOLTIP} />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
