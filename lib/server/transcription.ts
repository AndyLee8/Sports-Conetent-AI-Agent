import { spawn } from "node:child_process";
import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { extname, join, resolve } from "node:path";
import { extractSourceUrl } from "@/lib/source-url";

export type TranscriptResult = {
  transcript: string;
  language: string;
  languageProbability: number;
  duration: number;
  segments: Array<{ start: number; end: number; text: string }>;
  title?: string;
  description?: string;
};

export class TranscriptionError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 422, code = "TRANSCRIPTION_FAILED") {
    super(message);
    this.name = "TranscriptionError";
    this.status = status;
    this.code = code;
  }
}

let activeJobs = 0;
const MAX_ACTIVE_JOBS = 1;
const transcriptCache = new Map<string, { expiresAt: number; result: TranscriptResult }>();

function runCommand(command: string, args: string[], timeoutMs: number) {
  return new Promise<{ stdout: string; stderr: string }>((resolvePromise, rejectPromise) => {
    const child = spawn(command, args, { cwd: process.cwd(), env: process.env, stdio: ["ignore", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill("SIGTERM");
    }, timeoutMs);

    child.stdout.on("data", (chunk) => { stdout = `${stdout}${chunk}`.slice(-5_000_000); });
    child.stderr.on("data", (chunk) => { stderr = `${stderr}${chunk}`.slice(-1_000_000); });
    child.on("error", (error) => {
      clearTimeout(timer);
      rejectPromise(new TranscriptionError(`无法启动媒体处理程序：${error.message}`, 500, "PROCESS_UNAVAILABLE"));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (timedOut) return rejectPromise(new TranscriptionError("视频处理超时，请上传较短的视频或音频。", 504, "TIMEOUT"));
      if (code !== 0) return rejectPromise(new TranscriptionError(stderr.trim() || stdout.trim() || "媒体处理失败。"));
      resolvePromise({ stdout, stderr });
    });
  });
}

async function withTranscriptionSlot<T>(work: () => Promise<T>) {
  if (activeJobs >= MAX_ACTIVE_JOBS) throw new TranscriptionError("当前已有语音识别任务，请等待任务完成后重试。", 429, "BUSY");
  activeJobs += 1;
  try {
    return await work();
  } finally {
    activeJobs -= 1;
  }
}

function pythonPath() {
  return process.env.WHISPER_PYTHON_PATH || resolve(process.cwd(), ".venv/bin/python");
}

export async function transcribeMediaFile(mediaPath: string): Promise<TranscriptResult> {
  return withTranscriptionSlot(async () => {
    const script = resolve(process.cwd(), "scripts/transcribe.py");
    const model = process.env.WHISPER_MODEL || "base";
    const cacheDir = process.env.WHISPER_CACHE_DIR || resolve(process.cwd(), ".whisper-cache");
    const directory = await mkdtemp(join(tmpdir(), "baokuan-whisper-chunks-"));
    try {
      const chunkPattern = join(directory, "chunk-%04d.wav");
      await runCommand("ffmpeg", ["-hide_banner", "-loglevel", "error", "-i", mediaPath, "-ar", "16000", "-ac", "1", "-f", "segment", "-segment_time", "30", "-c:a", "pcm_s16le", chunkPattern], 5 * 60 * 1000);
      const chunks = (await readdir(directory)).filter((file) => file.endsWith(".wav")).sort();
      if (!chunks.length) throw new TranscriptionError("没有从媒体文件中提取到可识别的音轨。", 422, "NO_AUDIO");
      const segments: TranscriptResult["segments"] = [];
      const textParts: string[] = [];
      let language = "";
      let languageProbability = 0;
      let duration = 0;
      for (let index = 0; index < chunks.length; index += 1) {
        const args = [script, join(directory, chunks[index]), "--model", model, "--cache-dir", cacheDir, "--worker"];
        if (language) args.push("--language", language);
        const { stdout } = await runCommand(pythonPath(), args, 3 * 60 * 1000);
        let parsed: TranscriptResult | { error?: string };
        try {
          parsed = JSON.parse(stdout.trim()) as TranscriptResult | { error?: string };
        } catch {
          throw new TranscriptionError(`第 ${index + 1} 段语音识别返回了无法解析的结果。`, 500, "INVALID_RESULT");
        }
        if ("error" in parsed && parsed.error) throw new TranscriptionError(parsed.error);
        const result = parsed as TranscriptResult;
        language ||= result.language;
        languageProbability ||= result.languageProbability;
        duration += result.duration;
        const offset = index * 30;
        for (const segment of result.segments) segments.push({ ...segment, start: Number((segment.start + offset).toFixed(2)), end: Number((segment.end + offset).toFixed(2)) });
        if (result.transcript) textParts.push(result.transcript);
      }
      const transcript = textParts.join("\n").trim();
      if (!transcript) throw new TranscriptionError("没有在媒体文件中识别到清晰语音。", 422, "NO_SPEECH");
      return { transcript, language, languageProbability, duration, segments };
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}

async function downloadAudio(rawUrl: string, directory: string) {
  const sourceUrl = extractSourceUrl(rawUrl);
  if (!sourceUrl) throw new TranscriptionError("没有识别到有效的视频链接。", 400, "INVALID_URL");
  const output = join(directory, "source.%(ext)s");
  const args = [
    "--no-playlist",
    "--no-warnings",
    "--match-filter", "duration <= 1800 & !is_live",
    "--max-filesize", "150M",
    "--extract-audio",
    "--audio-format", "m4a",
    "--audio-quality", "0",
    "--write-info-json",
    "--output", output,
  ];
  if (process.env.DOUYIN_COOKIES_FILE) args.push("--cookies", process.env.DOUYIN_COOKIES_FILE);
  if (process.env.DOUYIN_BROWSER_COOKIES) args.push("--cookies-from-browser", process.env.DOUYIN_BROWSER_COOKIES);
  args.push(sourceUrl);

  try {
    await runCommand(process.env.YT_DLP_PATH || "yt-dlp", args, 4 * 60 * 1000);
  } catch (error) {
    const message = error instanceof Error ? error.message : "视频下载失败。";
    if (/fresh cookies|cookies-from-browser|Sign in|登录|cookie/i.test(message)) {
      throw new TranscriptionError("抖音要求有效访客 Cookie 才能下载音轨。请上传视频/音频，或由管理员配置 DOUYIN_COOKIES_FILE 后重试。", 422, "DOUYIN_COOKIES_REQUIRED");
    }
    throw error;
  }

  const files = await readdir(directory);
  const audio = files.find((file) => file.startsWith("source.") && !file.endsWith(".part") && [".wav", ".m4a", ".mp3", ".webm", ".opus"].includes(extname(file).toLowerCase()));
  if (!audio) throw new TranscriptionError("视频已解析，但没有找到可转写的音轨。", 422, "NO_AUDIO");
  let metadata: { title?: string; description?: string } = {};
  const infoFile = files.find((file) => file.endsWith(".info.json"));
  if (infoFile) {
    try {
      const info = JSON.parse(await readFile(join(directory, infoFile), "utf8")) as { title?: unknown; description?: unknown };
      metadata = {
        title: typeof info.title === "string" ? info.title.trim() : undefined,
        description: typeof info.description === "string" ? info.description.trim() : undefined,
      };
    } catch {
      metadata = {};
    }
  }
  return { audioPath: join(directory, audio), metadata };
}

export async function transcribeVideoUrl(rawUrl: string): Promise<TranscriptResult> {
  const sourceUrl = extractSourceUrl(rawUrl);
  if (!sourceUrl) throw new TranscriptionError("没有识别到有效的视频链接。", 400, "INVALID_URL");
  const cached = transcriptCache.get(sourceUrl);
  if (cached && cached.expiresAt > Date.now()) return cached.result;

  const directory = await mkdtemp(join(tmpdir(), "baokuan-video-"));
  try {
    const { audioPath, metadata } = await downloadAudio(sourceUrl, directory);
    const result = { ...(await transcribeMediaFile(audioPath)), ...metadata };
    transcriptCache.set(sourceUrl, { expiresAt: Date.now() + 60 * 60 * 1000, result });
    if (transcriptCache.size > 20) transcriptCache.delete(transcriptCache.keys().next().value as string);
    return result;
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
}
