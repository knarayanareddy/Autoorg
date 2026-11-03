# 🤖 AutoOrg

**Autonomous Mission Orchestration & Hardened Agentic Infrastructure.**

[**🌐 View Live Project Page**](https://knarayanareddy.github.io/Autoorg/)

AutoOrg is a production-grade platform designed to manage complex, multi-cycle autonomous research missions. Built for resilience and transparency, it bridges the gap between raw LLM inference and a durable, audit-ready organizational runtime.

---

## 🌟 Key Features

### 🏗️ Hardened Core (Phase 5.1)
- **Durable Recovery**: Every mission phase is snapshotted to a **Recovery Journal**. The system can resume instantly from its last successful checkpoint after a crash or shutdown.
- **Concurrency Safety**: Built-in **Workspace Locking** prevents data corruption from simultaneous daemon or CLI processes.
- **Governance Controls**: **Strict Approval Gating** stages all workspace commits as artifacts until explicitly approved via the dashboard or database.
- **Observability Stack**: Integrated **Incident Logging** and **Budget Manager** track tool spend, API usage, and operational failures in real-time.

### 📊 Mission Dashboard (Phase 6.1)
- **Observability Hub**: Real-time tracking of agent drafts, adaptation logs, and process debt.
- **Security & Audit**: Dedicated views for policy violations, artifact provenance (SHA-256), and tool execution traces.
- **Knowledge Graph**: Interactive semantic visualization of your mission's evolving knowledge base.
- **Logistics Ledger**: Consolidated audit of every agent-to-environment interaction.

### ⚙️ Dynamic Provisioning (Phase 15)
- **Provider-Agnostic Adapters**: Native support for **Anthropic, OpenAI, Groq, and Ollama**.
- **Dynamic Configuration**: Refine model assignments mid-mission via the database without code restarts.
- **Local Fallback**: Automatically reverts to local providers (Ollama) if high-tier API keys are unavailable.

---

## 🛠️ Quick Start

### 1. Prerequisites
- **Runtime**: [Bun](https://bun.sh)
- **Local Inference** (Optional): [Ollama](https://ollama.ai)

### 2. Setup
```bash
# Clone and install (Bun 1.1+ required)
bun install
bun run setup:hooks        # optional: commit-msg + secret checks

# Configure credentials
cp .env.example .env       # then fill in the keys you have

# Create the database (idempotent; re-running is a no-op)
bun run db:migrate

# Seed LLM providers from the environment
bun run src/scripts/seed-providers.ts

# Verify everything is wired up
bun run typecheck && bun run test:ci
```

Only one provider is required. Set `DEFAULT_LLM_PROVIDER` and the matching key
(`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GEMINI_API_KEY`, `GROQ_API_KEY`, or
leave it on `ollama` for local inference). Keys may also be supplied as
`AUTOORG_API_KEY_<PROVIDER>`.

### 3. Launch a Mission
Create a mission file (e.g., `mission.md`) and launch the orchestrator:
```bash
bun run src/index.ts --org mission.md
```

---

## 🏗️ Architecture

AutoOrg utilizes a three-tier memory system and a hierarchical multi-agent loop:

1. **Memory Tier 1**: `MEMORY.md` (Living status & current focus)
2. **Memory Tier 2**: `facts/` (Durable Knowledge Graph)
3. **Memory Tier 3**: `transcripts/` (Immutable audit data)

### Core Roles
- **CEO**: Goal decomposition and assignment.
- **Engineer**: Research, tool use, and drafting.
- **Critic**: Hardening, vulnerability checks, and objections.
- **Judge**: Quantitative scoring and composite health reporting.

---

## 🛡️ Security & Compliance
All tool actions are governed by a **Policy Engine** that enforces role-based
permissions (`repo.search`, `web.fetch`, `sandbox.exec`). Every artifact is
signed and recorded in the **Action Ledger** for full deterministic
auditability.

**The API binds unauthenticated by default only on loopback.** The approval
endpoints can commit code, so:

```bash
AUTOORG_API_KEY=<long-random-value>   # required for any non-loopback bind
AUTOORG_CORS_ORIGINS=https://your.dashboard
GITHUB_WEBHOOK_SECRET=<secret>        # webhooks reject unsigned payloads
```

The server **refuses to start** on a public interface without
`AUTOORG_API_KEY`. CORS is an explicit allowlist — never `*`.

### Development
```bash
bun run typecheck   # tsc --noEmit
bun run test:ci     # unit tests
bun run build       # bundle CLI + API
bun run lint
bun run security    # secrets, tracked build output, route-auth checks
bun run api         # dashboard API on :3001
```

See [CONTRIBUTING.md](CONTRIBUTING.md) for the schema-change and testing
conventions.

## 📚 Documentation
- `CONTRIBUTING.md` — setup, commit format, schema and test conventions
- `docs/` — the GitHub Pages project site
- `web/` — the Next.js dashboard (`cd web && bun install && bun run dev`,
  proxying `/api` to the server on port 3001)

---

## 📜 License
MIT © 2026 AutoOrg Framework.