#!/usr/bin/env bash

set -euo pipefail
umask 077

state="$HOME/.itroomschool-sync"
web_root="$HOME/www/itroomschool.ru"
source_url="https://github.com/dihaos/it_room.git"
source_ref="refs/heads/main"

expected_revision=
if (( $# )); then
    if [[ $# != 1 || $1 != --github || ! ${SSH_ORIGINAL_COMMAND:-} =~ ^deploy\ ([0-9a-f]{40})$ ]]; then
        printf 'Expected a GitHub deployment command.\n' >&2
        exit 1
    fi
    expected_revision=${BASH_REMATCH[1]}
fi

if [[ ! -f "$web_root/index.html" ]]; then
    printf 'Site index is missing from %s\n' "$web_root" >&2
    exit 1
fi

mkdir -p "$state"
exec 9>"$state/deploy.lock"
if [[ -n "$expected_revision" ]]; then
    flock -w 45 9
else
    flock -n 9 || exit 0
fi

repo="$state/source.git"
if [[ ! -f "$repo/HEAD" ]]; then
    git init --bare --quiet "$repo"
fi
git -C "$repo" fetch --quiet --depth=1 "$source_url" "$source_ref"
revision=$(git -C "$repo" rev-parse FETCH_HEAD)
if [[ -n "$expected_revision" && "$expected_revision" != "$revision" ]]; then
    printf 'Skipped %s because main now points to %s.\n' "$expected_revision" "$revision"
    exit 0
fi
if [[ -f "$state/revision" && $(<"$state/revision") == "$revision" ]]; then
    if [[ -n "$expected_revision" ]]; then
        printf 'Already published %s.\n' "$revision"
    fi
    exit 0
fi

stage=$(mktemp -d "$state/stage.XXXXXX")
next_index=
cleanup() {
    rm -rf -- "$stage"
    if [[ -n "$next_index" ]]; then
        rm -f -- "$next_index"
    fi
}
trap cleanup EXIT

git -C "$repo" archive "$revision" public deploy/regru/applications.php | tar -xf - -C "$stage"
mkdir -p "$stage/public/api"
install -m 644 "$stage/deploy/regru/applications.php" "$stage/public/api/applications.php"
php -l "$stage/public/api/applications.php" >/dev/null

next_index=$(mktemp "$web_root/.itroomschool-index.XXXXXX")
sed 's|action="./api/applications"|action="./api/applications.php"|' "$stage/public/index.html" > "$next_index"
grep -Fq 'action="./api/applications.php"' "$next_index"
chmod 644 "$next_index"

# Update assets and the handler before switching the page to the new version.
rsync -rpt --checksum --delay-updates --chmod=D755,F644 --exclude='/index.html' \
    "$stage/public/" "$web_root/"
mv -f -- "$next_index" "$web_root/index.html"
printf '%s\n' "$revision" > "$stage/revision"
mv -f -- "$stage/revision" "$state/revision"
printf '%s Published %s\n' "$(date -Iseconds)" "$revision"
