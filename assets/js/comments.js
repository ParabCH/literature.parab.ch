// Quelle: literatur-backend/client/comments.js — dort ändern, nicht hier.
(function () {
  var root = document.getElementById('comments');
  if (!root) return;

  var api = document.body.getAttribute('data-api');
  var uri = root.getAttribute('data-uri');
  if (!api || !uri) return;

  var list = root.querySelector('[data-comments-list]');
  var form = root.querySelector('[data-comments-form]');
  var count = root.querySelector('[data-comments-count]');
  var replyBar = root.querySelector('[data-reply-bar]');
  var replyTo = root.querySelector('[data-reply-to]');
  var replyCancel = root.querySelector('[data-reply-cancel]');
  var parent = null;

  function formatDate(seconds) {
    var d = new Date(seconds * 1000);
    return d.toLocaleDateString('de-CH', {
      day: 'numeric', month: 'long', year: 'numeric'
    }) + ', ' + d.toLocaleTimeString('de-CH', { hour: '2-digit', minute: '2-digit' });
  }

  function node(comment) {
    var el = document.createElement('article');
    el.className = 'comment';
    el.setAttribute('data-id', comment.id);

    var head = document.createElement('header');
    head.className = 'comment__head';

    var author = document.createElement('span');
    author.className = 'comment__author';
    author.textContent = comment.author;

    var time = document.createElement('time');
    time.className = 'comment__time';
    time.dateTime = new Date(comment.created * 1000).toISOString();
    time.textContent = formatDate(comment.created);

    head.appendChild(author);
    head.appendChild(time);

    var body = document.createElement('div');
    body.className = 'comment__body';
    // Der einzige Ort, an dem Serverinhalt als HTML eingesetzt wird. Der Server
    // rendert Klartext zu <p>, <br> und <a>, sonst nichts.
    body.innerHTML = comment.html;

    el.appendChild(head);
    el.appendChild(body);

    if (!comment.parent) {
      var reply = document.createElement('button');
      reply.type = 'button';
      reply.className = 'comment__reply';
      reply.textContent = 'Antworten';
      reply.addEventListener('click', function () { startReply(comment); });
      el.appendChild(reply);

      var replies = document.createElement('div');
      replies.className = 'comment__replies';
      replies.setAttribute('data-replies', comment.id);
      el.appendChild(replies);
    }

    return el;
  }

  function render(comments) {
    list.innerHTML = '';

    if (!comments.length) {
      var empty = document.createElement('p');
      empty.className = 'comments__empty';
      empty.textContent = 'Noch keine Kommentare. Schreib den ersten.';
      list.appendChild(empty);
    }

    // Der Server liefert flach und in der Reihenfolge, in der geschrieben
    // wurde.
    for (var i = 0; i < comments.length; i++) {
      if (!comments[i].parent) list.appendChild(node(comments[i]));
    }
    for (var j = 0; j < comments.length; j++) {
      if (comments[j].parent) append(comments[j]);
    }

    if (count) {
      count.textContent = comments.length
        ? '(' + comments.length + ')'
        : '';
    }
  }

  function append(comment) {
    var target = comment.parent
      ? list.querySelector('[data-replies="' + comment.parent + '"]')
      : list;
    if (!target) target = list;

    var empty = list.querySelector('.comments__empty');
    if (empty) empty.parentNode.removeChild(empty);

    target.appendChild(node(comment));
  }

  function startReply(comment) {
    parent = comment.id;
    if (replyTo) replyTo.textContent = comment.author;
    if (replyBar) replyBar.hidden = false;
    var field = form.querySelector('[name="body"]');
    if (field) field.focus();
  }

  function cancelReply() {
    parent = null;
    if (replyBar) replyBar.hidden = true;
  }

  if (replyCancel) replyCancel.addEventListener('click', cancelReply);

  function status(message, kind) {
    var box = root.querySelector('[data-comments-status]');
    if (!box) return;
    box.textContent = message || '';
    box.className = 'comments__status' + (kind ? ' comments__status--' + kind : '');
  }

  function load() {
    fetch(api + '/api/comments?uri=' + encodeURIComponent(uri), {
      headers: { Accept: 'application/json' }
    })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (thread) {
        render(thread.comments || []);
        root.classList.add('is-loaded');
      })
      .catch(function () {
        root.classList.add('is-offline');
        status('Die Kommentare sind gerade nicht erreichbar.', 'error');
      });
  }

  // Name und E-Mail merken, damit niemand sie auf jedem Beitrag neu tippt.
  // Denselben Schlüssel lesen auch edit.js und submit.js.
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

  // CSS mit pointer-events sperrt nur die Maus; Enter im Namensfeld würde
  // denselben Kommentar ein zweites Mal abschicken.
  var sending = false;

  if (form) {
    prefill();

    form.addEventListener('submit', function (ev) {
      ev.preventDefault();
      if (sending) return;

      var data = new FormData(form);
      var payload = {
        uri: uri,
        author: String(data.get('author') || '').trim(),
        email: String(data.get('email') || '').trim(),
        body: String(data.get('body') || '').trim(),
        website: String(data.get('website') || '')
      };
      if (parent) payload.parent = parent;

      if (!payload.author || !payload.body) {
        status('Name und Kommentar sind nötig.', 'error');
        return;
      }

      sending = true;
      form.classList.add('is-busy');
      status('Wird gesendet …');

      fetch(api + '/api/comments', {
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
        .then(function (comment) {
          // Der Honigtopf bekommt eine leere Antwort. Nichts anzeigen.
          if (!comment.id) {
            form.reset();
            status('');
            return;
          }
          saveIdentity(payload.author, payload.email);
          append(comment);
          form.querySelector('[name="body"]').value = '';
          cancelReply();
          status('Danke, dein Kommentar steht.', 'ok');
          if (count) {
            count.textContent = '(' + list.querySelectorAll('.comment').length + ')';
          }
        })
        .catch(function (err) {
          status(err.message, 'error');
        })
        .then(function () {
          sending = false;
          form.classList.remove('is-busy');
        });
    });
  }

  load();
})();
