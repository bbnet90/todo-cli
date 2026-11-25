import { randomUUID } from "node:crypto"
import { withFileLock } from "./file-lock.js"
import { closeSync, fsyncSync, mkdirSync, openSync, readFileSync, readlinkSync, realpathSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Task } from "./task.js"
import { reindexTasks } from "./task.js"

function dataFile() {
    const override = process.env.TODO_CLI_DATA_FILE
    return override ? resolve(override) : fileURLToPath(new URL("../data/tasks.json", import.meta.url))
}

export type StoredTask = Task & { uid: string }

function readRows(file: string): Task[] {
    let raw: string
    try {
        raw = readFileSync(file, "utf8")
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return []
        throw error
    }
    const rows: unknown = JSON.parse(raw)
    if (!Array.isArray(rows) || rows.some(row => !row || typeof row !== "object" || Array.isArray(row))) {
        throw new Error("Invalid task file: expected an array of task objects.")
    }
    return rows
}

function identified(tasks: Task[]): tasks is StoredTask[] {
    const seen = new Set<string>()
    return tasks.every(task => {
        if (!("uid" in task) || typeof task.uid !== "string" || !task.uid || seen.has(task.uid)) return false
        seen.add(task.uid)
        return true
    })
}

function assignUids(rows: Task[]): StoredTask[] {
    const seen = new Set<string>()
    return rows.map(row => {
        const uid = "uid" in row && typeof row.uid === "string" && row.uid && !seen.has(row.uid)
            ? row.uid : randomUUID()
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
    mkdirSync(dirname(file), { recursive: true })
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
        const rows: unknown = JSON.parse(readFileSync(dataFile(), "utf8"))
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
