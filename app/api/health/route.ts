import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json(
    {
      status: "ok",
      service: "baokuan-writer",
      checks: {
        whisper: Boolean(process.env.WHISPER_PYTHON_PATH),
        hotlistProvider: Boolean(process.env.WEIBO_HOTLIST_API_URL),
      },
    },
    { headers: { "Cache-Control": "no-store" } },
  );
}
