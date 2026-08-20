import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join } from "node:path";
import { NextRequest, NextResponse } from "next/server";
import { transcribeMediaFile, transcribeVideoUrl, TranscriptionError } from "@/lib/server/transcription";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 900;

const MAX_UPLOAD_BYTES = 150 * 1024 * 1024;
const ALLOWED_EXTENSIONS = new Set([".mp4", ".mov", ".m4v", ".webm", ".mp3", ".m4a", ".wav", ".aac", ".ogg", ".opus"]);

function response(payload: unknown, status = 200) {
  return NextResponse.json(payload, { status, headers: { "Cache-Control": "no-store" } });
}

export async function POST(request: NextRequest) {
  try {
    const form = await request.formData();
    const url = form.get("url");
    const file = form.get("file");

    if (file instanceof File && file.size > 0) {
      if (file.size > MAX_UPLOAD_BYTES) return response({ error: "文件不能超过 150MB。" }, 413);
      const extension = extname(file.name).toLowerCase() || (file.type.startsWith("audio/") ? ".m4a" : ".mp4");
      if (!ALLOWED_EXTENSIONS.has(extension)) return response({ error: "仅支持常见的视频或音频文件。" }, 415);
      const directory = await mkdtemp(join(tmpdir(), "baokuan-upload-"));
      try {
        const mediaPath = join(directory, `upload${extension}`);
        await writeFile(mediaPath, Buffer.from(await file.arrayBuffer()));
        const result = await transcribeMediaFile(mediaPath);
        return response({ ...result, source: "upload" });
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    }

    if (typeof url === "string" && url.trim()) {
      const result = await transcribeVideoUrl(url);
      return response({ ...result, source: "url" });
    }
    return response({ error: "请提供视频链接或上传媒体文件。" }, 400);
  } catch (error) {
    if (error instanceof TranscriptionError) return response({ error: error.message, code: error.code }, error.status);
    return response({ error: error instanceof Error ? error.message : "语音识别失败。" }, 500);
  }
}
