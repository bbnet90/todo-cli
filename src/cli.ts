#!/usr/bin/env node
import { randomUUID } from "node:crypto"
import type { Task } from "./task.js"
import { panelCommand } from "./panel-command.js"
import {
    getNextTaskId,
    sortTasksForDisplay
} from "./task.js"
import { readTasks, updateByUid, updateTasks, TaskRemoved, type StoredTask } from "./storage.js"
import { stdin, stdout } from "node:process"

const command = process.argv[2]

const lightBlue = "\x1b[94m"
const selectedBlue = "\x1b[36m"
const orange = "\x1b[38;5;208m"
const resetColor = "\x1b[0m"
const red = "\x1b[31m"
const yellow = "\x1b[33m"
const green = "\x1b[32m"

function getPriorityColor(priority: Task["priority"]) {
    switch (priority) {
        case "high":
            return red
        case "medium":
            return yellow
        case "low":
            return green
        default:
            return green
    }
}

function formatDueDate(dueDate: number | null) {
    if (dueDate === null) {
        return ""
    }

    const date = String(dueDate)

    return `${date.slice(0, 4)}-${date.slice(4, 6)}-${date.slice(6, 8)}`
}

function parsePriority(
    args: string[],
    current: Task["priority"] = "medium"
) {
    const index = args.indexOf("--priority")

    if (index === -1) {
        return current
    }

    const value = args[index + 1]

    if (value !== "low" && value !== "medium" && value !== "high") {
        throw new Error("Priority must be: low, medium, or high.")
    }

    return value
}

function parseDueDate(
    args: string[],
    current: number | null = null
) {
    const index = args.indexOf("--due")

    if (index === -1) {
        return current
    }

    const value = args[index + 1]

    if (!value || !/^\d{8}$/.test(value)) {
        throw new Error("Due date must be in YYYYMMDD format.")
    }

    return Number(value)
}

function parseTags(
    args: string[],
    current: string[] = []
) {
    const tags: string[] = []
    let foundTag = false

    for (let i = 0; i < args.length; i++) {
        if (args[i] === "--tag") {
            const tag = args[i + 1]

            if (!tag) {
                throw new Error("Please provide a tag.")
            }

            tags.push(tag)
            foundTag = true
        }
    }

    return foundTag ? tags : current
}

function clearScreen() {
    stdout.write("\x1b[2J\x1b[H")
}

function waitForKey() {
    return new Promise<string>((resolve) => {
        stdin.setRawMode(true)
        stdin.resume()

        const handler = (data: Buffer) => {
            stdin.setRawMode(false)
            stdin.pause()
            stdin.removeListener("data", handler)

            resolve(data.toString())
        }

        stdin.on("data", handler)
    })
}

function persistTask(task: StoredTask, change: (current: StoredTask) => void) {
    updateByUid(task.uid, current => {
        change(current)
        Object.assign(task, current)
    })
}

async function editTaskTitle(task: StoredTask) {
    stdout.write("\nNew title: ")

    stdin.setRawMode(false)
    stdin.resume()

    const newTitle = await new Promise<string>((resolve) => {
        stdin.once("data", (data) => {
            resolve(data.toString().trim())
        })
    })

    if (newTitle) {
        persistTask(task, current => { current.title = newTitle })
    }
}

async function editTaskPriority(task: StoredTask) {
    const priorities: Task["priority"][] = [
        "low",
        "medium",
        "high"
    ]

    let priorityIndex = priorities.indexOf(task.priority)

    while (true) {
        clearScreen()

        console.log("SELECT PRIORITY")
        console.log("────────────────────────────────")
        console.log("")

        for (let i = 0; i < priorities.length; i++) {
            const priority = priorities[i]
            if (!priority) {
                continue
            }

            const prefix = i === priorityIndex ? "❯" : " "
            const color =
                i === priorityIndex
                    ? getPriorityColor(priority)
                    : ""

            console.log(`${color}${prefix} ${priority.toUpperCase()}${resetColor}`)
        }

        const priorityKey = await waitForKey()

        if (priorityKey === "\x1b[A") {
            priorityIndex = Math.max(0, priorityIndex - 1)
        } else if (priorityKey === "\x1b[B") {
            priorityIndex = Math.min(
                priorities.length - 1,
                priorityIndex + 1
            )
        } else if (priorityKey === "\r" || priorityKey === "\n") {
            const selectedPriority = priorities[priorityIndex]

            if (selectedPriority) {
                persistTask(task, current => { current.priority = selectedPriority })
            }
            break
        } else if (priorityKey === "\x1b") {
            break
        }
    }
}

async function editTaskDueDate(task: StoredTask) {
    stdout.write("\nNew due date (YYYYMMDD, empty = remove): ")

    stdin.setRawMode(false)
    stdin.resume()

    const newDate = await new Promise<string>((resolve) => {
        stdin.once("data", (data) => {
            resolve(data.toString().trim())
        })
    })

    if (newDate === "" || /^\d{8}$/.test(newDate)) {
        persistTask(task, current => { current.dueDate = newDate ? Number(newDate) : null })
    }
}

async function editTaskTags(task: StoredTask) {
    stdout.write("\nTags separated by spaces (empty = remove): ")

    stdin.setRawMode(false)
    stdin.resume()

    const newTags = await new Promise<string>((resolve) => {
        stdin.once("data", (data) => {
            resolve(data.toString().trim())
        })
    })

    persistTask(task, current => { current.tags = newTags === "" ? [] : newTags.split(/\s+/) })
}

function renderTaskDetail(task: Task, selected: number, fields: string[]) {
    clearScreen()

    console.log("TASK DETAILS")
    console.log("────────────────────────────────")
    console.log("")

    const values = [
        `Title: ${task.title}`,
        `Priority: ${task.priority.toUpperCase()}`,
        `Due Date: ${
            task.dueDate === null
                ? "None"
                : formatDueDate(task.dueDate)
        }`,
        `Tags: ${
            task.tags.length === 0
                ? "None"
                : task.tags.join(", ")
        }`,
        `Status: ${task.completed ? "Completed" : "Pending"}`,
        "Done",
        "Delete",
        "Back"
    ]

    for (let i = 0; i < fields.length; i++) {
        const prefix = i === selected ? "❯" : " "
        const color = i === selected ? selectedBlue : ""

        console.log(`${color}${prefix} ${values[i]}${resetColor}`)
    }

    console.log("")
    console.log("↑ ↓ Navigate   Enter Select   Esc Back")
}

async function interactiveTaskView(task: StoredTask) {
    let selected = 0

    const fields = [
        "title",
        "priority",
        "dueDate",
        "tags",
        "status",
        "done",
        "delete",
        "back"
    ]

    while (true) {
        renderTaskDetail(task, selected, fields)

        const key = await waitForKey()

        if (key === "\x1b[A") {
            selected = Math.max(0, selected - 1)
        } else if (key === "\x1b[B") {
            selected = Math.min(fields.length - 1, selected + 1)
        } else if (key === "\x1b" || key === "\x1b\x1b") {
            return
        } else if (key === "\r" || key === "\n") {
            const field = fields[selected]

            if (field === "title") {
                await editTaskTitle(task)
            } else if (field === "priority") {
                await editTaskPriority(task)
            } else if (field === "dueDate") {
                await editTaskDueDate(task)
            } else if (field === "tags") {
                await editTaskTags(task)
            } else if (field === "status") {
                persistTask(task, current => { current.completed = !current.completed })
            } else if (field === "done") {
                persistTask(task, current => { current.completed = true })
            } else if (field === "delete") {
                updateByUid(task.uid, (current, tasks) => tasks.splice(tasks.indexOf(current), 1))
                return
            } else if (field === "back") {
                return
            }
        }
    }
}
function showHelp() {
    console.log(`
TODO CLI

Usage:
  todo
  todo <command> [arguments]

Commands:
  add <title>                  Add a new task
  list                         List tasks
  done <id>                    Mark a task as completed
  edit <id> <title>            Edit a task
  delete <id>                  Delete a task
  clear                        Delete all tasks
  panel [--json] [--limit N] [--today YYYYMMDD]
                               Show a read-only task summary
  panel --describe             Print Command Center registration JSON
  help                         Show this help

Add options:
  --priority <low|medium|high>
  --due <YYYYMMDD>
  --tag <tag>

List options:
  --priority <low|medium|high>
  --tag <tag>
  --pending
  --completed
  --sort <due|priority|created|id>
`)
}

async function interactiveMode() {
    let selected = 0
    let notice = ""

    while (true) {
        const tasks = readTasks()

        const addNoteIndex = tasks.length

	if (selected > addNoteIndex) {
	    selected = addNoteIndex
	}

        clearScreen()

        console.log("TODO LIST")
        console.log("────────────────────────────────")
        console.log("")

        if (tasks.length === 0) {
            console.log("No tasks.")
        }

        for (const [i, task] of tasks.entries()) {
            const status = task.completed ? "✓" : " "
            const selectedLine = i === selected

            const idColor = selectedLine
                ? selectedBlue
                : lightBlue
	    const priority = task.priority ?? "medium"
            const priorityColor = getPriorityColor(priority)

            const dueDate =
                task.dueDate === null
                    ? ""
                    : `  ${orange}${formatDueDate(task.dueDate)}${resetColor}`

            const tags =
                !task.tags || task.tags.length === 0
                    ? ""
                    : `  (${task.tags.join(", ")})`

            const prefix = selectedLine ? "❯" : " "

            console.log(
                `${prefix} [${status}] ${idColor}#${task.id}${resetColor} ` +
                `${priorityColor}[${priority.toUpperCase()}]${resetColor} ` +
                `${task.title}${dueDate}${tags}`
            )
        }
        const addNoteSelected = selected === addNoteIndex
        const addNotePrefix = addNoteSelected ? "❯" : " "

        console.log(
            `${addNotePrefix} ${selectedBlue}+ Add Note${resetColor}`
        )
        console.log("")
        console.log("↑ ↓ Navigate   Enter Open   q Quit")
        if (notice) {
            console.log(notice)
            notice = ""
        }

        const key = await waitForKey()

        if (key === "\x1b[A") {
            selected = Math.max(0, selected - 1)
        } else if (key === "\x1b[B") {
            selected = Math.min(addNoteIndex, selected + 1)
        } else if (key === "\r" || key === "\n") {
            if (selected === addNoteIndex) {
                clearScreen()
                stdout.write("New task title: ")
                stdin.setRawMode(false)
                stdin.resume()
                const title = await new Promise<string>(resolve => {
                    stdin.once("data", data => resolve(data.toString().trim()))
                })
                if (title) addTask(title, [])
            } else {
                const task = tasks[selected]
                if (task) {
                    try {
                        await interactiveTaskView(task)
                    } catch (error) {
                        if (!(error instanceof TaskRemoved)) throw error
                        notice = error.message
                    }
                }
            }
        } else if (key === "q" || key === "Q") {
            clearScreen()
            return
        }
    }
}

function listTasks(args: string[]) {
    let tasks = readTasks()
    const priorityIndex = args.indexOf("--priority")

    if (priorityIndex !== -1) {
        const priority = args[priorityIndex + 1]

        if (
            priority !== "low" &&
            priority !== "medium" &&
            priority !== "high"
        ) {
            throw new Error("Priority must be: low, medium, or high.")
        }

        tasks = tasks.filter(
            (task: StoredTask) => task.priority === priority
        )
    }

    const tagIndex = args.indexOf("--tag")

    if (tagIndex !== -1) {
        const tag = args[tagIndex + 1]

        if (!tag) {
            throw new Error("Please provide a tag.")
        }

        tasks = tasks.filter(
            (task: StoredTask) => task.tags.includes(tag)
        )
    }

    if (args.includes("--pending")) {
        tasks = tasks.filter(
            (task: StoredTask) => !task.completed
        )
    }

    if (args.includes("--completed")) {
        tasks = tasks.filter(
            (task: StoredTask) => task.completed
        )
    }

    let displayedTasks = tasks
    const sortIndex = args.indexOf("--sort")

    if (sortIndex !== -1) {
        const sortType = args[sortIndex + 1]

        if (
            sortType !== "due" &&
            sortType !== "priority" &&
            sortType !== "created" &&
            sortType !== "id"
        ) {
            throw new Error("Sort must be: due, priority, created, or id.")
        }

        displayedTasks = sortTasksForDisplay(tasks, sortType)
    }

    console.log("\nTODO LIST")
    console.log("────────────────────────────────")

    for (const task of displayedTasks) {
        const status = task.completed ? "✓" : " "

        const idLabel =
            `${lightBlue}#${task.id}${resetColor}`

        const priorityColor =
            getPriorityColor(task.priority)

        const priorityLabel =
            `${priorityColor}[${task.priority.toUpperCase()}]${resetColor}`

        const dueDate =
            formatDueDate(task.dueDate)

        const dueDateLabel =
            dueDate === ""
                ? ""
                : `  ${orange}${dueDate}${resetColor}`

        const tagsLabel =
            task.tags.length === 0
                ? ""
                : `  (${task.tags.join(", ")})`

        console.log(
            `[${status}] ${idLabel} ${priorityLabel} ` +
            `${task.title}${dueDateLabel}${tagsLabel}`
        )
    }
}

function addTask(title: string, args: string[]) {
    const priority = parsePriority(args)
    const dueDate = parseDueDate(args)
    const tags = parseTags(args)
    let id = 0
    updateTasks(tasks => {
        id = getNextTaskId(tasks)
        tasks.push({ uid: randomUUID(), id, title, completed: false, priority, dueDate, tags,
            createdAt: new Date().toISOString() })
    })
    return id
}

const editFlags = ["--priority", "--due", "--tag"]
const commands: Record<string, { usage: string; positions: number; flags: string[] }> = {
    add: { usage: 'add <title> [--priority LEVEL] [--due YYYYMMDD] [--tag TAG]', positions: 1, flags: editFlags },
    edit: { usage: 'edit <id> <title> [--priority LEVEL] [--due YYYYMMDD] [--tag TAG]', positions: 2, flags: editFlags },
    list: { usage: 'list [--priority LEVEL] [--tag TAG] [--pending] [--completed] [--sort FIELD]', positions: 0,
        flags: ["--priority", "--tag", "--pending", "--completed", "--sort"] },
    done: { usage: 'done <id>', positions: 1, flags: [] },
    delete: { usage: 'delete <id>', positions: 1, flags: [] },
    clear: { usage: 'clear', positions: 0, flags: [] }
}

async function run() {
    const args = process.argv.slice(3)
    if (!command) return interactiveMode()
    if (command === "help") return showHelp()
    if (command === "panel") {
        process.exitCode = panelCommand(args)
        return
    }
    const spec = Object.hasOwn(commands, command) ? commands[command] : undefined
    if (!spec) throw new Error("Unknown command: " + command)
    const usage = "Usage: todo " + spec.usage
    if (args.includes("--help") || args.includes("-h")) {
        console.log(usage)
        return
    }
    for (const arg of args) {
        if (arg.startsWith("-") && !spec.flags.includes(arg)) throw new Error("Unknown option: " + arg)
    }
    const positions = args.slice(0, spec.positions)
    if (positions.length !== spec.positions || positions.some(arg => !arg || arg.startsWith("-"))) {
        throw new Error(usage)
    }
    const flags = args.slice(spec.positions)
    for (let i = 0; i < flags.length; i++) {
        const flag = flags[i]!
        if (!spec.flags.includes(flag)) throw new Error(usage)
        if (flag === "--pending" || flag === "--completed") continue
        const value = flags[++i]
        if (!value || value.startsWith("-")) throw new Error("Missing value for " + flag)
    }

    if (command === "list") return listTasks(flags)
    if (command === "add") {
        console.log("Added task #" + addTask(positions[0]!, flags))
        return
    }
    if (command === "clear") {
        updateTasks(tasks => { tasks.length = 0 })
        console.log("All tasks cleared.")
        return
    }
    const id = Number(positions[0])
    let message = ""
    updateTasks(tasks => {
        const task = tasks.find(item => item.id === id)
        if (!task) throw new Error(`Task #${id} not found.`)
        if (command === "delete") {
            tasks.splice(tasks.indexOf(task), 1)
            message = `Deleted task #${id}: ${task.title}`
        } else if (command === "done") {
            task.completed = true
            message = `Task #${id} completed.`
        } else {
            task.title = positions[1]!
            task.priority = parsePriority(flags, task.priority)
            task.dueDate = parseDueDate(flags, task.dueDate)
            task.tags = parseTags(flags, task.tags)
            message = `Task #${id} updated.`
        }
    })
    console.log(message)
}

try {
    await run()
} catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exitCode = 1
}
