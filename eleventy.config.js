const markdownIt = require("markdown-it");

const md = markdownIt({ html: true });

const KINDS = {
  articles: { label: "Article", labelAr: "مقال" },
  documentaries: { label: "Documentary / Video", labelAr: "فيلم وثائقي / فيديو" },
  audio: { label: "Audio", labelAr: "صوت" }
};

// Labels shown on publication pages. Arabic is used for Arabic-language items.
const LABELS = {
  en: {
    all: "All publications", by: "By", source: "Source", credits: "Credits", tags: "Tags",
    category: "Category", series: "Part of the series", moreInSeries: "More in this series",
    part: "Part", advertisement: "Advertisement", sponsoredBy: "Sponsored by", read: "Read / View →"
  },
  ar: {
    all: "كل المنشورات", by: "بقلم", source: "المصدر", credits: "إسهامات", tags: "الوسوم",
    category: "التصنيف", series: "جزء من سلسلة", moreInSeries: "المزيد من هذه السلسلة",
    part: "الجزء", advertisement: "إعلان", sponsoredBy: "برعاية", read: "اقرأ / شاهد ←"
  }
};

const AD_PLACEMENTS = ["in-article", "sidebar", "bottom", "listing"];

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function kindOf(item) {
  const path = item.inputPath || "";
  if (path.includes("/content/articles/")) return "articles";
  if (path.includes("/content/documentaries/")) return "documentaries";
  if (path.includes("/content/audio/")) return "audio";
  return "";
}

// The URL slug comes from the editor's "URL name" field so it always matches
// the CMS "View Live" link (preview_path uses {{fields.slug}}).
function pubSlug(item) {
  return slugify((item.data && item.data.slug) || item.fileSlug);
}

function pubUrl(item) {
  const kind = kindOf(item);
  return kind ? `/publications/${kind}/${pubSlug(item)}/` : "/publications/";
}

function asList(value) {
  if (!value) return [];
  return (Array.isArray(value) ? value : [value]).filter(v => v !== null && v !== undefined && v !== "");
}

function langOf(data) {
  const lang = data && data.language;
  return lang === "ar" || lang === "en" ? lang : "bilingual";
}

function toTime(value) {
  if (!value) return null;
  const t = new Date(value).getTime();
  return Number.isNaN(t) ? null : t;
}

/*
 * Contextual ad matching. Uses article metadata only (category, tags,
 * language) — no personal tracking.
 *
 * Returns candidates in order of preference. Campaigns that have not started
 * yet are kept so /assets/ads.js can switch them on when their start date
 * arrives; expired ones are dropped at build time.
 */
function adsFor(ads, context, placement, limit) {
  context = context || {};
  if (context.ads === false) return [];
  const now = Date.now();
  const contextTopics = asList(context.topics).map(slugify);
  const contextLang = context.language ? langOf(context) : null;
  const sponsor = context.sponsor ? slugify(context.sponsor) : "";

  const live = asList(ads)
    .map(ad => ({ ...ad.data, id: pubSlug(ad) }))
    .filter(ad => ad.active !== false && ad.image && ad.url)
    .filter(ad => {
      const placements = asList(ad.placements);
      return placements.length === 0 || placements.includes(placement);
    })
    .filter(ad => {
      const end = toTime(ad.end);
      return end === null || end > now;
    });

  let candidates;
  if (sponsor) {
    // Manual sponsor selection overrides automatic matching.
    candidates = live.filter(ad => ad.id === sponsor).map(ad => ({ ad, score: 100 }));
  } else {
    candidates = live
      .filter(ad => {
        const langs = asList(ad.languages);
        if (!contextLang || langs.length === 0) return true;
        if (contextLang === "bilingual") return langs.some(l => l === "en" || l === "ar");
        return langs.includes(contextLang);
      })
      .map(ad => {
        const adCategories = asList(ad.categories);
        const adTopics = asList(ad.topics).map(slugify);
        const targeted = adCategories.length > 0 || adTopics.length > 0;
        const categoryMatch = !!context.category && adCategories.includes(context.category);
        const topicMatches = adTopics.filter(t => contextTopics.includes(t)).length;
        // Targeted ads only run next to matching content, or on general listings.
        if (targeted && !context.general && !categoryMatch && topicMatches === 0) return null;
        return { ad, score: (categoryMatch ? 2 : 0) + topicMatches };
      })
      .filter(Boolean);
  }

  return candidates
    .sort((a, b) =>
      (Number(b.ad.priority) || 0) - (Number(a.ad.priority) || 0) ||
      b.score - a.score ||
      (toTime(b.ad.start) || 0) - (toTime(a.ad.start) || 0))
    .slice(0, limit || 5)
    .map(c => c.ad);
}

// Inserts `insert` after the nth top-level paragraph of an HTML fragment.
// Falls back to appending when the text is shorter than that.
function injectAfterParagraph(html, n, insert) {
  html = String(html || "");
  if (!insert || !String(insert).trim()) return html;
  const re = /<(\/?)(p|blockquote|ul|ol|div|figure|table|section|aside|details)\b[^>]*>/gi;
  let depth = 0;
  let count = 0;
  let match;
  while ((match = re.exec(html))) {
    const closing = match[1] === "/";
    const tag = match[2].toLowerCase();
    if (tag === "p") {
      if (closing && depth === 0 && ++count === n) {
        const at = match.index + match[0].length;
        return html.slice(0, at) + insert + html.slice(at);
      }
      continue;
    }
    depth += closing ? -1 : 1;
    if (depth < 0) depth = 0;
  }
  return html + insert;
}

function videoEmbed(value) {
  if (!value) return "";
  try {
    const u = new URL(value);
    const host = u.hostname.replace(/^www\./, "").replace(/^m\./, "");
    if (host === "youtube.com") {
      let id = "";
      if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
      else if (/^\/(shorts|embed|live)\//.test(u.pathname)) id = u.pathname.split("/")[2];
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }
    if (host === "youtu.be") {
      const id = u.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    }
    if (host === "vimeo.com" || host === "player.vimeo.com") {
      const id = (u.pathname.match(/(\d{6,})/) || [])[1];
      return id ? `https://player.vimeo.com/video/${id}` : "";
    }
    return "";
  } catch { return ""; }
}

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("about.html");
  eleventyConfig.addPassthroughCopy("project.html");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("favicon.png");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addWatchTarget("./assets/");

  const byDateDesc = (a, b) => new Date(b.data.date || 0) - new Date(a.data.date || 0);

  for (const kind of Object.keys(KINDS)) {
    eleventyConfig.addCollection(kind, collection => {
      const items = collection.getFilteredByGlob(`./content/${kind}/*.md`).sort(byDateDesc);
      console.log(`[HERE NEWS] ${kind}: ${items.length} items`, items.map(item => item.inputPath));
      return items;
    });
  }

  eleventyConfig.addCollection("publications", collection =>
    collection.getFilteredByGlob(Object.keys(KINDS).map(kind => `./content/${kind}/*.md`)).sort(byDateDesc));

  eleventyConfig.addCollection("featured", collection =>
    collection.getFilteredByGlob(Object.keys(KINDS).map(kind => `./content/${kind}/*.md`))
      .filter(item => item.data.featured === true)
      .sort(byDateDesc));

  eleventyConfig.addCollection("series", collection =>
    collection.getFilteredByGlob("./content/series/*.md")
      .sort((a, b) => String(a.data.title || "").localeCompare(String(b.data.title || ""))));

  eleventyConfig.addCollection("advertisements", collection =>
    collection.getFilteredByGlob("./content/ads/*.md"));

  // Category and tag landing pages, built from article metadata.
  const taxonomy = (field) => collection => {
    const groups = new Map();
    for (const item of collection.getFilteredByGlob(Object.keys(KINDS).map(kind => `./content/${kind}/*.md`)).sort(byDateDesc)) {
      for (const name of asList(item.data[field])) {
        const slug = slugify(name);
        if (!slug) continue;
        if (!groups.has(slug)) groups.set(slug, { name: String(name), slug, items: [] });
        groups.get(slug).items.push(item);
      }
    }
    return [...groups.values()].sort((a, b) => a.name.localeCompare(b.name));
  };
  eleventyConfig.addCollection("categoryList", taxonomy("category"));
  eleventyConfig.addCollection("tagList", taxonomy("topics"));

  eleventyConfig.addFilter("shortDate", (value, lang) => {
    if (!value) return "";
    const d = new Date(value);
    const locale = lang === "ar" ? "ar-EG" : "en-US";
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat(locale, {year:"numeric", month:"long", day:"numeric", timeZone:"UTC"}).format(d);
  });
  eleventyConfig.addFilter("isoDate", value => {
    const t = toTime(value);
    return t === null ? "" : new Date(t).toISOString();
  });
  eleventyConfig.addFilter("youtubeEmbed", videoEmbed);
  eleventyConfig.addFilter("videoEmbed", videoEmbed);
  eleventyConfig.addFilter("markdown", value => md.render(String(value || "")));
  eleventyConfig.addFilter("paragraphs", value =>
    String(value || "").split(/\n\s*\n/).map(p => p.trim()).filter(Boolean));
  eleventyConfig.addFilter("taxonomySlug", slugify);
  eleventyConfig.addFilter("asList", asList);
  eleventyConfig.addFilter("head", (items, n) => asList(items).slice(0, n));
  eleventyConfig.addFilter("pubUrl", pubUrl);
  eleventyConfig.addFilter("pubSlug", pubSlug);
  eleventyConfig.addFilter("pubKind", item => kindOf(item));
  eleventyConfig.addFilter("kindLabel", (item, lang) => {
    const kind = KINDS[kindOf(item)];
    if (!kind) return "";
    return lang === "ar" ? kind.labelAr : kind.label;
  });
  eleventyConfig.addFilter("pubLang", data => langOf(data));
  eleventyConfig.addFilter("label", (key, lang) => (LABELS[lang === "ar" ? "ar" : "en"][key] || LABELS.en[key] || key));
  eleventyConfig.addFilter("inSeries", (items, seriesSlug) =>
    asList(items)
      .filter(item => seriesSlug && slugify(item.data.series) === slugify(seriesSlug))
      .sort((a, b) => (Number(a.data.series_order) || 0) - (Number(b.data.series_order) || 0) || byDateDesc(b, a)));
  eleventyConfig.addFilter("findSeries", (series, slug) =>
    asList(series).find(s => slug && pubSlug(s) === slugify(slug)));
  eleventyConfig.addFilter("adsFor", (ads, context, placement, limit) => {
    if (!AD_PLACEMENTS.includes(placement)) throw new Error(`Unknown ad placement "${placement}"`);
    return adsFor(ads, context, placement, limit);
  });
  eleventyConfig.addFilter("injectAfterParagraph", injectAfterParagraph);

  // Let each paragraph, heading and caption pick its own direction so
  // Arabic and English text in the same article both align correctly.
  eleventyConfig.addTransform("bidi", function(content) {
    const out = this.page && this.page.outputPath;
    if (!out || !out.endsWith(".html") || !this.page.url || !this.page.url.startsWith("/publications/")) return content;
    return content.replace(/<(p|h[1-6]|li|blockquote|figcaption|dd|dt)(\s[^>]*)?>/g, (tag, name, attrs = "") =>
      /\sdir=/.test(attrs) ? tag : `<${name} dir="auto"${attrs}>`);
  });

  return { dir: { input: ".", output: "_site", includes: "templates" }, templateFormats: ["md", "njk"], markdownTemplateEngine: "njk", htmlTemplateEngine: "njk" };
};
