// ── Scroll Unity: Continuous storyProgress ─────────────

(function() {
    var frame = document.getElementById('unity-frame');
    var scrollRoom = document.getElementById('unity-scroll-room');
    var demos = document.querySelectorAll('.frame-demo');
    var urlPath = document.getElementById('url-path-desktop');
    var frameDemos = document.querySelector('.frame-demos');
    if (!frame || !scrollRoom || !demos.length || !urlPath || !frameDemos) return;

    var SECT_COUNT = 3;
    var PATHS = ['/register', '/course', '/results'];

    function clamp(v, min, max) { return Math.max(min, Math.min(max, v)); }
    function smoothstep(t) { return t * t * (3 - 2 * t); }

    function getStoryProgress() {
        var scrollY = window.scrollY || window.pageYOffset;
        var roomTop = scrollRoom.getBoundingClientRect().top + scrollY;
        var roomHeight = scrollRoom.offsetHeight;
        var vh = window.innerHeight;
        var scrollRange = roomHeight - vh;
        if (scrollRange <= 0) return 0;
        var scrolled = scrollY - roomTop;
        return clamp(scrolled / scrollRange, 0, 1) * (SECT_COUNT - 1);
    }

    var prevRaw = -1;

    function update() {
        var raw = getStoryProgress();
        if (Math.abs(raw - prevRaw) < 0.002 && prevRaw > -0.5) return;
        prevRaw = raw;

        var primary = 0;
        var maxOp = 0;
        var opacities = [0, 0, 0];

        for (var i = 0; i < SECT_COUNT; i++) {
            var t = clamp(1 - Math.abs(i - raw), 0, 1);
            opacities[i] = smoothstep(t);
            if (opacities[i] > maxOp) { maxOp = opacities[i]; primary = i; }
        }

        demos.forEach(function(d, i) {
            d.style.opacity = opacities[i];
            d.style.pointerEvents = 'none';
            d.style.zIndex = Math.round((1 - Math.abs(i - raw)) * 100);
        });

        urlPath.textContent = PATHS[primary] || '';

        var sectProgress = raw - primary;
        var breathe = Math.sin(sectProgress * Math.PI);
        var scale = 0.997 + breathe * 0.006;
        var shiftY = (sectProgress - 0.5) * 6;
        frameDemos.style.transform = 'scale(' + scale + ') translateY(' + shiftY + 'px)';
    }

    update();

    var ticking = false;
    window.addEventListener('scroll', function() {
        if (!ticking) {
            window.requestAnimationFrame(function() {
                update();
                ticking = false;
            });
            ticking = true;
        }
    });

    window.addEventListener('resize', update);
})();

// ── Pre's Trail Course Map (Desktop) ───────────────────

(function() {
    var container = document.getElementById('mesh-map-desktop');
    if (!container) return;

    var demSource = new mlcontour.DemSource({
        url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
        encoding: 'terrarium',
        maxzoom: 15,
        worker: true,
        cacheSize: 100
    });
    demSource.setupMaplibre(maplibregl);

    var map = new maplibregl.Map({
        container: 'mesh-map-desktop',
        style: {
            version: 8,
            glyphs: 'https://fonts.openmaptiles.org/{fontstack}/{range}.pbf',
            sources: {
                light: {
                    type: 'raster',
                    tiles: ['https://basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
                }
            },
            layers: [{ id: 'light', type: 'raster', source: 'light', paint: { 'raster-saturation': 0.6, 'raster-contrast': 0.1 } }]
        },
        center: [-123.067, 44.052],
        zoom: 15,
        pitch: 0,
        bearing: 0,
        attributionControl: false
    });
    window.meshMapDesktop = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    var gpxProfile = null;
    var elevationChart = document.getElementById('elevation-chart-desktop');

    function parseGPX(text) {
        var doc = new DOMParser().parseFromString(text, 'text/xml');
        var trkpts = doc.querySelectorAll('trkpt');
        var coords = [];
        var profile = [];
        trkpts.forEach(function(pt) {
            var lat = parseFloat(pt.getAttribute('lat'));
            var lon = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) coords.push([lon, lat]);
            var ele = pt.querySelector('ele');
            if (ele) {
                var e = parseFloat(ele.textContent);
                if (!isNaN(e)) profile.push(e * 3.28084);
            }
        });
        if (profile.length === coords.length) gpxProfile = profile;
        return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };
    }

    window.drawElevationDesktop = function() {
        if (!elevationChart || !gpxProfile || gpxProfile.length < 2) return;
        var w = elevationChart.clientWidth, h = elevationChart.clientHeight;
        if (w === 0 || h === 0) return;
        elevationChart.innerHTML = '';
        var svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
        svg.setAttribute('width', w);
        svg.setAttribute('height', h);
        svg.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
        var minEle = Math.min.apply(null, gpxProfile);
        var maxEle = Math.max.apply(null, gpxProfile);
        var range = maxEle - minEle || 1;
        var pad = 4;
        var drawW = w - pad * 2, drawH = h - pad * 2;
        var pts = gpxProfile.map(function(e, i) {
            var x = pad + (i / (gpxProfile.length - 1)) * drawW;
            var y = pad + drawH - ((e - minEle) / range) * drawH;
            return x + ',' + y;
        });
        var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
        polyline.setAttribute('points', pts.join(' '));
        polyline.setAttribute('fill', 'none');
        polyline.setAttribute('stroke', '#FF3B30');
        polyline.setAttribute('stroke-width', '1.5');
        polyline.setAttribute('stroke-linejoin', 'round');
        svg.appendChild(polyline);
        elevationChart.appendChild(svg);
    }

    function loadData() {
        fetch('Pres_Trail.gpx')
            .then(function(r) { if (!r.ok) throw new Error('GPX failed'); return r.text(); })
            .then(function(text) {
                var trail = parseGPX(text);
                if (!map.getSource('trail')) { addTrail(trail); }
                window.drawElevationDesktop();
            })
            .catch(function() {
                var pts = [];
                var lng = -123.08, lat = 44.052;
                for (var i = 0; i < 200; i++) {
                    lng += 0.0003 + Math.sin(i * 0.2) * 0.0001;
                    lat += 0.0001 + Math.cos(i * 0.15) * 0.0001;
                    pts.push([lng, lat]);
                }
                gpxProfile = pts.map(function() { return 420 + Math.random() * 20; });
                if (!map.getSource('trail')) { addTrail({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts } }); }
                window.drawElevationDesktop();
            });
        addNodes();
    }

    window.addEventListener('resize', function() {
        if (typeof window.drawElevationDesktop === 'function') window.drawElevationDesktop();
    });

    function addTrail(geoJSON) {
        map.addSource('trail', { type: 'geojson', data: geoJSON });
        map.addLayer({ id: 'trail-glow', type: 'line', source: 'trail',
            paint: { 'line-color': '#FF3B30', 'line-width': 5, 'line-opacity': 0.12, 'line-blur': 3 } });
        map.addLayer({ id: 'trail', type: 'line', source: 'trail',
            paint: { 'line-color': '#FF3B30', 'line-width': 2, 'line-opacity': 0.7 } });
        ['nodes-start','nodes-parking','nodes-restrooms'].forEach(function(l) {
            try { map.moveLayer(l); } catch(e) {}
        });
        var bounds = new maplibregl.LngLatBounds();
        geoJSON.geometry.coordinates.forEach(function(c) { bounds.extend(c); });
        map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
    }

    function onReady() {
        if (!map.getSource('trail')) loadData();
    }

    if (map.loaded()) { onReady(); } else { map.on('load', onReady); }

    function addNodes() {
        var nodes = [
            { lat: 44.052, lng: -123.067, label: 'Start / Finish', type: 'start' },
            { lat: 44.054, lng: -123.074, label: 'Parking', type: 'parking' },
            { lat: 44.051, lng: -123.060, label: 'Restrooms', type: 'restrooms' }
        ];
        var features = nodes.map(function(n) {
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
                properties: { type: n.type, label: n.label } };
        });
        map.addSource('nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: features } });

        map.addLayer({ id: 'nodes-start', type: 'circle', source: 'nodes',
            filter: ['==', ['get', 'type'], 'start'],
            paint: { 'circle-radius': 8, 'circle-color': 'rgba(100,150,255,0.9)',
                'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.2)' } });
        map.addLayer({ id: 'nodes-parking', type: 'circle', source: 'nodes',
            filter: ['==', ['get', 'type'], 'parking'],
            paint: { 'circle-radius': 6, 'circle-color': '#9B59B6', 'circle-opacity': 0.8,
                'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.15)' } });
        map.addLayer({ id: 'nodes-restrooms', type: 'circle', source: 'nodes',
            filter: ['==', ['get', 'type'], 'restrooms'],
            paint: { 'circle-radius': 6, 'circle-color': '#FFBD2E', 'circle-opacity': 0.8,
                'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.15)' } });

        function showPopup(e) {
            if (!e.features || !e.features[0]) return;
            var p = e.features[0].properties;
            new maplibregl.Popup({ offset: 16, closeButton: false })
                .setLngLat(e.features[0].geometry.coordinates)
                .setHTML('<b>' + p.label + '</b>')
                .addTo(map);
        }

        map.on('click', 'nodes-start', showPopup);
        map.on('click', 'nodes-parking', showPopup);
        map.on('click', 'nodes-restrooms', showPopup);
        map.on('mouseenter', 'nodes-start', function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseenter', 'nodes-parking', function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseenter', 'nodes-restrooms', function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'nodes-start', function() { map.getCanvas().style.cursor = ''; });
        map.on('mouseleave', 'nodes-parking', function() { map.getCanvas().style.cursor = ''; });
        map.on('mouseleave', 'nodes-restrooms', function() { map.getCanvas().style.cursor = ''; });

        ['nodes-start','nodes-parking','nodes-restrooms'].forEach(function(l) {
            try { map.moveLayer(l); } catch(e) {}
        });
    }

})();

// ── Leaderboard Interactivity ──────────────────────────

(function() {
    function bindLeaderboard(container) {
        if (!container) return;

        container.querySelectorAll('.filter-pill').forEach(function(pill) {
            pill.addEventListener('click', function() {
                var parent = pill.parentNode;
                parent.querySelectorAll('.filter-pill').forEach(function(p) { p.classList.remove('active'); });
                pill.classList.add('active');
                var filter = pill.dataset.filter || 'overall';
                var table = container.querySelector('table');
                if (!table) return;
                table.querySelectorAll('tbody tr').forEach(function(row) {
                    var div = (row.querySelector('.div') || {}).textContent || '';
                    if (filter === 'overall') { row.style.display = ''; return; }
                    if (filter === 'men') { row.style.display = div.charAt(0) === 'M' ? '' : 'none'; return; }
                    if (filter === 'women') { row.style.display = div.charAt(0) === 'F' ? '' : 'none'; return; }
                    row.style.display = div.indexOf(filter) !== -1 ? '' : 'none';
                });
            });
        });

        container.querySelectorAll('.search-box').forEach(function(box) {
            box.addEventListener('input', function() {
                var q = this.value.toLowerCase();
                var table = container.querySelector('table');
                if (!table) return;
                table.querySelectorAll('tbody tr').forEach(function(row) {
                    var name = (row.querySelector('.name') || {}).textContent || '';
                    var bib = (row.querySelector('.bib') || {}).textContent || '';
                    row.style.display = (name.toLowerCase().indexOf(q) !== -1 || bib.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
                });
            });
        });
    }

    var desktopLB = document.querySelector('.desktop-unity .leaderboard-card');
    if (desktopLB) bindLeaderboard(desktopLB);
})();
