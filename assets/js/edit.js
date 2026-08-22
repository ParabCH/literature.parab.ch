// Nur der Fliesstext ist änderbar, das Frontmatter bleibt auf dem Server
// unangetastet.
//
// Quelle: literatur-backend/client/edit.js — dort ändern, nicht hier.
(function () {
  var root = document.getElementById('edit-proposal');
  if (!root) return;

  var api = document.body.getAttribute('data-api');
  var uri = root.getAttribute('data-uri');
  if (!api || !uri) return;

  var details = root.querySelector('[data-edit-details]');
  var form = root.querySelector('[data-edit-form]');
  var textarea = form.querySelector('[name="body"]');
  var original = null;
  var loading = false;

  function status(message, kind) {
    var box = root.querySelector('[data-edit-status]');
    if (!box) return;
    box.textContent = message || '';
    box.className = 'comments__status' + (kind ? ' comments__status--' + kind : '');
  }

  // Die allermeisten Besuche brauchen den Text nie, darum lädt er erst hier.
  function loadSource() {
    if (original !== null || loading) return;
    loading = true;
    status('Text wird geladen …');

    fetch(api + '/api/source?uri=' + encodeURIComponent(uri), {
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (source) {
        original = source.body || '';
        textarea.value = original;
        textarea.disabled = false;
        status('');
      })
      .catch(function () {
        status('Der Text konnte nicht geladen werden. Bitte versuch es später erneut.', 'error');
        loading = false;
      });
  }

  details.addEventListener('toggle', function () {
    if (details.open) loadSource();
  });

  // Gleicher Schlüssel wie in comments.js und submit.js: einmal eingetippt,
  // überall vorausgefüllt.
  var IDENTITY_KEY = 'psng-identity-v1';

  function loadIdentity() {
    try { return JSON.parse(localStorage.getItem(IDENTITY_KEY)) || {}; } catch (e) { return {}; }
  }

  function saveIdentity(name, email) {
    try { localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name: name, email: email })); } catch (e) { /* egal */ }
  }

  function prefill() {
    var saved = loadIdentity();
    var author = form.querySelector('[name="author"]');
    var email = form.querySelector('[name="email"]');
    if (author && !author.value && saved.name) author.value = saved.name;
    if (email && !email.value && saved.email) email.value = saved.email;
  }

  prefill();

  // CSS mit pointer-events sperrt nur die Maus; Enter im Namensfeld würde
  // denselben Vorschlag als zweiten Pull Request abschicken.
  var sending = false;

  form.addEventListener('submit', function (ev) {
    ev.preventDefault();
    if (sending) return;

    var data = new FormData(form);
    var payload = {
      uri: uri,
      body: String(data.get('body') || '').trim(),
      author: String(data.get('author') || '').trim(),
      email: String(data.get('email') || '').trim(),
      note: String(data.get('note') || '').trim(),
      website: String(data.get('website') || '')
    };

    if (original === null) {
      status('Der Text ist noch nicht geladen.', 'error');
      return;
    }
    if (!payload.author || !payload.body) {
      status('Name und Text sind nötig.', 'error');
      return;
    }
    if (payload.body === original.trim()) {
      status('Der Text ist unverändert — es gibt nichts vorzuschlagen.', 'error');
      return;
    }

    sending = true;
    form.classList.add('is-busy');
    status('Wird eingereicht …');

    fetch(api + '/api/edit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    })
      .then(function (r) {
        // Nicht jede Fehlerseite ist JSON: ein Proxy antwortet mit HTML.
        return r.json().catch(function () { return {}; }).then(function (body) {
          if (!r.ok) throw new Error(body.error || ('HTTP ' + r.status));
          return body;
        });
      })
      .then(function () {
        saveIdentity(payload.author, payload.email);
        form.reset();
        textarea.value = original;
        prefill();
        status('Danke! Dein Vorschlag ist bei der Redaktion und wird geprüft.', 'ok');
      })
      .catch(function (err) {
        status(err.message, 'error');
      })
      .then(function () {
        sending = false;
        form.classList.remove('is-busy');
      });
  });
})();
