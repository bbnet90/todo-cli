import assert from "node:assert/strict"
import fs from "node:fs"
import { syncBuiltinESMExports } from "node:module"
import { tmpdir } from "node:os"
import { join } from "node:path"
import test from "node:test"
import { withFileLock } from "./file-lock.js"

for (const persistent of [false, true]) {
    test(persistent ? "persistent lock open denial times out" : "transient lock open errors are retried", t => {
        const dir = fs.mkdtempSync(join(tmpdir(), "todo-lock-"))
        const file = join(dir, "tasks.json")
        const codes = ["EPERM", "EACCES", "EBUSY"]
        const open = fs.openSync
        let attempts = 0
        t.mock.method(fs, "openSync", (...args: Parameters<typeof open>) => {
            if (args[0] === file + ".lock" && args[1] === "wx") {
                const code = codes[attempts++ % codes.length]
                if (persistent || attempts <= codes.length) throw Object.assign(new Error(code), { code })
            }
            return open(...args)
        })
        syncBuiltinESMExports()
        t.after(() => {
            t.mock.restoreAll()
            syncBuiltinESMExports()
            fs.rmSync(dir, { recursive: true, force: true })
        })
        if (persistent) {
            assert.throws(() => withFileLock(file, () => assert.fail("unexpected acquisition")),
                { message: "Timed out waiting for task file lock: " + file + ".lock" })
            assert.ok(attempts > 1)
        } else {
            assert.equal(withFileLock(file, () => "acquired"), "acquired")
            assert.equal(attempts, 4)
        }
        assert.deepEqual(fs.readdirSync(dir), [])
    })
}
