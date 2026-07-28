function makePoleIconCanvas() {
    var c = document.createElement('canvas');
    c.width = 320;
    c.height = 256;
    var cx = c.getContext('2d');
    cx.clearRect(0, 0, 320, 256);

    var poleX = 160;
    var poleTop = 20;
    var poleBottom = 256;

    cx.strokeStyle = '#999999';
    cx.lineWidth = 10;
    cx.lineCap = 'butt';
    cx.beginPath();
    cx.moveTo(poleX, poleBottom);
    cx.lineTo(poleX, poleTop);
    cx.stroke();

    cx.fillStyle = '#FF3B30';
    cx.beginPath();
    cx.moveTo(poleX, poleTop);
    cx.lineTo(poleX + 130, poleTop + 34);
    cx.lineTo(poleX, poleTop + 68);
    cx.closePath();
    cx.fill();

    return c;
}

export function createFlagsLayer(map, pathPoints, sectionMiles, KNOWN_LENGTH_MI, cumDist, cumDistArr) {
    var flagFeatures = [];
    for (var si = 0; si < sectionMiles.length; si++) {
        var mile = sectionMiles[si];
        if (mile <= 0 || mile >= KNOWN_LENGTH_MI) continue;

        var meterDist = mile / (KNOWN_LENGTH_MI / cumDist);
        var idx = 0;
        for (var j = 0; j < cumDistArr.length; j++) {
            if (cumDistArr[j] >= meterDist) { idx = j; break; }
        }

        var wp = pathPoints[Math.max(0, idx - 1)];
        if (!wp || isNaN(wp.lon) || isNaN(wp.lat)) continue;

        flagFeatures.push({
            type: 'Feature',
            geometry: {
                type: 'Point',
                coordinates: [wp.lon, wp.lat, wp.ele || 0]
            },
            properties: { label: String(si) }
        });
    }

    if (flagFeatures.length === 0) return;

    var iconCanvas = makePoleIconCanvas();
    if (iconCanvas.transferToImageBitmap) {
        map.addImage('flag-pole-icon', iconCanvas.transferToImageBitmap());
    } else {
        var data = iconCanvas.getContext('2d').getImageData(0, 0, 320, 256);
        map.addImage('flag-pole-icon', { width: 320, height: 256, data: data.data });
    }

    map.addSource('flags-source', {
        type: 'geojson',
        data: { type: 'FeatureCollection', features: flagFeatures }
    });

    map.addLayer({
        id: 'flags-symbol',
        type: 'symbol',
        source: 'flags-source',
        layout: {
            'symbol-sort-key': 100,
            'icon-image': 'flag-pole-icon',
            'icon-anchor': 'bottom',
            'icon-size': [
                'interpolate', ['exponential', 2], ['zoom'],
                12, 0.055,
                18, 3.5
            ],
            'icon-allow-overlap': true,
            'icon-ignore-placement': true
        }
    });
}
