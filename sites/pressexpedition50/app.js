// ── Press Expedition 50 — contour topo map ─────────────────────────
// Two stacked maps keep the drawing order right:
//   1. #ridge-topo        -> hypsometric tint only (behind the hero)
//   2. .rc-hero (HTML)    -> hero type sits on the tint
//   3. #ridge-topo-detail -> transparent canvas: contours + GPX trail + POI cards (on top)

(function() {
    var baseContainer = document.getElementById('ridge-topo');
    var detailContainer = document.getElementById('ridge-topo-detail');
    if (!baseContainer || !detailContainer || typeof maplibregl === 'undefined' || typeof mlcontour === 'undefined') return;

    var baseMap = null;
    var detailMap = null;
    var trailBounds = null;

    function fitTrailCamera(map) {
        if (!trailBounds) return;
        map.fitBounds(trailBounds, { padding: 34, duration: 0, maxZoom: 12.5 });
    }

    var POIS = [
        { lat: 47.97207, lon: -123.50822, mil: '0.0', ft: '5,018', title: 'Press Point', sub: 'The traverse begins on the high ridge.' },
        { lat: 47.95540, lon: -123.56110, mil: '8.8', ft: '1,199', title: 'Drainage Drop', sub: 'Down off the divide into old timber.' },
        { lat: 47.87896, lon: -123.46957, mil: '17.6', ft: '1,547', title: 'Mid Fork Crossing', sub: 'Cold water, short ferry, low flow.' },
        { lat: 47.77276, lon: -123.45459, mil: '26.4', ft: '1,954', title: 'Shoulder Camp', sub: 'Reload on the exposed shoulder.' },
        { lat: 47.71121, lon: -123.57592, mil: '35.2', ft: '3,170', title: 'Crest Spur', sub: 'The long push back to the ridgeline.' },
        { lat: 47.62784, lon: -123.63281, mil: '43.9', ft: '864', title: 'The Slot', sub: 'Tight tread through the ravine floor.' }
    ];

    function addPoiCards(map) {
        POIS.forEach(function(poi) {
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
            new maplibregl.Marker({ element: wrap, anchor: 'bottom' }).setLngLat([poi.lon, poi.lat]).addTo(map);
        });
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
