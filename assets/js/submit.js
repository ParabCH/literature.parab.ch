// Beitrag einreichen — Formular, Live-Vorschau, Einreichung ans Backend
(function () {
  var app = document.getElementById('submit-app');
  if (!app) return;

  var CFG = {
    api: document.body.getAttribute('data-api') || '',
    mailTo: app.dataset.mailTo || '',
    maxImageMB: parseFloat(app.dataset.maxImageMb) || 8
  };

  var STORAGE_KEY = 'psng-einreichung-v1';
  // Gleicher Schlüssel wie in comments.js und edit.js: einmal eingetippt,
  // überall vorausgefüllt.
  var IDENTITY_KEY = 'psng-identity-v1';

  var BODY_TEMPLATE = [
    '## Warum ist diese Ressource lesenswert?',
    '',
    '',
    '',
    '## Was du in dieser Ressource findest',
    '',
    '* **Punkt 1:** ',
    '* **Punkt 2:** ',
    '',
    '## Wo ist diese Ressource zu finden?',
    '',
    ''
  ].join('\n');

  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December'];

  function el(id) { return document.getElementById(id); }

  var tags = [];
  var imageFile = null;
  var imageUrl = null;

  // ===========================================
  // Text-Werkzeuge
  // ===========================================

  function escapeHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  // Dateiname für static/images/ — nur ASCII.
  function asciiSlug(str) {
    var s = String(str)
      .replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue')
      .replace(/Ä/g, 'Ae').replace(/Ö/g, 'Oe').replace(/Ü/g, 'Ue')
      .replace(/ß/g, 'ss');
    if (s.normalize) s = s.normalize('NFD').replace(/[̀-ͯ]/g, '');
    return s.toLowerCase()
      .replace(/[^a-z0-9]+/g, '_')
      .replace(/^_+|_+$/g, '')
      .slice(0, 60) || 'beitrag';
  }

  // Ordnername für content/posts/ — behält Umlaute, meidet aber alles,
  // woran ein Windows-Checkout scheitert (siehe .githooks/pre-commit).
  function folderName(title) {
    var s = String(title)
      .replace(/[<>:"|?*\\\/]/g, '-')
      .replace(/[\x00-\x1f]/g, '')
      .replace(/\s+/g, ' ')
      .slice(0, 80)
      .replace(/^[\s.]+/, '')
      .replace(/[\s.]+$/, '');
    return s || 'Neuer Beitrag';
  }

  function yamlString(v) {
    return '"' + String(v)
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\r?\n/g, ' ')
      .trim() + '"';
  }

  function pad(n) { return n < 10 ? '0' + n : String(n); }

  function isoDate(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  // Gleiches Format wie layouts/partials/post-meta.html
  function displayDate(d) {
    return d.getDate() + '. ' + MONTHS[d.getMonth()] + ' ' + d.getFullYear();
  }

  function imageExt(file) {
    if (!file) return 'jpg';
    if (file.type === 'image/png') return 'png';
    if (file.type === 'image/webp') return 'webp';
    return 'jpg';
  }

  function formatBytes(n) {
    if (n < 1024) return n + ' B';
    if (n < 1024 * 1024) return Math.round(n / 1024) + ' KB';
    return (n / 1024 / 1024).toFixed(1) + ' MB';
  }

  // ===========================================
  // Markdown → HTML (nur der Umfang, den der Editor erzeugt)
  // ===========================================

  function isSafeUrl(u) {
    return !/^\s*(javascript|data|vbscript):/i.test(u);
  }

  // Einfache Inline-Tags bleiben erlaubt, weil goldmark auf dieser Seite
  // mit unsafe = true läuft und die Vorlage <br> benutzt.
  function restoreInline(s) {
    return s.replace(/&lt;(\/?)(br|b|i|strong|em|u|sub|sup)\s*\/?&gt;/gi,
      function (m, slash, tag) { return '<' + slash + tag.toLowerCase() + '>'; });
  }

  function inline(s) {
    s = restoreInline(escapeHtml(s));
    s = s.replace(/`([^`]+)`/g, function (m, c) { return '<code>' + c + '</code>'; });
    s = s.replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, function (m, alt, url) {
      return isSafeUrl(url) ? '<img src="' + url + '" alt="' + alt + '">' : m;
    });
    s = s.replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, function (m, text, url) {
      return isSafeUrl(url)
        ? '<a href="' + url + '" target="_blank" rel="noopener">' + text + '</a>'
        : m;
    });
    s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    s = s.replace(/__([^_]+)__/g, '<strong>$1</strong>');
    s = s.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
    s = s.replace(/(^|[^\w])_([^_\n]+)_/g, '$1<em>$2</em>');
    return s;
  }

  function renderMarkdown(src) {
    var lines = String(src).replace(/\r\n/g, '\n').split('\n');
    var out = [];
    var para = [];
    var i = 0;

    function flushPara() {
      if (!para.length) return;
      out.push('<p>' + inline(para.join('\n')).replace(/\n/g, '<br>') + '</p>');
      para = [];
    }

    while (i < lines.length) {
      var line = lines[i];

      if (/^\s*```/.test(line)) {
        flushPara();
        var code = [];
        i++;
        while (i < lines.length && !/^\s*```/.test(lines[i])) { code.push(lines[i]); i++; }
        i++;
        out.push('<pre><code>' + escapeHtml(code.join('\n')) + '</code></pre>');
        continue;
      }

      var h = /^(#{1,6})\s+(.*)$/.exec(line);
      if (h) {
        flushPara();
        out.push('<h' + h[1].length + '>' + inline(h[2].trim()) + '</h' + h[1].length + '>');
        i++;
        continue;
      }

      if (/^\s*([-*_])\s*(\1\s*){2,}$/.test(line)) {
        flushPara();
        out.push('<hr>');
        i++;
        continue;
      }

      if (/^\s*>\s?/.test(line)) {
        flushPara();
        var quote = [];
        while (i < lines.length && /^\s*>\s?/.test(lines[i])) {
          quote.push(lines[i].replace(/^\s*>\s?/, ''));
          i++;
        }
        out.push('<blockquote>' + renderMarkdown(quote.join('\n')) + '</blockquote>');
        continue;
      }

      var ordered = /^\s*\d+[.)]\s+/.test(line);
      if (ordered || /^\s*[-*+]\s+/.test(line)) {
        flushPara();
        var strip = ordered ? /^\s*\d+[.)]\s+/ : /^\s*[-*+]\s+/;
        var items = [];
        while (i < lines.length && strip.test(lines[i])) {
          items.push(lines[i].replace(strip, ''));
          i++;
        }
        var tag = ordered ? 'ol' : 'ul';
        out.push('<' + tag + '>' + items.map(function (t) {
          return '<li>' + inline(t) + '</li>';
        }).join('') + '</' + tag + '>');
        continue;
      }

      if (/^\s*$/.test(line)) { flushPara(); i++; continue; }

      para.push(line);
      i++;
    }

    flushPara();
    return out.join('\n');
  }

  // ===========================================
  // Formularzustand
  // ===========================================

  function category() {
    var v = el('f-category').value;
    return v === '__other__' ? el('f-category-other').value.trim() : v;
  }

  function collect() {
    var title = el('f-title').value.trim();
    return {
      title: title,
      author: el('f-author').value.trim(),
      publication: el('f-publication').value.trim(),
      recommendation: el('f-recommendation').value.trim(),
      description: el('f-description').value.trim(),
      category: category(),
      body: el('f-body').value,
      senderName: el('f-sender-name').value.trim(),
      senderEmail: el('f-sender-email').value.trim(),
      note: el('f-note').value.trim(),
      slug: asciiSlug(title),
      folder: folderName(title)
    };
  }

  function buildMarkdown() {
    var d = collect();
    var fm = ['---'];

    fm.push('title: ' + yamlString(d.title));
    if (d.author) fm.push('resource_author: ' + yamlString(d.author));
    if (d.publication) fm.push('publication: ' + yamlString(d.publication));
    if (d.recommendation) fm.push('recommendation: ' + yamlString(d.recommendation));
    fm.push('date: ' + isoDate(new Date()));
    fm.push('draft: true');
    if (imageFile) fm.push('image: ' + yamlString('/images/' + d.slug + '.' + imageExt(imageFile)));
    fm.push('featured: false');
    fm.push('description: ' + yamlString(d.description));
    if (d.category) {
      fm.push('categories:');
      fm.push('  - ' + yamlString(d.category));
    }
    if (tags.length) {
      fm.push('tags:');
      tags.forEach(function (t) { fm.push('  - ' + yamlString(t)); });
    }
    fm.push('toc: false');
    fm.push('---');

    return fm.join('\n') + '\n\n' + d.body.trim() + '\n';
  }

  // ===========================================
  // Vorschau
  // ===========================================

  function renderTagChips() {
    var input = el('f-tag-input');
    var box = el('f-tags');
    var chips = box.querySelectorAll('.submit__tag');
    for (var i = 0; i < chips.length; i++) box.removeChild(chips[i]);

    tags.forEach(function (t, idx) {
      var chip = document.createElement('span');
      chip.className = 'submit__tag';
      chip.appendChild(document.createTextNode(t));

      var x = document.createElement('button');
      x.type = 'button';
      x.className = 'submit__tag-remove';
      x.setAttribute('aria-label', 'Tag ' + t + ' entfernen');
      x.innerHTML = '&times;';
      x.addEventListener('click', function () {
        tags.splice(idx, 1);
        renderTagChips();
        update();
      });

      chip.appendChild(x);
      box.insertBefore(chip, input);
    });
  }

  function updatePreview() {
    var d = collect();

    el('p-title').innerHTML = d.title
      ? escapeHtml(d.title)
      : '<span class="submit__preview-placeholder">Titel der Ressource</span>';

    el('p-meta').textContent = [displayDate(new Date()), d.category].filter(Boolean).join(' · ');
    el('p-author').textContent = d.author ? 'Autor/in: ' + d.author : '';
    el('p-desc').textContent = d.description;

    el('p-tags').innerHTML = tags.map(function (t) {
      return '<span class="chip">' + escapeHtml(t) + '</span>';
    }).join('');

    el('p-body').innerHTML = renderMarkdown(el('f-body').value);

    var hero = el('p-hero');
    if (imageUrl) {
      el('p-hero-img').src = imageUrl;
      el('p-hero-img').alt = d.title;
      hero.classList.remove('submit__hidden');
    } else {
      hero.classList.add('submit__hidden');
    }

    el('f-raw').textContent = buildMarkdown();
  }

  // ===========================================
  // Entwurf im Browser sichern
  // ===========================================

  var saveTimer = null;
  // Nach dem Absenden wird nichts mehr gesichert, sonst legt der nächste
  // Tastendruck den eben gelöschten Entwurf wieder an.
  var submitted = false;

  function saveDraft() {
    if (submitted) return;
    clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      try {
        var d = collect();
        d.tags = tags;
        d.categoryRaw = el('f-category').value;
        localStorage.setItem(STORAGE_KEY, JSON.stringify(d));
      } catch (e) { /* privater Modus, voller Speicher — egal */ }
    }, 400);
  }

  function restoreDraft() {
    var raw;
    try { raw = localStorage.getItem(STORAGE_KEY); } catch (e) { return false; }
    if (!raw) return false;

    var d;
    try { d = JSON.parse(raw); } catch (e) { return false; }

    el('f-title').value = d.title || '';
    el('f-author').value = d.author || '';
    el('f-publication').value = d.publication || '';
    el('f-recommendation').value = d.recommendation || '';
    el('f-description').value = d.description || '';
    el('f-body').value = d.body || BODY_TEMPLATE;
    el('f-sender-name').value = d.senderName || '';
    el('f-sender-email').value = d.senderEmail || '';
    el('f-note').value = d.note || '';

    if (d.categoryRaw) {
      el('f-category').value = d.categoryRaw;
      if (d.categoryRaw === '__other__') {
        el('f-category-other').classList.remove('submit__hidden');
        el('f-category-other').value = d.category || '';
      }
    }

    tags = Array.isArray(d.tags) ? d.tags : [];
    renderTagChips();
    return true;
  }

  function update() {
    updatePreview();
    saveDraft();
  }

  // ===========================================
  // Prüfung
  // ===========================================

  function setInvalid(fieldId, invalid) {
    el(fieldId).classList.toggle('submit__field--invalid', invalid);
  }

  function validate() {
    var d = collect();
    var problems = [];

    setInvalid('field-title', !d.title);
    if (!d.title) problems.push('Titel');

    setInvalid('field-category', !d.category);
    if (!d.category) problems.push('Kategorie');

    setInvalid('field-description', !d.description);
    if (!d.description) problems.push('Kurzbeschreibung');

    setInvalid('field-sender-name', !d.senderName);
    if (!d.senderName) problems.push('Name');

    var mailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.senderEmail);
    setInvalid('field-sender-email', !mailOk);
    if (!mailOk) problems.push('E-Mail');

    return problems;
  }

  // ===========================================
  // Status
  // ===========================================

  function status(kind, html) {
    var box = el('f-status');
    box.className = 'submit__status submit__status--visible submit__status--' + kind;
    box.innerHTML = html;
  }

  function clearStatus() {
    el('f-status').className = 'submit__status';
  }

  // ===========================================
  // Herunterladen (Notausgang, falls das Backend nicht erreichbar ist)
  // ===========================================

  function downloadMarkdown() {
    var d = collect();
    var blob = new Blob([buildMarkdown()], { type: 'text/markdown;charset=utf-8' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = (d.slug || 'beitrag') + '.md';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  // ===========================================
  // Absenden
  // ===========================================

  function mailFallback(intro) {
    var out = intro + '<br>Du kannst den Beitrag stattdessen als <strong>.md herunterladen</strong>';
    if (CFG.mailTo) {
      out += ' und direkt an <a href="mailto:' + escapeHtml(CFG.mailTo) + '">' +
        escapeHtml(CFG.mailTo) + '</a> schicken';
    }
    return out + '.';
  }

  function onSubmit(e) {
    e.preventDefault();

    var problems = validate();
    if (problems.length) {
      status('error', 'Bitte noch ausfüllen: <strong>' + escapeHtml(problems.join(', ')) + '</strong>');
      var firstBad = document.querySelector('.submit__field--invalid');
      if (firstBad) firstBad.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    if (!CFG.api) {
      status('error', mailFallback('Die Einreichung ist gerade nicht angebunden.'));
      return;
    }

    var d = collect();
    var btn = el('f-submit');
    btn.disabled = true;
    status('busy', 'Beitrag wird eingereicht …');

    var fd = new FormData();
    fd.append('title', d.title);
    fd.append('author', d.author);
    fd.append('publication', d.publication);
    fd.append('recommendation', d.recommendation);
    fd.append('description', d.description);
    fd.append('category', d.category);
    fd.append('body', d.body);
    fd.append('tags', tags.join(', '));
    fd.append('senderName', d.senderName);
    fd.append('senderEmail', d.senderEmail);
    fd.append('note', d.note);
    fd.append('website', el('f-website') ? el('f-website').value : '');
    if (imageFile) fd.append('image', imageFile, d.slug + '.' + imageExt(imageFile));

    fetch(CFG.api + '/api/submit', { method: 'POST', body: fd })
      .then(function (r) {
        return r.json().catch(function () { return {}; }).then(function (j) {
          if (!r.ok) throw new Error(j.error || ('HTTP ' + r.status));
          return j;
        });
      })
      .then(function () {
        submitted = true;
        clearTimeout(saveTimer);
        try {
          localStorage.removeItem(STORAGE_KEY);
          localStorage.setItem(IDENTITY_KEY, JSON.stringify({ name: d.senderName, email: d.senderEmail }));
        } catch (err) { /* egal */ }
        status('ok', '<strong>Danke!</strong> Dein Beitrag ist bei der Redaktion und wird ' +
          'vor der Veröffentlichung geprüft. Du kannst die Seite jetzt schliessen.');
        // Der Knopf bleibt gesperrt: ein zweiter Klick wäre ein zweiter,
        // identischer Pull Request.
      })
      .catch(function (err) {
        status('error', mailFallback('Die Einreichung hat nicht geklappt: ' +
          escapeHtml(err.message)));
        btn.disabled = false;
      });
  }

  // ===========================================
  // Bild
  // ===========================================

  function setImage(file) {
    var err = el('f-image-error');
    err.style.display = 'none';

    if (!file) return;

    if (['image/jpeg', 'image/png', 'image/webp'].indexOf(file.type) === -1) {
      err.textContent = 'Nur JPG, PNG oder WebP.';
      err.style.display = 'block';
      return;
    }
    if (file.size > CFG.maxImageMB * 1024 * 1024) {
      err.textContent = 'Das Bild ist zu gross (max. ' + CFG.maxImageMB + ' MB).';
      err.style.display = 'block';
      return;
    }

    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageFile = file;
    imageUrl = URL.createObjectURL(file);

    el('f-thumb-img').src = imageUrl;
    el('f-thumb-name').textContent = file.name;
    el('f-thumb-size').textContent = formatBytes(file.size);
    el('f-thumb').classList.add('submit__thumb--visible');
    el('f-dropzone').classList.add('submit__hidden');

    update();
  }

  function clearImage() {
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    imageFile = null;
    imageUrl = null;
    el('f-image').value = '';
    el('f-thumb').classList.remove('submit__thumb--visible');
    el('f-dropzone').classList.remove('submit__hidden');
    update();
  }

  // ===========================================
  // Werkzeugleiste
  // ===========================================

  function applyTool(kind) {
    var ta = el('f-body');
    var start = ta.selectionStart;
    var end = ta.selectionEnd;
    var value = ta.value;
    var sel = value.slice(start, end);
    var replacement = sel;
    var caret = null;

    function wrap(mark, placeholder) {
      var text = sel || placeholder;
      replacement = mark + text + mark;
      if (!sel) caret = start + mark.length + text.length;
    }

    function prefixLines(prefix, placeholder) {
      var text = sel || placeholder;
      replacement = text.split('\n').map(function (l, idx) {
        return (typeof prefix === 'function' ? prefix(idx) : prefix) + l;
      }).join('\n');
      if (start > 0 && value[start - 1] !== '\n') replacement = '\n' + replacement;
    }

    switch (kind) {
      case 'h2': prefixLines('## ', 'Überschrift'); break;
      case 'h3': prefixLines('### ', 'Unterüberschrift'); break;
      case 'bold': wrap('**', 'fetter Text'); break;
      case 'italic': wrap('*', 'kursiver Text'); break;
      case 'ul': prefixLines('* ', 'Listenpunkt'); break;
      case 'ol': prefixLines(function (i) { return (i + 1) + '. '; }, 'Listenpunkt'); break;
      case 'quote': prefixLines('> ', 'Zitat'); break;
      case 'link':
        var text = sel || 'Linktext';
        replacement = '[' + text + '](https://)';
        caret = start + replacement.length - 1;
        break;
      default: return;
    }

    ta.value = value.slice(0, start) + replacement + value.slice(end);
    ta.focus();
    if (caret !== null) {
      ta.setSelectionRange(caret, caret);
    } else {
      ta.setSelectionRange(start, start + replacement.length);
    }
    update();
  }

  // ===========================================
  // Verdrahtung
  // ===========================================

  el('f-max-mb').textContent = CFG.maxImageMB;

  if (!restoreDraft()) {
    el('f-body').value = BODY_TEMPLATE;
  }

  // Wer schon kommentiert oder eingereicht hat, muss sich nicht neu vorstellen.
  try {
    var identity = JSON.parse(localStorage.getItem(IDENTITY_KEY)) || {};
    if (!el('f-sender-name').value && identity.name) el('f-sender-name').value = identity.name;
    if (!el('f-sender-email').value && identity.email) el('f-sender-email').value = identity.email;
  } catch (e) { /* egal */ }

  var watched = ['f-title', 'f-author', 'f-publication', 'f-recommendation',
    'f-description', 'f-body', 'f-sender-name', 'f-sender-email', 'f-note',
    'f-category-other'];

  watched.forEach(function (id) {
    el(id).addEventListener('input', update);
  });

  el('f-category').addEventListener('change', function () {
    var other = el('f-category-other');
    other.classList.toggle('submit__hidden', this.value !== '__other__');
    if (this.value === '__other__') other.focus();
    update();
  });

  el('f-sender-name').addEventListener('blur', function () {
    var rec = el('f-recommendation');
    if (!rec.value.trim() && this.value.trim()) {
      rec.value = this.value.trim();
      update();
    }
  });

  // --- Tags ---
  function addTag(raw) {
    var t = raw.trim().replace(/^[,;]+|[,;]+$/g, '').trim();
    if (!t) return;
    if (tags.indexOf(t) === -1 && tags.length < 12) tags.push(t);
    renderTagChips();
    update();
  }

  el('f-tag-input').addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag(this.value);
      this.value = '';
    } else if (e.key === 'Backspace' && !this.value && tags.length) {
      tags.pop();
      renderTagChips();
      update();
    }
  });

  el('f-tag-input').addEventListener('blur', function () {
    addTag(this.value);
    this.value = '';
  });

  // Auswahl aus der Vorschlagsliste feuert input, nicht keydown.
  el('f-tag-input').addEventListener('input', function () {
    if (this.value.indexOf(',') !== -1) {
      addTag(this.value);
      this.value = '';
    }
  });

  el('f-tags').addEventListener('click', function (e) {
    if (e.target === this) el('f-tag-input').focus();
  });

  // --- Bild ---
  var dropzone = el('f-dropzone');

  dropzone.addEventListener('click', function () { el('f-image').click(); });
  dropzone.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); el('f-image').click(); }
  });

  ['dragenter', 'dragover'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.add('submit__dropzone--dragover');
    });
  });

  ['dragleave', 'drop'].forEach(function (ev) {
    dropzone.addEventListener(ev, function (e) {
      e.preventDefault();
      dropzone.classList.remove('submit__dropzone--dragover');
    });
  });

  dropzone.addEventListener('drop', function (e) {
    if (e.dataTransfer.files && e.dataTransfer.files.length) setImage(e.dataTransfer.files[0]);
  });

  el('f-image').addEventListener('change', function () {
    if (this.files && this.files.length) setImage(this.files[0]);
  });

  el('f-thumb-remove').addEventListener('click', clearImage);

  // --- Werkzeugleiste ---
  el('f-toolbar').addEventListener('click', function (e) {
    var btn = e.target.closest ? e.target.closest('[data-md]') : null;
    if (btn) applyTool(btn.getAttribute('data-md'));
  });

  // --- Vollbild-Vorschau ---
  function setFullPreview(on) {
    app.classList.toggle('submit--full-preview', on);
    el('f-fullscreen').textContent = on ? 'Vollbild schliessen' : 'Vollbild';
    // Ohne Scrollsperre scrollt die Seite hinter der Vorschau weiter.
    document.documentElement.style.overflow = on ? 'hidden' : '';
  }

  el('f-fullscreen').addEventListener('click', function () {
    setFullPreview(!app.classList.contains('submit--full-preview'));
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && app.classList.contains('submit--full-preview')) {
      setFullPreview(false);
    }
  });

  // --- Vorschau / Markdown umschalten ---
  el('f-toggle-raw').addEventListener('click', function () {
    var raw = el('f-raw');
    var showing = raw.classList.toggle('submit__raw--visible');
    el('f-preview').classList.toggle('submit__hidden', showing);
    this.textContent = showing ? 'Vorschau anzeigen' : 'Markdown anzeigen';
  });

  // --- Mobiler Umschalter ---
  function showPane(which) {
    var isForm = which === 'form';
    el('submit-form').classList.toggle('submit__pane--hidden', !isForm);
    el('submit-preview-pane').classList.toggle('submit__pane--hidden', isForm);
    el('tab-form').classList.toggle('submit__tab--active', isForm);
    el('tab-preview').classList.toggle('submit__tab--active', !isForm);
  }

  el('tab-form').addEventListener('click', function () { showPane('form'); });
  el('tab-preview').addEventListener('click', function () { showPane('preview'); });

  // --- Aktionen ---
  el('submit-form').addEventListener('submit', onSubmit);
  el('f-download').addEventListener('click', downloadMarkdown);

  el('f-reset').addEventListener('click', function () {
    if (!window.confirm('Alle Eingaben verwerfen?')) return;
    // Zurücksetzen beginnt eine neue Einreichung: Sperre wieder lösen.
    submitted = false;
    el('f-submit').disabled = false;
    try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* egal */ }
    watched.forEach(function (id) { el(id).value = ''; });
    el('f-category').value = '';
    el('f-category-other').classList.add('submit__hidden');
    el('f-body').value = BODY_TEMPLATE;
    tags = [];
    renderTagChips();
    clearImage();
    clearStatus();
    document.querySelectorAll('.submit__field--invalid').forEach(function (f) {
      f.classList.remove('submit__field--invalid');
    });
    update();
  });

  updatePreview();
})();
