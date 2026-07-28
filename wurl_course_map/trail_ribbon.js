const FLOATS_PER_VERT = 10;
const STRIDE = FLOATS_PER_VERT * 4;

function cssToRGBA(color) {
    const ctx = document.createElement('canvas').getContext('2d');
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, 1, 1);
    const d = ctx.getImageData(0, 0, 1, 1).data;
    return [d[0] / 255, d[1] / 255, d[2] / 255, d[3] / 255];
}

function smoothPath(pts, factor) {
    const out = [];
    for (let i = 0; i < pts.length - 1; i++) {
        for (let s = 0; s < factor; s++) {
            const t = s / factor;
            out.push({
                lon: pts[i].lon + (pts[i + 1].lon - pts[i].lon) * t,
                lat: pts[i].lat + (pts[i + 1].lat - pts[i].lat) * t,
                ele: pts[i].ele + ((pts[i + 1].ele || 0) - (pts[i].ele || 0)) * t
            });
        }
    }
    out.push(pts[pts.length - 1]);
    return out;
}

function translateMatrix(matrix, x, y, z) {
    const t = new Float32Array(matrix);
    t[12] = matrix[0] * x + matrix[4] * y + matrix[8]  * z + matrix[12];
    t[13] = matrix[1] * x + matrix[5] * y + matrix[9]  * z + matrix[13];
    t[14] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    t[15] = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    return t;
}

const VS_SRC = [
    'attribute vec3 aPos;',
    'attribute vec3 aSegStart;',
    'attribute vec3 aSegEnd;',
    'attribute float aExtrude;',
    'uniform mat4 uMat;',
    'uniform float uPixelWidth;',
    'uniform vec2 uViewportSize;',
    'void main() {',
    '  vec4 clipStart = uMat * vec4(aSegStart, 1.0);',
    '  vec4 clipEnd   = uMat * vec4(aSegEnd, 1.0);',
    '  vec2 scrStart  = (clipStart.xy / clipStart.w) * uViewportSize * 0.5;',
    '  vec2 scrEnd    = (clipEnd.xy   / clipEnd.w)   * uViewportSize * 0.5;',
    '  vec2 dir       = normalize(scrEnd - scrStart);',
    '  vec2 normal    = vec2(-dir.y, dir.x);',
    '  vec2 offset    = normal * (uPixelWidth * 0.5) * aExtrude;',
    '  vec4 clipPos   = uMat * vec4(aPos, 1.0);',
    '  gl_Position    = clipPos;',
    '  gl_Position.xy += offset / uViewportSize * 2.0 * clipPos.w;',
    '}'
].join('\n');

const FS_SRC = 'precision mediump float;uniform vec4 uColor;void main(){gl_FragColor=uColor;}';

export function createTrailRibbonLayer(map, pathPoints, options) {
    const colorStr  = (options && options.color)  || '#FF3B30';
    const smoothFac = (options && options.smooth)  || 1;
    const colorRGBA = cssToRGBA(colorStr);

    const pts = smoothFac > 1 ? smoothPath(pathPoints, smoothFac) : pathPoints.slice();

    return {
        id: 'trail-ribbon',
        type: 'custom',
        renderingMode: '3d',

        onAdd: function(m, gl) {
            this.map = m;
            this.buf = gl.createBuffer();

            function mkShader(type, src) {
                const s = gl.createShader(type);
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
                    console.error('[trail-ribbon] shader:', gl.getShaderInfoLog(s));
                return s;
            }

            const vs = mkShader(gl.VERTEX_SHADER, VS_SRC);
            const fs = mkShader(gl.FRAGMENT_SHADER, FS_SRC);
            this.prg = gl.createProgram();
            gl.attachShader(this.prg, vs);
            gl.attachShader(this.prg, fs);
            gl.linkProgram(this.prg);
            if (!gl.getProgramParameter(this.prg, gl.LINK_STATUS))
                console.error('[trail-ribbon] link:', gl.getProgramInfoLog(this.prg));

            this.aPos      = gl.getAttribLocation(this.prg, 'aPos');
            this.aSegStart = gl.getAttribLocation(this.prg, 'aSegStart');
            this.aSegEnd   = gl.getAttribLocation(this.prg, 'aSegEnd');
            this.aExtrude  = gl.getAttribLocation(this.prg, 'aExtrude');
            this.uMat       = gl.getUniformLocation(this.prg, 'uMat');
            this.uPixelWidth = gl.getUniformLocation(this.prg, 'uPixelWidth');
            this.uViewportSize = gl.getUniformLocation(this.prg, 'uViewportSize');
            this.uColor     = gl.getUniformLocation(this.prg, 'uColor');
        },

        render: function(gl, matrix) {
            var merc = [];
            for (var i = 0; i < pts.length; i++) {
                var p = pts[i];
                var ele = p.ele || 0;
                try {
                    var qe = map.queryTerrainElevation([p.lon, p.lat]);
                    if (qe != null && !isNaN(qe)) ele = qe;
                } catch (e) {}
                merc.push(maplibregl.MercatorCoordinate.fromLngLat([p.lon, p.lat], ele + 1.5));
            }

            var origin = merc[0];

            var v = [];
            for (var i = 0; i < merc.length - 1; i++) {
                var Ax = merc[i].x     - origin.x, Ay = merc[i].y     - origin.y, Az = merc[i].z     - origin.z;
                var Bx = merc[i + 1].x - origin.x, By = merc[i + 1].y - origin.y, Bz = merc[i + 1].z - origin.z;
                v.push(
                    Ax, Ay, Az, Ax, Ay, Az, Bx, By, Bz, -1,
                    Ax, Ay, Az, Ax, Ay, Az, Bx, By, Bz,  1,
                    Bx, By, Bz, Ax, Ay, Az, Bx, By, Bz, -1,
                    Ax, Ay, Az, Ax, Ay, Az, Bx, By, Bz,  1,
                    Bx, By, Bz, Ax, Ay, Az, Bx, By, Bz, -1,
                    Bx, By, Bz, Ax, Ay, Az, Bx, By, Bz,  1
                );
            }

            var vertexCount = (merc.length - 1) * 6;
            if (vertexCount === 0) return;

            gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
            gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(v), gl.DYNAMIC_DRAW);

            gl.useProgram(this.prg);

            var zoom = this.map.getZoom();
            var pixelWidth = 0.215 * Math.pow(2, zoom - 9);
            var canvas = this.map.getCanvas();

            var translatedMatrix = translateMatrix(matrix, origin.x, origin.y, origin.z);

            gl.uniformMatrix4fv(this.uMat, false, translatedMatrix);
            gl.uniform1f(this.uPixelWidth, pixelWidth);
            gl.uniform2f(this.uViewportSize, canvas.width, canvas.height);
            gl.uniform4fv(this.uColor, colorRGBA);

            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.depthMask(true);

            gl.enable(gl.POLYGON_OFFSET_FILL);
            gl.polygonOffset(-3, -3);

            gl.enableVertexAttribArray(this.aPos);
            gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, STRIDE, 0);
            gl.enableVertexAttribArray(this.aSegStart);
            gl.vertexAttribPointer(this.aSegStart, 3, gl.FLOAT, false, STRIDE, 12);
            gl.enableVertexAttribArray(this.aSegEnd);
            gl.vertexAttribPointer(this.aSegEnd, 3, gl.FLOAT, false, STRIDE, 24);
            gl.enableVertexAttribArray(this.aExtrude);
            gl.vertexAttribPointer(this.aExtrude, 1, gl.FLOAT, false, STRIDE, 36);

            gl.drawArrays(gl.TRIANGLES, 0, vertexCount);

            gl.disable(gl.POLYGON_OFFSET_FILL);

            this.map.triggerRepaint();
        }
    };
}
