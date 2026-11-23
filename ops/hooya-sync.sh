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
if GIT_TERMINAL_PROMPT=0 timeout 20s git --git-dir="$repository" fetch --depth=1 origin main; then
    commit=$(git --git-dir="$repository" rev-parse FETCH_HEAD)
else
    # Product publication also works when the source host is temporarily offline.
    commit=$(git --git-dir="$repository" rev-parse refs/remotes/origin/main)
fi
catalog=/var/lib/hooya-catalog/catalog.json
catalog_hash=source
[[ ! -f $catalog ]] || catalog_hash=$(sha256sum "$catalog" | cut -d' ' -f1)
current=$(python3 -c 'import json; print(json.load(open("/var/www/hooyamode.ir/current/release.json"))["commit"])' 2>/dev/null || true)
current_catalog=$(python3 -c 'import json; print(json.load(open("/var/www/hooyamode.ir/current/release.json")).get("catalog_sha256","source"))' 2>/dev/null || true)
admin_key="$commit-$catalog_hash"
admin_current=$(basename "$(readlink -f "$state/admin-current" || true)")
backend_current=$(basename "$(readlink -f "$state/backend-current" || true)")
[[ $current != "$commit" || $current_catalog != "$catalog_hash" || $admin_current != "$admin_key" || $backend_current != "$commit" ]] || exit 0
work=$(mktemp -d "$state/build-XXXXXX")
trap 'rm -rf -- "$work"' EXIT
git --git-dir="$repository" archive "$commit" docs build-storefront.mjs server | tar -xf - -C "$work"
if [[ -f $catalog ]]; then
    cp "$catalog" "$work/docs/products.json"
    catalog_hash=$(sha256sum "$work/docs/products.json" | cut -d' ' -f1)
fi
admin_key="$commit-$catalog_hash"
node "$work/build-storefront.mjs"
# The authenticated panel keeps drafts; the public catalog contains storefront products only.
python3 - "$work/docs/products.json" <<'PY'
import json,sys
from pathlib import Path
file=Path(sys.argv[1])
catalog=json.loads(file.read_text())
catalog['products']=[product for product in catalog['products'] if product['status']=='published']
file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n')
PY
mkdir -p "$state/admin-releases"
if [[ ! -d $state/admin-releases/$admin_key ]]; then
    cp -a "$work/server/admin-ui" "$state/admin-releases/$admin_key"
    find "$state/admin-releases/$admin_key" -type d -exec chmod 0755 {} +
    find "$state/admin-releases/$admin_key" -type f -exec chmod 0644 {} +
fi
ln -s "$state/admin-releases/$admin_key" "$state/.admin-next-$$"
mv -Tf "$state/.admin-next-$$" "$state/admin-current"
mkdir -p "$state/backend-releases"
if [[ ! -d $state/backend-releases/$commit ]]; then
    mkdir -p "$state/backend-releases/$commit/docs"
    cp -a "$work/server" "$state/backend-releases/$commit/server"
    cp "$work/docs/customer-data.js" "$work/docs/catalog.js" "$state/backend-releases/$commit/docs/"
    node --check "$state/backend-releases/$commit/server/admin-server.mjs"
    node --check "$state/backend-releases/$commit/server/orders.mjs"
    find "$state/backend-releases/$commit" -type d -exec chmod 0755 {} +
    find "$state/backend-releases/$commit" -type f -exec chmod 0644 {} +
fi
# A release may already have been prepared by an older installed sync helper.
cp "$work/docs/catalog.js" "$state/backend-releases/$commit/docs/catalog.js"
chmod 0644 "$state/backend-releases/$commit/docs/catalog.js"
node --input-type=module -e 'const target=process.argv.pop(); await import(target)' "$state/backend-releases/$commit/server/admin-server.mjs"
ln -s "$state/backend-releases/$commit" "$state/.backend-next-$$"
mv -Tf "$state/.backend-next-$$" "$state/backend-current"
python3 - "$work/docs/release.json" "$commit" "$catalog_hash" <<'PY'
import json,sys,datetime
with open(sys.argv[1],'w') as file:
    json.dump({'commit':sys.argv[2],'catalog_sha256':sys.argv[3],'builtAt':datetime.datetime.now(datetime.timezone.utc).isoformat(),'environment':'development'},file)
PY
tar -czf "$work/release.tar.gz" -C "$work/docs" .
checksum=$(sha256sum "$work/release.tar.gz" | cut -d' ' -f1)
archive="/home/atie/hooya-releases/upload-$checksum.tar.gz"
mv "$work/release.tar.gz" "$archive"
bash /usr/local/lib/hooya/deploy-release.sh "$archive" "$checksum"
