import { Fragment, useEffect, useState } from "react";
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
  compact?: boolean;
  onCompleteTask: (taskId: string) => Promise<void>;
  onArchiveTask: (taskId: string) => Promise<void>;
  onRememberTask: (task: Task) => Promise<void>;
  onUpdateTask: (
    taskId: string,
    patch: Omit<TaskUpdateInput, "id">,
  ) => Promise<void>;
}

interface GroupedColumn {
  id: string;
  label: string;
  description?: string;
  tasks: Task[];
}

interface ColumnPreview {
  label: string;
  count: number;
  previewItems: string[];
}

const strategyPresentation = {
  gtd: {
    eyebrow: "GTD Flow",
    title: "先澄清，再推进",
  },
  eisenhower: {
    eyebrow: "Priority Matrix",
    title: "先判断轻重缓急",
  },
  "deep-work": {
    eyebrow: "Focus Design",
    title: "优先保护专注区块",
  },
} satisfies Record<
  StrategyPluginSnapshot["id"],
  { eyebrow: string; title: string }
>;

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
  compact = false,
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
    <article className={`task-row ${compact ? "task-row-compact" : ""}`}>
      <div className={`task-status-dot ${statusToneClass[task.status]}`} />
      <div className="task-row-main">
        <div className="task-row-top">
          <strong>{task.title}</strong>
          <div className="task-row-tags">
            <span className="pill">{statusLabel[task.status]}</span>
            <span className="pill">{priorityLabel[task.priority]}</span>
            {!compact && (
              <span className="pill">
                {task.type === "project" ? "项目" : "任务"}
              </span>
            )}
          </div>
        </div>
        {!compact && (
          <p>{task.notes ?? "还没有补充说明，等待进一步澄清。"}</p>
        )}
        <div className="task-row-meta">
          {task.tags.length > 0 ? <span>标签: {task.tags.join(" / ")}</span> : null}
          {task.dueAt ? (
            <span>截止: {new Date(task.dueAt).toLocaleDateString()}</span>
          ) : (
            <span>截止: 未设置</span>
          )}
          {!compact && (
            <span>
              看板列:{" "}
              {strategy.boardConfig.columns.find((column) => column.id === task.strategyBucket)
                ?.label ?? task.strategyBucket}
            </span>
          )}
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

type SharedRowHandlers = Pick<
  TaskListViewProps,
  "onCompleteTask" | "onArchiveTask" | "onRememberTask" | "onUpdateTask"
>;

function KanbanView({
  groupedColumns,
  strategy,
  ...handlers
}: { groupedColumns: GroupedColumn[]; strategy: StrategyPluginSnapshot } & SharedRowHandlers) {
  return (
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
                {...handlers}
              />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}

const quadrantAxisLabels: Record<string, { row: string; col: string }> = {
  "important-urgent": { row: "重要", col: "紧急" },
  "important-not-urgent": { row: "重要", col: "不紧急" },
  "not-important-urgent": { row: "不重要", col: "紧急" },
  "not-important-not-urgent": { row: "不重要", col: "不紧急" },
};

const quadrantLayout = [
  ["important-urgent", "important-not-urgent"],
  ["not-important-urgent", "not-important-not-urgent"],
] as const;

function QuadrantsView({
  allColumns,
  strategy,
  ...handlers
}: { allColumns: GroupedColumn[]; strategy: StrategyPluginSnapshot } & SharedRowHandlers) {
  const columnById = new Map(allColumns.map((column) => [column.id, column]));

  return (
    <div className="task-quadrants" data-testid="task-list-view">
      <div className="quadrant-corner">
        <span>坐标轴</span>
      </div>
      <div className="quadrant-column-label">
        <strong>X = 紧急</strong>
        <span>需要马上响应</span>
      </div>
      <div className="quadrant-column-label">
        <strong>X = 不紧急</strong>
        <span>可以主动安排节奏</span>
      </div>

      {quadrantLayout.map((row, rowIndex) => (
        <Fragment key={`quadrant-row-${rowIndex}`}>
          <div key={`row-${rowIndex}`} className="quadrant-row-label">
            <strong>{rowIndex === 0 ? "Y = 重要" : "Y = 不重要"}</strong>
            <span>{rowIndex === 0 ? "高价值工作" : "低价值工作"}</span>
          </div>
          {row.map((columnId) => {
            const column = columnById.get(columnId);
            if (!column) {
              return null;
            }

            const axis = quadrantAxisLabels[column.id];

            return (
              <section
                key={column.id}
                className={`task-quadrant-cell ${column.tasks.length === 0 ? "quadrant-empty" : ""}`}
                data-quadrant={column.id}
              >
                <header className="task-group-header">
                  <div>
                    <h3>{column.label}</h3>
                    {axis && (
                      <p className="quadrant-axis-hint">
                        坐标: {axis.row} × {axis.col}
                      </p>
                    )}
                    {column.description ? (
                      <p className="quadrant-description">{column.description}</p>
                    ) : null}
                  </div>
                  <span>{column.tasks.length}</span>
                </header>
                <div className="task-group-list">
                  {column.tasks.length > 0 ? (
                    column.tasks.map((task) => (
                      <EditableTaskRow
                        key={task.id}
                        task={task}
                        strategy={strategy}
                        compact
                        {...handlers}
                      />
                    ))
                  ) : (
                    <p className="quadrant-placeholder">暂无任务</p>
                  )}
                </div>
              </section>
            );
          })}
        </Fragment>
      ))}
    </div>
  );
}

function FocusView({
  allColumns,
  strategy,
  ...handlers
}: { allColumns: GroupedColumn[]; strategy: StrategyPluginSnapshot } & SharedRowHandlers) {
  const [shallowExpanded, setShallowExpanded] = useState(false);

  const deepColumn = allColumns.find((c) => c.id === "deep-focus");
  const supportingColumn = allColumns.find((c) => c.id === "supporting");
  const shallowColumn = allColumns.find((c) => c.id === "shallow-admin");

  return (
    <div className="task-focus-layout" data-testid="task-list-view">
      {deepColumn && (
        <section className="focus-zone focus-zone-deep">
          <header className="task-group-header">
            <div>
              <h3>{deepColumn.label}</h3>
              <p>需要不被打断的专注时段</p>
            </div>
            <span>{deepColumn.tasks.length}</span>
          </header>
          <div className="task-group-list">
            {deepColumn.tasks.length > 0 ? (
              deepColumn.tasks.map((task) => (
                <EditableTaskRow
                  key={task.id}
                  task={task}
                  strategy={strategy}
                  {...handlers}
                />
              ))
            ) : (
              <p className="focus-placeholder">
                还没有深度专注任务，把最需要集中精力的工作放在这里。
              </p>
            )}
          </div>
        </section>
      )}

      {supportingColumn && (
        <section className="focus-zone focus-zone-supporting">
          <header className="task-group-header">
            <div>
              <h3>{supportingColumn.label}</h3>
            </div>
            <span>{supportingColumn.tasks.length}</span>
          </header>
          <div className="task-group-list">
            {supportingColumn.tasks.length > 0 ? (
              supportingColumn.tasks.map((task) => (
                <EditableTaskRow
                  key={task.id}
                  task={task}
                  strategy={strategy}
                  compact
                  {...handlers}
                />
              ))
            ) : (
              <p className="focus-placeholder">暂无支撑性工作</p>
            )}
          </div>
        </section>
      )}

      {shallowColumn && (
        <section className="focus-zone focus-zone-shallow">
          <header className="task-group-header">
            <div>
              <h3>{shallowColumn.label}</h3>
              <p>低认知负荷的行政事务</p>
            </div>
            <button
              type="button"
              className="ghost-button shallow-toggle"
              onClick={() => setShallowExpanded((v) => !v)}
            >
              {shallowExpanded
                ? "收起"
                : `展开 (${shallowColumn.tasks.length})`}
            </button>
          </header>
          {shallowExpanded && (
            <div className="task-group-list">
              {shallowColumn.tasks.length > 0 ? (
                shallowColumn.tasks.map((task) => (
                  <EditableTaskRow
                    key={task.id}
                    task={task}
                    strategy={strategy}
                    compact
                    {...handlers}
                  />
                ))
              ) : (
                <p className="focus-placeholder">暂无浅层事务</p>
              )}
            </div>
          )}
        </section>
      )}
    </div>
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
  const mode = strategy.boardConfig.mode;
  const visibleTasks = tasks.filter((task) => task.status !== "archived");

  const allColumns = strategy.boardConfig.columns.map((column) => ({
    ...column,
    tasks: visibleTasks.filter((task) => task.strategyBucket === column.id),
  }));
  const nonEmptyColumns = allColumns.filter((column) => column.tasks.length > 0);
  const presentation = strategyPresentation[strategy.id];
  const activeTaskCount = visibleTasks.filter((task) => task.status !== "done").length;
  const doneTaskCount = visibleTasks.length - activeTaskCount;
  const columnPreviews: ColumnPreview[] = allColumns.map((column) => ({
    label: column.label,
    count: column.tasks.length,
    previewItems:
      column.tasks.length > 0
        ? column.tasks.slice(0, 2).map((task) => task.title)
        : [column.description ?? "暂无任务"],
  }));

  const handlers: SharedRowHandlers = {
    onCompleteTask,
    onArchiveTask,
    onRememberTask,
    onUpdateTask,
  };

  const hasAnyTasks = nonEmptyColumns.length > 0;

  const renderContent = () => {
    if (mode === "quadrants") {
      return (
        <QuadrantsView
          allColumns={allColumns}
          strategy={strategy}
          {...handlers}
        />
      );
    }

    if (!hasAnyTasks) {
      return (
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
      );
    }

    if (mode === "focus") {
      return (
        <FocusView
          allColumns={allColumns}
          strategy={strategy}
          {...handlers}
        />
      );
    }

    return (
      <KanbanView
        groupedColumns={nonEmptyColumns}
        strategy={strategy}
        {...handlers}
      />
    );
  };

  return (
    <section className="panel list-panel">
      <div className="list-panel-header">
        <div className="list-panel-heading">
          <div>
            <p className="eyebrow">{presentation.eyebrow}</p>
            <h2>{presentation.title}</h2>
          </div>
          <div className="list-panel-stats">
            <span className="pill">进行中 {activeTaskCount}</span>
            <span className="pill">已完成 {doneTaskCount}</span>
            <span className="pill">{strategy.name}</span>
          </div>
        </div>
        <div className="list-summary-grid">
          {columnPreviews.map((column) => (
            <article
              key={column.label}
              className={`list-summary-card ${column.count === 0 ? "is-empty" : ""}`}
            >
              <div className="list-summary-top">
                <strong>{column.label}</strong>
                <span>{column.count}</span>
              </div>
              <div className="list-summary-items">
                {column.previewItems.map((item, index) => (
                  <p key={`${column.label}-${item}`}>
                    {column.count > 0 ? `${index + 1}. ${item}` : item}
                  </p>
                ))}
              </div>
            </article>
          ))}
        </div>
      </div>
      <div className="list-panel-body">{renderContent()}</div>
    </section>
  );
}
