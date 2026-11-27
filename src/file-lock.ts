import { randomUUID } from "node:crypto"
import { closeSync, openSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { basename, dirname, join } from "node:path"
import { performance } from "node:perf_hooks"

const timeoutMs = 5000
const incompleteLockAgeMs = 30000
const sleep = new Int32Array(new SharedArrayBuffer(4))

function sharingError(error: unknown) {
    const code = (error as NodeJS.ErrnoException).code
    return code === "EPERM" || code === "EACCES" || code === "EBUSY"
}

function removeStale(path: string) {
    try {
        rmSync(path, { force: true })
        return true
    } catch (error) {
        if (sharingError(error)) return false
        throw error
    }
}

function dead(pid: number) {
    try {
        process.kill(pid, 0)
        return false
    } catch (error) {
        return (error as NodeJS.ErrnoException).code === "ESRCH"
    }
}

function stale(path: string) {
    try {
        const raw = readFileSync(path, "utf8")
        let pid: unknown
        try { pid = JSON.parse(raw)?.pid } catch { /* interrupted lock initialization */ }
        if (typeof pid === "number" && Number.isSafeInteger(pid) && pid > 0 && pid <= 0x7fffffff) {
            return dead(pid)
        }
        return Date.now() - statSync(path).mtimeMs >= incompleteLockAgeMs
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT" || sharingError(error)) return false
        throw error
    }
}

// Serialize stale inspection/removal with lock creation. Without this step a
// delayed second reaper could unlink the next writer's healthy lock. Each
// contender publishes a unique claim before listing the others; only a sole
// live contender proceeds. A loser withdraws and retries after random jitter.
function tryAcquire(lock: string): boolean {
    const prefix = basename(lock) + ".claim-"
    const dir = dirname(lock)
    const own = prefix + process.pid + "-" + randomUUID()
    const claim = join(dir, own)
    closeSync(openSync(claim, "wx", 0o600))
    try {
        for (const name of readdirSync(dir)) {
            if (!name.startsWith(prefix) || name === own) continue
            const ticket = /^(\d+)-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/.exec(name.slice(prefix.length))
            if (!ticket) continue
            const pid = Number(ticket[1])
            if (!Number.isInteger(pid) || pid < 1 || pid > 0x7fffffff) continue
            if (!dead(pid)) return false
            if (!removeStale(join(dir, name))) return false
        }
        if (stale(lock) && !removeStale(lock)) return false
        let fd: number
        try {
            fd = openSync(lock, "wx", 0o600)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code === "EEXIST" || sharingError(error)) return false
            throw error
        }
        try {
            writeFileSync(fd, JSON.stringify({ pid: process.pid }))
        } catch (error) {
            closeSync(fd)
            rmSync(lock)
            throw error
        }
        closeSync(fd)
        return true
    } finally {
        rmSync(claim)
    }
}

export function withFileLock<T>(file: string, operation: () => T): T {
    const lock = file + ".lock"
    const deadline = performance.now() + timeoutMs
    while (!tryAcquire(lock)) {
        if (performance.now() >= deadline) throw new Error("Timed out waiting for task file lock: " + lock)
        Atomics.wait(sleep, 0, 0, 10 + Math.random() * 40)
    }
    try {
        return operation()
    } finally {
        rmSync(lock)
    }
}
