(function () {
  'use strict';

  // ---------- Periodic 3D value noise ----------
  // Periodic in all three axes: tiles seamlessly (fog reaches the
  // screen borders with no seam) and the z-axis is the time dimension
  // so the shape itself morphs as it translates.
  var PERIOD = 48;
  var SIZE = PERIOD * PERIOD * PERIOD;
  var L = new Float32Array(SIZE);
  for (var i = 0; i < SIZE; i++) L[i] = Math.random();

  function pnoise3(x, y, z) {
    var X = Math.floor(x), Y = Math.floor(y), Z = Math.floor(z);
    var xi = ((X % PERIOD) + PERIOD) % PERIOD;
    var yi = ((Y % PERIOD) + PERIOD) % PERIOD;
    var zi = ((Z % PERIOD) + PERIOD) % PERIOD;
    var xf = x - X, yf = y - Y, zf = z - Z;
    var u = xf * xf * (3 - 2 * xf);
    var v = yf * yf * (3 - 2 * yf);
    var w = zf * zf * (3 - 2 * zf);
    var x1 = (xi + 1) % PERIOD, y1 = (yi + 1) % PERIOD, z1 = (zi + 1) % PERIOD;
    function vv(xx, yy, zz) { return L[(xx) + (yy) * PERIOD + (zz) * PERIOD * PERIOD]; }
    var c000 = vv(xi, yi, zi), c100 = vv(x1, yi, zi), c010 = vv(xi, y1, zi), c110 = vv(x1, y1, zi);
    var c001 = vv(xi, yi, z1), c101 = vv(x1, yi, z1), c011 = vv(xi, y1, z1), c111 = vv(x1, y1, z1);
    var x00 = c000 + (c100 - c000) * u, x10 = c010 + (c110 - c010) * u;
    var x01 = c001 + (c101 - c001) * u, x11 = c011 + (c111 - c011) * u;
    var y0 = x00 + (x10 - x00) * v,  y1 = x01 + (x11 - x01) * v;
    return y0 + (y1 - y0) * w;
  }

  function fbm(x, y, z, octaves) {
    var sum = 0, amp = 0.5, freq = 1;
    for (var i = 0; i < octaves; i++) {
      sum += amp * pnoise3(x * freq, y * freq, z * freq);
      amp *= 0.5;
      freq *= 2;
    }
    return sum;
  }

  // ---------- Fog factory ----------
  function createFog(canvas, cfg) {
    var ctx = canvas.getContext('2d');
    var W = cfg.W || 360;
    var H = cfg.H || 200;
    canvas.width = W;
    canvas.height = H;

    var img = ctx.createImageData(W, H);
    var data = img.data;
    var t = 0;

    function frame() {
      t += cfg.TIME_SPEED;
      var drift = t * cfg.DRIFT_SPEED * 900;
      var rise  = t * cfg.RISE_SPEED * 900;
      var morph = t * cfg.MORPH_SPEED;

      for (var y = 0; y < H; y++) {
        for (var x = 0; x < W; x++) {
          var px = x / W;
          var py = y / H;

          var sx = px * cfg.X_STRETCH + drift;
          var sy = py * cfg.Y_STRETCH + rise;

          var qx = fbm(sx, sy, morph, cfg.OCTAVES);
          var qy = fbm(sx + 5.2, sy + 1.3, morph, cfg.OCTAVES);

          var v = fbm(sx + cfg.SWIRL_AMOUNT * qx, sy + cfg.SWIRL_AMOUNT * qy, morph, cfg.OCTAVES);

          var a = (v - cfg.DENSITY_FLOOR) / (1 - cfg.DENSITY_FLOOR);
          a = Math.pow(Math.max(0, a), cfg.DENSITY_CURVE);

          // Densest at bottom, fading toward the top.
          a *= Math.pow(py, cfg.HEIGHT_FALLOFF);

          a *= cfg.ALPHA_GAIN;
          a = Math.min(1, a) * cfg.MAX_ALPHA;

          var i = (y * W + x) * 4;
          data[i]     = 246;
          data[i + 1] = 244;
          data[i + 2] = 237;
          data[i + 3] = a;
        }
      }
      ctx.putImageData(img, 0, 0);
      requestAnimationFrame(frame);
    }
    requestAnimationFrame(frame);
  }

  // ---------- Layers ----------

  // Far fog — behind the "50": smaller, more numerous clumps,
  // less height falloff.
  var farCanvas = document.querySelector('.fog-canvas-far');
  if (farCanvas) {
    createFog(farCanvas, {
      W: 360, H: 200,
      TIME_SPEED:    0.004,
      MORPH_SPEED:   0.4,
      DRIFT_SPEED:   0.0002,
      RISE_SPEED:    0.0010,
      SWIRL_AMOUNT:  1.2,
      X_STRETCH:     7.0,
      Y_STRETCH:     5.0,
      OCTAVES:       5,
      DENSITY_FLOOR: 0.48,
      DENSITY_CURVE: 2.0,
      MAX_ALPHA:     200,
      ALPHA_GAIN:    1.0,
      HEIGHT_FALLOFF: 0.6
    });
  }

  // Foreground fog — in front of the "50".
  var fgCanvas = document.querySelector('.fog-canvas');
  if (fgCanvas) {
    createFog(fgCanvas, {
      W: 360, H: 200,
      TIME_SPEED:    0.004,
      MORPH_SPEED:   0.5,
      DRIFT_SPEED:   0.0003,
      RISE_SPEED:    0.0018,
      SWIRL_AMOUNT:  1.4,
      X_STRETCH:     6.0,
      Y_STRETCH:     4.0,
      OCTAVES:       6,
      DENSITY_FLOOR: 0.42,
      DENSITY_CURVE: 1.8,
      MAX_ALPHA:     200,
      ALPHA_GAIN:    1.0,
      HEIGHT_FALLOFF: 1.6
    });
  }
})();

(function () {
  'use strict';

    async function initFiftyMap() {
    var res = await fetch('Press_Expedition_Traverse.gpx');
    var text = await res.text();
    var xml = new DOMParser().parseFromString(text, 'application/xml');

    var trkpts = Array.from(xml.querySelectorAll('trkpt'));
    var coords = trkpts.map(function (pt) {
      return [parseFloat(pt.getAttribute('lon')), parseFloat(pt.getAttribute('lat'))];
    });

    var lons = coords.map(function (c) { return c[0]; });
    var lats = coords.map(function (c) { return c[1]; });
    var bounds = [
      [Math.min.apply(null, lons), Math.min.apply(null, lats)],
      [Math.max.apply(null, lons), Math.max.apply(null, lats)]
    ];

    var demSource = new mlcontour.DemSource({
      url: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
      encoding: 'terrarium',
      maxzoom: 13,
      worker: true
    });
    demSource.setupMaplibre(maplibregl);

    var map = new maplibregl.Map({
      container: 'fifty-map',
      interactive: false,
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          contourSource: {
            type: 'vector',
            tiles: [demSource.contourProtocolUrl({
              thresholds: {
                9:  [80]
              },
              elevationKey: 'ele',
              levelKey: 'level',
              contourLayer: 'contours'
            })],
            maxzoom: 14
          }
        },
        layers: [
          { id: 'bg', type: 'background', paint: { 'background-color': '#e8e5d8' } },
          { id: 'contours-all', type: 'line', source: 'contourSource', 'source-layer': 'contours',
            paint: { 'line-color': '#948861', 'line-width': 1, 'line-opacity': 1 } }
        ]
      }
    });

    map.on('load', function () {
      map.fitBounds(bounds, { padding: 40, animate: false });
    });

    window.addEventListener('resize', function () { map.resize(); });
  }

  if (document.getElementById('fifty-map')) {
    initFiftyMap();
  }
})();