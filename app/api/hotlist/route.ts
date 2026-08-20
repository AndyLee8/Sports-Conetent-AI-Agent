import { NextResponse } from "next/server";
import { demoHotTopics } from "@/lib/demo-data";
import { fetchAuthorizedHotlist, fetchPublicSportsHotlist, fetchWeiboBrowserSportsHotlist, fetchWeiboPublicSportsHotlist, HotlistProviderError } from "@/lib/server/hotlist";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function GET() {
  try {
    return response(await fetchAuthorizedHotlist());
  } catch {
    try {
      return response(await fetchWeiboBrowserSportsHotlist());
    } catch {
      try {
        return response(await fetchWeiboPublicSportsHotlist());
      } catch (error) {
        try {
          const fallback = await fetchPublicSportsHotlist();
          const warning = error instanceof HotlistProviderError ? error.message : "微博体育热搜暂时不可用。";
          return response({ ...fallback, warning: `${warning} 已自动切换到公开体育资讯聚合。` });
        } catch (fallbackError) {
          const message = fallbackError instanceof HotlistProviderError ? fallbackError.message : error instanceof HotlistProviderError ? error.message : "自动体育热点数据源暂时无法访问。";
          return response({ topics: demoHotTopics, updatedAt: new Date().toISOString(), live: false, source: "demo", warning: message }, 200);
        }
      }
    }
  }
}
