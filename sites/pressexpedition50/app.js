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
  // ---------- Dot-matrix stat ticker ----------
  // 5x7 dot font. Each glyph is 7 rows of 5 cells ('#' = dot).
  var FONT = {
    '0': ['.###.','#...#','#..##','#.#.#','##..#','#...#','.###.'],
    '1': ['..#..','.##..','..#..','..#..','..#..','..#..','#####'],
    '2': ['.###.','#...#','....#','...#.','..#..','.#...','#####'],
    '3': ['#####','...#.','..#..','...#.','....#','#...#','.###.'],
    '4': ['...#.','..##.','.#.#.','#..#.','#####','...#.','...#.'],
    '5': ['#####','#....','####.','....#','....#','#...#','.###.'],
    '6': ['..##.','.#...','#....','####.','#...#','#...#','.###.'],
    '7': ['#####','....#','...#.','..#..','.#...','.#...','.#...'],
    '8': ['.###.','#...#','#...#','.###.','#...#','#...#','.###.'],
    '9': ['.###.','#...#','#...#','.####','....#','...#.','.##..'],
    'A': ['.###.','#...#','#...#','#####','#...#','#...#','#...#'],
    'B': ['####.','#...#','#...#','####.','#...#','#...#','####.'],
    'C': ['.###.','#...#','#....','#....','#....','#...#','.###.'],
    'D': ['####.','#...#','#...#','#...#','#...#','#...#','####.'],
    'E': ['#####','#....','#....','####.','#....','#....','#####'],
    'F': ['#####','#....','#....','####.','#....','#....','#....'],
    'G': ['.###.','#...#','#....','#.###','#...#','#...#','.####'],
    'H': ['#...#','#...#','#...#','#####','#...#','#...#','#...#'],
    'I': ['#####','..#..','..#..','..#..','..#..','..#..','#####'],
    'J': ['..###','...#.','...#.','...#.','...#.','#..#.','.##..'],
    'K': ['#...#','#..#.','#.#..','##...','#.#..','#..#.','#...#'],
    'L': ['#....','#....','#....','#....','#....','#....','#####'],
    'M': ['#...#','##.##','#.#.#','#.#.#','#...#','#...#','#...#'],
    'N': ['#...#','##..#','#.#.#','#..##','#...#','#...#','#...#'],
    'O': ['.###.','#...#','#...#','#...#','#...#','#...#','.###.'],
    'P': ['####.','#...#','#...#','####.','#....','#....','#....'],
    'Q': ['.###.','#...#','#...#','#...#','#.#.#','#..#.','.##.#'],
    'R': ['####.','#...#','#...#','####.','#.#..','#..#.','#...#'],
    'S': ['.###.','#...#','#....','.###.','....#','#...#','.###.'],
    'T': ['#####','..#..','..#..','..#..','..#..','..#..','..#..'],
    'U': ['#...#','#...#','#...#','#...#','#...#','#...#','.###.'],
    'V': ['#...#','#...#','#...#','#...#','#...#','.#.#.','..#..'],
    'W': ['#...#','#...#','#...#','#.#.#','#.#.#','##.##','#...#'],
    'X': ['#...#','#...#','.#.#.','..#..','.#.#.','#...#','#...#'],
    'Y': ['#...#','#...#','.#.#.','..#..','..#..','..#..','..#..'],
    'Z': ['#####','....#','...#.','..#..','.#...','#....','#####'],
    'a': ['.....','.....','.###.','....#','.####','#...#','.####'],
    'b': ['#....','#....','####.','#...#','#...#','#...#','####.'],
    'c': ['.....','.....','.###.','#....','#....','#...#','.###.'],
    'd': ['....#','....#','.####','#...#','#...#','#...#','.####'],
    'e': ['.....','.....','.###.','#...#','#####','#....','.###.'],
    'f': ['..##.','.#...','.#...','####.','.#...','.#...','.#...'],
    'g': ['.....','.####','#...#','#...#','.####','....#','.###.'],
    'h': ['#....','#....','####.','#...#','#...#','#...#','#...#'],
    'i': ['..#..','.....','.##..','..#..','..#..','..#..','####.'],
    'j': ['...#.','.....','..##.','...#.','...#.','...#.','.##..'],
    'k': ['#....','#....','#..#.','#.#..','##...','#.#..','#..#.'],
    'l': ['.##..','..#..','..#..','..#..','..#..','..#..','####.'],
    'm': ['.....','.....','##.#.','#.#.#','#.#.#','#...#','#...#'],
    'n': ['.....','.....','####.','#...#','#...#','#...#','#...#'],
    'o': ['.....','.....','.###.','#...#','#...#','#...#','.###.'],
    'p': ['.....','.....','####.','#...#','#...#','####.','#....'],
    'q': ['.....','.....','.####','#...#','#...#','.####','....#'],
    'r': ['.....','.....','#.##.','##..#','#....','#....','#....'],
    's': ['.....','.....','.####','#....','.###.','....#','####.'],
    't': ['.#...','.#...','####.','.#...','.#...','.#...','..##.'],
    'u': ['.....','.....','#...#','#...#','#...#','#...#','.####'],
    'v': ['.....','.....','#...#','#...#','#...#','.#.#.','..#..'],
    'w': ['.....','.....','#...#','#...#','#.#.#','##.##','#...#'],
    'x': ['.....','.....','#...#','.#.#.','..#..','.#.#.','#...#'],
    'y': ['.....','.....','#...#','#...#','.####','....#','.###.'],
    'z': ['.....','.....','#####','...#.','..#..','.#...','#####'],
    ' ': ['.....','.....','.....','.....','.....','.....','.....'],
    '+': ['.....','..#..','..#..','#####','..#..','..#..','.....'],
    ',': ['.....','.....','.....','.....','.....','..#..','.#...'],
    ':': ['.....','..#..','..#..','.....','..#..','..#..','.....'],
    '.': ['.....','.....','.....','.....','.....','.##..','.##..'],
    '-': ['.....','.....','.....','#####','.....','.....','.....'],
    '°': ['.##..','#..#.','#..#.','.##..','.....','.....','.....'],
    "'": ['.##..','.#...','.....','.....','.....','.....','.....'],
    '"': ['#.#..','#.#..','.....','.....','.....','.....','.....']
  };

  function createDotMatrix(canvas, cfg) {
    var ctx = canvas.getContext('2d');
    var COLS = cfg.cols;
    var ROWS = 7;
    var DISPLAY_MS = cfg.displayMs;
    var SCRAMBLE_MS = cfg.scrambleMs;
    var stats = cfg.stats;
    var glyphs = Object.keys(FONT);
    var dpr = window.devicePixelRatio || 1;

    function pad(s) {
      while (s.length < COLS) s += ' ';
      return s.substring(0, COLS);
    }

    function fit() {
      var w = canvas.clientWidth;
      var h = w * ROWS / (COLS * 5);
      var W = Math.max(1, Math.round(w * dpr));
      var H = Math.max(1, Math.round(h * dpr));
      if (canvas.width !== W) canvas.width = W;
      if (canvas.height !== H) canvas.height = H;
    }

    function randGlyph() {
      return glyphs[(Math.random() * glyphs.length) | 0];
    }

    var idx = 0;
    var phase = 'display';
    var phaseStart = performance.now();
    var settleTimes = new Array(COLS);

    function currentString(now) {
      if (phase === 'display') return pad(stats[idx]());
      var target = pad(stats[(idx + 1) % stats.length]());
      var el = (now - phaseStart) / SCRAMBLE_MS;
      var out = '';
      for (var c = 0; c < COLS; c++) {
        out += (el >= settleTimes[c]) ? target[c] : randGlyph();
      }
      return out;
    }

    function draw(s) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      var cellW = canvas.width / (COLS * 5);
      var cellH = canvas.height / ROWS;
      var r = Math.min(cellW, cellH) * 0.34;
      ctx.fillStyle = cfg.color;
      ctx.shadowColor = cfg.color;
      ctx.shadowBlur = r * 1.2;
      for (var c = 0; c < COLS; c++) {
        var g = FONT[s[c]] || FONT[' '];
        for (var row = 0; row < ROWS; row++) {
          var line = g[row];
          for (var b = 0; b < 5; b++) {
            if (line.charAt(b) === '#') {
              ctx.beginPath();
              ctx.arc((c * 5 + b + 0.5) * cellW, (row + 0.5) * cellH, r, 0, Math.PI * 2);
              ctx.fill();
            }
          }
        }
      }
      ctx.shadowBlur = 0;
    }

    function frame(now) {
      var el = now - phaseStart;
      if (phase === 'display' && el >= DISPLAY_MS) {
        phase = 'scramble';
        phaseStart = now;
        for (var c = 0; c < COLS; c++) {
          settleTimes[c] = 0.15 + Math.random() * 0.85;
        }
      } else if (phase === 'scramble' && el >= SCRAMBLE_MS) {
        idx = (idx + 1) % stats.length;
        phase = 'display';
        phaseStart = now;
      }
      draw(currentString(now));
      requestAnimationFrame(frame);
    }

    fit();
    window.addEventListener('resize', fit);
    requestAnimationFrame(frame);
  }

  var accent = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#C8E582';

  var statsCanvas = document.querySelector('.hero-dot-matrix');
  if (statsCanvas) {
    createDotMatrix(statsCanvas, {
      stats: [
        function () { return '47\u00B058\'14"N 123\u00B030\'13"W'; },
        function () { return '50 MILES'; },
        function () { return '7,749 FT ELEV GAIN'; }
      ],
      cols: 22,
      displayMs: 2400,
      scrambleMs: 900,
      color: accent
    });
  }

  var tickerCanvas = document.querySelector('.hero-dot-matrix-ticker');
  if (tickerCanvas) {
    var deadline = (function () {
      var y = new Date().getFullYear();
      var d = Date.UTC(y, 7, 8, 17, 0, 0);
      if (d <= Date.now()) d = Date.UTC(y + 1, 7, 8, 17, 0, 0);
      return d;
})();
    createDotMatrix(tickerCanvas, {
      stats: [
        function () { return 'AUG. 8TH'; },
        function () {
          var diff = Math.max(0, deadline - Date.now());
          var s = Math.floor(diff / 1000);
          var days = Math.floor(s / 86400);
          var hrs = Math.floor((s % 86400) / 3600);
          var mins = Math.floor((s % 3600) / 60);
          var secs = s % 60;
          function p(n) { return n < 10 ? '0' + n : '' + n; }
          return days + 'd ' + p(hrs) + 'h ' + p(mins) + 'm ' + p(secs) + 's';
        },
        function () { return '18 SPOTS REMAINING'; }
      ],
      cols: 22,
      displayMs: 2400,
      scrambleMs: 900,
      color: accent
    });
  }
})();
