/* Solstice Mile — bento-box mosaic hero.
 *
 * The canvas is laid out on a coarse grid and recursively partitioned into
 * rectangular tiles of varying sizes — big "hero" cards near the centre,
 * smaller supporting tiles toward the rim. Cuts are bias-assisted: the child
 * containing the canvas centre always receives the larger share, so hero
 * tiles cluster centrally. The split axis alternates (vertical → horizontal
 * → vertical) and the cut position is bimodal (never near 0.5), guaranteeing
 * asymmetric layouts in ALL dimensions. A hard aspect-ratio cap (≤ 2:1)
 * prevents long thin bars.
 *
 * Randomness is a function of position: every decision is fed through a 32-bit
 * bit-scrambling hash keyed by grid position / depth, never a PRNG, so a given
 * viewport always regenerates the identical mosaic and a resize produces a
 * freshly-fit layout instead of a warped one.
 *
 * Tile count scales with viewport: small screens get ~8-12 tiles, large
 * screens get ~20-30. Colour: tiles in the central region (~40 % of canvas)
 * are filled orange (#ff582d) or black (#1c1619); edge tiles stay paper
 * (#F0EEE9). Adjacent filled tiles never share a colour.
 */

(function (global) {
    'use strict';

    // ── Deterministic hash ────────────────────────────────
    // Pure 32-bit integer math, so results are identical on every run.

    function hash01(n) {
        n = (n << 13) ^ n;
        return ((n * (n * n * 15731 + 789221) + 1376312589) & 0x7fffffff) / 0x7fffffff;
    }

    // ── Swatches ──────────────────────────────────────────
    // 0 = paper (#F0EEE9 white ground), 1 = lime (#edff00), 2 = orange
    // (#ff582d), 3 = purple (#685BC7), 4 = black (#1c1619, also the GROUT —
    // the seams between cells). Lime and black are currently unused FILLS
    // (only orange and purple paint tiles for now), but the entries stay so
    // they can be switched back on.

    var SWATCHES = 5;

    // ── Parameters ────────────────────────────────────────

    var PARAMS = {
        targetM: function (minPx) {
            var t = Math.max(0, Math.min(1, (minPx - 320) / (1440 - 320)));
            return Math.max(5, Math.round(5 + t * 9));
        },
        tileCap: function (w, h) {
            var area = w * h;
            return Math.max(12, Math.round(14 + area / 60000));
        }
    };

    function targetMCells(minPx) {
        var t = Math.max(0, Math.min(1, (minPx - 320) / (1440 - 320)));
        return Math.max(5, Math.round(5 + t * 9));
    }

    // ── Tiling ────────────────────────────────────────────
    // Centre-first: carve a large hero tile from the centre, then
    // recursively guillotine the remaining L-shaped rim. The hero tile
    // is always landscape or square, always the largest tile, and always
    // near the canvas centre. The rim is split into up to 4 rectangles
    // (top, bottom, left, right) and tiled independently with standard
    // guillotine cuts.

    function buildTiles(w, h, params) {
        var p = params || PARAMS;
        var minPx = Math.min(w, h);
        var tm = p.targetM ? p.targetM(minPx) : targetMCells(minPx);
        var base = Math.max(6, Math.round(minPx / tm));
        var cols = Math.max(4, Math.round(w / base));
        var rows = Math.max(4, Math.round(h / base));
        if (cols % 2) cols++;
        if (rows % 2) rows++;
        var baseX = w / cols, baseY = h / rows;

        var grid = [];
        for (var r = 0; r < rows; r++) grid.push(new Int8Array(cols));
        var tiles = [];

        function add(c, rr, wd, ht) {
            if (c < 0 || rr < 0 || wd < 1 || ht < 1 || c + wd > cols || rr + ht > rows) return false;
            for (var y = rr; y < rr + ht; y++)
                for (var x = c; x < c + wd; x++)
                    if (grid[y][x]) return false;
            for (y = rr; y < rr + ht; y++)
                for (x = c; x < c + wd; x++) grid[y][x] = 1;
            tiles.push({ x: c, y: rr, w: wd, h: ht });
            return true;
        }

        var tileCap = typeof p.tileCap === 'function' ? p.tileCap(w, h) : Math.max(12, p.tileCap || 20);
        var maxAspect = 2.0;

        // ── Guillotine a single rectangle ──────────────────
        function tileRect(c, rr, wd, ht, seed, depth) {
            if (wd < 1 || ht < 1) return;
            if (wd <= 1 && ht <= 1) { add(c, rr, wd, ht); return; }

            var aspect = Math.max(wd, ht) / Math.min(wd, ht);
            if (wd * ht <= tileCap && aspect <= maxAspect) {
                add(c, rr, wd, ht);
                return;
            }

            // Choose cut direction: favour the longer side with jitter.
            var vertical;
            if (wd <= 1) vertical = false;
            else if (ht <= 1) vertical = true;
            else {
                var bias = (wd - ht) / (wd + ht);
                var jit = (hash01(seed * 101 + depth * 41 + 3) - 0.5) * 0.85;
                var pV = Math.max(0.1, Math.min(0.9, 0.5 + bias * 0.5 + jit));
                vertical = hash01(seed * 61 + depth * 29 + 9) < pV;
            }

            // Bimodal asymmetric cut.
            var rr2 = hash01(seed * 37 + depth * 13 + 17);
            var cutF = rr2 < 0.5 ? 0.25 + 0.2 * rr2 * 2 : 0.55 + 0.2 * (rr2 - 0.5) * 2;

            if (vertical) {
                var cut = Math.max(1, Math.min(wd - 1, Math.round(wd * cutF)));
                if (cut >= 1 && cut < wd) {
                    tileRect(c, rr, cut, ht, seed * 3 + depth * 5 + 11, depth + 1);
                    tileRect(c + cut, rr, wd - cut, ht, seed * 3 + depth * 5 + 12, depth + 1);
                } else {
                    add(c, rr, wd, ht);
                }
            } else {
                var cut2 = Math.max(1, Math.min(ht - 1, Math.round(ht * cutF)));
                if (cut2 >= 1 && cut2 < ht) {
                    tileRect(c, rr, wd, cut2, seed * 5 + depth * 7 + 21, depth + 1);
                    tileRect(c, rr + cut2, wd, ht - cut2, seed * 5 + depth * 7 + 22, depth + 1);
                } else {
                    add(c, rr, wd, ht);
                }
            }
        }

        // ── Centre-first layout ────────────────────────────
        // Hero tile: ~35-45 % of canvas area, landscape or square,
        // placed near centre with jitter for asymmetry.
        var totalArea = cols * rows;
        var heroArea = Math.round(totalArea * (0.30 + 0.15 * hash01(7)));
        var heroW, heroH;
        if (cols >= rows) {
            heroH = Math.max(2, Math.round(Math.sqrt(heroArea * 0.7)));
            heroW = Math.max(2, Math.round(heroArea / heroH));
        } else {
            heroW = Math.max(2, Math.round(Math.sqrt(heroArea * 0.7)));
            heroH = Math.max(2, Math.round(heroArea / heroW));
        }
        if (heroW > cols) heroW = cols;
        if (heroH > rows) heroH = rows;
        if (heroW < heroH) { var tmp = heroW; heroW = heroH; heroH = tmp; }

        // Position: jittered but always covering the canvas centre pixel.
        var ccx = cols >> 1, ccy = rows >> 1;
        var jX = Math.round((cols - heroW) * (0.3 + 0.4 * hash01(11)));
        var jY = Math.round((rows - heroH) * (0.3 + 0.4 * hash01(13)));
        jX = Math.max(0, Math.min(cols - heroW, jX));
        jY = Math.max(0, Math.min(rows - heroH, jY));
        // Clamp so hero always covers (ccx, ccy).
        var minX = Math.max(0, ccx - heroW + 1);
        var maxX = Math.min(cols - heroW, ccx);
        if (jX < minX) jX = minX;
        if (jX > maxX) jX = maxX;
        var minY = Math.max(0, ccy - heroH + 1);
        var maxY = Math.min(rows - heroH, ccy);
        if (jY < minY) jY = minY;
        if (jY > maxY) jY = maxY;
        add(jX, jY, heroW, heroH);

        // Collect rim rectangles (top, bottom, left, right of hero).
        var rims = [];
        // top strip
        if (jY > 0) rims.push({ c: 0, rr: 0, w: cols, h: jY, seed: 21 });
        // bottom strip
        if (jY + heroH < rows) rims.push({ c: 0, rr: jY + heroH, w: cols, h: rows - jY - heroH, seed: 23 });
        // left strip (between top and bottom strips)
        if (jX > 0) rims.push({ c: 0, rr: jY, w: jX, h: heroH, seed: 29 });
        // right strip
        if (jX + heroW < cols) rims.push({ c: jX + heroW, rr: jY, w: cols - jX - heroW, h: heroH, seed: 31 });

        for (var ri = 0; ri < rims.length; ri++) {
            var rm = rims[ri];
            tileRect(rm.c, rm.rr, rm.w, rm.h, rm.seed, 0);
        }

        // Fallback: fill any uncovered cells with 1×1 tiles.
        for (var fy = 0; fy < rows; fy++)
            for (var fx = 0; fx < cols; fx++)
                if (!grid[fy][fx]) add(fx, fy, 1, 1);

        return { tiles: tiles, cols: cols, rows: rows, base: base, baseX: baseX, baseY: baseY, M: Math.min(cols, rows), portrait: h > w };
    }

    // ── Palette ───────────────────────────────────────────
    // 0 = paper, 2 = orange, 3 = purple, 4 = black.
    // Largest tiles: 50 % paper, 30 % orange, 20 % purple.
    // Smallest tiles: 70 % black, 30 % paper.
    // Middle tiles: paper.
    // Adjacency: no same-colour touch for orange/purple/black. White is free.

    function touches(a, b) {
        var horiz = (a.x + a.w === b.x) || (b.x + b.w === a.x);
        var vert = (a.y + a.h === b.y) || (b.y + b.h === a.y);
        if (horiz) { if (Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y) > 0) return true; }
        if (vert) { if (Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x) > 0) return true; }
        return false;
    }

    function colorize(tiles) {
        var n = tiles.length;
        if (!n) return tiles;

        var order = new Array(n);
        for (var i = 0; i < n; i++) order[i] = i;
        order.sort(function (a, b) {
            return (tiles[b].w * tiles[b].h) - (tiles[a].w * tiles[a].h);
        });

        var largeCount = Math.max(1, Math.round(n * 0.25));
        var smallCount = Math.max(1, Math.round(n * 0.4));
        var smallStart = n - smallCount;
        var largePaper = Math.round(largeCount * 0.5);
        var largeOrange = Math.round(largeCount * 0.3);

        function tseed(t) { return ((t.x * 31 + t.y * 17) * 7 + t.w * 13 + t.h * 11) | 0; }

        // Pass 1: assign colours by size rules.
        for (i = 0; i < n; i++) {
            var idx = order[i];
            var t = tiles[idx];
            if (i < largeCount) {
                t.color = i < largePaper ? 0 : i < largePaper + largeOrange ? 2 : 3;
            } else if (i >= smallStart) {
                t.color = hash01(tseed(t) * 91 + 3) < 0.7 ? 4 : 0;
            } else {
                t.color = 0;
            }
        }

        // Centre-node tile is always coloured (orange).
        var cx = 0, cy = 0;
        for (i = 0; i < n; i++) {
            if (tiles[i].x + tiles[i].w > cx) cx = tiles[i].x + tiles[i].w;
            if (tiles[i].y + tiles[i].h > cy) cy = tiles[i].y + tiles[i].h;
        }
        cx >>= 1; cy >>= 1;
        for (i = 0; i < n; i++) {
            var tc = tiles[i];
            if (tc.x <= cx && cx < tc.x + tc.w && tc.y <= cy && cy < tc.y + tc.h && tc.color === 0) {
                tc.color = 2;
            }
        }

        // Pass 2: no same-colour adjacency for orange/purple/black.
        // Greedy graph colouring by area: largest first, assign first
        // non-conflicting colour from the tile's size-group palette.
        var adj = [];
        for (i = 0; i < n; i++) adj.push([]);
        for (i = 0; i < n; i++)
            for (var j = i + 1; j < n; j++)
                if (touches(tiles[i], tiles[j])) { adj[i].push(j); adj[j].push(i); }

        // Clear colours, then re-assign greedily.
        for (i = 0; i < n; i++) tiles[i].color = 0;

        var largePal = [2, 3, 0]; // orange, purple, paper
        var smallPal = [4, 0];    // black, paper
        var midPal = [0];         // paper only

        for (i = 0; i < n; i++) {
            var idx = order[i];
            var pal = i < largeCount ? largePal : i >= smallStart ? smallPal : midPal;
            var used = {};
            for (var k = 0; k < adj[idx].length; k++) {
                var nc = tiles[adj[idx][k]].color;
                if (nc > 0) used[nc] = 1;
            }
            for (var p = 0; p < pal.length; p++) {
                if (!used[pal[p]]) { tiles[idx].color = pal[p]; break; }
            }
        }

        // Re-enforce centre tile.
        for (i = 0; i < n; i++) {
            var tf = tiles[i];
            if (tf.x <= cx && cx < tf.x + tf.w && tf.y <= cy && cy < tf.y + tf.h && tf.color === 0) {
                tf.color = 2;
            }
        }

        return tiles;
    }

    var api = { buildTiles: buildTiles, colorize: colorize, PARAMS: PARAMS };
    if (typeof module !== 'undefined' && module.exports) { module.exports = api; return; }
    global.SolsticeSquares = api;

    // ── DOM ────────────────────────────────────────────────
    if (typeof document === 'undefined') return;

    function init() {
        var el = document.querySelector('.lp-solstice-squares');
        if (!el) return;

        function build() {
            var w = el.clientWidth, h = el.clientHeight;
            if (w < 10 || h < 10) return;
            var result = buildTiles(w, h);
            colorize(result.tiles);
            var gap = 4;

            // ── Identify special tiles ───────────────────────
            var tiles = result.tiles;
            var orangeTiles = [];
            var purpleTiles = [];
            var blackTiles = [];
            for (var i = 0; i < tiles.length; i++) {
                if (tiles[i].color === 2) orangeTiles.push(i);
                if (tiles[i].color === 3) purpleTiles.push(i);
                if (tiles[i].color === 4) blackTiles.push(i);
            }
            // Sort by area descending.
            orangeTiles.sort(function (a, b) {
                return (tiles[b].w * tiles[b].h) - (tiles[a].w * tiles[a].h);
            });
            purpleTiles.sort(function (a, b) {
                return (tiles[b].w * tiles[b].h) - (tiles[a].w * tiles[a].h);
            });
            blackTiles.sort(function (a, b) {
                return (tiles[b].w * tiles[b].h) - (tiles[a].w * tiles[a].h);
            });
            var titleIdx = orangeTiles.length > 0 ? orangeTiles[0] : -1;
            var menuIdx = purpleTiles.length > 0 ? purpleTiles[0] : -1;
            var ctaIdx1 = blackTiles.length > 0 ? blackTiles[0] : -1;
            var ctaIdx2 = blackTiles.length > 1 ? blackTiles[1] : -1;

            el.classList.add('is-built');
            el.innerHTML = '';
            var frag = document.createDocumentFragment();
            var names = ['paper', 'lime', 'orange', 'purple', 'black'];
            for (i = 0; i < tiles.length; i++) {
                var s = tiles[i];
                var d = document.createElement('div');
                d.className = 'sq ' + names[s.color];
                d.style.left = (s.x * result.baseX + gap / 2) + 'px';
                d.style.top = (s.y * result.baseY + gap / 2) + 'px';
                d.style.width = (s.w * result.baseX - gap) + 'px';
                d.style.height = (s.h * result.baseY - gap) + 'px';
                d.style.animationDelay = (s.x + s.y) * 30 + 'ms';

                if (i === titleIdx) {
                    d.setAttribute('data-role', 'title');
                    d.innerHTML =
                        '<span class="tile-title">Fenwick<br>Mile</span>';
                } else if (i === menuIdx) {
                    d.setAttribute('data-role', 'menu');
                    var menuClass = s.w >= s.h ? 'tile-landscape' : 'tile-portrait';
                    d.innerHTML =
                        '<nav class="tile-menu ' + menuClass + '"><ul>' +
                        '<li><a href="#">Lineup</a></li>' +
                        '<li><a href="#">Schedule</a></li>' +
                        '<li><a href="#">Results</a></li>' +
                        '<li><a href="#">About</a></li>' +
                        '<li><a href="#">News</a></li>' +
                        '</ul></nav>';
                } else if (i === ctaIdx1 || i === ctaIdx2) {
                    d.setAttribute('data-role', 'cta');
                    var halfW = (s.w * result.baseX - gap) / 2;
                    d.style.setProperty('--half-w', halfW + 'px');
                    var label = i === ctaIdx1 ? 'Tickets &rarr;' : 'Watch &rarr;';
                    d.innerHTML =
                        '<div class="tile-cta-inner">' +
                        '<div class="cube-face cube-front"></div>' +
                        '<div class="cube-face cube-right"><span class="cube-text">' + label + '</span></div>' +
                        '<div class="cube-face cube-back"></div>' +
                        '<div class="cube-face cube-left"></div>' +
                        '</div>';
                }

                frag.appendChild(d);
            }
            el.appendChild(frag);
        }

        build();

        var t = null;
        window.addEventListener('resize', function () {
            if (t) clearTimeout(t);
            t = setTimeout(build, 150);
        });
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', init);
    } else {
        init();
    }
})(typeof window !== 'undefined' ? window : globalThis);