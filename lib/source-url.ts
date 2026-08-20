export type SourcePlatform = "抖音" | "B站" | "普通网页" | null;

const KNOWN_SHORT_LINK = /(?:https?:\/\/)?(?:v\.douyin\.com|b23\.tv)\/[A-Za-z0-9_-]+\/?/i;
const HTTP_LINK = /https?:\/\/[^\s<>"'`，。！？；：、）》】]+/i;
const BARE_PLATFORM_LINK = /(?:www\.)?(?:douyin\.com|bilibili\.com)\/[^\s<>"'`，。！？；：、）》】]+/i;
const TRAILING_PUNCTUATION = /[\])}>,.!?;:'"，。！？；：、）》】]+$/u;

export function extractSourceUrl(input: string): string | null {
  const value = input.trim();
  if (!value) return null;

  const shortLink = value.match(KNOWN_SHORT_LINK)?.[0];
  const httpLink = value.match(HTTP_LINK)?.[0];
  const bareLink = value.match(BARE_PLATFORM_LINK)?.[0];
  let candidate = shortLink || httpLink || bareLink;
  if (!candidate) return null;

  candidate = candidate.replace(TRAILING_PUNCTUATION, "");
  if (!/^https?:\/\//i.test(candidate)) candidate = `https://${candidate}`;

  try {
    const url = new URL(candidate);
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

export function normalizeSourceInput(input: string) {
  return extractSourceUrl(input) ?? input.trim();
}

export function extractShareCaption(input: string) {
  const sourceUrl = input.match(KNOWN_SHORT_LINK)?.[0] || input.match(HTTP_LINK)?.[0] || input.match(BARE_PLATFORM_LINK)?.[0];
  if (!sourceUrl) return "";
  return input
    .replace(sourceUrl, " ")
    .replace(/复制(?:此|这段)?链接[\s\S]*$/u, " ")
    .replace(/打开(?:Dou|抖)音[\s\S]*$/iu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function detectSourcePlatform(input: string): SourcePlatform {
  const sourceUrl = extractSourceUrl(input);
  if (!sourceUrl) return null;
  const hostname = new URL(sourceUrl).hostname.toLowerCase();
  if (hostname.includes("douyin.com") || hostname.includes("iesdouyin.com")) return "抖音";
  if (hostname.includes("bilibili.com") || hostname.includes("b23.tv")) return "B站";
  return "普通网页";
}
