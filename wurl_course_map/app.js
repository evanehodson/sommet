import { createTorusLayer } from './torus.js';
import { initFlyThrough } from './fly_through.js';
import { initScrollytelling, SECTION_BOUNDARY_MILES } from './scrollytelling.js';

// ── State ─────────────────────────────────────────────────

let _mile = null;
const _listeners = new Set();

function getMile() { return _mile; }

function setMile(mile, source) {
    if (_mile === mile && mile !== null) return;
    _mile = mile;
    for (const fn of _listeners) fn(mile, source);
}

function onMileChange(fn) {
    _listeners.add(fn);
    return () => _listeners.delete(fn);
}

// ── DEM Source ────────────────────────────────────────────

const demSource = new mlcontour.DemSource({
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    maxzoom: 15,
    worker: true,
    cacheSize: 100
});
demSource.setupMaplibre(maplibregl);

// ── Map ───────────────────────────────────────────────────

const map = new maplibregl.Map({
    container: 'map',
    antialias: true,
    style: {
        version: 8,
        sources: {
            'satellite': {
                type: 'raster',
                tiles: ['https://tiles.maps.eox.at/wmts/1.0.0/s2cloudless-2024_3857/default/g/{z}/{y}/{x}.jpg'],
                tileSize: 256,
                attribution: 'Sentinel-2 cloudless by EOX IT Services GmbH'
            }
        },
        layers: [
            { id: 'satellite-layer', type: 'raster', source: 'satellite' }
        ],
        lights: [
            { id: 'sun', type: 'directional', direction: [210, 55], color: '#ffffff', intensity: 1.0 },
            { id: 'ambient', type: 'ambient', color: '#fff5e6', intensity: 0.35 }
        ],
        glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
    },
    center: [-111.82, 40.57],
    zoom: 11,
    pitch: 60,
    bearing: 90,
    maxPitch: 70
});

// ── Controls state ────────────────────────────────────────

const compass = document.getElementById('compass');
const compassSvg = document.getElementById('compass-svg');
const modeBtn = document.getElementById('mode-btn');

let flyThrough = null;
let courseBounds = null;
let is2D = false;
const FIT_BOUNDS_PADDING = { top: 60, right: 60, bottom: 280, left: 60 };
const PROFILE_PAD = { top: 16, bottom: 22, left: 40, right: 12 };

let fitState = null;
let hasMovedFromFit = false;

// ── Fit-bounds tracking ──────────────────────────────────

map.on('dragstart', () => { hasMovedFromFit = true; });
map.getContainer().addEventListener('wheel', () => { hasMovedFromFit = true; });

function recordFitState() {
    const c = map.getCenter();
    fitState = { clat: c.lat, clng: c.lng, zoom: map.getZoom(), bearing: map.getBearing(), pitch: map.getPitch() };
}

function userMovedFromFit() {
    if (!fitState) return true;
    const c = map.getCenter();
    return Math.abs(c.lat - fitState.clat) > 0.0001 ||
           Math.abs(c.lng - fitState.clng) > 0.0001 ||
           Math.abs(map.getZoom() - fitState.zoom) > 0.01 ||
           Math.abs(map.getBearing() - fitState.bearing) > 0.5 ||
           Math.abs(map.getPitch() - fitState.pitch) > 0.5;
}

function fitBoundsAndRecord(bounds, opts) {
    hasMovedFromFit = false;
    fitState = null;
    map.fitBounds(bounds, opts);
    map.once('moveend', () => { recordFitState(); });
}

function updateControls() {
    const flying = flyThrough && flyThrough.isRunning();
    map.dragRotate.disable();
    if (is2D) {
        map.dragPan.enable();
        if (flying) flyThrough.setViewMode('overview');
    } else if (flying) {
        map.dragPan.disable();
        flyThrough.setViewMode('follow');
    } else {
        map.dragPan.enable();
    }
}

// ── Compass ────────────────────────────────────────────────

compassSvg.style.transform = `rotate(${-map.getBearing()}deg)`;
map.on('rotate', () => {
    compassSvg.style.transform = `rotate(${-map.getBearing()}deg)`;
});

let dragging = false;
let dragStartAngle = 0;
let dragStartBearing = 0;

function compassAngle(x, y) {
    const rect = compass.getBoundingClientRect();
    return Math.atan2(x - (rect.left + rect.width / 2), (rect.top + rect.height / 2) - y) * 180 / Math.PI;
}

function applyCompassDelta(angle) {
    let delta = angle - dragStartAngle;
    if (delta > 180) delta -= 360;
    if (delta < -180) delta += 360;
    map.setBearing(((dragStartBearing - delta) % 360 + 360) % 360);
}

compass.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return;
    e.preventDefault();
    hasMovedFromFit = true;
    dragging = true;
    dragStartAngle = compassAngle(e.clientX, e.clientY);
    dragStartBearing = map.getBearing();
    compass.style.cursor = 'grabbing';
});

document.addEventListener('mousemove', (e) => {
    if (!dragging) return;
    applyCompassDelta(compassAngle(e.clientX, e.clientY));
});

document.addEventListener('mouseup', () => {
    if (dragging) { dragging = false; compass.style.cursor = 'grab'; }
});

compass.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    e.preventDefault();
    hasMovedFromFit = true;
    dragging = true;
    const t = e.touches[0];
    dragStartAngle = compassAngle(t.clientX, t.clientY);
    dragStartBearing = map.getBearing();
}, { passive: false });

document.addEventListener('touchmove', (e) => {
    if (!dragging) return;
    const t = e.touches[0];
    applyCompassDelta(compassAngle(t.clientX, t.clientY));
}, { passive: true });

document.addEventListener('touchend', () => {
    if (dragging) dragging = false;
});

// ── Zoom buttons ───────────────────────────────────────────

const btnIn = document.getElementById('zoom-in');
const btnOut = document.getElementById('zoom-out');

btnIn.addEventListener('click', () => {
    if (!flyThrough || !flyThrough.isRunning()) { hasMovedFromFit = true; map.zoomIn({ duration: 200 }); }
});
btnOut.addEventListener('click', () => {
    if (!flyThrough || !flyThrough.isRunning()) { hasMovedFromFit = true; map.zoomOut({ duration: 200 }); }
});

// ── 2D/3D toggle ──────────────────────────────────────────

modeBtn.addEventListener('click', () => {
    is2D = !is2D;
    if (is2D) {
        modeBtn.textContent = '2D';
        modeBtn.classList.add('active');
        map.easeTo({ pitch: 0, duration: 500 });
        if (flyThrough && flyThrough.isRunning()) {
            fitBoundsAndRecord(courseBounds, { padding: FIT_BOUNDS_PADDING, duration: 1000, pitch: 0, bearing: 0 });
        }
    } else {
        modeBtn.textContent = '3D';
        modeBtn.classList.remove('active');
        map.easeTo({ pitch: 60, duration: 500 });
    }
    updateControls();
});

map.on('pitch', () => {
    const pitchIsZero = map.getPitch() < 1;
    if (pitchIsZero && !is2D) {
        is2D = true;
        modeBtn.textContent = '2D';
        modeBtn.classList.add('active');
    } else if (!pitchIsZero && is2D) {
        is2D = false;
        modeBtn.textContent = '3D';
        modeBtn.classList.remove('active');
    }
});

// ── Right-click pitch ─────────────────────────────────────

map.getCanvas().addEventListener('contextmenu', e => e.preventDefault());

let pitching = false;
let pitchStartY = 0;
let pitchStartVal = 0;

map.getCanvas().addEventListener('mousedown', (e) => {
    if (e.button === 2 && !is2D) {
        pitching = true;
        pitchStartY = e.clientY;
        pitchStartVal = map.getPitch();
        e.preventDefault();
    }
});

document.addEventListener('mousemove', (e) => {
    if (!pitching) return;
    const dy = pitchStartY - e.clientY;
    const p = Math.max(0, Math.min(85, pitchStartVal + dy * 0.3));
    map.setPitch(p);
});

document.addEventListener('mouseup', (e) => {
    if (e.button === 2) pitching = false;
});

// ── Flag helpers ───────────────────────────────────────────

function makePoleIconCanvas() {
    const c = document.createElement('canvas');
    c.width = 320;
    c.height = 256;
    const cx = c.getContext('2d');
    cx.clearRect(0, 0, 320, 256);

    const poleX = 160;
    const poleTop = 20;
    const poleBottom = 256;

    cx.strokeStyle = '#999999';
    cx.lineWidth = 10;
    cx.lineCap = 'butt';
    cx.beginPath();
    cx.moveTo(poleX, poleBottom);
    cx.lineTo(poleX, poleTop);
    cx.stroke();

    cx.fillStyle = '#FF3B30';
    cx.beginPath();
    cx.moveTo(poleX, poleTop);
    cx.lineTo(poleX + 130, poleTop + 34);
    cx.lineTo(poleX, poleTop + 68);
    cx.closePath();
    cx.fill();

    return c;
}

function createFlagsLayer(map, pathPoints, sectionMiles, KNOWN_LENGTH_MI, cumDist, cumDistArr) {
    const flagFeatures = [];
    for (let si = 0; si < sectionMiles.length; si++) {
        const mile = sectionMiles[si];
        if (mile <= 0 || mile >= KNOWN_LENGTH_MI) continue;

        const meterDist = mile / (KNOWN_LENGTH_MI / cumDist);
        let idx = 0;
        for (let j = 0; j < cumDistArr.length; j++) {
            if (cumDistArr[j] >= meterDist) { idx = j; break; }
        }

        const wp = pathPoints[Math.max(0, idx - 1)];
        if (!wp || isNaN(wp.lon) || isNaN(wp.lat)) continue;

        flagFeatures.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: [wp.lon, wp.lat, wp.ele || 0] },
            properties: { label: String(si) }
        });
    }

    if (flagFeatures.length === 0) return;

    const iconCanvas = makePoleIconCanvas();
    if (iconCanvas.transferToImageBitmap) {
        map.addImage('flag-pole-icon', iconCanvas.transferToImageBitmap());
    } else {
        const data = iconCanvas.getContext('2d').getImageData(0, 0, 320, 256);
        map.addImage('flag-pole-icon', { width: 320, height: 256, data: data.data });
    }

    map.addSource('flags-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: flagFeatures }
    });

    map.addLayer({
        id: 'flags-symbol',
        type: 'symbol',
        source: 'flags-source',
        layout: {
            'symbol-sort-key': 100,
            'icon-image': 'flag-pole-icon',
            'icon-anchor': 'bottom',
            'icon-size': [
                'interpolate', ['exponential', 2], ['zoom'],
                12, 0.055,
                18, 3.5
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
}

// ════════════════════════════════════════════════════════════
// LOAD
// ════════════════════════════════════════════════════════════

map.on('load', async () => {
    map.addSource('terrainSource', {
        type: 'raster-dem',
        tiles: [demSource.sharedDemProtocolUrl],
        encoding: 'terrarium',
        tileSize: 256,
        maxzoom: 15
    });

    map.setTerrain({ source: 'terrainSource', exaggeration: 1.0 });

    map.addSource('openfreemap', {
        type: 'vector',
        url: 'https://tiles.openfreemap.org/planet'
    });

    // ── Contours ─────────────────────────────────────────────

    map.addSource('contour-source', {
        type: 'vector',
        tiles: [
            demSource.contourProtocolUrl({
                multiplier: 3.28084,
                thresholds: {
                    8: [200, 400],
                    10: [100, 200],
                    12: [100, 200],
                    14: [50, 100],
                    15: [50, 100],
                    16: [50, 100],
                    17: [50, 100],
                    18: [50, 100]
                },
                contourLayer: 'contours',
                elevationKey: 'ele',
                levelKey: 'level',
                extent: 4096,
                buffer: 1
            })
        ],
        maxzoom: 18
    });

    map.addLayer({
        id: 'contour-lines',
        type: 'line',
        source: 'contour-source',
        'source-layer': 'contours',
        paint: {
            'line-color': 'rgba(120, 80, 40, 0.45)',
            'line-width': ['match', ['get', 'level'], 1, 1.2, 0.5]
        }
    });

    map.addLayer({
        id: 'contour-labels',
        type: 'symbol',
        source: 'contour-source',
        'source-layer': 'contours',
        filter: ['>', ['get', 'level'], 0],
        layout: {
            'symbol-sort-key': 5,
            'symbol-placement': 'line',
            'symbol-spacing': [
                'interpolate', ['linear'], ['zoom'],
                9, 200, 12, 160, 15, 200, 18, 300
            ],
            'text-size': [
                'interpolate', ['linear'], ['zoom'],
                9, 9, 12, 10, 14, 12, 16, 14, 18, 16
            ],
            'text-field': ['concat', ['to-string', ['get', 'ele']], "'"],
            'text-font': ['Noto Sans Italic'],
            'text-pitch-alignment': 'map',
            'text-rotation-alignment': 'map',
            'text-allow-overlap': true
        },
        paint: {
            'text-halo-color': '#ffffff',
            'text-halo-width': 1,
            'text-color': 'rgba(120, 80, 40, 0.85)'
        }
    });

    map.setSky({
        'sky-color': '#1a6fb5',
        'horizon-color': '#e8dcc8',
        'fog-color': '#d4cbbf',
        'sky-horizon-blend': 0.45,
        'horizon-fog-blend': 0.5,
        'fog-ground-blend': 0.65,
        'atmosphere-blend': 0.8
    });

    // ── Mountain peak icon (SDF triangle) ────────────────────

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
    const strokeR = 3, aa = 1.0;
    for (let y = 0; y < S; y++) {
        for (let x = 0; x < S; x++) {
            const px = x + 0.5, py = y + 0.5;
            const d1 = cross2(px - tA[0], py - tA[1], tB[0] - tA[0], tB[1] - tA[1]);
            const d2 = cross2(px - tB[0], py - tB[1], tC[0] - tB[0], tC[1] - tB[1]);
            const d3 = cross2(px - tC[0], py - tC[1], tA[0] - tC[0], tA[1] - tC[1]);
            const inside = (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
            const eDist = Math.min(
                segDist(px, py, tA[0], tA[1], tB[0], tB[1]),
                segDist(px, py, tB[0], tB[1], tC[0], tC[1]),
                segDist(px, py, tC[0], tC[1], tA[0], tA[1])
            );
            const sd = inside ? -eDist : eDist;
            const i = (y * S + x) * 4;
            if (sd < 0) {
                triData[i] = 139; triData[i + 1] = 69; triData[i + 2] = 19; triData[i + 3] = 255;
            } else if (sd < strokeR) {
                triData[i] = 255; triData[i + 1] = 255; triData[i + 2] = 255;
                triData[i + 3] = Math.round(Math.min(1, Math.max(0, 1 - (sd - strokeR + aa) / aa)) * 255);
            }
        }
    }
    map.addImage('peak-icon', { width: S, height: S, data: triData });

    // ── Park labels ─────────────────────────────────────────

    map.addLayer({
        id: 'park-labels',
        type: 'symbol',
        source: 'openfreemap',
        'source-layer': 'park',
        minzoom: 9,
        layout: {
            'symbol-sort-key': 10,
            'text-field': '{name}',
            'text-font': ['Noto Sans Italic'],
            'text-size': 12,
            'text-letter-spacing': 0.15,
            'text-transform': 'uppercase',
            'text-pitch-alignment': 'viewport',
            'text-rotation-alignment': 'viewport',
            'symbol-placement': 'point',
            'symbol-spacing': 300,
            'text-padding': 50
        },
        paint: {
            'text-color': '#d4edda',
            'text-halo-color': '#1a3a1a',
            'text-halo-width': 2
        }
    });

    // ── Parse GPX ───────────────────────────────────────────

    try {
        const resp = await fetch('data/WURL_Wasatch_Ultimate_Ridge_Linkup.gpx');
        const text = await resp.text();
        const xml = new DOMParser().parseFromString(text, 'text/xml');

        const trkpts = xml.getElementsByTagName('trkpt');
        const pathPoints = [];
        courseBounds = new maplibregl.LngLatBounds();
        let cumDist = 0;
        const cumDistArr = [0];
        const profile = [];

        for (let i = 0; i < trkpts.length; i++) {
            const lon = parseFloat(trkpts[i].getAttribute('lon'));
            const lat = parseFloat(trkpts[i].getAttribute('lat'));
            const el = trkpts[i].getElementsByTagName('ele')[0];
            const ele = el ? parseFloat(el.textContent) : 0;
            pathPoints.push({ lon, lat, ele });
            courseBounds.extend([lon, lat]);
            if (i > 0) {
                cumDist += haversineMi(pathPoints[i - 1].lon, pathPoints[i - 1].lat, lon, lat);
            }
            cumDistArr.push(cumDist);
            profile.push({ dist: cumDist, ele });
        }

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
            for (const tp of pathPoints) {
                const d = haversineMi(lon, lat, tp.lon, tp.lat);
                if (d < minD) { minD = d; nearestEle = tp.ele; }
            }
            waypoints.push({ name, lon, lat, ele: nearestEle, eleFt: nearestEle * 3.28084 });
        }

        function smoothPath(pts, factor) {
            const out = [];
            for (let i = 0; i < pts.length - 1; i++) {
                for (let s = 0; s < factor; s++) {
                    const t = s / factor;
                    out.push([
                        pts[i].lon + (pts[i + 1].lon - pts[i].lon) * t,
                        pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t
                    ]);
                }
            }
            out.push([pts[pts.length - 1].lon, pts[pts.length - 1].lat]);
            return out;
        }

        const smoothPoints = smoothPath(pathPoints, 4);

        map.addSource('trail-source', {
            type: 'geojson',
            data: {
                type: 'Feature',
                geometry: { type: 'LineString', coordinates: smoothPoints }
            }
        });

        map.addLayer({
            id: 'trail-casing',
            type: 'line',
            source: 'trail-source',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': '#000000',
                'line-opacity': 0.35,
                'line-width': [
                    'interpolate', ['exponential', 1.5], ['zoom'],
                    9, 1.5, 14, 4, 18, 9
                ],
                'line-blur': 0
            }
        }, 'park-labels');

        map.addLayer({
            id: 'trail-line-main',
            type: 'line',
            source: 'trail-source',
            layout: { 'line-cap': 'round', 'line-join': 'round' },
            paint: {
                'line-color': '#FF3B30',
                'line-opacity': 1,
                'line-width': [
                    'interpolate', ['exponential', 1.5], ['zoom'],
                    9, 1, 14, 2.5, 18, 6
                ],
                'line-blur': 0
            }
        }, 'park-labels');

        map.addLayer(createTorusLayer(map, pathPoints, waypoints));

        map.addLayer({
            id: 'mountain-peaks',
            type: 'symbol',
            source: 'openfreemap',
            'source-layer': 'mountain_peak',
            filter: ['==', 'class', 'peak'],
            minzoom: 10,
            layout: {
                'symbol-sort-key': 10,
                'icon-image': 'peak-icon',
                'icon-size': 0.35,
                'icon-anchor': 'bottom',
                'text-field': ['concat', ['get', 'name'], '\n', ['get', 'ele_ft'], ' ft'],
                'text-font': ['Noto Sans Italic'],
                'text-size': 9,
                'text-anchor': 'bottom',
                'text-offset': [0, -1.2],
                'text-pitch-alignment': 'viewport',
                'text-rotation-alignment': 'viewport'
            },
            paint: {
                'text-color': '#8B4513',
                'text-halo-color': '#ffffff',
                'text-halo-width': 1.2
            }
        });

        createFlagsLayer(map, pathPoints, SECTION_BOUNDARY_MILES, KNOWN_LENGTH_MI, cumDist, cumDistArr);

        // ── Elevation Profile ──────────────────────────────

        const canvas = document.getElementById('profile-canvas');
        const ctx = canvas.getContext('2d');
        const profilePanel = document.getElementById('elevation-profile');
        const toggleBtn = document.getElementById('profile-toggle');

        let hoverDist = null;

        flyThrough = initFlyThrough(map, pathPoints, (progress) => {
            const mile = progress > 0 ? (progress / 1609.34) * (KNOWN_LENGTH_MI / cumDist) : null;
            setMile(mile, 'flythrough');
        }, updateControls);

        document.getElementById('flythrough-btn').addEventListener('click', () => {
            if (flyThrough.isRunning() && is2D) {
                fitBoundsAndRecord(courseBounds, { padding: FIT_BOUNDS_PADDING, duration: 1000, pitch: 0, bearing: 0 });
            }
        });

        const scrollytelling = initScrollytelling({
            onMileChange(mile) {
                const flyMeters = mile * 1609.34;
                flyThrough.setProgress(flyMeters);
                setMile(mile, 'scroll');
            },
            onSidebarToggle(isOpen) {
                const flythroughEl = document.getElementById('flythrough-controls');
                if (isOpen) {
                    flythroughEl.style.display = 'none';
                    if (flyThrough.isRunning()) flyThrough.pause();
                } else {
                    flythroughEl.style.display = '';
                }
            }
        });

        onMileChange(() => drawProfile());

        document.getElementById('scrollytelling-sidebar').addEventListener('transitionend', () => {
            map.resize();
        });

        setTimeout(() => { scrollytelling.open(); }, 600);

        function interpProfileCoords(d) {
            const scale = KNOWN_LENGTH_MI / cumDist;
            const meterDist = d / scale;
            for (let i = 1; i < pathPoints.length; i++) {
                if (cumDistArr[i] >= meterDist) {
                    const seg = cumDistArr[i] - cumDistArr[i - 1];
                    const t = seg > 0 ? (meterDist - cumDistArr[i - 1]) / seg : 0;
                    return {
                        lon: pathPoints[i - 1].lon + (pathPoints[i].lon - pathPoints[i - 1].lon) * t,
                        lat: pathPoints[i - 1].lat + (pathPoints[i].lat - pathPoints[i - 1].lat) * t
                    };
                }
            }
            return { lon: pathPoints[pathPoints.length - 1].lon, lat: pathPoints[pathPoints.length - 1].lat };
        }

        function restoreRunner() {
            const mile = getMile();
            if (mile !== null) {
                const c = interpProfileCoords(mile);
                flyThrough.moveRunner(c.lon, c.lat);
            } else {
                flyThrough.hideRunner();
            }
        }

        function distToMeters(d) {
            return d / (KNOWN_LENGTH_MI / cumDist);
        }

        function milesToFlyMeters(mi) {
            return mi * 1609.34;
        }

        function drawProfile() {
            const parent = canvas.parentElement;
            const w = parent.clientWidth, h = parent.clientHeight;
            if (w === 0 || h === 0) return;
            canvas.width = w * devicePixelRatio;
            canvas.height = h * devicePixelRatio;
            ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
            const pad = {
                top: PROFILE_PAD.top,
                bottom: w < 500 ? 14 : PROFILE_PAD.bottom,
                left: w < 500 ? 32 : PROFILE_PAD.left,
                right: PROFILE_PAD.right
            };
            const pw = w - pad.left - pad.right, ph = h - pad.top - pad.bottom;

            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#faf8f5';
            ctx.fillRect(0, 0, w, h);

            if (profile.length < 2) return;

            const elevs = profile.map(p => p.ele * 3.28084);
            const dists = profile.map(p => p.dist);
            const maxE = Math.max(...elevs), minE = Math.min(...elevs);
            const maxD = dists[dists.length - 1];
            const rangeE = maxE - minE || 1;

            ctx.strokeStyle = 'rgba(196,168,130,0.2)';
            ctx.lineWidth = 0.5;
            for (let g = 0; g <= 4; g++) {
                const y = pad.top + (g / 4) * ph;
                ctx.beginPath();
                ctx.moveTo(pad.left, y);
                ctx.lineTo(pad.left + pw, y);
                ctx.stroke();
                const val = maxE - (g / 4) * rangeE;
                ctx.fillStyle = '#C4A882';
                ctx.font = '9px "Fraunces", Georgia, serif';
                ctx.textAlign = 'right';
                ctx.fillText(`${Math.round(val)}'`, pad.left - 5, y + 3);
            }

            const totalMi = maxD;
            const isMobile = w < 500;
            const labelStep = isMobile
                ? Math.max(5, Math.ceil(totalMi / Math.floor(pw / 60)))
                : Math.max(1, Math.ceil(totalMi / Math.floor(pw / 50)));
            const xFont = isMobile ? '7px "Fraunces", Georgia, serif' : '9px "Fraunces", Georgia, serif';
            const xBottom = isMobile ? 10 : 13;
            ctx.font = xFont;
            ctx.textAlign = 'center';
            for (let m = labelStep; m <= totalMi; m += labelStep) {
                const mx = pad.left + (m / totalMi) * pw;
                ctx.strokeStyle = 'rgba(0,0,0,0.05)';
                ctx.lineWidth = 0.5;
                ctx.beginPath();
                ctx.moveTo(mx, pad.top);
                ctx.lineTo(mx, pad.top + ph);
                ctx.stroke();
                ctx.fillStyle = '#C4A882';
                ctx.fillText(`${m}`, mx, pad.top + ph + xBottom);
            }

            const grad = ctx.createLinearGradient(0, pad.top, 0, pad.top + ph);
            grad.addColorStop(0, 'rgba(255, 59, 48, 0.15)');
            grad.addColorStop(0.5, 'rgba(196, 168, 130, 0.06)');
            grad.addColorStop(1, 'rgba(196, 168, 130, 0.01)');
            ctx.beginPath();
            ctx.moveTo(pad.left, pad.top + ph);
            for (let i = 0; i < profile.length; i++) {
                ctx.lineTo(pad.left + (dists[i] / maxD) * pw, pad.top + ph - ((elevs[i] - minE) / rangeE) * ph);
            }
            ctx.lineTo(pad.left + pw, pad.top + ph);
            ctx.closePath();
            ctx.fillStyle = grad;
            ctx.fill();

            ctx.beginPath();
            for (let i = 0; i < profile.length; i++) {
                const x = pad.left + (dists[i] / maxD) * pw;
                const y = pad.top + ph - ((elevs[i] - minE) / rangeE) * ph;
                i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
            }
            ctx.strokeStyle = '#FF3B30';
            ctx.lineWidth = 2;
            ctx.shadowColor = 'rgba(255,59,48,0.2)';
            ctx.shadowBlur = 4;
            ctx.stroke();
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;

            ctx.save();
            for (let si = 0; si < SECTION_BOUNDARY_MILES.length; si++) {
                const mile = SECTION_BOUNDARY_MILES[si];
                const sx = pad.left + (mile / maxD) * pw;
                ctx.beginPath();
                ctx.setLineDash([2, 3]);
                ctx.moveTo(sx, pad.top);
                ctx.lineTo(sx, pad.top + ph);
                ctx.strokeStyle = 'rgba(196,168,130,0.3)';
                ctx.lineWidth = 0.75;
                ctx.stroke();
                ctx.setLineDash([]);
                if (si > 0 && si < SECTION_BOUNDARY_MILES.length - 1) {
                    ctx.beginPath();
                    ctx.moveTo(sx, pad.top);
                    ctx.lineTo(sx, pad.top - 8);
                    ctx.strokeStyle = 'rgba(196,168,130,0.4)';
                    ctx.lineWidth = 1;
                    ctx.stroke();
                    ctx.beginPath();
                    ctx.moveTo(sx, pad.top - 8);
                    ctx.lineTo(sx + 5, pad.top - 5);
                    ctx.lineTo(sx, pad.top - 2);
                    ctx.closePath();
                    ctx.fillStyle = 'rgba(196,168,130,0.4)';
                    ctx.fill();
                }
            }
            ctx.restore();

            const scrubDist = hoverDist !== null ? hoverDist : getMile();
            if (scrubDist !== null && scrubDist > 0) {
                const sx = pad.left + (scrubDist / maxD) * pw;
                let sy = pad.top, eleAtScrub = minE;
                for (let i = 1; i < profile.length; i++) {
                    if (dists[i] >= scrubDist) {
                        const t = (dists[i] - dists[i - 1]) > 0 ? (scrubDist - dists[i - 1]) / (dists[i] - dists[i - 1]) : 0;
                        eleAtScrub = elevs[i - 1] + t * (elevs[i] - elevs[i - 1]);
                        sy = pad.top + ph - ((eleAtScrub - minE) / rangeE) * ph;
                        break;
                    }
                }
                ctx.beginPath();
                ctx.moveTo(sx, pad.top);
                ctx.lineTo(sx, pad.top + ph);
                ctx.strokeStyle = 'rgba(255,59,48,0.25)';
                ctx.lineWidth = 1;
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(sx, sy, 3.5, 0, Math.PI * 2);
                ctx.fillStyle = '#FF3B30';
                ctx.fill();
                ctx.strokeStyle = '#fff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
                ctx.fillStyle = '#2d2d2d';
                ctx.font = '600 9px "Fraunces", Georgia, serif';
                ctx.textAlign = 'center';
                ctx.fillText(`${scrubDist.toFixed(1)} mi  ·  ${Math.round(eleAtScrub)} ft`, sx, pad.top - 4);
            }
        }

        drawProfile();
        window.addEventListener('resize', drawProfile);
        profilePanel.addEventListener('transitionend', () => drawProfile());

        toggleBtn.addEventListener('click', () => {
            profilePanel.classList.toggle('collapsed');
            document.getElementById('flythrough-controls').classList.toggle('profile-collapsed');
            document.getElementById('sidebar-toggle').classList.toggle('profile-collapsed');
        });

        // ── Hover: map → runner + profile ──────────────────

        map.on('mousemove', (e) => {
            if (flyThrough.isRunning()) return;
            let minSq = Infinity;
            let nearest = null;
            let nearestPt = null;
            for (let i = 0; i < pathPoints.length; i++) {
                const sp = map.project([pathPoints[i].lon, pathPoints[i].lat]);
                const sq = (sp.x - e.point.x) ** 2 + (sp.y - e.point.y) ** 2;
                if (sq < minSq) { minSq = sq; nearest = profile[i].dist; nearestPt = pathPoints[i]; }
            }
            if (minSq < 900 && nearestPt) {
                hoverDist = nearest;
                flyThrough.moveRunner(nearestPt.lon, nearestPt.lat);
                flyThrough.showRunner();
            } else {
                hoverDist = null;
                restoreRunner();
            }
            drawProfile();
        });

        map.on('mouseleave', () => {
            hoverDist = null;
            restoreRunner();
            drawProfile();
        });

        // ── Click: map → camera ────────────────────────────

        map.on('click', (e) => {
            let minSq = Infinity;
            let nearestPt = null;
            let nearestIdx = 0;
            for (let i = 0; i < pathPoints.length; i++) {
                const sp = map.project([pathPoints[i].lon, pathPoints[i].lat]);
                const sq = (sp.x - e.point.x) ** 2 + (sp.y - e.point.y) ** 2;
                if (sq < minSq) { minSq = sq; nearestPt = pathPoints[i]; nearestIdx = i; }
            }
            if (minSq < 900 && nearestPt) {
                const meterDist = milesToFlyMeters(cumDistArr[nearestIdx]);
                const mile = (meterDist / 1609.34) * (KNOWN_LENGTH_MI / cumDist);
                flyThrough.setProgress(meterDist, false);
                if (!(is2D && flyThrough.isRunning()) || hasMovedFromFit || userMovedFromFit()) {
                    map.jumpTo({ center: [nearestPt.lon, nearestPt.lat] });
                }
                scrollytelling.jumpToMile(mile);
                setMile(mile, 'map-click');
            }
        });

        // ── Hover: profile → runner ────────────────────────

        canvas.addEventListener('mousemove', (e) => {
            if (flyThrough.isRunning()) return;
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const pw = rect.width - PROFILE_PAD.left - PROFILE_PAD.right;
            const relX = mx - PROFILE_PAD.left;
            if (relX < 0 || relX > pw) {
                hoverDist = null;
                restoreRunner();
                drawProfile();
                return;
            }
            const dists = profile.map(p => p.dist);
            const maxD = dists[dists.length - 1];
            hoverDist = (relX / pw) * maxD;
            const coords = interpProfileCoords(hoverDist);
            flyThrough.moveRunner(coords.lon, coords.lat);
            flyThrough.showRunner();
            drawProfile();
        });

        canvas.addEventListener('mouseleave', () => {
            hoverDist = null;
            restoreRunner();
            drawProfile();
        });

        // ── Click: profile → camera ────────────────────────

        canvas.addEventListener('click', (e) => {
            const rect = canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const pw = rect.width - PROFILE_PAD.left - PROFILE_PAD.right;
            const relX = mx - PROFILE_PAD.left;
            if (relX < 0 || relX > pw) return;
            const dists = profile.map(p => p.dist);
            const maxD = dists[dists.length - 1];
            const clickDist = (relX / pw) * maxD;
            const meterDist = milesToFlyMeters(distToMeters(clickDist));
            const coords = interpProfileCoords(clickDist);
            flyThrough.setProgress(meterDist, false);
            flyThrough.moveRunner(coords.lon, coords.lat);
            flyThrough.showRunner();
            if (!(is2D && flyThrough.isRunning()) || hasMovedFromFit || userMovedFromFit()) {
                map.jumpTo({ center: [coords.lon, coords.lat] });
            }
            scrollytelling.jumpToMile(clickDist);
            setMile(clickDist, 'profile-click');
        });

        fitBoundsAndRecord(courseBounds, { padding: FIT_BOUNDS_PADDING, duration: 3500, pitch: 55, bearing: 90 });

        updateControls();

        // ── Intro overlay ───────────────────────────────────

        const introOverlay = document.getElementById('intro-overlay');
        let introDismissed = false;
        const introStartTime = Date.now();
        const INTRO_MIN_MS = 2000;

        function dismissIntro() {
            if (introDismissed) return;
            introDismissed = true;
            introOverlay.classList.add('fade-out');
            setTimeout(() => { introOverlay.style.display = 'none'; }, 700);
        }

        map.on('idle', function checkIntroIdle() {
            const elapsed = Date.now() - introStartTime;
            if (elapsed >= INTRO_MIN_MS) {
                dismissIntro();
                map.off('idle', checkIntroIdle);
            }
        });

        setTimeout(dismissIntro, 4000);

    } catch (err) {
        console.error('Error:', err);
    }
});

function haversineMi(lon1, lat1, lon2, lat2) {
    const R = 3959;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
