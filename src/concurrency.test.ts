import assert from "node:assert/strict"
import { execFile, spawnSync } from "node:child_process"
import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { promisify } from "node:util"
import type { StoredTask } from "./storage.js"

const execute = promisify(execFile)
const sourceRun = import.meta.url.endsWith(".ts")
const cli = sourceRun ? ["--import", "tsx", "src/cli.ts"] : ["src/cli.js"]

test("concurrent CLI processes preserve every add and mixed update", async t => {
    const dir = mkdtempSync(join(tmpdir(), "todo-race-"))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, "tasks.json")
    const env = { ...process.env, TODO_CLI_DATA_FILE: file }
    const run = (...args: string[]) => execute(process.execPath, [...cli, ...args], { env, timeout: 30000 })
    const read = (): StoredTask[] => JSON.parse(readFileSync(file, "utf8"))
    const titles = Array.from({ length: 16 }, (_, i) => "task-" + i)

    // Make the first group race to recover the same crashed writer's lock.
    const previousOwner = spawnSync(process.execPath, ["-e", ""])
    assert.equal(previousOwner.status, 0)
    writeFileSync(file + ".lock", JSON.stringify({ pid: previousOwner.pid }))
    for (let round = 0; round < 3; round++) {
        writeFileSync(file, "[]")
        const results = await Promise.all(titles.map(title => run("add", title)))
        const rows = read()
        const ids = titles.map((_, i) => i + 1)
        assert.deepEqual(rows.map(t => t.id), ids)
        assert.deepEqual(rows.map(t => t.title).sort(), [...titles].sort())
        assert.equal(new Set(rows.map(t => t.uid)).size, 16)
        for (const [i, result] of results.entries()) {
            const task = rows.find(t => t.title === titles[i])!
            assert.equal(result.stdout, "Added task #" + task.id + "\n")
            assert.equal(result.stderr, "")
            assert.match(task.uid, /^[\da-f-]{36}$/)
        }
    }

    const before = read()
    let parseError: unknown
    let samples = 0
    const observer = setInterval(() => {
        try {
            assert.ok(Array.isArray(read()))
            samples++
        } catch (error) { parseError = error }
    }, 2)
    try {
        await Promise.all([run("done", "1"), run("delete", "2"),
            ...titles.map(title => run("add", "mixed-" + title))])
    } finally { clearInterval(observer) }
    assert.ok(samples > 0)
    assert.equal(parseError, undefined)
    const after = read()
    assert.equal(after.length, 31)
    assert.equal(after[0]?.uid, before[0]?.uid)
    assert.equal(after[0]?.completed, true)
    assert.deepEqual(after.slice(1, 15).map(t => t.uid), before.slice(2).map(t => t.uid))
    assert.deepEqual(after.slice(15).map(t => t.title).sort(), titles.map(x => "mixed-" + x).sort())
    assert.deepEqual(after.map(t => t.id), after.map((_, i) => i + 1))
    assert.equal(new Set(after.map(t => t.uid)).size, after.length)
    assert.deepEqual(readdirSync(dir), ["tasks.json"])
})
