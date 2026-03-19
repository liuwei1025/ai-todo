import type { Memory } from "@ai-todo/contracts";

interface MemoryPanelProps {
  memories: Memory[];
  retrievedMemories: Memory[];
  onLowerSalience: (memoryId: string, currentSalience: number) => Promise<void>;
  onBoostSalience: (memoryId: string, currentSalience: number) => Promise<void>;
  onDeleteMemory: (memoryId: string) => Promise<void>;
}

const categoryLabel: Record<Memory["category"], string> = {
  preference: "偏好",
  lesson: "经验",
  pattern: "模式",
  fact: "事实",
};

export function MemoryPanel({
  memories,
  retrievedMemories,
  onLowerSalience,
  onBoostSalience,
  onDeleteMemory,
}: MemoryPanelProps) {
  return (
    <section className="panel memory-panel">
      <div className="panel-header">
        <div>
          <p className="eyebrow">长期记忆</p>
          <h2>记忆整理</h2>
        </div>
        <span className="pill">共 {memories.length} 条</span>
      </div>

      <div className="memory-stack">
        {memories.length > 0 ? (
          memories.map((memory) => {
            const highlighted = retrievedMemories.some((item) => item.id === memory.id);
            const isPinned = memory.salience >= 0.95;

            return (
              <article
                key={memory.id}
                className={`memory-card ${highlighted ? "highlighted" : ""} ${
                  isPinned ? "pinned" : ""
                }`}
              >
                <div className="memory-card-top">
                  <span className="pill">{categoryLabel[memory.category]}</span>
                  <span>{Math.round(memory.salience * 100)}%</span>
                </div>
                <p>{memory.summary}</p>
                <div className="memory-card-actions">
                  <button
                    type="button"
                    className="task-action-button"
                    onClick={() => void onBoostSalience(memory.id, memory.salience)}
                  >
                    {isPinned ? "已高亮" : "提高权重"}
                  </button>
                  <button
                    type="button"
                    className="task-action-button"
                    onClick={() => void onLowerSalience(memory.id, memory.salience)}
                  >
                    降低权重
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void onDeleteMemory(memory.id)}
                  >
                    删除
                  </button>
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-column">
            当重复信号出现后，稳定的模式与经验会沉淀在这里。
          </div>
        )}
      </div>
    </section>
  );
}
