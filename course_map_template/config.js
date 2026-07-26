export default {
  // ── Trail Data ──────────────────────────────────────────────
  gpxFile: 'data/your_trail.gpx',          // Path to GPX file
  knownLengthMi: 35.6,                     // Known trail length in miles

  // ── Map View ────────────────────────────────────────────────
  center: [149.13, -35.28],                // Initial [lng, lat]
  zoom: 11,                                // Initial zoom
  pitch: 60,                               // Initial pitch (degrees)
  bearing: -15,                            // Initial bearing (degrees)
  maxPitch: 85,                            // Maximum allowed pitch

  // ── Fit Bounds ──────────────────────────────────────────────
  fitBoundsPadding: 60,                    // Padding in pixels
  fitBoundsDuration: 3500,                 // Animation duration in ms
  fitBoundsPitch: 55,                      // Final pitch after fit
  fitBoundsBearing: -15,                   // Final bearing after fit

  // ── Terrain ─────────────────────────────────────────────────
  terrainExaggeration: 1.5,                // Elevation multiplier

  // ── DEM Tiles ───────────────────────────────────────────────
  demUrl: 'https://s3.amazonaws.com/elevation-tiles-prod/terrarium/{z}/{x}/{y}.png',
  demEncoding: 'terrarium',
  demMaxzoom: 15,
  demCacheSize: 100,

  // ── Satellite Tiles ─────────────────────────────────────────
  satelliteUrl: ['https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'],
  satelliteAttribution: 'Esri, Maxar, Earthstar Geographics',
  satelliteTileSize: 256,
  satelliteMaxzoom: 16,

  // ── Vector Tiles ────────────────────────────────────────────
  vectorUrl: 'https://tiles.openfreemap.org/planet',
  glyphsUrl: 'https://tiles.openfreemap.org/fonts/{fontstack}/{range}.pbf',

  // ── Lighting ────────────────────────────────────────────────
  sunDirection: [210, 55],
  sunIntensity: 1.0,
  ambientColor: '#fff5e6',
  ambientIntensity: 0.35,

  // ── Sky / Atmosphere ────────────────────────────────────────
  skyColor: '#1a6fb5',
  horizonColor: '#e8dcc8',
  fogColor: '#d4cbbf',
  skyHorizonBlend: 0.45,
  horizonFogBlend: 0.5,
  fogGroundBlend: 0.65,
  atmosphereBlend: 0.8,

  // ── Contour Lines ───────────────────────────────────────────
  contourMultiplier: 3.28084,              // Meters → feet
  contourThresholds: {
    8: [200, 400],
    10: [100, 200],
    12: [100, 200],
    14: [50, 100],
    15: [20, 100],
    16: [10, 100],
    17: [10, 100],
    18: [10, 100]
  },
  contourExtent: 4096,
  contourBuffer: 1,
  contourMaxzoom: 18,
  contourLineColor: 'rgba(120, 80, 40, 0.45)',
  contourLabelColor: 'rgba(120, 80, 40, 0.85)',

  // ── Trail Line ──────────────────────────────────────────────
  trailColor: '#ff3366',                   // Main trail color
  trailOutlineColor: '#ffffff',            // Outline/border color

  // ── Elevation Profile ───────────────────────────────────────
  profileBgColor: '#ffffff',
  profileGridColor: '#e0e0e0',
  profileFillColor1: 'rgba(255, 51, 102, 0.12)',
  profileFillColor2: 'rgba(255, 51, 102, 0.01)',
  profileLineColor: '#ff3366',
  profileScrubberColor: 'rgba(255, 51, 102, 0.4)',
  profileScrubberDotColor: '#ff3366',
  profilePadding: { top: 20, bottom: 24, left: 42, right: 14 },

  // ── Runner Dot ──────────────────────────────────────────────
  runnerDotColor: '#ff3366',
  runnerDotStroke: '#ffffff',

  // ── Labels ──────────────────────────────────────────────────
  parkLabelColor: '#d4edda',
  parkLabelHalo: '#1a3a1a',
  peakLabelColor: '#8B4513',

  // ── Interaction Thresholds ──────────────────────────────────
  hoverThresholdSq: 900,                  // Squared px distance for hover snap
  clickThresholdSq: 900,                  // Squared px distance for click snap

  // ── Torus Rings ─────────────────────────────────────────────
  torusColor: '#ff3366',
  torusBackgroundColor: '#ffffff',

  // ── Fly-Through ─────────────────────────────────────────────
  flyThroughSpeed: 1200,                   // Meters per second
  flyThroughCamAbove: 3000,               // Camera height in meters
  flyThroughPitch: 45                     // Camera pitch during fly-through
};
