// Per-site config. Kept as a plain global so a build step or deploy-time
// rewrite can point a site at a different backend without touching app code.
window.SOMMET_API_BASE = window.SOMMET_API_BASE || 'http://localhost:8000';
window.SOMMET_RACE_SLUG = 'press-expedition-50';
