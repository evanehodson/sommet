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

          a = Math.min(1, a) * (cfg.MAX_ALPHA || 200);

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
      HEIGHT_FALLOFF: 0.6
    });
  }

  // Foreground fog — in front of the "50".
  var fgCanvas = document.querySelector('.fog-canvas');
  if (fgCanvas) {
    createFog(fgCanvas, {
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
      HEIGHT_FALLOFF: 1.6
    });
  }
})();
