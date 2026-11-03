# Contributing to AutoOrg

## Requirements

- [Bun](https://bun.sh) **1.1+** (the project uses `bun:sqlite` and `Bun.serve`;
  Node will not run it).
- Optional: [Ollama](https://ollama.ai) for local inference.

## Setup

```bash
bun install
bun run setup:hooks        # installs the commit-msg + pre-commit hooks
cp .env.example .env       # then fill in the keys you have
bun run db:migrate         # creates ./autoorg.db
```

`bun run setup:hooks` sets `core.hooksPath`, so the hooks in `scripts/hooks/`
run for every commit. They enforce the commit message format below and block
committed secrets.

## Verify before pushing

CI runs exactly these steps, so run them locally to avoid a red build:

```bash
bun run typecheck          # tsc --noEmit
bun run db:migrate         # must succeed on an empty database
bun run db:migrate         # must be a no-op the second time
bun run test:ci            # bun test tests/
bun run build              # bun build of the CLI + API
bun run lint
bun run security           # secret / artifact / route-auth scan
```

## Commit messages

Enforced by `scripts/hooks/commit-msg`:

```
type(scope): message
```

`type` is one of `feat fix chore docs test refactor perf ci build style revert`,
and the message must be at least 5 characters. Example:
`fix(db): reconcile schema with runtime`.

## Schema changes

`src/db/migrations/` is the single source of truth. There is no `schema.sql`.

1. **Never edit an applied migration.** A checksum is stored in
   `schema_migrations`; editing one makes `migrate()` fail by design.
2. Add `src/db/migrations/00N_description.sql` with the next number.
3. For new **columns** on an existing table, add an entry to `ADDED_COLUMNS` in
   `src/db/migrate.ts` as well — SQLite has no `ADD COLUMN IF NOT EXISTS`.
4. For a table whose old shape must be replaced, add a `RebuildSpec` to
   `REBUILDS` in `src/db/migrate.ts`.
5. `tests/schema-contract.test.ts` validates every static `INSERT`/`UPDATE` in
   `src/` against a freshly migrated database. Run it — it is the reason this
   repo no longer drifts.

Dynamic SQL (`` `UPDATE t SET ${cols}` ``) is skipped by that check. Prefer
static SQL; if you must build it dynamically, add a runtime test.

## Tests

- Put tests in `tests/*.test.ts`.
- **Never** write to `./autoorg.db`. Use the helper:

  ```ts
  import { useTestDb, cleanupTestDb, testRunId } from './helpers/test-db.ts';

  beforeAll(async () => { await useTestDb('myfeature-'); });
  afterAll(() => cleanupTestDb());
  ```

- **Never** hand-roll `CREATE TABLE` in a test. A test-local `objections` table
  once hid the fact that the real migration never created it.
- For SQL-level changes, run the schema-contract test.
- Feature flags: set `FEATURE_<SNAKE_CASE>` (e.g. `FEATURE_KNOWLEDGE_GRAPH`) and
  call `invalidateFlagCache()` before asserting.

## Security expectations

- Mutating API endpoints require `AUTOORG_API_KEY`. Do not add a route that
  writes state without going through `authenticate(req, true)`.
- Do not reintroduce a wildcard `Access-Control-Allow-Origin`; use
  `AUTOORG_CORS_ORIGINS`.
- `bun run security` fails the build on these, plus committed secrets and
  tracked build output.

## Generated files

Never commit databases (`*.db*`), `web/.next/`, `dist/`, `test-results/`,
logs, or a literal `~/` directory (that last one came from a `bunfig.toml` cache
path Bun does not expand).
