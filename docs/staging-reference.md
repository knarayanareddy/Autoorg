# Reference staging VM: SSH and systemd

This reference targets one dedicated Linux VM running only the API and dashboard.
It has been exercised with isolated process and filesystem fixtures, **not on a
real VM**. Provision and validate it in a disposable environment before use.
It does not deploy the autonomous runner or make the host a sandbox for
untrusted commands. Do not attach another process to the SQLite database while
deploying or rolling back. A protected TLS reverse proxy or VPN is still needed;
both services listen only on loopback.

## Provision once on the host

1. Install Bun 1.4.4 or newer at `/usr/local/bin/bun`, plus `curl`, `flock`,
   `tar`, `sudo`, and systemd. Create an `autoorg` account with a restricted
   SSH key. Give its login shell a `PATH` containing `/usr/local/bin`.
2. Create `/opt/autoorg/{incoming,releases,shared,shared/backups}` owned by
   `autoorg`, with mode 0700. Protect the host and SSH account: this reference
   uses the same account for deployments and service processes and is **not a
   privilege separation boundary** between the application and its releases.
3. Create `/opt/autoorg/shared/autoorg.env`, owned by `autoorg`, mode 0600.
   Supply a long random `AUTOORG_API_KEY` and any required provider, signing,
   and provider-encryption keys through your secret-management process. Never
   commit or print the file. The API service forces the database path to
   `/opt/autoorg/shared/autoorg.db` and binds to loopback.
4. Review and install `scripts/deploy/systemd/*.service` into
   `/etc/systemd/system/` as root-owned files. Review and install
   `scripts/deploy/apply-release.sh` and `rollback-release.sh` as root-owned,
   executable files under `/usr/local/libexec/autoorg/`. These host scripts are
   not replaced automatically by deployment; review and update them separately.
   Run `systemctl daemon-reload` and enable both services; do not start them
   until an initial release exists.
5. Arrange narrowly scoped noninteractive sudo for `autoorg` to run **only**
   these exact commands, with root-owned unit files:

   ```sudoers
   autoorg ALL=(root) NOPASSWD: /usr/bin/systemctl stop autoorg-api.service autoorg-web.service
   autoorg ALL=(root) NOPASSWD: /usr/bin/systemctl restart autoorg-api.service autoorg-web.service
   ```

   Validate the sudoers file with `visudo` and adjust the systemctl path to the
   actual host. These permissions allow deployment to interrupt the services.
6. Configure a trusted reverse proxy for HTTPS and WSS, with access controls,
   forwarding `/api` and `/ws` to port 3001 and the dashboard to port 3000.
   Redact query strings from logs because browser WebSocket tokens use the URL.
   Restrict SSH and the proxy at the network layer.

## Configure and deploy

Supply `SSH_HOST`, `SSH_USER`, `SSH_PORT` (optional, default 22), `SSH_KEY`,
`SSH_KNOWN_HOSTS`, and `DEPLOY_SHA` to the deploy command using a protected
secret store. `SSH_KNOWN_HOSTS` must contain the **independently verified** host
key in OpenSSH known-hosts format, including `[host]:port` for non-default
ports. Never automatically trust an unverified `ssh-keyscan` result.

The command requires `DEPLOY_SHA` to match the checked-out full commit SHA,
archives only tracked application source and configuration (not `memory/` or
mission data), verifies SSH host keys strictly, and removes temporary identity
files. It uploads to the pre-provisioned incoming directory. The host installs
frozen dependencies, builds, stops both services, takes a protected SQLite
snapshot if the database exists, applies migrations, switches the release
symlink, restarts services, and checks authenticated API and dashboard health.
Failures after the stop leave services stopped where possible; they never
silently restore data. SSH/network interruption, SIGKILL, host failure, or a
failed sudo can prevent cleanup, so inspect host state after any failure.

For GitHub Actions, configure repository variables `STAGING_HOST`,
`STAGING_USER`, and optionally `STAGING_SSH_PORT`; configure the staging
**environment secrets** `STAGING_SSH_KEY` and `STAGING_SSH_KNOWN_HOSTS`.
Set the repository variable `AUTOORG_ENABLE_STAGING_DEPLOY=true` only after
host provisioning, reviewing the scripts, and configuring environment approval.
A push to main will then deploy after local verification. Without that opt-in,
no staging deployment occurs. No real host has been configured by this change.

## Rollback and data recovery

Releases remain in `/opt/autoorg/releases/<full-commit-sha>`. Before a code
rollback, verify the old release is compatible with the **current** database
schema and data, ideally against a separate copy. The health check does not prove
full schema or application compatibility. With the same SSH configuration,
explicitly acknowledge the code-only operation:

```bash
AUTOORG_ACK_CODE_ONLY_ROLLBACK=1 bun run scripts/deploy/deploy-single-node.ts --rollback <full-commit-sha>
```

Rollback switches code and restarts/checks services; **it never reverts the
SQLite database**. Automatic rollback after migration is intentionally disabled.
Snapshots in `shared/backups` contain sensitive data and need access controls,
retention, and tested off-host backup. Restoring a snapshot is a separate,
operator-controlled offline operation: stop all writers, preserve the current
database and WAL, and account for data written since the snapshot. It can lose
newer data. Do not replace a live database or assume that code rollback reverses
migrations.
