// After a deploy, tell search engines which stories are new or updated, so
// they come to crawl them right away instead of whenever they next pass by.
//
//   - IndexNow (Bing, Yandex, Seznam, Naver, ... and the services that use
//     Bing's index): gets the exact URLs that changed.
//   - WebSub (Google's hub at pubsubhubbub.appspot.com): told the Atom feed
//     changed, so Google and feed readers re-fetch /feed.xml.
//
// Only runs for stories added or edited in this push; a failed ping never
// fails the deploy (the workflow step is continue-on-error).
import { execFileSync } from "node:child_process";
import path from "node:path";

const SITE = "https://herenews.net";
const KINDS = ["articles", "documentaries", "audio"];
const { BEFORE, AFTER, INDEXNOW_KEY } = process.env;

function slugify(value) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
}

function changedStoryUrls() {
  if (!BEFORE || /^0+$/.test(BEFORE) || !AFTER) return [];
  const out = execFileSync("git", [
    "diff", "--name-only", "--diff-filter=AM", BEFORE, AFTER, "--",
    ...KINDS.map(kind => `content/${kind}/*.md`)
  ], { encoding: "utf8" });
  return out.split("\n").filter(Boolean).map(file => {
    const kind = file.split("/")[1];
    return `${SITE}/publications/${kind}/${slugify(path.basename(file, ".md"))}/`;
  });
}

async function post(label, url, options) {
  try {
    const res = await fetch(url, options);
    console.log(`${label}: HTTP ${res.status}`);
  } catch (err) {
    console.log(`${label}: failed (${err.message})`);
  }
}

const stories = changedStoryUrls();
if (!stories.length) {
  console.log("No new or updated stories in this push; nothing to announce.");
  process.exit(0);
}
console.log("Announcing:\n  " + stories.join("\n  "));

if (INDEXNOW_KEY) {
  await post("IndexNow", "https://api.indexnow.org/indexnow", {
    method: "POST",
    headers: { "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify({
      host: new URL(SITE).host,
      key: INDEXNOW_KEY,
      keyLocation: `${SITE}/${INDEXNOW_KEY}.txt`,
      urlList: [...stories, `${SITE}/`]
    })
  });
}

await post("WebSub (Google)", "https://pubsubhubbub.appspot.com/", {
  method: "POST",
  headers: { "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams({ "hub.mode": "publish", "hub.url": `${SITE}/feed.xml` })
});
