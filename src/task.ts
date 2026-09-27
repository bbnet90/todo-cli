export type Priority = "low" | "medium" | "high"

export interface Task {
    id: number
    title: string
    completed: boolean

    priority: Priority
    dueDate: number | null
    tags: string[]

    createdAt: string
}

export function reindexTasks<T extends Pick<Task, "id">>(tasks: T[]) {
    return tasks.map((task, index) => ({
        ...task,
        id: index + 1
    }))
}

export function getNextTaskId<T extends Pick<Task, "id">>(tasks: T[]) {
    if (tasks.length === 0) {
        return 1
    }

    const lastTask = tasks[tasks.length - 1]

    if (!lastTask) {
        return 1
    }

    return lastTask.id + 1
}

export function sortTasksForDisplay<T extends Pick<Task, "id" | "priority" | "createdAt" | "dueDate">>(
    tasks: T[],
    sortType: "due" | "priority" | "created" | "id"
) {
    const sortedTasks = [...tasks]

    if (sortType === "due") {
        sortedTasks.sort((a, b) => {
            if (a.dueDate === null && b.dueDate === null) {
                return 0
            }

            if (a.dueDate === null) {
                return 1
            }

            if (b.dueDate === null) {
                return -1
            }

            return a.dueDate - b.dueDate
        })
        return sortedTasks
    }

    if (sortType === "priority") {
        const priorityOrder = {
            high: 0,
            medium: 1,
            low: 2
        }

        sortedTasks.sort(
            (a, b) =>
                priorityOrder[a.priority] -
                priorityOrder[b.priority]
        )
        return sortedTasks
    }

    if (sortType === "created") {
        sortedTasks.sort(
            (a, b) =>
                new Date(a.createdAt).getTime() -
                new Date(b.createdAt).getTime()
        )
        return sortedTasks
    }

    sortedTasks.sort((a, b) => a.id - b.id)
    return sortedTasks
}
