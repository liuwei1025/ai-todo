import type { ConversationTurn } from "@ai-todo/contracts";

interface RecentActivityPanelProps {
  turns: ConversationTurn[];
}

export function RecentActivityPanel({ turns }: RecentActivityPanelProps) {
  const recentTurns = turns.slice(-3).reverse();

  return (
    <section className="panel recent-activity-panel">
      <div className="recent-activity-topbar">
        <span className="pill">{recentTurns.length} 条</span>
      </div>

      {recentTurns.length > 0 ? (
        <div className="recent-activity-list">
          {recentTurns.map((turn) => (
            <article key={turn.id} className={`activity-chip role-${turn.role}`}>
              <strong>{turn.role === "user" ? "你" : "智能体"}</strong>
              <p>{turn.content}</p>
            </article>
          ))}
        </div>
      ) : (
        <div className="recent-activity-empty">
          还没有会话记录。你可以直接输入一个项目或问题开始。
        </div>
      )}
    </section>
  );
}
