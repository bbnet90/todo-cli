#!/bin/sh
set -eu

if [ "$#" -ne 2 ]; then
    echo "Usage: $0 <tarball> <expected-sha256>" >&2
    exit 2
fi
archive=$(cd "$(dirname "$1")" && pwd)/$(basename "$1")
if command -v sha256sum >/dev/null 2>&1; then
    digest=$(sha256sum < "$archive")
else
    digest=$(shasum -a 256 < "$archive")
fi
if [ "${digest%% *}" != "$2" ]; then
    echo "SHA-256 mismatch: $(basename "$archive")" >&2
    exit 1
fi

cd "$(dirname "$0")/.."
version=$(node -p 'require("./package.json").version')
work=$(mktemp -d)
start=$(pwd)
trap 'cd "$start" && rm -rf "$work"' EXIT
cd "$work"
npm install -g --prefix "$work/prefix" "$archive"
# Node receives native paths from Git Bash and from native Windows shells.
native_path() {
    node -p 'require("node:path").resolve(process.argv[1])' "$1"
}
cmd="$work/prefix/bin/todo"
TODO_CLI_DATA_FILE="$work/absent/tasks.json"
if [ "$(node -p process.platform)" = win32 ]; then
    cmd="$work/prefix/todo.cmd"
    TODO_CLI_DATA_FILE=$(native_path "$TODO_CLI_DATA_FILE")
fi
export TODO_CLI_DATA_FILE
"$cmd" panel --json > panel.json
test ! -e "$work/absent"
"$cmd" panel --describe > describe.json
test ! -e "$work/absent"
node --input-type=module - "$version" <<'JS'
import assert from "node:assert/strict"
import { readFileSync } from "node:fs"

const panel = JSON.parse(readFileSync("panel.json", "utf8"))
assert.deepEqual(panel.lines, ["Görev yok.", 'Eklemek için: todo add "Başlık"'])
const description = JSON.parse(readFileSync("describe.json", "utf8"))
assert.equal(description.format, 1)
assert.equal(description.id, "todo")
assert.equal(description.version, process.argv[2])
console.log(`Verified todo ${description.version}: empty panel, descriptor, no data file.`)
JS

unset TODO_CLI_DATA_FILE
mkdir -p "$work/home" "$work/roaming" "$work/xdg"
HOME="$work/home"
USERPROFILE="$HOME"
APPDATA="$work/roaming"
XDG_DATA_HOME="$work/xdg"
expected="$work/xdg/todo-cli/tasks.json"
if [ "$(node -p process.platform)" = win32 ]; then
    USERPROFILE=$(native_path "$HOME")
    APPDATA=$(native_path "$APPDATA")
    XDG_DATA_HOME=$(native_path "$XDG_DATA_HOME")
    expected="$work/roaming/todo-cli/tasks.json"
fi
export HOME USERPROFILE APPDATA XDG_DATA_HOME
"$cmd" add "kalıcılık"
test -f "$expected"
npm install -g --prefix "$work/prefix" "$archive"
"$cmd" list > list.txt
grep -F "kalıcılık" list.txt
echo "Verified default data survives reinstall."
