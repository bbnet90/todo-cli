import type { Task } from "./task.js"
import { readTasks, writeTasks } from "./storage.js"
import { stdin, stdout } from "node:process"

const command = process.argv[2]
const argument = process.argv[3]

const lightBlue = "\x1b[94m"
const selectedBlue = "\x1b[36m"
const orange = "\x1b[38;5;208m"
const resetColor = "\x1b[0m"
const red = "\x1b[31m"
const yellow = "\x1b[33m"
const green = "\x1b[32m"

function getPriorityColor(priority: Task["priority"]) {
    if (priority === "high") return red
    if (priority === "medium") return yellow
    return green
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
        console.log("Priority must be: low, medium, or high.")
        process.exit(1)
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
        console.log("Due date must be in YYYYMMDD format.")
        process.exit(1)
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
                console.log("Please provide a tag.")
                process.exit(1)
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

async function interactiveTaskView(task: Task) {
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
                stdout.write("\nNew title: ")

                stdin.setRawMode(false)
                stdin.resume()

                const newTitle = await new Promise<string>((resolve) => {
                    stdin.once("data", (data) => {
                        resolve(data.toString().trim())
                    })
                })

                if (newTitle) {
                    task.title = newTitle
                    writeTasks(readTasks())
                }
            }

            if (field === "priority") {
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

			    const prefix =
			    i === priorityIndex ? "❯" : " "

			    const color =
		            i === priorityIndex
		            ? getPriorityColor(priority)
		            : ""

			    console.log(`${color}${prefix} ${priority.toUpperCase()}${resetColor}`)
		}
                    const priorityKey = await waitForKey()

                    if (priorityKey === "\x1b[A") {
                        priorityIndex = Math.max(
                            0,
                            priorityIndex - 1
                        )
                    } else if (priorityKey === "\x1b[B") {
                        priorityIndex = Math.min(
                            priorities.length - 1,
                            priorityIndex + 1
                        )
                    } else if (
                        priorityKey === "\r" ||
                        priorityKey === "\n"
                    ) {
                        const selectedPriority = priorities[priorityIndex]

			if (selectedPriority) {
			    task.priority = selectedPriority
			}
                        break
                    } else if (priorityKey === "\x1b") {
                        break
                    }
                }
            }

            if (field === "dueDate") {
                stdout.write("\nNew due date (YYYYMMDD, empty = remove): ")

                stdin.setRawMode(false)
                stdin.resume()

                const newDate = await new Promise<string>((resolve) => {
                    stdin.once("data", (data) => {
                        resolve(data.toString().trim())
                    })
                })

                if (newDate === "") {
                    task.dueDate = null
                } else if (/^\d{8}$/.test(newDate)) {
                    task.dueDate = Number(newDate)
                }
            }

            if (field === "tags") {
                stdout.write(
                    "\nTags separated by spaces (empty = remove): "
                )

                stdin.setRawMode(false)
                stdin.resume()

                const newTags = await new Promise<string>((resolve) => {
                    stdin.once("data", (data) => {
                        resolve(data.toString().trim())
                    })
                })

                task.tags =
                    newTags === ""
                        ? []
                        : newTags.split(/\s+/)
            }

            if (field === "status") {
                task.completed = !task.completed
            }

            if (field === "done") {
                task.completed = true
            }

            if (field === "delete") {
                const tasks = readTasks()
                const index = tasks.findIndex(
                    (item: Task) => item.id === task.id
                )

                if (index !== -1) {
                    tasks.splice(index, 1)
                    writeTasks(tasks)
                }

                return
            }

            if (field === "back") {
                return
            }

            const tasks = readTasks()
            const index = tasks.findIndex(
                (item: Task) => item.id === task.id
            )

            if (index !== -1) {
                tasks[index] = task
                writeTasks(tasks)
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

        for (let i = 0; i < tasks.length; i++) {
            const task = tasks[i]
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

        const key = await waitForKey()

        if (key === "\x1b[A") {
            selected = Math.max(0, selected - 1)
        } else if (key === "\x1b[B") {
            selected = Math.min(addNoteIndex, selected + 1)
        }  else if (key === "\r" || key === "\n") {
    if (selected === addNoteIndex) {
        clearScreen()

        stdout.write("New task title: ")

        stdin.setRawMode(false)
        stdin.resume()

        const newTitle = await new Promise<string>((resolve) => {
            stdin.once("data", (data) => {
                resolve(data.toString().trim())
            })
        })

        if (newTitle) {
            const currentTasks = readTasks()

            const newTask: Task = {
                id:
                    currentTasks.length === 0
                        ? 1
                        : Math.max(
                            ...currentTasks.map(
                                (task: Task) => task.id
                            )
                        ) + 1,
                title: newTitle,
                completed: false,
                priority: "medium",
                dueDate: null,
                tags: [],
                createdAt: new Date().toISOString()
            }

            currentTasks.push(newTask)
            writeTasks(currentTasks)
        }
    } else if (tasks.length > 0) {
        await interactiveTaskView(tasks[selected])
    }
}
         else if (key === "q" || key === "Q") {
            clearScreen()
            return
        }
    }
}

if (!command) {
    await interactiveMode()
}
 else if (command === "help") {
    showHelp()
}
 else if (command === "add") {
    if (!argument) {
        console.log("Please provide a task title.")
        process.exit(1)
    }

    const tasks = readTasks()
    const args = process.argv.slice(4)

    const task: Task = {
        id: tasks.length + 1,
        title: argument,
        completed: false,
        priority: parsePriority(args),
        dueDate: parseDueDate(args),
        tags: parseTags(args),
        createdAt: new Date().toISOString()
    }

    tasks.push(task)
    writeTasks(tasks)

    console.log(`Added task #${task.id}`)
} else if (command === "list") {
    let tasks = readTasks()
    const args = process.argv.slice(3)

    const priorityIndex = args.indexOf("--priority")

    if (priorityIndex !== -1) {
        const priority = args[priorityIndex + 1]

        if (
            priority !== "low" &&
            priority !== "medium" &&
            priority !== "high"
        ) {
            console.log("Priority must be: low, medium, or high.")
            process.exit(1)
        }

        tasks = tasks.filter(
            (task: Task) => task.priority === priority
        )
    }

    const tagIndex = args.indexOf("--tag")

    if (tagIndex !== -1) {
        const tag = args[tagIndex + 1]

        if (!tag) {
            console.log("Please provide a tag.")
            process.exit(1)
        }

        tasks = tasks.filter(
            (task: Task) => task.tags.includes(tag)
        )
    }

    if (args.includes("--pending")) {
        tasks = tasks.filter(
            (task: Task) => !task.completed
        )
    }

    if (args.includes("--completed")) {
        tasks = tasks.filter(
            (task: Task) => task.completed
        )
    }

    const sortIndex = args.indexOf("--sort")

    if (sortIndex !== -1) {
        const sortType = args[sortIndex + 1]

        if (
            sortType !== "due" &&
            sortType !== "priority" &&
            sortType !== "created" &&
            sortType !== "id"
        ) {
            console.log(
                "Sort must be: due, priority, created, or id."
            )
            process.exit(1)
        }

        if (sortType === "due") {
            tasks.sort((a: Task, b: Task) => {
                if (a.dueDate === null) return 1
                if (b.dueDate === null) return -1

                return a.dueDate - b.dueDate
            })
        }

        if (sortType === "priority") {
            const priorityOrder = {
                high: 1,
                medium: 2,
                low: 3
            }

            tasks.sort(
                (a: Task, b: Task) =>
                    priorityOrder[a.priority] -
                    priorityOrder[b.priority]
            )
        }

        if (sortType === "created") {
            tasks.sort(
                (a: Task, b: Task) =>
                    new Date(a.createdAt).getTime() -
                    new Date(b.createdAt).getTime()
            )
        }

        if (sortType === "id") {
            tasks.sort(
                (a: Task, b: Task) => a.id - b.id
            )
        }
    }

    console.log("\nTODO LIST")
    console.log("────────────────────────────────")

    for (const task of tasks) {
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
} else if (command === "done") {
    if (!argument) {
        console.log("Please provide a task ID.")
        process.exit(1)
    }

    const id = Number(argument)
    const tasks = readTasks()

    const task = tasks.find(
        (task: Task) => task.id === id
    )

    if (!task) {
        console.log(`Task #${id} not found.`)
        process.exit(1)
    }

    task.completed = true
    writeTasks(tasks)

    console.log(`Task #${id} completed.`)
} else if (command === "delete") {
    if (!argument) {
        console.log("Please provide a task ID.")
        process.exit(1)
    }

    const id = Number(argument)
    const tasks = readTasks()

    const taskIndex = tasks.findIndex(
        (task: Task) => task.id === id
    )

    if (taskIndex === -1) {
        console.log(`Task #${id} not found.`)
        process.exit(1)
    }

    const deletedTask = tasks[taskIndex]

    tasks.splice(taskIndex, 1)
    writeTasks(tasks)

    console.log(
        `Deleted task #${deletedTask.id}: ${deletedTask.title}`
    )
} else if (command === "clear") {
    const tasks = readTasks()

    tasks.length = 0
    writeTasks(tasks)

    console.log("All tasks cleared.")
} else if (command === "edit") {
    const id = Number(process.argv[3])
    const newTitle = process.argv[4]

    if (!newTitle) {
        console.log("Please provide a new task title.")
        process.exit(1)
    }

    const tasks = readTasks()

    const task = tasks.find(
        (task: Task) => task.id === id
    )

    if (!task) {
        console.log(`Task #${id} not found.`)
        process.exit(1)
    }

    const args = process.argv.slice(5)

    task.title = newTitle
    task.priority =
        parsePriority(args, task.priority)
    task.dueDate =
        parseDueDate(args, task.dueDate)
    task.tags =
        parseTags(args, task.tags)

    writeTasks(tasks)

    console.log(`Task #${id} updated.`)
} else {
    console.log("Unknown command:", command)
}
