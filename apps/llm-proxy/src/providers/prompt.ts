import type { AIContextBundle } from "@ai-todo/contracts";

const TOOL_DEFINITIONS = `Available tools (use ONLY these names and argument shapes):

1. batch_create_tasks
   arguments: { "tasks": [{ "title": string, "type"?: "task"|"project", "status"?: "inbox"|"next"|"waiting"|"done", "strategyBucket"?: string, "priority"?: "low"|"medium"|"high", "dueAt"?: string|null, "notes"?: string|null, "tags"?: string[] }] }

2. update_tasks
   arguments: { "updates": [{ "id": string, "title"?: string, "type"?: "task"|"project", "status"?: "inbox"|"next"|"waiting"|"done"|"archived", "strategyBucket"?: string, "priority"?: "low"|"medium"|"high", "dueAt"?: string|null, "notes"?: string|null, "tags"?: string[] }] }

3. archive_tasks
   arguments: { "taskIds": [string] }

4. upsert_memory
   arguments: { "memory": { "kind"?: "short_term"|"long_term", "category": "preference"|"lesson"|"pattern"|"fact", "summary": string, "sourceTurnIds"?: string[], "salience"?: number (0-1) } }

5. set_strategy
   arguments: { "strategyId": "gtd"|"eisenhower"|"deep-work" }`;

const buildStrategySection = (bundle: AIContextBundle): string => {
  const { retrievalHints, toolPolicies } = bundle.activeStrategy;
  const lines: string[] = ["## Strategy guidance"];

  if (retrievalHints.length > 0) {
    lines.push("Retrieval priorities:");
    for (const hint of retrievalHints) {
      lines.push(`- ${hint}`);
    }
  }

  if (toolPolicies.emphasis.length > 0) {
    lines.push("Emphasis:");
    for (const item of toolPolicies.emphasis) {
      lines.push(`- ${item}`);
    }
  }

  if (toolPolicies.disallowedTools.length > 0) {
    lines.push(`Disallowed tools: ${toolPolicies.disallowedTools.join(", ")}`);
  }

  return lines.join("\n");
};

const buildContextSection = (bundle: AIContextBundle): string => {
  const sections: string[] = [];

  if (bundle.retrievedTasks.length > 0) {
    sections.push(`## Retrieved tasks (${bundle.retrievedTasks.length})\n${JSON.stringify(bundle.retrievedTasks)}`);
  }

  if (bundle.retrievedMemories.length > 0) {
    sections.push(`## Retrieved memories (${bundle.retrievedMemories.length})\n${JSON.stringify(bundle.retrievedMemories)}`);
  }

  if (bundle.recentTurns.length > 0) {
    sections.push(`## Recent conversation (${bundle.recentTurns.length} turns)\n${JSON.stringify(bundle.recentTurns)}`);
  }

  sections.push(`## UI state\n${JSON.stringify(bundle.uiStateSnapshot)}`);

  return sections.join("\n\n");
};

export const buildPrompt = (bundle: AIContextBundle) =>
  [
    bundle.activeStrategy.systemPrompt,
    buildStrategySection(bundle),
    TOOL_DEFINITIONS,
    `## Privacy policy\n${JSON.stringify(bundle.privacyPolicy)}`,
    `## Response format\nReturn valid JSON with this exact shape:\n{ "message": "string — your reply to the user", "toolCalls": [{ "name": "tool_name", "reason": "why this action", "arguments": { ... } }] }\ntoolCalls may be an empty array if no action is needed.`,
    buildContextSection(bundle),
    `## User message\n${bundle.userMessage}`,
  ].join("\n\n");
