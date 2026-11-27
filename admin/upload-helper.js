/* Here News editor: make every upload safe before Decap sees it.
 *
 * 1. Unique file names. Decap asks "x already exists. Do you want to replace
 *    it?" when a name is reused: OK deletes the live file (breaking older
 *    articles that use it), Cancel drops the upload. Every file is renamed to
 *    "<name>-<date>-<time>.<ext>" so that question never comes up.
 * 2. Web-sized photos. Phone photos (4000×3000, 8–11 MB) are resized so the
 *    longest side is at most 2000px and saved as JPEG at 82% quality, usually
 *    under 1 MB. Smaller images, GIFs, SVGs and non-images are left as they are.
 *
 * It works by catching the file picker's "change" event before Decap does,
 * preparing the files, then handing the same event on to Decap. */
(function () {
  var MAX_SIDE = 2000;
  var JPEG_QUALITY = 0.82;
  var RESIZE_ABOVE_BYTES = 1.5 * 1024 * 1024;
  var DONE = '__hereUploadReady';

  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function stamp(d) {
    return d.getFullYear() + pad(d.getMonth() + 1) + pad(d.getDate()) + '-' +
      pad(d.getHours()) + pad(d.getMinutes()) + pad(d.getSeconds());
  }

  function splitName(name) {
    var dot = name.lastIndexOf('.');
    return dot > 0 ? { base: name.slice(0, dot), ext: name.slice(dot + 1).toLowerCase() } : { base: name, ext: '' };
  }

  function cleanBase(base) {
    var clean = base.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
      .toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50).replace(/-+$/, '');
    // Camera names like "20261122_150929" or "IMG_1234" say nothing; Arabic-only names become empty.
    if (!clean || /^(img|dsc|pxl|image|photo)?-?[0-9-]+$/.test(clean)) clean = 'photo';
    return clean;
  }

  function uniqueName(original, ext, index) {
    var parts = splitName(original);
    var e = ext || parts.ext;
    return cleanBase(parts.base) + '-' + stamp(new Date()) + (index ? '-' + (index + 1) : '') + (e ? '.' + e : '');
  }

  function canResize(file) {
    return /^image\/(jpeg|png|webp)$/i.test(file.type) && window.createImageBitmap && window.HTMLCanvasElement;
  }

  function toBlob(canvas, type, quality) {
    return new Promise(function (resolve) { canvas.toBlob(resolve, type, quality); });
  }

  // Returns { file, note } where file is the prepared File.
  function prepare(file, index) {
    if (!canResize(file)) {
      return Promise.resolve({ file: new File([file], uniqueName(file.name, null, index), { type: file.type, lastModified: file.lastModified }) });
    }
    return createImageBitmap(file, { imageOrientation: 'from-image' }).then(function (bitmap) {
      var w = bitmap.width, h = bitmap.height;
      var scale = Math.min(1, MAX_SIDE / Math.max(w, h));
      if (scale === 1 && file.size <= RESIZE_ABOVE_BYTES) {
        bitmap.close && bitmap.close();
        return { file: new File([file], uniqueName(file.name, null, index), { type: file.type, lastModified: file.lastModified }) };
      }
      var canvas = document.createElement('canvas');
      canvas.width = Math.round(w * scale);
      canvas.height = Math.round(h * scale);
      var ctx = canvas.getContext('2d');
      var isPng = /png$/i.test(file.type);
      if (!isPng) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height); }
      ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
      bitmap.close && bitmap.close();
      // PNGs (logos, infographics, transparency) stay PNG; photos become JPEG.
      var type = isPng ? 'image/png' : 'image/jpeg';
      return toBlob(canvas, type, isPng ? undefined : JPEG_QUALITY).then(function (blob) {
        if (!blob || blob.size >= file.size) {
          return { file: new File([file], uniqueName(file.name, null, index), { type: file.type, lastModified: file.lastModified }) };
        }
        var ext = isPng ? 'png' : 'jpg';
        var out = new File([blob], uniqueName(file.name, ext, index), { type: type, lastModified: Date.now() });
        return {
          file: out,
          note: 'Photo resized for the web: ' + mb(file.size) + ' \u2192 ' + mb(out.size) + ' (' + canvas.width + '\u00d7' + canvas.height + ')'
        };
      });
    }).catch(function () {
      // Couldn't read the image (e.g. an unusual format): just give it a unique name.
      return { file: new File([file], uniqueName(file.name, null, index), { type: file.type, lastModified: file.lastModified }) };
    });
  }

  function mb(bytes) {
    return bytes >= 1024 * 1024 ? (bytes / 1024 / 1024).toFixed(1) + ' MB' : Math.round(bytes / 1024) + ' KB';
  }

  var toastEl;
  function toast(text) {
    if (!text) return;
    if (!toastEl) {
      toastEl = document.createElement('div');
      toastEl.setAttribute('role', 'status');
      toastEl.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:100000;' +
        'background:#1f2933;color:#fff;padding:10px 16px;border-radius:999px;font:14px/1.4 -apple-system,Segoe UI,Arial,sans-serif;' +
        'box-shadow:0 6px 20px rgba(0,0,0,.25);transition:opacity .3s;max-width:90vw;text-align:center';
      document.body.appendChild(toastEl);
    }
    toastEl.textContent = text;
    toastEl.style.opacity = '1';
    clearTimeout(toastEl._t);
    toastEl._t = setTimeout(function () { toastEl.style.opacity = '0'; }, 5000);
  }

  document.addEventListener('change', function (event) {
    var input = event.target;
    if (!input || input.tagName !== 'INPUT' || input.type !== 'file') return;
    if (input[DONE]) { input[DONE] = false; return; } // our own re-sent event: let Decap have it
    var files = input.files ? Array.prototype.slice.call(input.files) : [];
    if (!files.length || !window.DataTransfer) return;
    // Hold the event back from Decap until the files are ready.
    event.stopImmediatePropagation();
    event.preventDefault();
    if (files.some(canResize)) toast('Preparing image\u2026');
    Promise.all(files.map(prepare)).then(function (results) {
      var dt = new DataTransfer();
      results.forEach(function (r) { dt.items.add(r.file); });
      try {
        input.files = dt.files;
      } catch (e) {
        // Browser won't let us swap files: send the originals so the upload still works.
      }
      var notes = results.map(function (r) { return r.note; }).filter(Boolean);
      toast(notes.join(' \u00b7 ') || (toastEl && toastEl.style.opacity === '1' ? 'Image ready' : ''));
      input[DONE] = true;
      input.dispatchEvent(new Event('change', { bubbles: true }));
    });
  }, true);
})();
