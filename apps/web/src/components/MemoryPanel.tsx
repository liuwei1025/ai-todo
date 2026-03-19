import type { Memory } from "@ai-todo/contracts";

interface MemoryPanelProps {
  memories: Memory[];
  retrievedMemories: Memory[];
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
}: MemoryPanelProps) {
  return (
    <section className="panel memory-panel">
      <div className="memory-stack">
        {memories.length > 0 ? (
          memories.map((memory) => {
            const highlighted = retrievedMemories.some((item) => item.id === memory.id);
            return (
              <article
                key={memory.id}
                className={`memory-card ${highlighted ? "highlighted" : ""}`}
              >
                <div className="memory-card-top">
                  <span className="pill">{categoryLabel[memory.category]}</span>
                  <span>{Math.round(memory.salience * 100)}%</span>
                </div>
                <p>{memory.summary}</p>
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
