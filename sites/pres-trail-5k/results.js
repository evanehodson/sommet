/* Results page — fetches GET /api/races/{slug}/results. Until the mock race
 * is timed and imported, it just shows the empty state. Rows render when the
 * API starts returning them, so no further wiring is needed. */

(function () {
  'use strict';

  var API_BASE = window.SOMMET_API_BASE || 'http://localhost:8000';
  var RACE_SLUG = window.SOMMET_RACE_SLUG || 'pres-trail-5k';
  var DISTANCE_MILES = 3.1;

  var body = document.getElementById('results-body');
  var empty = document.getElementById('results-empty');
  var gloss = document.getElementById('results-gloss');
  if (!body || !empty) return;

  function formatTime(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '—';
    var total = Math.round(seconds);
    var m = Math.floor(total / 60);
    var s = total % 60;
    return m + ':' + (s < 10 ? '0' : '') + s;
  }

  function formatPace(seconds) {
    if (typeof seconds !== 'number' || isNaN(seconds)) return '—';
    var pace = seconds / DISTANCE_MILES;
    var m = Math.floor(pace / 60);
    var s = Math.round(pace % 60);
    if (s === 60) { m += 1; s = 0; }
    return m + ':' + (s < 10 ? '0' : '') + s + ' /mi';
  }

  function render(rows) {
    body.innerHTML = '';
    var dnfs = 0;
    rows.forEach(function (row) {
      var tr = document.createElement('tr');
      if (row.outcome === 'dnf') { dnfs++; return; }
      var cells = [
        { cls: 'rank', text: String(row.place || '') },
        { cls: 'bib', text: '#' + row.bib_number },
        { cls: 'name', text: row.last_name + ', ' + row.first_name },
        { cls: 'finish', text: formatTime(row.finish_time_seconds) },
        { cls: 'pace', text: formatPace(row.finish_time_seconds) }
      ];
      cells.forEach(function (c) {
        var td = document.createElement('td');
        td.className = c.cls;
        td.textContent = c.text;
        tr.appendChild(td);
      });
      body.appendChild(tr);
    });
    if (gloss) {
      gloss.textContent = dnfs
        ? dnfs + ' DNF' + (dnfs > 1 ? 's' : '') + ' on the day.'
        : 'No DNF\u2019s on the day.';
    }
  }

  fetch(API_BASE + '/api/races/' + encodeURIComponent(RACE_SLUG) + '/results')
    .then(function (r) {
      if (!r.ok) throw new Error('not ready');
      return r.json();
    })
    .then(function (rows) {
      if (Array.isArray(rows) && rows.length) {
        empty.hidden = true;
        render(rows);
      }
    })
    .catch(function () {
      // Empty state stays up; the board fills in after the mock race is timed.
    });
})();