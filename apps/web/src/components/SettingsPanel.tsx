import { useEffect, useState } from "react";
import { DEFAULT_AGENT_ENDPOINT } from "../agent/api";

interface SettingsPanelProps {
  agentEndpoint: string;
  activeStrategyName: string;
  onSaveAgentEndpoint: (value: string) => Promise<void>;
}

export function SettingsPanel({
  agentEndpoint,
  activeStrategyName,
  onSaveAgentEndpoint,
}: SettingsPanelProps) {
  const [draftEndpoint, setDraftEndpoint] = useState(agentEndpoint);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setDraftEndpoint(agentEndpoint);
  }, [agentEndpoint]);

  const save = async (nextValue: string) => {
    const normalized = nextValue.trim() || DEFAULT_AGENT_ENDPOINT;
    setIsSaving(true);
    setFeedback(null);
    try {
      await onSaveAgentEndpoint(normalized);
      setDraftEndpoint(normalized);
      setFeedback("已保存到本地设置。");
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <section className="quick-tools-shell settings-panel">
      <div className="quick-tools-header">
        <div>
          <p className="eyebrow">本地设置</p>
          <h2>代理与偏好</h2>
        </div>
        <span className="pill">策略: {activeStrategyName}</span>
      </div>

      <label className="settings-field">
        <span>Agent Proxy Endpoint</span>
        <input
          type="text"
          value={draftEndpoint}
          onChange={(event) => setDraftEndpoint(event.target.value)}
          placeholder={DEFAULT_AGENT_ENDPOINT}
        />
      </label>

      <div className="settings-actions">
        <button
          type="button"
          className="task-action-button"
          onClick={() => void save(draftEndpoint)}
          disabled={isSaving}
        >
          保存
        </button>
        <button
          type="button"
          className="ghost-button"
          onClick={() => void save(DEFAULT_AGENT_ENDPOINT)}
          disabled={isSaving}
        >
          恢复默认
        </button>
      </div>

      <p className="settings-hint">
        默认使用同源 `/api`，开发环境会反向代理到本地 `llm-proxy`，避免浏览器直接请求模型提供商时触发 CORS。
      </p>
      <p className="settings-hint">
        这里改的是智能体代理入口地址，不会影响本地 IndexedDB 里的任务和记忆数据。
      </p>
      {feedback ? <p className="settings-feedback">{feedback}</p> : null}
    </section>
  );
}
