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

### Remote deployment and TLS

The Bun API does not terminate TLS. For remote use, put the dashboard and API
behind a TLS-terminating reverse proxy or VPN; bind the API to `127.0.0.1` and
set a strong `AUTOORG_API_KEY` **even on loopback** when a proxy can reach it.
Forward `/api` to the API and `/ws` as a WebSocket upgrade to the API (preserve
`Upgrade` and `Connection` headers). Serve both through HTTPS so the browser
uses `wss://`; do not send API keys over plain HTTP or WebSocket connections.
Configure proxy timeouts and body-size limits as appropriate. The API also
limits request bodies to 1 MiB.

**The API key protects reads, mutations and WebSocket events when configured.**
The GitHub webhook instead requires its own HMAC signature. Restrict access to
the dashboard and API at the proxy or network layer as defense in depth; CORS
is not authentication. Do not expose the dashboard's
Next.js development server to the internet.

For local development, the dashboard connects to `localhost:3001/ws` from port
3000. For remote deployments it connects to `/ws` on the dashboard origin,
which the proxy must forward. When a key is configured, use the dashboard's
**API key** control to enter it for the current tab. The dashboard stores it in
`sessionStorage`, sends it in a header on API requests, and clears it when the
tab closes (or when you enter a blank key). Browser script running on the same
origin can read it, so keep the dashboard origin trusted. WebSocket clients
send it in the URL query string because browser WebSocket APIs cannot set
arbitrary headers. Treat URLs as secrets: disable or redact query strings in
proxy/access logs, monitoring, and tracing; use WSS. Non-browser clients may
instead send `x-api-key`.

Unkeyed WebSocket access is permitted only from loopback with a trusted browser
origin; never rely on that exception behind a proxy, since proxied clients may
appear to be loopback. Failed key attempts are throttled by the direct peer IP,
not forwarded headers, so clients behind one proxy share a limit; enforce
per-client throttling at a trusted proxy if needed. The in-memory limiter resets
on restart and is not shared between processes.

### Transcript and search privacy

By default, new transcript entries retain operational metadata but omit prompt,
response and arbitrary metadata content. Legacy transcript retrieval and
indexing are disabled in this mode. Repository search returns counts and line
numbers but withholds queries, paths and snippets. This deliberately sacrifices
search usefulness to avoid relying on secret-pattern detection.

For trusted workspaces, `AUTOORG_TRANSCRIPT_CONTENT=1` enables transcript
content and retrieval, and `AUTOORG_REPO_SEARCH_CONTENT=1` enables search paths
and snippets. Redaction then covers known configured credentials and common
patterns, but **cannot recognize every possible secret**, including arbitrary
unknown values and fragments of multiline keys. Only enable these options after
reviewing data and protecting access to the workspace, database and backups.
Other application data can also contain sensitive content. Rotate exposed keys;
redaction is not a substitute for rotation.
### Run budgets

`MAX_API_SPEND_USD` is checked immediately before every LLM attempt in the
main run, including graph extraction, agent/tool planning, judging and dreams.
Calls within a run are serialized so parallel workers cannot spend the same
remaining budget. Successful usage is accounted immediately. If a failed call
or response does not report a cost, the run stops rather than retrying with
unknown billing; provider SDK retries are disabled. Outside the main run (for
example, separate interview or benchmark processes), configure provider-side
limits separately.

This is a **best-effort spending guard**, not a guaranteed billing cap: the
application uses estimated, potentially outdated model prices, and a single
request can cross the remaining budget before its cost is known. Provider
billing, failed requests, other processes and external API use can differ from
these estimates. Set hard spending limits with the provider as well.

### Constitution lock

The `constitutionLock` flag is enabled by default. A run records a hash of a
regular `constitution.md` at startup and stops without resetting the file if
it changes or disappears before scoring/staging. Because the shell sandbox is
not a filesystem isolation boundary, the lock blocks `sandbox.exec` and other
non-allowlisted tools; only the built-in read-only search and web-fetch tools
remain available. Set `FEATURE_CONSTITUTION_LOCK=0` only if you deliberately
accept the risk and provide your own OS-level isolation. Hash checks cannot
prevent an independent host process from changing and restoring the file
between checks; isolate the workspace from untrusted host processes as well.

### Provider credentials at rest

Provider seeding normally leaves database key fields empty and reads provider
keys from the process environment. To store provider keys in the database, set
`AUTOORG_PROVIDER_ENCRYPTION_KEY` to a dedicated, random 32-byte hex key
(`openssl rand -hex 32`) **outside** the database, then run the seeder. Keys
are encrypted with AES-256-GCM and bound to their provider ID. Keep a secure
backup of the encryption key: losing or changing it makes stored credentials
unreadable. Never reuse the API key as the encryption key.

Existing plaintext rows are refused by the adapter. To migrate, stop **all**
AutoOrg processes, take a protected, consistent database backup, set the
correct encryption key and `AUTOORG_DB_PATH`, then run `bun run providers:encrypt`.
The migration checks existing ciphertext before updating rows, uses a
transaction, checkpoints the WAL and vacuums the database; rerun it if a
checkpoint was blocked. Securely handle or retire old backups, WAL/journal
files and filesystem snapshots, which may retain plaintext. SQLite vacuum and
secure deletion cannot guarantee erasure on all storage. Rotate credentials
that may previously have been exposed. Keep database files and backups access
controlled and encrypted at rest as defense in depth.

### Development
```bash
bun run typecheck   # tsc --noEmit
bun run test:ci     # unit tests
bun run build       # bundle CLI + API
bun run lint
bun run security    # secrets, tracked build output, route-auth checks
bun run audit       # root dependencies; also audit web/ separately in CI
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