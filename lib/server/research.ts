import * as cheerio from "cheerio";

export type ResearchItem = {
  title: string;
  summary: string;
  url: string;
  source: string;
  publishedAt: string;
};

function clean(value: string) {
  return cheerio.load(value).text().replace(/\s+/g, " ").trim();
}

function parseRss(xml: string): ResearchItem[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("item").toArray().flatMap((element) => {
    const item = $(element);
    const title = clean(item.find("title").first().text());
    const summary = clean(item.find("description").first().text());
    const url = item.find("link").first().text().trim();
    const publishedAt = clean(item.find("pubDate").first().text());
    const source = clean(item.find("source").first().text()) || "公开新闻源";
    if (!title || !url.startsWith("http")) return [];
    return [{ title, summary, url, source, publishedAt }];
  });
}

async function fetchFeed(url: string) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: { Accept: "application/rss+xml, application/xml, text/xml", "User-Agent": "BaokuanWriter/0.1" },
    });
    if (!response.ok) return [];
    return parseRss(await response.text());
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function collectPublicResearch(topic: string) {
  const query = topic.trim().slice(0, 120);
  if (!query) return [];
  const feeds = [
    `https://www.bing.com/news/search?q=${encodeURIComponent(`${query} 体育`)}&format=rss&mkt=zh-CN`,
    `https://news.google.com/rss/search?q=${encodeURIComponent(`${query} 体育`)}&hl=zh-CN&gl=CN&ceid=CN:zh-Hans`,
  ];
  const results = (await Promise.all(feeds.map(fetchFeed))).flat();
  const seen = new Set<string>();
  return results.filter((item) => {
    const key = item.title.replace(/\s+/g, "").toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  }).slice(0, 8);
}

export function formatResearch(items: ResearchItem[]) {
  return items.map((item, index) => [
    `[检索材料 ${index + 1}] ${item.title}`,
    item.summary ? `摘要：${item.summary}` : "",
    `来源：${item.source}`,
    item.publishedAt ? `时间：${item.publishedAt}` : "",
    `链接：${item.url}`,
  ].filter(Boolean).join("\n")).join("\n\n");
}
