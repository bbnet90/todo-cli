import { readFileSync, writeFileSync } from "node:fs"

const filePath = new URL("../data/tasks.json", import.meta.url)

export function readTasks() {
    const data = readFileSync(filePath, "utf-8")
    return JSON.parse(data)
}

export function writeTasks(tasks: unknown) {
    const data = JSON.stringify(tasks, null, 2)
    writeFileSync(filePath, data)
}
