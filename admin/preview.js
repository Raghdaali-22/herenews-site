/* Here News article preview: lightweight, no build tooling required. */
(function () {
  if (!window.CMS || !window.React) return;
  var h = window.React.createElement;
  window.CMS.registerPreviewStyle('/assets/styles.css');
  window.CMS.registerPreviewStyle('/admin/preview.css');
  function ArticlePreview(props) {
    var e = props.entry;
    var get = function (key) { return e.getIn(['data', key]) || ''; };
    var image = get('image');
    var resolvedImage = image && props.getAsset ? props.getAsset(image).toString() : image;
    var size = get('image_size') || 'medium';
    var body = props.widgetFor('body');
    return h('main', { className: 'here-preview' },
      h('article', { className: 'publication-article' },
        h('p', { className: 'small' }, get('category') || 'Article', ' · ', get('author') || 'Ali Gamal'),
        h('h1', null, get('title')),
        get('description') && h('p', { className: 'lede' }, get('description')),
        image && h('figure', { className: 'publication-cover-wrapper cover-' + size },
          h('img', { className: 'publication-cover', src: resolvedImage, alt: get('title') }),
          (get('image_caption') || get('image_credit')) && h('figcaption', { className: 'publication-image-caption' },
            get('image_caption'), get('image_credit') && ' · Photo: ' + get('image_credit'))
        ),
        h('div', { className: 'publication-body' }, body)
      )
    );
  }
  window.CMS.registerPreviewTemplate('articles', ArticlePreview);
})();
