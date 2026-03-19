interface ChatPanelProps {
  draft: string;
  pending: boolean;
  error: string | null;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onFocusChange: (isFocused: boolean) => void;
}

export function ChatPanel({
  draft,
  pending,
  error,
  onDraftChange,
  onSend,
  onFocusChange,
}: ChatPanelProps) {
  return (
    <section className="panel command-panel">
      <div className="command-body">
        <label className="command-input-shell">
          <textarea
            value={draft}
            onChange={(event) => onDraftChange(event.target.value)}
            onFocus={() => onFocusChange(true)}
            onBlur={() => onFocusChange(false)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                onSend();
              }
            }}
            placeholder="例如：帮我把展会项目拆成可执行的下一步行动"
            rows={6}
          />
        </label>

        <div className="command-meta-row">
          <div className="shortcut-hints">
            <span>回车发送</span>
            <span>Shift + 回车换行</span>
            <span>Cmd/Ctrl + K 打开面板</span>
          </div>
          <button
            type="button"
            className="command-send-button"
            onClick={onSend}
            disabled={pending || draft.trim().length === 0}
          >
            {pending ? "正在拆解..." : "发送给智能体"}
          </button>
        </div>

        <div className={`micro-feedback ${error ? "error" : ""}`}>
          {error
            ? error
            : pending
              ? "智能体正在预估下一步行动，请稍候。"
              : "输入时会优先突出当前操作，错误也会停留在这里，不打断任务流。"}
        </div>
      </div>
    </section>
  );
}
