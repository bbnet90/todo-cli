#!/bin/sh
set -eu

root=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
work=$(mktemp -d)
trap 'rm -rf "$work"' EXIT
mkdir -p "$work/source/src"
cp "$root/package.json" "$root/package-lock.json" "$root/tsconfig.json" \
    "$root/LICENSE" "$root/README.md" "$work/source/"
# Start from sources only, even if the caller already built in place.
for file in "$root"/src/*.ts; do
    case "$file" in *.d.ts) continue ;; esac
    cp "$file" "$work/source/src/"
done
cd "$work/source"
npm ci --no-audit --no-fund
npm run build
npm pack --json > "$work/pack.json"
archive=$(node --input-type=module - "$work/pack.json" <<'JS'
import assert from "node:assert/strict"
import fs from "node:fs"
const [pack] = JSON.parse(fs.readFileSync(process.argv[2], "utf8"))
const files = pack.files.map(file => file.path)
for (const item of ["src/cli.js", "src/panel.js", "README.md", "LICENSE", "package.json"]) {
    assert.ok(files.includes(item), item)
}
assert.ok(files.every(path => ["README.md", "LICENSE", "package.json"].includes(path)
    || (/^src\/[^/]+\.js$/.test(path) && !path.endsWith(".test.js"))))
console.log(pack.filename)
JS
)
npm install --global --prefix "$work/prefix" --no-audit --no-fund "./$archive"
cd "$work"
export TODO_CLI_DATA_FILE="$work/absent/tasks.json"
cmd="$work/prefix/bin/todo"
test -x "$cmd"
"$cmd" panel --json > output.json
node --input-type=module <<'JS'
import assert from "node:assert/strict"
import fs from "node:fs"
const raw = fs.readFileSync("output.json", "utf8")
assert.deepEqual(JSON.parse(raw), {
    title: "Yapılacaklar", lines: ["Görev yok.", 'Eklemek için: todo add "Başlık"'], open: ["todo"]
})
assert.equal(raw.trimEnd().split("\n").length, 1)
JS
test ! -e "$work/absent"
printf '%s\n' 'Installed panel smoke passed.'
