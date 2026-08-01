// ── Press Expedition 50 — contour topo map ─────────────────────────
// Two stacked maps keep the drawing order right:
//   1. #ridge-topo        -> hypsometric tint only (behind the hero)
//   2. .rc-hero (HTML)    -> hero type sits on the tint
//   3. #ridge-topo-detail -> transparent canvas: contours + GPX trail + POI cards (on top)

// Shared course data — used by the detail map and the course profile.
var PRESS_POIS = [
    { lat: 47.97207, lon: -123.50822, mil: '0.0', ft: '5,018', title: 'Press Point', sub: 'The traverse begins on the high ridge.' },
    { lat: 47.95540, lon: -123.56110, mil: '8.8', ft: '1,199', title: 'Drainage Drop', sub: 'Down off the divide into old timber.' },
    { lat: 47.87896, lon: -123.46957, mil: '17.6', ft: '1,547', title: 'Mid Fork Crossing', sub: 'Cold water, short ferry, low flow.' },
    { lat: 47.77276, lon: -123.45459, mil: '26.4', ft: '1,954', title: 'Shoulder Camp', sub: 'Reload on the exposed shoulder.' },
    { lat: 47.71121, lon: -123.57592, mil: '35.2', ft: '3,170', title: 'Crest Spur', sub: 'The long push back to the ridgeline.' },
    { lat: 47.62784, lon: -123.63281, mil: '43.9', ft: '864', title: 'The Slot', sub: 'Tight tread through the ravine floor.' }
];

(function() {
    var baseContainer = document.getElementById('ridge-topo');
    var detailContainer = document.getElementById('ridge-topo-detail');
    if (!baseContainer || !detailContainer || typeof maplibregl === 'undefined' || typeof mlcontour === 'undefined') return;

    var baseMap = null;
    var detailMap = null;
    var trailBounds = null;
    var state = { drawn: false };
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    function fitTrailCamera(map) {
        if (!trailBounds) return;
        map.fitBounds(trailBounds, { padding: 34, duration: 0, maxZoom: 12.5 });
    }

    function addPoiCards(map) {
        PRESS_POIS.forEach(function(poi, idx) {
            var wrap = document.createElement('div');
            wrap.className = 'rc-card';
            var panel = document.createElement('div');
            panel.className = 'rc-panel';
            var kick = document.createElement('span');
            kick.className = 'rc-kick';
            kick.textContent = 'MIL ' + poi.mil + ' \u00B7 ' + poi.ft + ' FT';
            var title = document.createElement('span');
            title.className = 'rc-title';
            title.textContent = poi.title;
            var sub = document.createElement('span');
            sub.className = 'rc-sub';
            sub.textContent = poi.sub;
            panel.appendChild(kick);
            panel.appendChild(title);
            panel.appendChild(sub);
            wrap.appendChild(panel);
            panel.style.transitionDelay = (650 + idx * 170) + 'ms';
            if (state.drawn) wrap.classList.add('is-live');
            new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat([poi.lon, poi.lat]).addTo(map);
        });
    }

    // The route prints itself when the map section scrolls into view.
    function applyTrailOpacity() {
        if (!detailMap || !detailMap.getLayer('trail-line')) return;
        detailMap.setPaintProperty('trail-casing', 'line-opacity', 1, reduceMotion ? {} : { duration: 1200 });
        detailMap.setPaintProperty('trail-line', 'line-opacity', 1, reduceMotion ? {} : { duration: 1500 });
    }

    function revealCards() {
        document.querySelectorAll('.rc-card').forEach(function(wrap) { wrap.classList.add('is-live'); });
    }

    function drawRoute() {
        if (state.drawn) return;
        state.drawn = true;
        if (!detailMap) return;
        if (detailMap.getLayer('trail-line')) {
            applyTrailOpacity();
            revealCards();
        }
    }

    var mapLayoutEl = document.querySelector('.map-layout');
    if (mapLayoutEl && 'IntersectionObserver' in window) {
        var routeIO = new IntersectionObserver(function(entries) {
            entries.forEach(function(e) { if (e.isIntersecting) { drawRoute(); routeIO.disconnect(); } });
        }, { threshold: 0.2 });
        routeIO.observe(mapLayoutEl);
    } else if (mapLayoutEl) {
        drawRoute();
    }

    var demSource = new mlcontour.DemSource({
        url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        encoding: 'terrarium',
        maxzoom: 15,
        worker: true,
        cacheSize: 100
    });
    demSource.setupMaplibre(maplibregl);

    // Base map — hypsometric tint, painted behind the hero.
    baseMap = new maplibregl.Map({
        container: baseContainer,
        style: {
            version: 8,
            sources: {
                terrain: {
                    type: 'raster-dem',
                    tiles: ['https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png'],
                    encoding: 'terrarium',
                    tileSize: 256,
                    maxzoom: 15
                }
            },
            layers: [
                {
                    id: 'hypso',
                    type: 'color-relief',
                    source: 'terrain',
                    paint: {
                        'color-relief-color': [
                            'interpolate', ['linear'], ['elevation'],
                            0, '#e7ecd7',
                            400, '#e9e2c6',
                            800, '#e5d9ba',
                            1200, '#ddcaa5',
                            1600, '#d3bb90',
                            2200, '#c9ac7c',
                            2800, '#be9c69',
                            3400, '#b28c58'
                        ]
                    }
                }
            ]
        },
        center: [-123.55, 47.77],
        zoom: 9,
        bearing: 0,
        pitch: 0,
        attributionControl: false,
        interactive: false
    });

    // Detail map — transparent canvas that draws contours + GPX on top of the hero.
    detailMap = new maplibregl.Map({
        container: detailContainer,
        style: {
            version: 8,
            sources: {},
            layers: []
        },
        center: [-123.55, 47.77],
        zoom: 9,
        bearing: 0,
        pitch: 0,
        attributionControl: false,
        dragRotate: false,
        scrollZoom: false,
        doubleClickZoom: true,
        touchZoom: true,
        dragPan: true
    });

    detailMap.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    // Keep the hypsometric tint pinned to the detail map's camera.
    detailMap.on('move', function() {
        if (!baseMap) return;
        baseMap.jumpTo({
            center: detailMap.getCenter(),
            zoom: detailMap.getZoom(),
            bearing: detailMap.getBearing(),
            pitch: detailMap.getPitch()
        });
    });

    detailMap.on('load', function() {
        try {
            detailMap.addSource('contours', {
                type: 'vector',
                tiles: [demSource.contourProtocolUrl({
                    multiplier: 3.28084,
                    thresholds: { 8: [200, 400], 10: [100, 200], 12: [100, 200], 14: [50, 100], 15: [50, 100], 16: [50, 100] },
                    contourLayer: 'contours',
                    elevationKey: 'ele',
                    levelKey: 'level',
                    extent: 4096,
                    buffer: 1
                })],
                maxzoom: 18
            });

            detailMap.addLayer({
                id: 'contour-minor',
                type: 'line',
                source: 'contours',
                'source-layer': 'contours',
                filter: ['==', ['get', 'level'], 0],
                paint: {
                    'line-color': 'rgba(139, 101, 63, 0.4)',
                    'line-width': 0.5
                }
            });
            detailMap.addLayer({
                id: 'contour-index',
                type: 'line',
                source: 'contours',
                'source-layer': 'contours',
                filter: ['>', ['get', 'level'], 0],
                paint: {
                    'line-color': 'rgba(104, 74, 45, 0.78)',
                    'line-width': 1.2
                }
            });

            detailMap.addSource('trail', {
                type: 'geojson',
                data: { type: 'Feature', geometry: { type: 'LineString', coordinates: [] } }
            });
            detailMap.addLayer({
                id: 'trail-casing',
                type: 'line',
                source: 'trail',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': 'rgba(239, 233, 219, 0.9)',
                    'line-opacity': 0,
                    'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 2.5, 14, 5.5, 18, 9]
                }
            });
            detailMap.addLayer({
                id: 'trail-line',
                type: 'line',
                source: 'trail',
                layout: { 'line-cap': 'round', 'line-join': 'round' },
                paint: {
                    'line-color': '#b8461f',
                    'line-opacity': 0,
                    'line-width': ['interpolate', ['exponential', 1.5], ['zoom'], 9, 1.4, 14, 3.2, 18, 5.5]
                }
            });
        } catch (e) {
            console.error('Ridgeline topo layers failed:', e);
        }

        fetch('Press_Expedition_Traverse.gpx')
            .then(function(r) { if (!r.ok) throw new Error('GPX failed'); return r.text(); })
            .then(function(text) {
                var doc = new DOMParser().parseFromString(text, 'text/xml');
                var trkpts = doc.querySelectorAll('trkpt');
                var coords = [];
                var bounds = new maplibregl.LngLatBounds();
                trkpts.forEach(function(pt) {
                    var lat = parseFloat(pt.getAttribute('lat'));
                    var lon = parseFloat(pt.getAttribute('lon'));
                    if (isNaN(lat) || isNaN(lon)) return;
                    coords.push([lon, lat]);
                    bounds.extend([lon, lat]);
                });
                if (!coords.length) return;
                detailMap.getSource('trail').setData({ type: 'Feature', geometry: { type: 'LineString', coordinates: coords } });
                trailBounds = bounds;
                fitTrailCamera(detailMap);
                addPoiCards(detailMap);
                if (state.drawn) { applyTrailOpacity(); revealCards(); }
            })
            .catch(function(err) { console.error('Ridgeline GPX load failed:', err); });
    });

    var resizeTimer = null;
    window.addEventListener('resize', function() {
        if (resizeTimer) clearTimeout(resizeTimer);
        resizeTimer = setTimeout(function() {
            if (detailMap) detailMap.resize();
            if (baseMap) baseMap.resize();
            if (detailMap) fitTrailCamera(detailMap);
        }, 120);
    });

    window.__pressMap = { baseMap: baseMap, detailMap: detailMap };
})();

// ── Press photo develop + handoff ─────────────────────────────
// The hero starts covered in a paper dot-screen; on load the dots
// dissolve outward like a developing print, the course numbers count
// up, and the rust rule draws itself under the subline. Scrolling
// hands the eye off to the map: the photo tightens and sinks back.

(function() {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var hero = document.querySelector('.hero');
    var heroBg = document.querySelector('.hero-bg');
    if (!hero) return;

    function runSequence() {
        hero.classList.add('is-loaded');
        if (reduceMotion) {
            document.querySelectorAll('.stat-count').forEach(function(el) {
                el.textContent = Number(el.getAttribute('data-to')).toLocaleString('en-US');
            });
        } else {
            developPhoto();
            animateCounts();
        }
        applyHandoff();
    }

    function developPhoto() {
        var rect = hero.getBoundingClientRect();
        var dpr = Math.min(2, window.devicePixelRatio || 1);
        var cv = document.createElement('canvas');
        cv.className = 'hero-develop';
        cv.width = Math.max(1, Math.round(rect.width * dpr));
        cv.height = Math.max(1, Math.round(rect.height * dpr));
        cv.style.width = rect.width + 'px';
        cv.style.height = rect.height + 'px';
        hero.appendChild(cv);
        var ctx = cv.getContext('2d');
        var w = cv.width, h = cv.height;
        var step = 16 * dpr;
        var dots = [];
        for (var x = step / 2; x < w; x += step) {
            for (var y = step / 2; y < h; y += step) {
                dots.push({
                    x: x, y: y, r: 3 * dpr,
                    delay: Math.random() * 460,
                    dur: 140 + Math.random() * 240,
                    jx: (Math.random() - 0.5) * 16 * dpr,
                    jy: (Math.random() - 0.5) * 16 * dpr
                });
            }
        }
        var t0 = performance.now();
        var total = 900;
        function frame(now) {
            var t = now - t0;
            if (t >= total) { cv.remove(); return; }
            ctx.clearRect(0, 0, w, h);
            ctx.fillStyle = '#efe9db';
            for (var i = 0; i < dots.length; i++) {
                var d = dots[i];
                var lt = t - d.delay;
                if (lt < 0) {
                    ctx.globalAlpha = 0.9;
                    ctx.beginPath(); ctx.arc(d.x, d.y, d.r, 0, 6.2832); ctx.fill();
                } else if (lt < d.dur) {
                    var k = lt / d.dur;
                    var ease = k * k * (3 - 2 * k);
                    ctx.globalAlpha = 0.9 * (1 - ease);
                    ctx.beginPath();
                    ctx.arc(d.x + d.jx * ease, d.y + d.jy * ease, d.r * (1 - ease * 0.7), 0, 6.2832);
                    ctx.fill();
                }
            }
            requestAnimationFrame(frame);
        }
        requestAnimationFrame(frame);
    }

    function animateCounts() {
        var els = document.querySelectorAll('.stat-count');
        var dur = 1500;
        var t0 = performance.now();
        function tick(now) {
            var k = Math.min(1, (now - t0) / dur);
            var eased = 1 - Math.pow(1 - k, 3);
            for (var i = 0; i < els.length; i++) {
                var to = Number(els[i].getAttribute('data-to'));
                els[i].textContent = Math.round(to * eased).toLocaleString('en-US');
            }
            if (k < 1) requestAnimationFrame(tick);
        }
        requestAnimationFrame(tick);
    }

    var ticking = false;
    function updateProgress() {
        var progress = document.querySelector('.scroll-progress');
        if (!progress) return;
        var max = document.documentElement.scrollHeight - window.innerHeight;
        var y = window.pageYOffset || document.documentElement.scrollTop || 0;
        progress.style.width = (max > 0 ? Math.min(1, y / max) : 0) * 100 + '%';
    }

    function applyHandoff() {
        ticking = false;
        var mapEl = document.querySelector('.map-layout');
        if (mapEl && heroBg) {
            var rect = mapEl.getBoundingClientRect();
            var vh = window.innerHeight;
            var start = vh * 0.6, end = vh * 0.1;
            var f = (start - rect.top) / (start - end);
            f = Math.max(0, Math.min(1, f));
            heroBg.style.transform = 'scale(' + (1 + 0.05 * f).toFixed(4) + ')';
            heroBg.style.filter = 'grayscale(1) contrast(' + (1.12 + 0.06 * f).toFixed(3) + ') brightness(' + (0.9 - 0.07 * f).toFixed(3) + ')';
        }
        updateProgress();
    }

    window.addEventListener('scroll', function() {
        if (ticking) return;
        ticking = true;
        requestAnimationFrame(applyHandoff);
    }, { passive: true });
    window.addEventListener('resize', applyHandoff, { passive: true });

    if (document.readyState === 'complete') runSequence();
    else window.addEventListener('load', runSequence);
})();

// ── Course profile — one line drawn from the actual traverse ────────
// Reads the GPX elevations, downsamples to a smooth curve, stamps the
// six checkpoints on it, then draws the line when the section scrolls in.

(function() {
    var reduceMotion = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var profile = document.querySelector('.profile');
    var svg = document.querySelector('.profile-chart');
    if (!profile || !svg) return;

    var NS = 'http://www.w3.org/2000/svg';
    var lineEl = svg.querySelector('.profile-line');
    var fillEl = svg.querySelector('.profile-fill');
    var gridEl = svg.querySelector('.profile-grid');
    var cpsEl = svg.querySelector('.profile-cps');
    var axisMax = document.querySelector('.profile-axis-max');
    var axisMin = document.querySelector('.profile-axis-min');
    if (!lineEl || !fillEl || !gridEl || !cpsEl) return;

    var W = 1200, H = 340;
    var padL = 78, padR = 26, padT = 28, padB = 32;

    // Y-range is pinned to the published course numbers so the profile agrees
    // with the course-data figure (Press Point 5,018' / The Slot 864').
    function drawProfile(pts) {
        var rangeTop = 5018, rangeBottom = 864;
        var span = (rangeTop - rangeBottom) || 1;
        function X(i) { return padL + (i / (pts.length - 1)) * (W - padL - padR); }
        function Y(e) {
            return Math.max(padT, Math.min(H - padB,
                padT + (1 - (e - rangeBottom) / span) * (H - padT - padB)));
        }

        var d = 'M' + pts.map(function(p, i) {
            return X(i).toFixed(2) + ' ' + Y(p[2]).toFixed(2);
        }).join(' L');
        lineEl.setAttribute('d', d);
        fillEl.setAttribute('d', d +
            ' L' + X(pts.length - 1).toFixed(2) + ' ' + (H - padB) +
            ' L' + X(0).toFixed(2) + ' ' + (H - padB) + ' Z');

        [[rangeTop, 'max'], [(rangeTop + rangeBottom) / 2, null], [rangeBottom, 'min']].forEach(function(gl) {
            var y = Y(gl[0]);
            var ln = document.createElementNS(NS, 'line');
            ln.setAttribute('x1', padL); ln.setAttribute('x2', W - padR);
            ln.setAttribute('y1', y); ln.setAttribute('y2', y);
            ln.setAttribute('class', 'profile-grid-line');
            gridEl.appendChild(ln);
            var label = gl[1] === 'max' ? axisMax : axisMin;
            if (label && gl[1]) {
                label.textContent = Math.round(gl[0]).toLocaleString('en-US') + '\u2032';
                label.style.top = (y / H * 100) + '%';
            }
        });

        PRESS_POIS.forEach(function(poi, idx) {
            var best = 0, bd = Infinity;
            for (var i = 0; i < pts.length; i++) {
                var dl = poi.lat - pts[i][1], dn = poi.lon - pts[i][0];
                var dist = dl * dl + dn * dn;
                if (dist < bd) { bd = dist; best = i; }
            }
            var cx = X(best), cy = Y(pts[best][2]);
            var tick = document.createElementNS(NS, 'line');
            tick.setAttribute('x1', cx); tick.setAttribute('x2', cx);
            tick.setAttribute('y1', cy); tick.setAttribute('y2', H - padB);
            tick.setAttribute('class', 'profile-cp-tick');
            tick.style.transitionDelay = (400 + idx * 150) + 'ms';
            cpsEl.appendChild(tick);
            var dot = document.createElementNS(NS, 'circle');
            dot.setAttribute('cx', cx); dot.setAttribute('cy', cy); dot.setAttribute('r', 4.5);
            dot.setAttribute('class', 'profile-cp-dot');
            dot.style.transitionDelay = (400 + idx * 150) + 'ms';
            cpsEl.appendChild(dot);
        });

        if (reduceMotion) {
            profile.classList.add('is-drawn');
            return;
        }
        var L = lineEl.getTotalLength();
        lineEl.style.strokeDasharray = L;
        lineEl.style.strokeDashoffset = L;
        var io = new IntersectionObserver(function(entries) {
            entries.forEach(function(e) {
                if (e.isIntersecting) {
                    profile.classList.add('is-drawn');
                    lineEl.style.strokeDashoffset = '0';
                    io.disconnect();
                }
            });
        }, { threshold: 0.3 });
        io.observe(profile);
    }

    fetch('Press_Expedition_Traverse.gpx')
        .then(function(r) { if (!r.ok) throw new Error('GPX profile failed'); return r.text(); })
        .then(function(text) {
            var doc = new DOMParser().parseFromString(text, 'text/xml');
            var trkpts = doc.querySelectorAll('trkpt');
            var raw = [];
            trkpts.forEach(function(pt) {
                var lat = parseFloat(pt.getAttribute('lat'));
                var lon = parseFloat(pt.getAttribute('lon'));
                var eleNode = pt.querySelector('ele');
                var ele = eleNode ? parseFloat(eleNode.textContent) : NaN;
                if (isNaN(lat) || isNaN(lon)) return;
                raw.push([lon, lat, isNaN(ele) ? null : ele * 3.28084]);
            });
            if (raw.length < 2) throw new Error('no points');

            for (var i = 0; i < raw.length; i++) {
                if (raw[i][2] !== null) continue;
                var j = i;
                while (j < raw.length && raw[j][2] === null) j++;
                var a = i - 1 >= 0 ? raw[i - 1][2] : (j < raw.length ? raw[j][2] : null);
                var b = j < raw.length ? raw[j][2] : a;
                for (var k = i; k < j; k++) raw[k][2] = a + (b - a) * (k - i + 1) / (j - i + 1);
                i = j - 1;
            }

            var N = 170;
            var sampled = [];
            for (var s = 0; s < N; s++) {
                var idx = Math.round(s * (raw.length - 1) / (N - 1));
                sampled.push(raw[idx]);
            }
            var smoothed = sampled.map(function(p, i) {
                var sum = 0, count = 0;
                for (var d = -2; d <= 2; d++) {
                    var j = i + d;
                    if (j < 0 || j >= sampled.length) continue;
                    sum += sampled[j][2]; count++;
                }
                return [p[0], p[1], sum / count];
            });

            drawProfile(smoothed);
        })
        .catch(function(err) { console.error('Course profile failed:', err); });
})();
