/* Here News "smart" helpers, shared by the site build (Node), the editor
 * preview and the reader's browser, so they always agree.
 *
 * - suggestCategory: picks a category from the title and text using the
 *   keywords listed for each category in Site Settings → Categories.
 * - suggestLocation: picks a covered city when the text mentions it (or one
 *   of its other names) in Site Settings → Locations.
 * - nearestLocation: the covered city a reader is in, from coordinates.
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HereSmart = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Title words count most, then subtitle/summary, then the body.
  var WEIGHTS = { title: 3, subtitle: 2, description: 2, body: 1 };
  var MIN_SCORE = 2;

  function lower(value) {
    return String(value || '').toLowerCase();
  }

  function escapeRegExp(value) {
    return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // Whole-word, case-insensitive count that also works for Arabic.
  function countMatches(text, phrase) {
    phrase = lower(phrase).trim();
    if (!phrase || !text) return 0;
    var re = new RegExp('(^|[^\\p{L}\\p{N}])' + escapeRegExp(phrase) + '(?=$|[^\\p{L}\\p{N}])', 'gu');
    var count = 0;
    while (re.exec(text)) count++;
    return count;
  }

  function stripMarkup(value) {
    return String(value || '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[#>*_`~|-]+/g, ' ');
  }

  function textParts(fields) {
    fields = fields || {};
    var parts = {};
    Object.keys(WEIGHTS).forEach(function (key) {
      parts[key] = lower(stripMarkup(fields[key]));
    });
    return parts;
  }

  function scoreTerms(parts, terms) {
    var score = 0;
    (terms || []).forEach(function (term) {
      Object.keys(WEIGHTS).forEach(function (key) {
        // A word repeated in the body counts at most 3 times.
        score += Math.min(countMatches(parts[key], term), 3) * WEIGHTS[key];
      });
    });
    return score;
  }

  function list(value) {
    if (!value) return [];
    if (Array.isArray(value)) return value;
    return String(value).split(',').map(function (s) { return s.trim(); }).filter(Boolean);
  }

  /* fields: { title, subtitle, description, body }
   * categories: [{ name, keywords: [...] }]
   * Returns { name, score } or null when nothing is a clear match. */
  function suggestCategory(fields, categories) {
    var parts = textParts(fields);
    var best = null;
    (categories || []).forEach(function (cat) {
      if (!cat || !cat.name) return;
      var score = scoreTerms(parts, list(cat.keywords));
      if (score >= MIN_SCORE && (!best || score > best.score)) best = { name: cat.name, score: score };
    });
    return best;
  }

  /* locations: [{ name, aliases: [...] }] */
  function suggestLocation(fields, locations) {
    var parts = textParts(fields);
    var best = null;
    (locations || []).forEach(function (loc) {
      if (!loc || !loc.name) return;
      var score = scoreTerms(parts, [loc.name].concat(list(loc.aliases)));
      if (score >= MIN_SCORE && (!best || score > best.score)) best = { name: loc.name, score: score };
    });
    return best;
  }

  // Decap's map widget stores a GeoJSON string: {"type":"Point","coordinates":[lng,lat]}
  function pointOf(loc) {
    var geo = loc && loc.point;
    if (typeof geo === 'string') {
      try { geo = JSON.parse(geo); } catch (e) { geo = null; }
    }
    var c = geo && geo.coordinates;
    if (c && c.length === 2 && isFinite(c[0]) && isFinite(c[1])) return { lat: Number(c[1]), lng: Number(c[0]) };
    return null;
  }

  function distanceKm(a, b) {
    var rad = Math.PI / 180;
    var dLat = (b.lat - a.lat) * rad;
    var dLng = (b.lng - a.lng) * rad;
    var h = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) * Math.sin(dLng / 2);
    return 6371 * 2 * Math.atan2(Math.sqrt(h), Math.sqrt(1 - h));
  }

  /* The covered location whose area (radius_km) contains the point, nearest first. */
  function nearestLocation(point, locations) {
    var best = null;
    (locations || []).forEach(function (loc) {
      var p = pointOf(loc);
      if (!p || !point) return;
      var d = distanceKm(point, p);
      var radius = Number(loc.radius_km) || 40;
      if (d <= radius && (!best || d < best.distance)) best = { location: loc, distance: d };
    });
    return best;
  }

  function sameName(a, b) {
    return lower(a).trim() !== '' && lower(a).trim() === lower(b).trim();
  }

  return {
    suggestCategory: suggestCategory,
    suggestLocation: suggestLocation,
    nearestLocation: nearestLocation,
    distanceKm: distanceKm,
    pointOf: pointOf,
    sameName: sameName
  };
});
