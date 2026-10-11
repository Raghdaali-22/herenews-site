module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy("index.html");
  eleventyConfig.addPassthroughCopy("about.html");
  eleventyConfig.addPassthroughCopy("project.html");
  eleventyConfig.addPassthroughCopy("admin");
  eleventyConfig.addPassthroughCopy("assets");
  eleventyConfig.addPassthroughCopy("favicon.png");
  eleventyConfig.addPassthroughCopy("CNAME");
  eleventyConfig.addWatchTarget("./assets/");
  for (const kind of ["articles", "documentaries", "audio"]) {
    eleventyConfig.addCollection(kind, collection => collection.getFilteredByGlob(`./content/${kind}/*.md`).sort((a,b) => new Date(b.data.date || 0) - new Date(a.data.date || 0)));
  }
  eleventyConfig.addFilter("shortDate", value => {
    if (!value) return "";
    const d = new Date(value);
    return Number.isNaN(d.getTime()) ? "" : new Intl.DateTimeFormat("en-US", {year:"numeric", month:"long", day:"numeric", timeZone:"UTC"}).format(d);
  });
  eleventyConfig.addFilter("youtubeEmbed", value => {
    if (!value) return "";
    try {
      const u = new URL(value);
      let id = "";
      if (["youtube.com", "www.youtube.com", "m.youtube.com"].includes(u.hostname)) {
        if (u.pathname === "/watch") id = u.searchParams.get("v") || "";
        else if (u.pathname.startsWith("/shorts/") || u.pathname.startsWith("/embed/")) id = u.pathname.split("/")[2];
      } else if (u.hostname === "youtu.be" || u.hostname === "www.youtu.be") id = u.pathname.slice(1);
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? `https://www.youtube-nocookie.com/embed/${id}` : "";
    } catch { return ""; }
  });
  return { dir: { input: ".", output: "_site", includes: "templates" }, templateFormats: ["md", "njk"], markdownTemplateEngine: "njk", htmlTemplateEngine: "njk" };
};
