# AI TODO Chief of Staff

Local-first AI task agent MVP built as a pnpm workspace.

## Packages

- `apps/web`: React + TypeScript frontend with IndexedDB, local retrieval, strategy boards, and validated tool-call execution.
- `apps/llm-proxy`: Stateless proxy for remote LLM calls with a built-in mock provider.
- `packages/contracts`: Shared Zod schemas and TypeScript contracts.

## Quick start

```bash
pnpm install
pnpm dev:proxy
pnpm dev:web
```

The proxy defaults to `mock` mode, so the web app works without an API key.

To use OpenAI, create an `.env` file in `apps/llm-proxy` or the repo root:

```bash
LLM_PROVIDER=openai
OPENAI_API_KEY=your_key
OPENAI_MODEL=gpt-4.1-mini
PORT=8787
```

## Tests

```bash
pnpm test
pnpm test:e2e
```
