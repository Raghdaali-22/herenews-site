/* Here News ad slots: shows the best candidate whose campaign is running now.
 * Candidates are already ranked (priority, then relevance) at build time;
 * this only applies start/end dates so campaigns switch on and off by
 * themselves between site rebuilds. No tracking, no cookies. */
(function () {
  function run() {
    var now = Date.now();
    var shown = {};
    // Fill the most visible slots first.
    var order = { sidebar: 1, 'in-article': 2, listing: 3, bottom: 4 };
    var rank = function (slot) { return order[slot.getAttribute('data-ad-slot')] || 9; };
    var slots = Array.prototype.slice.call(document.querySelectorAll('[data-ad-slot]'))
      .sort(function (a, b) {
        return rank(a) - rank(b);
      });
    for (var i = 0; i < slots.length; i++) {
      var slot = slots[i];
      var ads = slot.querySelectorAll('.ad');
      var pick = null;
      for (var j = 0; j < ads.length; j++) {
        var ad = ads[j];
        var start = ad.getAttribute('data-ad-start');
        var end = ad.getAttribute('data-ad-end');
        if (start && Date.parse(start) > now) continue;
        if (end && Date.parse(end) <= now) continue;
        // Show each campaign at most once per page.
        if (shown[ad.getAttribute('data-ad-id')]) continue;
        pick = ad;
        break;
      }
      if (!pick) { slot.parentNode.removeChild(slot); continue; }
      shown[pick.getAttribute('data-ad-id')] = true;
      pick.hidden = false;
      slot.hidden = false;
    }
    // Collapse the article sidebar if nothing is left in it.
    var asides = document.querySelectorAll('.article-aside');
    for (var k = 0; k < asides.length; k++) {
      if (!asides[k].children.length) {
        var layout = asides[k].parentNode;
        layout.removeChild(asides[k]);
        layout.classList.remove('has-aside');
      }
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', run);
  else run();
})();
