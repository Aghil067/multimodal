import React, { useRef, useEffect, useState } from 'react';

// --- Simulation Constants ---
const MAX_VEHICLES = 350;

// --- A* Pathfinding with Dynamic Edge Weights ---
const findPath = (startId, endId, graph, edgeWeights) => {
    if (!graph[startId] || !graph[endId]) return [];

    const openSet = [startId];
    const cameFrom = {};
    const gScore = {};
    const fScore = {};

    for (let id in graph) {
        gScore[id] = Infinity;
        fScore[id] = Infinity;
    }

    gScore[startId] = 0;
    fScore[startId] = Math.hypot(graph[endId].x - graph[startId].x, graph[endId].y - graph[startId].y);

    while (openSet.length > 0) {
        let current = openSet[0];
        let minF = fScore[current];
        let minIdx = 0;
        for (let i = 1; i < openSet.length; i++) {
            if (fScore[openSet[i]] < minF) {
                minF = fScore[openSet[i]];
                current = openSet[i];
                minIdx = i;
            }
        }

        if (current === endId) {
            const path = [current];
            let curr = current;
            while (cameFrom[curr]) {
                curr = cameFrom[curr];
                path.unshift(curr);
            }
            return path.map(id => graph[id]);
        }

        openSet.splice(minIdx, 1);
        const currNode = graph[current];

        currNode.neighbors.forEach(neighbor => {
            const edgeKey1 = `${current}-${neighbor.id}`;
            const edgeKey2 = `${neighbor.id}-${current}`;
            const baseWeight = Math.hypot(neighbor.x - currNode.x, neighbor.y - currNode.y);
            const congestionFactor = (edgeWeights[edgeKey1] || edgeWeights[edgeKey2] || 0) / 100;
            const weight = baseWeight * (1 + congestionFactor * 2); // Heavy penalty for congestion

            const tentativeG = gScore[current] + weight;

            if (tentativeG < gScore[neighbor.id]) {
                cameFrom[neighbor.id] = current;
                gScore[neighbor.id] = tentativeG;
                fScore[neighbor.id] = tentativeG + Math.hypot(graph[endId].x - neighbor.x, graph[endId].y - neighbor.y);
                if (!openSet.includes(neighbor.id)) {
                    openSet.push(neighbor.id);
                }
            }
        });
    }
    return [];
};

// --- Lightweight ML Model ---
class TrafficPredictor {
    constructor() {
        this.historical = {};
        this.globalAvg = { vol: 20000, cong: 50, speed: 40 };
        this.isTrained = false;
    }

    train(data) {
        let totalVol = 0, totalCong = 0, totalSpeed = 0, count = 0;
        data.forEach(row => {
            // "Date","Area Name","Road/Intersection Name","Traffic Volume","Average Speed","Travel Time Index","Congestion Level"
            let vol = parseFloat(row['Traffic Volume']);
            let cong = parseFloat(row['Congestion Level']);
            let spd = parseFloat(row['Average Speed']);
            if (!isNaN(vol)) totalVol += vol;
            if (!isNaN(cong)) totalCong += cong;
            if (!isNaN(spd)) totalSpeed += spd;
            if (!isNaN(vol) || !isNaN(cong) || !isNaN(spd)) count++;
        });

        if (count > 0) {
            this.globalAvg = {
                vol: totalVol / count,
                cong: totalCong / count,
                speed: totalSpeed / count
            };
        }
        this.isTrained = true;
    }

    predict(dateStr, timeStr) {
        if (!this.isTrained) return { congestion: 50, speed: 30, volume: 10000 };

        // Synthesize a time-series curve based on hour
        let hr = 12;
        if (timeStr) {
            const parts = timeStr.split(':');
            if (parts.length >= 2) hr = parseInt(parts[0], 10) + parseInt(parts[1], 10) / 60;
        }

        // Bimodal distribution for peak hours (9 AM and 6 PM)
        const peak1 = Math.exp(-0.5 * Math.pow((hr - 9) / 2.0, 2));
        const peak2 = Math.exp(-0.5 * Math.pow((hr - 18) / 2.5, 2));
        const timeMultiplier = 0.4 + 0.8 * peak1 + 1.0 * peak2; // Ranges from ~0.4 to ~1.4

        const date = new Date(dateStr);
        let dayMultiplier = 1.0;
        if (date && (date.getDay() === 0 || date.getDay() === 6)) {
            dayMultiplier = 0.7; // Weekends are lighter
        }

        const totalMultiplier = timeMultiplier * dayMultiplier;

        return {
            congestion: Math.min(100, Math.max(0, this.globalAvg.cong * totalMultiplier)),
            speed: Math.max(5, this.globalAvg.speed / Math.max(0.5, totalMultiplier)),
            volume: this.globalAvg.vol * totalMultiplier * 0.005 // Scaled down for sim count
        };
    }
}

const predictor = new TrafficPredictor();

const CityCanvasRenderer = ({ data, trafficData, simulationSpeed, hasEmergency, mode, predictDate, predictTime }) => {
    const canvasRef = useRef(null);
    const requestRef = useRef();

    // Core Simulation Data
    const simData = useRef({
        vehicles: [],
        pedestrians: [],
        signals: {},
        edgeWeights: {}, // dynamic congestion distribution
        emergency: { active: false, x: 0, y: 0, path: [], timeSaved: 0, normTime: 0, optTime: 0 },
        metrics: { totalSpeed: 0, count: 0, predictedCongestion: 0, avgSpeed: 0 },
        liveStats: { congestion: 0, speed: 0, count: 0 },
        targetVehicleCount: 150
    });

    // Interaction Data
    const transform = useRef({ x: 0, y: 0, k: 1 });
    const isDragging = useRef(false);
    const dragStart = useRef({ x: 0, y: 0 });

    useEffect(() => {
        // Pre-train model
        if (trafficData && trafficData.length > 0) {
            predictor.train(trafficData);
        }

        const { graph, intersections, roads } = data;
        const nodeList = Object.values(graph);
        if (nodeList.length === 0) return;

        const edgeWeights = {};
        roads.forEach(r => {
            const key = `${Math.round(r.x1)},${Math.round(r.y1)}-${Math.round(r.x2)},${Math.round(r.y2)}`;
            edgeWeights[key] = 20; // Base 20% congestion
        });

        const signals = {};
        intersections.forEach(iNode => {
            signals[iNode.id] = { state: Math.floor(Math.random() * 4), timer: Math.random() * 8, baseGreen: 8 };
        });

        simData.current.signals = signals;
        simData.current.edgeWeights = edgeWeights;

        spawnVehicles(100);

    }, [data, trafficData]);

    const getPrediction = () => {
        if (mode === 'predicted' && predictDate && predictTime) {
            return predictor.predict(predictDate, predictTime);
        } else {
            // Live mode simulates current local time
            const now = new Date();
            const timeStr = `${now.getHours()}:${now.getMinutes()}`;
            return predictor.predict(now.toISOString(), timeStr);
        }
    };

    const spawnVehicles = (count) => {
        const { graph } = data;
        const nodeList = Object.values(graph);
        const vehicles = simData.current.vehicles;

        for (let i = 0; i < count; i++) {
            if (vehicles.length >= MAX_VEHICLES) break;
            const startNode = nodeList[Math.floor(Math.random() * nodeList.length)];
            const endNode = nodeList[Math.floor(Math.random() * nodeList.length)];
            const r = Math.random();
            const type = r > 0.85 ? 'bus' : (r > 0.7 ? 'bike' : 'car');
            const color = type === 'bus' ? '#ff9800' :
                type === 'bike' ? '#03a9f4' :
                    ['#e0e0e0', '#2a2a2a', '#d32f2f', '#1976d2', '#388e3c'][Math.floor(Math.random() * 5)];

            const path = findPath(startNode.id, endNode.id, graph, simData.current.edgeWeights);
            vehicles.push({
                id: Math.random().toString(36).substr(2, 9),
                type,
                currentNode: startNode,
                nextNode: path.length > 1 ? path[1] : (startNode.neighbors[0] || startNode),
                targetEndNode: endNode,
                path: path,
                pathIndex: 1,
                progress: Math.random(),
                speed: 0,
                maxSpeed: type === 'bus' ? 20 : (type === 'bike' ? 45 : 35),
                color,
                width: type === 'bus' ? 8 : (type === 'bike' ? 3 : 5),
                length: type === 'bus' ? 18 : (type === 'bike' ? 6 : 10),
                x: startNode.x,
                y: startNode.y,
                angle: 0,
                reRouteTimer: Math.random() * 5
            });
        }
    };

    // Main Simulation Loop
    const updateSimulation = (dt) => {
        const { graph, intersections, roads } = data;
        const { vehicles, signals, emergency, edgeWeights } = simData.current;

        const prediction = getPrediction();
        simData.current.targetVehicleCount = Math.min(MAX_VEHICLES, Math.max(50, Math.floor(prediction.volume)));

        // Spawning based on dataset target
        if (vehicles.length < simData.current.targetVehicleCount && Math.random() < 0.1) {
            spawnVehicles(1);
        }

        // Apply prediction generically to edge weights to reflect map congestion
        for (let key in edgeWeights) {
            // Drift edges towards the target predicted congestion level + some noise
            const noise = (Math.random() * 20) - 10;
            const targetWeight = Math.max(0, Math.min(100, prediction.congestion + noise));
            edgeWeights[key] += (targetWeight - edgeWeights[key]) * 0.05 * dt;
        }

        let totalSpeed = 0;

        // Emergency Logic
        if (hasEmergency) {
            if (!emergency.active) {
                const nodeList = Object.values(graph);
                if (nodeList.length > 0) {
                    const start = nodeList[Math.floor(Math.random() * nodeList.length)];
                    const end = nodeList[Math.floor(Math.random() * nodeList.length)];

                    const optPath = findPath(start.id, end.id, graph, edgeWeights);
                    // Mock normal path without congestion weights for comparison
                    const normPath = findPath(start.id, end.id, graph, {});

                    emergency.active = true;
                    emergency.x = start.x;
                    emergency.y = start.y;
                    emergency.path = optPath;
                    emergency.pathIndex = 1;
                    emergency.targetEndNode = end;
                    emergency.currentNode = start;
                    emergency.nextNode = optPath.length > 1 ? optPath[1] : start;
                    emergency.timeSaved = 0;
                    emergency.normTime = normPath.length * 4;
                    emergency.optTime = optPath.length * 2.5;
                }
            } else if (emergency.nextNode) {
                const dx = emergency.nextNode.x - emergency.x;
                const dy = emergency.nextNode.y - emergency.y;
                const dist = Math.hypot(dx, dy);
                const step = 90 * dt;

                emergency.normTime -= dt;
                emergency.optTime -= dt * 1.5;
                emergency.timeSaved = Math.max(0, emergency.normTime - Math.max(0, emergency.optTime));

                if (dist < step) {
                    emergency.x = emergency.nextNode.x;
                    emergency.y = emergency.nextNode.y;
                    emergency.currentNode = emergency.nextNode;
                    emergency.pathIndex++;
                    if (emergency.pathIndex < emergency.path.length) {
                        emergency.nextNode = emergency.path[emergency.pathIndex];
                    } else {
                        emergency.active = false;
                        emergency.nextNode = null;
                    }
                } else {
                    emergency.x += (dx / dist) * step;
                    emergency.y += (dy / dist) * step;
                }
            }
        } else {
            emergency.active = false;
        }

        // Update Signals
        intersections.forEach(iNode => {
            const s = signals[iNode.id];
            if (!s) return;
            s.timer -= dt;

            // Adaptive Green based on prediction
            const adaptiveGreen = Math.min(20, s.baseGreen + (prediction.congestion * 0.1));

            if (s.timer <= 0) {
                s.state = (s.state + 1) % 4;
                s.timer = (s.state === 1 || s.state === 3) ? 2 : adaptiveGreen;
            }

            if (hasEmergency && emergency.active) {
                if (Math.hypot(iNode.x - emergency.x, iNode.y - emergency.y) < 200) {
                    s.state = 0;
                    s.timer = 5;
                }
            }
        });

        // Track spatial positions
        const roadSegments = {};
        for (let i = vehicles.length - 1; i >= 0; i--) {
            const v = vehicles[i];
            if (!v.nextNode) continue;
            const key = `${v.currentNode.id}-${v.nextNode.id}`;
            if (!roadSegments[key]) roadSegments[key] = [];
            roadSegments[key].push(v);
        }

        // Update Vehicles
        for (let i = vehicles.length - 1; i >= 0; i--) {
            const v = vehicles[i];
            if (!v.nextNode) {
                vehicles.splice(i, 1);
                continue;
            }

            const dx = v.nextNode.x - v.currentNode.x;
            const dy = v.nextNode.y - v.currentNode.y;
            const dist = Math.hypot(dx, dy);

            if (dist === 0) {
                v.progress = 1;
            } else {
                const dirX = dx / dist;
                const dirY = dy / dist;

                const key1 = `${v.currentNode.id}-${v.nextNode.id}`;
                const key2 = `${v.nextNode.id}-${v.currentNode.id}`;
                const density = edgeWeights[key1] || edgeWeights[key2] || 0;

                // Realism constraint: Max speed capped by simulated prediction speed
                const maxAllowed = Math.min(v.maxSpeed, prediction.speed);
                const densitySlowdown = Math.max(0.2, 1 - (density / 100)); // Reds cause heavy crawling

                let targetSpeed = maxAllowed * densitySlowdown;

                const isEW = Math.abs(dx) > Math.abs(dy);
                const remDist = dist * (1 - v.progress);

                if (signals[v.nextNode.id]) {
                    const s = signals[v.nextNode.id];
                    const isGreen = isEW ? (s.state === 2) : (s.state === 0);
                    const isYellow = isEW ? (s.state === 3) : (s.state === 1);

                    if (!isGreen) {
                        if (isYellow && remDist < 60) targetSpeed *= 0.5;
                        else if (remDist < 40 && remDist > 0.5) targetSpeed = 0;
                    }
                }

                if (hasEmergency && emergency.active) {
                    const myX = v.currentNode.x + dirX * (dist * v.progress);
                    const myY = v.currentNode.y + dirY * (dist * v.progress);
                    if (Math.hypot(myX - emergency.x, myY - emergency.y) < 120) {
                        targetSpeed = 0; // Hard yield for ambulance
                    }
                }

                // Collision Avoidance
                const segmentVehicles = roadSegments[`${v.currentNode.id}-${v.nextNode.id}`];
                if (segmentVehicles) {
                    for (let j = 0; j < segmentVehicles.length; j++) {
                        const v2 = segmentVehicles[j];
                        if (v.id === v2.id) continue;
                        if (v2.progress > v.progress) {
                            const distToV2 = (v2.progress - v.progress) * dist;
                            const safeDist = (v.speed * 0.6) + (v.length / 2 + v2.length / 2) + 6;
                            if (distToV2 < safeDist) {
                                targetSpeed = 0;
                            } else if (distToV2 < safeDist * 1.5) {
                                targetSpeed = Math.min(targetSpeed, v2.speed);
                            }
                        }
                    }
                }

                const accel = targetSpeed > v.speed ? 12 : 30;
                v.speed += (targetSpeed - v.speed) * (accel * dt) / Math.max(1, v.speed);
                if (Math.abs(v.speed - targetSpeed) < 1) v.speed = targetSpeed;
                if (v.speed < 0) v.speed = 0;

                totalSpeed += v.speed;
                v.progress += (v.speed * dt) / dist;

                // Dynamic A* Re-routing when stuck
                v.reRouteTimer -= dt;
                if (v.reRouteTimer <= 0 && v.path.length > 0 && targetSpeed < 5 && Math.random() < 0.2) {
                    v.path = findPath(v.currentNode.id, v.targetEndNode.id, graph, edgeWeights);
                    v.pathIndex = 1;
                    if (v.path.length > 1) v.nextNode = v.path[1];
                    v.reRouteTimer = 10;
                }

                if (v.progress >= 1) {
                    v.progress = 0;
                    v.currentNode = v.nextNode;
                    v.pathIndex++;
                    if (v.path && v.pathIndex < v.path.length) {
                        v.nextNode = v.path[v.pathIndex];
                    } else if (v.currentNode.neighbors.length > 0) {
                        v.nextNode = v.currentNode.neighbors[Math.floor(Math.random() * v.currentNode.neighbors.length)];
                        v.targetEndNode = v.currentNode;
                    } else {
                        v.nextNode = null;
                    }
                }

                v.x = v.currentNode.x + dirX * (dist * v.progress);
                v.y = v.currentNode.y + dirY * (dist * v.progress);
                v.angle = Math.atan2(dy, dx);
            }
        }

        simData.current.liveStats = {
            count: vehicles.length,
            speed: vehicles.length > 0 ? totalSpeed / vehicles.length : 0,
            congestion: prediction.congestion
        };
    };

    const renderScene = (ctx, canvas) => {
        ctx.clearRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = '#1c1e19';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.save();
        ctx.translate(canvas.width / 2 + transform.current.x, canvas.height / 2 + transform.current.y);
        ctx.scale(transform.current.k, transform.current.k);

        const { roads, buildings, intersections } = data;
        const { vehicles, signals, emergency, edgeWeights } = simData.current;

        ctx.shadowColor = 'rgba(0,0,0,0.6)';
        ctx.shadowBlur = 10;
        buildings.forEach(b => {
            ctx.fillStyle = '#3a4042';
            ctx.fillRect(b.x - b.w / 2, b.y - b.d / 2, b.w, b.d);
            ctx.strokeStyle = '#4a5052';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(b.x - b.w / 2, b.y - b.d / 2, b.w, b.d);
        });
        ctx.shadowBlur = 0;

        const activeCounts = {};
        vehicles.forEach(v => {
            if (v.currentNode && v.nextNode) {
                const k = `${v.currentNode.id}-${v.nextNode.id}`;
                activeCounts[k] = (activeCounts[k] || 0) + 1;
            }
        });

        // Draw Roads & Congestion Coloration
        roads.forEach(r => {
            const dx = r.x2 - r.x1;
            const dy = r.y2 - r.y1;
            const len = Math.hypot(dx, dy);

            ctx.lineWidth = 14;
            ctx.strokeStyle = '#333333';
            ctx.lineCap = 'butt';
            ctx.beginPath();
            ctx.moveTo(r.x1, r.y1);
            ctx.lineTo(r.x2, r.y2);
            ctx.stroke();

            // Dataset & Live Mixed Congestion Overlays
            const k1 = `${Math.round(r.x1)},${Math.round(r.y1)}-${Math.round(r.x2)},${Math.round(r.y2)}`;
            const k2 = `${Math.round(r.x2)},${Math.round(r.y2)}-${Math.round(r.x1)},${Math.round(r.y1)}`;
            const baseWeight = edgeWeights[k1] || edgeWeights[k2] || 0;
            const activeVehicles = (activeCounts[k1] || 0) + (activeCounts[k2] || 0);

            // Mix predicting ML weight (30%) + Live Vehicles (heavy multiplier)
            const density = (baseWeight * 0.3) + (activeVehicles * 15);

            if (density > 15) {
                if (density > 50) ctx.strokeStyle = 'rgba(255, 30, 30, 0.6)'; // RED
                else if (density > 25) ctx.strokeStyle = 'rgba(255, 200, 30, 0.5)'; // YELLOW
                else ctx.strokeStyle = 'rgba(30, 255, 30, 0.2)'; // GREEN

                ctx.lineWidth = 8;
                ctx.beginPath();
                ctx.moveTo(r.x1, r.y1);
                ctx.lineTo(r.x2, r.y2);
                ctx.stroke();
            }

            ctx.lineWidth = 1;
            ctx.strokeStyle = '#dddddd';
            ctx.setLineDash([6, 10]);
            ctx.beginPath();
            ctx.moveTo(r.x1, r.y1);
            ctx.lineTo(r.x2, r.y2);
            ctx.stroke();
            ctx.setLineDash([]);
        });

        const timeOffset = Date.now() / 1000;
        buildings.forEach((b, i) => {
            if (i % 4 === 0) {
                ctx.fillStyle = '#388e3c';
                ctx.beginPath();
                ctx.arc(b.x + b.w / 2 + 5, b.y, 4 + Math.sin(timeOffset + i) * 0.3, 0, Math.PI * 2);
                ctx.fill();
            }
        });

        // Draw Signals (No Zebra Crossings as requested)
        intersections.forEach(iNode => {
            const s = signals[iNode.id];
            if (s) {
                // Stop Lines only
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 2;
                iNode.neighbors.forEach(n => {
                    const angle = Math.atan2(n.y - iNode.y, n.x - iNode.x);
                    const stopX = iNode.x + Math.cos(angle) * 12;
                    const stopY = iNode.y + Math.sin(angle) * 12;
                    ctx.save();
                    ctx.translate(stopX, stopY);
                    ctx.rotate(angle + Math.PI / 2);
                    ctx.beginPath();
                    ctx.moveTo(-6, 0);
                    ctx.lineTo(6, 0);
                    ctx.stroke();
                    ctx.restore();
                });

                ctx.save();
                ctx.translate(iNode.x + Math.sin(iNode.id.length) * 10, iNode.y - 12);
                ctx.fillStyle = '#111';
                ctx.fillRect(-3, -10, 6, 20);

                ctx.beginPath(); ctx.arc(0, -6, 2, 0, Math.PI * 2);
                ctx.fillStyle = (s.state === 2 || s.state === 3) ? '#ff0000' : '#440000';
                if (s.state === 2 || s.state === 3) { ctx.shadowColor = '#ff3333'; ctx.shadowBlur = 10; }
                ctx.fill(); ctx.shadowBlur = 0;

                ctx.beginPath(); ctx.arc(0, 0, 2, 0, Math.PI * 2);
                ctx.fillStyle = (s.state === 1 || s.state === 3) ? '#ffea00' : '#444400';
                if (s.state === 1 || s.state === 3) { ctx.shadowColor = '#ffea00'; ctx.shadowBlur = 10; }
                ctx.fill(); ctx.shadowBlur = 0;

                ctx.beginPath(); ctx.arc(0, 6, 2, 0, Math.PI * 2);
                ctx.fillStyle = (s.state === 0 || s.state === 2) ? '#00e676' : '#004400';
                if (s.state === 0 || s.state === 2) { ctx.shadowColor = '#00e676'; ctx.shadowBlur = 10; }
                ctx.fill(); ctx.shadowBlur = 0;

                ctx.restore();
            }
        });

        if (hasEmergency && emergency.active) {
            ctx.lineWidth = 3;
            ctx.strokeStyle = 'rgba(100, 200, 255, 0.4)';
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            if (emergency.currentNode) ctx.moveTo(emergency.currentNode.x, emergency.currentNode.y);
            emergency.path.forEach(pn => ctx.lineTo(pn.x, pn.y));
            ctx.stroke();
            ctx.setLineDash([]);
        }

        vehicles.forEach(v => {
            if (v.x === undefined) return;
            ctx.save();
            ctx.translate(v.x, v.y);
            ctx.rotate(v.angle);

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(-v.length / 2 + 2, -v.width / 2 + 2, v.length, v.width);

            ctx.fillStyle = v.color;
            if (v.type === 'bike') {
                ctx.beginPath();
                ctx.ellipse(0, 0, v.length / 2, v.width / 2, 0, 0, Math.PI * 2);
                ctx.fill();
                ctx.fillStyle = '#000';
                ctx.beginPath(); ctx.arc(0, 0, 1.5, 0, Math.PI * 2); ctx.fill();
            } else {
                ctx.fillRect(-v.length / 2, -v.width / 2, v.length, v.width);
                ctx.fillStyle = 'rgba(0,0,0,0.2)';
                ctx.fillRect(-v.length / 4, -v.width / 2 + 1, v.length / 2, v.width - 2);

                ctx.fillStyle = '#ffffcc';
                ctx.fillRect(v.length / 2 - 2, -v.width / 2 + 0.5, 2, 1);
                ctx.fillRect(v.length / 2 - 2, v.width / 2 - 1.5, 2, 1);

                if (v.speed < 5) {
                    ctx.fillStyle = '#ff1111';
                    ctx.shadowColor = '#ff1111'; ctx.shadowBlur = 6;
                    ctx.fillRect(-v.length / 2, -v.width / 2 + 0.5, 2, 1.5);
                    ctx.fillRect(-v.length / 2, v.width / 2 - 2, 2, 1.5);
                    ctx.shadowBlur = 0;
                }
            }
            ctx.restore();
        });

        if (hasEmergency && emergency.active) {
            ctx.save();
            const angle = Math.atan2(emergency.nextNode?.y - emergency.y, emergency.nextNode?.x - emergency.x) || 0;
            ctx.translate(emergency.x, emergency.y);

            // Giant Bouncing Locator Arrow so people spot the Ambulance!
            ctx.save();
            const bounce = Math.sin(Date.now() / 150) * 8;
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

            ctx.rotate(angle);

            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillRect(-8, -3, 20, 10);

            ctx.fillStyle = '#ffffff';
            ctx.fillRect(-10, -5, 20, 10);

            ctx.fillStyle = '#ff0000';
            ctx.fillRect(-2, -4, 4, 8);
            ctx.fillRect(-4, -2, 8, 4);

            const isRed = Date.now() % 300 > 150;
            ctx.fillStyle = isRed ? '#ff0000' : '#0033ff';
            ctx.shadowColor = ctx.fillStyle; ctx.shadowBlur = 18;
            ctx.fillRect(-3, -2, 6, 4);
            ctx.shadowBlur = 0;

            ctx.fillStyle = 'rgba(255, 255, 255, 0.2)';
            ctx.beginPath();
            ctx.moveTo(10, 0);
            ctx.lineTo(80, -35);
            ctx.lineTo(80, 35);
            ctx.fill();

            ctx.restore();
        }

        ctx.restore();
    };

    const animate = (time) => {
        const dt = Math.min((time - (simData.current.lastTime || time)) / 1000, 0.1) * (simulationSpeed || 1);
        simData.current.lastTime = time;

        updateSimulation(dt);

        const canvas = canvasRef.current;
        if (canvas) {
            if (canvas.width !== canvas.clientWidth || canvas.height !== canvas.clientHeight) {
                canvas.width = canvas.clientWidth;
                canvas.height = canvas.clientHeight;
            }
            const ctx = canvas.getContext('2d');
            renderScene(ctx, canvas);
        }

        if (time - (simData.current.lastMetricTime || 0) > 500) {
            simData.current.lastMetricTime = time;
            const { count, speed, congestion } = simData.current.liveStats;
            const em = simData.current.emergency;

            window.SIM_STATS = {
                vehicles: count,
                avgSpeed: Math.round(speed * 1.5), // km/h scaled
                congestion: Math.round(congestion),
                co2: (count * (speed * 0.1) * 2).toFixed(1),
                emergencyEtaSaved: hasEmergency && em.active ? Math.max(0, Math.round(em.timeSaved)) : "-"
            };
            window.dispatchEvent(new Event('simStatsUpdated'));
        }

        requestRef.current = requestAnimationFrame(animate);
    };

    useEffect(() => {
        requestRef.current = requestAnimationFrame(animate);
        return () => cancelAnimationFrame(requestRef.current);
    }, [simulationSpeed, hasEmergency, mode, predictDate, predictTime, trafficData]);

    const handleWheel = (e) => {
        e.preventDefault();
        const newK = Math.max(0.1, Math.min(transform.current.k * Math.exp(-e.deltaY * 0.001), 10));
        transform.current.k = newK;
    };

    const handleMouseDown = (e) => {
        isDragging.current = true;
        dragStart.current = { x: e.clientX - transform.current.x, y: e.clientY - transform.current.y };
    };

    const handleMouseMove = (e) => {
        if (!isDragging.current) return;
        transform.current.x = e.clientX - dragStart.current.x;
        transform.current.y = e.clientY - dragStart.current.y;
    };

    const handleMouseUp = () => isDragging.current = false;

    useEffect(() => {
        const c = canvasRef.current;
        if (c) {
            c.addEventListener('wheel', handleWheel, { passive: false });
            c.addEventListener('mousedown', handleMouseDown);
            window.addEventListener('mousemove', handleMouseMove);
            window.addEventListener('mouseup', handleMouseUp);
        }
        return () => {
            if (c) {
                c.removeEventListener('wheel', handleWheel);
                c.removeEventListener('mousedown', handleMouseDown);
            }
            window.removeEventListener('mousemove', handleMouseMove);
            window.removeEventListener('mouseup', handleMouseUp);
        };
    }, []);

    return <canvas ref={canvasRef} style={{ width: '100%', height: '100%', display: 'block', cursor: isDragging.current ? 'grabbing' : 'grab' }} />;
};

// Helper for HUD updates
const useForceUpdate = () => {
    const [, setValue] = useState(0);
    return () => setValue(value => value + 1);
};

// CSV Parser Helper
const parseCSV = (csvText) => {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) return [];
    const headers = lines[0].split(',');
    return lines.slice(1).map(line => {
        const values = line.split(',');
        const obj = {};
        headers.forEach((h, i) => {
            if (h) obj[h.trim()] = values[i] ? values[i].trim() : null;
        });
        return obj;
    });
};

// Main Export Component
const SimulationView = ({ simulationSpeed, hasEmergency }) => {
    const [cityData, setCityData] = useState(null);
    const [trafficData, setTrafficData] = useState(null);
    const [error, setError] = useState(null);

    // Dashboard Controls
    const [mode, setMode] = useState('live'); // 'live' or 'predicted'
    const [predictDate, setPredictDate] = useState('2022-04-01');
    const [predictTime, setPredictTime] = useState('18:00');

    useEffect(() => {
        let mounted = true;

        Promise.all([
            fetch('/map.geojson').then(r => r.json()),
            fetch('/datasets/indiranagar_traffic.csv').then(r => r.text()).catch(e => {
                console.warn("Could not load traffic csv dataset", e);
                return "";
            })
        ]).then(([geojson, csvText]) => {
            if (!mounted) return;

            if (csvText) {
                const parsedData = parseCSV(csvText);
                setTrafficData(parsedData);
            }

            let minLon = 180, maxLon = -180, minLat = 90, maxLat = -90;
            geojson.features.forEach(f => {
                const coords = f.geometry && f.geometry.type === 'LineString' ? f.geometry.coordinates :
                    f.geometry && f.geometry.type === 'Polygon' ? f.geometry.coordinates[0] : [];
                coords.forEach(c => {
                    if (c[0] < minLon) minLon = c[0];
                    if (c[0] > maxLon) maxLon = c[0];
                    if (c[1] < minLat) minLat = c[1];
                    if (c[1] > maxLat) maxLat = c[1];
                });
            });

            const cx = (minLon + maxLon) / 2;
            const cy = (minLat + maxLat) / 2;
            const SCALE = 200000;

            const project = (lon, lat) => ({
                x: (lon - cx) * SCALE * Math.cos(cy * Math.PI / 180),
                y: -(lat - cy) * SCALE
            });

            const nodes = {};
            const roads = [];
            const buildings = [];

            geojson.features.forEach((f) => {
                if (f.geometry && f.geometry.type === 'LineString') {
                    let prevNode = null;
                    f.geometry.coordinates.forEach(coord => {
                        const p = project(coord[0], coord[1]);
                        const id = `${Math.round(p.x)},${Math.round(p.y)}`;
                        if (!nodes[id]) nodes[id] = { id, x: p.x, y: p.y, neighbors: [], occurences: 0 };
                        nodes[id].occurences++;
                        const currNode = nodes[id];

                        if (prevNode && prevNode.id !== currNode.id) {
                            if (!prevNode.neighbors.find(n => n.id === currNode.id)) {
                                prevNode.neighbors.push(currNode);
                                currNode.neighbors.push(prevNode);
                                roads.push({ x1: prevNode.x, y1: prevNode.y, x2: currNode.x, y2: currNode.y });
                            }
                        }
                        prevNode = currNode;
                    });
                }

                if (f.geometry && f.geometry.type === 'Polygon') {
                    let bMinX = 99999, bMaxX = -99999, bMinY = 99999, bMaxY = -99999;
                    f.geometry.coordinates[0].forEach(coord => {
                        const p = project(coord[0], coord[1]);
                        if (p.x < bMinX) bMinX = p.x; if (p.x > bMaxX) bMaxX = p.x;
                        if (p.y < bMinY) bMinY = p.y; if (p.y > bMaxY) bMaxY = p.y;
                    });
                    const w = Math.max(bMaxX - bMinX, 5); const d = Math.max(bMaxY - bMinY, 5);
                    if (w <= 200 && d <= 200) buildings.push({ x: (bMinX + bMaxX) / 2, y: (bMinY + bMaxY) / 2, w, d });
                }
            });

            const intersections = Object.values(nodes).filter(n => (n.occurences > 3) || (n.occurences > 2 && Math.random() > 0.85));
            const slicedBuildings = buildings.length > 2000 ? buildings.sort(() => 0.5 - Math.random()).slice(0, 2000) : buildings;

            setCityData({ graph: nodes, roads, buildings: slicedBuildings, intersections });
        }).catch(e => {
            console.error("Initialization Error", e);
            setError(e.toString());
        });

        return () => mounted = false;
    }, []);

    return (
        <div style={{ position: 'relative', width: '100%', height: '100%', overflow: 'hidden', display: 'flex' }}>
            {/* Canvas Area Only */}
            <div style={{ flex: 1, position: 'relative', width: '100%', height: '100%' }}>
                {cityData ? (
                    <CityCanvasRenderer data={cityData} trafficData={trafficData} simulationSpeed={simulationSpeed} hasEmergency={hasEmergency} mode={mode} predictDate={predictDate} predictTime={predictTime} />
                ) : (
                    <div style={{ color: '#03a9f4', background: 'rgba(0,0,0,0.8)', padding: '20px', borderRadius: '10px', fontSize: '20px', position: 'absolute', top: '50%', left: '50%', transform: 'translate(-50%, -50%)' }}>
                        Initializing AI Digital Twin...
                    </div>
                )}
            </div>

        </div>
    );
};

export default SimulationView;
