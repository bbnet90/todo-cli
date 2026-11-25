import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import type { Task } from "./task.js"
import { reindexTasks } from "./task.js"

function dataFile() {
    const override = process.env.TODO_CLI_DATA_FILE
    return override ? resolve(override) : fileURLToPath(new URL("../data/tasks.json", import.meta.url))
}

export function readTasks() {
    const filePath = dataFile()
    if (!existsSync(filePath)) {
        return []
    }

    const data = readFileSync(filePath, "utf-8")
    const tasks = JSON.parse(data)

    if (!Array.isArray(tasks)) {
        return []
    }

    return reindexTasks(tasks)
}

export function writeTasks(tasks: unknown) {
    const filePath = dataFile()
    mkdirSync(dirname(filePath), { recursive: true })

    const data = JSON.stringify(tasks, null, 2)
    writeFileSync(filePath, data)
}

type PanelRead = { ok: true; tasks: Task[] } | { ok: false; error: string }

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
                id: Number.isSafeInteger(row.id) ? row.id : tasks.length + 1,
                title: typeof row.title === "string" ? row.title : "",
                completed: row.completed === true,
                priority: row.priority === "high" || row.priority === "low" ? row.priority : "medium",
                dueDate: Number.isFinite(row.dueDate) ? row.dueDate : null,
                tags: Array.isArray(row.tags) ? row.tags.filter((tag: unknown) => typeof tag === "string") : [],
                createdAt: typeof row.createdAt === "string" ? row.createdAt : ""
            })
        }
        return { ok: true, tasks }
    } catch (error) {
        if ((error as NodeJS.ErrnoException).code === "ENOENT") return { ok: true, tasks: [] }
        return { ok: false, error: "Görev dosyası okunamadı." }
    }
}
