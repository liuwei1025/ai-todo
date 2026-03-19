import { useEffect, useState } from "react";
import type {
  Memory,
  StrategyId,
  Task,
  TaskUpdateInput,
} from "@ai-todo/contracts";
import { useLiveQuery } from "dexie-react-hooks";
import { ChatPanel } from "./components/ChatPanel";
import { MemoryPanel } from "./components/MemoryPanel";
import { RecentActivityPanel } from "./components/RecentActivityPanel";
import { SettingsPanel } from "./components/SettingsPanel";
import { StrategyPicker } from "./components/StrategyPicker";
import { TaskListView } from "./components/TaskListView";
import { createRemoteAgentClient, type AgentClient } from "./agent/api";
import { buildAIContextBundle } from "./agent/context";
import {
  BrowserEmbeddingClient,
  type EmbeddingClientLike,
} from "./agent/embedding";
import { executeToolCalls } from "./agent/tools";
import { db as defaultDb, type AITodoDB } from "./db/database";
import { createRepositories } from "./db/repositories";
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

const defaultEmbeddingClient = new BrowserEmbeddingClient();

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
  const repositories = createRepositories(database);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [lastRetrievedMemoryIds, setLastRetrievedMemoryIds] = useState<string[]>([]);
  const [isOnline, setIsOnline] = useState(
    typeof navigator === "undefined" ? true : navigator.onLine,
  );
  const [focusMessage, setFocusMessage] = useState<string | null>(null);
  const [isCommandFocused, setIsCommandFocused] = useState(false);
  const [isUtilityDrawerOpen, setIsUtilityDrawerOpen] = useState(false);

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
    repositories.settings.ensureDefaults().catch((reason: unknown) => {
      console.error("初始化设置失败", reason);
    });
  }, []);

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

  const resolvedAgentClient =
    agentClient ??
    createRemoteAgentClient(
      agentEndpointSetting?.value ?? "http://localhost:8787",
    );

  const handleSend = async () => {
    const message = draft.trim();
    if (!message || pending) {
      return;
    }

    setError(null);
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
      await executeToolCalls({
        database,
        toolCalls: response.toolCalls,
        currentStrategyId: activeStrategyId,
        embeddingClient,
      });
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
    setFocusMessage(null);
    await repositories.settings.set("activeStrategyId", strategyId);
  };

  const handleStartFocusSession = () => {
    setFocusMessage(
      "专注时段已开始。请选择一项高价值任务，暂时屏蔽浅层事务，持续专注 25 分钟。",
    );
  };

  const handleCompleteTask = async (taskId: string) => {
    setError(null);
    await handleUpdateTask(taskId, { status: "done" });
  };

  const handleArchiveTask = async (taskId: string) => {
    setError(null);
    await repositories.tasks.archiveMany([taskId]);
    await repositories.embeddings.removeForItem(taskId, "task");
  };

  const syncTaskEmbedding = async (task: Task | null) => {
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
  };

  const handleUpdateTask = async (
    taskId: string,
    patch: Omit<TaskUpdateInput, "id">,
  ) => {
    setError(null);
    const updatedTask = await repositories.tasks.updateOne(taskId, patch);
    await syncTaskEmbedding(updatedTask);
  };

  const handleRememberTask = async (task: Task) => {
    setError(null);
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
    await repositories.memories.updateSalience(memoryId, currentSalience - 0.15);
  };

  const handleBoostMemorySalience = async (
    memoryId: string,
    currentSalience: number,
  ) => {
    setError(null);
    await repositories.memories.updateSalience(memoryId, currentSalience + 0.15);
  };

  const handleDeleteMemory = async (memoryId: string) => {
    setError(null);
    await repositories.memories.remove(memoryId);
    await repositories.embeddings.removeForItem(memoryId, "memory");
  };

  const handleSaveAgentEndpoint = async (value: string) => {
    setError(null);
    await repositories.settings.set("agentEndpoint", value);
  };

  return (
    <main
      className={`app-shell ${isCommandFocused ? "is-command-focused" : ""}`}
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
          <div className="status-pill">当前策略: {activeStrategy.name}</div>
          <div className="status-pill">任务总数: {visibleTaskCount}</div>
          <div className={`status-dot ${isOnline ? "online" : "offline"}`}>
            {isOnline ? "在线推理可用" : "当前离线"}
          </div>
        </header>

        {focusMessage ? <div className="focus-banner">{focusMessage}</div> : null}

        <div className="content-grid">
          <div className="primary-column">
            <ChatPanel
              draft={draft}
              pending={pending}
              error={error}
              onDraftChange={setDraft}
              onSend={handleSend}
              onFocusChange={setIsCommandFocused}
            />
            <TaskListView
              tasks={tasks}
              strategy={activeStrategy}
              onCompleteTask={handleCompleteTask}
              onArchiveTask={handleArchiveTask}
              onRememberTask={handleRememberTask}
              onStartFocusSession={handleStartFocusSession}
              onUpdateTask={handleUpdateTask}
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

        <SettingsPanel
          agentEndpoint={agentEndpointSetting?.value ?? "http://localhost:8787"}
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
