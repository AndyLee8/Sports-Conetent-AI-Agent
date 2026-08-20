"use client";

import { KeyRound, ShieldCheck, X } from "lucide-react";
import { FormEvent, useEffect, useRef, useState } from "react";

type ApiKeyDialogProps = {
  open: boolean;
  ready: boolean;
  onClose: () => void;
  onSave: (key: string) => void;
};

export function ApiKeyDialog({ open, ready, onClose, onSave }: ApiKeyDialogProps) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  if (!open) return null;

  function submit(event: FormEvent) {
    event.preventDefault();
    if (!value.trim()) return;
    onSave(value.trim());
    setValue("");
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={onClose}>
      <form className="modal" role="dialog" aria-modal="true" aria-labelledby="api-key-title" onSubmit={submit} onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-head">
          <div>
            <span className="eyebrow"><KeyRound size={14} />模型连接</span>
            <h2 id="api-key-title">DeepSeek API Key</h2>
          </div>
          <button className="icon-button ghost" type="button" onClick={onClose} aria-label="关闭 API Key 设置" title="关闭">
            <X size={18} />
          </button>
        </div>
        <label className="field">
          <span>API Key</span>
          <input ref={inputRef} type="password" value={value} onChange={(event) => setValue(event.target.value)} placeholder="sk-••••••••••••••••" autoComplete="off" />
        </label>
        <p className="modal-note">使用步骤：输入自己的 Key，点击“确认使用”，再开始生成。密钥仅保存在当前页面内存，刷新或关闭页面后自动清除；服务端代码也不会写入日志。公网使用不需要微博 Cookie。</p>
        <div className="modal-actions">
          <button className="button ghost" type="button" onClick={onClose}>取消</button>
          <button className="button primary" type="submit"><ShieldCheck size={16} />{ready ? "更新密钥" : "确认使用"}</button>
        </div>
      </form>
    </div>
  );
}
