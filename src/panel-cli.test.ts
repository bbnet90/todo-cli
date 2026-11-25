import assert from "node:assert/strict"
import test from "node:test"
import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"

test("panel command is read-only, has exact JSON/plain output and separates errors", t => {
    const dir = mkdtempSync(join(tmpdir(), "panel-"))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, "tasks.json")
    const run = (...args: string[]) => spawnSync(process.execPath,
        ["--import", "tsx", "src/cli.ts", "panel", ...args], {
            encoding: "utf8", timeout: 5000, stdio: ["ignore", "pipe", "pipe"],
            env: { ...process.env, TODO_CLI_DATA_FILE: file }
        })
    const empty = run("--json")
    assert.equal(empty.status, 0)
    assert.equal(empty.stderr, "")
    assert.equal(empty.stdout.trimEnd().split("\n").length, 1)
    assert.deepEqual(JSON.parse(empty.stdout).open, ["todo"])
    assert.equal(existsSync(file), false)
    const raw = '[{"id":3,"title":"Ödev","dueDate":20240228}]'
    writeFileSync(file, raw)
    const before = statSync(file).mtimeMs
    const args = ["--today", "20240229", "--limit", "1"]
    const expected = ["1 açık · 0 tamamlandı", "Gecikmiş: 1", "• #3 Ödev · 28.02"]
    assert.deepEqual(JSON.parse(run("--json", ...args).stdout).lines, expected)
    assert.equal(run(...args).stdout, expected.join("\n") + "\n")
    assert.equal(readFileSync(file, "utf8"), raw)
    assert.equal(statSync(file).mtimeMs, before)
    for (const options of [["--other"], ["--limit"], ["--limit", "0"], ["--limit", "21"],
        ["--limit", "1.5"], ["--today", "20260229"], ["--today", "bad"]]) {
        const result = run("--json", ...options)
        assert.equal(result.status, 1)
        assert.equal(result.stdout, "")
        assert.ok(result.stderr.trim())
    }
    writeFileSync(file, "{")
    const bad = run("--json")
    assert.equal(bad.status, 1)
    assert.equal(bad.stdout, "")
    assert.ok(bad.stderr.trim())
})
