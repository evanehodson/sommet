(function () {
  'use strict';

  var API_BASE = window.SOMMET_API_BASE || 'http://localhost:8000';
  var RACE_SLUG = window.SOMMET_RACE_SLUG || 'press-expedition-50';

  var form = document.getElementById('register-form');
  var submitBtn = document.getElementById('submit-btn');
  var errorBox = document.getElementById('form-error');
  var note = document.getElementById('register-note');
  var priceDisplay = document.getElementById('price-display');
  var spotsDisplay = document.getElementById('spots-display');

  if (!form) return;

  function showError(msg) {
    errorBox.textContent = msg;
    errorBox.hidden = false;
  }

  function clearError() {
    errorBox.textContent = '';
    errorBox.hidden = true;
  }

  // ── Load race info for the sidebar ──────────────────────

  fetch(API_BASE + '/api/races/' + encodeURIComponent(RACE_SLUG))
    .then(function (r) { return r.json(); })
    .then(function (race) {
      if (!race || typeof race.price_cents !== 'number') return;
      var dollars = (race.price_cents / 100).toFixed(0);
      priceDisplay.textContent = '$' + dollars;
      if (!race.is_registration_open) {
        spotsDisplay.textContent = 'Registration is closed.';
      } else if (typeof race.spots_remaining === 'number') {
        spotsDisplay.textContent = race.spots_remaining + ' / ' + race.capacity + ' spots remaining';
      }
    })
    .catch(function () {
      priceDisplay.textContent = '—';
      spotsDisplay.textContent = 'Cannot reach the registration service.';
    });

  // ── Submit ─────────────────────────────────────────────

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    clearError();

    if (!form.checkValidity()) {
      form.reportValidity();
      return;
    }

    var payload = {
      first_name: document.getElementById('first_name').value.trim(),
      last_name: document.getElementById('last_name').value.trim(),
      email: document.getElementById('email').value.trim(),
      phone: document.getElementById('phone').value.trim(),
      emergency_contact_name: document.getElementById('emergency_contact_name').value.trim(),
      emergency_contact_phone: document.getElementById('emergency_contact_phone').value.trim(),
      waiver_accepted: document.getElementById('waiver_accepted').checked
    };

    var dob = document.getElementById('date_of_birth').value;
    if (dob) payload.date_of_birth = dob;

    submitBtn.disabled = true;
    submitBtn.textContent = 'Registering…';

    fetch(API_BASE + '/api/races/' + encodeURIComponent(RACE_SLUG) + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        return r.json().then(function (body) { return { ok: r.ok, status: r.status, body: body }; });
      })
      .then(function (res) {
        if (res.ok) {
          form.reset();
          note.textContent = res.body.message || 'You\u2019re in.';
          return;
        }
        if (res.status === 409) {
          showError(res.body.detail || 'This email is already registered for this race.');
        } else if (res.status === 400) {
          showError(res.body.detail || 'Registration is closed for this race.');
        } else if (res.status === 422) {
          showError('Please review the highlighted fields.');
          highlightValidationErrors(res.body.detail);
        } else {
          showError(res.body.detail || 'Something went wrong. Please try again.');
        }
      })
      .catch(function () {
        showError('Cannot reach the registration service. Is the API running?');
      })
      .finally(function () {
        submitBtn.disabled = false;
        submitBtn.textContent = 'Register';
      });
  });

  function highlightValidationErrors(details) {
    if (!Array.isArray(details)) return;
    details.forEach(function (err) {
      var loc = err && err.loc;
      if (!loc) return;
      var field = loc[loc.length - 1];
      var input = document.getElementById(field);
      if (input) {
        input.focus();
        input.addEventListener('input', function once() {
          input.removeEventListener('input', once);
          clearError();
        });
      }
    });
  }
})();
