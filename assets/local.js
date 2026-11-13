/* Here News, localised: "Here News" becomes "Here Springfield" (or the
 * reader's city) and stories from the reader's area move to the top.
 *
 * Where the reader is comes from, in order:
 *   1. the area they picked in the "Local stories" menu (remembered on this device);
 *   2. an approximate, city-level lookup of their IP address (get.geojs.io),
 *      skipped when the browser sends Do Not Track / Global Privacy Control.
 * Nothing is sent to Here News and nothing is stored anywhere but the
 * reader's own browser. Covered areas are listed in Site Settings → Locations. */
(function () {
  var CHOICE_KEY = 'here.place';
  var GEO_KEY = 'here.geo';
  var GEO_TTL = 24 * 60 * 60 * 1000;
  var EVERYWHERE = '__everywhere__';

  function read(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function write(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (e) { /* private mode: just don't remember */ }
  }

  function getJSON(url, timeoutMs) {
    return new Promise(function (resolve) {
      var finished = false;
      var timer = setTimeout(function () { finished = true; resolve(null); }, timeoutMs);
      fetch(url, { credentials: 'omit' })
        .then(function (r) { return r.ok ? r.json() : null; })
        .then(function (j) { if (!finished) { clearTimeout(timer); resolve(j); } })
        .catch(function () { if (!finished) { clearTimeout(timer); resolve(null); } });
    });
  }

  function optedOut() {
    return navigator.globalPrivacyControl === true || navigator.doNotTrack === '1' || window.doNotTrack === '1';
  }

  function detect() {
    var cached = read(GEO_KEY);
    if (cached && cached.t && Date.now() - cached.t < GEO_TTL) return Promise.resolve(cached);
    if (optedOut()) return Promise.resolve(null);
    return getJSON('https://get.geojs.io/v1/ip/geo.json', 3000).then(function (j) {
      if (!j) return null;
      var geo = {
        city: j.city || '',
        lat: parseFloat(j.latitude),
        lng: parseFloat(j.longitude),
        t: Date.now()
      };
      write(GEO_KEY, geo);
      return geo;
    });
  }

  function findLocation(locations, name) {
    for (var i = 0; i < locations.length; i++) {
      if (window.HereSmart.sameName(locations[i].name, name)) return locations[i];
    }
    return null;
  }

  // Decide what to call the reader's place, and whether we cover it.
  function resolvePlace(locations) {
    var choice = read(CHOICE_KEY);
    if (choice === EVERYWHERE) return Promise.resolve({ name: '', covered: null, chosen: true });
    if (choice) {
      var picked = findLocation(locations, choice);
      if (picked) return Promise.resolve({ name: picked.name, covered: picked, chosen: true });
    }
    return detect().then(function (geo) {
      if (!geo) return { name: '', covered: null };
      var near = isFinite(geo.lat) && isFinite(geo.lng)
        ? window.HereSmart.nearestLocation({ lat: geo.lat, lng: geo.lng }, locations)
        : null;
      if (near) return { name: near.location.name, covered: near.location };
      return { name: geo.city, covered: null };
    });
  }

  function setBrand(name) {
    var spans = document.querySelectorAll('[data-here-place]');
    for (var i = 0; i < spans.length; i++) spans[i].textContent = name || 'News';
  }

  // Local stories first (pinned stories keep their place at the very top).
  function reorder(grid, covered) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.publication-card[data-location]'));
    if (!cards.length) return;
    var pinned = [], local = [], rest = [];
    cards.forEach(function (card) {
      if (card.getAttribute('data-pinned') === 'true') pinned.push(card);
      else if (covered && window.HereSmart.sameName(card.getAttribute('data-location'), covered.name)) local.push(card);
      else rest.push(card);
    });
    // Tag local stories only when it tells them apart from the others.
    if (local.length < cards.length) local.forEach(function (card) {
      var meta = card.querySelector('.publication-meta');
      if (meta && !meta.querySelector('.near-you')) {
        var tag = document.createElement('span');
        tag.className = 'near-you';
        tag.textContent = 'Near you';
        meta.insertBefore(tag, meta.firstChild);
      }
    });
    var ad = grid.querySelector('.ad-slot--listing');
    var ordered = pinned.concat(local, rest);
    ordered.forEach(function (card) { grid.appendChild(card); });
    if (ad) grid.insertBefore(ad, ordered[3] || null);
  }

  function renderBar(bar, locations, place) {
    if (!locations.length) return;
    var label = document.createElement('label');
    label.textContent = 'Local stories: ';
    var select = document.createElement('select');
    var current = place.covered ? place.covered.name : EVERYWHERE;
    locations.forEach(function (loc) {
      var opt = document.createElement('option');
      opt.value = loc.name;
      opt.textContent = loc.name + (loc.region ? ', ' + loc.region : '');
      select.appendChild(opt);
    });
    var all = document.createElement('option');
    all.value = EVERYWHERE;
    all.textContent = 'Everywhere (newest first)';
    select.appendChild(all);
    select.value = current;
    select.addEventListener('change', function () {
      write(CHOICE_KEY, select.value);
      window.location.reload();
    });
    label.appendChild(select);
    bar.appendChild(label);
    bar.hidden = false;
  }

  function run() {
    if (!window.HereSmart || !window.fetch || !window.Promise) return;
    getJSON('/data/locations.json', 3000).then(function (data) {
      var locations = (data && data.locations) || [];
      return resolvePlace(locations).then(function (place) {
        setBrand(place.name);
        var grid = document.querySelector('[data-local-grid]');
        if (grid && place.covered) reorder(grid, place.covered);
        var bar = document.querySelector('[data-local-bar]');
        if (bar) renderBar(bar, locations, place);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
