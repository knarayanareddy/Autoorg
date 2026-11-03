# Autoorg remediation plan

This plan is proposed work, not execution. Findings and limits are in [REVIEW.md](REVIEW.md). Preserve the existing test and security thresholds; a green CI run alone is not a release decision.

## Dependency map and phase gates

| Phase | Tasks | Entry and exit |
|---|---|---|
| 0: baseline | AO-T1 | Pinned revision and isolated target identified; failures captured before changes. |
| 1: release correctness | AO-T2, AO-T3 | T1 complete; deployment identity and rollback observed on a disposable staging target. |
| 2: security and automation | AO-T4, AO-T5 | Target architecture chosen; hostile cases and dependency jobs produce attributable results. |
| 3: experience and independent acceptance | AO-T6, AO-T7 | Prior gates complete; independent operator observes the release and recovery. |

### AO-T1 — Establish a reproducible baseline (AO-05; prerequisite for all tasks)

**Paths:** observed `.github/workflows/ci.yml`, root `package.json`, `web/package.json`, root and web `bun.lock`. **Steps:** (1) Inspect both recorded failed dependency-update run logs and their exact SHA; classify setup, network, authorization and dependency failures without guessing. (2) In an owner-approved disposable checkout, select and record a supported Bun version, install both lockfiles without modifying them, then run the manifest's existing checks and record their actual output. (3) Capture target configuration and an inventory of existing CI artifacts without copying real secrets into the report. **Deliverable:** baseline with separate root/web outcomes and known environmental blockers. **Verification:** independently reproduce one representative failure or document why it cannot be reproduced.

- [ ] Each failed job has a linked log, cause or explicit unknown.
- [ ] No skipped check is counted as passed; toolchain and SHA are recorded.
- [ ] Both lockfile scopes are assessed independently.

### AO-T2 — Make deploy truthful and target-specific (AO-01, AO-03)

**Prerequisites:** T1 and owner approval for staging host, artifact location and credentials. **Paths:** observed `scripts/deploy/deploy-single-node.ts`, `.github/workflows/cd.yml`, `.github/actions/health-check/action.yml`; proposed release metadata on the target. **Steps:** (1) Fail immediately when host, key, expected artifact or trusted host key is absent; remove any success path for an unperformed deployment. (2) Build an immutable artifact for the workflow SHA, transfer it through a host-key-verified channel and deploy it atomically; avoid `StrictHostKeyChecking=no` and shell interpolation of arbitrary values. (3) Query the actual staging service for health and release identity, and fail if its reported SHA differs; do not substitute a runner-local server. **Deliverable:** auditable deployment contract and implementation. **Verification:** use a disposable target to observe the before/after version; deliberately break transfer, host key and SHA to prove each check fails.

- [ ] Missing credentials and wrong host key fail without success output.
- [ ] Target-side release identifier equals the requested artifact SHA.
- [ ] Failed deploy cannot pass by starting or probing a local substitute.
- [ ] Credentials and private key files are not exposed in retained logs or artifacts.

### AO-T3 — Restore a prior release, not the CI checkout (AO-02)

**Prerequisites:** T2's release identity and a documented migration compatibility decision. **Paths:** observed `scripts/ci/rollback.ts`, `.github/workflows/cd.yml`, `src/db/migrations/`; proposed target-side release pointer and backup runbook. **Steps:** (1) Define a versioned release pointer and record the previous known-good artifact and database state before changing either. (2) Implement target-side rollback that explicitly receives the host and desired release, fails for missing or unknown releases, and does not represent mock output as restoration. (3) In staging, inject a failed release, perform rollback and verify the running target version and representative data; separately restore a backup into isolation when a migration cannot safely roll back. **Deliverable:** observed rollback and data-recovery procedure. **Verification:** an independent operator checks the remote identity and data, not just the exit status.

- [ ] Wrong or unavailable prior artifact produces a failed, actionable result.
- [ ] Remote service reports the actual prior release after rollback.
- [ ] Database compatibility or restore outcome is recorded for each migration class.

### AO-T4 — Bound API and agent trust (AO-04; preventive security)

**Prerequisites:** T1 and owner-defined users, reverse proxy and data classification. **Paths:** observed `src/api/auth.ts`, `tests/api-websocket-auth.test.ts`, `src/tools/tool-runner.ts`, `src/runtime/transcript-privacy.ts`; proposed proxy configuration and integration tests. **Steps:** (1) Trace authentication and authorization from HTTP and WebSocket entry points through approval, tool and workspace handlers, including local-proxy assumptions. (2) Replace or constrain URL credentials with a short-lived scoped mechanism appropriate to browser WebSockets; redact query strings at every logging boundary and protect provider secrets and transcripts. (3) Add independent negative tests for missing, expired, wrong-origin and insufficiently authorized requests, plus malicious tool inputs and private-network fetches; verify no sensitive values reach logs. **Deliverable:** threat-boundary map, code and tests. **Verification:** exercise the real server through its intended proxy; mutate the authorization guard to show a test fails.

- [ ] Approval and tool mutations reject unauthorized callers at the real entry point.
- [ ] Proxy/application logs contain no test credential or private transcript canary.
- [ ] Threat scenarios are covered or explicitly risk-accepted by the owner.

### AO-T5 — Restore reliable dependency and gate automation (AO-05)

**Prerequisites:** T1; T2 for deploy checks. **Paths:** observed `.github/workflows/ci.yml`, `.github/dependabot.yml`, both package manifests and lockfiles. **Steps:** (1) Repair the specific causes identified in T1 independently for root and web. (2) Pin the chosen CI toolchain and review third-party action references and permissions; use the smallest compatible dependency change when an advisory is confirmed. (3) Add a deploy-negative test and run the existing checks in a clean environment without deleting failing assertions or lowering thresholds. **Deliverable:** reproducible workflows and dependency-update evidence. **Verification:** a deliberately invalid deployment and a deliberately failing test both make their intended jobs fail; a subsequent unchanged run uses the same toolchain.

- [ ] Root and web dependency updates are separately attributable and repeatable.
- [ ] CI fails on broken checks rather than reporting mock deployment success.
- [ ] No security or test gate was weakened to obtain green status.

### AO-T6 — Verify the approval experience and motion (AO-06)

**Prerequisites:** T1; T4 for authenticated approval flows. **Paths:** observed `docs/app.js`, `web/components/ApprovalCenter.tsx`, `web/app/`; proposed browser accessibility tests. **Steps:** (1) Inspect rendered docs CSS and dashboard approval flows with keyboard and screen reader, including failed and pending decisions. (2) Respect reduced-motion preferences without hiding content and provide visible focus, accessible status and unambiguous confirmation for consequential actions. (3) Add browser-level tests for a user-approved and rejected item, plus motion preference; verify the backend decision rather than only a changed label. **Deliverable:** documented usability fixes and meaningful automated coverage. **Verification:** independent reviewer operates the workflow with keyboard only and confirms an intentionally broken confirmation is caught.

- [ ] Reduced-motion content remains visible and usable.
- [ ] Approval/rejection UI communicates server-confirmed state and failures.
- [ ] Keyboard focus and accessible names are checked in the actual dashboard.

### AO-T7 — Independent release acceptance (preventive)

**Prerequisites:** T2–T6 complete or explicitly risk-accepted. **Paths:** observed `README.md`, `.github/workflows/cd.yml`; proposed release record and recovery evidence. **Steps:** (1) Have an operator who did not implement the changes follow the runbook on a fresh staging release. (2) Observe real deployment identity, rejection of unauthorized approval, controlled failure and target rollback, plus isolated backup restore. (3) Record evidence, unresolved risks, sign-off and release decision; correct claims in the README if any promised behavior is not established. **Deliverable:** independent acceptance record. **Verification:** repeat a negative control by intentionally breaking a gate; it must fail for the expected reason.

- [ ] Actual target, version, backup restoration and approval behavior are recorded.
- [ ] Unavailable checks are listed as unknown, not passed.
- [ ] Owner signs the remaining risks and the release decision.

## Approval, release and rollback policy

Owner approval is required for production credentials, network changes, host keys, real data, migrations, signing and deployment. Use a disposable staging environment first; never test rollback on production as an exploratory action. Promotion requires the acceptance evidence above and an immutable artifact. Roll back by target release identifier only after assessing schema compatibility; restore data from a verified backup where necessary. No future command in this plan has been executed, and none is implied to exist beyond the scripts cited from the manifests.
