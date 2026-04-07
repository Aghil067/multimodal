import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Circle, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';

const SCENARIOS = {
  flood: {
    id: 'flood',
    label: 'Flood',
    color: '#38bdf8',
    description: 'Flood water overtops riverfront streets. Vehicles reroute around the inundated zone and stay on open roads.',
    origin: { lat: 41.897, lng: -87.6298, label: 'Lincoln Park Hospital' },
    destination: { lat: 41.8627, lng: -87.6166, label: 'Mercy Hospital' },
    hazardCenter: [41.8787, -87.6218],
    hazardRadius: 520,
    probe: [41.8789, -87.621],
    zoom: 13,
  },
  tornado: {
    id: 'tornado',
    label: 'Tornado',
    color: '#a78bfa',
    description: 'Debris and overturned vehicles close a major corridor. Traffic is forced to use nearby alternate streets.',
    origin: { lat: 41.881, lng: -87.72, label: 'West Side Emergency Station' },
    destination: { lat: 41.856, lng: -87.65, label: 'Cook County Hospital' },
    hazardCenter: [41.8712, -87.6895],
    hazardRadius: 650,
    probe: [41.871, -87.689],
    zoom: 12,
  },
  fire: {
    id: 'fire',
    label: 'Fire',
    color: '#fb7185',
    description: 'A structure fire closes key downtown blocks. Emergency units divert around the response perimeter.',
    origin: { lat: 41.898, lng: -87.662, label: 'Northwestern Memorial' },
    destination: { lat: 41.878, lng: -87.63, label: 'Rush Medical Center' },
    hazardCenter: [41.8841, -87.6441],
    hazardRadius: 420,
    probe: [41.8845, -87.6442],
    zoom: 13,
  },
  earthquake: {
    id: 'earthquake',
    label: 'Collapse',
    color: '#fb923c',
    description: 'A building collapse blocks the corridor. Vehicles avoid the impact zone and rejoin the fastest open route.',
    origin: { lat: 41.887, lng: -87.628, label: 'Grant Hospital' },
    destination: { lat: 41.863, lng: -87.627, label: 'Cermak Medical Center' },
    hazardCenter: [41.8728, -87.6242],
    hazardRadius: 410,
    probe: [41.873, -87.624],
    zoom: 13,
  },
};

const VEHICLE_TYPES = {
  ambulance: {
    label: 'Ambulance',
    icon: 'A',
    color: '#f43f5e',
    speed: 1.2,
    iconSize: [18, 34],
    iconAnchor: [9, 17],
    svgHtml: () => `
      <div style="width:18px;height:34px;position:relative;display:flex;align-items:center;justify-content:center;">
        <div style="position:absolute;top:-10px;left:50%;transform:translateX(-50%);width:0;height:0;border-left:10px solid transparent;border-right:10px solid transparent;border-bottom:18px solid rgba(255,255,255,0.18);"></div>
        <div style="width:12px;height:24px;background:#fff;border-radius:3px;box-shadow:0 1px 5px rgba(0,0,0,0.55);position:relative;overflow:hidden;border:1px solid rgba(0,0,0,0.35);">
          <div style="position:absolute;top:1px;left:1px;width:4px;height:3px;background:#2563eb;animation: sim-flash-blue .35s infinite;"></div>
          <div style="position:absolute;top:1px;right:1px;width:4px;height:3px;background:#ef4444;animation: sim-flash-red .35s infinite;"></div>
          <div style="position:absolute;top:9px;left:5px;width:2px;height:8px;background:#ef4444;"></div>
          <div style="position:absolute;top:12px;left:2px;width:8px;height:2px;background:#ef4444;"></div>
        </div>
      </div>
    `,
  },
  fire_truck: {
    label: 'Fire Truck',
    icon: 'F',
    color: '#fb923c',
    speed: 0.9,
    iconSize: [16, 32],
    iconAnchor: [8, 16],
    svgHtml: () => `
      <div style="width:16px;height:32px;display:flex;align-items:center;justify-content:center;">
        <div style="width:12px;height:24px;background:#dc2626;border-radius:3px;box-shadow:0 1px 5px rgba(0,0,0,0.55);position:relative;border:1px solid rgba(0,0,0,0.35);">
          <div style="position:absolute;top:2px;left:2px;width:8px;height:4px;background:rgba(0,0,0,0.28);border-radius:1px;"></div>
          <div style="position:absolute;top:0;left:2px;width:8px;height:2px;background:#ef4444;animation: sim-flash-red .45s infinite;"></div>
        </div>
      </div>
    `,
  },
  police: {
    label: 'Police',
    icon: 'P',
    color: '#3b82f6',
    speed: 1.05,
    iconSize: [14, 28],
    iconAnchor: [7, 14],
    svgHtml: () => `
      <div style="width:14px;height:28px;display:flex;align-items:center;justify-content:center;">
        <div style="width:10px;height:20px;background:#0f172a;border-radius:3px;box-shadow:0 1px 5px rgba(0,0,0,0.55);position:relative;border:1px solid #1e293b;">
          <div style="position:absolute;top:2px;left:1px;width:8px;height:3px;background:rgba(255,255,255,0.18);"></div>
          <div style="position:absolute;top:0;left:1px;width:8px;height:2px;background:#3b82f6;animation: sim-flash-blue .35s infinite;"></div>
        </div>
      </div>
    `,
  },
  supply: {
    label: 'Supply Truck',
    icon: 'S',
    color: '#34d399',
    speed: 0.8,
    iconSize: [16, 34],
    iconAnchor: [8, 17],
    svgHtml: () => `
      <div style="width:16px;height:34px;display:flex;align-items:center;justify-content:center;">
        <div style="width:12px;height:26px;background:#166534;border-radius:3px;box-shadow:0 1px 5px rgba(0,0,0,0.55);position:relative;border:1px solid rgba(0,0,0,0.35);">
          <div style="position:absolute;top:2px;left:1px;width:10px;height:5px;background:rgba(0,0,0,0.28);border-radius:1px;"></div>
          <div style="position:absolute;bottom:3px;left:1px;width:10px;height:13px;background:rgba(255,255,255,0.9);border-radius:1px;"></div>
        </div>
      </div>
    `,
  },
  civilian_car: {
    label: 'Car',
    icon: 'C',
    color: '#94a3b8',
    speed: 0.78,
    iconSize: [12, 24],
    iconAnchor: [6, 12],
    svgHtml: (color, variant = 0) => {
      const palette = ['#cbd5e1', '#334155', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
      const body = palette[variant % palette.length] || color;
      return `
        <div style="width:12px;height:24px;display:flex;align-items:center;justify-content:center;">
          <div style="width:8px;height:16px;background:${body};border-radius:3px;box-shadow:0 1px 4px rgba(0,0,0,0.5);position:relative;">
            <div style="position:absolute;top:3px;left:1px;width:6px;height:3px;background:rgba(0,0,0,0.45);border-radius:1px;"></div>
            <div style="position:absolute;bottom:3px;left:1px;width:6px;height:3px;background:rgba(0,0,0,0.45);border-radius:1px;"></div>
          </div>
        </div>
      `;
    },
  },
};

const AMBIENT_VEHICLE_LIMIT = 42;
const NODE_PRECISION = 5;
const BASE_SPEED_MPS = 14;
let trafficLightCache = { nodes: [], stamp: 0 };

function toRad(value) {
  return (value * Math.PI) / 180;
}

function distanceMeters(a, b) {
  const lat1 = a[0];
  const lng1 = a[1];
  const lat2 = b[0];
  const lng2 = b[1];
  const r = 6371000;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const x =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
  return 2 * r * Math.atan2(Math.sqrt(x), Math.sqrt(1 - x));
}

function interpolate(a, b, t) {
  return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
}

function coordKey(point) {
  return `${point[0].toFixed(NODE_PRECISION)},${point[1].toFixed(NODE_PRECISION)}`;
}

function createVehicleIcon(vehicleType, variant = 0, opacity = 1) {
  const def = VEHICLE_TYPES[vehicleType] || VEHICLE_TYPES.civilian_car;
  return L.divIcon({
    className: '',
    html: `
      <div class="sim-vehicle-icon" style="position:absolute;left:0;top:0;width:100%;height:100%;display:flex;align-items:center;justify-content:center;transform-origin:center center;opacity:${opacity};">
        ${def.svgHtml(def.color, variant)}
      </div>
    `,
    iconSize: def.iconSize,
    iconAnchor: def.iconAnchor,
  });
}

function polylineLength(path) {
  if (!path || path.length < 2) return 0;
  let total = 0;
  for (let i = 1; i < path.length; i += 1) {
    total += distanceMeters(path[i - 1], path[i]);
  }
  return total;
}

function getPointAtDistance(path, distance) {
  if (!path || path.length === 0) return null;
  if (path.length === 1) return path[0];
  let remaining = Math.max(0, distance);
  for (let i = 1; i < path.length; i += 1) {
    const segmentLength = distanceMeters(path[i - 1], path[i]);
    if (remaining <= segmentLength) {
      const ratio = segmentLength === 0 ? 0 : remaining / segmentLength;
      return interpolate(path[i - 1], path[i], ratio);
    }
    remaining -= segmentLength;
  }
  return path[path.length - 1];
}

function getHeadingDegrees(current, next) {
  if (!current || !next) return 0;
  const lngCorrection = Math.cos((current[0] * Math.PI) / 180);
  const dy = next[0] - current[0];
  const dx = (next[1] - current[1]) * lngCorrection;
  return Math.atan2(dx, dy) * (180 / Math.PI);
}

function getPathSlice(path, progress) {
  if (!path || path.length < 2) return path || [];
  const clamped = Math.max(0, Math.min(progress, 1));
  const totalLength = polylineLength(path);
  const targetDistance = totalLength * clamped;
  if (targetDistance <= 0) return [path[0]];
  let traversed = 0;
  const slice = [path[0]];
  for (let i = 1; i < path.length; i += 1) {
    const segmentLength = distanceMeters(path[i - 1], path[i]);
    if (traversed + segmentLength < targetDistance) {
      slice.push(path[i]);
      traversed += segmentLength;
      continue;
    }
    const segmentDistance = Math.max(0, targetDistance - traversed);
    slice.push(getPointAtDistance([path[i - 1], path[i]], segmentDistance));
    break;
  }
  return slice;
}

function segmentNearHazard(a, b, center, radius) {
  const midpoint = interpolate(a, b, 0.5);
  return (
    distanceMeters(a, center) <= radius ||
    distanceMeters(b, center) <= radius ||
    distanceMeters(midpoint, center) <= radius
  );
}

function mergePaths(...paths) {
  const merged = [];
  paths.forEach((path) => {
    if (!path || path.length === 0) return;
    path.forEach((point, index) => {
      if (index === 0 && merged.length > 0) {
        const last = merged[merged.length - 1];
        if (coordKey(last) === coordKey(point)) return;
      }
      merged.push(point);
    });
  });
  return merged;
}

function pathTouchesHazard(path, center, radius) {
  if (!path || path.length < 2) return false;
  for (let i = 1; i < path.length; i += 1) {
    if (segmentNearHazard(path[i - 1], path[i], center, radius)) return true;
  }
  return false;
}

function forceGreenLights(position, enabled) {
  if (!enabled || !position) return;
  const now = Date.now();
  if (now - trafficLightCache.stamp > 1200 || !trafficLightCache.nodes.length) {
    trafficLightCache = {
      nodes: Array.from(document.querySelectorAll('.sim-traffic-light')),
      stamp: now,
    };
  }
  const trafficLights = trafficLightCache.nodes;
  for (let i = 0; i < trafficLights.length; i += 1) {
    const light = trafficLights[i];
    const lat = parseFloat(light.getAttribute('data-lat'));
    const lng = parseFloat(light.getAttribute('data-lng'));
    if (Number.isNaN(lat) || Number.isNaN(lng)) continue;
    const near = distanceMeters(position, [lat, lng]) < 160;
    if (near) light.classList.add('force-green');
    else light.classList.remove('force-green');
  }
}

function buildRoadNetwork(tmLines) {
  if (!tmLines || tmLines.length === 0) {
    return { nodes: {}, nodeIds: [], segments: [] };
  }

  const nodes = {};
  const segments = [];

  const ensureNode = (point) => {
    const id = coordKey(point);
    if (!nodes[id]) {
      nodes[id] = { id, point, neighbors: [] };
    }
    return nodes[id];
  };

  tmLines.forEach((line) => {
    const positions = line?.positions || [];
    for (let i = 1; i < positions.length; i += 1) {
      const a = positions[i - 1];
      const b = positions[i];
      const from = ensureNode(a);
      const to = ensureNode(b);
      const distance = distanceMeters(a, b);
      const congestionFactor = line.cng === 'H' ? 1.65 : line.cng === 'M' ? 1.3 : 1;
      from.neighbors.push({ id: to.id, distance, weight: distance * congestionFactor });
      to.neighbors.push({ id: from.id, distance, weight: distance * congestionFactor });
      segments.push({
        key: `${from.id}->${to.id}`,
        reverseKey: `${to.id}->${from.id}`,
        positions: [a, b],
        midpoint: interpolate(a, b, 0.5),
        cng: line.cng || 'N',
      });
    }
  });

  return {
    nodes,
    nodeIds: Object.keys(nodes),
    segments,
  };
}

function findNearestNode(point, network) {
  if (!point || !network?.nodeIds?.length) return null;
  let bestNode = null;
  let bestDistance = Infinity;
  for (let i = 0; i < network.nodeIds.length; i += 1) {
    const node = network.nodes[network.nodeIds[i]];
    const candidateDistance = distanceMeters(point, node.point);
    if (candidateDistance < bestDistance) {
      bestDistance = candidateDistance;
      bestNode = node;
    }
  }
  return bestNode;
}

function findRoute(network, startPoint, endPoint, options = {}) {
  const startNode = findNearestNode(startPoint, network);
  const endNode = findNearestNode(endPoint, network);
  if (!startNode || !endNode) return [];

  const blockedEdgeKeys = options.blockedEdgeKeys || new Set();
  const open = [startNode.id];
  const cameFrom = {};
  const gScore = { [startNode.id]: 0 };
  const fScore = {
    [startNode.id]: distanceMeters(startNode.point, endNode.point),
  };
  const visited = new Set();

  while (open.length > 0) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      if ((fScore[open[i]] ?? Infinity) < (fScore[open[bestIndex]] ?? Infinity)) {
        bestIndex = i;
      }
    }

    const currentId = open.splice(bestIndex, 1)[0];
    if (currentId === endNode.id) {
      const pathIds = [currentId];
      let walker = currentId;
      while (cameFrom[walker]) {
        walker = cameFrom[walker];
        pathIds.unshift(walker);
      }
      return pathIds.map((id) => network.nodes[id].point);
    }

    visited.add(currentId);
    const currentNode = network.nodes[currentId];
    currentNode.neighbors.forEach((neighbor) => {
      const edgeKey = `${currentId}->${neighbor.id}`;
      if (blockedEdgeKeys.has(edgeKey)) return;
      if (visited.has(neighbor.id)) return;

      const tentativeG = (gScore[currentId] ?? Infinity) + neighbor.weight;
      if (tentativeG < (gScore[neighbor.id] ?? Infinity)) {
        cameFrom[neighbor.id] = currentId;
        gScore[neighbor.id] = tentativeG;
        fScore[neighbor.id] = tentativeG + distanceMeters(network.nodes[neighbor.id].point, endNode.point);
        if (!open.includes(neighbor.id)) open.push(neighbor.id);
      }
    });
  }

  return [];
}

function buildScenarioRuntime(config, network) {
  if (!config || !network?.nodeIds?.length) return null;

  const blockedSegments = network.segments.filter((segment) =>
    segmentNearHazard(segment.positions[0], segment.positions[1], config.hazardCenter, config.hazardRadius),
  );

  const blockedEdgeKeys = new Set();
  blockedSegments.forEach((segment) => {
    blockedEdgeKeys.add(segment.key);
    blockedEdgeKeys.add(segment.reverseKey);
  });

  const origin = [config.origin.lat, config.origin.lng];
  const destination = [config.destination.lat, config.destination.lng];
  const snappedOrigin = findNearestNode(origin, network)?.point || origin;
  const snappedDestination = findNearestNode(destination, network)?.point || destination;
  const snappedProbe = config.probe ? findNearestNode(config.probe, network)?.point || config.probe : null;
  const blockedAttempt = snappedProbe
    ? mergePaths(
        findRoute(network, snappedOrigin, snappedProbe),
        findRoute(network, snappedProbe, snappedDestination).slice(1),
      )
    : findRoute(network, snappedOrigin, snappedDestination);
  const rerouted = findRoute(network, snappedOrigin, snappedDestination, { blockedEdgeKeys });
  const fallback = [snappedOrigin, snappedDestination];

  return {
    ...config,
    originPoint: origin,
    destinationPoint: destination,
    blockedSegments,
    blockedEdgeKeys,
    blockedRouteAttempt: blockedAttempt.length >= 2 ? blockedAttempt : fallback,
    alternativeRoute: rerouted.length >= 2 ? rerouted : fallback,
    snappedOrigin,
    snappedDestination,
  };
}

function buildRandomRoute(network, scenarioRuntime, seed = 0) {
  if (!network?.nodeIds?.length) return [];
  for (let attempt = 0; attempt < 18; attempt += 1) {
    const startIndex = Math.floor(Math.random() * network.nodeIds.length);
    const endIndex = Math.floor(Math.random() * network.nodeIds.length);
    if (startIndex === endIndex) continue;
    const start = network.nodes[network.nodeIds[startIndex]].point;
    const end = network.nodes[network.nodeIds[endIndex]].point;
    const route = findRoute(network, start, end, {
      blockedEdgeKeys: scenarioRuntime?.blockedEdgeKeys || new Set(),
    });
    if (route.length < 2) continue;
    if (
      scenarioRuntime &&
      pathTouchesHazard(route, scenarioRuntime.hazardCenter, scenarioRuntime.hazardRadius * 0.95)
    ) {
      continue;
    }
    return route;
  }

  const fallbackNode = network.nodes[network.nodeIds[seed % network.nodeIds.length]];
  return [fallbackNode.point, fallbackNode.point];
}

function FlyToScenario({ center, zoom }) {
  const map = useMap();
  useEffect(() => {
    if (center) {
      map.flyTo(center, zoom, { duration: 1.2 });
    }
  }, [center, map, zoom]);
  return null;
}

function createRouteData(points) {
  if (!points || points.length < 2) return null;
  const segmentLengths = [];
  let totalLength = 0;
  for (let i = 1; i < points.length; i += 1) {
    const length = distanceMeters(points[i - 1], points[i]);
    segmentLengths.push(length);
    totalLength += length;
  }
  return { points, segmentLengths, totalLength };
}

function getPointOnRoute(routeData, index, progress) {
  const from = routeData.points[index];
  const to = routeData.points[Math.min(index + 1, routeData.points.length - 1)];
  return interpolate(from, to, progress);
}

function pointRouteDistance(point, routeData) {
  if (!routeData) return Infinity;
  let best = Infinity;
  for (let i = 0; i < routeData.points.length; i += 1) {
    const d = distanceMeters(point, routeData.points[i]);
    if (d < best) best = d;
  }
  return best;
}

function remainingRouteTouchesHazard(vehicle, scenarioRuntime) {
  if (!scenarioRuntime || !vehicle.routeData) return false;
  const remainingPoints = [vehicle.position];
  for (let i = vehicle.segmentIndex + 1; i < vehicle.routeData.points.length; i += 1) {
    remainingPoints.push(vehicle.routeData.points[i]);
  }
  return pathTouchesHazard(remainingPoints, scenarioRuntime.hazardCenter, scenarioRuntime.hazardRadius);
}

function createAmbientVehicle(network, variant = 0) {
  const typeRoll = Math.random();
  let type = 'civilian_car';
  if (typeRoll > 0.992) type = 'ambulance';
  else if (typeRoll > 0.984) type = 'fire_truck';
  else if (typeRoll > 0.974) type = 'police';

  let routePoints = buildRandomRoute(network, null, variant);
  if (!routePoints || routePoints.length < 2) {
    const node = network.nodes[network.nodeIds[variant % network.nodeIds.length]];
    routePoints = [node.point, node.point];
  }
  const routeData = createRouteData(routePoints);
  const startOffset = Math.random() * Math.max(routeData.totalLength * 0.92, 1);
  let traversed = startOffset;
  let segmentIndex = 0;
  while (
    segmentIndex < routeData.segmentLengths.length - 1 &&
    traversed > routeData.segmentLengths[segmentIndex]
  ) {
    traversed -= routeData.segmentLengths[segmentIndex];
    segmentIndex += 1;
  }
  const segmentLength = routeData.segmentLengths[segmentIndex] || 1;
  const segmentProgress = Math.max(0, Math.min(1, traversed / segmentLength));
  const position = getPointOnRoute(routeData, segmentIndex, segmentProgress);

  return {
    id: `ambient-${variant}`,
    role: 'ambient',
    type,
    variant,
    routeData,
    targetPoint: routeData.points[routeData.points.length - 1],
    segmentIndex,
    segmentProgress,
    position,
    lastPosition: position,
    currentSpeed: 0,
    baseSpeed:
      type === 'civilian_car'
        ? 10 + Math.random() * 6
        : 13 + VEHICLE_TYPES[type].speed * 6,
    width: type === 'civilian_car' ? 3.2 : 4.2,
    length: type === 'civilian_car' ? 6.5 : 8.5,
    reroutedScenarioToken: null,
    completed: false,
  };
}

function createDispatchVehicle(definition, routeData, token, index) {
  const type = definition.type;
  const startPoint = routeData.points[0];
  return {
    id: `dispatch-${token}-${index}-${type}`,
    role: 'dispatch',
    type,
    variant: index,
    routeData,
    targetPoint: routeData.points[routeData.points.length - 1],
    segmentIndex: 0,
    segmentProgress: 0,
    position: startPoint,
    lastPosition: startPoint,
    currentSpeed: 0,
    baseSpeed: 16 + (VEHICLE_TYPES[type]?.speed || 1) * 8,
    width: 4.5,
    length: type === 'supply' ? 10 : 8,
    reroutedScenarioToken: token,
    completed: false,
    dispatchDelayMs: index * 360,
    spawnedAt: null,
  };
}

function advanceVehicle(vehicle, dt, network, scenarioRuntime, scenarioToken) {
  if (!vehicle.routeData || vehicle.routeData.points.length < 2) return false;

  if (
    scenarioRuntime &&
    vehicle.role === 'ambient' &&
    vehicle.reroutedScenarioToken !== scenarioToken &&
    distanceMeters(vehicle.position, scenarioRuntime.hazardCenter) < scenarioRuntime.hazardRadius * 3.2 &&
    remainingRouteTouchesHazard(vehicle, scenarioRuntime)
  ) {
    const reroutePoints = findRoute(network, vehicle.position, vehicle.targetPoint, {
      blockedEdgeKeys: scenarioRuntime.blockedEdgeKeys,
    });
    const rerouteData = createRouteData(reroutePoints);
    if (rerouteData) {
      vehicle.routeData = rerouteData;
      vehicle.segmentIndex = 0;
      vehicle.segmentProgress = 0;
      vehicle.reroutedScenarioToken = scenarioToken;
    }
  }

  const localHazardDistance = scenarioRuntime
    ? distanceMeters(vehicle.position, scenarioRuntime.hazardCenter)
    : Infinity;
  const hazardSlowdown =
    localHazardDistance < 300 ? 0.35 : localHazardDistance < 700 ? 0.6 : 1;
  const targetSpeed = vehicle.baseSpeed * hazardSlowdown;
  vehicle.currentSpeed += (targetSpeed - vehicle.currentSpeed) * Math.min(1, dt * 2.8);

  let distanceToMove = Math.max(1.5, vehicle.currentSpeed) * dt;
  vehicle.lastPosition = vehicle.position;

  while (distanceToMove > 0 && vehicle.segmentIndex < vehicle.routeData.segmentLengths.length) {
    const segmentLength = vehicle.routeData.segmentLengths[vehicle.segmentIndex] || 1;
    const remainingSegment = segmentLength * (1 - vehicle.segmentProgress);
    if (distanceToMove < remainingSegment) {
      vehicle.segmentProgress += distanceToMove / segmentLength;
      vehicle.position = getPointOnRoute(vehicle.routeData, vehicle.segmentIndex, vehicle.segmentProgress);
      distanceToMove = 0;
      break;
    }

    distanceToMove -= remainingSegment;
    vehicle.segmentIndex += 1;
    vehicle.segmentProgress = 0;

    if (vehicle.segmentIndex >= vehicle.routeData.segmentLengths.length) {
      vehicle.position = vehicle.routeData.points[vehicle.routeData.points.length - 1];
      vehicle.completed = true;
      return true;
    }

    vehicle.position = vehicle.routeData.points[vehicle.segmentIndex];
  }

  return false;
}

function drawVehicle(ctx, map, vehicle, now) {
  const point = map.latLngToContainerPoint(vehicle.position);
  const nextPoint = map.latLngToContainerPoint(vehicle.lastPosition || vehicle.position);
  const angle = Math.atan2(point.y - nextPoint.y, point.x - nextPoint.x);
  const def = VEHICLE_TYPES[vehicle.type] || VEHICLE_TYPES.civilian_car;

  ctx.save();
  ctx.translate(point.x, point.y);
  ctx.rotate(angle || 0);

  ctx.fillStyle = 'rgba(0,0,0,0.32)';
  ctx.fillRect(-vehicle.length / 2 + 1, -vehicle.width / 2 + 1, vehicle.length, vehicle.width);

  if (vehicle.type === 'ambulance') {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-1, -vehicle.width / 2 + 0.4, 2, vehicle.width - 0.8);
    ctx.fillRect(-vehicle.length / 4, -1, vehicle.length / 2, 2);
    ctx.fillStyle = now % 320 > 160 ? '#ef4444' : '#2563eb';
    ctx.fillRect(-1.4, -vehicle.width / 2 - 0.9, 2.8, 1.4);
  } else if (vehicle.type === 'fire_truck') {
    ctx.fillStyle = '#dc2626';
    ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);
    ctx.fillStyle = '#ef4444';
    ctx.fillRect(-vehicle.length / 4, -vehicle.width / 2 - 0.8, vehicle.length / 2, 1.2);
  } else if (vehicle.type === 'police') {
    ctx.fillStyle = '#0f172a';
    ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);
    ctx.fillStyle = now % 300 > 150 ? '#2563eb' : '#ffffff';
    ctx.fillRect(-vehicle.length / 4, -vehicle.width / 2 - 0.6, vehicle.length / 2, 1.1);
  } else if (vehicle.type === 'supply') {
    ctx.fillStyle = '#166534';
    ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.fillRect(-vehicle.length / 4, -vehicle.width / 2 + 0.7, vehicle.length / 2, vehicle.width - 1.4);
  } else {
    const palette = ['#cbd5e1', '#334155', '#3b82f6', '#22c55e', '#f59e0b', '#ef4444'];
    ctx.fillStyle = palette[vehicle.variant % palette.length];
    ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(-vehicle.length / 4, -vehicle.width / 2 + 0.5, vehicle.length / 2, vehicle.width - 1);
  }

  if (vehicle.role === 'dispatch') {
    ctx.strokeStyle = `${def.color}aa`;
    ctx.lineWidth = 1;
    ctx.strokeRect(-vehicle.length / 2 - 1.2, -vehicle.width / 2 - 1.2, vehicle.length + 2.4, vehicle.width + 2.4);
  }

  ctx.restore();
}

function CanvasTrafficLayer({ network, scenarioRuntime, scenarioToken, dispatchWave, onDispatchArrival }) {
  const map = useMap();
  const canvasRef = useRef(null);
  const ambientRef = useRef([]);
  const dispatchRef = useRef([]);
  const frameRef = useRef(null);
  const lastTimeRef = useRef(0);
  const arrivalRef = useRef(new Set());
  useEffect(() => {
    if (!network?.nodeIds?.length) return undefined;
    const container = map.getContainer();
    const canvas = L.DomUtil.create('canvas', 'sim-canvas-layer', container);
    canvas.style.position = 'absolute';
    canvas.style.top = '0';
    canvas.style.left = '0';
    canvas.style.zIndex = '460';
    canvas.style.pointerEvents = 'none';
    canvasRef.current = canvas;

    const resize = () => {
      const size = map.getSize();
      canvas.width = size.x;
      canvas.height = size.y;
      canvas.style.width = `${size.x}px`;
      canvas.style.height = `${size.y}px`;
    };

    resize();
    map.on('resize zoom move', resize);

    ambientRef.current = Array.from({ length: 180 }, (_, index) => createAmbientVehicle(network, index));

    return () => {
      map.off('resize zoom move', resize);
      if (canvas.parentNode) canvas.parentNode.removeChild(canvas);
      canvasRef.current = null;
    };
  }, [map, network]);

  useEffect(() => {
    if (!dispatchWave?.vehicles?.length || !scenarioRuntime) return;
    const routeData = createRouteData(scenarioRuntime.alternativeRoute);
    if (!routeData) return;
    dispatchRef.current = dispatchWave.vehicles.map((vehicle, index) =>
      createDispatchVehicle(vehicle, routeData, dispatchWave.token, index),
    );
    arrivalRef.current = new Set();
  }, [dispatchWave, scenarioRuntime]);

  useEffect(() => {
    let mounted = true;

    const render = (timestamp) => {
      if (!mounted || !canvasRef.current) return;
      const ctx = canvasRef.current.getContext('2d');
      const dt = Math.min((timestamp - (lastTimeRef.current || timestamp)) / 1000, 0.05);
      lastTimeRef.current = timestamp;

      ctx.clearRect(0, 0, canvasRef.current.width, canvasRef.current.height);

      ambientRef.current.forEach((vehicle) => {
        const arrived = advanceVehicle(vehicle, dt, network, scenarioRuntime, scenarioToken);
        if (arrived) {
          Object.assign(vehicle, createAmbientVehicle(network, vehicle.variant));
          return;
        }
        drawVehicle(ctx, map, vehicle, timestamp);
      });

      dispatchRef.current = dispatchRef.current.filter((vehicle) => {
        if (vehicle.spawnedAt === null) vehicle.spawnedAt = timestamp;
        if (timestamp - vehicle.spawnedAt < vehicle.dispatchDelayMs) return true;

        const arrived = advanceVehicle(vehicle, dt, network, scenarioRuntime, scenarioToken);
        drawVehicle(ctx, map, vehicle, timestamp);
        if (arrived && !arrivalRef.current.has(vehicle.id)) {
          arrivalRef.current.add(vehicle.id);
          onDispatchArrival?.(vehicle.id);
        }
        return !arrived;
      });

      frameRef.current = requestAnimationFrame(render);
    };

    frameRef.current = requestAnimationFrame(render);
    return () => {
      mounted = false;
      cancelAnimationFrame(frameRef.current);
    };
  }, [map, network, onDispatchArrival, scenarioRuntime, scenarioToken]);

  return null;
}

function DisasterAnimation({ scenario }) {
  if (!scenario) return null;

  const hazardIcon = L.divIcon({
    className: '',
    html: `
      <div style="width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;
        background:${scenario.color};color:white;font-size:13px;font-weight:700;box-shadow:0 0 14px ${scenario.color}88;
        animation:sim-hazard-pulse 1.8s ease-in-out infinite;">
        ${scenario.id === 'flood' ? 'W' : scenario.id === 'fire' ? 'F' : scenario.id === 'tornado' ? 'T' : 'X'}
      </div>
    `,
    iconSize: [28, 28],
    iconAnchor: [14, 14],
  });

  const innerRadius = Math.max(120, scenario.hazardRadius * 0.42);
  return (
    <>
      <style>{`
        @keyframes sim-hazard-pulse {
          0%, 100% { transform: scale(1); opacity: 0.92; }
          50% { transform: scale(1.14); opacity: 1; }
        }
      `}</style>
      {scenario.id === 'flood' && (
        <>
          <Circle
            center={scenario.hazardCenter}
            radius={scenario.hazardRadius}
            pathOptions={{ color: '#38bdf8', weight: 2, fillColor: '#38bdf8', fillOpacity: 0.14, dashArray: '12 10' }}
          />
          <Circle
            center={scenario.hazardCenter}
            radius={innerRadius}
            pathOptions={{ color: '#7dd3fc', weight: 1.5, fillColor: '#0ea5e9', fillOpacity: 0.22 }}
          />
        </>
      )}
      {scenario.id !== 'flood' && (
        <Circle
          center={scenario.hazardCenter}
          radius={scenario.hazardRadius}
          pathOptions={{ color: scenario.color, weight: 2, fillColor: scenario.color, fillOpacity: 0.1, dashArray: '10 8' }}
        />
      )}
      <Marker position={scenario.hazardCenter} icon={hazardIcon} zIndexOffset={900} />
    </>
  );
}

function LabeledMarker({ position, label, color, glyph }) {
  return (
    <Marker
      position={position}
      icon={L.divIcon({
        className: '',
        html: `
          <div style="background:${color};color:#fff;border-radius:8px;padding:4px 8px;font-size:11px;font-weight:700;
            white-space:nowrap;border:2px solid rgba(255,255,255,0.9);box-shadow:0 2px 8px rgba(0,0,0,0.35);">
            ${glyph} ${label}
          </div>
        `,
        iconSize: [0, 0],
        iconAnchor: [-4, 20],
      })}
    />
  );
}

export function SimulationOverlay({ scenario, vehicles, running, onPhaseChange, tmLines }) {
  const [phase, setPhase] = useState('idle');
  const [dispatchWave, setDispatchWave] = useState(null);
  const [arrivals, setArrivals] = useState(0);
  const [scenarioToken, setScenarioToken] = useState('ambient');

  const roadNetwork = useMemo(() => buildRoadNetwork(tmLines), [tmLines]);
  const scenarioRuntime = useMemo(() => {
    if (!scenario) return null;
    return buildScenarioRuntime(SCENARIOS[scenario], roadNetwork);
  }, [roadNetwork, scenario]);

  useEffect(() => {
    if (!running || !scenarioRuntime) {
      setPhase('idle');
      setDispatchWave(null);
      setArrivals(0);
      setScenarioToken('ambient');
      return undefined;
    }

    setArrivals(0);
    const nextToken = `${scenarioRuntime.id}-${Date.now()}`;
    setScenarioToken(nextToken);
    setPhase('blocked');
    onPhaseChange?.('blocked');

    const routeVehicles = vehicles.map((vehicle, index) => ({ ...vehicle, key: `${vehicle.type}-${index}`, variant: index }));

    const rerouteTimer = setTimeout(() => {
      setPhase('rerouting');
      onPhaseChange?.('rerouting');
    }, 1400);

    const launchTimer = setTimeout(() => {
      setPhase('routing');
      setDispatchWave({ token: nextToken, vehicles: routeVehicles });
      onPhaseChange?.('routing');
    }, 2600);

    return () => {
      clearTimeout(rerouteTimer);
      clearTimeout(launchTimer);
    };
  }, [onPhaseChange, running, scenarioRuntime, vehicles]);

  useEffect(() => {
    if (!dispatchWave?.vehicles?.length || arrivals < dispatchWave.vehicles.length) return;
    setPhase('arrived');
    onPhaseChange?.('arrived');
  }, [arrivals, dispatchWave, onPhaseChange]);

  if (!roadNetwork.nodeIds.length) return null;

  if (!scenarioRuntime) {
    return (
      <>
        <CanvasTrafficLayer network={roadNetwork} scenarioRuntime={null} scenarioToken="ambient" dispatchWave={null} />
      </>
    );
  }

  return (
    <>
      <CanvasTrafficLayer
        network={roadNetwork}
        scenarioRuntime={running ? scenarioRuntime : null}
        scenarioToken={scenarioToken}
        dispatchWave={phase === 'routing' ? dispatchWave : null}
        onDispatchArrival={() => setArrivals((value) => value + 1)}
      />

      <FlyToScenario center={scenarioRuntime.hazardCenter} zoom={scenarioRuntime.zoom} />

      {scenarioRuntime.blockedSegments.map((segment, index) => (
        <React.Fragment key={`blocked-segment-${index}`}>
          <Polyline
            positions={segment.positions}
            pathOptions={{ color: '#ef4444', weight: 10, opacity: 0.92, lineCap: 'round', lineJoin: 'round' }}
          />
          <Polyline
            positions={segment.positions}
            pathOptions={{ color: '#fff', weight: 2, opacity: 0.65, dashArray: '8 10' }}
          />
        </React.Fragment>
      ))}

      <DisasterAnimation scenario={scenarioRuntime} />

      {(phase === 'blocked' || phase === 'rerouting') && scenarioRuntime.blockedRouteAttempt.length > 1 && (
        <Polyline
          positions={scenarioRuntime.blockedRouteAttempt}
          pathOptions={{ color: '#ef4444', weight: 8, opacity: 0.42, dashArray: '10 12', lineCap: 'round' }}
        />
      )}

      {(phase === 'rerouting' || phase === 'routing' || phase === 'arrived') && scenarioRuntime.alternativeRoute.length > 1 && (
        <>
          <Polyline
            positions={scenarioRuntime.alternativeRoute}
            pathOptions={{ color: '#22c55e', weight: 8, opacity: 0.9, lineCap: 'round', lineJoin: 'round' }}
          />
          <Polyline
            positions={scenarioRuntime.alternativeRoute}
            pathOptions={{ color: '#fff', weight: 2, opacity: 0.7, dashArray: '8 12' }}
          />
        </>
      )}

      <LabeledMarker position={scenarioRuntime.snappedOrigin} label={scenarioRuntime.origin.label} color="#22c55e" glyph="Start" />
      <LabeledMarker position={scenarioRuntime.snappedDestination} label={scenarioRuntime.destination.label} color="#3b82f6" glyph="Dest" />
    </>
  );
}

export default function EmergencySimPanel({ onSimChange }) {
  const [activeScenario, setActiveScenario] = useState(null);
  const [selectedVehicles, setSelectedVehicles] = useState(['ambulance', 'fire_truck']);
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState('idle');
  const [collapsed, setCollapsed] = useState(false);

  const handlePhaseChange = useCallback((nextPhase) => {
    setPhase(nextPhase);
    if (nextPhase === 'arrived') {
      setTimeout(() => {
        setPhase('idle');
        setRunning(false);
      }, 2600);
    }
  }, []);

  const toggleVehicle = (type) => {
    setSelectedVehicles((current) =>
      current.includes(type) ? current.filter((value) => value !== type) : [...current, type],
    );
  };

  const handleRun = () => {
    if (!activeScenario || selectedVehicles.length === 0) return;
    setRunning(false);
    setPhase('idle');
    setTimeout(() => {
      setRunning(true);
      onSimChange?.({
        scenario: activeScenario,
        vehicles: selectedVehicles.map((type) => ({ type })),
        running: true,
        onPhaseChange: handlePhaseChange,
      });
    }, 100);
  };

  const handleStop = () => {
    setRunning(false);
    setPhase('idle');
    onSimChange?.({ scenario: null, vehicles: [], running: false });
  };

  const PHASE_LABELS = {
    idle: null,
    blocked: { text: 'Route blocked. Detecting the disruption footprint on nearby roads.', color: '#f43f5e' },
    rerouting: { text: 'Rerouting traffic and emergency vehicles around the hazard zone.', color: '#fbbf24' },
    routing: { text: 'Vehicles are moving on-road and avoiding blocked segments.', color: '#34d399' },
    arrived: { text: 'Vehicles cleared the hazard and reached the destination corridor.', color: '#34d399' },
  };

  const phaseInfo = PHASE_LABELS[phase];

  return (
    <div className={`sim-panel ${collapsed ? 'sim-collapsed' : ''}`}>
      <div className="sim-panel-header" onClick={() => setCollapsed((value) => !value)}>
        <div className="sim-header-left">
          <span className="sim-icon">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
            </svg>
          </span>
          <span className="sim-title">Emergency Routing Sim</span>
          {running && <span className="sim-live-badge">LIVE</span>}
        </div>
        <button className="sim-collapse-btn">{collapsed ? '>' : 'v'}</button>
      </div>

      {!collapsed && (
        <div className="sim-body">
          {phaseInfo && (
            <div className="sim-phase-bar" style={{ borderColor: phaseInfo.color, color: phaseInfo.color }}>
              {phaseInfo.text}
            </div>
          )}

          <div className="sim-section-label">Select Disaster Scenario</div>
          <div className="sim-scenarios">
            {Object.values(SCENARIOS).map((scenarioConfig) => (
              <button
                key={scenarioConfig.id}
                className={`sim-scenario-btn ${activeScenario === scenarioConfig.id ? 'active' : ''}`}
                style={
                  activeScenario === scenarioConfig.id
                    ? { borderColor: scenarioConfig.color, background: `${scenarioConfig.color}18` }
                    : {}
                }
                onClick={() => {
                  if (!running) {
                    setActiveScenario(activeScenario === scenarioConfig.id ? null : scenarioConfig.id);
                  }
                }}
              >
                <span className="sim-sc-label">{scenarioConfig.label}</span>
              </button>
            ))}
          </div>

          {activeScenario && <p className="sim-sc-desc">{SCENARIOS[activeScenario].description}</p>}

          <div className="sim-section-label" style={{ marginTop: '0.6rem' }}>
            Dispatch Vehicles
          </div>
          <div className="sim-vehicles">
            {Object.entries(VEHICLE_TYPES)
              .filter(([type]) => type !== 'civilian_car')
              .map(([type, definition]) => (
                <button
                  key={type}
                  className={`sim-vehicle-btn ${selectedVehicles.includes(type) ? 'active' : ''}`}
                  style={
                    selectedVehicles.includes(type)
                      ? { borderColor: definition.color, color: definition.color, background: `${definition.color}18` }
                      : {}
                  }
                  onClick={() => {
                    if (!running) toggleVehicle(type);
                  }}
                >
                  <span>{definition.icon}</span>
                  <span className="sim-vehicle-label">{definition.label}</span>
                </button>
              ))}
          </div>

          <div className="sim-controls">
            <button className="sim-run-btn" onClick={handleRun} disabled={running || !activeScenario || selectedVehicles.length === 0}>
              <svg width="11" height="11" viewBox="0 0 24 24" fill="white">
                <polygon points="5 3 19 12 5 21 5 3" />
              </svg>
              {running ? 'Simulating...' : 'Run Simulation'}
            </button>
            {running && (
              <button className="sim-stop-btn" onClick={handleStop}>
                <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                Stop
              </button>
            )}
          </div>

          <div className="sim-legend">
            <div className="sim-legend-item">
              <span style={{ background: '#ef4444', width: 20, height: 4, display: 'inline-block', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
              Blocked roads
            </div>
            <div className="sim-legend-item">
              <span style={{ background: '#34d399', width: 20, height: 4, display: 'inline-block', borderRadius: 2, verticalAlign: 'middle', marginRight: 4 }} />
              Detour route
            </div>
            <div className="sim-legend-item">
              <span style={{ background: '#38bdf8', width: 12, height: 12, display: 'inline-block', borderRadius: '50%', verticalAlign: 'middle', marginRight: 6 }} />
              Hazard animation
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
