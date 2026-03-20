import type { StrategyId } from "@ai-todo/contracts";
import { strategyShowcaseList } from "../mock/strategyShowcase";
import { getStrategyPlugin } from "../strategies";

interface MockDataPanelProps {
  activeStrategyId: StrategyId;
  loadingStrategyId: StrategyId | null;
  feedback: string | null;
  onApplyPreset: (strategyId: StrategyId) => Promise<void>;
}

export function MockDataPanel({
  activeStrategyId,
  loadingStrategyId,
  feedback,
  onApplyPreset,
}: MockDataPanelProps) {
  return (
    <section className="quick-tools-shell">
      <div className="quick-tools-header">
        <p className="eyebrow">Mock 数据</p>
        <h2>验证策略展示</h2>
      </div>
      <div className="mock-data-grid">
        {strategyShowcaseList.map((preset) => {
          const isActive = preset.strategyId === activeStrategyId;
          const isLoading = preset.strategyId === loadingStrategyId;
          const strategy = getStrategyPlugin(preset.strategyId);

          return (
            <article
              key={preset.strategyId}
              className={`mock-data-card ${isActive ? "active" : ""}`}
            >
              <div className="mock-data-card-top">
                <div>
                  <strong>{preset.name}</strong>
                  <p>{preset.summary}</p>
                </div>
                {isActive ? <span className="pill">当前策略</span> : null}
              </div>
              <p className="mock-data-description">{preset.description}</p>
              <div className="mock-data-columns">
                {preset.tasks
                  .reduce<string[]>((columns, task) => {
                    if (!columns.includes(task.strategyBucket ?? "")) {
                      columns.push(task.strategyBucket ?? "");
                    }
                    return columns;
                  }, [])
                  .map((columnId) => (
                    <span key={columnId} className="list-filter-pill">
                      {strategy.boardConfig.columns.find((column) => column.id === columnId)
                        ?.label ?? columnId}
                    </span>
                  ))}
              </div>
              <button
                type="button"
                className="ghost-button"
                onClick={() => void onApplyPreset(preset.strategyId)}
                disabled={Boolean(loadingStrategyId)}
              >
                {isLoading ? "载入中..." : `载入 ${preset.name}`}
              </button>
            </article>
          );
        })}
      </div>
      {feedback ? <p className="mock-data-feedback">{feedback}</p> : null}
    </section>
  );
}
