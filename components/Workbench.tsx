"use client";

import { AlertTriangle, AudioLines, Braces, Check, CircleCheck, ClipboardPaste, Copy, FileSearch, FileText, Link2, RefreshCw, Sheet, ShieldCheck, Sparkles, Upload } from "lucide-react";
import { useMemo, useRef, useState } from "react";
import { createDemoContent } from "@/lib/demo-data";
import type { ContentStyle, GeneratedContent } from "@/lib/types";
import { detectSourcePlatform, extractShareCaption, normalizeSourceInput } from "@/lib/source-url";

const styles: ContentStyle[] = ["深度专栏", "短视频口播", "社交媒体短文"];
const stages = [
  ["正在解析链接", 18, "识别来源并提取标题、简介与正文"],
  ["正在整理来源", 38, "清洗重复内容并建立事实清单"],
  ["正在生成内容", 64, "根据风格与渠道组织内容"],
  ["正在核查事实", 84, "比对球队、球员、比分与时间"],
  ["事实核查完成", 100, "7 个关键事实一致 · 自动修正 1 处"],
] as const;

type WorkbenchProps = {
  source: string;
  topic: string;
  onSourceChange: (source: string) => void;
  apiKey: string;
  onNeedApiKey: () => void;
};

function saveFile(filename: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob(["\uFEFF", content], { type }));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function Workbench({ source, topic, onSourceChange, apiKey, onNeedApiKey }: WorkbenchProps) {
  const [style, setStyle] = useState<ContentStyle>("深度专栏");
  const [channel, setChannel] = useState("体育媒体");
  const [sport, setSport] = useState("足球");
  const [length, setLength] = useState("智能推荐");
  const [tone, setTone] = useState("专业克制");
  const [stageIndex, setStageIndex] = useState(0);
  const [hasRun, setHasRun] = useState(false);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState("");
  const [sourceHint, setSourceHint] = useState("");
  const [hintSource, setHintSource] = useState("");
  const [transcribing, setTranscribing] = useState(false);
  const [transcriptInfo, setTranscriptInfo] = useState("");
  const [result, setResult] = useState<GeneratedContent | null>(null);
  const [history, setHistory] = useState<GeneratedContent[]>([]);
  const mediaInputRef = useRef<HTMLInputElement>(null);

  const stage = stages[stageIndex];
  const exportBase = useMemo(() => (result?.title ?? "爆款写手内容").replace(/[\\/:*?"<>|]/g, "").slice(0, 30), [result]);
  const sourcePlatform = useMemo(() => detectSourcePlatform(source), [source]);
  const demoMode = apiKey === "sk-demo-local" || apiKey.startsWith("demo_");
  const normalizedCurrentSource = normalizeSourceInput(source);
  const activeSourceHint = hintSource === normalizedCurrentSource ? sourceHint : "";

  function normalizeSource() {
    const caption = extractShareCaption(source);
    const normalized = normalizeSourceInput(source);
    if (normalized !== source) onSourceChange(normalized);
    if (caption) {
      setSourceHint(caption);
      setHintSource(normalized);
    }
    return normalized;
  }

  function handleSourcePaste(event: React.ClipboardEvent<HTMLInputElement>) {
    const pasted = event.clipboardData.getData("text");
    const normalized = normalizeSourceInput(pasted);
    if (normalized === pasted.trim()) return;
    event.preventDefault();
    onSourceChange(normalized);
    const caption = extractShareCaption(pasted);
    if (caption) {
      setSourceHint(caption);
      setHintSource(normalized);
    }
  }

  function updateSourceHint(value: string) {
    setSourceHint(value);
    setHintSource(normalizeSourceInput(source));
  }

  function formatDuration(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.round(seconds % 60);
    return `${minutes}:${String(remaining).padStart(2, "0")}`;
  }

  async function requestTranscription(formData: FormData) {
    setTranscribing(true);
    setError("");
    setTranscriptInfo("");
    try {
      const response = await fetch("/api/transcribe", { method: "POST", body: formData });
      const payload = await response.json() as { transcript?: string; language?: string; duration?: number; error?: string };
      if (!response.ok || !payload.transcript) throw new Error(payload.error || "语音识别失败。");
      const normalized = normalizeSourceInput(source);
      setSourceHint(payload.transcript);
      setHintSource(normalized);
      setTranscriptInfo(`已识别 ${formatDuration(payload.duration ?? 0)} · ${payload.language || "未知语言"} · ${payload.transcript.length} 字`);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "语音识别失败。");
    } finally {
      setTranscribing(false);
    }
  }

  async function transcribeSourceUrl() {
    const formData = new FormData();
    formData.append("url", normalizeSource());
    await requestTranscription(formData);
  }

  async function transcribeUpload(file: File) {
    const formData = new FormData();
    formData.append("file", file);
    await requestTranscription(formData);
  }

  async function generate() {
    if (!apiKey) {
      onNeedApiKey();
      return;
    }
    setRunning(true);
    setHasRun(true);
    setResult(null);
    setCopied(false);
    setError("");
    for (let index = 0; index < 3; index += 1) {
      setStageIndex(index);
      await new Promise((resolve) => window.setTimeout(resolve, 430));
    }
    try {
      const normalizedSource = normalizeSource();
      if (demoMode) {
        setStageIndex(3);
        await new Promise((resolve) => window.setTimeout(resolve, 520));
        const next = createDemoContent(style, channel);
        setResult(next);
        setHistory((items) => [next, ...items].slice(0, 8));
      } else {
        setStageIndex(3);
        const response = await fetch("/api/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${apiKey}` },
          body: JSON.stringify({ url: normalizedSource, topic, sourceHint: activeSourceHint, style, channel, sport, length, tone }),
        });
        const payload = await response.json() as { content?: Pick<GeneratedContent, "title" | "summary" | "body" | "factCheck">; error?: string };
        if (!response.ok || !payload.content) throw new Error(payload.error || "生成失败，请稍后重试。");
        const next: GeneratedContent = { id: crypto.randomUUID(), style, channel, createdAt: new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" }), ...payload.content };
        setResult(next);
        setHistory((items) => [next, ...items].slice(0, 8));
      }
      setStageIndex(4);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "生成失败，请稍后重试。");
      setStageIndex(3);
    } finally {
      setRunning(false);
    }
  }

  async function copyResult() {
    if (!result) return;
    await navigator.clipboard.writeText(`${result.title}\n\n${result.summary}\n\n${result.body}`);
    setCopied(true);
  }

  function exportMarkdown() {
    if (!result) return;
    saveFile(`${exportBase}.md`, `# ${result.title}\n\n> ${result.summary}\n\n${result.body}`, "text/markdown;charset=utf-8");
  }

  function exportWord() {
    if (!result) return;
    const html = `<html><meta charset="utf-8"><body><h1>${result.title}</h1><p><strong>摘要：</strong>${result.summary}</p>${result.body.split("\n").map((line) => `<p>${line || "&nbsp;"}</p>`).join("")}</body></html>`;
    saveFile(`${exportBase}.doc`, html, "application/msword;charset=utf-8");
  }

  function exportExcel() {
    const items = history.length ? history : result ? [result] : [];
    if (!items.length) return;
    const rows = items.map((item) => `<tr><td>${item.createdAt}</td><td>${item.style}</td><td>${item.channel}</td><td>${item.title}</td><td>${item.summary}</td><td>${item.body.replace(/\n/g, "<br>")}</td></tr>`).join("");
    const html = `<html><meta charset="utf-8"><body><table><tr><th>时间</th><th>风格</th><th>渠道</th><th>标题</th><th>摘要</th><th>正文</th></tr>${rows}</table></body></html>`;
    saveFile("爆款写手-当前会话.xls", html, "application/vnd.ms-excel;charset=utf-8");
  }

  return (
    <main className="workbench">
      <div className="work-head">
        <div>
          <span className="eyebrow"><Sparkles size={14} />AI CONTENT DESK</span>
          <h1>内容生产工作台</h1>
          <p>输入内容来源，选择创作目标，Agent 自动完成抓取、生成与核查。</p>
        </div>
        <span className="mode-label">{!apiKey ? "等待连接模型" : demoMode ? "前端演示模式" : "DeepSeek 实时模式"}</span>
      </div>

      <section className="composer" aria-label="内容生成设置">
        <label className="field source-field">
          <span>内容来源</span>
          <div className="source-row">
            <input value={source} onChange={(event) => onSourceChange(event.target.value)} onPaste={handleSourcePaste} onBlur={normalizeSource} placeholder="粘贴网页、抖音或 B 站链接" />
            <button className="icon-button" type="button" onClick={async () => onSourceChange(normalizeSourceInput(await navigator.clipboard.readText()))} aria-label="粘贴链接" title="粘贴链接"><ClipboardPaste size={17} /></button>
          </div>
          {sourcePlatform && <span className="source-detected"><Link2 size={13} />已识别：{sourcePlatform}链接</span>}
        </label>
        {(sourcePlatform === "抖音" || sourcePlatform === "B站") && <div className="source-hint-field">
          <div className="source-hint-head">
            <span className="field-label">视频字幕与口播内容</span>
            <div className="transcript-actions">
              <button className="button compact" type="button" onClick={transcribeSourceUrl} disabled={transcribing}><AudioLines size={15} />{transcribing ? "正在识别" : "识别链接语音"}</button>
              <button className="button compact" type="button" onClick={() => mediaInputRef.current?.click()} disabled={transcribing}><Upload size={15} />上传视频/音频</button>
              <input ref={mediaInputRef} className="visually-hidden" type="file" accept="video/*,audio/*,.mp4,.mov,.m4v,.webm,.mp3,.m4a,.wav,.aac,.ogg,.opus" onChange={(event) => { const file = event.target.files?.[0]; if (file) void transcribeUpload(file); event.target.value = ""; }} />
            </div>
          </div>
          <textarea className="source-hint-textarea" value={activeSourceHint} onChange={(event) => updateSourceHint(event.target.value)} placeholder="识别结果会自动填入这里，也可以粘贴完整分享文案、字幕或口播稿。" />
          <div className="transcript-meta">{transcribing ? <><RefreshCw className="spin" size={13} />正在下载音轨并识别语音，首次运行需要加载 Whisper 模型</> : transcriptInfo ? <><CircleCheck size={13} />{transcriptInfo}</> : <>深度专栏建议至少提供 300 字有效字幕</>}</div>
        </div>}

        <div className="form-grid">
          <div className="style-field">
            <span className="field-label">内容风格</span>
            <div className="segment" role="group" aria-label="内容风格">
              {styles.map((item) => <button type="button" key={item} className={style === item ? "selected" : ""} onClick={() => setStyle(item)}>{item}</button>)}
            </div>
          </div>
          <label className="field"><span>目标渠道</span><select value={channel} onChange={(event) => setChannel(event.target.value)}><option>体育媒体</option><option>抖音</option><option>微博</option><option>微信公众号</option><option>小红书</option><option>B站</option><option>通用媒体</option></select></label>
          <label className="field"><span>赛事垂类</span><select value={sport} onChange={(event) => setSport(event.target.value)}><option>足球</option><option>篮球</option><option>其他赛事</option></select></label>
          <label className="field"><span>字数范围</span><select value={length} onChange={(event) => setLength(event.target.value)}><option>智能推荐</option><option>300–500字</option><option>800–1200字</option><option>1500–2000字</option></select></label>
          <label className="field"><span>语气</span><select value={tone} onChange={(event) => setTone(event.target.value)}><option>专业克制</option><option>热血激情</option><option>轻松有梗</option><option>犀利观点</option></select></label>
        </div>
        <div className="generate-row">
          <span>热点：{topic} · {sport} · {style} · {channel}</span>
          <button className="button primary generate-button" type="button" onClick={generate} disabled={running}><Sparkles size={17} />{running ? "Agent 执行中" : "开始生成"}</button>
        </div>
      </section>

      <div className="agent-bar" aria-live="polite">
        <div className="agent-state">{running ? <RefreshCw className="spin" size={17} /> : <CircleCheck size={17} />}<span>{hasRun ? stage[0] : "等待开始"}</span></div>
        <div className="progress"><span style={{ width: hasRun ? `${stage[1]}%` : "0%" }} /></div>
        <div className="agent-note">{hasRun ? stage[2] : "选择来源、内容风格和目标渠道后开始生成"}</div>
      </div>
      {error && <div className="workflow-error" role="alert"><span>{error}</span><button type="button" onClick={() => setError("")}>关闭</button></div>}

      {result ? <section className="result" aria-label="生成结果">
        <div className="result-head">
          <div className="result-title">生成结果 <span className={result.factCheck.passed ? "verified" : "verified warning"}>{result.factCheck.passed ? <ShieldCheck size={14} /> : <AlertTriangle size={14} />}{result.factCheck.passed ? "已核查" : "需要复核"}</span></div>
          <div className="tools">
            <button className="button compact" type="button" onClick={copyResult}>{copied ? <Check size={15} /> : <Copy size={15} />}{copied ? "已复制" : "复制"}</button>
            <button className="button compact" type="button" onClick={exportWord}><FileText size={15} />Word</button>
            <button className="button compact" type="button" onClick={exportMarkdown}><Braces size={15} />Markdown</button>
            <button className="button compact" type="button" onClick={exportExcel}><Sheet size={15} />Excel</button>
          </div>
        </div>
        <div className="result-grid">
          <article className="editor">
            <p className="kicker">{result.style} · {result.channel}</p>
            <h2>{result.title}</h2>
            <p className="summary">{result.summary}</p>
            <div className="article-body">{result.body}</div>
          </article>
          <aside className="fact-panel">
            <h3>事实核查报告</h3>
            <p>依据来源正文与字幕逐项比对</p>
            <Fact icon={result.factCheck.passed ? <Check size={15} /> : <AlertTriangle size={15} />} title="核查状态" detail={`${result.factCheck.checked} 个事实已检查`} />
            <Fact icon={<RefreshCw size={14} />} title="自动修正" detail={`${result.factCheck.corrected} 处内容已修正`} />
            {result.factCheck.notes.slice(0, 3).map((note, index) => <Fact key={`${note}-${index}`} icon={<Check size={15} />} title={`核查说明 ${index + 1}`} detail={note} />)}
          </aside>
        </div>
      </section> : <section className="result-empty" aria-label="等待生成"><FileSearch size={25} /><div><strong>{error ? "本次任务未生成内容" : "等待生成内容"}</strong><p>{error ? "请根据上方提示补充有效材料后重新生成。" : "生成完成后，标题、摘要、正文与事实核查报告将在这里显示。"}</p></div></section>}

      {history.length > 0 && <section className="history"><div className="history-head"><strong>当前会话</strong><span>{history.length} 条生成记录</span></div>{history.map((item) => <div className="history-row" key={item.id}><span>{item.createdAt}</span><span>{item.style}</span><strong>{item.title}</strong><span>{item.channel}</span></div>)}</section>}
    </main>
  );
}

function Fact({ icon, title, detail }: { icon: React.ReactNode; title: string; detail: string }) {
  return <div className="fact-row"><span>{icon}</span><div><strong>{title}</strong><small>{detail}</small></div></div>;
}
