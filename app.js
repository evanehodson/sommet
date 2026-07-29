// ── Lifecycle Tab Switching ────────────────────────────

(function() {
    var cards = document.querySelectorAll('.step-card');
    var panels = document.querySelectorAll('.demo-panel');

    function activateTab(tabNum) {
        cards.forEach(function(c) { c.classList.remove('active'); });
        panels.forEach(function(p) { p.classList.remove('active'); });

        var activeCard = document.querySelector('.step-card[data-tab="' + tabNum + '"]');
        var activePanel = document.querySelector('.demo-panel[data-tab="' + tabNum + '"]');
        if (activeCard) activeCard.classList.add('active');
        if (activePanel) activePanel.classList.add('active');

        // Resize maps when switching
        if (tabNum === '1' && window.meshMap) {
            setTimeout(function() { window.meshMap.resize(); }, 100);
        }
        if (tabNum === '2' && window.liveMap) {
            setTimeout(function() { window.liveMap.resize(); }, 100);
        }
    }

    cards.forEach(function(card) {
        card.addEventListener('click', function() {
            activateTab(card.dataset.tab);
        });
    });

    // Activate first tab by default
    activateTab('1');

    // ── Tab 3: Leaderboard interactivity ────────────────

    document.querySelectorAll('.filter-pill').forEach(function(pill) {
        pill.addEventListener('click', function() {
            var parent = pill.parentNode;
            parent.querySelectorAll('.filter-pill').forEach(function(p) { p.classList.remove('active'); });
            pill.classList.add('active');
            var filter = pill.textContent.trim().toLowerCase();
            var table = pill.closest('.results-leaderboard') || document;
            table.querySelectorAll('tbody tr').forEach(function(row) {
                var div = (row.querySelector('.div') || {}).textContent || '';
                if (filter === 'overall') { row.style.display = ''; return; }
                if (filter === 'men') { row.style.display = div.charAt(0) === 'M' ? '' : 'none'; return; }
                if (filter === 'women') { row.style.display = div.charAt(0) === 'F' ? '' : 'none'; return; }
                row.style.display = div.toLowerCase().indexOf(filter.replace('age ', '')) !== -1 ? '' : 'none';
            });
        });
    });

    document.querySelectorAll('.search-box').forEach(function(box) {
        box.addEventListener('input', function() {
            var q = this.value.toLowerCase();
            var table = this.closest('.results-leaderboard') || document;
            table.querySelectorAll('tbody tr').forEach(function(row) {
                var name = (row.querySelector('.name') || {}).textContent || '';
                var bib = (row.querySelector('.bib') || {}).textContent || '';
                row.style.display = (name.toLowerCase().indexOf(q) !== -1 || bib.toLowerCase().indexOf(q) !== -1) ? '' : 'none';
            });
        });
    });

    // Tab 3: Row click → athlete drawer
    document.querySelectorAll('.results-leaderboard tbody tr').forEach(function(row) {
        row.style.cursor = 'pointer';
        row.addEventListener('click', function() {
            document.querySelectorAll('.results-leaderboard tbody tr').forEach(function(r) {
                r.style.background = '';
            });
            row.style.background = 'rgba(255,59,48,0.08)';
            document.getElementById('athlete-drawer').classList.add('active');
        });
    });
})();

// ── Tab 1: 3D Course Map (Mesh Map) ───────────────────

(function() {
    var container = document.getElementById('mesh-map');
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
        container: 'mesh-map',
        style: {
            version: 8,
            sources: {
                dark: {
                    type: 'raster',
                    tiles: ['https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png'],
                    tileSize: 256,
                    attribution: '&copy; <a href="https://carto.com/">CARTO</a>'
                }
            },
            layers: [{ id: 'dark', type: 'raster', source: 'dark' }]
        },
        center: [-111.72, 40.565],
        zoom: 11.6,
        pitch: 45,
        bearing: -18,
        attributionControl: false
    });
    window.meshMap = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    function parseGPX(text) {
        var doc = new DOMParser().parseFromString(text, 'text/xml');
        var trkpts = doc.querySelectorAll('trkpt');
        var coords = [];
        trkpts.forEach(function(pt) {
            var lat = parseFloat(pt.getAttribute('lat'));
            var lon = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) coords.push([lon, lat]);
        });
        return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };
    }

    function loadData() {
        fetch('wurl_course_map/data/WURL_Wasatch_Ultimate_Ridge_Linkup.gpx')
            .then(function(r) { if (!r.ok) throw new Error('GPX failed'); return r.text(); })
            .then(function(text) {
                var trail = parseGPX(text);
                if (!map.getSource('trail')) { addTrail(trail); }
            })
            .catch(function() {
                var pts = [];
                var lng = -111.788, lat = 40.610;
                for (var i = 0; i < 200; i++) {
                    lng += 0.0009 + Math.sin(i * 0.15) * 0.0004;
                    lat -= 0.0004 + Math.cos(i * 0.12) * 0.0002;
                    pts.push([lng, lat]);
                }
                if (!map.getSource('trail')) { addTrail({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts } }); }
            });
        addNodes();
    }

    function addTrail(geoJSON) {
        map.addSource('trail', { type: 'geojson', data: geoJSON });
        map.addLayer({ id: 'trail-glow', type: 'line', source: 'trail',
            paint: { 'line-color': '#FF3B30', 'line-width': 5, 'line-opacity': 0.12, 'line-blur': 3 } });
        map.addLayer({ id: 'trail', type: 'line', source: 'trail',
            paint: { 'line-color': '#FF3B30', 'line-width': 2, 'line-opacity': 0.7 } });
        ['nodes-aid-glow','nodes-aid','nodes-mesh-glow','nodes-mesh','nodes-special','athlete-marker','athlete-marker-glow'].forEach(function(l) {
            try { map.moveLayer(l); } catch(e) {}
        });
        var bounds = new maplibregl.LngLatBounds();
        geoJSON.geometry.coordinates.forEach(function(c) { bounds.extend(c); });
        map.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 0 });
    }

    function initTerrain() {
        if (map.getSource('terrainSource')) return;
        try {
            map.addSource('terrainSource', {
                type: 'raster-dem',
                tiles: [demSource.sharedDemProtocolUrl],
                encoding: 'terrarium',
                tileSize: 256,
                maxzoom: 15
            });
            map.setTerrain({ source: 'terrainSource', exaggeration: 1.2 });
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
                    'line-color': 'rgba(255,255,255,0.12)',
                    'line-width': ['match', ['get', 'level'], 1, 0.8, 0.4]
                }
            });
        } catch(e) {}
    }

    function onReady() {
        initTerrain();
        if (!map.getSource('trail')) loadData();
    }

    if (map.loaded()) { onReady(); } else { map.on('load', onReady); }

    function addNodes() {
        var aidStations = [
            { lat: 40.59612, lng: -111.65131, label: 'Cardiff Pass', type: 'aid' },
            { lat: 40.56094, lng: -111.64510, label: 'Snowbird Tram', type: 'aid' },
            { lat: 40.52689, lng: -111.75607, label: 'Lone Peak', type: 'aid' }
        ];
        var meshNodes = [
            { lat: 40.59397, lng: -111.72070, label: 'Broads Fork', type: 'mesh' },
            { lat: 40.59304, lng: -111.70579, label: 'Dromedary', type: 'mesh' },
            { lat: 40.59228, lng: -111.66695, label: 'Superior', type: 'mesh' },
            { lat: 40.60155, lng: -111.61403, label: 'Honeycomb', type: 'mesh' },
            { lat: 40.58540, lng: -111.60331, label: 'Wolverine', type: 'mesh' },
            { lat: 40.56785, lng: -111.63828, label: 'Baldy', type: 'mesh' },
            { lat: 40.53365, lng: -111.70584, label: 'Pfeifferhorn', type: 'mesh' },
            { lat: 40.54954, lng: -111.66185, label: 'Red Stack', type: 'mesh' }
        ];
        var specialNodes = [
            { lat: 40.61038, lng: -111.78823, label: 'Brighton Lot', type: 'start' },
            { lat: 40.57181, lng: -111.79682, label: 'Parking Lot', type: 'finish' }
        ];
        var allNodes = specialNodes.concat(aidStations, meshNodes);

        var features = allNodes.map(function(n) {
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
                properties: { type: n.type, label: n.label } };
        });
        map.addSource('nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: features } });

        map.addLayer({ id: 'nodes-aid-glow', type: 'circle', source: 'nodes',
            filter: ['==', ['get', 'type'], 'aid'],
            paint: { 'circle-radius': 14, 'circle-color': '#28C840', 'circle-opacity': 0.1, 'circle-blur': 2 } });
        map.addLayer({ id: 'nodes-aid', type: 'circle', source: 'nodes',
            filter: ['==', ['get', 'type'], 'aid'],
            paint: { 'circle-radius': 6, 'circle-color': '#28C840', 'circle-opacity': 0.9,
                'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.15)' } });
        map.addLayer({ id: 'nodes-mesh-glow', type: 'circle', source: 'nodes',
            filter: ['==', ['get', 'type'], 'mesh'],
            paint: { 'circle-radius': 10, 'circle-color': '#FF3B30', 'circle-opacity': 0.15, 'circle-blur': 1.5 } });
        map.addLayer({ id: 'nodes-mesh', type: 'circle', source: 'nodes',
            filter: ['==', ['get', 'type'], 'mesh'],
            paint: { 'circle-radius': 4, 'circle-color': '#FF3B30', 'circle-opacity': 0.8,
                'circle-stroke-width': 1.5, 'circle-stroke-color': 'rgba(255,255,255,0.1)' } });
        map.addLayer({ id: 'nodes-special', type: 'circle', source: 'nodes',
            filter: ['in', ['get', 'type'], ['literal', ['start', 'finish']]],
            paint: { 'circle-radius': 6, 'circle-color': 'rgba(100,150,255,0.8)',
                'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.2)' } });

        map.addSource('athlete-pos', {
            type: 'geojson',
            data: { type: 'Feature', geometry: { type: 'Point', coordinates: [-111.63828, 40.56785] } }
        });
        map.addLayer({ id: 'athlete-marker', type: 'circle', source: 'athlete-pos',
            layout: { visibility: 'none' },
            paint: { 'circle-radius': 8, 'circle-color': '#FF3B30', 'circle-opacity': 0.6,
                'circle-stroke-width': 3, 'circle-stroke-color': '#fff' } });
        map.addLayer({ id: 'athlete-marker-glow', type: 'circle', source: 'athlete-pos',
            layout: { visibility: 'none' },
            paint: { 'circle-radius': 18, 'circle-color': '#FF3B30', 'circle-opacity': 0.15, 'circle-blur': 4 } });

        var nodeDetails = {
            'Brighton Lot': { elev: '8,510\'', ser: 'SN-AS-001', batt: 'AC', sig: '—', last: '—' },
            'Broads Fork': { elev: '9,120\'', ser: 'SN-MR-104', batt: '82%', sig: '-72dBm', last: '14s ago' },
            'Cardiff Pass': { elev: '9,600\'', ser: 'SN-AS-002', batt: '94%', sig: '-65dBm', last: '8s ago' },
            'Dromedary': { elev: '9,450\'', ser: 'SN-MR-107', batt: '76%', sig: '-81dBm', last: '22s ago' },
            'Superior': { elev: '10,100\'', ser: 'SN-MR-112', batt: '68%', sig: '-88dBm', last: '31s ago' },
            'Honeycomb': { elev: '9,940\'', ser: 'SN-MR-118', batt: '91%', sig: '-70dBm', last: '5s ago' },
            'Wolverine': { elev: '10,200\'', ser: 'SN-MR-124', batt: '55%', sig: '-94dBm', last: '47s ago' },
            'Snowbird Tram': { elev: '10,640\'', ser: 'SN-AS-003', batt: '88%', sig: '-68dBm', last: '11s ago' },
            'Baldy': { elev: '10,830\'', ser: 'SN-MR-131', batt: '43%', sig: '-97dBm', last: '1m ago' },
            'Pfeifferhorn': { elev: '11,020\'', ser: 'SN-MR-138', batt: '61%', sig: '-85dBm', last: '26s ago' },
            'Red Stack': { elev: '10,410\'', ser: 'SN-MR-145', batt: '37%', sig: '-102dBm', last: '2m ago' },
            'Flagstaff': { elev: '9,380\'', ser: 'SN-MR-156', batt: '73%', sig: '-78dBm', last: '18s ago' },
            'Lone Peak': { elev: '10,980\'', ser: 'SN-AS-004', batt: '96%', sig: '-61dBm', last: '3s ago' },
            'Parking Lot': { elev: '8,530\'', ser: 'SN-AS-005', batt: 'AC', sig: '—', last: '—' }
        };

        function getPopupHTML(label, type) {
            var d = nodeDetails[label] || {};
            var typeLabels = { aid: 'Aid Station', mesh: 'Mesh Checkpoint', start: 'Start', finish: 'Finish' };
            return '<b>' + label + '</b><br>' +
                '<span style="font-size:9px;color:rgba(255,255,255,0.3);">' + (typeLabels[type] || 'Node') + '</span><br>' +
                '<span style="font-size:9px;color:rgba(255,255,255,0.4);line-height:1.8;">' +
                'S/N: ' + (d.ser || '—') + '<br>' +
                'Batt: ' + (d.batt || '—') + ' &middot; Sig: ' + (d.sig || '—') + '<br>' +
                'Elev: ' + (d.elev || '—') + ' &middot; Last: ' + (d.last || '—') +
                '</span>';
        }

        function showNodePopup(e) {
            if (!e.features || !e.features[0]) return;
            var p = e.features[0].properties;
            new maplibregl.Popup({ offset: 16, closeButton: false })
                .setLngLat(e.features[0].geometry.coordinates)
                .setHTML(getPopupHTML(p.label, p.type))
                .addTo(map);
        }

        map.on('click', 'nodes-aid', showNodePopup);
        map.on('click', 'nodes-mesh', showNodePopup);
        map.on('click', 'nodes-special', showNodePopup);
        map.on('mouseenter', 'nodes-aid', function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseenter', 'nodes-mesh', function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseenter', 'nodes-special', function() { map.getCanvas().style.cursor = 'pointer'; });
        map.on('mouseleave', 'nodes-aid', function() { map.getCanvas().style.cursor = ''; });
        map.on('mouseleave', 'nodes-mesh', function() { map.getCanvas().style.cursor = ''; });
        map.on('mouseleave', 'nodes-special', function() { map.getCanvas().style.cursor = ''; });

        ['nodes-aid-glow','nodes-aid','nodes-mesh-glow','nodes-mesh','nodes-special','athlete-marker','athlete-marker-glow'].forEach(function(l) {
            try { map.moveLayer(l); } catch(e) {}
        });

        setTimeout(function() {
            try {
                new maplibregl.Popup({ offset: 16, closeButton: false })
                    .setLngLat([-111.72070, 40.59397])
                    .setHTML(getPopupHTML('Broads Fork', 'mesh'))
                    .addTo(map);
            } catch(e) {}
        }, 2000);
    }
})();

// ── Tab 2: Live Map (simplified map for Race Day) ──────

(function() {
    var container = document.getElementById('live-map');
    if (!container) return;

    var map = new maplibregl.Map({
        container: 'live-map',
        style: {
            version: 8,
            sources: {
                dark: {
                    type: 'raster',
                    tiles: ['https://basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}.png'],
                    tileSize: 256
                }
            },
            layers: [{ id: 'dark', type: 'raster', source: 'dark' }]
        },
        center: [-111.72, 40.565],
        zoom: 11.6,
        pitch: 45,
        bearing: -18,
        attributionControl: false
    });
    window.liveMap = map;
    map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');

    // Load GPX for trail overlay
    function parseGPX(text) {
        var doc = new DOMParser().parseFromString(text, 'text/xml');
        var trkpts = doc.querySelectorAll('trkpt');
        var coords = [];
        trkpts.forEach(function(pt) {
            var lat = parseFloat(pt.getAttribute('lat'));
            var lon = parseFloat(pt.getAttribute('lon'));
            if (!isNaN(lat) && !isNaN(lon)) coords.push([lon, lat]);
        });
        return { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } };
    }

    function addTrail(geoJSON) {
        map.addSource('trail', { type: 'geojson', data: geoJSON });
        map.addLayer({ id: 'trail-glow', type: 'line', source: 'trail',
            paint: { 'line-color': '#FF3B30', 'line-width': 5, 'line-opacity': 0.12, 'line-blur': 3 } });
        map.addLayer({ id: 'trail', type: 'line', source: 'trail',
            paint: { 'line-color': '#FF3B30', 'line-width': 2, 'line-opacity': 0.7 } });
        var bounds = new maplibregl.LngLatBounds();
        geoJSON.geometry.coordinates.forEach(function(c) { bounds.extend(c); });
        map.fitBounds(bounds, { padding: 50, maxZoom: 12, duration: 0 });
    }

    map.on('load', function() {
        fetch('wurl_course_map/data/WURL_Wasatch_Ultimate_Ridge_Linkup.gpx')
            .then(function(r) { if (!r.ok) throw new Error('GPX failed'); return r.text(); })
            .then(function(text) {
                var trail = parseGPX(text);
                if (!map.getSource('trail')) { addTrail(trail); }
            })
            .catch(function() {
                var pts = [];
                var lng = -111.788, lat = 40.610;
                for (var i = 0; i < 200; i++) {
                    lng += 0.0009 + Math.sin(i * 0.15) * 0.0004;
                    lat -= 0.0004 + Math.cos(i * 0.12) * 0.0002;
                    pts.push([lng, lat]);
                }
                if (!map.getSource('trail')) { addTrail({ type: 'Feature', geometry: { type: 'LineString', coordinates: pts } }); }
            });

        // Add mesh relay node data
        var meshRelays = [
            { lat: 40.59397, lng: -111.72070, label: 'Node 01', sig: '-72dBm', health: '98%' },
            { lat: 40.59228, lng: -111.66695, label: 'Node 02', sig: '-88dBm', health: '94%' },
            { lat: 40.58540, lng: -111.60331, label: 'Node 03', sig: '-94dBm', health: '99%' },
            { lat: 40.53365, lng: -111.70584, label: 'Node 04', sig: '-85dBm', health: '91%' }
        ];
        var features = meshRelays.map(function(n) {
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
                properties: { label: n.label, sig: n.sig, health: n.health } };
        });
        map.addSource('relays', { type: 'geojson', data: { type: 'FeatureCollection', features: features } });
        map.addLayer({ id: 'relays-glow', type: 'circle', source: 'relays',
            paint: { 'circle-radius': 16, 'circle-color': '#FF3B30', 'circle-opacity': 0.12, 'circle-blur': 3 } });
        map.addLayer({ id: 'relays', type: 'circle', source: 'relays',
            paint: { 'circle-radius': 6, 'circle-color': '#FF3B30', 'circle-opacity': 0.8,
                'circle-stroke-width': 2, 'circle-stroke-color': 'rgba(255,255,255,0.15)' } });

        // Add animated runner dots
        var runnerPositions = [
            { lat: 40.59612, lng: -111.65131, bib: '#42' },
            { lat: 40.58540, lng: -111.60331, bib: '#104' },
            { lat: 40.56785, lng: -111.63828, bib: '#355' }
        ];
        var runnerFeatures = runnerPositions.map(function(r) {
            return { type: 'Feature', geometry: { type: 'Point', coordinates: [r.lng, r.lat] },
                properties: { bib: r.bib } };
        });
        map.addSource('runners', { type: 'geojson', data: { type: 'FeatureCollection', features: runnerFeatures } });
        map.addLayer({ id: 'runners', type: 'circle', source: 'runners',
            paint: { 'circle-radius': 8, 'circle-color': '#FF3B30', 'circle-opacity': 0.7,
                'circle-stroke-width': 2, 'circle-stroke-color': '#fff' } });

        // Add bib labels
        map.addLayer({ id: 'runner-labels', type: 'symbol', source: 'runners',
            layout: {
                'text-field': ['get', 'bib'],
                'text-size': 10,
                'text-offset': [0, -1.5],
                'text-font': ['Open Sans Bold', 'Arial Unicode MS Bold'],
                'text-anchor': 'bottom'
            },
            paint: {
                'text-color': '#fff',
                'text-halo-color': 'rgba(0,0,0,0.6)',
                'text-halo-width': 1.5
            }
        });
    });
})();

// ── Tab 2: Ingestion bar ticker (demo animation) ───────

(function() {
    var ticker = document.querySelector('.ingestion-bar');
    if (!ticker) return;
    var streams = ticker.querySelectorAll('.ingestion-stream');
    var fakeEvents = [
        { time: '06:18:44', evt: '#188 J. Walmsley &middot; Checkpoint 4B (Mile 18.2) &middot; Pace: 7:30/mi &middot; Via: LoRa Mesh' },
        { time: '06:22:10', evt: '#305 Z. Miller &middot; Checkpoint 3A (Mile 12.1) &middot; Pace: 8:50/mi &middot; Via: RFID Mat' },
        { time: '06:25:33', evt: '#77 E. Forsberg &middot; Checkpoint 4B (Mile 18.2) &middot; Pace: 9:05/mi &middot; Via: LoRa Mesh' }
    ];
    var idx = 0;
    setInterval(function() {
        if (!document.querySelector('.demo-panel[data-tab="2"].active')) return;
        var evt = fakeEvents[idx % fakeEvents.length];
        var lastStream = streams[streams.length - 1];
        if (lastStream) {
            var clone = lastStream.cloneNode(true);
            clone.querySelector('.ingestion-time').innerHTML = evt.time;
            clone.querySelector('.ingestion-event').innerHTML = evt.evt;
            lastStream.parentNode.insertBefore(clone, lastStream);
            if (ticker.querySelectorAll('.ingestion-stream').length > 6) {
                ticker.querySelector('.ingestion-stream').remove();
            }
        }
        idx++;
    }, 6000);
})();
