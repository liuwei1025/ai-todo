# AI TODO Roadmap

This roadmap translates the current MVP into the next execution backlog.

## P0: Complete the core product loop

### 1. Add direct task editing in the UI

Why:
- The system can already create and update tasks through agent tool calls, but users cannot quickly adjust task status, priority, notes, or due dates from the board itself.

Scope:
- Add task-level controls in the web UI.
- Support at least: status change, priority change, notes edit, archive action.
- Keep all edits local-first and immediately persisted in IndexedDB.

Done means:
- A user can update a task without going through the chat box.
- The board refreshes instantly after edits.
- Changes survive page reload.

Relevant files:
- `apps/web/src/App.tsx`
- `apps/web/src/components/TaskBoard.tsx`
- `apps/web/src/db/repositories.ts`

### 2. Add explicit privacy filtering before remote calls

Why:
- The app already sends only retrieved slices, but there is no formal redaction or payload policy yet.

Scope:
- Add a preprocessing layer before `AIContextBundle` is sent.
- Define rules for stripping or masking sensitive notes, tags, and memory details.
- Keep the payload bounded and auditable.

Done means:
- The request body follows a documented privacy policy.
- Tests verify that full task and memory records are not sent by accident.

Relevant files:
- `apps/web/src/agent/context.ts`
- `packages/contracts/src/index.ts`

### 3. Formalize proxy provider adapters

Why:
- The proxy currently supports `mock` and OpenAI in a single file.
- Adding Anthropic or local-compatible providers will become messy without an adapter layer.

Scope:
- Extract provider selection and request formatting into separate modules.
- Keep `POST /agent/respond` unchanged.
- Preserve stateless behavior and anonymous logging only.

Done means:
- Proxy internals are provider-agnostic.
- A new provider can be added without editing the main route logic heavily.

Relevant files:
- `apps/llm-proxy/src/index.ts`

## P1: Make memory and strategy systems usable

### 4. Add memory review and curation

Why:
- Long-term memory is visible, but users cannot confirm, edit, delete, or downgrade memories.

Scope:
- Add memory actions in the UI.
- Support delete, lower salience, and optional pin/highlight.
- Distinguish suggested memory from trusted memory later if needed.

Done means:
- Users can clean up bad memories locally.
- Retrieval quality improves because stale memory can be removed.

Relevant files:
- `apps/web/src/components/MemoryPanel.tsx`
- `apps/web/src/db/repositories.ts`

### 5. Add settings UI for proxy and local preferences

Why:
- `agentEndpoint` and strategy settings already exist in storage, but there is no user-facing settings screen.

Scope:
- Add a lightweight settings panel or modal.
- Support editing proxy endpoint and future provider options.
- Keep settings fully local.

Done means:
- Users can repoint the frontend without editing source code.
- Current settings are visible and reload-safe.

Relevant files:
- `apps/web/src/App.tsx`
- `apps/web/src/db/repositories.ts`

### 6. Strengthen strategy enforcement

Why:
- Strategies currently change board layout, retrieval hints, and prompt behavior, but they do not strongly constrain allowed actions.

Scope:
- Expand `toolPolicies` behavior.
- Add stronger lane defaults, stricter capture rules, and task validation by strategy.
- Make GTD, Eisenhower, and Deep Work feel more distinct in practice.

Done means:
- Different strategies produce meaningfully different task behavior, not just different columns.
- Tests prove that strategy changes affect execution outcomes.

Relevant files:
- `apps/web/src/strategies/index.ts`
- `apps/web/src/agent/tools.ts`

## P2: Improve polish and portability

### 7. Turn Deep Work into a real focus mode

Why:
- The current focus action is a UI banner, not a real focus workflow.

Scope:
- Add a countdown timer and active focus session state.
- Emphasize one selected task during the session.
- Keep it local-first with no calendar dependency.

Done means:
- Users can start and complete a focus session in-app.
- The deep-work board feels operational, not symbolic.

### 8. Add export and import

Why:
- The app is intentionally single-device and local-first, so backup and migration matter.

Scope:
- Export tasks, memories, and settings to JSON.
- Import with schema validation and duplicate handling.

Done means:
- A user can move data to another browser/device manually.
- Import failures do not corrupt existing local data.

### 9. Improve embedding lifecycle UX

Why:
- First-load embedding setup can be slow, and fallback behavior is currently silent.

Scope:
- Show embedding model status in the UI.
- Tell the user when fallback vectors are being used.
- Cache readiness state clearly.

Done means:
- Users understand whether semantic retrieval is fully active.
- Slow model initialization no longer feels like a broken app.

## Engineering cleanup

### 10. Keep generated files out of source control

Notes:
- `dist/` and `test-results/` are local artifacts and should remain ignored.
- The current `.gitignore` already covers these paths, which is good.

### 11. Expand README with MVP boundaries

Scope:
- Add a short section describing what is intentionally not in v1.
- Call out missing sync, notifications, CLI, and automation support.

Done means:
- New contributors understand current product boundaries quickly.
