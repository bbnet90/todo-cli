import assert from "node:assert/strict"
import { spawnSync } from "node:child_process"
import { mkdtempSync, readdirSync, readFileSync, rmSync, utimesSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test, { type TestContext } from "node:test"
import { TaskRemoved, updateByUid, type StoredTask } from "./storage.js"

function fixture(t: TestContext) {
    const dir = mkdtempSync(join(tmpdir(), "todo-safety-"))
    t.after(() => rmSync(dir, { recursive: true, force: true }))
    const file = join(dir, "tasks.json")
    const env = { ...process.env, TODO_CLI_DATA_FILE: file }
    const run = (...args: string[]) => spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args],
        { env, encoding: "utf8", timeout: 20000 })
    const read = (): StoredTask[] => JSON.parse(readFileSync(file, "utf8"))
    return { dir, file, run, read }
}

const legacy = { id: 1, title: "First", priority: "medium", completed: false, dueDate: null, tags: [], createdAt: "" }

test("help and unknown options leave even legacy data byte-for-byte intact", t => {
    const { file, dir, run } = fixture(t)
    const raw = JSON.stringify([legacy])
    writeFileSync(file, raw)
    for (const command of ["add", "list", "done", "edit", "delete", "clear"]) {
        for (const flag of ["--help", "-h", "--typo", "-Z"]) {
            const result = run(command, flag)
            const help = flag === "--help" || flag === "-h"
            assert.equal(result.status, help ? 0 : 1, result.stderr)
            if (help) {
                assert.match(result.stdout, new RegExp("Usage: todo " + command))
                assert.equal(result.stderr, "")
            } else {
                assert.equal(result.stdout, "")
                assert.match(result.stderr, /unknown option/i)
            }
            assert.equal(readFileSync(file, "utf8"), raw)
        }
    }
    assert.deepEqual(readdirSync(dir), ["tasks.json"])
})

test("migration reads under lock; panels stay read-only and byte compatible", t => {
    const { file, run, read } = fixture(t)
    const raw = JSON.stringify([{ ...legacy, extra: "keep" }, { ...legacy, id: 2, title: "Second" }])
    writeFileSync(file, raw)
    const modes = [[], ["--json"], ["--describe"]]
    const outputs = modes.map(args => {
        const result = run("panel", ...args)
        assert.equal(result.status, 0)
        assert.equal(result.stderr, "")
        assert.equal(readFileSync(file, "utf8"), raw)
        return result.stdout
    })
    assert.equal(run("list").status, 0)
    const stored = read()
    for (const [i, task] of stored.entries()) {
        const { uid, ...rest } = task
        assert.ok(uid)
        assert.deepEqual(rest, JSON.parse(raw)[i])
    }
    assert.notEqual(stored[0]!.uid, stored[1]!.uid)
    for (const [i, args] of modes.entries()) assert.equal(run("panel", ...args).stdout, outputs[i])
    assert.equal(run("add", "Third").status, 0)
    assert.deepEqual(read().slice(0, 2), stored)
    assert.equal(run("delete", "1").status, 0)
    assert.equal(read()[0]!.id, 1)
    assert.equal(read()[0]!.uid, stored[1]!.uid)
    const before = readFileSync(file, "utf8")
    const old = process.env.TODO_CLI_DATA_FILE
    process.env.TODO_CLI_DATA_FILE = file
    try {
        assert.throws(() => updateByUid(stored[0]!.uid, task => { task.title = "Stale" }), TaskRemoved)
        assert.equal(readFileSync(file, "utf8"), before)
    } finally {
        if (old === undefined) delete process.env.TODO_CLI_DATA_FILE
        else process.env.TODO_CLI_DATA_FILE = old
    }
    writeFileSync(file, raw)
    assert.equal(run("add", "During migration").status, 0)
    assert.equal(new Set(read().map(task => task.uid)).size, 3)
})

test("recovers dead and aged incomplete locks, never steals a live owner's lock", t => {
    const { file, run, read } = fixture(t)
    writeFileSync(file, "[]")
    const lock = file + ".lock"
    const child = spawnSync(process.execPath, ["-e", ""])
    assert.equal(child.status, 0)
    writeFileSync(lock, JSON.stringify({ pid: child.pid }))
    assert.equal(run("add", "after crash").status, 0)
    writeFileSync(lock, "")
    utimesSync(lock, new Date(0), new Date(0))
    assert.equal(run("add", "after incomplete lock").status, 0)
    const before = readFileSync(file, "utf8")
    writeFileSync(lock, JSON.stringify({ pid: process.pid }))
    utimesSync(lock, new Date(0), new Date(0))
    const result = run("add", "blocked")
    assert.equal(result.status, 1)
    assert.match(result.stderr, /timed out.*lock/i)
    assert.equal(result.stdout, "")
    assert.equal(readFileSync(file, "utf8"), before)
    assert.equal(JSON.parse(readFileSync(lock, "utf8")).pid, process.pid)
    assert.equal(read().length, 2)
})
