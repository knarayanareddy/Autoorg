# Autoorg review

## Scope and verdict

**Revision:** `c98c4e8456a5231ef9872cfb59cb787990ef541b`. **Stage:** implemented agent platform with a separate dashboard; production readiness is not established. **Runtime: NOT RUN.** The sampled staging deployment path can report success without deploying, and its rollback step does not establish a remote restore. Do not treat a green workflow as evidence of a deployed version.

This is a partial static review. The snapshot supplies the full tree and samples of README, both package manifests, CI and CD workflows, the documentation page script, CLI entry point, and four security/approval tests. Targeted pinned reads added the single-node deployer, rollback script, health-check action and API authentication module. The scheduler, tool executor, database migrations, provider adapters, API routing, dashboard components, and most test bodies were not traced. The `artifacts/extracted/` tree is a separate extracted copy: its files are not evidence of active workflows or live code. No installation, build, test, deployment, live provider request, browser or security scan was run.

## Architecture and boundary

The root [manifest](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/package.json#L5-L29) defines separate CLI (`src/index.ts`) and API (`src/api/server.ts`) entry points, Bun scripts and a root build; `web/package.json` defines a separately installed Next dashboard. The [CLI](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/src/index.ts#L20-L25) parses organization-file, headless and mock options. The tree includes adapters for external model services, repository/web tools, storage and approval modules; their existence alone does not prove call-site wiring. The README calls the platform “production-grade” and promises approval gating and crash recovery ([README:7-16](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/README.md#L7-L16)); those end-to-end claims were not exercised.

## Findings ledger

### AO-01 — High, confirmed static: deployment reports completion without deploying

[scripts/deploy/deploy-single-node.ts:15-20,26-44](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/scripts/deploy/deploy-single-node.ts#L15-L44) returns normally when the SSH key is missing; with a key, both the bundle transfer and the remote command are commented out before “Single-node deploy complete.” [CD:24-35](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/.github/workflows/cd.yml#L24-L35) invokes this script and then permits a local health fallback. A workflow can therefore verify a process other than the intended staged revision. Static confidence is high; an actual historical false-positive deployment is not established. Replace the success path with a real, authenticated, version-verified deployment or fail closed until one exists.

### AO-02 — High, confirmed static: rollback is not a staging rollback

[CD:42-46](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/.github/workflows/cd.yml#L42-L46) invokes rollback with a SHA but does not supply the staging SSH host to that step. [scripts/ci/rollback.ts:30-47](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/scripts/ci/rollback.ts#L30-L47) selects local checkout when `SSH_HOST` is absent; its remote branch explicitly refuses unimplemented rollback unless mock mode is selected. Restoring files in the runner is not restoring staging. Rollback can fail, too, depending on checkout history and paths; neither result proves remote recovery. Require a deployed artifact/version pointer and observable target-side recovery, including database compatibility.

### AO-03 — Medium, confirmed static: SSH host identity is disabled in the proposed deployment path

The same [deployer:22-27](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/scripts/deploy/deploy-single-node.ts#L22-L27) constructs SSH/SCP with `StrictHostKeyChecking=no`. Those remote commands are currently commented out, so this is a **latent** credential and artifact integrity risk if enabled, not a demonstrated interception. Provision verified host keys, avoid shell interpolation of untrusted settings, and test host-key rejection before enabling transport.

### AO-04 — Medium, unverified risk: WebSocket credentials may enter URL logs

[API auth:138-145](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/src/api/auth.ts#L138-L145) accepts a `token` query parameter; [WebSocket tests:11-17](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/tests/api-websocket-auth.test.ts#L11-L17) explicitly exercise it. Whether any proxy, browser telemetry or application log records the URL is unknown; exposure is not proven. Prefer a short-lived scoped handshake credential and verify log redaction and origin handling on the actual proxy and server path.

### AO-05 — Medium, historical CI: dependency update jobs failed at this revision

The snapshot records failed [web dependency update](https://github.com/knarayanareddy/Autoorg/actions/runs/41658449546) and [root dependency update](https://github.com/knarayanareddy/Autoorg/actions/runs/41658449995) runs, both associated with the pinned SHA. Their failure reasons were not sampled; they are not proof of vulnerable packages or failed application tests. Triage each run's logs separately and confirm update automation and both lockfiles recover without weakening checks.

### AO-06 — Low, confirmed static: documentation motion lacks an observed reduced-motion path

[docs/app.js:7-20,23-30](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/docs/app.js#L7-L30) applies scroll and timed transitions directly; no preference check appears in that sampled script. CSS and browser behavior were not assessed, so an accessibility violation is not established. Review reduced-motion handling together with the CSS and test the rendered page.

## Five-discipline assessment

Short source excerpts supporting the ledger: AO-01, `// await $` on the transfer and SSH execution lines, followed by `Single-node deploy complete`; AO-02, `if (!SSH_HOST)` and `Remote rollback is not implemented`; AO-03, `StrictHostKeyChecking=no`; AO-04, `searchParams.get('token')`; AO-05, the recorded dependency runs each have `conclusion: failure`. The pinned links in each finding locate these excerpts. Historical run conclusions do not establish root cause.

**Code review.** The deployment script's two commented calls contradict its success message, while the CLI and API are distinct build entry points. The approval tests describe a real staged-commit contract ([tests/approval-gate.test.ts:1-15](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/tests/approval-gate.test.ts#L1-L15)); source-to-runtime wiring and failure cases remain unverified.

**Automation.** [CI:38-67](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/.github/workflows/ci.yml#L38-L67) declares frozen installation, typecheck, migrations, tests, build, lint, security and audit. Their scripts and results were not executed here. A listed test is not a passed test; the two dependency-update failures are separate historical jobs. CI installs `bun-version: latest` ([CI:27-31](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/.github/workflows/ci.yml#L27-L31)), making toolchain drift a reproducibility concern, not a demonstrated defect.

**DevOps.** Deployment, release identity and recovery are blocked by AO-01/02. CD uses a runner-local database path ([CD:7-9](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/.github/workflows/cd.yml#L7-L9)); this does not prove the target's migration state. Restore drills, observability, release signing and health/version correspondence are unknown.

**OWASP/security.** The inspected [auth module](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/src/api/auth.ts#L39-L80) uses a configured API key and boot guard; actual route coverage, per-user authorization and proxy configuration remain unknown. Webhook validation has named tests but was not exercised. Tool input injection, repository access, agent prompt injection, SSRF, tenant separation, transcript retention, provider secret storage and dependency integrity require targeted review. AO-03/04 identify bounded risks, not a claim of compromise.

**UI/UX/accessibility.** The tree contains terminal and Next interfaces as well as a separate marketing page. Only the latter's script was sampled; screen reader behavior, keyboard controls, approval confirmation, errors, motion and responsive layouts were not observed. The manifest has no dashboard test script in its sampled scripts ([web/package.json:5-9](https://github.com/knarayanareddy/Autoorg/blob/c98c4e8456a5231ef9872cfb59cb787990ef541b/web/package.json#L5-L9)); that alone does not prove there are no tests elsewhere.

## Production blockers and owner decisions

Owner must identify the real staging target and intended deployment mechanism, approve host identity management and rollback approach, and decide which data and provider credentials may be used in a controlled verification environment. Production release also requires independently observed restore and approval behavior, dependency-job triage, and an agreed retention policy. No provider credential, deployment account, recovery point objective, signing key or domain validation was available for this review.

## Evidence inventory and limitations

Snapshot samples: `README.md:1-263`, `package.json:1-62`, `web/package.json:1-30`, active `.github/workflows/{ci,cd}.yml`, `docs/app.js:1-42`, `src/index.ts:1-152`, `tests/api-auth.test.ts:1-168`, `tests/api-server-security.test.ts:1-99`, `tests/api-websocket-auth.test.ts:1-30`, and `tests/approval-gate.test.ts:1-220` of 293 lines. Four additional pinned source reads are cited above. Historical runs are limited to those recorded in the snapshot. No claim is made that every source, route or workflow was reviewed; no runtime checks were authorized.

See [REMEDIATION_PLAN.md](REMEDIATION_PLAN.md) for staged acceptance criteria.
