import type { StrategyPluginSnapshot, Task } from "@ai-todo/contracts";

interface TaskListViewProps {
  tasks: Task[];
  strategy: StrategyPluginSnapshot;
  pending: boolean;
  onCompleteTask: (taskId: string) => void;
  onArchiveTask: (taskId: string) => void;
  onRememberTask: (task: Task) => void;
  onStartFocusSession: () => void;
}

const priorityLabel: Record<Task["priority"], string> = {
  low: "低优先级",
  medium: "中优先级",
  high: "高优先级",
};

const statusLabel: Record<Task["status"], string> = {
  inbox: "收件箱",
  next: "下一步",
  waiting: "等待中",
  done: "已完成",
  archived: "已归档",
};

const statusToneClass: Record<Task["status"], string> = {
  inbox: "tone-inbox",
  next: "tone-next",
  waiting: "tone-waiting",
  done: "tone-done",
  archived: "tone-archived",
};

export function TaskListView({
  tasks,
  strategy,
  pending,
  onCompleteTask,
  onArchiveTask,
  onRememberTask,
  onStartFocusSession,
}: TaskListViewProps) {
  const visibleTasks = tasks.filter((task) => task.status !== "archived");
  const groupedColumns = strategy.boardConfig.columns
    .map((column) => ({
      ...column,
      tasks: visibleTasks.filter((task) => task.strategyBucket === column.id),
    }))
    .filter((column) => column.tasks.length > 0);

  return (
    <section className="panel list-panel">
      <div className="list-panel-toolbar">
        <div className="list-panel-tools">
          <span className="list-filter-pill">策略: {strategy.name}</span>
          <span className="list-filter-pill">任务: {visibleTasks.length}</span>
          {strategy.id === "deep-work" ? (
            <button
              type="button"
              className="ghost-button"
              onClick={onStartFocusSession}
            >
              开始 25 分钟专注
            </button>
          ) : null}
        </div>
      </div>

      {groupedColumns.length > 0 ? (
        <div className="task-feed" data-testid="task-list-view">
          {groupedColumns.map((column) => (
            <section key={column.id} className="task-group">
              <header className="task-group-header">
                <div>
                  <h3>{column.label}</h3>
                  {column.description ? <p>{column.description}</p> : null}
                </div>
                <span>{column.tasks.length}</span>
              </header>
              <div className="task-group-list">
                {column.tasks.map((task) => (
                  <article key={task.id} className="task-row">
                    <div className={`task-status-dot ${statusToneClass[task.status]}`} />
                    <div className="task-row-main">
                      <div className="task-row-top">
                        <strong>{task.title}</strong>
                        <div className="task-row-tags">
                          <span className="pill">{statusLabel[task.status]}</span>
                          <span className="pill">{priorityLabel[task.priority]}</span>
                          <span className="pill">
                            {task.type === "project" ? "项目" : "任务"}
                          </span>
                        </div>
                      </div>
                      <p>{task.notes ?? "还没有补充说明，等待进一步澄清。"}</p>
                      <div className="task-row-meta">
                        {task.tags.length > 0 ? (
                          <span>标签: {task.tags.join(" / ")}</span>
                        ) : null}
                        {task.dueAt ? (
                          <span>
                            截止: {new Date(task.dueAt).toLocaleDateString()}
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <div className="task-row-actions">
                      <button
                        type="button"
                        className="task-action-button"
                        onClick={() => onCompleteTask(task.id)}
                        disabled={pending || task.status === "done"}
                      >
                        完成
                      </button>
                      <button
                        type="button"
                        className="task-action-button"
                        onClick={() => onArchiveTask(task.id)}
                        disabled={pending}
                      >
                        归档
                      </button>
                      <button
                        type="button"
                        className="task-action-button"
                        onClick={() => onRememberTask(task)}
                        disabled={pending}
                      >
                        存入记忆
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="list-empty-state">
          <strong>列表里还没有可展示的任务。</strong>
          <p>试着在上方输入一个项目目标，系统会按当前策略自动拆出可执行任务。</p>
          <div className="empty-strategy-map">
            {strategy.boardConfig.columns.map((column) => (
              <span key={column.id} className="list-filter-pill">
                {column.label}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
