/* Here News editor previews: mirror the published templates
 * (article-pages.njk, templates/article-blocks.njk, templates/ad-slot.njk)
 * using the site's own stylesheet. No build tooling required. */
(function () {
  if (!window.CMS || !window.React) return;
  var h = window.React.createElement;
  window.CMS.registerPreviewStyle('/assets/styles.css');
  window.CMS.registerPreviewStyle('/admin/preview.css');

  var LABELS = {
    en: { all: 'All publications', by: 'By', source: 'Source', credits: 'Credits', tags: 'Tags', series: 'Part of the series', part: 'Part', article: 'Article', advertisement: 'Advertisement', sponsoredBy: 'Sponsored by' },
    ar: { all: 'كل المنشورات', by: 'بقلم', source: 'المصدر', credits: 'إسهامات', tags: 'الوسوم', series: 'جزء من سلسلة', part: 'الجزء', article: 'مقال', advertisement: 'إعلان', sponsoredBy: 'برعاية' }
  };

  function toJS(value) {
    return value && value.toJS ? value.toJS() : value;
  }
  function asset(props, path) {
    if (!path) return '';
    try { return props.getAsset ? String(props.getAsset(path)) : path; } catch (e) { return path; }
  }
  function slugify(value) {
    return String(value || '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLowerCase().trim()
      .replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '');
  }
  function formatDate(value, lang) {
    if (!value) return '';
    var d = new Date(value);
    if (isNaN(d.getTime())) return '';
    return new Intl.DateTimeFormat(lang === 'ar' ? 'ar-EG' : 'en-US', { year: 'numeric', month: 'long', day: 'numeric', timeZone: 'UTC' }).format(d);
  }
  function paragraphs(text, className) {
    return String(text || '').split(/\n\s*\n/).map(function (p) { return p.trim(); }).filter(Boolean)
      .map(function (p, i) { return h('p', { key: i, className: className, dir: 'auto' }, p); });
  }
  function videoEmbed(value) {
    try {
      var u = new URL(value);
      var host = u.hostname.replace(/^www\./, '').replace(/^m\./, '');
      var id = '';
      if (host === 'youtube.com') {
        if (u.pathname === '/watch') id = u.searchParams.get('v') || '';
        else if (/^\/(shorts|embed|live)\//.test(u.pathname)) id = u.pathname.split('/')[2];
      } else if (host === 'youtu.be') id = u.pathname.slice(1);
      if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return 'https://www.youtube-nocookie.com/embed/' + id;
      if (host === 'vimeo.com' || host === 'player.vimeo.com') {
        var m = u.pathname.match(/(\d{6,})/);
        if (m) return 'https://player.vimeo.com/video/' + m[1];
      }
    } catch (e) { /* not a URL yet */ }
    return '';
  }
  function caption(text, credit, className) {
    if (!text && !credit) return null;
    return h('figcaption', { className: className, dir: 'auto' }, text || '', credit ? h('span', { className: 'credit' }, ' ' + credit) : null);
  }

  function renderBlock(props, block, widgets, i) {
    var b = toJS(block) || {};
    switch (b.type) {
      case 'text':
        return h('div', { key: i, className: 'preview-text-block' }, widgets && widgets.get('body'));
      case 'heading':
        return b.text ? h(b.level === 'h3' ? 'h3' : 'h2', { key: i, className: 'block-heading', dir: 'auto' }, b.text) : null;
      case 'image':
        return b.image ? h('figure', { key: i, className: 'block-image size-' + (b.size || 'large') + ' align-' + (b.align || 'center') },
          h('img', { src: asset(props, b.image), alt: b.alt || b.caption || '' }),
          caption(b.caption, b.credit)) : null;
      case 'gallery': {
        var images = (b.images || []).filter(function (img) { return img && img.image; });
        if (!images.length) return null;
        return h('figure', { key: i, className: 'block-gallery gallery-' + (b.images || []).length },
          h('div', { className: 'gallery-grid' }, images.map(function (img, j) {
            return h('figure', { key: j, className: 'gallery-item' },
              h('img', { src: asset(props, img.image), alt: img.alt || img.caption || '' }),
              caption(img.caption, img.credit));
          })),
          caption(b.caption, b.credit, 'gallery-caption'));
      }
      case 'quote':
        return b.text ? h('figure', { key: i, className: 'block-quote' },
          h('blockquote', null, h('p', { dir: 'auto' }, b.text)),
          b.attribution ? h('figcaption', { dir: 'auto' }, '— ' + b.attribution) : null) : null;
      case 'divider':
        return h('hr', { key: i, className: 'block-divider divider-' + (b.style || 'line') });
      case 'video': {
        if (!b.url) return null;
        var embed = videoEmbed(b.url);
        return h('figure', { key: i, className: 'block-video' },
          embed ? h('div', { className: 'video-frame' }, h('iframe', { src: embed, title: b.caption || 'Video', allowFullScreen: true }))
                : h('p', null, h('a', { className: 'btn', href: b.url }, 'Watch video ↗')),
          b.caption ? h('figcaption', { dir: 'auto' }, b.caption) : null);
      }
      case 'audio': {
        var src = b.file ? asset(props, b.file) : b.url;
        if (!src) return null;
        return h('figure', { key: i, className: 'block-audio' },
          b.title ? h('p', { className: 'block-audio-title', dir: 'auto' }, b.title) : null,
          h('audio', { controls: true, preload: 'metadata', src: src }),
          b.caption ? h('figcaption', { dir: 'auto' }, b.caption) : null);
      }
      default:
        return null;
    }
  }

  function ArticlePreview(props) {
    var e = props.entry;
    var get = function (key) { return e.getIn(['data', key]) || ''; };
    var lang = get('language') === 'ar' || get('language') === 'en' ? get('language') : 'bilingual';
    var t = LABELS[lang === 'ar' ? 'ar' : 'en'];
    var image = get('image');
    var topics = toJS(get('topics')) || [];
    var credits = (toJS(get('credits')) || []).filter(function (c) { return c && c.name; });
    var blockData = e.getIn(['data', 'blocks']);
    var blockWidgets = props.widgetsFor ? props.widgetsFor('blocks') : null;
    var blocks = [];
    if (blockData && blockData.size) {
      blockData.forEach(function (block, i) {
        var widgets = blockWidgets && blockWidgets.getIn ? blockWidgets.getIn([i, 'widgets']) : null;
        blocks.push(renderBlock(props, block, widgets, i));
      });
    }
    var sourceName = get('source_name');
    var sourceUrl = get('source_url');
    var source = sourceName ? (sourceUrl ? h('a', { href: sourceUrl }, sourceName) : sourceName) : null;

    var articleProps = { className: 'publication-article lang-' + lang };
    if (lang === 'ar') { articleProps.lang = 'ar'; articleProps.dir = 'rtl'; }
    else if (lang === 'en') { articleProps.lang = 'en'; }

    return h('main', { className: 'container publication-main here-preview' },
      h('div', { className: 'article-layout' },
        h('article', articleProps,
          h('p', { className: 'article-back' }, h('a', null, (lang === 'ar' ? '→ ' : '← ') + t.all)),
          h('p', { className: 'small article-meta', dir: 'auto' },
            get('category') ? h('a', { className: 'category-link' }, get('category')) : null,
            get('category') ? ' · ' : null,
            t.article + ' · ' + formatDate(get('date'), lang)),
          get('series') ? h('p', { className: 'article-series', dir: 'auto' }, t.series + ': ' + get('series') +
            (get('series_order') ? ' · ' + t.part + ' ' + get('series_order') : '')) : null,
          h('h1', { dir: 'auto' }, get('title')),
          get('subtitle') ? h('p', { className: 'article-subtitle', dir: 'auto' }, get('subtitle')) : null,
          h('p', { className: 'small article-byline', dir: 'auto' },
            t.by + ' ', h('span', { className: 'author' }, get('author') || 'Here News'),
            source ? ' · ' + t.source + ': ' : null, source),
          image ? h('figure', { className: 'publication-cover-wrapper cover-' + (get('image_size') || 'medium') },
            h('img', { className: 'publication-cover', src: asset(props, image), alt: get('image_alt') || get('title') }),
            (get('image_caption') || get('image_credit')) ? h('figcaption', { className: 'publication-image-caption', dir: 'auto' },
              get('image_caption'), get('image_credit') ? h('span', { className: 'publication-image-credit' }, ' ' + get('image_credit')) : null) : null
          ) : null,
          paragraphs(get('description'), 'lede'),
          h('div', { className: 'publication-body' }, props.widgetFor('body'), blocks),
          (credits.length || sourceName) ? h('dl', { className: 'article-credits' },
            sourceName ? [h('dt', { key: 'st' }, t.source), h('dd', { key: 'sd' }, source)] : null,
            credits.map(function (c, i) {
              return [h('dt', { key: 't' + i }, c.role || t.credits), h('dd', { key: 'd' + i }, c.name)];
            })) : null,
          topics.length ? h('nav', { className: 'article-tags' },
            h('span', { className: 'small' }, t.tags + ':'),
            topics.map(function (topic, i) { return h('a', { key: i, className: 'pill tag-link', title: '/publications/tag/' + slugify(topic) + '/' }, topic); })) : null,
          e.getIn(['data', 'ads']) === false ? h('p', { className: 'small preview-note' }, 'Ad-free article: no advertisements will be shown.') : null
        )
      )
    );
  }

  function AdPreview(props) {
    var e = props.entry;
    var get = function (key) { return e.getIn(['data', key]) || ''; };
    var placements = toJS(get('placements')) || [];
    var card = function (slot) {
      return h('aside', { key: slot, className: 'ad-slot ad-slot--' + slot },
        h('p', { className: 'small preview-note' }, 'Placement: ' + slot),
        h('div', { className: 'ad' },
          h('p', { className: 'ad-label' }, LABELS.en.advertisement + ' · ' + LABELS.en.sponsoredBy + ' ' + (get('advertiser') || get('title'))),
          h('a', { className: 'ad-link', href: get('url') || undefined },
            get('image') ? h('img', { className: 'ad-creative', src: asset(props, get('image')), alt: get('image_alt') || '' }) : null,
            (get('headline') || get('text')) ? h('span', { className: 'ad-copy' },
              get('headline') ? h('strong', { className: 'ad-headline' }, get('headline')) : null,
              get('text') ? h('span', { className: 'ad-text' }, get('text')) : null) : null)));
    };
    return h('main', { className: 'container publication-main here-preview' },
      h('div', { className: 'publication-article' },
        e.getIn(['data', 'active']) === false ? h('p', { className: 'notice' }, 'This campaign is switched off.') : null,
        (placements.length ? placements : ['in-article']).map(card)));
  }

  window.CMS.registerPreviewTemplate('articles', ArticlePreview);
  window.CMS.registerPreviewTemplate('advertisements', AdPreview);
})();
