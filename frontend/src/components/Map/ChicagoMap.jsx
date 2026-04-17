import React, { useState, useEffect, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, CircleMarker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import polyline from '@mapbox/polyline';
import 'leaflet/dist/leaflet.css';
import { SimulationOverlay } from '../Simulation/EmergencySimulation';
import { AlertTriangle, CloudSnow, Calendar } from 'lucide-react';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
    iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
    iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
    shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

// ---------------------------------------------------------------------------
// SVG icon builders - CLEAN & MINIMAL
// ---------------------------------------------------------------------------

/** Gas Station icon */
const GAS_STATION_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#f97316" stroke="#fff" stroke-width="2"/>
  <rect x="11" y="9.5" width="8" height="12" rx="1" fill="#fff"/>
  <rect x="13" y="11.5" width="4" height="4" rx="0.5" fill="#ef4444"/>
  <path d="M19 12 h2 v5 h-1" stroke="#fff" stroke-width="1.5" fill="none"/>
  <rect x="9" y="21.5" width="12" height="1.5" rx="0.5" fill="#fff"/>
</svg>`.trim();

/** Grocery Store icon */
const GROCERY_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#10b981" stroke="#fff" stroke-width="2"/>
  <path d="M10 11.5 L22 11.5 L20 17 L12 17 Z" fill="none" stroke="#fff" stroke-width="2" stroke-linejoin="round"/>
  <path d="M8 9.5 L10 9.5 L10 11.5" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round"/>
  <circle cx="13" cy="20" r="1.5" fill="#fff"/>
  <circle cx="19" cy="20" r="1.5" fill="#fff"/>
</svg>`.trim();

/** Hospital icon */
const HOSPITAL_SVG = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <circle cx="16" cy="16" r="14" fill="#3b82f6" stroke="#fff" stroke-width="2"/>
  <path d="M16 9.5 L16 22.5 M9.5 16 L22.5 16" stroke="#fff" stroke-width="4.5" stroke-linecap="round"/>
</svg>`.trim();


/** Disruption markers stay as plain colored circles */
const createDisruptionIcon = (color, size = 24) =>
    L.divIcon({
        className: 'custom-marker',
        html: `<div style="
      background:${color};
      width:${size}px;height:${size}px;
      border-radius:50%;
      border:2.5px solid rgba(255,255,255,0.9);
      box-shadow:0 1px 6px rgba(0,0,0,0.45),0 0 10px ${color}55;
    "></div>`,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
    });

const makeSvgIcon = (svgStr, size = 36) =>
    L.divIcon({
        className: '',
        html: svgStr,
        iconSize: [size, size],
        iconAnchor: [size / 2, size / 2],
        popupAnchor: [0, -(size / 2) - 4],
    });

// Pre-build the icons once
const ICONS = {
    fuel_station: makeSvgIcon(GAS_STATION_SVG, 26),
    grocery: makeSvgIcon(GROCERY_SVG, 26),
    hospital: makeSvgIcon(HOSPITAL_SVG, 26),
    pharmacy: makeSvgIcon(HOSPITAL_SVG, 22),   // reuse hospital cross for pharmacy
    disruption_critical: createDisruptionIcon('#f43f5e', 24),
    disruption_high: createDisruptionIcon('#fb923c', 22),
    disruption_medium: createDisruptionIcon('#fbbf24', 20),
    disruption_low: createDisruptionIcon('#34d399', 18),
};

const CONGESTION_COLORS = {
    low: 'rgba(52, 211, 153, 0.7)',
    medium: 'rgba(251, 191, 36, 0.7)',
    high: 'rgba(251, 146, 60, 0.8)',
    severe: 'rgba(244, 63, 94, 0.85)',
    unknown: 'rgba(100, 116, 139, 0.5)',
};

// ---------------------------------------------------------------------------
// Travel Midwest – congestion level colours (match the screenshot exactly)
// ---------------------------------------------------------------------------
const TM_CONGESTION_MAP = {
    N: { color: '#00cc00', label: 'Free Flow' },          // bright green
    L: { color: '#00cc00', label: 'Light Traffic' },       // green
    M: { color: '#cccc00', label: 'Moderate Congestion' }, // yellow
    H: { color: '#cc0000', label: 'Heavy Congestion' },    // red
};

/** Decide line weight based on road-id convention (interstates thicker) */
const roadWeight = (id) => {
    if (!id) return 4;
    const u = id.toUpperCase();
    if (u.includes('I_') || u.includes('I-') || u.includes('INTERSTATE')) return 6;
    if (u.includes('US_') || u.includes('US-') || u.includes('HIGHWAY')) return 5;
    return 4;
};

// ---------------------------------------------------------------------------
// Helper: fly-to on location change
// ---------------------------------------------------------------------------
function FlyToLocation({ center, zoom }) {
    const map = useMap();
    useEffect(() => {
        if (center) map.flyTo(center, zoom, { duration: 1.2 });
    }, [center, zoom, map]);
    return null;
}

function MapZoomListener({ onZoom }) {
    const map = useMapEvents({
        zoomend: () => onZoom(map.getZoom()),
    });
    useEffect(() => {
        if (map) onZoom(map.getZoom());
    }, [map, onZoom]);
    return null;
}

function MapResizer() {
    const map = useMap();
    useEffect(() => {
        const container = map.getContainer();
        const ro = new window.ResizeObserver(() => {
            requestAnimationFrame(() => map.invalidateSize());
        });
        ro.observe(container);
        setTimeout(() => map.invalidateSize(), 300);
        return () => ro.disconnect();
    }, [map]);
    return null;
}

// ---------------------------------------------------------------------------
// Main map component
// ---------------------------------------------------------------------------
export default function ChicagoMap({
    trafficData = [], infrastructure = [], disruptions = [], travelMidwestCongestion = [],
    travelMidwestIncidents = [], travelMidwestWeather = [], travelMidwestConstruction = [], 
    selectedLocation = null, showTraffic = true, 
    showInfrastructure = true, showDisruptions = true, onLocationClick = () => { },
    simConfig = null, isSimulationTab = false, facilityStatus = [],
}) {
    const [flyTarget, setFlyTarget] = useState(null);
    const [currentZoom, setCurrentZoom] = useState(11);

    // ------------------------------------------------------------------
    // Memoised: decode all TM congestion features into renderable objects
    // ------------------------------------------------------------------
    const tmLineObjects = useMemo(() => {
        if (!travelMidwestCongestion || !travelMidwestCongestion.length) return [];

        const results = [];
        for (let i = 0; i < travelMidwestCongestion.length; i++) {
            const feature = travelMidwestCongestion[i];
            if (!feature || !feature.geometry || !feature.properties) continue;

            const props = feature.properties;
            const cng = props.cng || 'N';
            const tmColor = TM_CONGESTION_MAP[cng] || TM_CONGESTION_MAP.N;
            const weight = roadWeight(props.id);

            try {
                const coords = feature.geometry.coordinates;
                if (!coords) continue;

                // TM congestion features use MultiLineString with encoded strings
                if (Array.isArray(coords)) {
                    for (const segment of coords) {
                        if (typeof segment === 'string') {
                            const decoded = polyline.decode(segment);
                            if (decoded && decoded.length > 1) {
                                results.push({
                                    key: `tm-${i}-${results.length}`,
                                    positions: decoded,
                                    color: tmColor.color,
                                    weight,
                                    opacity: 0.95,
                                    label: tmColor.label,
                                    id: props.id || 'Traffic Segment',
                                    cng,
                                });
                            }
                        } else if (Array.isArray(segment)) {
                            // Array of [lng, lat] numbers (plain geojson)
                            if (segment.length >= 2 && typeof segment[0] === 'number') {
                                // Single coordinate pair as part of LineString coords
                                continue; // handled at parent level
                            }
                            // Array of [lng, lat] arrays
                            const decoded = segment
                                .filter(p => Array.isArray(p) && p.length >= 2)
                                .map(p => [p[1], p[0]]);
                            if (decoded.length > 1) {
                                results.push({
                                    key: `tm-${i}-${results.length}`,
                                    positions: decoded,
                                    color: tmColor.color,
                                    weight,
                                    opacity: 0.95,
                                    label: tmColor.label,
                                    id: props.id || 'Traffic Segment',
                                    cng,
                                });
                            }
                        }
                    }

                    // If coords was a flat array of [lng, lat] pairs (LineString style)
                    if (coords.length > 0 && Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
                        const decoded = coords
                            .filter(p => Array.isArray(p) && p.length >= 2)
                            .map(p => [p[1], p[0]]);
                        if (decoded.length > 1) {
                            results.push({
                                key: `tm-${i}-ls`,
                                positions: decoded,
                                color: tmColor.color,
                                weight,
                                opacity: 0.95,
                                label: tmColor.label,
                                id: props.id || 'Traffic Segment',
                                cng,
                            });
                        }
                    }
                } else if (typeof coords === 'string') {
                    const decoded = polyline.decode(coords);
                    if (decoded && decoded.length > 1) {
                        results.push({
                            key: `tm-${i}-enc`,
                            positions: decoded,
                            color: tmColor.color,
                            weight,
                            opacity: 0.95,
                            label: tmColor.label,
                            id: props.id || 'Traffic Segment',
                            cng,
                        });
                    }
                }
            } catch (e) {
                console.warn('TM parse error:', e);
            }
        }
        return results;
    }, [travelMidwestCongestion]);

    // ------------------------------------------------------------------
    // Render Travel Midwest congestion polylines
    // ------------------------------------------------------------------
    const renderTmLines = () => {
        if (!showTraffic || !tmLineObjects.length) return null;
        const visibleLines = isSimulationTab
            ? tmLineObjects.filter((line, index) => line.cng === 'H' || line.cng === 'M' || index % 2 === 0)
            : tmLineObjects;
        
        // Dynamic weight based on zoom level:
        // zoomed out (< 12) -> very thin (1.5)
        // mid zoom (12-13)  -> thin (3)
        // zoomed in (14+)   -> normal (6)
        // maximum zoom      -> prominent (8)
        const outerWeight = currentZoom >= 15 ? 9 : currentZoom >= 14 ? 7 : currentZoom >= 12 ? 4 : 3;
        const innerWeight = currentZoom >= 15 ? 2 : currentZoom >= 14 ? 1.5 : currentZoom >= 12 ? 1 : 0.75;
        const dashArray = currentZoom >= 14 ? '8 12' : currentZoom >= 12 ? '4 8' : 'none';

        return visibleLines.map((line) => (
            <React.Fragment key={line.key}>
                <Polyline
                    positions={line.positions}
                    pathOptions={{
                        color: line.color,
                        weight: outerWeight,
                        opacity: 0.9,
                        lineCap: 'round',
                        lineJoin: 'round',
                        smoothFactor: 0,
                    }}
                >
                    {!isSimulationTab && (
                        <Popup>
                            <div className="popup-content" style={{ minWidth: 200 }}>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                                    <span style={{
                                        width: 14, height: 14, borderRadius: '50%',
                                        background: line.color, display: 'inline-block',
                                        border: '2px solid rgba(255,255,255,0.8)',
                                        boxShadow: `0 0 6px ${line.color}88`,
                                    }} />
                                    <strong style={{ fontSize: '0.9rem' }}>{line.label}</strong>
                                </div>
                                <div style={{ fontSize: '0.78rem', color: '#94a3b8', fontFamily: 'monospace' }}>
                                    {line.id}
                                </div>
                            </div>
                        </Popup>
                    )}
                </Polyline>
                <Polyline
                    positions={line.positions}
                    pathOptions={{ 
                        color: '#fff', 
                        weight: innerWeight, 
                        dashArray: dashArray, 
                        opacity: innerWeight > 0 ? 0.6 : 0,
                        smoothFactor: 0, 
                    }}
                />
            </React.Fragment>
        ));
    };


    // ------------------------------------------------------------------
    // Travel Midwest Incidents (point markers) – ONLY full closures
    // ------------------------------------------------------------------
    const renderTmIncidents = () => {
        if (!showDisruptions || !travelMidwestIncidents || !travelMidwestIncidents.length) return null;
        
        // Filter to only show full lane closures/blockages
        const closures = travelMidwestIncidents.filter(feature => {
            if (!feature || !feature.properties) return false;
            const props = feature.properties;
            const isFull = props.lanes === 'full';
            const isBlocked = (props.closure || '').toLowerCase().includes('blocked') || 
                             (props.closure || '').toLowerCase().includes('closed');
            return isFull || isBlocked;
        });
        
        return closures.map((feature, i) => {
            if (!feature || !feature.geometry) return null;
            let coords = null;
            if (feature.geometry.type === 'GeometryCollection' && feature.geometry.geometries) {
                const pointGeo = feature.geometry.geometries.find(g => g && g.type === 'Point');
                if (pointGeo) coords = pointGeo.coordinates;
            } else if (feature.geometry.coordinates) {
                coords = feature.geometry.coordinates;
            }
            if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
            
            const [lng, lat] = coords;
            if (lng === undefined || lat === undefined || lng === null || lat === null) return null;

            const props = feature.properties || {};
            const typeClass = props.desc || 'Incident';
            const locDesc = props.locDesc || 'Road Blockage / Incident';
            const closure = props.closure || '';
            const lanes = props.lanes || '';
            const src = props.src || '';
            const start = props.start || '';
            
            // Determine icon colour based on lane closure severity  
            const isFull = lanes === 'full';
            const bgColor = isFull ? '#ef4444' : '#f97316';
            
            return (
                <Marker
                    key={`tm-inc-${i}`}
                    position={[lat, lng]}
                    icon={L.divIcon({
                        className: '',
                        html: `<div style="
                            background: ${bgColor};
                            width: 28px; height: 28px;
                            border-radius: 50%;
                            border: 2.5px solid #fff;
                            display: flex; align-items: center; justify-content: center;
                            color: #fff; font-size: 14px; font-weight: bold;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.5), 0 0 12px ${bgColor}66;
                        ">⚠</div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14],
                    })}
                >
                    <Popup maxWidth={320}>
                        <div className="popup-content" style={{ minWidth: 220 }}>
                            <div style={{
                                background: bgColor, color: '#fff', padding: '4px 10px',
                                borderRadius: 4, fontWeight: 700, fontSize: '0.85rem',
                                marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                                <AlertTriangle size={14} /> {typeClass}
                            </div>
                            <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                                <div style={{ marginBottom: 4 }}>{locDesc}</div>
                                {closure && (
                                    <div style={{ color: '#f97316', fontWeight: 600, marginBottom: 2 }}>
                                        {closure}
                                    </div>
                                )}
                                {start && (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                        Started: {start}
                                    </div>
                                )}
                                {src && (
                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                                        Source: {src}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            );
        });
    };

    // ------------------------------------------------------------------
    // Travel Midwest Weather (point markers)
    // ------------------------------------------------------------------
    const renderTmWeather = () => {
        if (!showDisruptions || !travelMidwestWeather || !travelMidwestWeather.length) return null;
        
        return travelMidwestWeather.map((feature, i) => {
            if (!feature || !feature.geometry) return null;
            let coords = null;
            if (feature.geometry.type === 'GeometryCollection' && feature.geometry.geometries) {
                const pointGeo = feature.geometry.geometries.find(g => g && g.type === 'Point');
                if (pointGeo) coords = pointGeo.coordinates;
            } else if (feature.geometry.coordinates) {
                coords = feature.geometry.coordinates;
            }
            if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
            
            const [lng, lat] = coords;
            const props = feature.properties || {};
            const typeClass = props.name || props.desc || 'Weather Alert';
            const desc = props.description || props.locDesc || 'Weather condition';
            
            return (
                <Marker
                    key={`tm-weather-${i}`}
                    position={[lat, lng]}
                    icon={L.divIcon({
                        className: '',
                        html: `<div style="
                            background: linear-gradient(135deg, #0ea5e9, #3b82f6);
                            width: 28px; height: 28px;
                            border-radius: 50%;
                            border: 2.5px solid #fff;
                            display: flex; align-items: center; justify-content: center;
                            color: #fff; font-size: 14px;
                            box-shadow: 0 2px 8px rgba(0,0,0,0.5), 0 0 12px #0ea5e966;
                        ">❄</div>`,
                        iconSize: [28, 28],
                        iconAnchor: [14, 14],
                    })}
                >
                    <Popup>
                        <div className="popup-content" style={{ minWidth: 200 }}>
                            <div style={{
                                background: 'linear-gradient(135deg, #0ea5e9, #3b82f6)',
                                color: '#fff', padding: '4px 10px',
                                borderRadius: 4, fontWeight: 700, fontSize: '0.85rem',
                                marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                                <CloudSnow size={14} /> {typeClass}
                            </div>
                            <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                                {desc}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                                Source: Travel Midwest Weather
                            </div>
                        </div>
                    </Popup>
                </Marker>
            );
        });
    };

    // ------------------------------------------------------------------
    // Travel Midwest Construction (point markers)
    // ------------------------------------------------------------------
    const renderTmConstruction = () => {
        if (!showDisruptions || !travelMidwestConstruction || !travelMidwestConstruction.length) return null;
        
        return travelMidwestConstruction.map((feature, i) => {
            if (!feature || !feature.geometry) return null;
            let coords = null;
            if (feature.geometry.type === 'GeometryCollection' && feature.geometry.geometries) {
                const pointGeo = feature.geometry.geometries.find(g => g && g.type === 'Point');
                if (pointGeo) coords = pointGeo.coordinates;
            } else if (feature.geometry.coordinates) {
                coords = feature.geometry.coordinates;
            }
            if (!coords || !Array.isArray(coords) || coords.length < 2) return null;
            
            const [lng, lat] = coords;
            const props = feature.properties || {};
            const desc = props.desc || 'Road Construction';
            const loc = props.locDesc || '';
            const sev = props.sev || 'Medium';
            const closure = props.closure || '';
            const time = props.time || '';
            const dur = props.dur || '';
            const src = props.src || '';

            const sevColor = sev === 'High' ? '#ef4444' : sev === 'Low' ? '#eab308' : '#f97316';
            
            return (
                <Marker
                    key={`tm-const-${i}`}
                    position={[lat, lng]}
                    icon={L.divIcon({
                        className: '',
                        html: `<div style="
                            background: ${sevColor};
                            width: 26px; height: 26px;
                            border-radius: 50%;
                            border: 2.5px solid #fff;
                            display: flex; align-items: center; justify-content: center;
                            color: #fff; font-size: 13px;
                            box-shadow: 0 2px 6px rgba(0,0,0,0.5), 0 0 10px ${sevColor}55;
                        ">🚧</div>`,
                        iconSize: [26, 26],
                        iconAnchor: [13, 13],
                    })}
                >
                    <Popup maxWidth={360}>
                        <div className="popup-content" style={{ minWidth: 240, maxWidth: 340 }}>
                            <div style={{
                                background: sevColor, color: '#fff', padding: '4px 10px',
                                borderRadius: 4, fontWeight: 700, fontSize: '0.85rem',
                                marginBottom: 8, display: 'inline-flex', alignItems: 'center', gap: '4px'
                            }}>
                                <AlertTriangle size={14} /> Construction – {sev}
                            </div>
                            <div style={{ fontSize: '0.82rem', lineHeight: 1.5 }}>
                                <div style={{ fontWeight: 600, marginBottom: 4 }}>{desc}</div>
                                {loc && <div style={{ marginBottom: 4, color: '#cbd5e1' }}>{loc}</div>}
                                {closure && (
                                    <div style={{ color: '#f97316', fontWeight: 600, marginBottom: 2 }}>
                                        {closure}
                                    </div>
                                )}
                                {time && (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8', display: 'flex', alignItems: 'center', gap: '4px' }}>
                                        <Calendar size={12} /> {time}
                                    </div>
                                )}
                                {dur && (
                                    <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
                                        Duration: {dur}
                                    </div>
                                )}
                                {src && (
                                    <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: 4 }}>
                                        Source: {src}
                                    </div>
                                )}
                            </div>
                        </div>
                    </Popup>
                </Marker>
            );
        });
    };

    useEffect(() => {
        if (selectedLocation) {
            setFlyTarget({ center: [selectedLocation.latitude, selectedLocation.longitude], zoom: 14 });
        }
    }, [selectedLocation]);

    // Summary counts for the status bar
    const tmStats = useMemo(() => {
        let free = 0, light = 0, moderate = 0, heavy = 0;
        tmLineObjects.forEach(l => {
            if (l.cng === 'H') heavy++;
            else if (l.cng === 'M') moderate++;
            else if (l.cng === 'L') light++;
            else free++;
        });
        return { free, light, moderate, heavy, total: tmLineObjects.length };
    }, [tmLineObjects]);

    // ------------------------------------------------------------------
    // Build facility status lookup map (osm_id -> status info)
    // ------------------------------------------------------------------
    const facilityStatusMap = useMemo(() => {
        const map = {};
        if (facilityStatus && facilityStatus.length > 0) {
            facilityStatus.forEach(f => {
                if (f.osm_id) map[f.osm_id] = f;
                // Also index by lat/lng for fallback matching
                const key = `${f.latitude?.toFixed(5)},${f.longitude?.toFixed(5)}`;
                map[key] = f;
            });
        }
        return map;
    }, [facilityStatus]);

    // Status badge colors
    const STATUS_COLORS = {
        OPEN: '#22c55e',
        CLOSED: '#ef4444',
        IMPACTED: '#f97316',
        AT_RISK: '#eab308',
        UNKNOWN: '#64748b',
    };

    const STATUS_ICONS = {
        OPEN: '✓',
        CLOSED: '✕',
        IMPACTED: '⚠',
        AT_RISK: '!',
        UNKNOWN: '?',
    };

    // Create a status-aware icon for a facility
    const createFacilityStatusIcon = (loc, statusInfo) => {
        const baseType = loc.type || 'grocery';
        const status = statusInfo?.status || 'UNKNOWN';
        const color = STATUS_COLORS[status] || STATUS_COLORS.UNKNOWN;
        const statusIcon = STATUS_ICONS[status] || '?';
        const hasStatus = !!statusInfo;

        let baseSvgName = 'grocery';
        if (baseType === 'fuel_station') baseSvgName = 'fuel_station';
        if (baseType === 'hospital') baseSvgName = 'hospital';
        if (baseType === 'pharmacy') baseSvgName = 'pharmacy';
        
        let rawSvg = '';
        if (baseType === 'fuel_station') rawSvg = GAS_STATION_SVG;
        else if (baseType === 'grocery') rawSvg = GROCERY_SVG;
        else if (baseType === 'hospital' || baseType === 'pharmacy') rawSvg = HOSPITAL_SVG;
        else rawSvg = GROCERY_SVG;

        const glowColor = status === 'CLOSED' ? 'rgba(239,68,68,0.6)' :
                          status === 'IMPACTED' ? 'rgba(249,115,22,0.5)' :
                          status === 'AT_RISK' ? 'rgba(234,179,8,0.4)' : 'none';
        
        const pulse = (status === 'CLOSED' || status === 'IMPACTED') ? 
            'animation: facility-pulse 2s ease-in-out infinite;' : '';

        return L.divIcon({
            className: '',
            html: `<div style="
                position:relative;width:24px;height:24px;
                display:flex;align-items:center;justify-content:center;
                ${pulse}
            ">
                <div style="width:24px;height:24px;box-shadow:0 2px 8px rgba(0,0,0,0.5)${glowColor !== 'none' ? `, 0 0 14px ${glowColor}` : ''};border-radius:50%;">
                    ${rawSvg}
                </div>
                ${hasStatus && status !== 'OPEN' ? `
                <div style="
                    position:absolute;bottom:-4px;right:-4px;
                    width:12px;height:12px;border-radius:50%;
                    background:${color};border:1.5px solid #fff;
                    display:flex;align-items:center;justify-content:center;
                    font-size:8px;font-weight:bold;color:#fff;
                    box-shadow:0 1px 4px rgba(0,0,0,0.4);
                ">${statusIcon}</div>` : ''}
            </div>
            <style>
                @keyframes facility-pulse { 
                    0%,100%{transform:scale(1);} 
                    50%{transform:scale(1.15);} 
                }
            </style>`,
            iconSize: [24, 24],
            iconAnchor: [12, 12],
            popupAnchor: [0, -12],
        });
    };

    return (
        <div className="map-container">
            {/* Traffic unavailable notice when TravelMidwest is down */}
            {showTraffic && !isSimulationTab && tmLineObjects.length === 0 && (
                <div className="tm-unavailable-bar">
                    <span style={{ fontSize: '0.9rem' }}>⚠</span>
                    Live traffic lines unavailable (TravelMidwest offline) —
                    {trafficData.length > 0
                        ? ` showing ${trafficData.length} Chicago SODA congestion points as fallback`
                        : ' no fallback data available'}
                </div>
            )}
            {/* Live Traffic Status Bar */}
            {tmStats.total > 0 && (
                <div className="tm-status-bar">
                    <div className="tm-status-item">
                        <span className="tm-status-dot" style={{ background: '#00cc00' }} />
                        <span className="tm-status-label">Free Flow</span>
                        <span className="tm-status-count">{tmStats.free}</span>
                    </div>
                    <div className="tm-status-item">
                        <span className="tm-status-dot" style={{ background: '#cccc00' }} />
                        <span className="tm-status-label">Moderate</span>
                        <span className="tm-status-count">{tmStats.moderate}</span>
                    </div>
                    <div className="tm-status-item">
                        <span className="tm-status-dot" style={{ background: '#cc0000' }} />
                        <span className="tm-status-label">Heavy</span>
                        <span className="tm-status-count">{tmStats.heavy}</span>
                    </div>
                    <div className="tm-status-item">
                        <span className="tm-status-dot" style={{ background: '#f97316' }} />
                        <span className="tm-status-label">Incidents</span>
                        <span className="tm-status-count">{travelMidwestIncidents?.length || 0}</span>
                    </div>
                    <div className="tm-status-item">
                        <span className="tm-status-dot" style={{ background: '#f97316' }} />
                        <span className="tm-status-label">Construction</span>
                        <span className="tm-status-count">{travelMidwestConstruction?.length || 0}</span>
                    </div>
                </div>
            )}

            <MapContainer center={[41.8781, -87.6298]} zoom={11} className="chicago-map" zoomControl={true} preferCanvas={true}>
                <MapResizer />
                <MapZoomListener onZoom={setCurrentZoom} />
                {/* Dark Tile Layer – optimized for performance */}
                <TileLayer
                    attribution='&copy; <a href="https://carto.com/">CARTO</a>'
                    url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
                    maxZoom={20}
                    maxNativeZoom={18}
                    updateWhenZooming={false}
                    updateWhenIdle={true}
                />
                {flyTarget && <FlyToLocation center={flyTarget.center} zoom={flyTarget.zoom} />}

                {/* ── Native traffic congestion paths (Chicago SODA fallback) ── */}
                {!isSimulationTab && showTraffic && tmLineObjects.length === 0 && trafficData.map((seg, i) => {
                    if (!seg.latitude || !seg.longitude) return null;
                    const cLevel = seg.congestion_level;
                    const color = cLevel === 'severe' ? '#ef4444' : cLevel === 'high' ? '#fb923c' : cLevel === 'medium' ? '#fbbf24' : '#22c55e';
                    return (
                        <CircleMarker key={`t-${i}`} center={[seg.latitude, seg.longitude]} radius={5}
                            fillColor={color} fillOpacity={0.85} color={color} weight={1} opacity={0.5}
                            className="canvas-street-dot">
                            <Popup>
                                <div className="popup-content">
                                    <strong>{seg.street || 'Segment'}</strong><br />
                                    Speed: {seg.current_speed?.toFixed(1)} mph<br />
                                    Congestion: <b>{seg.congestion_level?.toUpperCase()}</b>
                                </div>
                            </Popup>
                        </CircleMarker>
                    );
                })}

                {/* ── Travel Midwest Traffic Lines (congestion polylines) ── */}
                {renderTmLines()}

                {/* ── Travel Midwest Incidents ── */}
                {!isSimulationTab && renderTmIncidents()}

                {/* ── Travel Midwest Weather ── */}
                {!isSimulationTab && renderTmWeather()}

                {/* ── Travel Midwest Construction ── */}
                {!isSimulationTab && renderTmConstruction()}

                {/* ── Emergency Vehicle Simulation Overlay ── */}
                {isSimulationTab && (
                    <SimulationOverlay
                        scenario={simConfig?.scenario || null}
                        vehicles={simConfig?.vehicles || []}
                        running={simConfig?.running || false}
                        onPhaseChange={simConfig?.onPhaseChange}
                        tmLines={tmLineObjects}
                    />
                )}

                {/* ── Infrastructure markers with Facility Status ── */}
                {!isSimulationTab && showInfrastructure && currentZoom >= 10 && infrastructure.map((loc, i) => {
                    if (!loc.latitude || !loc.longitude) return null;
                    
                    // Look up status
                    const statusInfo = facilityStatusMap[loc.osm_id] || 
                        facilityStatusMap[`${loc.latitude?.toFixed(5)},${loc.longitude?.toFixed(5)}`];
                    
                    const useStatusIcon = facilityStatus.length > 0;
                    const icon = useStatusIcon 
                        ? createFacilityStatusIcon(loc, statusInfo)
                        : (ICONS[loc.type] || ICONS.grocery);
                    
                    return (
                        <Marker key={`i-${i}`} position={[loc.latitude, loc.longitude]}
                            icon={icon}
                            eventHandlers={{ click: () => onLocationClick(loc) }}>
                            <Popup maxWidth={340}>
                                <div className="popup-content" style={{ minWidth: 220 }}>
                                    {/* Status Header */}
                                    {statusInfo && (
                                        <div style={{
                                            background: STATUS_COLORS[statusInfo.status] || '#64748b',
                                            color: '#fff',
                                            padding: '5px 10px',
                                            borderRadius: 6,
                                            fontWeight: 700,
                                            fontSize: '0.85rem',
                                            marginBottom: 8,
                                            display: 'flex',
                                            alignItems: 'center',
                                            gap: 6,
                                        }}>
                                            <span style={{ fontSize: '1rem' }}>
                                                {STATUS_ICONS[statusInfo.status]}
                                            </span>
                                            {statusInfo.status === 'OPEN' && 'OPEN — Operating Normally'}
                                            {statusInfo.status === 'CLOSED' && 'CLOSED'}
                                            {statusInfo.status === 'IMPACTED' && 'IMPACTED'}
                                            {statusInfo.status === 'AT_RISK' && 'AT RISK'}
                                            {statusInfo.status === 'UNKNOWN' && 'STATUS UNKNOWN'}
                                        </div>
                                    )}
                                    
                                    <strong style={{ fontSize: '0.95rem' }}>{loc.name}</strong><br />
                                    <span style={{ color: '#64748b', fontSize: '0.8rem', textTransform: 'capitalize' }}>
                                        {loc.type?.replace('_', ' ')}
                                    </span>
                                    
                                    {loc.address && <><br /><span style={{ fontSize: '0.75rem' }}>{loc.address}</span></>}
                                    {loc.brand && <><br /><span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Brand: {loc.brand}</span></>}
                                    
                                    {/* Status reason */}
                                    {statusInfo && statusInfo.status_reason && (
                                        <div style={{
                                            marginTop: 8,
                                            padding: '6px 8px',
                                            background: 'rgba(0,0,0,0.15)',
                                            borderRadius: 4,
                                            fontSize: '0.78rem',
                                            borderLeft: `3px solid ${STATUS_COLORS[statusInfo.status]}`,
                                        }}>
                                            {statusInfo.status_reason}
                                        </div>
                                    )}
                                    
                                    {/* Impact details */}
                                    {statusInfo?.primary_impact && (
                                        <div style={{ marginTop: 6, fontSize: '0.75rem', color: '#f97316' }}>
                                            ⚠ {statusInfo.primary_impact.reason}
                                            <br />
                                            <span style={{ color: '#94a3b8' }}>
                                                Source: {statusInfo.primary_impact.source} · 
                                                Severity: {Math.round(statusInfo.primary_impact.severity * 100)}%
                                            </span>
                                        </div>
                                    )}
                                    
                                    {/* Confidence */}
                                    {statusInfo && (
                                        <div style={{
                                            marginTop: 6,
                                            fontSize: '0.72rem',
                                            color: '#64748b',
                                            fontFamily: "'JetBrains Mono', monospace",
                                            display: 'flex',
                                            justifyContent: 'space-between',
                                        }}>
                                            <span>Confidence: {Math.round(statusInfo.confidence * 100)}%</span>
                                            <span>{statusInfo.impact_count} signal{statusInfo.impact_count !== 1 ? 's' : ''}</span>
                                        </div>
                                    )}
                                    
                                    {/* Opening hours */}
                                    {statusInfo?.opening_hours?.schedule && (
                                        <div style={{ marginTop: 4, fontSize: '0.72rem', color: '#94a3b8' }}>
                                            🕐 {statusInfo.opening_hours.schedule}
                                        </div>
                                    )}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}

                {/* ── Disruption markers – ONLY road blockages and critical/high severity ── */}
                {!isSimulationTab && showDisruptions && disruptions.map((d, i) => {
                    const sev = d.severity_label || 'medium';
                    const isRoadBlockage = d.disruption_type === 'road_blocked' || d.disruption_type === 'road_closure';
                    const isCriticalOrHigh = sev === 'critical' || sev === 'high';
                    // Only show road blockages or critical/high severity disasters
                    const shouldShow = isRoadBlockage || isCriticalOrHigh;
                    
                    return shouldShow && d.latitude && d.longitude && (
                        <Marker key={`d-${i}`} position={[d.latitude, d.longitude]}
                            icon={ICONS[`disruption_${sev}`] || ICONS.disruption_medium}
                            eventHandlers={{ click: () => onLocationClick(d) }}>
                            <Popup maxWidth={280}>
                                <div className="popup-content disruption-popup">
                                    <div className={`severity-badge severity-${sev}`}>{sev.toUpperCase()}</div>
                                    <strong>{d.location_name}</strong><br />
                                    <span style={{ color: '#64748b' }}>{d.disruption_type?.replace(/_/g, ' ')}</span><br />
                                    <span style={{ fontFamily: 'monospace', fontSize: '0.78rem' }}>
                                        Severity: {(d.severity_score * 100).toFixed(0)}%  •  Confidence: {(d.confidence * 100).toFixed(0)}%
                                    </span>
                                    {d.description && <p className="disruption-desc">{d.description}</p>}
                                </div>
                            </Popup>
                        </Marker>
                    );
                })}
            </MapContainer>

            {/* ── Map Legend ── */}
            <div className="map-legend">
                <h4>Legend</h4>

                <div className="legend-section">
                    <span className="legend-title">Traffic (Live)</span>
                    {[
                        ['#00cc00', 'Free Flow'],
                        ['#cccc00', 'Moderate'],
                        ['#cc0000', 'Heavy / Blocked'],
                    ].map(([color, label]) => (
                        <div className="legend-item" key={label}>
                            <span className="legend-line" style={{ background: color }} />
                            {label}
                        </div>
                    ))}
                </div>

                <div className="legend-section">
                    <span className="legend-title">Congestion</span>
                    {['low', 'medium', 'high', 'severe'].map(level => (
                        <div className="legend-item" key={level}>
                            <span className="legend-dot" style={{ background: CONGESTION_COLORS[level]?.replace(/[\d.]+\)$/, '1)') }} />
                            {level.charAt(0).toUpperCase() + level.slice(1)}
                        </div>
                    ))}
                </div>

                <div className="legend-section">
                    <span className="legend-title">Markers</span>
                    <div className="legend-item">
                        <span style={{ fontSize: '1.1rem' }}>⚠</span>
                        Incident
                    </div>
                    <div className="legend-item">
                        <span style={{ fontSize: '1.1rem' }}>🚧</span>
                        Construction
                    </div>
                    <div className="legend-item">
                        <span style={{ fontSize: '1.1rem' }}>❄</span>
                        Weather Alert
                    </div>
                </div>

                <div className="legend-section">
                    <span className="legend-title">Facilities</span>
                    <div className="legend-item">
                        <span className="legend-svg-icon" style={{ width: 26, height: 26 }} dangerouslySetInnerHTML={{ __html: GAS_STATION_SVG }} />
                        Gas Station
                    </div>
                    <div className="legend-item">
                        <span className="legend-svg-icon" style={{ width: 26, height: 26 }} dangerouslySetInnerHTML={{ __html: GROCERY_SVG }} />
                        Grocery Store
                    </div>
                    <div className="legend-item">
                        <span className="legend-svg-icon" style={{ width: 26, height: 26 }} dangerouslySetInnerHTML={{ __html: HOSPITAL_SVG }} />
                        Hospital / Clinic
                    </div>
                </div>

                {facilityStatus.length > 0 && (
                    <div className="legend-section">
                        <span className="legend-title">Facility Status</span>
                        {[
                            ['#22c55e', '✓ Open'],
                            ['#ef4444', '✕ Closed'],
                            ['#f97316', '⚠ Impacted'],
                            ['#eab308', '! At Risk'],
                            ['#64748b', '? Unknown'],
                        ].map(([color, label]) => (
                            <div className="legend-item" key={label}>
                                <span className="legend-dot" style={{ background: color }} />
                                {label}
                            </div>
                        ))}
                    </div>
                )}

                <div className="legend-section">
                    <span className="legend-title">Disruptions</span>
                    {[
                        ['#f43f5e', 'Critical'],
                        ['#fb923c', 'High'],
                        ['#fbbf24', 'Medium'],
                        ['#34d399', 'Low'],
                    ].map(([color, label]) => (
                        <div className="legend-item" key={label}>
                            <span className="legend-dot" style={{ background: color }} />
                            {label}
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
