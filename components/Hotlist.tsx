"use client";

import { Check, ChevronDown, ChevronUp, CircleHelp, Copy, Radio, RefreshCw, WandSparkles, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import type { HotTopic } from "@/lib/types";

type HotlistProps = {
  topics: HotTopic[];
  selectedTopic: string;
  onSelect: (topic: HotTopic) => void;
};

export function Hotlist({ topics, selectedTopic, onSelect }: HotlistProps) {
  const [mobileExpanded, setMobileExpanded] = useState(false);
  const [items, setItems] = useState(topics);
  const [updatedAt, setUpdatedAt] = useState("");
  const [sourceMode, setSourceMode] = useState<"fallback" | "authorized" | "weibo-browser" | "weibo-public" | "public">("fallback");
  const [loading, setLoading] = useState(false);
  const [checked, setChecked] = useState(false);
  const [warning, setWarning] = useState("");
  const [setupOpen, setSetupOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    setWarning("");
    try {
      const response = await fetch("/api/hotlist", { cache: "no-store" });
      const payload = await response.json() as { topics?: HotTopic[]; updatedAt?: string; live?: boolean; source?: string; provider?: string; warning?: string };
      if (!response.ok || !Array.isArray(payload.topics) || !payload.topics.length) throw new Error(payload.warning || "热榜暂时没有数据。");
      setItems(payload.topics);
      setUpdatedAt(payload.updatedAt || new Date().toISOString());
      setSourceMode(payload.provider === "authorized" ? "authorized" : payload.source === "weibo-browser" ? "weibo-browser" : payload.source === "weibo-public" ? "weibo-public" : payload.source === "public-rss" ? "public" : "fallback");
      if (payload.warning) setWarning(payload.warning);
    } catch (error) {
      setWarning(error instanceof Error ? error.message : "热榜暂时无法更新。");
      setSourceMode("fallback");
    } finally {
      setLoading(false);
      setChecked(true);
    }
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  useEffect(() => {
    // Only offer the local browser setup after all public sources have failed.
    // Public visitors should not be shown a setup flow that cannot access their Chrome.
    if (!checked || sourceMode !== "fallback") return;
    if (window.localStorage.getItem("baokuan-weibo-setup-seen") !== "1") setSetupOpen(true);
  }, [checked, sourceMode]);

  function closeSetup() {
    window.localStorage.setItem("baokuan-weibo-setup-seen", "1");
    setSetupOpen(false);
  }

  function formatUpdatedAt(value: string) {
    if (!value) return "正在获取最新数据";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "最近更新";
    return `最近更新 ${date.toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" })}`;
  }

  const displayItems = items;
  const setupSnippet = "WEIBO_BROWSER_COOKIES=chrome\nWEIBO_COOKIE_PYTHON_PATH=.venv/bin/python";

  async function copySetup() {
    try {
      await navigator.clipboard.writeText(setupSnippet);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }

  return (
    <section className="hotlist-band" aria-labelledby="hotlist-title">
      <div className="section-head">
        <div>
          <div className="section-title" id="hotlist-title"><Radio size={17} />{sourceMode === "authorized" || sourceMode === "weibo-browser" || sourceMode === "weibo-public" ? "微博体育热榜" : "体育资讯热点"}</div>
          <div className="section-note">{sourceMode === "authorized" ? "授权供应商" : sourceMode === "weibo-browser" ? "本地 Chrome 已登录会话" : sourceMode === "weibo-public" ? "微博公开接口 · 体育筛选" : sourceMode === "public" ? "公开体育资讯聚合" : "备用数据"} · {formatUpdatedAt(updatedAt)}</div>
        </div>
        <div className="section-actions">
          <span className={`live-state ${sourceMode !== "authorized" && sourceMode !== "weibo-browser" && sourceMode !== "weibo-public" && sourceMode !== "public" ? "fallback" : ""}`}><span />{sourceMode === "authorized" ? "微博授权" : sourceMode === "weibo-browser" || sourceMode === "weibo-public" ? "微博体育" : sourceMode === "public" ? "自动聚合" : "备用数据"}</span>
          <button className="button compact ghost" type="button" onClick={() => setSetupOpen((value) => !value)} aria-expanded={setupOpen}><CircleHelp size={15} />连接设置</button>
          <button className="icon-button ghost" type="button" onClick={() => void refresh()} disabled={loading} aria-label="刷新热榜" title="刷新热榜"><RefreshCw className={loading ? "spin" : ""} size={16} /></button>
          <span className="top-count">TOP {displayItems.length}</span>
        </div>
      </div>
      <div className="hot-grid">
        {[...displayItems].sort((a, b) => a.rank - b.rank).map((item, index) => {
          const changeClass = item.change.startsWith("↑") ? "up" : item.change.startsWith("↓") ? "down" : item.change === "新" ? "new" : "";
          return (
            <div className={`hot-row ${selectedTopic === item.topic ? "active" : ""} ${index >= 5 && !mobileExpanded ? "mobile-hidden" : ""}`} key={item.rank} title={item.source ? `来源：${item.source}` : undefined}>
              <span className="rank">{item.rank}</span>
              <span className="topic">{item.topic}</span>
              <span className="heat">{item.heat}</span>
              <span className={`change ${changeClass}`}>{item.change}</span>
              <button className="hot-action" type="button" disabled={!item.url} onClick={() => onSelect(item)} aria-label={item.url ? `用${item.topic}生成内容` : `${item.topic}暂无来源链接`} title={item.url ? "一键生成" : "暂无来源链接"}>
                <WandSparkles size={15} />
              </button>
            </div>
          );
        })}
      </div>
      {warning && <div className="hotlist-warning" role="status">{warning} 公网访客无需配置 Cookie；本地自部署者可按连接设置尝试启用 Chrome 会话。</div>}
      {setupOpen && <div className="hotlist-setup" role="dialog" aria-label="微博热榜连接设置">
        <div className="hotlist-setup-head"><div><strong>热榜数据连接说明</strong><span>公网访客无需配置 Cookie；只有本机自部署者可以选择连接自己的 Chrome 会话。</span></div><button className="icon-button ghost" type="button" onClick={closeSetup} aria-label="关闭连接设置"><X size={16} /></button></div>
        <p className="hotlist-setup-note">当前页面已自动尝试公开或授权数据源。连接失败时会显示公开体育资讯或备用数据，并明确标注来源；这不会阻止内容生成。</p>
        <ol className="hotlist-setup-steps"><li>如果你只是访问公网网站：不需要输入微博 Cookie，直接设置 DeepSeek API Key 即可生成内容。</li><li>如果你在自己的电脑运行项目：先在 Chrome 登录微博，并打开一次体育热榜页面。</li><li>在本地项目目录安装依赖，并在 <code>.env.local</code> 中加入下面两行：</li></ol>
        <div className="hotlist-setup-code"><pre>{setupSnippet}</pre><button className="icon-button ghost" type="button" onClick={() => void copySetup()} aria-label="复制连接配置" title="复制配置">{copied ? <Check size={16} /> : <Copy size={16} />}</button></div>
        <ol className="hotlist-setup-steps" start={4}><li>重启开发服务，再点击刷新按钮。</li><li>看到“本地 Chrome 已登录会话 / 微博体育”后，说明本机连接完成。</li></ol>
        <p className="hotlist-setup-note">安全边界：Cookie 只在本地服务进程内读取，不会显示、保存或发送给 AI。云服务器没有个人 Chrome 会话；正式上线的稳定微博热榜应配置拥有再分发权限的供应商。</p>
      </div>}
      <button className="mobile-hot-toggle" type="button" onClick={() => setMobileExpanded((value) => !value)}>
        {mobileExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        {mobileExpanded ? "收起热榜" : "查看全部 20 条"}
      </button>
    </section>
  );
}
