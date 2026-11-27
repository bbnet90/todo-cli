import { createHash, randomUUID } from "node:crypto"
import { withFileLock } from "./file-lock.js"
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, posix, win32, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Task } from "./task.js"
import { reindexTasks } from "./task.js"

const oldFile = fileURLToPath(new URL("../data/tasks.json", import.meta.url))

export function dataFile(platform = process.platform, env = process.env, home = homedir()) {
    if (env.TODO_CLI_DATA_FILE) return resolve(env.TODO_CLI_DATA_FILE)
    if (platform === "win32") {
        const roaming = env.APPDATA || win32.join(home, "AppData", "Roaming")
        return win32.join(roaming, "todo-cli", "tasks.json")
    }
    const base = env.XDG_DATA_HOME && posix.isAbsolute(env.XDG_DATA_HOME)
        ? env.XDG_DATA_HOME : posix.join(home, ".local", "share")
    return posix.join(base, "todo-cli", "tasks.json")
}

// Only a missing default selects the package-local snapshot.
function snapshot(file: string) {
    try {
        return { raw: readFileSync(file, "utf8"), legacy: false }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT" || process.env.TODO_CLI_DATA_FILE) throw error
        return { raw: readFileSync(oldFile, "utf8"), legacy: true }
    }
}

export type StoredTask = Task & { uid: string }

function readRows(file: string): Task[] {
    let source
    try {
        source = snapshot(file)
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
        throw error
    }
    const rows: unknown = JSON.parse(source.raw)
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error("Invalid task file: expected an array of task objects.")
    }
    return source.legacy ? assignUids(rows, true) : rows
}

function identified(tasks: Task[]): tasks is StoredTask[] {
    const seen = new Set<string>()
    return tasks.every(task => {
        if (!("uid" in task) || typeof task.uid !== "string" || !task.uid || seen.has(task.uid)) return false
        seen.add(task.uid)
        return true
    })
}

// UUIDv5 keeps an unchanged legacy row identifiable between a read-only
// editor session and the first writer (even if it is a different process).
function legacyUid(row: Task, index: number) {
    const hash = createHash("sha1")
        .update(Buffer.from("fcd0cb117c404e7b82cdea5bbed76d61", "hex"))
        .update(JSON.stringify([index, row])).digest()
    hash[6] = (hash[6]! & 15) | 80
    hash[8] = (hash[8]! & 63) | 128
    const hex = hash.subarray(0, 16).toString("hex")
    return [hex.slice(0, 8), hex.slice(8, 12), hex.slice(12, 16), hex.slice(16, 20), hex.slice(20)].join("-")
}

function assignUids(rows: Task[], legacy = false): StoredTask[] {
    const seen = new Set<string>()
    return rows.map((row, index) => {
        const uid = "uid" in row && typeof row.uid === "string" && row.uid && !seen.has(row.uid)
            ? row.uid : legacy ? legacyUid(row, index) : randomUUID()
        seen.add(uid)
        return { ...row, uid }
    })
}

function atomicWrite(file: string, rows: StoredTask[]) {
    const temp = file + "." + randomUUID() + ".tmp"
    const mode = statSync(file, { throwIfNoEntry: false })?.mode ?? 0o600
    const fd = openSync(temp, "wx", mode)
    try {
        try {
            writeFileSync(fd, JSON.stringify(rows, null, 2))
            fsyncSync(fd)
        } finally {
            closeSync(fd)
        }
        renameSync(temp, file)
    } finally {
        rmSync(temp, { force: true })
    }
}

// Migration re-reads under the same lock as mutations; an unlocked snapshot
// is never written back. Migration alone preserves the original visible IDs.
function transaction(file: string, change?: (rows: StoredTask[]) => void): StoredTask[] {
    mkdirSync(dirname(file), { recursive: true, mode: process.env.TODO_CLI_DATA_FILE ? 0o777 : 0o700 })
    return withFileLock(file, () => {
        const raw = readRows(file)
        const needsMigration = !identified(raw)
        const rows = needsMigration ? assignUids(raw) : raw as StoredTask[]
        const tasks = reindexTasks(rows)
        if (change) {
            change(tasks)
            tasks.forEach((task, index) => { task.id = index + 1 })
            atomicWrite(file, tasks)
        } else if (needsMigration) {
            atomicWrite(file, rows)
        }
        return tasks
    })
}

// rename() replaces a final symlink. Follow the configured link even when its
// destination has not yet been created, so every writer locks the same target.
function writeTarget(): string {
    let file = dataFile()
    while (true) {
        try {
            return realpathSync(file)
        } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
        }
        let target: string
        try {
            target = readlinkSync(file)
        } catch (error) {
            const code = (error as NodeJS.ErrnoException).code
            if (code === "ENOENT" || code === "EINVAL") return file
            throw error
        }
        file = resolve(dirname(file), target)
    }
}

export function readTasks(): StoredTask[] {
    const file = writeTarget()
    const rows = readRows(file)
    return identified(rows) ? reindexTasks(rows) : transaction(file)
}

export function updateTasks(change: (tasks: StoredTask[]) => void) {
    transaction(writeTarget(), change)
}

export class TaskRemoved extends Error {
    constructor() { super("This task was removed in another session.") }
}

export function updateByUid(uid: string, change: (task: StoredTask, tasks: StoredTask[]) => void) {
    updateTasks(tasks => {
        const task = tasks.find(row => row.uid === uid)
        if (!task) throw new TaskRemoved()
        change(task, tasks)
    })
}

type PanelRead = { ok: true; tasks: StoredTask[] } | { ok: false; error: string }

export function readPanelTasks(): PanelRead {
    try {
        const rows: unknown = JSON.parse(snapshot(dataFile()).raw)
        if (!Array.isArray(rows)) {
            return { ok: false, error: "Görev dosyası liste içermeli." }
        }
        const tasks: Task[] = []
        for (const row of rows) {
            if (!row || typeof row !== "object" || Array.isArray(row)) continue
            tasks.push({
                ...("uid" in row ? { uid: row.uid } : {}),
                id: Number.isSafeInteger(row.id) ? row.id : tasks.length + 1,
                title: typeof row.title === "string" ? row.title : "",
                completed: row.completed === true,
                priority: row.priority === "high" || row.priority === "low" ? row.priority : "medium",
                dueDate: Number.isFinite(row.dueDate) ? row.dueDate : null,
                tags: Array.isArray(row.tags) ? row.tags.filter((tag: unknown) => typeof tag === "string") : [],
                createdAt: typeof row.createdAt === "string" ? row.createdAt : ""
            })
        }
        return { ok: true, tasks: assignUids(tasks) }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, tasks: [] }
        return { ok: false, error: "Görev dosyası okunamadı." }
    }
}
