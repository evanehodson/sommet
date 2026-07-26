import { createTorusLayer } from './torus.js';

const demSource = new mlcontour.DemSource({
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    maxzoom: 15,
    worker: true,
    cacheSize: 100
});
demSource.setupMaplibre(maplibregl);

const map = new maplibregl.Map({
    container: 'map',
    style: {
        version: 8,
        sources: {
            'satellite': {
                type: 'raster',
                tiles: ['https://tiles.versatiles.org/tiles/satellite/{z}/{x}/{y}'],
                tileSize: 256,
                maxzoom: 16,
                attribution: 'VersaTiles'
            }
        },
        layers: [{ id: 'satellite-layer', type: 'raster', source: 'satellite' }],
        lights: [
            { id: 'sun', type: 'directional', direction: [210, 55], color: '#ffffff', intensity: 1.0 },
            { id: 'ambient', type: 'ambient', color: '#fff5e6', intensity: 0.35 }
        ],
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
    },
    center: [149.13, -35.28],
    zoom: 11,
    pitch: 60,
    bearing: -15,
    maxPitch: 85
});

// ── Custom Controls ──────────────────────────────────────────

const compass = document.getElementById('compass');
const compassArrow = document.getElementById('compass-arrow');
const btnIn = document.getElementById('zoom-in');
const btnOut = document.getElementById('zoom-out');
const modeBtn = document.getElementById('mode-btn');

map.on('rotate', () => { compassArrow.style.transform = `rotate(${-map.getBearing()}deg)`; });

let dragging = false, dragStartAngle = 0, dragStartBearing = 0;

compass.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault(); dragging = true;
    const rect = compass.getBoundingClientRect();
    dragStartAngle = Math.atan2(e.clientX - (rect.left + rect.width / 2), (rect.top + rect.height / 2) - e.clientY) * 180 / Math.PI;
    dragStartBearing = map.getBearing();
    compass.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    const rect = compass.getBoundingClientRect();
    const angle = Math.atan2(e.clientX - (rect.left + rect.width / 2), (rect.top + rect.height / 2) - e.clientY) * 180 / Math.PI;
    let delta = angle - dragStartAngle;
    if (delta > 180) delta -= 360; if (delta < -180) delta += 360;
    map.setBearing(((dragStartBearing - delta) % 360 + 360) % 360);
});

document.addEventListener('mouseup', () => { if (dragging) { dragging = false; compass.style.cursor = 'grab'; } });

btnIn.addEventListener('click', () => map.zoomIn({ duration: 200 }));
btnOut.addEventListener('click', () => map.zoomOut({ duration: 200 }));
modeBtn.addEventListener('click', () => map.easeTo({ pitch: map.getPitch() > 1 ? 0 : 60, duration: 500 }));

map.on('pitch', () => {
    if (map.getPitch() < 1) { modeBtn.textContent = '3D'; modeBtn.classList.remove('active'); }
    else { modeBtn.textContent = '2D'; modeBtn.classList.add('active'); }
});

map.dragRotate.disable();
map.getCanvas().addEventListener('contextmenu', e => e.preventDefault());

let pitching = false, pitchStartY = 0, pitchStartVal = 0;
map.getCanvas().addEventListener('mousedown', (e) => {
    if (e.button === 2) { pitching = true; pitchStartY = e.clientY; pitchStartVal = map.getPitch(); e.preventDefault(); }
});
document.addEventListener('mousemove', (e) => { if (pitching) map.setPitch(Math.max(0, Math.min(85, pitchStartVal + (pitchStartY - e.clientY) * 0.3))); });
document.addEventListener('mouseup', (e) => { if (e.button === 2) pitching = false; });

// ── Live Tracking State ─────────────────────────────────────

let livePosition = null;
let followEnabled = true;
let trailPoints = null;

const followBtn = document.getElementById('follow-btn');
followBtn.addEventListener('click', () => {
    followEnabled = !followEnabled;
    followBtn.classList.toggle('active', followEnabled);
    if (followEnabled && livePosition) map.easeTo({ center: [livePosition.lon, livePosition.lat], duration: 600 });
});

// ── Runner Dot (module scope) ───────────────────────────────

let runnerSource = null;

function moveRunner(lon, lat) {
    if (!runnerSource) return;
    try { runnerSource.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] } }); } catch (e) { }
}

function showRunner() {
    if (map.getLayer('live-runner-layer')) map.setLayoutProperty('live-runner-layer', 'visibility', 'visible');
}

// ── Radar Pulse (map-aligned GeoJSON rings) ─────────────────

let radarSource = null;
let radarAnimId = null;
let radarStartTime = null;
const NUM_RINGS = 3;
const RADAR_CYCLE = 2400;
const MAX_RADIUS_M = 150;

function circleCoords(lon, lat, radiusM, n) {
    const coords = [];
    for (let i = 0; i <= n; i++) {
        const angle = (i / n) * Math.PI * 2;
        const dLat = radiusM * Math.cos(angle) / 111320;
        const dLon = radiusM * Math.sin(angle) / (111320 * Math.cos(lat * Math.PI / 180));
        coords.push([lon + dLon, lat + dLat]);
    }
    return coords;
}

function animateRadar() {
    if (!livePosition || !radarSource) { radarAnimId = requestAnimationFrame(animateRadar); return; }
    if (!radarStartTime) radarStartTime = performance.now();

    const now = performance.now();
    const features = [];

    for (let i = 0; i < NUM_RINGS; i++) {
        const age = ((now - radarStartTime) + (i * RADAR_CYCLE / NUM_RINGS)) % RADAR_CYCLE;
        const t = age / RADAR_CYCLE;
        const radius = t * MAX_RADIUS_M;
        const opacity = Math.max(0, 1 - t) * 0.7;

        features.push({
            type: 'Feature',
            properties: { ring: i, opacity },
            geometry: {
                type: 'LineString',
                coordinates: circleCoords(livePosition.lon, livePosition.lat, radius, 64)
            }
        });
    }

    try {
        radarSource.setData({ type: 'FeatureCollection', features });
    } catch (e) { }

    radarAnimId = requestAnimationFrame(animateRadar);
}

// ── Race HUD ────────────────────────────────────────────────

let raceStartTime = null, raceFinishTime = null, raceClockInterval = null;
let raceDistMi = 0, prevRacePos = null, lastMileIdx = 0;
const mileSplits = [];

const clockEl = document.getElementById('race-clock');
const distEl = document.getElementById('race-dist');
const paceEl = document.getElementById('race-pace');
const splitsEl = document.getElementById('race-splits');
const updatesEl = document.getElementById('race-updates');

function fmtTime(ms) {
    const s = Math.floor(ms / 1000);
    return Math.floor(s / 3600) + ':' + String(Math.floor((s % 3600) / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0');
}

function fmtPace(minPerMi) {
    if (!isFinite(minPerMi) || minPerMi <= 0) return '--:-- /mi';
    return Math.floor(minPerMi) + ':' + String(Math.round((minPerMi % 1) * 60)).padStart(2, '0') + ' /mi';
}

function startRaceClock() {
    raceStartTime = raceStartTime || Date.now();
    if (raceClockInterval) clearInterval(raceClockInterval);
    raceClockInterval = setInterval(() => {
        const end = raceFinishTime || Date.now();
        clockEl.textContent = fmtTime(end - raceStartTime);
        if (raceDistMi > 0) paceEl.textContent = fmtPace(((end - raceStartTime) / 60000) / raceDistMi);
    }, 200);
}

function stopRaceClock(ft) {
    raceFinishTime = ft;
    if (raceClockInterval) { clearInterval(raceClockInterval); raceClockInterval = null; }
    clockEl.textContent = fmtTime(ft - raceStartTime);
}

function updateRaceStats() {
    if (!livePosition || !prevRacePos || !raceStartTime) return;
    const distMi = haversine(prevRacePos.lon, prevRacePos.lat, livePosition.lon, livePosition.lat) / 1609.344;
    raceDistMi += distMi;
    prevRacePos = { lon: livePosition.lon, lat: livePosition.lat };
    distEl.textContent = raceDistMi.toFixed(2) + ' mi';

    const end = raceFinishTime || Date.now();
    const elapsed = (end - raceStartTime) / 60000;
    paceEl.textContent = fmtPace(elapsed / raceDistMi);

    const currentMile = Math.floor(raceDistMi);
    if (currentMile > lastMileIdx && currentMile <= 200) {
        for (let m = lastMileIdx + 1; m <= currentMile; m++) {
            mileSplits.push({ mile: m, time: elapsed });
            const div = document.createElement('div');
            div.textContent = `Mile ${m}: ${fmtTime(elapsed * 60000)}`;
            splitsEl.appendChild(div);
        }
        lastMileIdx = currentMile;
    }
}

function addUpdate(text, time) {
    const div = document.createElement('div');
    div.className = 'race-update-msg';
    const t = time ? new Date(time).toLocaleTimeString() : new Date().toLocaleTimeString();
    div.innerHTML = `<span class="race-update-time">${t}</span>${text}`;
    updatesEl.prepend(div);
    while (updatesEl.children.length > 20) updatesEl.lastChild.remove();
}

// ── WebSocket Connection ────────────────────────────────────

let ws = null;
let wsReconnectDelay = 1000;

function wsConnect() {
    const proto = location.protocol === 'https:' ? 'wss:' : 'ws:';
    ws = new WebSocket(`${proto}//${location.host}`);
    ws.onopen = () => { wsReconnectDelay = 1000; };
    ws.onclose = () => {
        setTimeout(wsConnect, wsReconnectDelay);
        wsReconnectDelay = Math.min(wsReconnectDelay * 1.5, 8000);
    };
    ws.onmessage = (e) => {
        try {
            const msg = JSON.parse(e.data);
            if (msg.type === 'position') handleLivePosition(msg);
            else if (msg.type === 'start') {
                raceStartTime = msg.time;
                prevRacePos = livePosition ? { lon: livePosition.lon, lat: livePosition.lat } : null;
                startRaceClock();
            }
            else if (msg.type === 'finish') stopRaceClock(msg.time);
            else if (msg.type === 'update') addUpdate(msg.text, msg.time);
        } catch (err) { }
    };
}

function handleLivePosition(pos) {
    livePosition = pos;
    moveRunner(pos.lon, pos.lat);
    showRunner();
    updateTrailSplit(pos.lon, pos.lat);
    updateProfileRunner(pos.lon, pos.lat);
    updateRaceStats();

    if (followEnabled) {
        const opts = { center: [pos.lon, pos.lat], duration: 500 };
        if (pos.heading != null && !isNaN(pos.heading)) opts.bearing = pos.heading;
        map.easeTo(opts);
    }
}

wsConnect();

// ── Load ─────────────────────────────────────────────────────

map.on('load', async () => {
    map.addSource('terrainSource', {
        type: 'raster-dem', tiles: [demSource.sharedDemProtocolUrl],
        encoding: 'terrarium', tileSize: 256, maxzoom: 15
    });
    map.setTerrain({ source: 'terrainSource', exaggeration: 1.5 });

    map.addSource('openfreemap', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });

    map.addSource('contour-source', {
        type: 'vector',
        tiles: [demSource.contourProtocolUrl({
            multiplier: 3.28084,
            thresholds: { 8: [200, 400], 10: [100, 200], 12: [100, 200], 14: [50, 100], 15: [20, 100], 16: [10, 100], 17: [10, 100], 18: [10, 100] },
            contourLayer: 'contours', elevationKey: 'ele', levelKey: 'level', extent: 4096, buffer: 1
        })],
        maxzoom: 18
    });

    map.addLayer({ id: 'contour-lines', type: 'line', source: 'contour-source', 'source-layer': 'contours',
        paint: { 'line-color': 'rgba(120, 80, 40, 0.45)', 'line-width': ['match', ['get', 'level'], 1, 1.2, 0.5] }
    });

    map.addLayer({ id: 'contour-labels', type: 'symbol', source: 'contour-source', 'source-layer': 'contours',
        filter: ['>', ['get', 'level'], 0],
        layout: {
            'symbol-placement': 'line', 'symbol-spacing': ['interpolate', ['linear'], ['zoom'], 9, 200, 12, 120, 15, 80, 18, 40],
            'text-size': ['interpolate', ['linear'], ['zoom'], 9, 9, 12, 10, 14, 12, 16, 14, 18, 16],
            'text-field': ['concat', ['to-string', ['get', 'ele']], "'"], 'text-font': ['Noto Sans Italic'],
            'text-pitch-alignment': 'map', 'text-rotation-alignment': 'map', 'text-allow-overlap': true
        },
        paint: { 'text-halo-color': '#ffffff', 'text-halo-width': 1, 'text-color': 'rgba(120, 80, 40, 0.85)' }
    });

    map.setSky({ 'sky-color': '#1a6fb5', 'horizon-color': '#e8dcc8', 'fog-color': '#d4cbbf',
        'sky-horizon-blend': 0.45, 'horizon-fog-blend': 0.5, 'fog-ground-blend': 0.65, 'atmosphere-blend': 0.8 });

    // ── Mountain peak icon ────────────────────────────────────
    const S = 32;
    const triData = new Uint8Array(S * S * 4);
    function segDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        const ex = px - (ax + t * dx), ey = py - (ay + t * dy);
        return Math.sqrt(ex * ex + ey * ey);
    }
    function cross2(ax, ay, bx, by) { return ax * by - ay * bx; }
    const tA = [16, 3], tB = [3, 27], tC = [29, 27];
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const px = x + 0.5, py = y + 0.5;
            const d1 = cross2(px - tA[0], py - tA[1], tB[0] - tA[0], tB[1] - tA[1]);
            const d2 = cross2(px - tB[0], py - tB[1], tC[0] - tB[0], tC[1] - tB[1]);
            const d3 = cross2(px - tC[0], py - tC[1], tA[0] - tC[0], tA[1] - tC[1]);
            const inside = (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
            const eDist = Math.min(segDist(px, py, tA[0], tA[1], tB[0], tB[1]), segDist(px, py, tB[0], tB[1], tC[0], tC[1]), segDist(px, py, tC[0], tC[1], tA[0], tA[1]));
            const sd = inside ? -eDist : eDist;
            const i = (y * S + x) * 4;
            if (sd < 0) { triData[i] = 139; triData[i + 1] = 69; triData[i + 2] = 19; triData[i + 3] = 255; }
            else if (sd < 3) { triData[i] = 255; triData[i + 1] = 255; triData[i + 2] = 255;
                triData[i + 3] = Math.round(Math.min(1, Math.max(0, 1 - (sd - 2) / 1)) * 255); }
        }
    }
    map.addImage('peak-icon', { width: S, height: S, data: triData });

    map.addLayer({ id: 'park-labels', type: 'symbol', source: 'openfreemap', 'source-layer': 'park', minzoom: 9,
        layout: { 'text-field': '{name}', 'text-font': ['Noto Sans Italic'], 'text-size': 12, 'text-letter-spacing': 0.15,
            'text-transform': 'uppercase', 'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport',
            'symbol-placement': 'point', 'symbol-spacing': 300, 'text-padding': 50 },
        paint: { 'text-color': '#d4edda', 'text-halo-color': '#1a3a1a', 'text-halo-width': 2 }
    });

    try {
        const resp = await fetch('data/Inner_North_Summits.gpx');
        const text = await resp.text();
        const xml = new DOMParser().parseFromString(text, 'text/xml');

        const trkpts = xml.getElementsByTagName('trkpt');
        const pathPoints = [];
        const bounds = new maplibregl.LngLatBounds();
        let cumDist = 0;
        const cumDistArr = [0];
        const profile = [];

        for (let i = 0; i < trkpts.length; i++) {
            const lon = parseFloat(trkpts[i].getAttribute('lon'));
            const lat = parseFloat(trkpts[i].getAttribute('lat'));
            const el = trkpts[i].getElementsByTagName('ele')[0];
            const ele = el ? parseFloat(el.textContent) : 0;
            pathPoints.push({ lon, lat, ele });
            bounds.extend([lon, lat]);
            if (i > 0) cumDist += haversine(pathPoints[i - 1].lon, pathPoints[i - 1].lat, lon, lat);
            cumDistArr.push(cumDist);
            profile.push({ dist: cumDist, ele });
        }

        trailPoints = pathPoints;
        const KNOWN_LENGTH_MI = 35.6;
        const distScale = KNOWN_LENGTH_MI / cumDist;
        profile.forEach(p => p.dist *= distScale);

        const wptEls = xml.getElementsByTagName('wpt');
        const waypoints = [];
        for (let j = 0; j < wptEls.length; j++) {
            const lon = parseFloat(wptEls[j].getAttribute('lon'));
            const lat = parseFloat(wptEls[j].getAttribute('lat'));
            const nameEl = wptEls[j].getElementsByTagName('name')[0];
            const name = nameEl ? nameEl.textContent : `WP ${j + 1}`;
            let nearestEle = 0, minD = Infinity;
            for (const tp of pathPoints) { const d = haversine(lon, lat, tp.lon, tp.lat); if (d < minD) { minD = d; nearestEle = tp.ele; } }
            waypoints.push({ name, lon, lat, ele: nearestEle, eleFt: nearestEle * 3.28084 });
        }

        if (waypoints.length === 0 && pathPoints.length > 0) {
            const first = pathPoints[0], last = pathPoints[pathPoints.length - 1];
            waypoints.push({ name: 'START', lon: first.lon, lat: first.lat, ele: first.ele, eleFt: first.ele * 3.28084 });
            waypoints.push({ name: 'FINISH', lon: last.lon, lat: last.lat, ele: last.ele, eleFt: last.ele * 3.28084 });
        }

        // ── Trail ───────────────────────────────────────────

        map.addSource('trail-remaining', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: pathPoints.map(p => [p.lon, p.lat]) } }
        });
        map.addLayer({ id: 'trail-remaining-outline', type: 'line', source: 'trail-remaining',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ffffff', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 0.415, 10, 0.83, 11, 1.66, 12, 3.32, 13, 6.64, 14, 13.29, 15, 26.58, 16, 53.15, 17, 106.3, 18, 212.6], 'line-opacity': 1.0 }
        }, 'park-labels');
        map.addLayer({ id: 'trail-remaining-line', type: 'line', source: 'trail-remaining',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': 'rgba(255,255,255,0.7)', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 0.215, 10, 0.43, 11, 0.86, 12, 1.72, 13, 3.44, 14, 6.89, 15, 13.78, 16, 27.55, 17, 55.1, 18, 110.2], 'line-opacity': 1.0 }
        }, 'park-labels');

        map.addSource('trail-completed', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
        });
        map.addLayer({ id: 'trail-completed-outline', type: 'line', source: 'trail-completed',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ff3366', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 0.415, 10, 0.83, 11, 1.66, 12, 3.32, 13, 6.64, 14, 13.29, 15, 26.58, 16, 53.15, 17, 106.3, 18, 212.6], 'line-opacity': 1.0 }
        }, 'park-labels');
        map.addLayer({ id: 'trail-completed-line', type: 'line', source: 'trail-completed',
            layout: { 'line-join': 'round', 'line-cap': 'round' },
            paint: { 'line-color': '#ff3366', 'line-width': ['interpolate', ['exponential', 2], ['zoom'], 9, 0.215, 10, 0.43, 11, 0.86, 12, 1.72, 13, 3.44, 14, 6.89, 15, 13.78, 16, 27.55, 17, 55.1, 18, 110.2], 'line-opacity': 1.0 }
        }, 'park-labels');

        // ── Radar Pulse (map-aligned) ───────────────────────

        map.addSource('radar-rings', {
            type: 'geojson',
            data: { type: 'FeatureCollection', features: [] }
        });

        map.addLayer({ id: 'radar-ring-0', type: 'line', source: 'radar-rings',
            filter: ['==', 'ring', 0],
            paint: { 'line-color': '#ff3366', 'line-width': 2, 'line-opacity': ['get', 'opacity'] }
        }, 'trail-remaining-outline');

        map.addLayer({ id: 'radar-ring-1', type: 'line', source: 'radar-rings',
            filter: ['==', 'ring', 1],
            paint: { 'line-color': '#ff3366', 'line-width': 2, 'line-opacity': ['get', 'opacity'] }
        }, 'trail-remaining-outline');

        map.addLayer({ id: 'radar-ring-2', type: 'line', source: 'radar-rings',
            filter: ['==', 'ring', 2],
            paint: { 'line-color': '#ff3366', 'line-width': 2, 'line-opacity': ['get', 'opacity'] }
        }, 'trail-remaining-outline');

        radarSource = map.getSource('radar-rings');
        animateRadar();

        // ── Trail split ─────────────────────────────────────

        function updateTrailSplit(lon, lat) {
            let bestIdx = 0, bestSq = Infinity;
            for (let i = 0; i < pathPoints.length; i++) {
                const dx = pathPoints[i].lon - lon, dy = pathPoints[i].lat - lat;
                const sq = dx * dx + dy * dy;
                if (sq < bestSq) { bestSq = sq; bestIdx = i; }
            }
            map.getSource('trail-completed').setData({
                type: 'Feature', geometry: { type: 'LineString', coordinates: pathPoints.slice(0, bestIdx + 1).map(p => [p.lon, p.lat]) }
            });
            map.getSource('trail-remaining').setData({
                type: 'Feature', geometry: { type: 'LineString', coordinates: pathPoints.slice(bestIdx).map(p => [p.lon, p.lat]) }
            });
        }

        map.addLayer(createTorusLayer(map, pathPoints, waypoints));

        map.addLayer({ id: 'mountain-peaks', type: 'symbol', source: 'openfreemap', 'source-layer': 'mountain_peak',
            filter: ['==', 'class', 'peak'], minzoom: 10,
            layout: { 'icon-image': 'peak-icon', 'icon-size': 0.35, 'icon-anchor': 'bottom',
                'text-field': ['concat', ['get', 'name'], '\n', ['get', 'ele_ft'], ' ft'],
                'text-font': ['Noto Sans Italic'], 'text-size': 9, 'text-anchor': 'bottom',
                'text-offset': [0, -1.2], 'text-pitch-alignment': 'viewport', 'text-rotation-alignment': 'viewport' },
            paint: { 'text-color': '#8B4513', 'text-halo-color': '#ffffff', 'text-halo-width': 1.2 }
        });

        // ── Runner Dot ─────────────────────────────────────

        map.addSource('live-runner', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [pathPoints[0].lon, pathPoints[0].lat] } }
        });

        if (!map.hasImage('runner-dot')) {
            const S = 64, c = document.createElement('canvas');
            c.width = S; c.height = S;
            const cx = c.getContext('2d');
            cx.shadowColor = '#ff3366'; cx.shadowBlur = 12;
            cx.beginPath(); cx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
            cx.fillStyle = '#ff3366'; cx.fill();
            cx.shadowBlur = 0; cx.lineWidth = 7; cx.strokeStyle = '#ffffff'; cx.stroke();
            map.addImage('runner-dot', { width: S, height: S, data: cx.getImageData(0, 0, S, S).data });
        }

        map.addLayer({
            id: 'live-runner-layer', type: 'symbol', source: 'live-runner',
            layout: { 'icon-image': 'runner-dot', 'icon-size': 0.3, 'icon-allow-overlap': true,
                'icon-pitch-alignment': 'map', 'icon-rotation-alignment': 'map', 'visibility': 'none' }
        });

        runnerSource = map.getSource('live-runner');

        // ── Elevation Profile ──────────────────────────────

        const canvas = document.getElementById('profile-canvas');
        const ctx = canvas.getContext('2d');
        const profilePanel = document.getElementById('elevation-profile');
        const toggleBtn = document.getElementById('profile-toggle');
        let runnerDist = null;

        function updateProfileRunner(lon, lat) {
            let bestIdx = 0, bestSq = Infinity;
            for (let i = 0; i < pathPoints.length; i++) {
                const dx = pathPoints[i].lon - lon, dy = pathPoints[i].lat - lat;
                const sq = dx * dx + dy * dy;
                if (sq < bestSq) { bestSq = sq; bestIdx = i; }
            }
            runnerDist = profile[bestIdx] ? profile[bestIdx].dist : null;
            drawProfile();
        }

        function drawProfile() {
            const parent = canvas.parentElement;
            const w = parent.clientWidth, h = parent.clientHeight;
            if (w === 0 || h === 0) return;
            canvas.width = w * devicePixelRatio; canvas.height = h * devicePixelRatio;
            ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
            const pad = { top: 20, bottom: 24, left: 42, right: 14 };
            const pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom;
            ctx.clearRect(0, 0, w, h); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, w, h);
            if (profile.length < 2) return;

            const elevs = profile.map(p => p.ele * 3.28084);
            const dists = profile.map(p => p.dist);
            const maxE = Math.max(...elevs), minE = Math.min(...elevs);
            const maxD = dists[dists.length - 1], rangeE = maxE - minE || 1;

            ctx.strokeStyle = '#e0e0e0'; ctx.lineWidth = 0.5;
            for (let g = 0; g <= 4; g++) {
                const y = pad.top + (g / 4) * ph;
                ctx.beginPath(); ctx.moveTo(pad.left, y); ctx.lineTo(pad.left + pw, y); ctx.stroke();
                ctx.fillStyle = '#999'; ctx.font = '8px sans-serif'; ctx.textAlign = 'right';
                ctx.fillText(`${Math.round(maxE - (g / 4) * rangeE)}'`, pad.left - 5, y + 3);
            }

            ctx.font = '8px sans-serif'; ctx.textAlign = 'center';
            for (let m = 1; m <= maxD; m++) {
                const mx = pad.left + (m / maxD) * pw;
                ctx.strokeStyle = '#f0f0f0'; ctx.lineWidth = 0.5;
                ctx.beginPath(); ctx.moveTo(mx, pad.top); ctx.lineTo(mx, pad.top + ph); ctx.stroke();
                ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1;
                ctx.beginPath(); ctx.moveTo(mx, pad.top + ph); ctx.lineTo(mx, pad.top + ph + 4); ctx.stroke();
                ctx.fillStyle = '#999'; ctx.fillText(`${m}`, mx, pad.top + ph + 14);
            }

            if (runnerDist !== null && runnerDist > 0) {
                const gC = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
                gC.addColorStop(0, 'rgba(255,51,102,0.25)'); gC.addColorStop(1, 'rgba(255,51,102,0.05)');
                ctx.beginPath(); ctx.moveTo(pad.left, pad.top + ph);
                for (let i = 0; i < profile.length; i++) {
                    if (dists[i] > runnerDist) break;
                    ctx.lineTo(pad.left + (dists[i] / maxD) * pw, pad.top + ph - ((elevs[i] - minE) / rangeE) * ph);
                }
                ctx.lineTo(pad.left + (runnerDist / maxD) * pw, pad.top + ph);
                ctx.closePath(); ctx.fillStyle = gC; ctx.fill();
            }

            const gR = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
            gR.addColorStop(0, 'rgba(200,200,200,0.08)'); gR.addColorStop(1, 'rgba(200,200,200,0.01)');
            ctx.beginPath();
            if (runnerDist !== null && runnerDist > 0) {
                ctx.moveTo(pad.left + (runnerDist / maxD) * pw, pad.top + ph);
                let s = false;
                for (let i = 0; i < profile.length; i++) {
                    if (dists[i] < runnerDist) continue;
                    const x = pad.left + (dists[i] / maxD) * pw, y = pad.top + ph - ((elevs[i] - minE) / rangeE) * ph;
                    if (!s) { ctx.lineTo(x, y); s = true; } else ctx.lineTo(x, y);
                }
            } else {
                ctx.moveTo(pad.left, pad.top + ph);
                for (let i = 0; i < profile.length; i++) ctx.lineTo(pad.left + (dists[i] / maxD) * pw, pad.top + ph - ((elevs[i] - minE) / rangeE) * ph);
            }
            ctx.lineTo(pad.left + pw, pad.top + ph); ctx.closePath(); ctx.fillStyle = gR; ctx.fill();

            if (runnerDist !== null && runnerDist > 0) {
                ctx.beginPath(); let s = false;
                for (let i = 0; i < profile.length; i++) {
                    if (dists[i] > runnerDist) break;
                    const x = pad.left + (dists[i] / maxD) * pw, y = pad.top + ph - ((elevs[i] - minE) / rangeE) * ph;
                    if (!s) { ctx.moveTo(x, y); s = true; } else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = '#ff3366'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.beginPath(); let f = true;
                for (let i = 0; i < profile.length; i++) {
                    if (dists[i] < runnerDist) continue;
                    const x = pad.left + (dists[i] / maxD) * pw, y = pad.top + ph - ((elevs[i] - minE) / rangeE) * ph;
                    if (f) { ctx.moveTo(x, y); f = false; } else ctx.lineTo(x, y);
                }
                ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.5; ctx.stroke();
            } else {
                ctx.beginPath();
                for (let i = 0; i < profile.length; i++) {
                    const x = pad.left + (dists[i] / maxD) * pw, y = pad.top + ph - ((elevs[i] - minE) / rangeE) * ph;
                    i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
                }
                ctx.strokeStyle = '#ccc'; ctx.lineWidth = 1.5; ctx.stroke();
            }

            if (runnerDist !== null && runnerDist > 0) {
                const sx = pad.left + (runnerDist / maxD) * pw;
                let sy = pad.top, eleAtScrub = minE;
                for (let i = 1; i < profile.length; i++) {
                    if (dists[i] >= runnerDist) {
                        const t = (dists[i] - dists[i - 1]) > 0 ? (runnerDist - dists[i - 1]) / (dists[i] - dists[i - 1]) : 0;
                        eleAtScrub = elevs[i - 1] + t * (elevs[i] - elevs[i - 1]);
                        sy = pad.top + ph - ((eleAtScrub - minE) / rangeE) * ph; break;
                    }
                }
                ctx.beginPath(); ctx.moveTo(sx, pad.top); ctx.lineTo(sx, pad.top + ph);
                ctx.strokeStyle = 'rgba(255,51,102,0.4)'; ctx.lineWidth = 1; ctx.stroke();
                ctx.beginPath(); ctx.arc(sx, sy, 4, 0, Math.PI * 2);
                ctx.fillStyle = '#ff3366'; ctx.fill(); ctx.strokeStyle = '#fff'; ctx.lineWidth = 1.5; ctx.stroke();
                ctx.fillStyle = '#333'; ctx.font = 'bold 10px sans-serif'; ctx.textAlign = 'center';
                ctx.fillText(`${runnerDist.toFixed(1)} mi  ·  ${Math.round(eleAtScrub)} ft`, sx, pad.top - 5);
            }
        }

        drawProfile();
        window.addEventListener('resize', drawProfile);
        profilePanel.addEventListener('transitionend', () => drawProfile());
        toggleBtn.addEventListener('click', () => profilePanel.classList.toggle('collapsed'));

        map.fitBounds(bounds, { padding: 60, duration: 3500, pitch: 55, bearing: -15 });

    } catch (err) { console.error('Error:', err); }
});

function haversine(lon1, lat1, lon2, lat2) {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180, dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
