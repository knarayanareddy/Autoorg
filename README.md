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
# Clone and install
bun install

# Run database migrations
bun run src/db/migrate.ts

# Seed initial providers
bun run src/scripts/seed-providers.ts
```

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
All tool actions are governed by a **Policy Engine** that enforces role-based permissions (`repo.search`, `web.fetch`, `sandbox.exec`). Every artifact is signed and recorded in the **Action Ledger** for full deterministic auditability.

---

## 📜 License
MIT © 2026 AutoOrg Framework.