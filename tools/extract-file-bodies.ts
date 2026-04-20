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
