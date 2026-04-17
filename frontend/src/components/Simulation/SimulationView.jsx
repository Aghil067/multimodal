import React, { useEffect, useMemo, useRef, useState } from 'react';
import polyline from '@mapbox/polyline';
import { getTravelMidwestCongestion } from '../../services/api';
import AISummaryPanel from '../Dashboard/AISummaryPanel';

const MAX_VEHICLES = 1400;
const INITIAL_VEHICLES = 850;
const ROAD_SCALE = 200000;
const DRIVABLE_HIGHWAYS = new Set([
  'motorway',
  'motorway_link',
  'trunk',
  'trunk_link',
  'primary',
  'primary_link',
  'secondary',
  'secondary_link',
  'tertiary',
  'tertiary_link',
  'unclassified',
  'residential',
  'living_street',
  'service',
]);

const TM_CONGESTION_LEVELS = {
  H: { severity: 1, color: 'rgba(235, 64, 52, 0.84)', label: 'Heavy' },
  M: { severity: 0.58, color: 'rgba(234, 179, 8, 0.72)', label: 'Moderate' },
  L: { severity: 0.24, color: 'rgba(72, 187, 120, 0.34)', label: 'Light' },
  N: { severity: 0, color: null, label: 'Normal' },
};

const SCENARIOS = [
  {
    id: 'flood',
    label: 'Flood',
    color: '#38bdf8',
    center: { lat: 41.8825, lng: -87.6325 },
    radius: 280,
    description: 'Floodwater closes a downtown river corridor and forces supply trucks to detour.',
  },
  {
    id: 'fire',
    label: 'Fire',
    color: '#fb7185',
    center: { lat: 41.884, lng: -87.635 },
    radius: 240,
    description: 'A structure fire blocks several streets and diverts emergency supply access.',
  },
  {
    id: 'tornado',
    label: 'Storm',
    color: '#a78bfa',
    center: { lat: 41.881, lng: -87.630 },
    radius: 300,
    description: 'Debris and overturned vehicles disrupt a major supply corridor.',
  },
  {
    id: 'collapse',
    label: 'Collapse',
    color: '#fb923c',
    center: { lat: 41.883, lng: -87.628 },
    radius: 250,
    description: 'A building collapse blocks the street grid and reroutes all supply routes.',
  },
];

// Hospital and supply depots for supply chain context
const HOSPITAL = { lat: 41.888, lng: -87.640, label: 'Rush Medical Center' };
const SUPPLY_DEPOTS = [
  { lat: 41.877, lng: -87.638, label: 'South Loop Depot' },
  { lat: 41.889, lng: -87.625, label: 'River North Hub' },
];

const DISPATCH_TYPES = {
  ambulance: { label: 'Ambulance', color: '#f43f5e', maxSpeed: 55, width: 7, length: 16 },
  fire_truck: { label: 'Fire Truck', color: '#f97316', maxSpeed: 34, width: 6.4, length: 16 },
  police: { label: 'Police', color: '#3b82f6', maxSpeed: 40, width: 5.2, length: 12.2 },
  supply_truck: { label: 'Supply Truck', color: '#facc15', maxSpeed: 28, width: 8, length: 18 },
};

function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function findPath(startId, endId, graph, blockedEdges = new Set(), extraWeights = {}) {
  if (!graph[startId] || !graph[endId]) return [];
  const open = [startId];
  const cameFrom = {};
  const gScore = { [startId]: 0 };
  const fScore = { [startId]: dist(graph[startId], graph[endId]) };
  const seen = new Set();

  while (open.length) {
    let bestIndex = 0;
    for (let i = 1; i < open.length; i += 1) {
      if ((fScore[open[i]] ?? Infinity) < (fScore[open[bestIndex]] ?? Infinity)) bestIndex = i;
    }
    const current = open.splice(bestIndex, 1)[0];
    if (current === endId) {
      const ids = [current];
      let cursor = current;
      while (cameFrom[cursor]) {
        cursor = cameFrom[cursor];
        ids.unshift(cursor);
      }
      return ids;
    }
    seen.add(current);

    graph[current].neighbors.forEach((neighbor) => {
      const edgeKey = `${current}-${neighbor.id}`;
      const reverseKey = `${neighbor.id}-${current}`;
      if (blockedEdges.has(edgeKey) || blockedEdges.has(reverseKey) || seen.has(neighbor.id)) return;
      const weightBoost = extraWeights[edgeKey] ?? extraWeights[reverseKey] ?? 0;
      const candidate = (gScore[current] ?? Infinity) + neighbor.distance * (1 + weightBoost);
      if (candidate < (gScore[neighbor.id] ?? Infinity)) {
        cameFrom[neighbor.id] = current;
        gScore[neighbor.id] = candidate;
        fScore[neighbor.id] = candidate + dist(graph[neighbor.id], graph[endId]);
        if (!open.includes(neighbor.id)) open.push(neighbor.id);
      }
    });
  }

  return [];
}

function worldToScreen(point, canvas, transform) {
  return {
    x: canvas.width / 2 + transform.x + point.x * transform.k,
    y: canvas.height / 2 + transform.y + point.y * transform.k,
  };
}

function rectVisible(x1, y1, x2, y2, canvas, transform, margin = 80) {
  const p1 = worldToScreen({ x: x1, y: y1 }, canvas, transform);
  const p2 = worldToScreen({ x: x2, y: y2 }, canvas, transform);
  const minX = Math.min(p1.x, p2.x);
  const maxX = Math.max(p1.x, p2.x);
  const minY = Math.min(p1.y, p2.y);
  const maxY = Math.max(p1.y, p2.y);
  return maxX >= -margin && maxY >= -margin && minX <= canvas.width + margin && minY <= canvas.height + margin;
}

function pointVisible(x, y, canvas, transform, margin = 60) {
  const p = worldToScreen({ x, y }, canvas, transform);
  return p.x >= -margin && p.x <= canvas.width + margin && p.y >= -margin && p.y <= canvas.height + margin;
}

function pointToSegmentDistance(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  if (dx === 0 && dy === 0) return Math.hypot(px - x1, py - y1);
  const t = Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / (dx * dx + dy * dy)));
  const cx = x1 + t * dx;
  const cy = y1 + t * dy;
  return Math.hypot(px - cx, py - cy);
}

function decodeTravelMidwestFeatures(features = []) {
  const lines = [];
  for (let i = 0; i < features.length; i += 1) {
    const feature = features[i];
    const props = feature?.properties || {};
    const cng = props.cng || 'N';
    const level = TM_CONGESTION_LEVELS[cng] || TM_CONGESTION_LEVELS.N;
    if (!feature?.geometry?.coordinates || level.severity <= 0) continue;
    const coords = feature.geometry.coordinates;

    const pushLine = (positions) => {
      if (positions.length > 1) lines.push({ positions, cng, severity: level.severity, color: level.color });
    };

    if (typeof coords === 'string') {
      pushLine(polyline.decode(coords));
      continue;
    }

    if (!Array.isArray(coords)) continue;

    if (coords.length > 0 && Array.isArray(coords[0]) && typeof coords[0][0] === 'number') {
      pushLine(coords.map((pair) => [pair[1], pair[0]]));
      continue;
    }

    coords.forEach((segment) => {
      if (typeof segment === 'string') {
        pushLine(polyline.decode(segment));
      } else if (Array.isArray(segment) && segment.length > 0 && Array.isArray(segment[0])) {
        pushLine(segment.filter((pair) => Array.isArray(pair) && pair.length >= 2).map((pair) => [pair[1], pair[0]]));
      }
    });
  }
  return lines;
}

function toGridKey(x, y, size) {
  return `${Math.floor(x / size)}:${Math.floor(y / size)}`;
}

function collectGridCandidates(x, y, grid, size) {
  const gx = Math.floor(x / size);
  const gy = Math.floor(y / size);
  const ids = new Set();
  for (let ix = gx - 1; ix <= gx + 1; ix += 1) {
    for (let iy = gy - 1; iy <= gy + 1; iy += 1) {
      const cell = grid[`${ix}:${iy}`];
      if (!cell) continue;
      cell.forEach((id) => ids.add(id));
    }
  }
  return ids;
}

function mapTravelMidwestToRoads(features, data) {
  if (!features?.length || !data?.roads?.length) return { roadTraffic: {}, pathWeights: {} };
  const lines = decodeTravelMidwestFeatures(features);
  const roadTraffic = {};
  const pathWeights = {};

  lines.forEach((line) => {
    for (let i = 1; i < line.positions.length; i += 1) {
      const [lat1, lng1] = line.positions[i - 1];
      const [lat2, lng2] = line.positions[i];
      const p1 = data.project(lng1, lat1);
      const p2 = data.project(lng2, lat2);
      const midX = (p1.x + p2.x) / 2;
      const midY = (p1.y + p2.y) / 2;
      const candidates = collectGridCandidates(midX, midY, data.roadGrid, data.gridSize);
      let bestRoad = null;
      let bestDistance = Infinity;

      candidates.forEach((roadIndex) => {
        const road = data.roads[roadIndex];
        if (!road) return;
        const distance = pointToSegmentDistance(midX, midY, road.x1, road.y1, road.x2, road.y2);
        const maxSnap = road.kind === 'major' ? 32 : 22;
        if (distance < maxSnap && distance < bestDistance) {
          bestRoad = road;
          bestDistance = distance;
        }
      });

      if (!bestRoad) return;
      roadTraffic[bestRoad.index] = Math.max(roadTraffic[bestRoad.index] || 0, line.severity);
      pathWeights[`${bestRoad.from}-${bestRoad.to}`] = Math.max(pathWeights[`${bestRoad.from}-${bestRoad.to}`] || 0, line.severity * 0.95);
      pathWeights[`${bestRoad.to}-${bestRoad.from}`] = Math.max(pathWeights[`${bestRoad.to}-${bestRoad.from}`] || 0, line.severity * 0.95);
    }
  });

  return { roadTraffic, pathWeights };
}

function pathNeedsReroute(vehicle, scenario, blockedEdges, graph) {
  if (!scenario || vehicle.arrived) return false;
  const remainingLookahead = Math.min(vehicle.pathIds.length - 1, vehicle.pathIndex + 10);
  for (let i = vehicle.pathIndex; i < remainingLookahead; i += 1) {
    const fromId = vehicle.pathIds[i - 1] ?? vehicle.currentNode.id;
    const toId = vehicle.pathIds[i];
    const edgeKey = `${fromId}-${toId}`;
    if (blockedEdges.has(edgeKey)) return true;
    const fromNode = graph[fromId];
    const toNode = graph[toId];
    if (!fromNode || !toNode) continue;
    const midX = (fromNode.x + toNode.x) / 2;
    const midY = (fromNode.y + toNode.y) / 2;
    if (Math.hypot(midX - scenario.x, midY - scenario.y) < scenario.radius * 1.1) return true;
  }
  return false;
}

function SimulationCanvas({ data, engineSpeed, scenario, running, onArrivals, trafficState }) {
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const lastTimeRef = useRef(0);
  const transformRef = useRef({ x: 0, y: 0, k: 1 });
  const dragRef = useRef({ active: false, x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const simRef = useRef({
    vehicles: [],
    particles: [],
    signals: {},
    blockedEdges: new Set(),
    slowEdges: {},
    activeCounts: {},
    tmRoadTraffic: {},
    tmPathWeights: {},
    ambulanceEdges: new Set(), // edges currently used by ambulance path
  });

  const projectedScenario = useMemo(() => {
    if (!scenario || !data || !running) return null;
    const p = data.project(scenario.center.lng, scenario.center.lat);
    return { ...scenario, x: p.x, y: p.y };
  }, [data, scenario, running]);

  useEffect(() => {
    if (!data) return;
    transformRef.current = { x: 0, y: 0, k: data.initialZoom };
    const signals = {};
    data.intersections.forEach((node) => {
      signals[node.id] = { state: Math.floor(Math.random() * 4), timer: 2 + Math.random() * 8, forceGreen: false };
    });

    const vehicles = [];
    const nodeIds = data.nodeIds;
    let attempts = 0;
    while (vehicles.length < INITIAL_VEHICLES && attempts < INITIAL_VEHICLES * 7) {
      attempts += 1;
      const startId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      const endId = nodeIds[Math.floor(Math.random() * nodeIds.length)];
      if (startId === endId) continue;
      const pathIds = findPath(startId, endId, data.graph, new Set(), trafficState?.pathWeights || {});
      if (pathIds.length < 2) continue;
      const type = 'car';
      vehicles.push(createVehicle(type, pathIds, data, vehicles.length + attempts));
    }

    simRef.current = {
      vehicles,
      particles: createParticles(data),
      signals,
      blockedEdges: new Set(),
      slowEdges: {},
      activeCounts: {},
      tmRoadTraffic: trafficState?.roadTraffic || {},
      tmPathWeights: trafficState?.pathWeights || {},
    };
  }, [data, trafficState]);

  useEffect(() => {
    simRef.current.tmRoadTraffic = trafficState?.roadTraffic || {};
    simRef.current.tmPathWeights = trafficState?.pathWeights || {};
  }, [trafficState]);

  useEffect(() => {
    if (!data) return;
    const blockedEdges = new Set();
    const slowEdges = {};
    if (projectedScenario) {
      data.roads.forEach((road) => {
        const midX = (road.x1 + road.x2) / 2;
        const midY = (road.y1 + road.y2) / 2;
        const d = Math.hypot(midX - projectedScenario.x, midY - projectedScenario.y);
        const key = `${road.from}-${road.to}`;
        const reverseKey = `${road.to}-${road.from}`;
        if (d < projectedScenario.radius * 0.82) {
          blockedEdges.add(key);
          blockedEdges.add(reverseKey);
        } else if (d < projectedScenario.radius * 1.65) {
          slowEdges[key] = 1.3;
          slowEdges[reverseKey] = 1.3;
        }
      });

      // IMMEDIATELY remove or reroute vehicles trapped inside the disaster zone
      const pathWeights = { ...simRef.current.tmPathWeights, ...slowEdges };
      for (let i = simRef.current.vehicles.length - 1; i >= 0; i -= 1) {
        const v = simRef.current.vehicles[i];
        if (v.dispatch) continue; // don't touch dispatch vehicles
        const onBlockedEdge = blockedEdges.has(`${v.currentNode.id}-${(v.nextNode || {}).id}`);
        const insideZone = Math.hypot(v.x - projectedScenario.x, v.y - projectedScenario.y) < projectedScenario.radius * 1.1;
        if (onBlockedEdge || insideZone) {
          // Try to teleport the vehicle to a safe node outside the zone
          const safeNode = data.nodeIds.find((id) => {
            const n = data.graph[id];
            return Math.hypot(n.x - projectedScenario.x, n.y - projectedScenario.y) > projectedScenario.radius * 1.8;
          });
          if (safeNode) {
            const dest = data.nodeIds[Math.floor(Math.random() * data.nodeIds.length)];
            const safePath = findPath(safeNode, dest, data.graph, blockedEdges, pathWeights);
            if (safePath.length >= 2) {
              v.currentNode = data.graph[safeNode];
              v.nextNode = data.graph[safePath[1]];
              v.pathIds = safePath;
              v.pathIndex = 1;
              v.progress = 0;
              v.x = data.graph[safeNode].x;
              v.y = data.graph[safeNode].y;
              continue;
            }
          }
          // Can't relocate — despawn
          simRef.current.vehicles.splice(i, 1);
        }
      }
    }
    simRef.current.blockedEdges = blockedEdges;
    simRef.current.slowEdges = slowEdges;
  }, [data, projectedScenario]);

  // Spawn ambulance near zone edge → hospital, plus supply trucks
  useEffect(() => {
    if (!running || !data || !projectedScenario) return;

    // Remove any old dispatch vehicles
    simRef.current.vehicles = simRef.current.vehicles.filter((v) => !v.dispatch);

    const blockedEdges = simRef.current.blockedEdges;
    const pathWeights = { ...simRef.current.tmPathWeights, ...simRef.current.slowEdges };

    // Find the node closest to the zone EDGE (not inside) for ambulance start
    let bestEdgeNode = null;
    let bestEdgeDist = Infinity;
    data.nodeIds.forEach((id) => {
      const n = data.graph[id];
      const d = Math.hypot(n.x - projectedScenario.x, n.y - projectedScenario.y);
      const edgeDist = Math.abs(d - projectedScenario.radius * 1.0);
      if (d > projectedScenario.radius * 0.9 && edgeDist < bestEdgeDist) {
        bestEdgeDist = edgeDist;
        bestEdgeNode = id;
      }
    });

    // Hospital node: closest node to HOSPITAL lat/lng
    const hospitalProj = data.project(HOSPITAL.lng, HOSPITAL.lat);
    let hospitalNode = data.nodeIds[0];
    let hospitalDist = Infinity;
    data.nodeIds.forEach((id) => {
      const n = data.graph[id];
      const d = Math.hypot(n.x - hospitalProj.x, n.y - hospitalProj.y);
      if (d < hospitalDist) { hospitalDist = d; hospitalNode = id; }
    });

    const ambEdges = new Set();
    const spawnEmergency = (type, start, end, seed, delay) => {
      const p = findPath(start, end, data.graph, blockedEdges, pathWeights);
      if (p.length >= 2) {
        simRef.current.vehicles.push(createVehicle(type, p, data, seed, true, delay));
        for (let j = 0; j < p.length - 1; j += 1) {
          ambEdges.add(`${p[j]}-${p[j + 1]}`);
          ambEdges.add(`${p[j + 1]}-${p[j]}`);
        }
      }
    };
    
    const edgeStart = bestEdgeNode || data.nodeIds[0];
    const depotNode1 = data.nodeIds[Math.floor(data.nodeIds.length * 0.2)];
    
    // Ambulance: edge of zone → hospital
    spawnEmergency('ambulance', edgeStart, hospitalNode, 900001, 0);
    // Fire Truck: hospital to disaster edge
    spawnEmergency('fire_truck', hospitalNode, edgeStart, 900002, 0.5);
    // Police: depot to disaster edge
    spawnEmergency('police', depotNode1, edgeStart, 900003, 1.0);
    
    simRef.current.ambulanceEdges = ambEdges;

    // Spawn 2 supply trucks from depots to simulate supply chain disruption
    SUPPLY_DEPOTS.forEach((depot, idx) => {
      const depotProj = data.project(depot.lng, depot.lat);
      let depotNode = data.nodeIds[0];
      let dBest = Infinity;
      data.nodeIds.forEach((id) => {
        const n = data.graph[id];
        const dd = Math.hypot(n.x - depotProj.x, n.y - depotProj.y);
        if (dd < dBest) { dBest = dd; depotNode = id; }
      });
      const truckPath = findPath(depotNode, hospitalNode, data.graph, blockedEdges, pathWeights);
      if (truckPath.length >= 2) {
        simRef.current.vehicles.push(createVehicle('supply_truck', truckPath, data, 900010 + idx, true, 0.5 + idx * 0.8));
      }
    });
  }, [data, running, projectedScenario]);

  useEffect(() => {
    if (!data) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const handleWheel = (event) => {
      event.preventDefault();
      transformRef.current.k = Math.max(0.2, Math.min(8, transformRef.current.k * Math.exp(-event.deltaY * 0.001)));
    };
    const handleMouseDown = (event) => {
      dragRef.current.active = true;
      setIsDragging(true);
      dragRef.current.x = event.clientX - transformRef.current.x;
      dragRef.current.y = event.clientY - transformRef.current.y;
    };
    const handleMouseMove = (event) => {
      if (!dragRef.current.active) return;
      transformRef.current.x = event.clientX - dragRef.current.x;
      transformRef.current.y = event.clientY - dragRef.current.y;
    };
    const handleMouseUp = () => {
      dragRef.current.active = false;
      setIsDragging(false);
    };

    canvas.addEventListener('wheel', handleWheel, { passive: false });
    canvas.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);

    return () => {
      canvas.removeEventListener('wheel', handleWheel);
      canvas.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [data]);

  useEffect(() => {
    if (!data) return;
    const animate = (time) => {
      const dt = Math.min((time - (lastTimeRef.current || time)) / 1000, 0.05) * engineSpeed;
      lastTimeRef.current = time;
      tickSimulation(simRef.current, data, projectedScenario, dt, onArrivals);
      renderScene(canvasRef.current, data, simRef.current, projectedScenario, transformRef.current, time, running);
      frameRef.current = requestAnimationFrame(animate);
    };
    frameRef.current = requestAnimationFrame(animate);
    return () => cancelAnimationFrame(frameRef.current);
  }, [data, engineSpeed, onArrivals, projectedScenario, running]);

  return <canvas ref={canvasRef} className="simulation-canvas" style={{ cursor: isDragging ? 'grabbing' : 'grab' }} />;
}

function createVehicle(type, pathIds, data, seed, dispatch = false, delay = 0) {
  const graph = data.graph;
  const width = type === 'car' ? 7.4 : DISPATCH_TYPES[type]?.width || 7.4;
  const length = type === 'car' ? 16 : DISPATCH_TYPES[type]?.length || 16;
  const color = type === 'car'
    ? ['#9ae6b4', '#7dd3fc', '#facc15', '#f59e0b', '#f87171', '#c4b5fd'][seed % 6]
    : DISPATCH_TYPES[type]?.color;
  const start = graph[pathIds[0]];
  return {
    id: `${type}-${seed}`,
    type,
    dispatch,
    color,
    width,
    length,
    pathIds,
    pathIndex: 1,
    currentNode: start,
    nextNode: graph[pathIds[1]] || start,
    progress: dispatch ? 0 : Math.random() * 0.96,
    speed: 0,
    maxSpeed: type === 'car' ? 27 + (seed % 10) : DISPATCH_TYPES[type]?.maxSpeed || 35,
    x: start.x,
    y: start.y,
    angle: 0,
    rerouteCooldown: 1.5 + Math.random() * 3,
    laneOffset: ((seed % 4) - 1.5) * 1.8,
    delay,
    spawnAt: null,
    arrived: false,
  };
}

function createParticles(data) {
  const particles = [];
  const limit = Math.min(64, Math.floor(data.roads.length / 40));
  for (let i = 0; i < limit; i += 1) {
    particles.push({
      roadIndex: (i * 17) % data.roads.length,
      progress: Math.random(),
      speed: 0.08 + Math.random() * 0.22,
      alpha: 0.14 + Math.random() * 0.18,
    });
  }
  return particles;
}

function tickSimulation(sim, data, scenario, dt, onArrivals) {
  const activeCounts = {};
  sim.vehicles.forEach((vehicle) => {
    if (vehicle.nextNode && !vehicle.arrived) {
      const key = `${vehicle.currentNode.id}-${vehicle.nextNode.id}`;
      activeCounts[key] = (activeCounts[key] || 0) + 1;
    }
  });
  sim.activeCounts = activeCounts;

  // Find the emergency vehicles for green-wave logic
  const emergencyVehicles = sim.vehicles.filter((v) => ['ambulance', 'fire_truck', 'police'].includes(v.type) && !v.arrived);

  data.intersections.forEach((node) => {
    const signal = sim.signals[node.id];
    if (!signal) return;

    // Emergency green-wave: force green if any emergency vehicle is close
    let forcePriority = false;
    for (const ev of emergencyVehicles) {
      const proximity = Math.hypot(node.x - ev.x, node.y - ev.y);
      if (proximity < 120 || sim.ambulanceEdges.has(`${node.id}-${ev.currentNode?.id}`)) {
        forcePriority = true;
        break;
      }
    }

    if (forcePriority) {
      signal.state = 0; // GREEN
      signal.forceGreen = true;
      signal.timer = 3;
    } else if (signal.forceGreen) {
      const allFar = emergencyVehicles.every(ev => Math.hypot(node.x - ev.x, node.y - ev.y) > 200);
      if (allFar || emergencyVehicles.length === 0) {
        signal.forceGreen = false; // release back to normal cycle
      }
    }

    if (!signal.forceGreen) {
      signal.timer -= dt;
      if (signal.timer <= 0) {
        signal.state = (signal.state + 1) % 4;
        signal.timer = signal.state === 1 ? 2 : signal.state === 3 ? 2 : 6.5;
      }
    }
  });

  sim.particles.forEach((particle) => {
    particle.progress = (particle.progress + dt * particle.speed) % 1;
  });

  const pathWeights = { ...sim.tmPathWeights, ...sim.slowEdges };

  for (let i = sim.vehicles.length - 1; i >= 0; i -= 1) {
    const vehicle = sim.vehicles[i];
    if (!vehicle.nextNode || vehicle.arrived) continue;

    const dx = vehicle.nextNode.x - vehicle.currentNode.x;
    const dy = vehicle.nextNode.y - vehicle.currentNode.y;
    const segmentLength = Math.hypot(dx, dy) || 1;
    const dirX = dx / segmentLength;
    const dirY = dy / segmentLength;
    const edgeKey = `${vehicle.currentNode.id}-${vehicle.nextNode.id}`;
    const density = activeCounts[edgeKey] || 0;
    let targetSpeed = vehicle.maxSpeed * Math.max(0.24, 1 - density * 0.06);
    if (sim.slowEdges[edgeKey]) targetSpeed *= 0.58;
    if (sim.tmPathWeights[edgeKey]) targetSpeed *= Math.max(0.4, 1 - sim.tmPathWeights[edgeKey] * 0.38);

    // Regular cars yield to nearby emergency vehicles
    if (!vehicle.dispatch && emergencyVehicles.length > 0) {
      for (const ev of emergencyVehicles) {
        if (Math.hypot(vehicle.x - ev.x, vehicle.y - ev.y) < 60) {
          targetSpeed = 0; // hard yield
          break;
        }
      }
    }

    const remaining = segmentLength * (1 - vehicle.progress);
    const signal = sim.signals[vehicle.nextNode.id];
    if (signal && remaining < 12) {
      // Dispatch vehicles ignore red lights
      if (vehicle.dispatch) {
        // ambulance/supply trucks go through
      } else {
        const isGreen = signal.state === 0 || signal.state === 2;
        if (!isGreen) targetSpeed *= 0.16;
      }
    }

    vehicle.rerouteCooldown -= dt;
    if (
      scenario &&
      !vehicle.dispatch &&
      vehicle.rerouteCooldown <= 0 &&
      (
        sim.blockedEdges.has(edgeKey) ||
        pathNeedsReroute(vehicle, scenario, sim.blockedEdges, data.graph)
      )
    ) {
      const newPath = findPath(vehicle.currentNode.id, vehicle.pathIds[vehicle.pathIds.length - 1], data.graph, sim.blockedEdges, pathWeights);
      if (newPath.length >= 2) {
        vehicle.pathIds = newPath;
        vehicle.pathIndex = 1;
        vehicle.nextNode = data.graph[newPath[1]];
        vehicle.progress = 0;
      } else {
        // Can't reach original destination — pick a new one
        const fallbackEnd = data.nodeIds[Math.floor(Math.random() * data.nodeIds.length)];
        const fallbackPath = findPath(vehicle.currentNode.id, fallbackEnd, data.graph, sim.blockedEdges, pathWeights);
        if (fallbackPath.length >= 2) {
          vehicle.pathIds = fallbackPath;
          vehicle.pathIndex = 1;
          vehicle.nextNode = data.graph[fallbackPath[1]];
          vehicle.progress = 0;
        } else {
          sim.vehicles.splice(i, 1);
          continue;
        }
      }
      vehicle.rerouteCooldown = 2.2 + Math.random() * 1.4;
    }

    vehicle.speed += (targetSpeed - vehicle.speed) * Math.min(1, dt * 4.5);
    vehicle.progress += (vehicle.speed * dt) / segmentLength;

    if (vehicle.progress >= 1) {
      vehicle.currentNode = vehicle.nextNode;
      vehicle.pathIndex += 1;
      vehicle.progress = 0;
      if (vehicle.pathIndex >= vehicle.pathIds.length) {
        if (vehicle.dispatch) {
          vehicle.arrived = true;
          onArrivals?.((value) => value + 1);
        } else {
          const destination = data.nodeIds[Math.floor(Math.random() * data.nodeIds.length)];
          const nextPath = findPath(vehicle.currentNode.id, destination, data.graph, sim.blockedEdges, pathWeights);
          if (nextPath.length >= 2) {
            vehicle.pathIds = nextPath;
            vehicle.pathIndex = 1;
            vehicle.nextNode = data.graph[nextPath[1]];
          } else {
            sim.vehicles.splice(i, 1);
            if (sim.vehicles.length < MAX_VEHICLES) {
              const fallbackStart = data.nodeIds[Math.floor(Math.random() * data.nodeIds.length)];
              const fallbackEnd = data.nodeIds[Math.floor(Math.random() * data.nodeIds.length)];
              const fallbackPath = findPath(fallbackStart, fallbackEnd, data.graph, sim.blockedEdges, pathWeights);
              if (fallbackPath.length >= 2) {
                sim.vehicles.push(createVehicle('car', fallbackPath, data, Math.floor(Math.random() * 999999)));
              }
            }
          }
        }
      } else {
        vehicle.nextNode = data.graph[vehicle.pathIds[vehicle.pathIndex]];
      }
    }

    vehicle.x = vehicle.currentNode.x + dirX * (segmentLength * vehicle.progress) - dirY * vehicle.laneOffset;
    vehicle.y = vehicle.currentNode.y + dirY * (segmentLength * vehicle.progress) + dirX * vehicle.laneOffset;
    vehicle.angle = Math.atan2(dy, dx);
  }
}

function renderScene(canvas, data, sim, scenario, transform, time, isRunning) {
  if (!canvas) return;
  const dpr = Math.min(window.devicePixelRatio || 1, 1.2);
  const width = Math.floor(canvas.clientWidth * dpr);
  const height = Math.floor(canvas.clientHeight * dpr);
  if (canvas.width !== width || canvas.height !== height) {
    canvas.width = width;
    canvas.height = height;
  }
  const ctx = canvas.getContext('2d');
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const gradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
  gradient.addColorStop(0, '#171a16');
  gradient.addColorStop(1, '#121411');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = 'rgba(255,255,255,0.015)';
  ctx.fillRect(0, 0, canvas.width, 64);

  ctx.save();
  ctx.translate(canvas.width / 2 + transform.x * dpr, canvas.height / 2 + transform.y * dpr);
  ctx.scale(transform.k * dpr, transform.k * dpr);

  const visibilityTransform = {
    x: transform.x * dpr,
    y: transform.y * dpr,
    k: transform.k * dpr,
  };

  data.buildings.forEach((b) => {
    const x1 = b.x - b.w / 2;
    const y1 = b.y - b.d / 2;
    const x2 = b.x + b.w / 2;
    const y2 = b.y + b.d / 2;
    if (!rectVisible(x1, y1, x2, y2, canvas, visibilityTransform, 20)) return;
    ctx.fillStyle = '#3b4043';
    ctx.strokeStyle = '#4c5356';
    ctx.lineWidth = 1.1 / transform.k;
    ctx.fillRect(x1, y1, b.w, b.d);
    ctx.strokeRect(x1, y1, b.w, b.d);
  });

  data.roads.forEach((road) => {
    if (!rectVisible(road.minX, road.minY, road.maxX, road.maxY, canvas, visibilityTransform)) return;
    const key = `${road.from}-${road.to}`;
    const blocked = sim.blockedEdges.has(key);
    const slowed = sim.slowEdges[key];
    const baseWidth = road.kind === 'major' ? 18 : 12;
    const trafficWidth = road.kind === 'major' ? 11 : 7;
    const laneDash = road.kind === 'major' ? [7, 8] : [4, 8];
    const laneOffset = road.kind === 'major' ? 3.2 : 1.8;
    const activeForward = sim.vehicles.length ? (sim.activeCounts?.[key] || 0) : 0;
    const reverseKey = `${road.to}-${road.from}`;
    const activeReverse = sim.vehicles.length ? (sim.activeCounts?.[reverseKey] || 0) : 0;
    const density = activeForward + activeReverse;
    const tmSeverity = sim.tmRoadTraffic?.[road.index] || 0;

    ctx.lineCap = 'round';
    ctx.lineWidth = baseWidth;
    ctx.strokeStyle = '#3a3a3a';
    ctx.beginPath();
    ctx.moveTo(road.x1, road.y1);
    ctx.lineTo(road.x2, road.y2);
    ctx.stroke();

    if (!blocked && (tmSeverity > 0 || slowed || density > 1)) {
      ctx.lineWidth = trafficWidth;
      if (tmSeverity >= 0.9) ctx.strokeStyle = TM_CONGESTION_LEVELS.H.color;
      else if (tmSeverity >= 0.45 || density > 5 || slowed) ctx.strokeStyle = TM_CONGESTION_LEVELS.M.color;
      else ctx.strokeStyle = TM_CONGESTION_LEVELS.L.color;
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();
    }

    if (road.kind === 'major') {
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(road.x1 - road.normalX * laneOffset, road.y1 - road.normalY * laneOffset);
      ctx.lineTo(road.x2 - road.normalX * laneOffset, road.y2 - road.normalY * laneOffset);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(road.x1 + road.normalX * laneOffset, road.y1 + road.normalY * laneOffset);
      ctx.lineTo(road.x2 + road.normalX * laneOffset, road.y2 + road.normalY * laneOffset);
      ctx.stroke();
    }

    ctx.lineWidth = 1;
    ctx.setLineDash(laneDash);
    ctx.strokeStyle = 'rgba(235, 235, 235, 0.78)';
    ctx.beginPath();
    ctx.moveTo(road.x1, road.y1);
    ctx.lineTo(road.x2, road.y2);
    ctx.stroke();
    ctx.setLineDash([]);
  });

  if (transform.k > 0.55) {
    sim.particles.forEach((particle) => {
      const road = data.roads[particle.roadIndex];
      if (!road) return;
      if (!rectVisible(road.minX, road.minY, road.maxX, road.maxY, canvas, visibilityTransform)) return;
      const px = road.x1 + (road.x2 - road.x1) * particle.progress;
      const py = road.y1 + (road.y2 - road.y1) * particle.progress;
      ctx.fillStyle = `rgba(98, 255, 152, ${particle.alpha})`;
      ctx.beginPath();
      ctx.arc(px, py, 0.9, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  // 10k-style 3-light traffic signal poles
  data.intersections.forEach((node) => {
    if (!pointVisible(node.x, node.y, canvas, visibilityTransform, 30)) return;
    const signal = sim.signals[node.id];
    if (!signal) return;

    ctx.save();
    ctx.translate(node.x + 4, node.y - 8);

    // Pole
    ctx.fillStyle = '#111';
    ctx.fillRect(-2.5, -8, 5, 18);

    // Red light (states 2, 3)
    ctx.beginPath(); ctx.arc(0, -5, 2, 0, Math.PI * 2);
    ctx.fillStyle = (signal.state === 2 || signal.state === 3) ? '#ff0000' : '#330000';
    if (signal.state === 2 || signal.state === 3) { ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 10; }
    ctx.fill(); ctx.shadowBlur = 0;

    // Yellow light (states 1, 3)
    ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2);
    ctx.fillStyle = (signal.state === 1 || signal.state === 3) ? '#ffea00' : '#333300';
    if (signal.state === 1 || signal.state === 3) { ctx.shadowColor = '#ffea00'; ctx.shadowBlur = 10; }
    ctx.fill(); ctx.shadowBlur = 0;

    // Green light (states 0, 2)
    ctx.beginPath(); ctx.arc(0, 5, 2, 0, Math.PI * 2);
    ctx.fillStyle = (signal.state === 0 || signal.state === 2) ? '#00e676' : '#003300';
    if (signal.state === 0 || signal.state === 2) { ctx.shadowColor = '#00e676'; ctx.shadowBlur = 10; }
    ctx.fill(); ctx.shadowBlur = 0;

    // Ambulance forced indicator: bright green halo
    if (signal.forceGreen) {
      ctx.shadowColor = '#00ff88'; ctx.shadowBlur = 20;
      ctx.strokeStyle = '#00ff88';
      ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(0, 5, 4, 0, Math.PI * 2); ctx.stroke();
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  });

  // Hospital marker
  if (data.project) {
    const hp = data.project(HOSPITAL.lng, HOSPITAL.lat);
    if (pointVisible(hp.x, hp.y, canvas, visibilityTransform, 40)) {
      ctx.save();
      ctx.translate(hp.x, hp.y);
      // White cross on red bg
      ctx.fillStyle = '#ef4444';
      ctx.shadowColor = '#ff0000'; ctx.shadowBlur = 14;
      ctx.beginPath(); ctx.arc(0, 0, 10, 0, Math.PI * 2); ctx.fill();
      ctx.shadowBlur = 0;
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(-2, -7, 4, 14);
      ctx.fillRect(-7, -2, 14, 4);
      ctx.font = 'bold 7px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('H', 0, 18);
      ctx.restore();
    }
  }

  // Supply depot markers
  SUPPLY_DEPOTS.forEach((depot) => {
    if (!data.project) return;
    const dp = data.project(depot.lng, depot.lat);
    if (!pointVisible(dp.x, dp.y, canvas, visibilityTransform, 40)) return;
    ctx.save();
    ctx.translate(dp.x, dp.y);
    ctx.fillStyle = '#facc15';
    ctx.shadowColor = '#facc15'; ctx.shadowBlur = 10;
    ctx.fillRect(-7, -7, 14, 14);
    ctx.shadowBlur = 0;
    ctx.fillStyle = '#000';
    ctx.font = 'bold 7px Arial';
    ctx.textAlign = 'center';
    ctx.fillText('D', 0, 4);
    ctx.restore();
  });

  // Emergency path visualization (dashed lines)
  const emergencyVehiclesVis = sim.vehicles.filter((v) => ['ambulance', 'fire_truck', 'police'].includes(v.type) && !v.arrived);
  if (isRunning) {
    ctx.lineWidth = 3;
    ctx.setLineDash([5, 5]);
    emergencyVehiclesVis.forEach(ev => {
      ctx.strokeStyle = ev.type === 'ambulance' ? 'rgba(244, 63, 94, 0.5)' : 
                        ev.type === 'fire_truck' ? 'rgba(249, 115, 22, 0.5)' : 'rgba(59, 130, 246, 0.5)';
      ctx.beginPath();
      let started = false;
      for (let pi = ev.pathIndex; pi < ev.pathIds.length; pi += 1) {
        const n = data.graph[ev.pathIds[pi]];
        if (!n) continue;
        if (!started) { ctx.moveTo(ev.x, ev.y); started = true; }
        ctx.lineTo(n.x, n.y);
      }
      ctx.stroke();
    });
    ctx.setLineDash([]);
  }

  if (scenario && isRunning && sim.blockedEdges.size > 0) {
    const pulse = 0.7 + Math.sin(time / 250) * 0.3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    data.roads.forEach((road) => {
      const key = `${road.from}-${road.to}`;
      if (!sim.blockedEdges.has(key)) return;
      if (!rectVisible(road.minX, road.minY, road.maxX, road.maxY, canvas, visibilityTransform)) return;
      ctx.shadowColor = '#ff2222';
      ctx.shadowBlur = 18 * pulse;
      ctx.strokeStyle = `rgba(255, 40, 40, ${0.55 * pulse})`;
      ctx.lineWidth = 22;
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();
      ctx.shadowBlur = 8;
      ctx.strokeStyle = `rgba(255, 60, 60, ${0.85 * pulse})`;
      ctx.lineWidth = 14;
      ctx.beginPath();
      ctx.moveTo(road.x1, road.y1);
      ctx.lineTo(road.x2, road.y2);
      ctx.stroke();
      ctx.shadowBlur = 0;
    });
  }

  sim.vehicles.forEach((vehicle) => {
    if (vehicle.arrived) return;
    if (!pointVisible(vehicle.x, vehicle.y, canvas, visibilityTransform, 80)) return;

    ctx.save();
    ctx.translate(vehicle.x, vehicle.y);
    ctx.rotate(vehicle.angle);

    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    ctx.fillRect(-vehicle.length / 2 + 2, -vehicle.width / 2 + 2, vehicle.length, vehicle.width);

    const palette = ['#e0e0e0', '#2a2a2a', '#d32f2f', '#1976d2', '#388e3c', '#ff9800'];
    ctx.fillStyle = vehicle.dispatch ? vehicle.color : palette[Math.abs(vehicle.id.charCodeAt(4) || 0) % palette.length];
    ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2, vehicle.length, vehicle.width);

    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-vehicle.length / 4, -vehicle.width / 2 + 1, vehicle.length / 2, vehicle.width - 2);

    ctx.fillStyle = '#ffffcc';
    ctx.fillRect(vehicle.length / 2 - 2.5, -vehicle.width / 2 + 0.6, 2.5, 1.4);
    ctx.fillRect(vehicle.length / 2 - 2.5, vehicle.width / 2 - 2, 2.5, 1.4);

    if (vehicle.speed < 5) {
      ctx.fillStyle = '#ff1111';
      ctx.shadowColor = '#ff1111'; ctx.shadowBlur = 8;
      ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2 + 0.6, 2.5, 1.8);
      ctx.fillRect(-vehicle.length / 2, vehicle.width / 2 - 2.4, 2.5, 1.8);
      ctx.shadowBlur = 0;
    } else {
      ctx.fillStyle = '#880000';
      ctx.fillRect(-vehicle.length / 2, -vehicle.width / 2 + 0.6, 1.5, 1.8);
      ctx.fillRect(-vehicle.length / 2, vehicle.width / 2 - 2.4, 1.5, 1.8);
    }

    ctx.restore();

    // Draw the gigantic SOS arrow and sirens above dispatch vehicles
    if (vehicle.dispatch && isRunning) {
      ctx.save();
      ctx.translate(vehicle.x, vehicle.y);
      
      const bounce = Math.sin(time / 150) * 8;
      ctx.translate(0, -25 + bounce);

      ctx.shadowColor = '#000'; ctx.shadowBlur = 8;
      ctx.fillStyle = '#ff1111';
      ctx.beginPath();
      ctx.moveTo(0, 8);
      ctx.lineTo(-6, 0);
      ctx.lineTo(-2, 0);
      ctx.lineTo(-2, -10);
      ctx.lineTo(2, -10);
      ctx.lineTo(2, 0);
      ctx.lineTo(6, 0);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 10px Arial';
      ctx.textAlign = 'center';
      ctx.fillText('SOS', 0, -15);
      ctx.shadowBlur = 0;
      
      ctx.restore();

      ctx.save();
      ctx.translate(vehicle.x, vehicle.y);
      ctx.rotate(vehicle.angle);
      const isRed = Math.floor(time / 180) % 2 === 0;
      ctx.fillStyle = isRed ? '#ff0000' : '#0033ff';
      ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
      ctx.fillRect(-3, -2, 6, 4);
      ctx.shadowBlur = 0;
      ctx.restore();
    }
  });

  ctx.restore();
}

function isDrivableRoadFeature(feature) {
  return feature.geometry?.type === 'LineString' && DRIVABLE_HIGHWAYS.has(feature.properties?.highway);
}

function isBuildingFeature(feature) {
  return feature.geometry?.type === 'Polygon' && Boolean(feature.properties?.building);
}

function buildCityData(geojson) {
  let minLon = 180;
  let maxLon = -180;
  let minLat = 90;
  let maxLat = -90;

  const filteredFeatures = (geojson.features || []).filter((feature) => {
    if (!isDrivableRoadFeature(feature) && !isBuildingFeature(feature)) return false;
    const coords = feature.geometry?.type === 'LineString'
      ? feature.geometry.coordinates
      : (feature.geometry?.type === 'Polygon' ? feature.geometry.coordinates[0] : []);
    if (!coords || !coords.length) return false;
    const lon = coords[0][0];
    const lat = coords[0][1];
    return lat >= 41.875 && lat <= 41.890 && lon >= -87.645 && lon <= -87.620;
  });

  filteredFeatures.forEach((feature) => {
    const coords = feature.geometry?.type === 'LineString'
      ? feature.geometry.coordinates
      : feature.geometry?.type === 'Polygon'
        ? feature.geometry.coordinates[0]
        : [];
    coords.forEach((coord) => {
      minLon = Math.min(minLon, coord[0]);
      maxLon = Math.max(maxLon, coord[0]);
      minLat = Math.min(minLat, coord[1]);
      maxLat = Math.max(maxLat, coord[1]);
    });
  });

  const centerLon = (minLon + maxLon) / 2;
  const centerLat = (minLat + maxLat) / 2;
  const project = (lon, lat) => ({
    x: (lon - centerLon) * ROAD_SCALE * Math.cos(centerLat * Math.PI / 180),
    y: -(lat - centerLat) * ROAD_SCALE,
  });

  const graph = {};
  const roads = [];
  const buildings = [];
  let roadIndex = 0;

  filteredFeatures.forEach((feature) => {
    if (isDrivableRoadFeature(feature)) {
      let prevNode = null;
      feature.geometry.coordinates.forEach((coord) => {
        const point = project(coord[0], coord[1]);
        const id = `${Math.round(point.x)},${Math.round(point.y)}`;
        if (!graph[id]) graph[id] = { id, x: point.x, y: point.y, neighbors: [], occurrences: 0 };
        graph[id].occurrences += 1;
        const currentNode = graph[id];

        if (prevNode && prevNode.id !== currentNode.id) {
          if (!prevNode.neighbors.find((neighbor) => neighbor.id === currentNode.id)) {
            const distance = dist(prevNode, currentNode);
            const dx = currentNode.x - prevNode.x;
            const dy = currentNode.y - prevNode.y;
            const length = Math.hypot(dx, dy) || 1;
            prevNode.neighbors.push({ id: currentNode.id, distance });
            currentNode.neighbors.push({ id: prevNode.id, distance });
            roads.push({
              index: roadIndex,
              from: prevNode.id,
              to: currentNode.id,
              x1: prevNode.x,
              y1: prevNode.y,
              x2: currentNode.x,
              y2: currentNode.y,
              minX: Math.min(prevNode.x, currentNode.x),
              minY: Math.min(prevNode.y, currentNode.y),
              maxX: Math.max(prevNode.x, currentNode.x),
              maxY: Math.max(prevNode.y, currentNode.y),
              normalX: -dy / length,
              normalY: dx / length,
              kind: ['motorway', 'trunk', 'primary', 'secondary'].includes(feature.properties?.highway) || distance > 130 ? 'major' : 'minor',
            });
            roadIndex += 1;
          }
        }
        prevNode = currentNode;
      });
    }

    if (isBuildingFeature(feature)) {
      let minX = 99999;
      let maxX = -99999;
      let minY = 99999;
      let maxY = -99999;
      feature.geometry.coordinates[0].forEach((coord) => {
        const point = project(coord[0], coord[1]);
        minX = Math.min(minX, point.x);
        maxX = Math.max(maxX, point.x);
        minY = Math.min(minY, point.y);
        maxY = Math.max(maxY, point.y);
      });
      const w = Math.max(maxX - minX, 5);
      const d = Math.max(maxY - minY, 5);
      if (w <= 280 && d <= 280) buildings.push({ x: (minX + maxX) / 2, y: (minY + maxY) / 2, w, d });
    }
  });

  const nodeIds = Object.keys(graph);
  const intersections = nodeIds.map((id) => graph[id]).filter((node) => node.occurrences > 2);
  const spanX = Math.max(...nodeIds.map((id) => graph[id].x)) - Math.min(...nodeIds.map((id) => graph[id].x));
  const spanY = Math.max(...nodeIds.map((id) => graph[id].y)) - Math.min(...nodeIds.map((id) => graph[id].y));
  const maxSpan = Math.max(spanX, spanY) || 1;
  const initialZoom = Math.min(3.2, Math.max(0.6, 920 / maxSpan));
  const gridSize = 120;
  const roadGrid = {};
  roads.forEach((road) => {
    const minGX = Math.floor(road.minX / gridSize);
    const maxGX = Math.floor(road.maxX / gridSize);
    const minGY = Math.floor(road.minY / gridSize);
    const maxGY = Math.floor(road.maxY / gridSize);
    for (let gx = minGX; gx <= maxGX; gx += 1) {
      for (let gy = minGY; gy <= maxGY; gy += 1) {
        const key = toGridKey(gx * gridSize, gy * gridSize, gridSize);
        if (!roadGrid[key]) roadGrid[key] = [];
        roadGrid[key].push(road.index);
      }
    }
  });
  return { graph, roads, buildings: buildings.slice(0, 3200), intersections, nodeIds, project, initialZoom, roadGrid, gridSize };
}

export default function SimulationView() {
  const [cityData, setCityData] = useState(null);
  const [error, setError] = useState(null);
  const [engineSpeed, setEngineSpeed] = useState(1);
  const [selectedScenarioId, setSelectedScenarioId] = useState('flood');
  const [running, setRunning] = useState(false);
  const [arrivals, setArrivals] = useState(0);
  const [tmFeatures, setTmFeatures] = useState([]);

  useEffect(() => {
    let mounted = true;
    Promise.any([
      fetch('/export.geojson').then((response) => {
        if (!response.ok) throw new Error('export.geojson missing');
        return response.json();
      }),
      fetch('/chicago_map.geojson').then((response) => {
        if (!response.ok) throw new Error('chicago_map.geojson missing');
        return response.json();
      }),
    ])
      .then((geojson) => {
        if (!mounted) return;
        setCityData(buildCityData(geojson));
      })
      .catch((err) => {
        if (mounted) setError(String(err));
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTravelMidwestCongestion()
      .then((response) => {
        if (!cancelled) setTmFeatures(response.data?.features || []);
      })
      .catch(() => {
        if (!cancelled) setTmFeatures([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const selectedScenario = useMemo(
    () => SCENARIOS.find((scenario) => scenario.id === selectedScenarioId) || SCENARIOS[0],
    [selectedScenarioId],
  );

  const trafficState = useMemo(
    () => (cityData ? mapTravelMidwestToRoads(tmFeatures, cityData) : { roadTraffic: {}, pathWeights: {} }),
    [cityData, tmFeatures],
  );

  const stats = useMemo(() => ([
    { label: 'Ambient traffic', value: INITIAL_VEHICLES, tone: 'emerald' },
    { label: 'Supply routes', value: SUPPLY_DEPOTS.length, tone: 'amber' },
    { label: 'Arrivals', value: arrivals, tone: 'rose' },
  ]), [arrivals]);



  const triggerSimulation = () => {
    setArrivals(0);
    setRunning(false);
    window.setTimeout(() => setRunning(true), 50);
  };

  if (error) {
    return <div className="simulation-error">{error}</div>;
  }

  return (
    <section className="simulation-shell">
      <div className="simulation-intro">
        <div>
          <span className="simulation-kicker">Chicago Digital Twin</span>
          <h2>Supply Chain Disruption & Emergency Response Simulation</h2>
          <p>
            Simulates how a disaster blocks supply routes, disrupts deliveries, and forces
            emergency vehicles to find the fastest detour to Rush Medical Center.
          </p>
        </div>
        <div className="simulation-pill-row">
          <span className="simulation-pill simulation-pill-live">Live traffic</span>
          <span className="simulation-pill">Supply chain</span>
          <span className="simulation-pill">A* routing</span>
        </div>
      </div>

      <div className="simulation-layout-grid">
        <aside className="simulation-sidebar-card">
          <div className="simulation-panel">
            <div className="simulation-panel-header">
              <div>
                <span className="simulation-section-kicker">Playback</span>
                <h3>Engine Speed</h3>
              </div>
            </div>
            <div className="simulation-speed-grid">
              {[1, 5, 10].map((speed) => (
                <button
                  key={speed}
                  type="button"
                  className={`simulation-chip ${engineSpeed === speed ? 'active' : ''}`}
                  onClick={() => setEngineSpeed(speed)}
                >
                  {speed}x
                </button>
              ))}
            </div>
          </div>

          <div className="simulation-panel">
            <div className="simulation-panel-header">
              <div>
                <span className="simulation-section-kicker">Scenario</span>
                <h3>Disaster Control</h3>
              </div>
            </div>
            <div className="simulation-button-stack">
              {SCENARIOS.map((scenario) => (
                <button
                  key={scenario.id}
                  type="button"
                  className={`simulation-list-button ${selectedScenarioId === scenario.id ? 'active' : ''}`}
                  style={selectedScenarioId === scenario.id ? { '--sim-accent': scenario.color } : undefined}
                  onClick={() => setSelectedScenarioId(scenario.id)}
                >
                  <span>{scenario.label}</span>
                  <small>{Math.round(scenario.radius)}m zone</small>
                </button>
              ))}
            </div>
            <p className="simulation-description">{selectedScenario.description}</p>
          </div>



          <div className="simulation-panel">
            <div className="simulation-panel-header">
              <div>
                <span className="simulation-section-kicker">Actions</span>
                <h3>Run Control</h3>
              </div>
            </div>
            <div className="simulation-action-row">
              <button type="button" className="simulation-primary-btn" onClick={triggerSimulation}>
                Run Simulation
              </button>
              <button
                type="button"
                className="simulation-secondary-btn"
                onClick={() => {
                  setRunning(false);
                  setArrivals(0);
                }}
              >
                Reset
              </button>
            </div>
          </div>

          <div className="simulation-stats-grid">
            {stats.map((item) => (
              <div key={item.label} className={`simulation-stat-card ${item.tone}`}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>

          <div style={{ marginTop: '1rem', display: 'flex', flex: 1, minHeight: 0 }}>
            <AISummaryPanel autoFetch={true} />
          </div>
        </aside>

        <div className="simulation-map-card">
          <div className="simulation-map-toolbar">
            <div>
              <span className="simulation-section-kicker">Simulation Feed</span>
              <h3>Chicago Traffic Grid</h3>
            </div>
            <div className="simulation-toolbar-badges">
              <span className={`simulation-status-badge ${running ? 'active' : ''}`}>
                {running ? 'Scenario running' : 'Ambient traffic'}
              </span>
              <span className="simulation-status-badge mono">{INITIAL_VEHICLES}+ vehicles</span>
            </div>
          </div>

          <div className="simulation-map-stage">
            {cityData ? (
              <SimulationCanvas
                data={cityData}
                engineSpeed={engineSpeed}
                scenario={selectedScenario}
                running={running}
                onArrivals={setArrivals}
                trafficState={trafficState}
              />
            ) : (
              <div className="simulation-loading">Initializing Chicago digital twin...</div>
            )}

            <div className="simulation-map-overlay top-left">
              <span>Pan to inspect corridors</span>
              <span>Scroll to zoom</span>
            </div>

            <div className="simulation-map-overlay bottom-right">
              <span className="legend-item"><i className="legend-dot traffic" /> Moving traffic</span>
              <span className="legend-item"><i className="legend-dot hazard" /> Blocked roads</span>
              <span className="legend-item"><i style={{background:'#38bdf8',width:16,height:3,display:'inline-block',borderRadius:2,verticalAlign:'middle',marginRight:4}} /> Ambulance path</span>
              <span className="legend-item"><i style={{background:'#ef4444',width:8,height:8,display:'inline-block',borderRadius:'50%',verticalAlign:'middle',marginRight:4}} /> Hospital</span>
              <span className="legend-item"><i style={{background:'#facc15',width:8,height:8,display:'inline-block',verticalAlign:'middle',marginRight:4}} /> Supply depot</span>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
