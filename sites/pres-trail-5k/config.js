// Per-site config. Kept as a plain global so a build step or deploy-time
// rewrite can point a site at a different backend without touching app code.
window.SOMMET_API_BASE = window.SOMMET_API_BASE || 'https://sommet-9la3.onrender.com';
window.SOMMET_RACE_SLUG = 'pres-trail-5k';

// Warm-up ping: Render free tier sleeps after inactivity (~50s cold start).
// Fire-and-forget so the backend is already booting by the time any real
// request fires; the response is deliberately ignored.
(function () {
  if (!window.SOMMET_API_BASE) return;
  fetch(window.SOMMET_API_BASE + '/api/health', { method: 'GET' })
    .catch(function () {});
})();