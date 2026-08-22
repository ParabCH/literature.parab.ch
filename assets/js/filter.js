// Filter auf der Beitragsübersicht: Kategorien und Themen als
// Mehrfachauswahl. Ohne dieses Skript bleiben die Chips Links auf die
// Taxonomie-Seiten — deshalb werden sie hier erst zu Schaltern umgebaut.
//
// Kategorien verknüpfen sich mit ODER (Buch oder Paper), Themen mit UND
// (wer zwei Themen wählt, will die Schnittmenge).
(function () {
  var root = document.querySelector('[data-filter]');
  var grid = document.querySelector('[data-filter-grid]');
  if (!root || !grid) return;

  var cells = [].slice.call(grid.querySelectorAll('.post-grid__cell'));
  var catChips = [].slice.call(root.querySelectorAll('[data-filter-cat]'));
  var tagChips = [].slice.call(root.querySelectorAll('[data-filter-tag]'));
  var more = root.querySelector('[data-filter-more]');
  var statusBar = root.querySelector('[data-filter-status]');
  var countBox = root.querySelector('[data-filter-count]');
  var empty = document.querySelector('[data-filter-empty]');

  var cats = [];
  var tags = [];

  function toggle(list, value) {
    var i = list.indexOf(value);
    if (i === -1) list.push(value); else list.splice(i, 1);
  }

  function words(cell, attr) {
    var v = cell.getAttribute(attr);
    return v ? v.split(' ') : [];
  }

  function matches(cell) {
    var cc = words(cell, 'data-cats');
    var ct = words(cell, 'data-tags');
    var catOk = !cats.length || cats.some(function (c) { return cc.indexOf(c) !== -1; });
    var tagOk = tags.every(function (t) { return ct.indexOf(t) !== -1; });
    return catOk && tagOk;
  }

  function apply() {
    var shown = 0;
    cells.forEach(function (cell) {
      var ok = matches(cell);
      cell.hidden = !ok;
      if (ok) shown++;
    });

    catChips.forEach(function (chip) {
      chip.classList.toggle('chip--active', cats.indexOf(chip.getAttribute('data-filter-cat')) !== -1);
    });
    tagChips.forEach(function (chip) {
      chip.classList.toggle('chip--active', tags.indexOf(chip.getAttribute('data-filter-tag')) !== -1);
    });

    var active = cats.length || tags.length;
    statusBar.hidden = !active;
    if (active) {
      countBox.textContent = shown + ' von ' + cells.length + ' ' +
        (cells.length === 1 ? 'Beitrag' : 'Beiträgen');
    }
    if (empty) empty.hidden = shown > 0;

    // Auswahl in die Adresszeile, damit sie teilbar und neuladefest ist.
    var params = new URLSearchParams();
    if (cats.length) params.set('kategorie', cats.join(','));
    if (tags.length) params.set('thema', tags.join(','));
    var qs = params.toString();
    history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
  }

  function wire(chips, attr, list) {
    chips.forEach(function (chip) {
      chip.addEventListener('click', function (ev) {
        ev.preventDefault();
        toggle(list, chip.getAttribute(attr));
        apply();
      });
    });
  }

  wire(catChips, 'data-filter-cat', cats);
  wire(tagChips, 'data-filter-tag', tags);

  root.querySelector('[data-filter-reset]').addEventListener('click', function () {
    cats.length = 0;
    tags.length = 0;
    apply();
  });

  // Erst mit Skript wird die Themenliste eingeklappt: ohne JavaScript gäbe
  // es keinen Weg, sie wieder aufzuklappen.
  if (more) {
    root.classList.add('filter--js');
    more.hidden = false;
    more.addEventListener('click', function () {
      var expanded = root.classList.toggle('filter--expanded');
      more.textContent = more.getAttribute(expanded ? 'data-less-label' : 'data-more-label');
    });
  }

  // Auswahl aus der Adresszeile übernehmen (geteilte Links, Neuladen).
  var params = new URLSearchParams(location.search);
  (params.get('kategorie') || '').split(',').forEach(function (c) {
    if (c) cats.push(c);
  });
  (params.get('thema') || '').split(',').forEach(function (t) {
    if (t) tags.push(t);
  });
  // Ein gewähltes Thema jenseits der Vorschau braucht die volle Liste.
  if (more && tags.some(function (t) {
    var chip = root.querySelector('[data-filter-tag="' + t + '"]');
    return chip && chip.classList.contains('filter__overflow');
  })) {
    more.click();
  }
  if (cats.length || tags.length) apply();
})();
