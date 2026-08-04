// Client-side search
(function () {
  var overlay = document.getElementById('search-overlay');
  var input = document.getElementById('search-input');
  var results = document.getElementById('search-results');
  var openBtn = document.getElementById('search-open');
  var mobileOpenBtn = document.getElementById('mobile-search-open');
  var closeBtn = document.getElementById('search-close');

  if (!overlay || !input) return;

  var index = null;

  function loadIndex() {
    if (index !== null) return Promise.resolve(index);
    return fetch('/index.json')
      .then(function (r) { return r.json(); })
      .then(function (data) {
        index = data;
        return data;
      })
      .catch(function () {
        index = [];
        return [];
      });
  }

  function openSearch() {
    overlay.classList.add('is-open');
    input.value = '';
    input.focus();
    results.innerHTML = '<div class="search-modal__empty">Suchbegriff eingeben...</div>';
    loadIndex();
    document.body.style.overflow = 'hidden';
  }

  function closeSearch() {
    overlay.classList.remove('is-open');
    document.body.style.overflow = '';
  }

  function search(query) {
    if (!query || query.length < 2) {
      results.innerHTML = '<div class="search-modal__empty">Suchbegriff eingeben...</div>';
      return;
    }

    loadIndex().then(function (data) {
      var tokens = query.toLowerCase().split(/\s+/);
      var matches = data.filter(function (item) {
        var text = (item.title + ' ' + item.content + ' ' + (item.tags || []).join(' ')).toLowerCase();
        return tokens.every(function (t) { return text.indexOf(t) !== -1; });
      });

      if (!matches.length) {
        results.innerHTML = '<div class="search-modal__empty">Keine Ergebnisse gefunden</div>';
        return;
      }

      results.innerHTML = matches.slice(0, 10).map(function (item) {
        return '<a href="' + item.permalink + '" class="search-result">' +
          '<div class="search-result__title">' + escapeHtml(item.title) + '</div>' +
          '<div class="search-result__excerpt">' + escapeHtml(item.summary) + '</div>' +
          '</a>';
      }).join('');
    });
  }

  function escapeHtml(str) {
    var div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  if (openBtn) openBtn.addEventListener('click', openSearch);
  if (mobileOpenBtn) mobileOpenBtn.addEventListener('click', openSearch);
  if (closeBtn) closeBtn.addEventListener('click', closeSearch);

  overlay.addEventListener('click', function (e) {
    if (e.target === overlay) closeSearch();
  });

  document.addEventListener('keydown', function (e) {
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      overlay.classList.contains('is-open') ? closeSearch() : openSearch();
    }
    if (e.key === 'Escape') closeSearch();
  });

  input.addEventListener('input', function () {
    search(input.value);
  });
})();
