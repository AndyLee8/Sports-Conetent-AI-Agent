import type { HotTopic } from "@/lib/types";
import * as cheerio from "cheerio";
import { fetchWeiboPageWithBrowser } from "@/lib/server/weibo-browser";
const WEIBO_SPORTS_PAGE = "https://s.weibo.com/top/summary?cate=sport";

const PUBLIC_SPORTS_FEEDS = [
  { name: "新浪体育滚动", url: "https://rss.sina.com.cn/roll/sports/hot_roll.xml", weight: 12 },
  { name: "新浪体育综合", url: "https://rss.sina.com.cn/news/allnews/sports.xml", weight: 8 },
  { name: "新浪国际足球", url: "https://rss.sina.com.cn/sports/global/focus.xml", weight: 10 },
] as const;
const WEIBO_PUBLIC_SPORTS_API = "https://weibo.com/ajax/side/hotSearch?cate=sport";
const SPORTS_TERMS = [
  "足球", "篮球", "排球", "网球", "羽毛球", "乒乓球", "棒球", "橄榄球", "高尔夫", "赛车", "田径", "游泳", "滑雪", "体操", "拳击", "马拉松", "世界杯", "欧冠", "英超", "西甲", "意甲", "德甲", "中超", "NBA", "CBA", "FIFA", "KPL", "球员", "球队", "主帅", "教练", "联赛", "决赛", "半决赛", "季后赛", "奥运", "亚运",
];

/** Parse the documented, server-provided Weibo HTML shape.
 * This is intentionally a pure parser: callers must supply HTML obtained
 * through an authorized provider or the local development browser session.
 */
export function parseWeiboSportsHtml(html: string, baseUrl = "https://s.weibo.com"): HotTopic[] {
  const $ = cheerio.load(html);
  const topics: HotTopic[] = [];
  $("#pl_top_realtimehot tbody tr, #pl_top_realtimehot > tr").each((index, element) => {
    const row = $(element);
    const rankText = row.find(".td-01").first().text().trim();
    const titleAnchor = row.find(".td-02 a").first();
    const cleanAnchor = titleAnchor.clone();
    cleanAnchor.find("i").remove();
    const topic = cleanAnchor.text().replace(/\s+/g, " ").trim();
    if (!topic) return;
    const rank = Number.parseInt(rankText, 10) || index + 1;
    const heat = row.find(".td-02 span").first().text().replace(/\s+/g, " ").trim() || "—";
    const change = row.find(".td-02 i").first().text().trim() || "—";
    const href = titleAnchor.attr("href");
    let url = "";
    if (href) {
      try { url = new URL(href, baseUrl).toString(); } catch { url = ""; }
    }
    topics.push({ rank, topic, heat, change, url, source: "微博体育热榜 HTML" });
  });
  return topics.sort((a, b) => a.rank - b.rank).slice(0, 20);
}

/**
 * The hotlist must come from an authorized Weibo/licensed data provider.
 * The provider adapter accepts a small, stable payload so the UI is not
 * coupled to any provider's private response format.
 */
export class HotlistProviderError extends Error {
  status: number;

  constructor(message: string, status = 503) {
    super(message);
    this.name = "HotlistProviderError";
    this.status = status;
  }
}

type ProviderItem = Record<string, unknown>;

function textValue(...values: unknown[]) {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return "";
}

function numberValue(...values: unknown[]) {
  for (const value of values) {
    const parsed = typeof value === "number" ? value : Number.parseInt(String(value), 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return Number.NaN;
}

function providerItems(payload: unknown): ProviderItem[] {
  if (Array.isArray(payload)) return payload.filter((item): item is ProviderItem => Boolean(item && typeof item === "object"));
  if (!payload || typeof payload !== "object") return [];
  const record = payload as Record<string, unknown>;
  for (const key of ["topics", "items", "data", "results"]) {
    if (Array.isArray(record[key])) return providerItems(record[key]);
  }
  return [];
}

export function normalizeAuthorizedHotlist(payload: unknown): HotTopic[] {
  const topics = providerItems(payload).flatMap((item, index) => {
    const topic = textValue(item.topic, item.word, item.title, item.name);
    const rank = numberValue(item.rank, item.position, item.rank_no) || index + 1;
    const heat = textValue(item.heat, item.hot, item.hot_value, item.score) || "—";
    const change = textValue(item.change, item.rank_change, item.delta) || "—";
    const rawUrl = textValue(item.url, item.link, item.href);
    let url = "";
    if (rawUrl) {
      try {
        const parsed = new URL(rawUrl);
        if (parsed.protocol === "https:" || parsed.protocol === "http:") url = parsed.toString();
      } catch {
        url = "";
      }
    }
    const source = textValue(item.source, item.provider) || "授权热榜供应商";
    const summary = textValue(item.summary, item.description, item.abstract);
    return topic ? [{ rank, topic, heat, change, url, source, summary }] : [];
  });
  return topics
    .filter((item) => Number.isFinite(item.rank))
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 20);
}

function providerUrl() {
  const value = process.env.WEIBO_HOTLIST_API_URL?.trim();
  if (!value) throw new HotlistProviderError("尚未配置微博官方授权或已签约数据供应商。", 503);
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new HotlistProviderError("热榜数据源地址配置无效。", 500);
  }
  if (parsed.protocol !== "https:") throw new HotlistProviderError("热榜数据源必须使用 HTTPS。", 500);
  return parsed;
}

export async function fetchAuthorizedHotlist() {
  const url = providerUrl();
  const token = process.env.WEIBO_HOTLIST_API_TOKEN?.trim();
  if (!token) throw new HotlistProviderError("热榜数据源已配置，但缺少服务端授权令牌。", 503);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json, text/html;q=0.9",
        Authorization: `Bearer ${token}`,
      },
    });
    if (!response.ok) throw new HotlistProviderError(`授权热榜数据源返回 ${response.status}。`, 502);
    const contentType = response.headers.get("content-type")?.toLocaleLowerCase() || "";
    const body = await response.text();
    let topics: HotTopic[];
    if (contentType.includes("text/html") || body.trimStart().startsWith("<")) {
      topics = parseWeiboSportsHtml(body, url.origin);
    } else {
      let payload: unknown;
      try {
        payload = JSON.parse(body);
      } catch {
        throw new HotlistProviderError("授权热榜数据源返回的 JSON 无法解析。", 502);
      }
      topics = normalizeAuthorizedHotlist(payload);
    }
    if (!topics.length) throw new HotlistProviderError("授权热榜数据源没有返回可用热点。", 502);
    return {
      topics,
      updatedAt: response.headers.get("last-modified") || new Date().toISOString(),
      live: true as const,
      provider: "authorized" as const,
      format: contentType.includes("text/html") || body.trimStart().startsWith("<") ? "html" as const : "json" as const,
    };
  } catch (error) {
    if (error instanceof HotlistProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new HotlistProviderError("授权热榜数据源响应超时。", 504);
    throw new HotlistProviderError("授权热榜数据源暂时无法访问。", 502);
  } finally {
    clearTimeout(timer);
  }
}

type FeedStory = {
  title: string;
  url: string;
  summary: string;
  source: string;
  publishedAt: number;
  score: number;
  appearances: number;
};

function cleanFeedText(value: string) {
  return cheerio.load(value).text().replace(/\s+/g, " ").trim();
}

function storyKey(title: string) {
  return title.toLocaleLowerCase("zh-CN").replace(/[\s·丨|｜:：,，。!！?？'“”\-_]/g, "");
}

function parseFeed(xml: string, source: string, weight: number): FeedStory[] {
  const $ = cheerio.load(xml, { xmlMode: true });
  return $("item").toArray().flatMap((element) => {
    const item = $(element);
    const title = cleanFeedText(item.find("title").first().text());
    const url = item.find("link").first().text().trim();
    const summary = cleanFeedText(item.find("description").first().text());
    const publishedAt = Date.parse(item.find("pubDate").first().text()) || Date.now();
    if (!title || !url.startsWith("http")) return [];
    const ageHours = Math.max(0, (Date.now() - publishedAt) / 3_600_000);
    return [{ title, url, summary, source, publishedAt, score: Math.max(10, 100 - Math.round(ageHours * 2)) + weight, appearances: 1 }];
  });
}

export async function fetchPublicSportsHotlist() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 12_000);
  try {
    const results = await Promise.allSettled(PUBLIC_SPORTS_FEEDS.map(async (feed) => {
      const response = await fetch(feed.url, {
        signal: controller.signal,
        cache: "no-store",
        headers: { Accept: "application/rss+xml, application/xml, text/xml" },
      });
      if (!response.ok) throw new Error(`${feed.name} 返回 ${response.status}`);
      return parseFeed(await response.text(), feed.name, feed.weight);
    }));
    const stories = results.flatMap((result) => result.status === "fulfilled" ? result.value : []);
    if (!stories.length) throw new HotlistProviderError("公开体育资讯源暂时不可用。", 502);

    const merged = new Map<string, FeedStory>();
    for (const story of stories) {
      const key = storyKey(story.title);
      const existing = merged.get(key);
      if (!existing) {
        merged.set(key, story);
        continue;
      }
      existing.appearances += 1;
      existing.score += 18;
      if (story.publishedAt > existing.publishedAt) Object.assign(existing, { ...story, appearances: existing.appearances, score: existing.score });
    }

    const topics: HotTopic[] = [...merged.values()]
      .sort((a, b) => b.score - a.score || b.publishedAt - a.publishedAt)
      .slice(0, 20)
      .map((story, index) => ({
        rank: index + 1,
        topic: story.title,
        heat: `指数 ${Math.min(999, story.score)}`,
        change: story.appearances > 1 ? `×${story.appearances}` : "新",
        url: story.url,
        source: story.source,
        summary: story.summary,
      }));
    return { topics, updatedAt: new Date().toISOString(), live: true as const, source: "public-rss" as const };
  } catch (error) {
    if (error instanceof HotlistProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new HotlistProviderError("公开体育资讯源响应超时。", 504);
    throw new HotlistProviderError("公开体育资讯源暂时无法访问。", 502);
  } finally {
    clearTimeout(timer);
  }
}

function sportsMatch(word: string, flag = "") {
  const text = `${word} ${flag}`.toLocaleLowerCase("zh-CN");
  return SPORTS_TERMS.some((term) => text.includes(term.toLocaleLowerCase("zh-CN")));
}

export async function fetchWeiboPublicSportsHotlist() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(WEIBO_PUBLIC_SPORTS_API, {
      signal: controller.signal,
      cache: "no-store",
      headers: {
        Accept: "application/json, text/plain, */*",
        Referer: "https://s.weibo.com/top/summary?cate=sport",
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
        "X-Requested-With": "XMLHttpRequest",
      },
    });
    if (!response.ok) throw new HotlistProviderError(`微博公开接口返回 ${response.status}。`, 502);
    const payload = await response.json() as { data?: { realtime?: Array<Record<string, unknown>> } };
    const realtime = Array.isArray(payload.data?.realtime) ? payload.data.realtime : [];
    const topics = realtime
      .filter((item) => typeof item.word === "string" && sportsMatch(item.word, String(item.flag_desc ?? "")))
      .slice(0, 20)
      .map((item, index) => ({
        rank: index + 1,
        topic: String(item.word).trim(),
        heat: Number.isFinite(Number(item.num)) ? Number(item.num).toLocaleString("zh-CN") : "—",
        change: String(item.label_name ?? item.icon_desc ?? "—").trim() || "—",
        url: `https://s.weibo.com/weibo?q=${encodeURIComponent(`#${String(item.word).trim()}#`)}`,
        source: "微博公开热搜接口 · 体育关键词筛选",
      }));
    if (topics.length < 5) throw new HotlistProviderError("微博公开接口未返回足够的体育热搜，已停止混入全站热搜。", 502);
    return { topics, updatedAt: new Date().toISOString(), live: true as const, source: "weibo-public" as const };
  } catch (error) {
    if (error instanceof HotlistProviderError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") throw new HotlistProviderError("微博公开接口响应超时。", 504);
    throw new HotlistProviderError("微博公开接口暂时无法访问。", 502);
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchWeiboBrowserSportsHotlist() {
  const browser = process.env.WEIBO_BROWSER_COOKIES?.trim();
  if (!browser) throw new HotlistProviderError("未启用本地微博浏览器会话。", 503);
  const python = process.env.WEIBO_COOKIE_PYTHON_PATH?.trim();
  if (!python) throw new HotlistProviderError("未配置微博浏览器会话 Python 路径。", 503);
  try {
    const html = await fetchWeiboPageWithBrowser(new URL(WEIBO_SPORTS_PAGE), true);
    const topics = parseWeiboSportsHtml(html, "https://s.weibo.com");
    if (topics.length < 5) throw new HotlistProviderError("微博页面没有解析到足够的体育热点。", 502);
    return { topics, updatedAt: new Date().toISOString(), live: true as const, source: "weibo-browser" as const };
  } catch (error) {
    if (error instanceof HotlistProviderError) throw error;
    throw new HotlistProviderError("本地微博 Chrome 会话不可用，可能需要重新登录或验证。", 502);
  }
}
