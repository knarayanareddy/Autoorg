#!/usr/bin/env bash
# Reference single-node release application. Invoked on the staging host.
set -euo pipefail
umask 077
root="${AUTOORG_DEPLOY_ROOT:-/opt/autoorg}"
sha="${1:-}"
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full lowercase commit SHA.' >&2; exit 1; }
[[ "$root" = /* && "$root" != / && -d "$root/shared" && -d "$root/releases" && -d "$root/incoming" ]] || { echo 'Deployment directories are not provisioned.' >&2; exit 1; }
root="$(realpath -e -- "$root")"
envfile="$root/shared/autoorg.env"
[[ -f "$envfile" && ! -L "$envfile" ]] || { echo 'A regular shared environment file is required.' >&2; exit 1; }
mode="$(stat -c '%a' "$envfile")"
(( (8#$mode & 077) == 0 )) || { echo 'Shared environment file must be owner-only.' >&2; exit 1; }
exec 9>"$root/shared/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
archive="$root/incoming/$sha.tar"
release="$root/releases/$sha"
stage="$root/releases/.staging-$sha-$$"
[[ -f "$archive" && ! -L "$archive" && ! -e "$release" && ! -L "$release" ]] || { echo 'Archive missing or release already exists.' >&2; exit 1; }
mkdir -- "$stage"
quiesced=0
cleanup() {
  status=$?
  if [[ -n "${stage:-}" && -d "$stage" ]]; then rm -rf -- "$stage"; fi
  if (( status != 0 && quiesced )); then
    sudo -n systemctl stop autoorg-api.service autoorg-web.service || true
    echo 'Deployment failed; services were stopped where possible. Database state was not restored.' >&2
  fi
  exit "$status"
}
trap cleanup EXIT
mkdir -p -- "$root/shared/backups"
tar --no-same-owner --no-same-permissions -xf "$archive" -C "$stage"
(cd "$stage" && bun install --frozen-lockfile && cd web && bun install --frozen-lockfile && bun run build)
# Services remain stopped if a backup, migration or health check fails. Database
# state is never automatically restored: doing so can destroy newer writes.
quiesced=1
sudo -n systemctl stop autoorg-api.service autoorg-web.service
export AUTOORG_DB_PATH="$root/shared/autoorg.db"
if [[ -e "$AUTOORG_DB_PATH" || -L "$AUTOORG_DB_PATH" ]]; then
  [[ -f "$AUTOORG_DB_PATH" && ! -L "$AUTOORG_DB_PATH" ]] || { echo 'Database must be a regular file.' >&2; exit 1; }
  backup="$root/shared/backups/${sha}-$(date -u +%Y%m%dT%H%M%SZ)-$$.db"
  (cd "$stage" && bun run scripts/deploy/backup-database.ts "$AUTOORG_DB_PATH" "$backup")
  echo "Protected database backup: $backup"
fi
(cd "$stage" && bun --env-file="$envfile" run db:migrate) || { echo 'Migration failed; services remain stopped. Review the database and backup before recovery.' >&2; exit 1; }
mv -- "$stage" "$release"
stage=''
link="$root/.current-$$"
ln -s -- "$release" "$link"
mv -Tf -- "$link" "$root/current"
sudo -n systemctl restart autoorg-api.service autoorg-web.service
attempts="${AUTOORG_HEALTH_ATTEMPTS:-30}"
[[ "$attempts" =~ ^[1-9][0-9]?$ ]] || { echo 'Invalid health attempt count.' >&2; exit 1; }
for ((i=0; i<attempts; i++)); do
  if (cd "$release" && AUTOORG_API_URL=http://127.0.0.1:3001 bun --env-file="$envfile" run scripts/ci/health-check.ts >/dev/null 2>&1) && curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
    quiesced=0
    echo "Release $sha deployed and healthy."
    exit 0
  fi
  sleep 1
done
echo 'Release health check failed; services stopped. Inspect the database and perform a deliberate recovery.' >&2
exit 1
