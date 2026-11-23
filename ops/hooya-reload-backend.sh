#!/usr/bin/env bash
set -euo pipefail
state=/var/lib/hooya-source
target=$(readlink -f "$state/backend-current")
[[ $target == "$state/backend-releases/"* && -f $target/server/admin-server.mjs ]] || exit 1
# Frontend-only commits must not log every customer and administrator out.
fingerprint=$({ find "$target/server" -maxdepth 1 -type f -print0 | sort -z | xargs -0 sha256sum; sha256sum "$target/docs/catalog.js"; } | sed "s|$target/||" | sha256sum | cut -d' ' -f1)
previous=$(cat "$state/.backend-loaded" 2>/dev/null || true)
[[ $fingerprint != "$previous" ]] || exit 0
node --check "$target/server/admin-server.mjs"
node --check "$target/server/orders.mjs"
systemctl restart hooya-admin.service
for attempt in 1 2 3 4 5; do
 if curl --fail --silent --max-time 5 http://127.0.0.1:18481/api/customer/health >/dev/null; then
  printf '%s\n' "$fingerprint" > "$state/.backend-loaded"
  exit 0
 fi
 sleep 1
done
exit 1
