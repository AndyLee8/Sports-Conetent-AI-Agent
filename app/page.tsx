"use client";

import { KeyRound, ShieldCheck, Zap } from "lucide-react";
import { useState } from "react";
import { ApiKeyDialog } from "@/components/ApiKeyDialog";
import { Hotlist } from "@/components/Hotlist";
import { Workbench } from "@/components/Workbench";
import { demoHotTopics } from "@/lib/demo-data";
import type { HotTopic } from "@/lib/types";

export default function Home() {
  const [apiKey, setApiKey] = useState("");
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [selectedTopic, setSelectedTopic] = useState(demoHotTopics[0].topic);
  const [source, setSource] = useState("");

  function selectTopic(topic: HotTopic) {
    setSelectedTopic(topic.topic);
    if (topic.url) setSource(topic.url);
    document.getElementById("content-desk")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark"><Zap size={19} /></span>
          <span><strong>爆款写手</strong><small>体育内容 AI Agent</small></span>
        </div>
        <div className="service-state"><span />体育热点 · 来源透明</div>
        <button className="button ghost" type="button" onClick={() => setKeyDialogOpen(true)}>
          {apiKey ? <ShieldCheck size={16} /> : <KeyRound size={16} />}{apiKey ? "API 已就绪" : "设置 API Key"}
        </button>
      </header>
      <Hotlist topics={demoHotTopics} selectedTopic={selectedTopic} onSelect={selectTopic} />
      <div id="content-desk"><Workbench source={source} topic={selectedTopic} onSourceChange={setSource} apiKey={apiKey} onNeedApiKey={() => setKeyDialogOpen(true)} /></div>
      <ApiKeyDialog open={keyDialogOpen} ready={Boolean(apiKey)} onClose={() => setKeyDialogOpen(false)} onSave={(key) => { setApiKey(key); setKeyDialogOpen(false); }} />
    </div>
  );
}
