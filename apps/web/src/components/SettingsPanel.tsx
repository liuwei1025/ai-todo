import { useEffect, useState } from "react";

interface SettingsPanelProps {
  agentEndpoint: string;
  activeStrategyName: string;
  onSaveAgentEndpoint: (value: string) => Promise<void>;
}

const DEFAULT_ENDPOINT = "http://localhost:8787";

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
    const normalized = nextValue.trim() || DEFAULT_ENDPOINT;
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
          type="url"
          value={draftEndpoint}
          onChange={(event) => setDraftEndpoint(event.target.value)}
          placeholder={DEFAULT_ENDPOINT}
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
          onClick={() => void save(DEFAULT_ENDPOINT)}
          disabled={isSaving}
        >
          恢复默认
        </button>
      </div>

      <p className="settings-hint">
        当前前端会把脱敏后的上下文发到这个地址，本地 IndexedDB 数据不会因为改 endpoint 而丢失。
      </p>
      {feedback ? <p className="settings-feedback">{feedback}</p> : null}
    </section>
  );
}
