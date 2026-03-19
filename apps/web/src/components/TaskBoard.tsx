import type { StrategyPluginSnapshot, Task } from "@ai-todo/contracts";

interface TaskBoardProps {
  tasks: Task[];
  strategy: StrategyPluginSnapshot;
  onStartFocusSession: () => void;
}

const priorityLabel: Record<Task["priority"], string> = {
  low: "低",
  medium: "中",
  high: "高",
};

const statusLabel: Record<Task["status"], string> = {
  inbox: "收件箱",
  next: "下一步",
  waiting: "等待中",
  done: "已完成",
  archived: "已归档",
};

export function TaskBoard({
  tasks,
  strategy,
  onStartFocusSession,
}: TaskBoardProps) {
  return (
    <section className="panel board-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">动态看板</p>
          <h2>{strategy.name} 看板</h2>
        </div>
        {strategy.id === "deep-work" ? (
          <button type="button" className="ghost-button" onClick={onStartFocusSession}>
            开始 25 分钟专注
          </button>
        ) : null}
      </div>
      <div
        className={`board-grid mode-${strategy.boardConfig.mode}`}
        data-testid="task-board"
      >
        {strategy.boardConfig.columns.map((column) => {
          const columnTasks = tasks.filter(
            (task) => task.strategyBucket === column.id && task.status !== "archived",
          );
          return (
            <div key={column.id} className="board-column">
              <div className="board-column-header">
                <div>
                  <h3>{column.label}</h3>
                  {column.description ? <p>{column.description}</p> : null}
                </div>
                <span>{columnTasks.length}</span>
              </div>
              <div className="board-card-list">
                {columnTasks.length > 0 ? (
                  columnTasks.map((task) => (
                    <article key={task.id} className="task-card">
                      <div className="task-card-top">
                        <strong>{task.title}</strong>
                        <span className={`pill priority-${task.priority}`}>
                          {priorityLabel[task.priority]}
                        </span>
                      </div>
                      <p>{task.notes ?? "还没有补充说明，交给智能体来帮你澄清。"}</p>
                      <div className="task-card-meta">
                        <span>{task.type === "project" ? "项目" : "任务"}</span>
                        <span>{statusLabel[task.status]}</span>
                        {task.dueAt ? (
                          <span>{new Date(task.dueAt).toLocaleDateString()}</span>
                        ) : null}
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="empty-column">这一列还没有任务。</div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
