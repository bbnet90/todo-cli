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

test("help lists panel and unknown commands fail on stderr", () => {
    const invoke = (arg: string) => spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", arg], { encoding: "utf8" })
    const help = invoke("help")
    assert.equal(help.status, 0)
    assert.match(help.stdout, /panel \[--json\]/)
    const error = invoke("not-a-command")
    assert.equal(error.status, 1)
    assert.equal(error.stdout, "")
    assert.equal(error.stderr, "Unknown command: not-a-command\n")
})

test("describe prints the format 1 contract independently of task storage", t => {
    const dir = mkdtempSync(join(tmpdir(), "panel-describe-"))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, "tasks.json")
    const run = (...args: string[]) => spawnSync(process.execPath,
        ["--import", "tsx", "src/cli.ts", "panel", ...args], {
            encoding: "utf8", timeout: 5000,
            env: { ...process.env, TODO_CLI_DATA_FILE: file }
        })
    const version = JSON.parse(readFileSync("package.json", "utf8")).version
    const expected = JSON.stringify({
        format: 1, id: "todo", title: "Yapılacaklar", kind: "command",
        panel: ["todo", "panel", "--json"], open: ["todo"], version
    }) + "\n"
    function describe() {
        const result = run("--describe")
        assert.equal(result.status, 0, result.stderr)
        assert.equal(result.stderr, "")
        assert.equal(result.stdout, expected)
        return JSON.parse(result.stdout)
    }
    const metadata = describe()
    assert.equal(existsSync(file), false)
    writeFileSync(file, "{")
    describe()
    assert.equal(readFileSync(file, "utf8"), "{")

    const readme = readFileSync("README.md", "utf8")
    const example = readme.match(/\[\[command_panel\]\]\n([\s\S]*?)\n```/)?.[1]
    assert.ok(example)
    for (const key of ["panel", "open"]) {
        const line = example.split("\n").find(line => line.startsWith(key + " = "))
        assert.ok(line, key)
        assert.deepEqual(metadata[key], JSON.parse(line.slice(line.indexOf("=") + 1)))
    }

    for (const options of [["--json"], ["--limit", "1"], ["--today", "20240229"]]) {
        for (const args of [["--describe", ...options], [...options, "--describe"]]) {
            const result = run(...args)
            assert.equal(result.status, 1)
            assert.equal(result.stdout, "")
            assert.match(result.stderr, /--describe/)
        }
    }
})
