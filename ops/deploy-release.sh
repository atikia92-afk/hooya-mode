#!/usr/bin/env bash
set -euo pipefail
archive=${1:?archive required}
checksum=${2:?SHA-256 required}
[[ $checksum =~ ^[0-9a-f]{64}$ ]]
[[ $archive == /home/atie/hooya-releases/upload-"$checksum".tar.gz ]]
printf '%s  %s\n' "$checksum" "$archive" | sha256sum --check
site=/var/www/hooyamode.ir
mkdir -p "$site/releases"
exec 9>"$site/.deploy.lock"
flock 9
previous=$(readlink -f "$site/current" || true)
expected_base=${3:-}
[[ -z $expected_base || $previous == "$site/releases/$expected_base" ]]
release="$site/releases/$checksum"
if [[ ! -d $release ]]; then
  mkdir "$release"
  [[ -z $expected_base ]] || cp -a "$previous/." "$release/"
  tar -xzf "$archive" -C "$release" --unlink-first --no-same-owner --no-same-permissions
  if [[ -n $expected_base ]]; then
    python3 - "$release" <<'PY'
import json,sys
from pathlib import Path
root=Path(sys.argv[1]).resolve()
assert str(root).startswith('/var/www/hooyamode.ir/releases/')
keep=set(json.loads((root/'release.json').read_text())['files'])|{'release.json'}
for file in root.rglob('*'):
    if file.is_file() and str(file.relative_to(root)) not in keep:
        file.unlink()
PY
  fi
  find "$release" -type d -exec chmod 0755 {} +
  find "$release" -type f -exec chmod 0644 {} +
fi
for file in index.html products.html cart.html checkout.html products.json release.json; do test -s "$release/$file"; done
activate() { ln -s "$1" "$site/.next-$$"; mv -Tf "$site/.next-$$" "$site/current"; }
activate "$release"
for route in / /products.html /cart.html /checkout.html /products.json /release.json; do
  file="$route"; [[ $route != / ]] || file=/index.html
  if ! curl --max-time 10 -fsS "http://127.0.0.1:18480$route" | cmp -s - "$release$file"; then
    [[ ! -d $previous ]] || activate "$previous"
    printf 'Verification failed: %s\n' "$route" >&2
    exit 1
  fi
done
printf 'Hooya release active: %s\n' "$checksum"
