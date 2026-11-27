/* Here News "Support" buttons, using the Thigmo donation widget.
 *
 * The widget (thigmos.com/embed/donations-widget.js, layout "modal") adds one
 * floating "Donate Now" button that opens its donation pop-up. It has no
 * public API, so any element with data-donate simply presses that button.
 * If the widget can't load (blocked, offline), the button emails us instead.
 *
 * Google Analytics events (via track.js): donate_open (where: floating or
 * the button's label) and donate_checkout (when a donation amount is chosen
 * and Thigmo's checkout opens). */
(function () {
  var FLOATING = '.thigmo-donation-floating-btn';
  var FALLBACK = 'mailto:thehonanews@gmail.com?subject=' + encodeURIComponent('Supporting Here News');

  function track(event, data) {
    if (typeof window.hereTrack === 'function') window.hereTrack(event, data || {});
  }

  // The widget creates its button once the page has loaded; wait up to ~5 s.
  function whenWidgetReady(done) {
    var tries = 0;
    (function look() {
      var btn = document.querySelector(FLOATING);
      if (btn || tries++ > 25) return done(btn);
      setTimeout(look, 200);
    })();
  }

  document.addEventListener('click', function (event) {
    var el = event.target.closest && event.target.closest('[data-donate], ' + FLOATING + ', .thigmo-cta');
    if (!el) return;
    if (el.matches('.thigmo-cta')) {
      track('donate_checkout', { amount_text: (el.textContent || '').trim().slice(0, 40) });
      return;
    }
    if (el.matches(FLOATING)) {
      // Real clicks on the floating button (ours pass through with a flag).
      if (!el.__hereFromSupport) track('donate_open', { where: 'floating' });
      el.__hereFromSupport = false;
      return;
    }
    event.preventDefault();
    var label = (el.getAttribute('data-donate') || el.textContent || '').trim().slice(0, 60);
    whenWidgetReady(function (btn) {
      if (btn) {
        track('donate_open', { where: label });
        btn.__hereFromSupport = true;
        btn.click();
      } else {
        track('donate_open', { where: label, fallback: 'email' });
        window.location.href = FALLBACK;
      }
    });
  });
})();
