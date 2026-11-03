#!/usr/bin/env bash
# Code-only rollback. This never reverts or overwrites database data.
set -euo pipefail
umask 077
root="${AUTOORG_DEPLOY_ROOT:-/opt/autoorg}"
sha="${1:-}"
[[ "${AUTOORG_ACK_CODE_ONLY_ROLLBACK:-}" == 1 ]] || { echo 'Set AUTOORG_ACK_CODE_ONLY_ROLLBACK=1 after verifying schema compatibility.' >&2; exit 1; }
[[ "$sha" =~ ^[0-9a-f]{40}$ ]] || { echo 'Expected a full lowercase commit SHA.' >&2; exit 1; }
[[ "$root" = /* && "$root" != / && -d "$root/shared" && -d "$root/releases" ]] || { echo 'Deployment directories are not provisioned.' >&2; exit 1; }
root="$(realpath -e -- "$root")"
envfile="$root/shared/autoorg.env"
release="$root/releases/$sha"
[[ -d "$release" && ! -L "$release" && -f "$envfile" && ! -L "$envfile" ]] || { echo 'Release or shared environment missing.' >&2; exit 1; }
mode="$(stat -c '%a' "$envfile")"
(( (8#$mode & 077) == 0 )) || { echo 'Shared environment file must be owner-only.' >&2; exit 1; }
exec 9>"$root/shared/deploy.lock"
flock -n 9 || { echo 'Another deployment is running.' >&2; exit 1; }
quiesced=1
cleanup() {
  status=$?
  if (( status != 0 && quiesced )); then
    sudo -n systemctl stop autoorg-api.service autoorg-web.service || true
    echo 'Rollback failed; services were stopped where possible. Database was not changed.' >&2
  fi
  exit "$status"
}
trap cleanup EXIT
sudo -n systemctl stop autoorg-api.service autoorg-web.service
link="$root/.current-$$"
ln -s -- "$release" "$link"
mv -Tf -- "$link" "$root/current"
sudo -n systemctl restart autoorg-api.service autoorg-web.service
attempts="${AUTOORG_HEALTH_ATTEMPTS:-30}"
[[ "$attempts" =~ ^[1-9][0-9]?$ ]] || { echo 'Invalid health attempt count.' >&2; exit 1; }
for ((i=0; i<attempts; i++)); do
  if (cd "$release" && AUTOORG_API_URL=http://127.0.0.1:3001 bun --env-file="$envfile" run scripts/ci/health-check.ts >/dev/null 2>&1) && curl -fsS --max-time 5 http://127.0.0.1:3000/ >/dev/null; then
    quiesced=0
    echo "Code rolled back to $sha. Database was not changed."
    exit 0
  fi
  sleep 1
done
echo 'Rollback health check failed; services stopped. Database was not changed.' >&2
exit 1
