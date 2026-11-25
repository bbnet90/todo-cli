import test from "node:test"
import assert from "node:assert/strict"
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { readTasks, readPanelTasks, updateTasks } from "./storage.js"

test("both readers resolve the override on each call; only writing creates parents", t => {
    const dir = mkdtempSync(join(tmpdir(), "tasks-"))
    const original = process.env.TODO_CLI_DATA_FILE
    t.after(() => {
        if (original === undefined) delete process.env.TODO_CLI_DATA_FILE
        else process.env.TODO_CLI_DATA_FILE = original
        rmSync(dir, { recursive: true, force: true })
    })
    process.env.TODO_CLI_DATA_FILE = join(dir, "missing", "tasks.json")
    assert.deepEqual(readPanelTasks(), { ok: true, tasks: [] })
    assert.deepEqual(readTasks(), [])
    assert.equal(existsSync(join(dir, "missing")), false)
    updateTasks(tasks => { tasks.length = 0 })
    assert.deepEqual(readPanelTasks(), { ok: true, tasks: [] })
    const other = join(dir, "other.json")
    process.env.TODO_CLI_DATA_FILE = other
    for (const raw of ["{", "{}", "null"]) {
        writeFileSync(other, raw)
        assert.equal(readPanelTasks().ok, false)
    }
    const valid = { id: 7, title: "First", completed: true, priority: "high", dueDate: 20260701, tags: ["a"], createdAt: "date" }
    writeFileSync(other, JSON.stringify([null, 1, [], valid, { title: 1, dueDate: "later" }]))
    const result = readPanelTasks()
    assert.ok(result.ok)
    assert.equal(new Set(result.tasks.map(task => task.uid)).size, 2)
    assert.deepEqual(result.tasks.map(({ uid, ...row }) => row), [
        valid, { id: 2, title: "", completed: false, priority: "medium", dueDate: null, tags: [], createdAt: "" }
    ])
})
