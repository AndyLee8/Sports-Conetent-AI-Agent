import * as cheerio from "cheerio";
import { extractSourceUrl } from "@/lib/source-url";
import { fetchWeiboPageWithBrowser, isWeiboPage } from "@/lib/server/weibo-browser";
import type { ResearchItem } from "@/lib/server/research";

export type SourceType = "web" | "bilibili" | "douyin";

export type SourceEvidence = {
  url: string;
  type: SourceType;
  title: string;
  description: string;
  text: string;
  transcript: string | null;
  warnings: string[];
  topicOnly?: boolean;
  research?: ResearchItem[];
  researchBrief?: string;
};

export class SourceIngestError extends Error {
  status: number;

  constructor(message: string, status = 422) {
    super(message);
    this.name = "SourceIngestError";
    this.status = status;
  }
}

function classifyUrl(url: URL): SourceType {
  const host = url.hostname.toLowerCase();
  if (host.includes("bilibili.com") || host.includes("b23.tv")) return "bilibili";
  if (host.includes("douyin.com") || host.includes("iesdouyin.com")) return "douyin";
  return "web";
}

function assertSafeRemoteUrl(url: URL) {
  const hostname = url.hostname.toLowerCase();
  const blocked = ["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"];
  if (!['http:', 'https:'].includes(url.protocol)) throw new SourceIngestError("只支持 http 或 https 链接。", 400);
  if (blocked.includes(hostname) || hostname.endsWith(".local")) throw new SourceIngestError("出于安全原因，不能抓取本地地址。", 400);
  if (/^(10\.|127\.|169\.254\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname)) {
    throw new SourceIngestError("出于安全原因，不能抓取内网地址。", 400);
  }
}

async function fetchPage(url: URL) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 12000);
  try {
    return await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "Mozilla/5.0 (compatible; BaokuanWriter/0.1; +https://example.com/bot)",
        Accept: "text/html,application/xhtml+xml",
      },
      redirect: "follow",
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw new SourceIngestError("来源页面响应超时，请稍后重试。", 504);
    throw new SourceIngestError("来源页面暂时无法访问，请确认链接有效。", 422);
  } finally {
    clearTimeout(timeout);
  }
}

function emptyVideoEvidence(url: URL, type: SourceType, warning: string): SourceEvidence {
  return { url: url.toString(), type, title: "", description: "", text: "", transcript: null, warnings: [warning] };
}

function cleanText(value: string) {
  return value
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function cleanVideoMetadata(value: string) {
  const cleaned = cleanText(value);
  if (/^(抖音|douyin|哔哩哔哩|bilibili)[-｜| ]*(记录美好生活|视频|首页)?$/i.test(cleaned)) return "";
  if (/记录美好生活|打开抖音|扫码观看|下载抖音/i.test(cleaned)) return "";
  return cleaned;
}

function extractWeiboEvidence(html: string, url: URL): SourceEvidence {
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg, nav, footer, header, form").remove();
  const query = cleanText(url.searchParams.get("q") || "").replace(/^#+|#+$/g, "");
  const posts: string[] = [];
  $("#pl_feedlist_index .card-wrap .content, .card-wrap .content").slice(0, 8).each((_, element) => {
    const content = $(element);
    const author = cleanText(content.find(".name").first().text());
    const text = cleanText(content.find(".txt").first().text());
    const time = cleanText(content.find(".from a").first().text());
    if (!text || posts.includes(text)) return;
    posts.push([author ? `发布者：${author}` : "", time ? `时间：${time}` : "", text].filter(Boolean).join("\n"));
  });
  if (!posts.length) {
    $(".card-wrap .txt, [node-type='feed_list_content'], .WB_text, .detail_wbtext, article .content").slice(0, 8).each((_, element) => {
      const text = cleanText($(element).text());
      if (text && !posts.includes(text)) posts.push(text);
    });
  }
  const title = query ? `微博话题：${query}` : cleanText($("title").text() || "微博内容");
  const text = cleanText(posts.join("\n\n")).slice(0, 14000);
  if (text.replace(/\s+/g, "").length < 80) {
    throw new SourceIngestError("微博链接已打开，但没有提取到足够的可见博文内容，请确认登录状态或稍后重试。", 422);
  }
  return {
    url: url.toString(),
    type: "web",
    title,
    description: `微博体育热点“${query || "当前话题"}”的可见搜索结果，已提取 ${posts.length} 条博文。`,
    text,
    transcript: null,
    warnings: ["微博搜索结果可能包含观点性内容，生成结果会以可见博文为事实材料并执行二次核查。"],
  };
}

function extractWeiboTopicOnlyEvidence(url: URL): SourceEvidence | null {
  if (!url.hostname.toLowerCase().endsWith("weibo.com") || !url.pathname.includes("/weibo")) return null;
  const query = cleanText(url.searchParams.get("q") || "").replace(/^#+|#+$/g, "");
  if (!query) return null;
  return {
    url: url.toString(),
    type: "web",
    title: `微博体育热榜选题：${query}`,
    description: `该链接来自微博体育热榜，选题词为“${query}”。当前未能读取微博搜索结果正文。`,
    text: `微博体育热榜选题：${query}\n这是待补充公开证据的热点词。请结合后续有限检索材料判断哪些事实可以写入，未被材料支持的比分、球员数据或比赛时间不得补写。`,
    transcript: null,
    topicOnly: true,
    warnings: ["微博搜索结果暂时需要登录或验证；本次仅使用热榜词生成待核实草稿，不能视为已完成事实核查。"],
  };
}

export async function extractSource(rawUrl: string): Promise<SourceEvidence> {
  let url: URL;
  try {
    const sourceUrl = extractSourceUrl(rawUrl);
    if (!sourceUrl) throw new SourceIngestError("没有从输入内容中识别到有效链接。", 400);
    url = new URL(sourceUrl);
    assertSafeRemoteUrl(url);
  } catch (error) {
    if (error instanceof SourceIngestError) throw error;
    throw new SourceIngestError("请输入有效的网页、抖音或 B 站链接。", 400);
  }

  const type = classifyUrl(url);
  if (isWeiboPage(url)) {
    try {
      return extractWeiboEvidence(await fetchWeiboPageWithBrowser(url), url);
    } catch (error) {
      if (error instanceof SourceIngestError) throw error;
      const topicOnly = extractWeiboTopicOnlyEvidence(url);
      if (topicOnly) return topicOnly;
      throw new SourceIngestError("微博链接无法解析，请确认本机 Chrome 已登录微博且没有待处理的验证。", 422);
    }
  }
  let response: Response;
  try {
    response = await fetchPage(url);
  } catch (error) {
    if (type === "bilibili" || type === "douyin") {
      return emptyVideoEvidence(url, type, "视频页面无法直接访问，需要补充分享文案、字幕或视频转写内容。");
    }
    throw error;
  }
  const contentType = response.headers.get("content-type") ?? "";
  if (!response.ok) {
    if (type === "bilibili" || type === "douyin") return emptyVideoEvidence(url, type, `视频页面返回 ${response.status}，需要补充字幕或转写内容。`);
    throw new SourceIngestError(`来源页面返回 ${response.status}，暂时无法读取。`, 422);
  }
  if (!contentType.includes("text/html")) {
    if (type === "bilibili" || type === "douyin") return emptyVideoEvidence(url, type, "视频平台没有返回可读取的页面内容，需要补充字幕或转写内容。");
    throw new SourceIngestError("当前链接不是可读取的网页内容。", 422);
  }

  const html = await response.text();
  const $ = cheerio.load(html);
  $("script, style, noscript, iframe, svg, nav, footer, header, form").remove();
  const rawTitle = cleanText($("meta[property='og:title']").attr("content") || $("title").text() || $("h1").first().text() || "");
  const rawDescription = cleanText($("meta[property='og:description']").attr("content") || $("meta[name='description']").attr("content") || "");
  const title = type === "web" ? rawTitle : cleanVideoMetadata(rawTitle);
  const description = type === "web" ? rawDescription : cleanVideoMetadata(rawDescription);
  const sourceRoot = $("article").first().length ? $("article").first() : $("main").first().length ? $("main").first() : $("body");
  const pageText = cleanText(sourceRoot.text()).slice(0, 14000);
  const text = type === "web" ? pageText : "";
  const warnings: string[] = [];

  if (!text && !description) warnings.push("页面没有提取到有效正文，建议补充粘贴文字。");
  if (type === "bilibili" || type === "douyin") warnings.push("视频页面正文不作为事实来源；需要平台字幕、分享文案或语音转写内容。");

  return { url: url.toString(), type, title, description, text, transcript: null, warnings };
}
