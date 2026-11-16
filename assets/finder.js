/* Here News search and date filter for publication lists.
 *
 * Search looks through every story's title, subtitle, summary, category,
 * tags, location, author and full text (from /search-index.json, built with
 * the site). Every word typed must appear somewhere; English and Arabic both
 * work, and Arabic letter variants (أ/إ/آ/ا, ة/ه, ى/ي, diacritics) match.
 * The date filter keeps stories from the last day/week/month/year or a
 * chosen range. Filters are kept in the address (?q=…&when=…) so a search
 * can be shared. */
(function () {
  var DAY = 24 * 60 * 60 * 1000;

  function normalize(value) {
    return String(value || '')
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')            // Latin accents
      .replace(/[ً-ٰٟـ]/g, '') // Arabic diacritics and tatweel
      .replace(/[أإآٱ]/g, 'ا')
      .replace(/ة/g, 'ه')
      .replace(/ى/g, 'ي')
      .replace(/[^\p{L}\p{N}]+/gu, ' ')
      .trim();
  }

  function words(query) {
    return normalize(query).split(' ').filter(Boolean);
  }

  // English words match from their start ("elect" finds "election" but
  // "rain" doesn't find "train"); Arabic matches anywhere in a word, so
  // "طقس" also finds "الطقس" and "بالطقس".
  function matches(text, term) {
    if (/[\u0600-\u06FF]/.test(term)) return text.indexOf(term) !== -1;
    return text.indexOf(' ' + term) !== -1;
  }

  function haystack(entry) {
    return ' ' + normalize([
      entry.title, entry.subtitle, entry.description, entry.category,
      (entry.topics || []).join(' '), entry.location, entry.author, entry.text
    ].join(' ')) + ' ';
  }

  function startOfDay(value) {
    var d = new Date(value + 'T00:00:00');
    return isNaN(d.getTime()) ? null : d.getTime();
  }

  function setup(form) {
    var grid = document.querySelector('[data-local-grid]');
    if (!grid) return;
    var q = form.querySelector('[data-finder-q]');
    var when = form.querySelector('[data-finder-when]');
    var range = form.querySelector('[data-finder-range]');
    var from = form.querySelector('[data-finder-from]');
    var to = form.querySelector('[data-finder-to]');
    var status = form.querySelector('[data-finder-status]');
    var empty = document.querySelector('[data-finder-empty]');
    var extras = document.querySelectorAll('.featured, .latest-title');
    var index = null;      // url -> normalized text, loaded on first search
    var loading = null;

    function loadIndex() {
      if (index || loading) return loading;
      loading = fetch('/search-index.json', { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : []; })
        .catch(function () { return []; })
        .then(function (entries) {
          index = {};
          entries.forEach(function (e) { index[e.url] = haystack(e); });
          return index;
        });
      return loading;
    }

    function dateBounds() {
      var v = when.value;
      if (!v) return null;
      if (v === 'range') {
        var a = from.value ? startOfDay(from.value) : null;
        var b = to.value ? startOfDay(to.value) : null;
        if (a === null && b === null) return null;
        return { min: a, max: b === null ? null : b + DAY };
      }
      return { min: Date.now() - Number(v) * DAY, max: null };
    }

    function cardText(card) {
      // Fallback before the index loads (or if it fails): what the card shows.
      return ' ' + normalize(card.textContent) + ' ';
    }

    function apply() {
      var terms = words(q.value);
      var bounds = dateBounds();
      range.hidden = when.value !== 'range';
      var active = terms.length > 0 || !!bounds;
      var cards = grid.querySelectorAll('.publication-card');
      var shown = 0;
      for (var i = 0; i < cards.length; i++) {
        var card = cards[i];
        var ok = true;
        if (bounds) {
          var t = Date.parse(card.getAttribute('data-date'));
          if (isNaN(t) || (bounds.min !== null && t < bounds.min) || (bounds.max !== null && t >= bounds.max)) ok = false;
        }
        if (ok && terms.length) {
          var text = (index && index[card.getAttribute('data-url')]) || cardText(card);
          for (var j = 0; j < terms.length; j++) {
            if (!matches(text, terms[j])) { ok = false; break; }
          }
        }
        card.hidden = !ok;
        if (ok) shown++;
      }
      var ads = grid.querySelectorAll('.ad-slot');
      for (var k = 0; k < ads.length; k++) ads[k].style.display = active ? 'none' : '';
      for (var m = 0; m < extras.length; m++) extras[m].hidden = active;
      if (empty) empty.hidden = !active || shown > 0;
      status.textContent = active ? (shown === 1 ? '1 story' : shown + ' stories') : '';
      remember(terms.length ? q.value.trim() : '');
    }

    function remember(query) {
      if (!window.history || !history.replaceState) return;
      var params = new URLSearchParams(window.location.search);
      ['q', 'when', 'from', 'to'].forEach(function (k) { params.delete(k); });
      if (query) params.set('q', query);
      if (when.value) params.set('when', when.value);
      if (when.value === 'range') {
        if (from.value) params.set('from', from.value);
        if (to.value) params.set('to', to.value);
      }
      var qs = params.toString();
      history.replaceState(null, '', window.location.pathname + (qs ? '?' + qs : '') + window.location.hash);
    }

    function onSearchInput() {
      apply();
      if (words(q.value).length) {
        var p = loadIndex();
        if (p) p.then(apply);
      }
    }

    // Restore filters from the address, e.g. a shared search link.
    var params = new URLSearchParams(window.location.search);
    q.value = params.get('q') || '';
    when.value = params.get('when') || '';
    if (when.selectedIndex < 0) when.value = '';
    from.value = params.get('from') || '';
    to.value = params.get('to') || '';

    var timer;
    q.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(onSearchInput, 120); });
    q.addEventListener('focus', loadIndex);
    [when, from, to].forEach(function (el) { el.addEventListener('change', apply); });

    form.hidden = false;
    if (q.value || when.value) onSearchInput();
  }

  function run() {
    if (!window.fetch || !window.URLSearchParams) return;
    var form = document.querySelector('[data-finder]');
    if (form) setup(form);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
