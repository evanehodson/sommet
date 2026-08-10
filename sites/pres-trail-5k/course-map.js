(function () {
  'use strict';

  var container = document.getElementById('course-map');
  if (!container) return;

  var INK = '#12231C';
  var PAPER = '#F3EFE2';
  var GOLD = '#DFB040';
  var MOSS = '#4a7c59';
  var BARK = '#6f4e2e';
  var MINT = '#CDEFDA';

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
  map.addControl(new maplibregl.AttributionControl({ compact: true }), 'bottom-right');
  map.dragRotate.disable();
  map.touchZoomRotate.disableRotation();
  map.getCanvas().addEventListener('contextmenu', function (e) { e.preventDefault(); });

  var gpxProfile = null;
  var elevationChart = document.getElementById('elevation-chart');

  function parseGPX(text) {
    var doc = new DOMParser().parseFromString(text, 'text/xml');
    var trkpts = doc.querySelectorAll('trkpt');
    var coords = [];
    var profile = [];
    trkpts.forEach(function (pt) {
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

  function drawElevation() {
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
    var pad = 8;
    var drawW = w - pad * 2, drawH = h - pad * 2;
    var pts = gpxProfile.map(function (e, i) {
      var x = pad + (i / (gpxProfile.length - 1)) * drawW;
      var y = pad + drawH - ((e - minEle) / range) * drawH;
      return x + ',' + y;
    });
    var fill = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
    fill.setAttribute('points', pad + ',' + (pad + drawH) + ' ' + pts.join(' ') + ' ' + (pad + drawW) + ',' + (pad + drawH));
    fill.setAttribute('fill', 'rgba(223, 176, 64, 0.16)');
    svg.appendChild(fill);
    var polyline = document.createElementNS('http://www.w3.org/2000/svg', 'polyline');
    polyline.setAttribute('points', pts.join(' '));
    polyline.setAttribute('fill', 'none');
    polyline.setAttribute('stroke', GOLD);
    polyline.setAttribute('stroke-width', '2');
    polyline.setAttribute('stroke-linejoin', 'round');
    svg.appendChild(polyline);
    elevationChart.appendChild(svg);
  }

  function addTrail(geoJSON) {
    map.addSource('trail', { type: 'geojson', data: geoJSON });
    map.addLayer({
      id: 'trail-casing',
      type: 'line', source: 'trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': '#12231C', 'line-width': 7, 'line-opacity': 0.95 }
    });
    map.addLayer({
      id: 'trail-core',
      type: 'line', source: 'trail',
      layout: { 'line-cap': 'round', 'line-join': 'round' },
      paint: { 'line-color': GOLD, 'line-width': 3.5 }
    });
    ['nodes-start', 'nodes-parking', 'nodes-restrooms'].forEach(function (l) {
      try { map.moveLayer(l); } catch (e) {}
    });
    var bounds = new maplibregl.LngLatBounds();
    geoJSON.geometry.coordinates.forEach(function (c) { bounds.extend(c); });
    map.fitBounds(bounds, { padding: 60, maxZoom: 16, duration: 0 });
  }

  function addNodes() {
    var nodes = [
      { lat: 44.05627, lng: -123.08085, label: 'Start / Finish', type: 'start', color: GOLD, radius: 8 },
      { lat: 44.054, lng: -123.074, label: 'Parking', type: 'parking', color: MOSS, radius: 6 },
      { lat: 44.051, lng: -123.060, label: 'Restrooms', type: 'restrooms', color: BARK, radius: 6 }
    ];
    var features = nodes.map(function (n) {
      return { type: 'Feature', geometry: { type: 'Point', coordinates: [n.lng, n.lat] },
        properties: { type: n.type, label: n.label, color: n.color, radius: n.radius } };
    });
    map.addSource('nodes', { type: 'geojson', data: { type: 'FeatureCollection', features: features } });

    ['start', 'parking', 'restrooms'].forEach(function (t) {
      map.addLayer({
        id: 'nodes-' + t,
        type: 'circle',
        source: 'nodes',
        filter: ['==', ['get', 'type'], t],
        paint: {
          'circle-radius': ['get', 'radius'],
          'circle-color': ['get', 'color'],
          'circle-opacity': 0.92,
          'circle-stroke-width': 2.5,
          'circle-stroke-color': '#fff'
        }
      });
    });

    function showPopup(e) {
      if (!e.features || !e.features[0]) return;
      var p = e.features[0].properties;
      new maplibregl.Popup({ offset: 16, closeButton: false })
        .setLngLat(e.features[0].geometry.coordinates)
        .setHTML('<b>' + p.label + '</b>')
        .addTo(map);
    }

    ['nodes-start', 'nodes-parking', 'nodes-restrooms'].forEach(function (layerId) {
      map.on('click', layerId, showPopup);
      map.on('mouseenter', layerId, function () { map.getCanvas().style.cursor = 'pointer'; });
      map.on('mouseleave', layerId, function () { map.getCanvas().style.cursor = ''; });
    });
  }

  function loadData() {
    fetch('assets/Pres_Trail.gpx')
      .then(function (r) { if (!r.ok) throw new Error('GPX failed'); return r.text(); })
      .then(function (text) {
        var trail = parseGPX(text);
        if (!map.getSource('trail')) addTrail(trail);
        drawElevation();
      })
      .catch(function () {
        drawElevation();
      });
    addNodes();
  }

  function onReady() {
    if (!map.getSource('trail')) loadData();
  }

  if (map.loaded()) { onReady(); } else { map.on('load', onReady); }

  var resizeT = null;
  window.addEventListener('resize', function () {
    if (resizeT) clearTimeout(resizeT);
    resizeT = setTimeout(drawElevation, 150);
  });
})();