var POLE_HEIGHT_M = 200;
var PENNANT_WIDTH_M = 80;
var PENNANT_HEIGHT_M = 70;
var ELEVATION_BIAS = 2.0;

function makeFlagCanvas(label) {
    var c = document.createElement('canvas');
    c.width = 1024;
    c.height = 1024;
    var cx = c.getContext('2d');

    cx.clearRect(0, 0, 1024, 1024);

    var poleX = 80;
    var poleTop = 100;
    var poleBottom = 1024;

    // Pole shadow
    cx.strokeStyle = 'rgba(0,0,0,0.3)';
    cx.lineWidth = 48;
    cx.lineCap = 'round';
    cx.beginPath();
    cx.moveTo(poleX + 5, poleBottom);
    cx.lineTo(poleX + 5, poleTop);
    cx.stroke();

    // Pole body
    cx.strokeStyle = '#999999';
    cx.lineWidth = 38;
    cx.beginPath();
    cx.moveTo(poleX, poleBottom);
    cx.lineTo(poleX, poleTop);
    cx.stroke();

    // Pole highlight
    cx.strokeStyle = '#dddddd';
    cx.lineWidth = 12;
    cx.beginPath();
    cx.moveTo(poleX - 7, poleBottom);
    cx.lineTo(poleX - 7, poleTop);
    cx.stroke();

    // Pennant - fills most of the canvas width
    var pTop = poleTop;
    var pLeft = poleX;
    var pRight = 960;
    var pMid = pTop + 180;
    var pBottom = pTop + 360;

    cx.fillStyle = '#ff3366';
    cx.beginPath();
    cx.moveTo(pLeft, pTop);
    cx.lineTo(pRight, pMid);
    cx.lineTo(pLeft, pBottom);
    cx.closePath();
    cx.fill();

    cx.strokeStyle = '#ffffff';
    cx.lineWidth = 6;
    cx.beginPath();
    cx.moveTo(pLeft, pTop);
    cx.lineTo(pRight, pMid);
    cx.lineTo(pLeft, pBottom);
    cx.closePath();
    cx.stroke();

    cx.fillStyle = '#ffffff';
    cx.font = '700 80px -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';
    cx.textAlign = 'center';
    cx.textBaseline = 'middle';
    cx.fillText(label, (pLeft + pRight) / 2 + 30, pTop + 160);

    return c;
}

function translateMatrix(matrix, x, y, z) {
    var t = new Float32Array(matrix);
    t[12] = matrix[0] * x + matrix[4] * y + matrix[8]  * z + matrix[12];
    t[13] = matrix[1] * x + matrix[5] * y + matrix[9]  * z + matrix[13];
    t[14] = matrix[2] * x + matrix[6] * y + matrix[10] * z + matrix[14];
    t[15] = matrix[3] * x + matrix[7] * y + matrix[11] * z + matrix[15];
    return t;
}

export function createFlagsLayer(map, pathPoints, sectionMiles, KNOWN_LENGTH_MI, cumDist, cumDistArr) {
    var FLOATS = 8;
    var STRIDE = FLOATS * 4;

    var flagDefs = [];
    for (var si = 0; si < sectionMiles.length; si++) {
        var mile = sectionMiles[si];
        if (mile <= 0 || mile >= KNOWN_LENGTH_MI) continue;

        var meterDist = mile / (KNOWN_LENGTH_MI / cumDist);
        var idx = 0;
        for (var j = 0; j < cumDistArr.length; j++) {
            if (cumDistArr[j] >= meterDist) { idx = j; break; }
        }

        var wp = pathPoints[Math.max(0, idx - 1)];

        flagDefs.push({
            wp: wp,
            label: String(si)
        });
    }

    var vsSrc = 'attribute vec3 aPos;attribute vec2 aUV;uniform mat4 uMat;varying vec2 vUV;void main(){gl_Position=uMat*vec4(aPos,1.0);vUV=aUV;}';
    var fsSrc = 'precision mediump float;uniform sampler2D uTex;varying vec2 vUV;void main(){gl_FragColor=texture2D(uTex,vUV);}';

    return {
        id: 'flags-3d',
        type: 'custom',
        renderingMode: '3d',

        onAdd: function(m, gl) {
            this.map = m;
            this.buf = gl.createBuffer();

            function mkShader(type, src) {
                var s = gl.createShader(type);
                gl.shaderSource(s, src);
                gl.compileShader(s);
                if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
                    console.error('[flags-3d] shader:', gl.getShaderInfoLog(s));
                }
                return s;
            }

            var vs = mkShader(gl.VERTEX_SHADER, vsSrc);
            var fs = mkShader(gl.FRAGMENT_SHADER, fsSrc);
            this.prg = gl.createProgram();
            gl.attachShader(this.prg, vs);
            gl.attachShader(this.prg, fs);
            gl.linkProgram(this.prg);
            if (!gl.getProgramParameter(this.prg, gl.LINK_STATUS)) {
                console.error('[flags-3d] link:', gl.getProgramInfoLog(this.prg));
            }

            this.aPos = gl.getAttribLocation(this.prg, 'aPos');
            this.aUV  = gl.getAttribLocation(this.prg, 'aUV');
            this.uMat = gl.getUniformLocation(this.prg, 'uMat');
            this.uTex = gl.getUniformLocation(this.prg, 'uTex');

            this.textures = [];
            for (var i = 0; i < flagDefs.length; i++) {
                var tex = gl.createTexture();
                gl.bindTexture(gl.TEXTURE_2D, tex);
                gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, makeFlagCanvas(flagDefs[i].label));
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
                gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
                this.textures.push(tex);
            }
        },

        render: function(gl, matrix) {
            gl.useProgram(this.prg);
            gl.enable(gl.DEPTH_TEST);
            gl.depthFunc(gl.LEQUAL);
            gl.depthMask(true);

            gl.uniform1i(this.uTex, 0);
            gl.activeTexture(gl.TEXTURE0);

            var bearing = this.map.getBearing() * Math.PI / 180;

            for (var i = 0; i < flagDefs.length; i++) {
                var def = flagDefs[i];
                if (!def.wp || isNaN(def.wp.lon) || isNaN(def.wp.lat)) continue;

                var te = this.map.queryTerrainElevation([def.wp.lon, def.wp.lat]);
                if (te == null || isNaN(te)) te = def.wp.ele || 0;

                var origin = maplibregl.MercatorCoordinate.fromLngLat(
                    [def.wp.lon, def.wp.lat],
                    te + ELEVATION_BIAS
                );

                var meterScale = origin.meterInMercatorCoordinateUnits();
                var w = PENNANT_WIDTH_M * meterScale;
                var h = (POLE_HEIGHT_M + PENNANT_HEIGHT_M) * meterScale;

                var cosB = Math.cos(-bearing);
                var sinB = Math.sin(-bearing);

                var localCorners = [
                    { x: 0, y: 0, u: 0, v: 1 },
                    { x: w, y: 0, u: 1, v: 1 },
                    { x: 0, y: h, u: 0, v: 0 },
                    { x: w, y: h, u: 1, v: 0 }
                ];

                var verts = [];
                var order = [0, 2, 3, 0, 3, 1];
                for (var k = 0; k < order.length; k++) {
                    var c = localCorners[order[k]];
                    var mx = c.x * cosB;
                    var my = c.x * sinB;
                    var mz = c.y;
                    verts.push(mx, my, mz, c.u, c.v, 0, 0, 0);
                }

                var translatedMatrix = translateMatrix(matrix, origin.x, origin.y, origin.z);
                gl.uniformMatrix4fv(this.uMat, false, translatedMatrix);

                gl.bindTexture(gl.TEXTURE_2D, this.textures[i]);
                gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
                gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(verts), gl.DYNAMIC_DRAW);

                gl.enableVertexAttribArray(this.aPos);
                gl.vertexAttribPointer(this.aPos, 3, gl.FLOAT, false, STRIDE, 0);
                gl.enableVertexAttribArray(this.aUV);
                gl.vertexAttribPointer(this.aUV, 2, gl.FLOAT, false, STRIDE, 12);

                gl.drawArrays(gl.TRIANGLES, 0, 6);
            }

            this.map.triggerRepaint();
        },

        setVisibility: function() {}
    };
}
