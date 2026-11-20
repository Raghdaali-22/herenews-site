/* Here News, localised: the homepage headline becomes "Here Springfield."
 * (or the reader's city) and stories from the reader's area move to the top.
 *
 * Where the reader is comes from, in order:
 *   1. the area they picked in the "Local stories" menu (remembered on this
 *      device; only while the menu is switched on in Site Settings);
 *   2. an approximate, city-level lookup of their IP address (get.geojs.io),
 *      skipped when the browser sends Do Not Track / Global Privacy Control.
 * The reader's location is not sent to Here News; it is only kept in the
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

  // A reader's position from their internet address is only approximate,
  // often a few km off. So readers are matched to areas Here News actually
  // has stories from first: within SNAP_KM of one, they get that area.
  // (Mount Vernon's centre is ~10 km from Springfield's, so a Springfield
  // reader placed near Mount Vernon still gets "Here Springfield.")
  var SNAP_KM = 12;

  function nameMatches(loc, city) {
    if (!city) return false;
    if (window.HereSmart.sameName(loc.name, city)) return true;
    return (loc.aliases || []).some(function (a) { return window.HereSmart.sameName(a, city); });
  }

  // Nearest location to the point: within maxKm if given, else within its own area size.
  function nearest(point, list, maxKm) {
    var best = null;
    list.forEach(function (loc) {
      var p = window.HereSmart.pointOf(loc);
      if (!p) return;
      var d = window.HereSmart.distanceKm(point, p);
      var limit = maxKm === undefined ? (Number(loc.radius_km) || 8) : Math.max(maxKm, Number(loc.radius_km) || 0);
      if (d <= limit && (!best || d < best.d)) best = { loc: loc, d: d };
    });
    return best && best.loc;
  }

  // Decide what to call the reader's place, and whether we cover it.
  function resolvePlace(locations, menuOn) {
    var choice = menuOn ? read(CHOICE_KEY) : null;  // menu off: earlier picks don't apply
    if (choice === EVERYWHERE) return Promise.resolve({ name: '', covered: null, point: null, chosen: true });
    if (choice) {
      var picked = findLocation(locations, choice);
      if (picked) return Promise.resolve({ name: picked.name, covered: picked, point: window.HereSmart.pointOf(picked), chosen: true });
    }
    var active = locations.filter(function (loc) { return loc.stories > 0; });
    if (!active.length) active = locations;
    return detect().then(function (geo) {
      if (!geo) return { name: '', covered: null, point: null };
      var point = isFinite(geo.lat) && isFinite(geo.lng) ? { lat: geo.lat, lng: geo.lng } : null;
      // 1. The lookup names a city we have stories from.
      var loc = active.filter(function (l) { return nameMatches(l, geo.city); })[0];
      // 2. Close to an area we have stories from.
      if (!loc && point) loc = nearest(point, active, SNAP_KM);
      // 3. Inside another covered area (no stories there yet).
      if (!loc && point) loc = nearest(point, locations);
      if (loc) return { name: loc.name, covered: loc, point: point || window.HereSmart.pointOf(loc) };
      return { name: geo.city, covered: null, point: point };
    });
  }

  // On the homepage, "Stories worth telling." becomes "Here Springfield."
  function setHeadline(name) {
    var h = document.querySelector('[data-here-headline]');
    if (!h) return;
    if (!h.hasAttribute('data-default')) h.setAttribute('data-default', h.textContent);
    h.textContent = name ? 'Here ' + name + '.' : h.getAttribute('data-default');
  }

  // Show the city's banner (Site Settings → Locations → Banner image) next to
  // the headline, only once the picture has loaded so nothing jumps around.
  function setBanner(location) {
    var figure = document.querySelector('[data-here-banner]');
    var hero = document.querySelector('[data-here-hero]');
    if (!figure || !hero) return;
    var src = location && location.banner;
    if (!src) { figure.hidden = true; hero.classList.remove('has-banner'); return; }
    var img = figure.querySelector('img');
    img.onload = function () { figure.hidden = false; hero.classList.add('has-banner'); };
    img.alt = location.name + (location.region ? ', ' + location.region : '');
    img.src = src;
  }

  // Stories within this distance of the reader count as "near you", so a
  // reader in Alexandria also sees Springfield stories first.
  var NEARBY_KM = 20;

  // Local stories first, nearest first (pinned stories keep the very top).
  function reorder(grid, place, locations) {
    var cards = Array.prototype.slice.call(grid.querySelectorAll('.publication-card[data-location]'));
    if (!cards.length) return;
    var pinned = [], local = [], rest = [];
    var distance = {};
    cards.forEach(function (card) {
      var name = card.getAttribute('data-location');
      var loc = name ? findLocation(locations, name) : null;
      var p = loc ? window.HereSmart.pointOf(loc) : null;
      var d = p && place.point ? window.HereSmart.distanceKm(place.point, p) : Infinity;
      if (place.covered && window.HereSmart.sameName(name, place.covered.name)) d = 0;
      distance[cards.indexOf(card)] = d;
      if (card.getAttribute('data-pinned') === 'true') pinned.push(card);
      else if (d <= NEARBY_KM) local.push(card);
      else rest.push(card);
    });
    // Nearest first; stories at the same distance keep their newest-first order.
    local.sort(function (a, b) {
      return (distance[cards.indexOf(a)] - distance[cards.indexOf(b)]) || (cards.indexOf(a) - cards.indexOf(b));
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
    // Group by state/region (Virginia, DC, Maryland, ...), A–Z within each.
    var REGION_NAMES = { VA: 'Virginia', DC: 'Washington, DC', MD: 'Maryland' };
    var groups = {};
    var order = [];
    locations.forEach(function (loc) {
      var key = loc.region || '';
      if (!groups[key]) { groups[key] = []; order.push(key); }
      groups[key].push(loc);
    });
    order.forEach(function (key) {
      var parent = select;
      if (key && order.length > 1) {
        parent = document.createElement('optgroup');
        parent.label = REGION_NAMES[key] || key;
        select.appendChild(parent);
      }
      groups[key].slice().sort(function (a, b) { return a.name.localeCompare(b.name); }).forEach(function (loc) {
        var opt = document.createElement('option');
        opt.value = loc.name;
        opt.textContent = loc.name + (loc.region && loc.region !== loc.name ? ', ' + loc.region : '');
        parent.appendChild(opt);
      });
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
    getJSON('/data/places.json', 3000).then(function (data) {
      var locations = (data && data.locations) || [];
      var menuOn = !!(data && data.show_menu);
      return resolvePlace(locations, menuOn).then(function (place) {
        setHeadline(place.name);
        setBanner(place.covered);
        var grid = document.querySelector('[data-local-grid]');
        if (grid && place.point) reorder(grid, place, locations);
        var bar = document.querySelector('[data-local-bar]');
        // Local stories menu: Site Settings > Locations > Show menu.
        if (bar && menuOn) renderBar(bar, locations, place);
      });
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
