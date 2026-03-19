import { useEffect, useState } from "react";
import type {
  StrategyPluginSnapshot,
  Task,
  TaskUpdateInput,
} from "@ai-todo/contracts";

interface TaskListViewProps {
  tasks: Task[];
  strategy: StrategyPluginSnapshot;
  onCompleteTask: (taskId: string) => Promise<void>;
  onArchiveTask: (taskId: string) => Promise<void>;
  onRememberTask: (task: Task) => Promise<void>;
  onUpdateTask: (
    taskId: string,
    patch: Omit<TaskUpdateInput, "id">,
  ) => Promise<void>;
}

interface TaskRowProps {
  task: Task;
  strategy: StrategyPluginSnapshot;
  onCompleteTask: (taskId: string) => Promise<void>;
  onArchiveTask: (taskId: string) => Promise<void>;
  onRememberTask: (task: Task) => Promise<void>;
  onUpdateTask: (
    taskId: string,
    patch: Omit<TaskUpdateInput, "id">,
  ) => Promise<void>;
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

const dateInputValueFrom = (value: string | null | undefined) =>
  value ? value.slice(0, 10) : "";

const toDueAtIso = (value: string) => {
  if (!value) {
    return null;
  }

  return new Date(`${value}T12:00:00`).toISOString();
};

function EditableTaskRow({
  task,
  strategy,
  onCompleteTask,
  onArchiveTask,
  onRememberTask,
  onUpdateTask,
}: TaskRowProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [noteDraft, setNoteDraft] = useState(task.notes ?? "");
  const [isSavingNotes, setIsSavingNotes] = useState(false);

  useEffect(() => {
    setNoteDraft(task.notes ?? "");
  }, [task.id, task.notes]);

  const saveNotes = async () => {
    const normalized = noteDraft.trim();
    const nextValue = normalized ? normalized : null;
    if ((task.notes ?? null) === nextValue) {
      return;
    }

    setIsSavingNotes(true);
    try {
      await onUpdateTask(task.id, { notes: nextValue });
    } finally {
      setIsSavingNotes(false);
    }
  };

  const handleQuickUpdate = async (
    field: "status" | "priority" | "strategyBucket" | "dueAt",
    value: string,
  ) => {
    if (field === "dueAt") {
      await onUpdateTask(task.id, { dueAt: toDueAtIso(value) });
      return;
    }

    if (field === "status") {
      await onUpdateTask(task.id, { status: value as Task["status"] });
      return;
    }

    if (field === "priority") {
      await onUpdateTask(task.id, { priority: value as Task["priority"] });
      return;
    }

    await onUpdateTask(task.id, { strategyBucket: value });
  };

  return (
    <article className="task-row">
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
          {task.tags.length > 0 ? <span>标签: {task.tags.join(" / ")}</span> : null}
          {task.dueAt ? (
            <span>截止: {new Date(task.dueAt).toLocaleDateString()}</span>
          ) : (
            <span>截止: 未设置</span>
          )}
          <span>
            看板列:{" "}
            {strategy.boardConfig.columns.find((column) => column.id === task.strategyBucket)
              ?.label ?? task.strategyBucket}
          </span>
        </div>

        {isEditing ? (
          <div className="task-inline-editor">
            <label>
              <span>状态</span>
              <select
                value={task.status}
                onChange={(event) =>
                  void handleQuickUpdate("status", event.target.value)
                }
              >
                {Object.entries(statusLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>优先级</span>
              <select
                value={task.priority}
                onChange={(event) =>
                  void handleQuickUpdate("priority", event.target.value)
                }
              >
                {Object.entries(priorityLabel).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>看板列</span>
              <select
                value={task.strategyBucket}
                onChange={(event) =>
                  void handleQuickUpdate("strategyBucket", event.target.value)
                }
              >
                {strategy.boardConfig.columns.map((column) => (
                  <option key={column.id} value={column.id}>
                    {column.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span>截止日期</span>
              <input
                type="date"
                value={dateInputValueFrom(task.dueAt)}
                onChange={(event) =>
                  void handleQuickUpdate("dueAt", event.target.value)
                }
              />
            </label>
            <label className="task-notes-field">
              <span>任务备注</span>
              <textarea
                value={noteDraft}
                onChange={(event) => setNoteDraft(event.target.value)}
                onBlur={() => void saveNotes()}
                placeholder="补充上下文、阻塞点或交接信息"
              />
            </label>
            <div className="task-inline-editor-actions">
              <button
                type="button"
                className="task-action-button"
                onClick={() => void saveNotes()}
                disabled={isSavingNotes}
              >
                保存备注
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={() => setIsEditing(false)}
              >
                收起编辑
              </button>
            </div>
          </div>
        ) : null}
      </div>
      <div className="task-row-actions">
        <button
          type="button"
          className="task-action-button"
          onClick={() => setIsEditing((current) => !current)}
        >
          {isEditing ? "收起" : "编辑"}
        </button>
        <button
          type="button"
          className="task-action-button"
          onClick={() => void onCompleteTask(task.id)}
          disabled={task.status === "done"}
        >
          完成
        </button>
        <button
          type="button"
          className="task-action-button"
          onClick={() => void onArchiveTask(task.id)}
        >
          归档
        </button>
        <button
          type="button"
          className="task-action-button"
          onClick={() => void onRememberTask(task)}
        >
          存入记忆
        </button>
      </div>
    </article>
  );
}

export function TaskListView({
  tasks,
  strategy,
  onCompleteTask,
  onArchiveTask,
  onRememberTask,
  onUpdateTask,
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
                  <EditableTaskRow
                    key={task.id}
                    task={task}
                    strategy={strategy}
                    onCompleteTask={onCompleteTask}
                    onArchiveTask={onArchiveTask}
                    onRememberTask={onRememberTask}
                    onUpdateTask={onUpdateTask}
                  />
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
