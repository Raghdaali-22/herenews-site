/* Here News measurement: sends events straight to Google Analytics
 * (G-ZB2RCDRFNX, loaded on every page) with gtag(). Don't also add a GA4
 * event tag for these in Tag Manager, or they'll be counted twice.
 * Nothing here identifies a reader; see /privacy.html.
 *
 * Events (all carry page_path):
 *   ad_impression   an ad became visible    ad_id, ad_advertiser, ad_slot
 *   ad_click        an ad was clicked       ad_id, ad_advertiser, ad_slot, link_url
 *   outbound_click  a link off the site     link_url, link_domain, link_text, link_kind
 *   search          site search used        search_term, search_results
 *   read_progress   article read to 25/50/75/100%   percent, article_title
 *
 * Links to other websites also get "came from Here News" labels
 * (utm_source=herenews.net, utm_medium, utm_campaign) so businesses see the
 * visits we send them in their own analytics. */
(function () {
  var SITE_HOST = 'herenews.net';
  // Don't add labels to links where they're pointless or could break things.
  var NO_UTM = /(^|\.)(google\.[a-z.]+|goo\.gl|youtube\.com|youtu\.be|facebook\.com|instagram\.com|linkedin\.com|x\.com|twitter\.com|wikipedia\.org|whatsapp\.com|wa\.me|apple\.com|github\.com|decapbridge\.com)$/i;

  window.dataLayer = window.dataLayer || [];
  function send(event, data) {
    data = data || {};
    data.page_path = window.location.pathname;
    if (typeof window.gtag === 'function') window.gtag('event', event, data);
  }
  window.hereTrack = send;

  function pageSlug() {
    var parts = window.location.pathname.split('/').filter(Boolean);
    return parts.length ? parts[parts.length - 1].replace(/\.html$/, '') : 'home';
  }

  function adInfo(el) {
    var ad = el.closest && el.closest('.ad');
    if (!ad) return null;
    var slot = ad.closest('[data-ad-slot]');
    var label = ad.querySelector('.ad-label');
    return {
      ad_id: ad.getAttribute('data-ad-id') || '',
      ad_advertiser: ad.getAttribute('data-ad-advertiser') || (label ? label.textContent.replace(/^.*\u00b7\s*/, '').trim() : ''),
      ad_slot: slot ? slot.getAttribute('data-ad-slot') : ''
    };
  }

  // ---- "Came from Here News" labels on outbound links ----
  function tagUrl(href, medium) {
    var url;
    try { url = new URL(href, window.location.href); } catch (e) { return href; }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return href;
    if (url.hostname === SITE_HOST || url.hostname.slice(-SITE_HOST.length - 1) === '.' + SITE_HOST) return href;
    if (url.hostname === window.location.hostname || NO_UTM.test(url.hostname)) return href;
    if (url.searchParams.has('utm_source')) return href;
    url.searchParams.set('utm_source', SITE_HOST);
    url.searchParams.set('utm_medium', medium);
    url.searchParams.set('utm_campaign', pageSlug());
    return url.toString();
  }

  // ---- Clicks ----
  document.addEventListener('click', function (event) {
    var link = event.target.closest && event.target.closest('a[href]');
    if (!link) return;
    var url;
    try { url = new URL(link.getAttribute('href'), window.location.href); } catch (e) { return; }
    var external = (url.protocol === 'http:' || url.protocol === 'https:') && url.hostname !== window.location.hostname;
    var kind = url.protocol === 'tel:' ? 'phone' : url.protocol === 'mailto:' ? 'email' : external ? 'website' : '';
    var ad = adInfo(link);
    if (ad) {
      link.setAttribute('href', tagUrl(link.getAttribute('href'), 'sponsored'));
      ad.link_url = url.href;
      send('ad_click', ad);
      return;
    }
    if (!kind) return; // internal navigation is already a page view
    if (external) link.setAttribute('href', tagUrl(link.getAttribute('href'), 'referral'));
    send('outbound_click', {
      link_url: url.href,
      link_domain: url.hostname || url.protocol.replace(':', ''),
      link_text: (link.textContent || '').trim().slice(0, 100),
      link_kind: link.getAttribute('data-track-kind') || kind
    });
  }, true);

  // ---- Ad impressions (counted once per ad per page, when at least half is on screen) ----
  function watchAds() {
    if (!('IntersectionObserver' in window)) return;
    var seen = {};
    var observer = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var info = adInfo(entry.target);
        var key = info && info.ad_id + '|' + info.ad_slot;
        if (info && !seen[key]) { seen[key] = true; send('ad_impression', info); }
        observer.unobserve(entry.target);
      });
    }, { threshold: 0.5 });
    var ads = document.querySelectorAll('.ad');
    for (var i = 0; i < ads.length; i++) observer.observe(ads[i]);
  }

  // ---- How far people read an article ----
  function watchReading() {
    var body = document.querySelector('.publication-article');
    if (!body) return;
    var title = (document.querySelector('.publication-article h1') || {}).textContent || document.title;
    var marks = [25, 50, 75, 100];
    var sent = {};
    function check() {
      var rect = body.getBoundingClientRect();
      var total = rect.height - window.innerHeight * 0.5;
      var read = total > 0 ? (window.innerHeight * 0.5 - rect.top) / total * 100 : 100;
      marks.forEach(function (m) {
        if (read >= m && !sent[m]) { sent[m] = true; send('read_progress', { percent: m, article_title: title.trim() }); }
      });
    }
    var ticking = false;
    window.addEventListener('scroll', function () {
      if (ticking) return;
      ticking = true;
      setTimeout(function () { ticking = false; check(); }, 250);
    }, { passive: true });
    check();
  }

  // ---- Site search (sent once a search settles, once per term) ----
  function watchSearch() {
    var input = document.querySelector('[data-finder-q]');
    if (!input) return;
    var timer, last = '';
    input.addEventListener('input', function () {
      clearTimeout(timer);
      timer = setTimeout(function () {
        var term = input.value.trim().toLowerCase();
        if (term.length < 3 || term === last) return;
        last = term;
        var status = document.querySelector('[data-finder-status]');
        var n = status ? parseInt(status.textContent, 10) : NaN;
        send('search', { search_term: term, search_results: isNaN(n) ? null : n });
      }, 1200);
    });
  }

  function run() {
    // ads.js decides which ad to show on DOMContentLoaded; look after that.
    setTimeout(watchAds, 0);
    watchReading();
    watchSearch();
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
