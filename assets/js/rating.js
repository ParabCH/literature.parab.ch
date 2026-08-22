// Läuft auf jeder Seite: die Listenseiten zeigen zwölf Karten, und eine
// Sammelanfrage füllt alle.
//
// Quelle: literatur-backend/client/rating.js — dort ändern, nicht hier.
(function () {
  var api = document.body.getAttribute('data-api');
  if (!api) return;

  var summaries = [].slice.call(document.querySelectorAll('[data-rating-summary]'));
  var input = document.querySelector('[data-rating-input]');
  if (!summaries.length && !input) return;

  var MAX_BATCH = 50;

  function formatAverage(avg) {
    // Fest eine Nachkommastelle: der Server schickt 4 statt 4.0, und "4"
    // neben "4,5" sähe nach zwei verschiedenen Skalen aus.
    return avg.toFixed(1).replace('.', ',');
  }

  function plural(n, one, many) {
    return n === 1 ? one : many;
  }

  function render(el, rating) {
    var fill = el.querySelector('.rating-stars__fill');
    var text = el.querySelector('[data-rating-text]');

    if (!rating || !rating.count) {
      if (fill) fill.style.width = '0%';
      if (text) text.textContent = 'Noch keine Bewertung';
      el.setAttribute('aria-label', 'Noch keine Bewertung');
      el.classList.add('is-empty');
      el.classList.add('is-loaded');
      return;
    }

    if (fill) fill.style.width = (rating.avg / 5 * 100) + '%';
    if (text) {
      text.textContent = formatAverage(rating.avg) + ' · ' + rating.count + ' ' +
        plural(rating.count, 'Bewertung', 'Bewertungen');
    }
    el.setAttribute('aria-label',
      formatAverage(rating.avg) + ' von 5 Sternen, ' + rating.count + ' ' +
      plural(rating.count, 'Bewertung', 'Bewertungen'));
    el.classList.remove('is-empty');
    el.classList.add('is-loaded');
  }

  // Ein Beitrag stellt zwei Anfragen: seine eigene Bewertung und die der
  // Karten darunter. Beide Antworten dürfen nur die Anzeigen anfassen, nach
  // denen gefragt wurde, sonst löscht die zweite das Ergebnis der ersten.
  function renderAll(byUri) {
    for (var i = 0; i < summaries.length; i++) {
      var uri = summaries[i].getAttribute('data-rating-uri');
      if (Object.prototype.hasOwnProperty.call(byUri, uri)) {
        render(summaries[i], byUri[uri]);
      }
    }
  }

  function get(url) {
    return fetch(api + url, { headers: { Accept: 'application/json' } })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      });
  }

  // Die Sammelabfrage liefert kein "mine", deshalb holt der Beitrag, auf dem
  // bewertet werden kann, seine Zahlen einzeln.
  function load() {
    var own = input ? input.getAttribute('data-rating-uri') : null;
    var uris = [];

    for (var i = 0; i < summaries.length; i++) {
      var uri = summaries[i].getAttribute('data-rating-uri');
      if (uri && uri !== own && uris.indexOf(uri) === -1) uris.push(uri);
    }

    if (own) {
      get('/api/rating?uri=' + encodeURIComponent(own))
        .then(function (rating) {
          var byUri = {};
          byUri[own] = rating;
          renderAll(byUri);
          markOwnVote(rating.mine);
        })
        .catch(offline);
    }

    while (uris.length) {
      var chunk = uris.splice(0, MAX_BATCH);
      get('/api/ratings?uris=' + chunk.map(encodeURIComponent).join(','))
        .then(renderAll)
        .catch(offline);
    }
  }

  // Ohne Backend bleibt die Seite wie sie ist: die Platzhalter verschwinden.
  function offline() {
    for (var i = 0; i < summaries.length; i++) {
      summaries[i].classList.add('is-offline');
    }
    if (input) input.classList.add('is-offline');
  }

  // Der zuletzt gespeicherte Wert, damit ein fehlgeschlagener Klick die
  // Anzeige nicht auf einer Auswahl stehen lässt, die nie ankam.
  var confirmed = null;

  function markOwnVote(mine) {
    if (!input || !mine) return;
    confirmed = mine;
    var radio = input.querySelector('input[value="' + mine + '"]');
    if (radio) radio.checked = true;
    input.classList.add('has-vote');
    status('Deine Bewertung: ' + mine + ' von 5.');
  }

  function restoreConfirmed() {
    var radios = input.querySelectorAll('input[name="rating"]');
    for (var i = 0; i < radios.length; i++) {
      radios[i].checked = Number(radios[i].value) === confirmed;
    }
  }

  function status(message, kind) {
    if (!input) return;
    var box = input.querySelector('[data-rating-status]');
    if (!box) return;
    box.textContent = message;
    box.className = 'rating-input__status' + (kind ? ' rating-input__status--' + kind : '');
  }

  function vote(stars) {
    var uri = input.getAttribute('data-rating-uri');
    input.classList.add('is-busy');
    status('Wird gespeichert …');

    fetch(api + '/api/rate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ uri: uri, stars: stars })
    })
      .then(function (r) {
        // Nicht jede Fehlerseite ist JSON: ein Proxy antwortet mit HTML.
        return r.json().catch(function () { return {}; }).then(function (data) {
          if (!r.ok) throw new Error(data.error || ('HTTP ' + r.status));
          return data;
        });
      })
      .then(function (rating) {
        confirmed = stars;
        var byUri = {};
        byUri[uri] = rating;
        renderAll(byUri);
        input.classList.add('has-vote');
        status('Danke! Deine Bewertung: ' + stars + ' von 5.');
      })
      .catch(function (err) {
        restoreConfirmed();
        status(err.message, 'error');
      })
      .then(function () {
        input.classList.remove('is-busy');
      });
  }

  if (input) {
    input.addEventListener('change', function (ev) {
      if (ev.target && ev.target.name === 'rating') vote(Number(ev.target.value));
    });
  }

  load();
})();
