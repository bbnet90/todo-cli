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
trap 'rm -rf "$work"' EXIT
cd "$work"
npm install -g --prefix "$work/prefix" "$archive"
cmd="$work/prefix/bin/todo"
TODO_CLI_DATA_FILE="$work/absent/tasks.json"
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        cmd="$work/prefix/todo.cmd"
        TODO_CLI_DATA_FILE=$(cygpath -w "$TODO_CLI_DATA_FILE")
        ;;
esac
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
case "$(uname -s)" in
    MINGW*|MSYS*|CYGWIN*)
        USERPROFILE=$(cygpath -w "$HOME")
        APPDATA=$(cygpath -w "$APPDATA")
        XDG_DATA_HOME=$(cygpath -w "$XDG_DATA_HOME")
        expected="$work/roaming/todo-cli/tasks.json"
        ;;
esac
export HOME USERPROFILE APPDATA XDG_DATA_HOME
"$cmd" add "kalıcılık"
test -f "$expected"
npm install -g --prefix "$work/prefix" "$archive"
"$cmd" list > list.txt
grep -F "kalıcılık" list.txt
echo "Verified default data survives reinstall."
