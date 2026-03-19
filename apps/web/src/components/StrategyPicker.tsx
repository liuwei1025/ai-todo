import type { StrategyId } from "@ai-todo/contracts";
import { strategyList } from "../strategies";

interface StrategyPickerProps {
  activeStrategyId: StrategyId;
  onChange: (strategyId: StrategyId) => void;
}

export function StrategyPicker({
  activeStrategyId,
  onChange,
}: StrategyPickerProps) {
  return (
    <div className="strategy-picker">
      {strategyList.map((strategy) => (
        <button
          key={strategy.id}
          type="button"
          className={strategy.id === activeStrategyId ? "active" : ""}
          onClick={() => onChange(strategy.id)}
        >
          <span>{strategy.name}</span>
          <small>{strategy.toolPolicies.emphasis[0]}</small>
        </button>
      ))}
    </div>
  );
}
