#!/usr/bin/env bash
set -euo pipefail
state=/var/lib/hooya-source
repository="$state/repository.git"
mkdir -p "$state"
exec 8>"$state/.sync.lock"
flock -n 8 || exit 0
if [[ ! -d $repository ]]; then
  git init --bare "$repository"
  git --git-dir="$repository" remote add origin https://github.com/atikia92-afk/hooya-mode.git
fi
git --git-dir="$repository" fetch --depth=1 origin main
commit=$(git --git-dir="$repository" rev-parse FETCH_HEAD)
current=$(python3 -c 'import json; print(json.load(open("/var/www/hooyamode.ir/current/release.json"))["commit"])' 2>/dev/null || true)
admin_current=$(basename "$(readlink -f "$state/admin-current" || true)")
[[ $current != "$commit" || $admin_current != "$commit" ]] || exit 0
work=$(mktemp -d "$state/build-XXXXXX")
trap 'rm -rf -- "$work"' EXIT
git --git-dir="$repository" archive "$commit" docs build-storefront.mjs server/admin-ui | tar -xf - -C "$work"
node "$work/build-storefront.mjs"
mkdir -p "$state/admin-releases"
if [[ ! -d $state/admin-releases/$commit ]]; then
    cp -a "$work/server/admin-ui" "$state/admin-releases/$commit"
    find "$state/admin-releases/$commit" -type d -exec chmod 0755 {} +
    find "$state/admin-releases/$commit" -type f -exec chmod 0644 {} +
fi
ln -s "$state/admin-releases/$commit" "$state/.admin-next-$$"
mv -Tf "$state/.admin-next-$$" "$state/admin-current"
python3 - "$work/docs/release.json" "$commit" <<'PY'
import json,sys,datetime
with open(sys.argv[1],'w') as file:
    json.dump({'commit':sys.argv[2],'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'development'},file)
PY
tar -czf "$work/release.tar.gz" -C "$work/docs" .
checksum=$(sha256sum "$work/release.tar.gz" | cut -d' ' -f1)
archive="/home/atie/hooya-releases/upload-$checksum.tar.gz"
mv "$work/release.tar.gz" "$archive"
bash /usr/local/lib/hooya/deploy-release.sh "$archive" "$checksum"
