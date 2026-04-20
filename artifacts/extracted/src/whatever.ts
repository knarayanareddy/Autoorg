schema-phaseX.sql and the content continues until the next file header.
To avoid missing these, use:

Bash

bun tools/extract-file-bodies.ts --in Autoorg.md --outDir artifacts/extracted
This writes:

extracted files into artifacts/extracted/**
artifacts/extracted/index.json mapping path -> extracted content
The agent then copies extracted files into the repo tree, resolving conflicts carefully.

Build checkpoints (must pass at each stage)
Checkpoint A (Phase 0 runnable)
Commands:

Bash

bun install
bunx tsc --noEmit
bun test

bun run src/scripts/init.ts
bun run src/db/migrate.ts
bun start --mock --no-ui
Must observe:

results.tsv has rows,
autoorg.db exists with run/cycle rows,
git commits exist.
Checkpoint B (CI scaffolding integrity)
All workflow-referenced scripts exist.
All migration scripts enumerated in composite action exist.
Running migrations twice is idempotent:
Bash

bun run scripts/ci/migrate-all.ts --verify
bun run scripts/ci/migrate-all.ts --verify
What the agent must deliver
The agent must commit (or at least output) these artifacts:

artifacts/build/paths.json
artifacts/build/paths.md
artifacts/build/coverage-report.json
artifacts/build/implementation-plan.md
artifacts/build/implementation-notes.md (every reconciliation decision, with reason)
artifacts/build/final-checklist.md (done/stubbed/missing list)
“Stop and fix” rules (fail fast)
The agent must immediately stop and fix if any are true:

TypeScript does not compile.
A workflow references a missing file.
A migration script enumerated by CI is missing.
A DB migration is not idempotent.
A core invariant is violated (e.g., ratchet commits without score improvement in mock mode).
text


---

## 2) `AGENT_BUILD_PROMPT.txt` (paste into your coding agent)

```text
You are a coding agent implementing a repository from a single spec file: Autoorg.md.

Your mission:
- Implement the full repository as described in Autoorg.md.
- Make it compile, test, and run Phase 0 mock mode end-to-end.
- Ensure all CI/CD referenced files exist (workflows, scripts, composite actions, migrations).
- Produce a manifest-based self-audit proving no missing referenced paths.

========================================
A) NON-NEGOTIABLE RULES
========================================
A1) Autoorg.md is source-of-truth. Do not add features not described.
A2) If Autoorg.md provides a file body (inline or fenced), copy it verbatim.
A3) If Autoorg.md references a file path but does not provide a full body:
    - create a minimal, correct stub that compiles and satisfies imports
    - include TODO with the phase/section reference
A4) Never call real external LLMs in tests or CI by default. Use mock adapters and deterministic scoring.
A5) Apply compatibility bridges:
    - env: prefer AUTOORG_* keys, fallback to legacy keys
    - entrypoints: keep src/index.ts working; allow direct orchestrator entry if referenced
    - TS import extension consistency
    - memory cap: implement the cap mandated by templates/rules; document choice
A6) Fail fast on compile errors, missing paths, or non-idempotent migrations.

========================================
B) REQUIRED PREPASS: MANIFEST GATE (DO THIS FIRST)
========================================
B1) Create tools/extract-paths.ts (provided by this repo’s handover bundle if present; if not, implement it).
B2) Run:
    bun tools/extract-paths.ts --in Autoorg.md --outDir artifacts/build
B3) Create tools/coverage-report.ts (provided; if missing, implement it).
B4) Run:
    bun tools/coverage-report.ts --paths artifacts/build/paths.json --root . --out artifacts/build/coverage-report.json

B5) Create artifacts/build/implementation-plan.md:
    - Build order (dependency-first).
    - Which files are CODE vs SPEC vs PATCH (based on extraction).
    - Stub policy and how you’ll eliminate stubs later.

Do NOT start implementing the runtime until you have artifacts/build/coverage-report.json and have confirmed no missing required paths.

========================================
C) OPTIONAL BUT RECOMMENDED: EXTRACT FILE BODIES
========================================
C1) Create tools/extract-file-bodies.ts (provided; if missing, implement it).
C2) Run:
    bun tools/extract-file-bodies.ts --in Autoorg.md --outDir artifacts/extracted
C3) For any extracted file body, prefer it over manual re-typing. Copy into repo paths.

========================================
D) IMPLEMENTATION ORDER (STRICT)
========================================

D0) Skeleton
- Create directory tree exactly as required (src/*, web/*, scripts/*, .github/*, mailbox/*, memory/*, workspace/*).
- Add package.json, tsconfig.json, bunfig.toml, .env.example, .gitignore.

D1) Phase 0 core (must run in mock mode)
Implement in this order:
1) src/types/index.ts
2) src/config/org-parser.ts + src/config/env.ts (env compat helper)
3) src/db/schema.sql + src/db/migrate.ts + db helpers
4) src/utils/git.ts
5) src/utils/results-logger.ts
6) src/runtime/ratchet.ts (mock scoring path)
7) src/runtime/orchestrator.ts (mock agents path)
8) src/scripts/init.ts
9) src/index.ts (CLI: --mock, --no-ui, --org)
10) Minimal UI stubs (if referenced; must compile but can be minimal)
11) tests that do not call external APIs

Then prove:
- bunx tsc --noEmit passes
- bun test passes
- bun run src/scripts/init.ts
- bun run src/db/migrate.ts
- bun start --mock --no-ui produces results.tsv rows, db rows, git commits.

D2) CI/CD scaffolding (must exist early to prevent missing path drift)
Implement all:
- .github/workflows/*.yml
- .github/actions/*/action.yml
- scripts/ci/*.ts
- scripts/deploy/*.ts
- scripts/hooks/*
- .github/CODEOWNERS
Even if some scripts are minimal stubs initially, they must exist and exit non-zero on failure.

D3) Migrations and schemas (CI requires these paths)
Ensure these exist and run idempotently:
- src/db/migrate.ts
- src/db/migrate-phase5.ts
- src/db/migrate-phase5_1.ts
- src/db/migrate-phase6.ts
- src/db/migrate-phase6_1.ts
- src/db/migrate-phase7.ts
- src/db/migrate-phase8.ts
- src/db/migrate-phase9.ts
- src/db/migrate-phase10.ts
If a schema file isn’t fully included in Autoorg.md, implement minimal tables referenced by scripts/workflows and runtime modules.

D4) Phase 1+ (real adapters and agent runner)
- adapters, prompts, structured output parser, transcript logger, mailbox
- keep mock mode working for tests/CI.

D5) Web dashboard
- Ensure web app compiles and the pages/components referenced exist.

D6) Tools + security + benchmarks + learning (stub acceptable if spec-only)
- Implement CODE-block files verbatim where provided.
- Provide minimal compile-time stubs for SPEC-only modules.

========================================
E) REQUIRED SELF-AUDIT OUTPUTS
========================================
Create these artifacts in every completion:
- artifacts/build/manifest.json (or use extracted paths.json as manifest)
- artifacts/build/coverage-report.json
- artifacts/build/implementation-notes.md (every reconciliation choice)
- artifacts/build/final-checklist.md: table listing each path and status:
  implemented / stubbed / runtime-only / not-applicable

========================================
F) FINAL ACCEPTANCE (MUST PASS)
========================================
F1) Build:
  bun install
  bunx tsc --noEmit
  bun test

F2) Migrations:
  bun run scripts/ci/migrate-all.ts --verify
  bun run scripts/ci/migrate-all.ts --verify

F3) Run:
  bun run src/scripts/init.ts
  bun run src/db/migrate.ts
  bun start --mock --no-ui

F4) Smoke test:
  bun run src/api/server.ts (if present)
  bun run scripts/ci/smoke-test.ts

Stop and fix until all pass.
3) tools/extract-paths.ts (required)
(Identical to what I gave earlier; included here so this bundle is self-contained.)

TypeScript

#!/usr/bin/env bun
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type Kind = "file" | "dir";

type ExtractedPath = {
  path: string;
  kind: Kind;
  ext: string | null;
  group: string;
  placeholder: boolean;
  source: "regex";
};

function stripPunctuation(s: string) {
  return s
    .trim()
    .replace(/^[`"'([{<]+/g, "")
    .replace(/[`"')\]}>]+$/g, "")
    .replace(/[.,;:]+$/g, "");
}

function isProbablyUrlToken(s: string) {
  return s.startsWith("http://") || s.startsWith("https://") || s.includes("raw.githubusercontent.com");
}

function normalizeSlashes(s: string) {
  return s.replace(/\\/g, "/");
}

function groupFor(p: string): string {
  if (p.startsWith(".github/")) return ".github";
  if (p.startsWith("src/")) return "src";
  if (p.startsWith("web/")) return "web";
  if (p.startsWith("scripts/")) return "scripts";
  if (p.startsWith("roles/")) return "roles";
  if (p.startsWith("mailbox/")) return "mailbox";
  if (p.startsWith("memory/")) return "memory";
  if (p.startsWith("workspace/")) return "workspace";
  if (p.startsWith("knowledge-graph/")) return "knowledge-graph";
  if (p.startsWith("benchmarks/")) return "benchmarks";
  if (p.startsWith("artifacts/")) return "artifacts";
  if (p.startsWith("portfolio/")) return "portfolio";
  if (p.startsWith("platform/")) return "platform";
  return p.split("/")[0] || "root";
}

function extFor(p: string): string | null {
  const base = p.split("/").pop() ?? p;
  const idx = base.lastIndexOf(".");
  if (idx < 0) return null;
  return base.slice(idx + 1).toLowerCase();
}

function isPlaceholder(p: string): boolean {
  return p.includes("<") || p.includes(">") || p.includes("...") || p.includes("{") || p.includes("}");
}

function uniq<T>(arr: T[]): T[] {
  return Array.from(new Set(arr));
}

function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i];
    const v = process.argv[i + 1];
    if (k && v && k.startsWith("--")) args.set(k, v);
  }

  const inPath = args.get("--in") ?? "Autoorg.md";
  const outDir = args.get("--outDir") ?? "artifacts/build";
  const outJson = args.get("--outJson") ?? path.join(outDir, "paths.json");
  const outMd = args.get("--outMd") ?? path.join(outDir, "paths.md");

  const raw = readFileSync(inPath, "utf-8");
  const text = normalizeSlashes(raw);

  const fileExts = [
    "ts","tsx","js","jsx","sql","yml","yaml","md","json","toml","sh","bash","txt","css"
  ].join("|");

  const fileRe = new RegExp(
    String.raw`(?<![A-Za-z0-9_])(?:\.?[A-Za-z0-9_-]+(?:\/[A-Za-z0-9_.-]+)*\/)?[A-Za-z0-9_.-]+\.(?:${fileExts})(?![A-Za-z0-9_])`,
    "g"
  );

  const dirRe = new RegExp(
    String.raw`(?<![A-Za-z0-9_])(?:\.?[A-Za-z0-9_-]+\/)+(?!\/)(?![A-Za-z0-9_.-])`,
    "g"
  );

  const rawFileHits = text.match(fileRe) ?? [];
  const rawDirHits = text.match(dirRe) ?? [];

  const fileHits = uniq(rawFileHits)
    .map(stripPunctuation)
    .filter(Boolean)
    .filter((p) => !isProbablyUrlToken(p));

  const dirHits = uniq(rawDirHits)
    .map(stripPunctuation)
    .filter(Boolean)
    .filter((p) => !isProbablyUrlToken(p));

  const entries: ExtractedPath[] = [];

  for (const p of fileHits) {
    entries.push({
      path: p,
      kind: "file",
      ext: extFor(p),
      group: groupFor(p),
      placeholder: isPlaceholder(p),
      source: "regex"
    });
  }

  for (const p0 of dirHits) {
    const p = p0.endsWith("/") ? p0 : `${p0}/`;
    entries.push({
      path: p,
      kind: "dir",
      ext: null,
      group: groupFor(p),
      placeholder: isPlaceholder(p),
      source: "regex"
    });
  }

  const key = (e: ExtractedPath) => `${e.kind}:${e.path}`;
  const dedup = Array.from(new Map(entries.map((e) => [key(e), e])).values())
    .sort((a, b) => a.path.localeCompare(b.path));

  const grouped: Record<string, ExtractedPath[]> = {};
  for (const e of dedup) {
    grouped[e.group] ??= [];
    grouped[e.group].push(e);
  }

  mkdirSync(outDir, { recursive: true });
  writeFileSync(outJson, JSON.stringify({ inPath, count: dedup.length, grouped }, null, 2));

  let md = `# AutoOrg path extraction report\n\n`;
  md += `Input: \`${inPath}\`\n\n`;
  md += `Total extracted entries: **${dedup.length}**\n\n`;

  for (const [grp, list] of Object.entries(grouped).sort(([a], [b]) => a.localeCompare(b))) {
    md += `## ${grp} (${list.length})\n\n`;
    md += `| kind | path | ext | placeholder |\n|---|---|---|---|\n`;
    for (const e of list) {
      md += `| ${e.kind} | \`${e.path}\` | ${e.ext ?? ""} | ${e.placeholder ? "yes" : "no"} |\n`;
    }
    md += `\n`;
  }

  writeFileSync(outMd, md);
  console.log(`Wrote:\n- ${outJson}\n- ${outMd}`);
}

main();
4) tools/extract-file-bodies.ts (recommended; use when Autoorg.md contains inline file bodies)
This script tries to split Autoorg.md into files when it sees “file header lines” and captures content until the next header.

It’s heuristic by nature, but in practice it dramatically reduces agent errors when the spec includes large inline bodies (schemas, TS modules, workflows).

TypeScript

#!/usr/bin/env bun
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";

type Extracted = {
  filePath: string;
  languageHint: string | null;
  startLine: number;
  endLine: number;
  bytes: number;
  sha256: string;
};

function sha256Hex(s: string) {
  // Bun has built-in crypto
  const hash = new Bun.CryptoHasher("sha256");
  hash.update(s);
  return hash.digest("hex");
}

/**
 * Header patterns seen in specs like Autoorg.md:
 * - "FILE 1: src/db/schema-phase6.sql"
 * - "src/tools/tool-runner.ts TypeScript"
 * - ".github/workflows/ci.yml YAML"
 * - "schema-phase6.sql" (sometimes mentioned without prefix; we avoid this one unless it looks like a path)
 */
const HEADER_RES = [
  // FILE N: path
  /^FILE\s+\d+\s*:\s*(?<p>(?:\.github\/|src\/|web\/|scripts\/|benchmarks\/|roles\/|memory\/|workspace\/|tools\/|config\/|tests\/)[^\s]+)$/i,

  // path + language word
  /^(?<p>(?:\.github\/|src\/|web\/|scripts\/|benchmarks\/|roles\/|memory\/|workspace\/)[^\s]+)\s+(?<lang>TypeScript|TSX|JavaScript|SQL|YAML|JSON|Markdown|Bash|Shell)$/i,

  // plain path line
  /^(?<p>(?:\.github\/|src\/|web\/|scripts\/|benchmarks\/|roles\/|memory\/|workspace\/)[A-Za-z0-9_.\/-]+\.(?:ts|tsx|js|sql|yml|yaml|json|md|toml|sh))$/i
];

function isHeaderLine(line: string): { p: string; lang: string | null } | null {
  for (const re of HEADER_RES) {
    const m = line.match(re);
    if (m?.groups?.p) {
      return { p: m.groups.p.trim(), lang: (m.groups as any).lang ?? null };
    }
  }
  return null;
}

function sanitizePath(p: string) {
  // Normalize and strip trailing punctuation/backticks
  return p
    .trim()
    .replace(/^[`"'([{<]+/g, "")
    .replace(/[`"')\]}>]+$/g, "")
    .replace(/[.,;:]+$/g, "")
    .replace(/\\/g, "/");
}

function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i];
    const v = process.argv[i + 1];
    if (k && v && k.startsWith("--")) args.set(k, v);
  }

  const inPath = args.get("--in") ?? "Autoorg.md";
  const outDir = args.get("--outDir") ?? "artifacts/extracted";

  const raw = readFileSync(inPath, "utf-8");
  const lines = raw.split(/\r?\n/);

  const hits: { idx: number; p: string; lang: string | null }[] = [];

  for (let i = 0; i < lines.length; i++) {
    const header = isHeaderLine(lines[i].trim());
    if (header) {
      hits.push({ idx: i, p: sanitizePath(header.p), lang: header.lang });
    }
  }

  mkdirSync(outDir, { recursive: true });

  const extracted: Extracted[] = [];

  for (let h = 0; h < hits.length; h++) {
    const startHeaderLine = hits[h].idx;
    const filePath = hits[h].p;
    const languageHint = hits[h].lang;

    const startContentLine = startHeaderLine + 1;
    const endContentLineExclusive = (h + 1 < hits.length) ? hits[h + 1].idx : lines.length;

    // Extract content block
    // Heuristic: trim leading empty lines after header, but keep internal formatting.
    let block = lines.slice(startContentLine, endContentLineExclusive).join("\n");
    block = block.replace(/^\s*\n+/, ""); // drop leading blank lines only

    // Skip trivially small blocks (likely just headings that mention a path)
    if (block.trim().length < 40) continue;

    const sha = sha256Hex(block);
    const absOut = path.join(outDir, filePath);
    const absOutDir = path.dirname(absOut);
    mkdirSync(absOutDir, { recursive: true });

    writeFileSync(absOut, block, "utf-8");

    extracted.push({
      filePath,
      languageHint,
      startLine: startHeaderLine + 1,
      endLine: endContentLineExclusive,
      bytes: Buffer.byteLength(block, "utf-8"),
      sha256: sha
    });
  }

  const indexPath = path.join(outDir, "index.json");
  writeFileSync(indexPath, JSON.stringify({ inPath, headersFound: hits.length, extractedCount: extracted.length, extracted }, null, 2));
  console.log(`Headers found: ${hits.length}`);
  console.log(`Extracted files: ${extracted.length}`);
  console.log(`Index: ${indexPath}`);
}

main();
5) tools/coverage-report.ts (required)
This takes artifacts/build/paths.json from extract-paths.ts and checks the filesystem for existence. It classifies paths as:

present_files
present_dirs
missing_source_files
runtime_like (heuristic: artifacts/, workspace/proposals, transcripts, etc.)
placeholders (paths with <...> or {...} etc.)
TypeScript

#!/usr/bin/env bun
import { existsSync, readFileSync, writeFileSync, mkdirSync, statSync } from "node:fs";
import path from "node:path";

type ExtractedPath = {
  path: string;
  kind: "file" | "dir";
  ext: string | null;
  group: string;
  placeholder: boolean;
  source: string;
};

type PathsJson = {
  inPath: string;
  count: number;
  grouped: Record<string, ExtractedPath[]>;
};

function looksRuntimeLike(p: string) {
  return (
    p.startsWith("artifacts/") ||
    p.startsWith("workspace/proposals/") ||
    p.startsWith("workspace/snapshots/") ||
    p.startsWith("memory/transcripts/") ||
    p.endsWith(".db") ||
    p.endsWith(".db-wal") ||
    p.endsWith(".db-shm") ||
    p.includes("<") ||
    p.includes(">") ||
    p.includes("{") ||
    p.includes("}") ||
    p.includes("...")
  );
}

function flatten(grouped: Record<string, ExtractedPath[]>) {
  const out: ExtractedPath[] = [];
  for (const v of Object.values(grouped)) out.push(...v);
  return out;
}

function main() {
  const args = new Map<string, string>();
  for (let i = 2; i < process.argv.length; i += 2) {
    const k = process.argv[i];
    const v = process.argv[i + 1];
    if (k && v && k.startsWith("--")) args.set(k, v);
  }

  const pathsFile = args.get("--paths") ?? "artifacts/build/paths.json";
  const root = args.get("--root") ?? ".";
  const out = args.get("--out") ?? "artifacts/build/coverage-report.json";

  const data = JSON.parse(readFileSync(pathsFile, "utf-8")) as PathsJson;
  const items = flatten(data.grouped);

  const present_files: string[] = [];
  const present_dirs: string[] = [];
  const missing_source_files: string[] = [];
  const runtime_like: string[] = [];
  const placeholders: string[] = [];

  for (const item of items) {
    const p = item.path;
    const abs = path.join(root, p);

    if (item.placeholder || p.includes("<") || p.includes(">") || p.includes("{") || p.includes("}") || p.includes("...")) {
      placeholders.push(p);
      continue;
    }

    if (looksRuntimeLike(p)) {
      runtime_like.push(p);
      // We do not require runtime-like to exist pre-implementation; only directories might.
      continue;
    }

    if (!existsSync(abs)) {
      // For dirs, allow missing; agent can create later. For files, mark missing.
      if (item.kind === "file") missing_source_files.push(p);
      continue;
    }

    try {
      const st = statSync(abs);
      if (st.isDirectory()) present_dirs.push(p);
      else present_files.push(p);
    } catch {
      // treat as missing
      if (item.kind === "file") missing_source_files.push(p);
    }
  }

  mkdirSync(path.dirname(out), { recursive: true });
  const report = {
    input: { pathsFile, root },
    totals: {
      extracted: items.length,
      present_files: present_files.length,
      present_dirs: present_dirs.length,
      missing_source_files: missing_source_files.length,
      runtime_like: runtime_like.length,
      placeholders: placeholders.length
    },
    present_files: present_files.sort(),
    present_dirs: present_dirs.sort(),
    missing_source_files: missing_source_files.sort(),
    runtime_like: runtime_like.sort(),
    placeholders: placeholders.sort()
  };

  writeFileSync(out, JSON.stringify(report, null, 2));
  console.log(`Wrote ${out}`);

  if (missing_source_files.length > 0) {
    console.error(`Missing source files: ${missing_source_files.length}`);
    process.exit(2);
  }
}

main();
6) tools/README.md
Markdown

# Tools

These tools turn `Autoorg.md` into a mechanical checklist so an agent can implement the repo without missing files.

## 1) Extract referenced paths (required)
```bash
bun tools/extract-paths.ts --in Autoorg.md --outDir artifacts/build
Outputs:

artifacts/build/paths.json
artifacts/build/paths.md
2) Coverage report (required)
Bash

bun tools/coverage-report.ts --paths artifacts/build/paths.json --root . --out artifacts/build/coverage-report.json
This fails with exit code 2 if it finds missing source files.

3) Extract inline file bodies (recommended)
Bash

bun tools/extract-file-bodies.ts --in Autoorg.md --outDir artifacts/extracted
This writes files into artifacts/extracted/<path-from-doc> plus an index:

artifacts/extracted/index.json
You can then copy extracted files into the repo tree, preserving the doc-provided implementations.

text


---

# How to use the bundle (one-time steps)

1) Create the files above under your repo.  
2) Run:
```bash
bun tools/extract-paths.ts --in Autoorg.md --outDir artifacts/build
bun tools/coverage-report.ts --paths artifacts/build/paths.json --root . --out artifacts/build/coverage-report.json
If coverage-report.ts fails (missing files), hand both:
Autoorg.md
AGENT_BUILD_PROMPT.txt
to your coding agent and instruct it: “Do not proceed until coverage is green.”



AGENT_CHECKLIST_TEMPLATE.md. Your agent should duplicate it to artifacts/build/final-checklist.md and fill it as it implements.

Markdown

# AutoOrg Implementation Checklist (Agent-Filled)

This checklist is derived from `Autoorg.md` and the manifest/coverage gates.
Fill this in during implementation and commit it (or output it) as:
- `artifacts/build/final-checklist.md`

Legend:
- ✅ Implemented (matches spec and compiles)
- 🟨 Stubbed (compiles; TODO to complete; allowed only if Autoorg.md provides no full code)
- 🧪 Test-covered (unit/integration)
- 🟪 Runtime-generated (do not create as source; ensure directory exists)
- ❌ Missing (must fix before declaring done)

---

## 0) Manifest + coverage gates (must be green before coding)
- [ ] Run `bun tools/extract-paths.ts --in Autoorg.md --outDir artifacts/build`
- [ ] Run `bun tools/coverage-report.ts --paths artifacts/build/paths.json --root . --out artifacts/build/coverage-report.json`
- [ ] `missing_source_files.length === 0`
- [ ] Create `artifacts/build/implementation-plan.md`
- [ ] Create `artifacts/build/implementation-notes.md` (record reconciliation decisions)

Artifacts present:
- [ ] `artifacts/build/paths.json`
- [ ] `artifacts/build/paths.md`
- [ ] `artifacts/build/coverage-report.json`

Optional extraction:
- [ ] Run `bun tools/extract-file-bodies.ts --in Autoorg.md --outDir artifacts/extracted`
- [ ] `artifacts/extracted/index.json` created

---

## 1) Phase 0 (Skeleton MVP) — must run end-to-end in mock mode
### Repo/config
- [ ] `package.json` ✅/🟨 (merged scripts; start works)
- [ ] `tsconfig.json` ✅
- [ ] `bunfig.toml` ✅
- [ ] `.env.example` ✅ (AUTOORG_* + legacy fallbacks)
- [ ] `.gitignore` ✅

### Core code
- [ ] `src/types/index.ts` ✅
- [ ] `src/config/org-parser.ts` ✅
- [ ] `src/config/env.ts` ✅ (compat bridge)
- [ ] `src/db/schema.sql` ✅
- [ ] `src/db/migrate.ts` ✅
- [ ] `src/utils/git.ts` ✅
- [ ] `src/utils/results-logger.ts` ✅
- [ ] `src/runtime/ratchet.ts` ✅
- [ ] `src/runtime/orchestrator.ts` ✅
- [ ] `src/scripts/init.ts` ✅
- [ ] `src/scripts/verify.ts` ✅/🟨
- [ ] `src/index.ts` ✅

### Tests
- [ ] `tests/ratchet.test.ts` ✅ 🧪
- [ ] `tests/org-parser.test.ts` ✅ 🧪
- [ ] `bun test` passes ✅
- [ ] `bunx tsc --noEmit` passes ✅

### Phase 0 run proof
Commands executed and confirmed:
- [ ] `bun run src/scripts/init.ts` ✅
- [ ] `bun run src/db/migrate.ts` ✅
- [ ] `bun start --mock --no-ui` ✅
Observed outputs:
- [ ] `results.tsv` has ≥ 3 rows ✅
- [ ] `autoorg.db` created ✅
- [ ] `workspace/current_output.md` created ✅
- [ ] `workspace/proposals/` has cycle files ✅
- [ ] git commits created by ratchet ✅

---

## 2) Phase 1 (Real agents) — adapters + prompts + structured outputs
### Adapters
- [ ] `src/adapters/base-adapter.ts` ✅/🟨
- [ ] `src/adapters/adapter-factory.ts` ✅/🟨
- [ ] `src/adapters/anthropic-adapter.ts` ✅/🟨
- [ ] `src/adapters/openai-adapter.ts` ✅/🟨
- [ ] `src/adapters/openai-compatible-adapter.ts` ✅/🟨
- [ ] `src/adapters/ollama-adapter.ts` ✅/🟨

### Runtime utilities
- [ ] `src/utils/structured-output.ts` ✅ 🧪
- [ ] `src/utils/retry.ts` ✅ 🧪
- [ ] `src/runtime/mailman.ts` ✅/🟨
- [ ] `src/runtime/transcript-logger.ts` ✅/🟨
- [ ] `src/runtime/agent-runner.ts` ✅/🟨

### Prompts
- [ ] `src/prompts/base.ts` ✅/🟨
- [ ] `src/prompts/ceo.ts` ✅/🟨
- [ ] `src/prompts/engineer.ts` ✅/🟨
- [ ] `src/prompts/critic.ts` ✅/🟨
- [ ] `src/prompts/devils-advocate.ts` ✅/🟨
- [ ] `src/prompts/archivist.ts` ✅/🟨
- [ ] `src/prompts/ratchet-judge.ts` ✅/🟨

Mock-mode safety:
- [ ] Tests do not call external providers ✅
- [ ] Real mode only runs when keys present ✅

---

## 3) Phase 2 (Org pipeline + web dashboard)
### DB / API
- [ ] Phase 2 migration exists and is idempotent ✅/🟨
- [ ] `src/api/server.ts` exists and serves `GET /health` ✅

### Runtime
- [ ] `src/runtime/event-bus.ts` ✅/🟨
- [ ] `src/runtime/objection-tracker.ts` ✅/🟨
- [ ] `src/runtime/cycle-context-builder.ts` ✅/🟨
- [ ] `src/runtime/pipeline.ts` ✅/🟨
- [ ] `src/runtime/interview.ts` ✅/🟨

### Web
- [ ] `web/app/layout.tsx` ✅
- [ ] `web/app/page.tsx` ✅
- [ ] `web/components/ObjectionTracker.tsx` ✅/🟨
- [ ] `web/app/graph/[nodeId]/page.tsx` ✅

---

## 4) Phase 3 (Memory + Dream)
- [ ] `src/runtime/memory-manager.ts` ✅
- [ ] `src/runtime/dream.ts` ✅/🟨
- [ ] memory tier directories exist ✅
- [ ] MEMORY cap enforced (document value) ✅

---

## 5) Phase 4 (GraphRAG) + Phase 4.1 (Deterministic grounding)
- [ ] Phase 4 schema/migration ✅/🟨
- [ ] graph builder/query/health/export modules exist ✅/🟨
- [ ] Phase 4.1 schema/migration ✅/🟨
- [ ] deterministic groundedness validator exists ✅/🟨
- [ ] graph snapshots/diffs exist ✅/🟨
- [ ] tests for citations/groundedness/snapshots 🧪 ✅/🟨

---

## 6) Phase 5 (Hierarchy/daemon/approvals/GitHub) + Phase 5.1 (Hardening)
- [ ] `src/db/schema-phase5.sql` ✅
- [ ] `src/db/migrate-phase5.ts` ✅
- [ ] `src/integrations/github.ts` ✅
- [ ] `src/integrations/pr-writer.ts` ✅
- [ ] `src/runtime/daemon.ts` ✅/🟨

Hardening (5.1):
- [ ] `src/db/schema-phase5_1.sql` ✅
- [ ] `src/db/migrate-phase5_1.ts` ✅
- [ ] strict approval blocking behavior implemented ✅/🟨
- [ ] workspace locks/leasing/recovery journal ✅/🟨

---

## 7) Phase 6 (Tools) + Phase 6.1 (Security/provenance/signing)
Phase 6:
- [ ] `src/db/schema-phase6.sql` ✅
- [ ] `src/db/migrate-phase6.ts` ✅
- [ ] `src/tools/tool-runner.ts` ✅
- [ ] `src/tools/evidence-pack.ts` ✅

Phase 6.1:
- [ ] `src/db/schema-phase6_1.sql` ✅
- [ ] `src/db/migrate-phase6_1.ts` ✅/🟨
- [ ] `src/runtime/artifact-signing.ts` ✅
- [ ] `src/runtime/immutable-artifacts.ts` ✅
- [ ] `src/runtime/security-audit.ts` ✅
- [ ] `/security`, `/provenance`, `/ledger` pages exist ✅/🟨

---

## 8) Phase 7 (Benchmarks/regressions)
- [ ] `src/db/schema-phase7.sql` ✅
- [ ] `src/db/migrate-phase7.ts` ✅/🟨
- [ ] `src/evals/suite-loader.ts` ✅
- [ ] `src/evals/gold-evaluator.ts` ✅
- [ ] `src/evals/benchmark-ci.ts` exists (CI depends on it) ✅/🟨
- [ ] example benchmarks exist under `benchmarks/suites/` ✅/🟨

---

## 9) Phase 8 (Portfolio)
- [ ] `src/db/migrate-phase8.ts` exists ✅/🟨
- [ ] portfolio runtime modules exist ✅/🟨
- [ ] artifacts written under `artifacts/portfolio/` 🟪

---

## 10) Phase 9 (Platform)
- [ ] `src/db/migrate-phase9.ts` exists ✅/🟨
- [ ] admin routes exist ✅/🟨
- [ ] sdk client/types/index exist ✅/🟨

---

## 11) Phase 10 (Learning org)
- [ ] `src/db/schema-phase10.sql` ✅
- [ ] `src/db/migrate-phase10.ts` ✅
- [ ] `src/prompts/improvement-proposer.ts` ✅
- [ ] `src/learning/release-gate.ts` ✅
- [ ] learn script target exists ✅/🟨

---

## 12) CI/CD: workflows + actions + scripts + hooks
### Workflows
- [ ] `.github/workflows/ci.yml` ✅
- [ ] all other workflows referenced exist ✅/🟨

### Composite actions
- [ ] `.github/actions/setup-autoorg/action.yml` ✅/🟨
- [ ] `.github/actions/run-migrations/action.yml` ✅/🟨
- [ ] `.github/actions/benchmark-gate/action.yml` ✅
- [ ] `.github/actions/health-check/action.yml` ✅

### Scripts
- [ ] all `scripts/ci/*.ts` exist ✅/🟨
- [ ] all `scripts/deploy/*.ts` exist ✅/🟨
- [ ] hooks exist and are executable ✅/🟨
- [ ] `.github/CODEOWNERS` ✅

---

## 13) Final proof (must be green)
- [ ] `bun install` ✅
- [ ] `bunx tsc --noEmit` ✅
- [ ] `bun test` ✅
- [ ] `bun run scripts/ci/migrate-all.ts --verify` ✅ (twice)
- [ ] `bun start --mock --no-ui` ✅
- [ ] `bun run scripts/ci/smoke-test.ts` ✅

---

## Notes / reconciliation decisions (must fill)
- Env var compatibility decisions:
- Phase 5 meaning decision:
- Memory cap decision:
- Graph backend fallback decision:
- TS import extension decision:
- Any stubs left and why:


This template + the manifest/coverage gates is the final piece that makes the whole handoff “sorted”: it gives the agent a structured “tick-tock” checklist and gives you an easy way to verify completeness.
