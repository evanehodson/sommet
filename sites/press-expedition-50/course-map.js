(function () {
  'use strict';

  if (!window.maplibregl || !window.mlcontour) return;

  var INK = '#1b1a17';
  var PAPER = '#f1ecdf';

  var demSource = new mlcontour.DemSource({
    url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
    encoding: 'terrarium',
    maxzoom: 15,
    worker: true,
    cacheSize: 100
  });
  demSource.setupMaplibre(maplibregl);

  var map = new maplibregl.Map({
    container: 'course-map',
    style: {
      version: 8,
      sources: {},
      layers: [
        { id: 'paper', type: 'background', paint: { 'background-color': PAPER } }
      ],
      glyphs: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf'
    },
    center: [-123.55, 47.77],
    zoom: 10.2,
    pitch: 0,
    bearing: 0,
    maxPitch: 0,
    attributionControl: false
  });

  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-left');
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.getCanvas().addEventListener('contextmenu', function (e) { e.preventDefault(); });

  map.on('load', function () {

    // ── Ink contours from DEM ─────────────────────────────

    map.addSource('contour-source', {
      type: 'vector',
      tiles: [
        demSource.contourProtocolUrl({
          multiplier: 3.28084,
          thresholds: {
            8: [500, 2500],
            9: [250, 1250],
            10: [250, 1250],
            11: [200, 1000],
            12: [100, 500],
            13: [100, 500],
            14: [50, 250]
          },
          contourLayer: 'contours',
          elevationKey: 'ele',
          levelKey: 'level',
          extent: 4096,
          buffer: 2
        })
      ],
      maxzoom: 18
    });

    map.addLayer({
      id: 'contour-minor',
      type: 'line',
      source: 'contour-source',
      'source-layer': 'contours',
      filter: ['==', ['get', 'level'], 0],
      paint: { 'line-color': 'rgba(27, 26, 23, 0.38)', 'line-width': 0.5 }
    });

    map.addLayer({
      id: 'contour-index',
      type: 'line',
      source: 'contour-source',
      'source-layer': 'contours',
      filter: ['>=', ['get', 'level'], 1],
      paint: { 'line-color': 'rgba(27, 26, 23, 0.7)', 'line-width': 1 }
    });

    map.addLayer({
      id: 'contour-labels',
      type: 'symbol',
      source: 'contour-source',
      'source-layer': 'contours',
      filter: ['>=', ['get', 'level'], 1],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 260,
        'text-field': ['to-string', ['get', 'ele']],
        'text-font': ['Noto Sans Italic'],
        'text-size': 9,
        'text-rotation-alignment': 'map',
        'text-pitch-alignment': 'map',
        'text-allow-overlap': false
      },
      paint: {
        'text-color': INK,
        'text-halo-color': PAPER,
        'text-halo-width': 1.2
      }
    });

    // ── Hillshade from the same DEM ────────────────────────

    map.addSource('dem-hillshade', {
      type: 'raster-dem',
      tiles: [demSource.sharedDemProtocolUrl],
      encoding: 'terrarium',
      tileSize: 256,
      maxzoom: 15
    });

    map.addLayer({
      id: 'hillshade',
      type: 'hillshade',
      source: 'dem-hillshade',
      paint: {
        'hillshade-exaggeration': 0.3,
        'hillshade-shadow-color': 'rgba(27, 26, 23, 0.3)',
        'hillshade-highlight-color': 'rgba(255, 253, 246, 0.35)',
        'hillshade-accent-color': 'rgba(27, 26, 23, 0.1)',
        'hillshade-illumination-direction': 315,
        'hillshade-illumination-anchor': 'map'
      }
    }, 'contour-minor');

    // ── Base vector (water, peaks) ────────────────────────

    map.addSource('ofm', { type: 'vector', url: 'https://tiles.openfreemap.org/planet' });

    map.addLayer({
      id: 'waterway-line',
      type: 'line',
      source: 'ofm',
      'source-layer': 'waterway',
      paint: { 'line-color': '#7ba1b1', 'line-width': 0.7 }
    });

    map.addLayer({
      id: 'water-fill',
      type: 'fill',
      source: 'ofm',
      'source-layer': 'water',
      paint: { 'fill-color': '#d3e3e8', 'fill-outline-color': '#7ba1b1' }
    });

    map.addLayer({
      id: 'water-labels',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'water',
      filter: ['has', 'name'],
      layout: {
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Italic'],
        'text-size': 10,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.05
      },
      paint: { 'text-color': '#4a6f80', 'text-halo-color': PAPER, 'text-halo-width': 1.2 }
    });

    map.addLayer({
      id: 'waterway-labels',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'waterway',
      filter: ['has', 'name'],
      layout: {
        'symbol-placement': 'line',
        'symbol-spacing': 420,
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Italic'],
        'text-size': 9,
        'text-transform': 'uppercase',
        'text-letter-spacing': 0.04
      },
      paint: { 'text-color': '#4a6f80', 'text-halo-color': PAPER, 'text-halo-width': 1.2 }
    });

    // ── Peak triangle icon (ink) ─────────────────────────

    var S = 24;
    var tri = new Uint8Array(S * S * 4);
    (function () {
      function segDist(px, py, ax, ay, bx, by) {
        var dx = bx - ax, dy = by - ay;
        var t = Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)));
        var ex = px - (ax + t * dx), ey = py - (ay + t * dy);
        return Math.sqrt(ex * ex + ey * ey);
      }
      function cross2(ax, ay, bx, by) { return ax * by - ay * bx; }
      var tA = [12, 2], tB = [2, 20], tC = [22, 20];
      for (var y = 0; y < S; y++) {
        for (var x = 0; x < S; x++) {
          var px = x + 0.5, py = y + 0.5;
          var d1 = cross2(px - tA[0], py - tA[1], tB[0] - tA[0], tB[1] - tA[1]);
          var d2 = cross2(px - tB[0], py - tB[1], tC[0] - tB[0], tC[1] - tB[1]);
          var d3 = cross2(px - tC[0], py - tC[1], tA[0] - tC[0], tA[1] - tC[1]);
          var inside = (d1 >= 0 && d2 >= 0 && d3 >= 0) || (d1 <= 0 && d2 <= 0 && d3 <= 0);
          var ed = Math.min(
            segDist(px, py, tA[0], tA[1], tB[0], tB[1]),
            segDist(px, py, tB[0], tB[1], tC[0], tC[1]),
            segDist(px, py, tC[0], tC[1], tA[0], tA[1])
          );
          var sd = inside ? -ed : ed;
          var i = (y * S + x) * 4;
          if (sd < 0) {
            tri[i] = 27; tri[i + 1] = 26; tri[i + 2] = 23; tri[i + 3] = 255;
          } else if (sd < 2) {
            tri[i] = 27; tri[i + 1] = 26; tri[i + 2] = 23;
            tri[i + 3] = Math.round(Math.min(1, Math.max(0, 1 - (sd - 1) / 1)) * 255);
          }
        }
      }
    })();
    map.addImage('peak-tri', { width: S, height: S, data: tri });

    map.addLayer({
      id: 'peaks',
      type: 'symbol',
      source: 'ofm',
      'source-layer': 'mountain_peak',
      filter: ['has', 'name'],
      layout: {
        'icon-image': 'peak-tri',
        'icon-size': 0.55,
        'icon-anchor': 'bottom',
        'text-field': ['concat', ['get', 'name'], '\n', ['concat', ['get', 'ele_ft'], ' ft']],
        'text-font': ['Noto Sans Italic'],
        'text-size': 9,
        'text-anchor': 'top',
        'text-offset': [0, 0.5],
        'text-line-height': 1.25
      },
      paint: { 'text-color': INK, 'text-halo-color': PAPER, 'text-halo-width': 1.2 }
    });

    // ── Course traverse from GPX ──────────────────────────

    fetch('assets/Press_Expedition_Traverse.gpx')
      .then(function (r) { return r.text(); })
      .then(function (text) {
        var xml = new DOMParser().parseFromString(text, 'text/xml');
        var trkpts = xml.getElementsByTagName('trkpt');
        var coords = [];
        var bounds = new maplibregl.LngLatBounds();
        for (var i = 0; i < trkpts.length; i++) {
          var lon = parseFloat(trkpts[i].getAttribute('lon'));
          var lat = parseFloat(trkpts[i].getAttribute('lat'));
          coords.push([lon, lat]);
          bounds.extend([lon, lat]);
        }

        map.addSource('trail', {
          type: 'geojson',
          data: { type: 'Feature', geometry: { type: 'LineString', coordinates: coords } }
        });
        map.addLayer({
          id: 'trail-casing',
          type: 'line',
          source: 'trail',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': PAPER, 'line-width': 5 }
        });
        map.addLayer({
          id: 'trail-core',
          type: 'line',
          source: 'trail',
          layout: { 'line-cap': 'round', 'line-join': 'round' },
          paint: { 'line-color': INK, 'line-width': 2 }
        });

        // Waypoints (named camps) plus start/finish
        var wpts = xml.getElementsByTagName('wpt');
        var feats = [];
        for (var j = 0; j < wpts.length; j++) {
          var nEl = wpts[j].getElementsByTagName('name')[0];
          var nm = nEl ? nEl.textContent : '';
          if (!nm) continue;
          feats.push({
            type: 'Feature',
            geometry: {
              type: 'Point',
              coordinates: [parseFloat(wpts[j].getAttribute('lon')), parseFloat(wpts[j].getAttribute('lat'))]
            },
            properties: { name: nm }
          });
        }
        if (coords.length) {
          feats.unshift({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords[0] },
            properties: { name: 'Start' }
          });
          feats.push({
            type: 'Feature',
            geometry: { type: 'Point', coordinates: coords[coords.length - 1] },
            properties: { name: 'Finish' }
          });
        }

        map.addSource('waypoints', {
          type: 'geojson',
          data: { type: 'FeatureCollection', features: feats }
        });
        map.addLayer({
          id: 'waypoint-dots',
          type: 'circle',
          source: 'waypoints',
          paint: {
            'circle-radius': 2.2,
            'circle-color': PAPER,
            'circle-stroke-color': INK,
            'circle-stroke-width': 1
          }
        });
        map.addLayer({
          id: 'waypoint-labels',
          type: 'symbol',
          source: 'waypoints',
          layout: {
            'text-field': ['get', 'name'],
            'text-font': ['Noto Sans Italic'],
            'text-size': 8.5,
            'text-transform': 'uppercase',
            'text-letter-spacing': 0.02,
            'text-offset': [0, 1.5],
            'text-anchor': 'top'
          },
          paint: { 'text-color': INK, 'text-halo-color': PAPER, 'text-halo-width': 1.3 }
        });

        map.fitBounds(bounds, { padding: 44, duration: 0 });
      })
      .catch(function () {
        // Map still renders base; trail simply absent.
      });
  });
})();
