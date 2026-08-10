/* Pre's Trail 5k -- homepage bits: countdown, active nav, hero parallax.
 * Race day: Sunday, October 11 2026, 8:00 AM Pacific (PDT = UTC-7 -> 15:00 UTC). */

(function () {
  'use strict';

  // -- Countdown chip -------------------------------------------
  var countdownEl = document.getElementById('countdown-hero');
  if (countdownEl) {
    function pad2(n) { return (n < 10 ? '0' : '') + n; }
    function pad3(n) { return (n < 100 ? '0' : '') + (n < 10 ? '0' : '') + n; }
    function tick() {
      var now = new Date();
      var y = 2026;
      var deadline = new Date(Date.UTC(y, 9, 11, 15, 0, 0));
      if (now >= deadline) {
        countdownEl.innerHTML = 'RACE DAY &mdash; ON NOW';
        return;
      }
      var diff = deadline - now;
      var d = Math.floor(diff / 86400000);
      var h = Math.floor(diff / 3600000) % 24;
      var m = Math.floor(diff / 60000) % 60;
      var s = Math.floor(diff / 1000) % 60;
      countdownEl.innerHTML = pad3(d) + 'd ' + pad2(h) + ':' + pad2(m) + ':' + pad2(s) + ' to start';
    }
    tick();
    setInterval(tick, 1000);
  }

  // -- Active nav link ------------------------------------------
  var path = (location.pathname || '').split('/').pop() || 'index.html';
  var map = { 'course.html': 0, 'register.html': 1, 'results.html': 2 };
  var links = document.querySelectorAll('.nav-links a');
  if (links.length && (path in map)) links[map[path]].classList.add('is-active');

  // -- Hero parallax (background-position shift) ----------------
  var hero = document.querySelector('.hero');
  var reduced = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (hero && !reduced) {
    var ticking = false;
    function drift() {
      ticking = false;
      var p = Math.min(1, window.pageYOffset / window.innerHeight);
      hero.style.backgroundPositionY = (50 + p * 20) + '%';
    }
    function onScroll() {
      if (!ticking) { ticking = true; requestAnimationFrame(drift); }
    }
    drift();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll);
  }
})();
