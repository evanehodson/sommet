function toRad(d) { return d * Math.PI / 180; }
function toDeg(r) { return r * 180 / Math.PI; }

function haversine(lon1, lat1, lon2, lat2) {
    const R = 6371000;
    const dLat = toRad(lat2 - lat1);
    const dLon = toRad(lon2 - lon1);
    const a = Math.sin(dLat / 2) ** 2 +
              Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function bearingDeg(lon1, lat1, lon2, lat2) {
    const dLon = toRad(lon2 - lon1);
    const y = Math.sin(dLon) * Math.cos(toRad(lat2));
    const x = Math.cos(toRad(lat1)) * Math.sin(toRad(lat2)) -
              Math.sin(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.cos(dLon);
    return (toDeg(Math.atan2(y, x)) + 360) % 360;
}

function buildCumDist(pts) {
    const cum = [0];
    for (let i = 1; i < pts.length; i++) {
        cum.push(cum[i - 1] + haversine(pts[i - 1].lon, pts[i - 1].lat, pts[i].lon, pts[i].lat));
    }
    return cum;
}

function interpAt(cum, pts, dist) {
    const total = cum[cum.length - 1];
    const d = Math.max(0, Math.min(dist, total));
    let lo = 0, hi = cum.length - 1;
    while (lo < hi - 1) {
        const mid = (lo + hi) >> 1;
        if (cum[mid] <= d) lo = mid; else hi = mid;
    }
    const seg = cum[hi] - cum[lo];
    const t = seg > 0 ? (d - cum[lo]) / seg : 0;
    return {
        lon: pts[lo].lon + (pts[hi].lon - pts[lo].lon) * t,
        lat: pts[lo].lat + (pts[hi].lat - pts[lo].lat) * t,
        ele: pts[lo].ele + (pts[hi].ele - pts[lo].ele) * t
    };
}

function cameraCenter(dot, bearing, elev) {
    const headRad = toRad(bearing);
    const cosLat = Math.cos(toRad(dot.lat));
    const dLat = elev * Math.cos(headRad) / 111320;
    const dLon = elev * Math.sin(headRad) / (111320 * cosLat);
    return [dot.lon + dLon, dot.lat + dLat];
}

function sampleBearing(cum, pts, from, range, samples) {
    let dx = 0, dy = 0;
    const end = Math.min(from + range, cum[cum.length - 1]);
    for (let i = 0; i < samples; i++) {
        const d1 = from + (end - from) * i / samples;
        const d2 = Math.min(d1 + range * 0.05, end);
        const p1 = interpAt(cum, pts, d1);
        const p2 = interpAt(cum, pts, d2);
        const b = toRad(bearingDeg(p1.lon, p1.lat, p2.lon, p2.lat));
        dx += Math.cos(b);
        dy += Math.sin(b);
    }
    return (toDeg(Math.atan2(dy, dx)) + 360) % 360;
}

export function initFlyThrough(map, pathPoints, onProgress, onStateChange) {
    const SPEED = 1200;
    const CAM_ABOVE = 1800;
    const EARTH_CIRC = 40075016.686;
    const HEADING_FORWARD = SPEED * 2;
    const LOOK_AHEAD = SPEED * 2;
    const LERP_RATE = 3;

    const cumDist = buildCumDist(pathPoints);
    const totalLen = cumDist[cumDist.length - 1];

    let running = false;
    let animFrame = null;
    let progress = 0;
    let lastTime = null;
    let smoothBearing = null;
    let smoothSurfEle = null;

    let userZoom = null;
    let userPitch = null;
    let orbitDegrees = 0;
    let lastFrameZoom = null;
    let skipPitchFrame = false;

    let compassDragStart = 0;
    let isDraggingCompass = false;

    let viewMode = 'follow';

    const btn = document.getElementById('flythrough-btn');
    const playIcon = document.getElementById('play-icon');
    const pauseIcon = document.getElementById('pause-icon');
    const backBtn = document.getElementById('flythrough-back');
    const stopBtn = document.getElementById('flythrough-stop');

    const compassEl = document.getElementById('compass');

    compassEl.addEventListener('mousedown', (e) => {
        if (e.button !== 0) return;
        isDraggingCompass = true;
        compassDragStart = map.getBearing();
    });
    compassEl.addEventListener('touchstart', () => {
        isDraggingCompass = true;
        compassDragStart = map.getBearing();
    }, { passive: true });
    document.addEventListener('mouseup', () => { isDraggingCompass = false; });
    document.addEventListener('touchend', () => { isDraggingCompass = false; });

    const zoomInBtn = document.getElementById('zoom-in');
    const zoomOutBtn = document.getElementById('zoom-out');
    if (zoomInBtn) zoomInBtn.addEventListener('click', () => {
        if (userZoom !== null) userZoom = Math.max(2, Math.min(18, userZoom + 1));
    });
    if (zoomOutBtn) zoomOutBtn.addEventListener('click', () => {
        if (userZoom !== null) userZoom = Math.max(2, Math.min(18, userZoom - 1));
    });

    map.addSource('fly-runner', {
        type: 'geojson',
        data: { type: 'Feature', geometry: { type: 'Point', coordinates: [pathPoints[0].lon, pathPoints[0].lat] } }
    });

    if (!map.hasImage('runner-dot')) {
        const S = 64;
        const c = document.createElement('canvas');
        c.width = S; c.height = S;
        const cx = c.getContext('2d');
        cx.shadowColor = 'rgba(218,44,56,0.45)';
        cx.shadowBlur = 6;
        cx.beginPath();
        cx.arc(S / 2, S / 2, S / 2 - 2, 0, Math.PI * 2);
        cx.fillStyle = '#FF3B30';
        cx.fill();
        cx.shadowBlur = 0;
        cx.lineWidth = 7;
        cx.strokeStyle = '#ffffff';
        cx.stroke();
        map.addImage('runner-dot', {
            width: S, height: S,
            data: cx.getImageData(0, 0, S, S).data
        });
    }

    map.addLayer({
        id: 'fly-runner-layer',
        type: 'symbol',
        source: 'fly-runner',
        layout: {
            'icon-image': 'runner-dot',
            'icon-size': 0.3,
            'icon-allow-overlap': true,
            'icon-pitch-alignment': 'map',
            'icon-rotation-alignment': 'map',
            'visibility': 'none'
        }
    });

    const runnerSource = map.getSource('fly-runner');

    function moveRunner(lon, lat) {
        if (!runnerSource) return;
        try {
            runnerSource.setData({ type: 'Feature', geometry: { type: 'Point', coordinates: [lon, lat] } });
        } catch (e) { }
    }

    function showRunner() {
        map.setLayoutProperty('fly-runner-layer', 'visibility', 'visible');
    }

    function hideRunner() {
        map.setLayoutProperty('fly-runner-layer', 'visibility', 'none');
    }

    function tick(now) {
        if (!running) return;

        if (lastTime === null) lastTime = now;
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        progress = Math.min(progress + SPEED * dt, totalLen);
        if (onProgress) onProgress(progress, totalLen);

        const dot = interpAt(cumDist, pathPoints, progress);
        moveRunner(dot.lon, dot.lat);
        showRunner();

        if (viewMode === 'overview') {
            if (progress >= totalLen) { stopAll(); return; }
            animFrame = requestAnimationFrame(tick);
            return;
        }

        const targetBearing = sampleBearing(cumDist, pathPoints, progress, HEADING_FORWARD, 20);

        if (smoothBearing === null) {
            smoothBearing = targetBearing;
            smoothSurfEle = dot.ele;
        }

        const lerp = 1 - Math.exp(-LERP_RATE * dt);
        const slowLerp = 1 - Math.exp(-0.8 * dt);

        if (!isDraggingCompass) {
            let bDiff = targetBearing - smoothBearing;
            if (bDiff > 180) bDiff -= 360;
            if (bDiff < -180) bDiff += 360;
            smoothBearing = ((smoothBearing + bDiff * lerp) % 360 + 360) % 360;
        }

        let surfEle = dot.ele;
        try {
            const qe = map.queryTerrainElevation([dot.lon, dot.lat]);
            if (qe != null && !isNaN(qe)) surfEle = qe;
        } catch (e) { }
        smoothSurfEle += (surfEle - smoothSurfEle) * slowLerp;

        if (isDraggingCompass) {
            let curB = map.getBearing();
            let bd = curB - compassDragStart;
            if (bd > 180) bd -= 360;
            if (bd < -180) bd += 360;
            if (Math.abs(bd) > 0.1) {
                orbitDegrees += bd;
                compassDragStart = curB;
            }
        }

        const curZoom = map.getZoom();
        const curPitch = map.getPitch();

        if (userZoom === null) {
            userZoom = curZoom;
        } else if (lastFrameZoom !== null && Math.abs(curZoom - lastFrameZoom) > 0.01) {
            userZoom = curZoom;
        }
        lastFrameZoom = curZoom;

        if (userPitch === null) {
            userPitch = curPitch;
        } else if (!skipPitchFrame && Math.abs(curPitch - userPitch) > 0.5) {
            userPitch = curPitch;
        }
        skipPitchFrame = false;

        const finalBearing = ((smoothBearing + orbitDegrees) % 360 + 360) % 360;
        const targetCenter = cameraCenter(dot, finalBearing, smoothSurfEle);

        map.jumpTo({
            center: targetCenter,
            bearing: finalBearing,
            zoom: userZoom,
            pitch: userPitch
        });

        if (progress >= totalLen) { stopAll(); return; }
        animFrame = requestAnimationFrame(tick);
    }

    function updateButtons() {
        if (running) {
            playIcon.style.display = 'none';
            pauseIcon.style.display = 'block';
            btn.title = 'Pause flythrough';
            btn.classList.add('active');
        } else {
            playIcon.style.display = 'block';
            pauseIcon.style.display = 'none';
            btn.title = progress > 0 && progress < totalLen ? 'Resume flythrough' : 'Play flythrough';
            btn.classList.remove('active');
        }
        if (stopBtn) stopBtn.style.display = (running || progress > 0) ? 'flex' : 'none';
        if (backBtn) backBtn.style.display = (running || progress > 0) ? 'flex' : 'none';
    }

    function notify() {
        if (onStateChange) onStateChange();
    }

    function resetSmooth() {
        lastTime = null;
        smoothBearing = null;
        smoothSurfEle = null;
    }

    function startAll() {
        userZoom = null;
        userPitch = null;
        orbitDegrees = 0;
        isDraggingCompass = false;
        lastFrameZoom = null;
        viewMode = 'follow';
        running = true;
        resetSmooth();
        updateButtons();
        notify();
        try {
            animFrame = requestAnimationFrame(tick);
        } catch (e) {
            running = false;
            updateButtons();
            notify();
        }
    }

    function pauseAll() {
        running = false;
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        map.stop();
        if (onProgress) onProgress(progress, totalLen);
        updateButtons();
        notify();
    }

    function stopAll() {
        running = false;
        if (animFrame) { cancelAnimationFrame(animFrame); animFrame = null; }
        map.stop();
        progress = 0;
        smoothBearing = null;
        smoothSurfEle = null;
        userZoom = null;
        userPitch = null;
        orbitDegrees = 0;
        isDraggingCompass = false;
        lastFrameZoom = null;
        hideRunner();
        if (onProgress) onProgress(0, totalLen);
        updateButtons();
        notify();
    }

    btn.addEventListener('click', () => {
        if (running) { pauseAll(); return; }
        if (progress > 0 && progress < totalLen) { startAll(); return; }
        progress = 0;
        resetSmooth();
        startAll();
    });

    if (backBtn) {
        backBtn.addEventListener('click', () => {
            stopAll();
            startAll();
        });
    }

    if (stopBtn) {
        stopBtn.addEventListener('click', stopAll);
    }

    function applyCamera(d) {
        const dot = interpAt(cumDist, pathPoints, d);
        moveRunner(dot.lon, dot.lat);
        showRunner();

        const targetBearing = sampleBearing(cumDist, pathPoints, d, HEADING_FORWARD, 20);

        let maxAheadEle = dot.ele;
        for (let t = 0; t <= LOOK_AHEAD; t += SPEED * 0.5) {
            const p = interpAt(cumDist, pathPoints, Math.min(d + t, totalLen));
            if (p.ele > maxAheadEle) maxAheadEle = p.ele;
        }
        let camAbove = maxAheadEle * 1.5 + CAM_ABOVE;
        if (window.innerWidth <= 768) camAbove *= 2.5;
        const targetZoom = Math.max(2, Math.min(18, Math.log2(EARTH_CIRC * Math.cos(toRad(dot.lat)) / camAbove)));

        let surfEle = dot.ele;
        try {
            const qe = map.queryTerrainElevation([dot.lon, dot.lat]);
            if (qe != null && !isNaN(qe)) surfEle = qe;
        } catch (e) { }

        map.stop();
        map.easeTo({
            center: cameraCenter(dot, targetBearing, surfEle),
            bearing: targetBearing,
            zoom: targetZoom,
            duration: 600,
            easing: t => 1 - Math.pow(1 - t, 3)
        });
    }

    function setProgress(meters, moveCamera) {
        progress = Math.max(0, Math.min(meters, totalLen));
        resetSmooth();
        if (moveCamera !== false) {
            applyCamera(progress);
        } else {
            const dot = interpAt(cumDist, pathPoints, progress);
            moveRunner(dot.lon, dot.lat);
            showRunner();
        }
        if (onProgress) onProgress(progress, totalLen);
    }

    function setViewMode(mode) {
        viewMode = mode;
        if (mode === 'follow') {
            userPitch = 60;
            userZoom = null;
            lastFrameZoom = null;
            smoothBearing = null;
            smoothSurfEle = null;
            skipPitchFrame = true;
        }
    }

    function getViewMode() {
        return viewMode;
    }

    return {
        moveRunner,
        showRunner,
        hideRunner,
        setProgress,
        setViewMode,
        getViewMode,
        isRunning: () => running,
        stop: stopAll,
        pause: pauseAll
    };
}
