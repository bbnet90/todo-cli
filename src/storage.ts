import { readFileSync, writeFileSync } from "node:fs"
import { reindexTasks } from "./task.js"

const filePath = new URL("../data/tasks.json", import.meta.url)

export function readTasks() {
    const data = readFileSync(filePath, "utf-8")
    const tasks = JSON.parse(data)

    if (!Array.isArray(tasks)) {
        return []
    }

    return reindexTasks(tasks)
}

export function writeTasks(tasks: unknown) {
    const data = JSON.stringify(tasks, null, 2)
    writeFileSync(filePath, data)
}
