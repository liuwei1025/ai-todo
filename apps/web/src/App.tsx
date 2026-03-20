import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type {
  Memory,
  StrategyId,
  Task,
  TaskUpdateInput,
} from "@ai-todo/contracts";
import { useLiveQuery } from "dexie-react-hooks";
import { ChatPanel } from "./components/ChatPanel";
import { MemoryPanel } from "./components/MemoryPanel";
import { MockDataPanel } from "./components/MockDataPanel";
import { RecentActivityPanel } from "./components/RecentActivityPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { StrategyPicker } from "./components/StrategyPicker";
import { TaskListView } from "./components/TaskListView";
import {
  createRemoteAgentClient,
  DEFAULT_AGENT_ENDPOINT,
  type AgentClient,
} from "./agent/api";
import { buildAIContextBundle } from "./agent/context";
import {
  BrowserEmbeddingClient,
  type EmbeddingClientLike,
} from "./agent/embedding";
import { executeToolCalls } from "./agent/tools";
import { db as defaultDb, type AITodoDB } from "./db/database";
import { createRepositories } from "./db/repositories";
import { getStrategyShowcasePreset } from "./mock/strategyShowcase";
import { getStrategyPlugin, strategyList } from "./strategies";

interface AppProps {
  database?: AITodoDB;
  agentClient?: AgentClient;
  embeddingClient?: EmbeddingClientLike;
}

interface PreviewSection {
  title: string;
  items: string[];
}

type FocusSessionState = "idle" | "running" | "paused";

const defaultEmbeddingClient = new BrowserEmbeddingClient();
const FOCUS_DURATION_SECONDS = 25 * 60;

const formatFocusTime = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;

function FocusControlIcon({ kind }: { kind: "start" | "pause" | "stop" }) {
  if (kind === "pause") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="button-icon">
        <rect x="3" y="2.5" width="3.2" height="11" rx="1" fill="currentColor" />
        <rect x="9.8" y="2.5" width="3.2" height="11" rx="1" fill="currentColor" />
      </svg>
    );
  }

  if (kind === "stop") {
    return (
      <svg viewBox="0 0 16 16" aria-hidden="true" className="button-icon">
        <rect x="3" y="3" width="10" height="10" rx="2" fill="currentColor" />
      </svg>
    );
  }

  return (
    <svg viewBox="0 0 16 16" aria-hidden="true" className="button-icon">
      <path d="M4 2.8v10.4c0 .63.68 1.02 1.22.7l7.46-4.94a.82.82 0 0 0 0-1.38L5.22 2.1A.82.82 0 0 0 4 2.8Z" fill="currentColor" />
    </svg>
  );
}

const draftPreviewFrom = (
  draft: string,
  strategyId: StrategyId,
  highlightedMemories: Memory[],
): PreviewSection[] => {
  const normalized = draft.trim();
  if (!normalized) {
    return [
      {
        title: "智能预判",
        items: [
          "识别项目、下一步行动和潜在阻塞点。",
          `根据当前策略自动调整分组方式：${getStrategyPlugin(strategyId).name}。`,
          "发送前就会优先参考最近命中的长期记忆。",
        ],
      },
    ];
  }

  const rawSegments = normalized
    .split(/[，。；、\n]/)
    .map((segment) => segment.trim())
    .filter(Boolean);

  const focusLabel =
    strategyId === "gtd"
      ? "澄清下一步行动"
      : strategyId === "eisenhower"
        ? "按重要和紧急排序"
        : "压缩浅层事务，保留专注窗口";

  const extractedTasks = rawSegments.slice(0, 3).map((segment, index) => {
    if (segment.length <= 18) {
      return `候选动作 ${index + 1}: ${segment}`;
    }
    return `候选动作 ${index + 1}: ${segment.slice(0, 18)}...`;
  });

  return [
    {
      title: "智能预判",
      items: [
        `输入意图已捕捉，接下来会优先${focusLabel}。`,
        ...(extractedTasks.length > 0
          ? extractedTasks
          : ["输入较短，系统会先帮你补全上下文。"]),
      ],
    },
    {
      title: "策略落点",
      items: getStrategyPlugin(strategyId).boardConfig.columns
        .slice(0, 3)
        .map((column) => `可能进入「${column.label}」分组`),
    },
    {
      title: "关联记忆",
      items:
        highlightedMemories.length > 0
          ? highlightedMemories.map((memory) => memory.summary)
          : ["暂未命中高相关长期记忆，会优先依赖当前输入进行拆解。"],
    },
  ];
};

export default function App({
  database = defaultDb,
  agentClient,
  embeddingClient = defaultEmbeddingClient,
}: AppProps) {
  const repositories = useMemo(() => createRepositories(database), [database]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastRetrievedMemoryIds, setLastRetrievedMemoryIds] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [focusSessionState, setFocusSessionState] = useState<FocusSessionState>("idle");
  const [focusSecondsLeft, setFocusSecondsLeft] = useState<number | null>(null);
  const focusTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [isCommandFocused, setIsCommandFocused] = useState(false);
  const [isUtilityDrawerOpen, setIsUtilityDrawerOpen] = useState(false);
  const [loadingStrategyPresetId, setLoadingStrategyPresetId] = useState<StrategyId | null>(
    null,
  );
  const [mockDataFeedback, setMockDataFeedback] = useState<string | null>(null);

  const activeStrategySetting = useLiveQuery(
    () => repositories.settings.get("activeStrategyId"),
    [database],
  );
  const agentEndpointSetting = useLiveQuery(
    () => repositories.settings.get("agentEndpoint"),
    [database],
  );
  const tasks = useLiveQuery(() => repositories.tasks.listAll(), [database], []);
  const turns = useLiveQuery(() => repositories.turns.listRecent(10), [database], []);
  const memories = useLiveQuery(
    () => repositories.memories.listAll(),
    [database],
    [],
  );

  const activeStrategyId =
    (activeStrategySetting?.value as StrategyId | undefined) ?? "gtd";
  const activeStrategy = getStrategyPlugin(activeStrategyId);
  const visibleTaskCount = tasks.filter((task) => task.status !== "archived").length;
  const latestAssistantTurn = [...turns]
    .reverse()
    .find((turn) => turn.role === "assistant");
  const highlightedMemories = memories.filter((memory) =>
    lastRetrievedMemoryIds.includes(memory.id),
  );
  const previewSections = draftPreviewFrom(
    draft,
    activeStrategyId,
    highlightedMemories,
  );

  useEffect(() => {
    document.documentElement.setAttribute("data-strategy", activeStrategyId);
  }, [activeStrategyId]);

  useEffect(() => {
    repositories.settings.ensureDefaults().catch((reason: unknown) => {
      console.error("初始化设置失败", reason);
    });
  }, [repositories]);

  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsUtilityDrawerOpen((current) => !current);
      }

      if (event.key === "Escape") {
        setIsUtilityDrawerOpen(false);
        setIsCommandFocused(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    return () => {
      if (focusTimerRef.current) {
        clearInterval(focusTimerRef.current);
      }
    };
  }, []);

  const resolvedEndpoint = agentEndpointSetting?.value ?? DEFAULT_AGENT_ENDPOINT;
  const resolvedAgentClient = useMemo(
    () => agentClient ?? createRemoteAgentClient(resolvedEndpoint),
    [agentClient, resolvedEndpoint],
  );

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || pending) {
      return;
    }

    setError(null);
    setMockDataFeedback(null);
    setDraft("");

    await repositories.turns.add("user", message);

    if (!isOnline) {
      setError("当前离线，无法调用远端推理。你仍然可以整理本地任务。");
      return;
    }

    setPending(true);
    try {
      const contextBundle = await buildAIContextBundle({
        database,
        userMessage: message,
        activeStrategy,
        embeddingClient,
        isOnline,
      });
      setLastRetrievedMemoryIds(
        contextBundle.retrievedMemories.map((memory) => memory.id),
      );

      const response = await resolvedAgentClient(contextBundle);
      const toolResults = await executeToolCalls({
        database,
        toolCalls: response.toolCalls,
        currentStrategyId: activeStrategyId,
        embeddingClient,
      });
      const failures = toolResults.filter((r) => r.status === "failed");
      if (failures.length > 0) {
        const summary = failures.map((f) => `${f.name}: ${f.error}`).join("; ");
        setError(`部分操作失败（${failures.length}/${toolResults.length}）：${summary}`);
      }
      await repositories.turns.add("assistant", response.message);
    } catch (reason) {
      const failureMessage =
        reason instanceof Error ? reason.message : "智能体调用失败";
      setError(failureMessage);
    } finally {
      setPending(false);
    }
  };

  const handleStrategyChange = async (strategyId: StrategyId) => {
    await handleApplyMockData(strategyId);
  };

  const stopFocusSession = useCallback(() => {
    if (focusTimerRef.current) {
      clearInterval(focusTimerRef.current);
      focusTimerRef.current = null;
    }
    setFocusSecondsLeft(null);
    setFocusSessionState("idle");
  }, []);

  const startFocusCountdown = useCallback(() => {
    focusTimerRef.current = setInterval(() => {
      setFocusSecondsLeft((prev) => {
        if (prev === null || prev <= 1) {
          stopFocusSession();
          return null;
        }
        return prev - 1;
      });
    }, 1000);
  }, [stopFocusSession]);

  const handleStartFocusSession = useCallback(() => {
    stopFocusSession();
    setFocusSecondsLeft(FOCUS_DURATION_SECONDS);
    setFocusSessionState("running");
    startFocusCountdown();
  }, [startFocusCountdown, stopFocusSession]);

  const handleToggleFocusSession = useCallback(() => {
    if (focusSessionState === "running") {
      if (focusTimerRef.current) {
        clearInterval(focusTimerRef.current);
        focusTimerRef.current = null;
      }
      setFocusSessionState("paused");
      return;
    }

    if (focusSessionState === "paused") {
      setFocusSessionState("running");
      startFocusCountdown();
      return;
    }

    handleStartFocusSession();
  }, [focusSessionState, handleStartFocusSession, startFocusCountdown]);

  const focusPrimaryActionLabel =
    focusSessionState === "idle"
      ? "25 min"
      : formatFocusTime(focusSecondsLeft ?? 0);

  const focusPrimaryActionIcon =
    focusSessionState === "running" ? "pause" : "start";

  const handleCompleteTask = async (taskId: string) => {
    setError(null);
    await handleUpdateTask(taskId, { status: "done" });
  };

  const handleArchiveTask = async (taskId: string) => {
    setError(null);
    setMockDataFeedback(null);
    await repositories.tasks.archiveMany([taskId]);
    await repositories.embeddings.removeForItem(taskId, "task");
  };

  const syncTaskEmbedding = useCallback(
    async (task: Task | null) => {
      if (!task) {
        return;
      }

      const embedding = await embeddingClient.embedText(
        [task.title, task.notes ?? "", task.tags.join(" ")].join(" "),
      );
      await repositories.embeddings.put({
        itemId: task.id,
        itemType: "task",
        content: task.title,
        vector: embedding.vector,
        provider: embedding.provider,
        updatedAt: task.updatedAt,
      });
    },
    [embeddingClient, repositories],
  );

  const syncTaskEmbeddings = useCallback(
    async (taskList: Task[]) => {
      await Promise.all(taskList.map((task) => syncTaskEmbedding(task)));
    },
    [syncTaskEmbedding],
  );

  const handleUpdateTask = async (
    taskId: string,
    patch: Omit<TaskUpdateInput, "id">,
  ) => {
    setError(null);
    setMockDataFeedback(null);
    const updatedTask = await repositories.tasks.updateOne(taskId, patch);
    await syncTaskEmbedding(updatedTask);
  };

  const handleRememberTask = async (task: Task) => {
    setError(null);
    setMockDataFeedback(null);
    const summary = [task.title, task.notes]
      .filter(Boolean)
      .join("：")
      .trim();
    const memory = await repositories.memories.upsert({
      kind: "long_term",
      category: "pattern",
      summary: `任务记录：${summary || "这是一项值得持续追踪的任务。"}。`,
      sourceTurnIds: [],
      salience: 0.72,
    });
    const embedding = await embeddingClient.embedText(memory.summary);
    await repositories.embeddings.put({
      itemId: memory.id,
      itemType: "memory",
      content: memory.summary,
      vector: embedding.vector,
      provider: embedding.provider,
      updatedAt: memory.createdAt,
    });
  };

  const handleLowerMemorySalience = async (
    memoryId: string,
    currentSalience: number,
  ) => {
    setError(null);
    setMockDataFeedback(null);
    await repositories.memories.updateSalience(memoryId, currentSalience - 0.15);
  };

  const handleBoostMemorySalience = async (
    memoryId: string,
    currentSalience: number,
  ) => {
    setError(null);
    setMockDataFeedback(null);
    await repositories.memories.updateSalience(memoryId, currentSalience + 0.15);
  };

  const handleDeleteMemory = async (memoryId: string) => {
    setError(null);
    setMockDataFeedback(null);
    await repositories.memories.remove(memoryId);
    await repositories.embeddings.removeForItem(memoryId, "memory");
  };

  const handleSaveAgentEndpoint = async (value: string) => {
    setError(null);
    setMockDataFeedback(null);
    await repositories.settings.set("agentEndpoint", value);
  };

  const handleApplyMockData = useCallback(
    async (strategyId: StrategyId) => {
      const preset = getStrategyShowcasePreset(strategyId);
      setError(null);
      setLoadingStrategyPresetId(strategyId);
      try {
        stopFocusSession();
        const createdTasks = await repositories.tasks.replaceAll(preset.tasks);
        await syncTaskEmbeddings(createdTasks);
        await repositories.settings.set("activeStrategyId", strategyId);
        setMockDataFeedback(`已载入 ${preset.name}，当前列表用于验证 ${preset.summary}`);
      } catch (reason) {
        const failureMessage =
          reason instanceof Error ? reason.message : "载入示例任务失败";
        setError(failureMessage);
      } finally {
        setLoadingStrategyPresetId(null);
      }
    },
    [repositories, stopFocusSession, syncTaskEmbeddings],
  );

  return (
    <main
      className={`app-shell ${isCommandFocused ? "is-command-focused" : ""}`}
      data-strategy={activeStrategyId}
    >
      <div className="focus-dim-layer" aria-hidden="true" />

      <aside className="strategy-rail">
        <button
          type="button"
          className="rail-toggle"
          onClick={() => setIsUtilityDrawerOpen((current) => !current)}
        >
          {isUtilityDrawerOpen ? "收起" : "面板"}
        </button>
        <div className="rail-strategies">
          {strategyList.map((strategy) => (
            <button
              key={strategy.id}
              type="button"
              className={`rail-strategy-button ${
                strategy.id === activeStrategyId ? "active" : ""
              }`}
              onClick={() => handleStrategyChange(strategy.id)}
              aria-label={strategy.name}
              title={strategy.name}
            >
              {strategy.name.slice(0, 2)}
            </button>
          ))}
        </div>
        <div className="rail-summary">
          <span>{visibleTaskCount} 项任务</span>
          <span>{memories.length} 条记忆</span>
        </div>
      </aside>

      <section className="main-stage">
        <header className="status-bar">
          <div className="status-bar-main">
            <div className="status-pill">当前策略: {activeStrategy.name}</div>
            <div className="status-pill">任务总数: {visibleTaskCount}</div>
            <div className={`status-dot ${isOnline ? "online" : "offline"}`}>
              {isOnline ? "在线推理可用" : "当前离线"}
            </div>
          </div>
          {activeStrategyId === "deep-work" ? (
            <div className="status-bar-actions">
              <button
                type="button"
                className={`ghost-button status-bar-action ${
                  focusSessionState !== "idle" ? "active" : ""
                }`}
                onClick={handleToggleFocusSession}
                aria-label={
                  focusSessionState === "running"
                    ? "暂停专注"
                    : focusSessionState === "paused"
                      ? "继续专注"
                      : "开始专注"
                }
                title={
                  focusSessionState === "running"
                    ? "暂停专注"
                    : focusSessionState === "paused"
                      ? "继续专注"
                      : "开始专注"
                }
              >
                <FocusControlIcon kind={focusPrimaryActionIcon} />
                <span>{focusPrimaryActionLabel}</span>
              </button>
              {focusSessionState !== "idle" ? (
                <button
                  type="button"
                  className="ghost-button status-bar-action status-bar-action-secondary"
                  onClick={stopFocusSession}
                  aria-label="停止专注"
                  title="停止专注"
                >
                  <FocusControlIcon kind="stop" />
                </button>
              ) : null}
            </div>
          ) : null}
        </header>

        <div className="content-grid">
          <div className="primary-column">
            <TaskListView
              tasks={tasks}
              strategy={activeStrategy}
              onCompleteTask={handleCompleteTask}
              onArchiveTask={handleArchiveTask}
              onRememberTask={handleRememberTask}
              onUpdateTask={handleUpdateTask}
            />
            <ChatPanel
              draft={draft}
              pending={pending}
              error={error}
              onDraftChange={setDraft}
              onSend={handleSend}
              onFocusChange={setIsCommandFocused}
            />
          </div>

          <aside className="insight-column">
            <RecentActivityPanel turns={turns} />
            <section className="panel insight-panel">
              <div className="insight-stack">
                {previewSections.map((section) => (
                  <article key={section.title} className="insight-card">
                    <strong>{section.title}</strong>
                    <ul>
                      {section.items.map((item) => (
                        <li key={item}>{item}</li>
                      ))}
                    </ul>
                  </article>
                ))}
                <article className="insight-card">
                  <strong>最近一次智能体回应</strong>
                  <p>
                    {latestAssistantTurn?.content ??
                      "发送一次指令后，这里会显示最新回应摘要。"}
                  </p>
                </article>
              </div>
            </section>
          </aside>
        </div>
      </section>

      <aside className={`utility-drawer ${isUtilityDrawerOpen ? "open" : ""}`}>
        <div className="utility-drawer-header">
          <div>
            <p className="eyebrow">按需展示</p>
            <h2>策略与记忆</h2>
          </div>
          <button
            type="button"
            className="ghost-button"
            onClick={() => setIsUtilityDrawerOpen(false)}
          >
            关闭
          </button>
        </div>

        <section className="quick-tools-shell">
          <div className="quick-tools-header">
            <p className="eyebrow">策略排序</p>
            <h2>切换当前策略</h2>
          </div>
          <StrategyPicker
            activeStrategyId={activeStrategyId}
            onChange={handleStrategyChange}
          />
        </section>

        <MockDataPanel
          activeStrategyId={activeStrategyId}
          loadingStrategyId={loadingStrategyPresetId}
          feedback={mockDataFeedback}
          onApplyPreset={handleApplyMockData}
        />

        <SettingsPanel
          agentEndpoint={agentEndpointSetting?.value ?? DEFAULT_AGENT_ENDPOINT}
          activeStrategyName={activeStrategy.name}
          onSaveAgentEndpoint={handleSaveAgentEndpoint}
        />

        <MemoryPanel
          memories={memories}
          retrievedMemories={highlightedMemories}
          onLowerSalience={handleLowerMemorySalience}
          onBoostSalience={handleBoostMemorySalience}
          onDeleteMemory={handleDeleteMemory}
        />
      </aside>
    </main>
  );
}
