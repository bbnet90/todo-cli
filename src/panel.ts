import type { Task } from "./task.js"

export const panelMetadata = { title: "Yapılacaklar", open: ["todo"] } as const

const rank = { high: 0, medium: 1, low: 2 }

function taskLine(task: Task) {
    const prefix = `${task.priority === "high" ? "!" : "•"} #${task.id} `
    const date = String(task.dueDate)
    const due = task.dueDate === null ? "" : ` · ${date.slice(6, 8)}.${date.slice(4, 6)}`
    const title = Array.from(task.title.replace(/[\x00-\x20\x7f-\x9f\u2028\u2029]+/gu, " ").trim())
    const space = 44 - prefix.length - due.length
    const text = title.length <= space ? title.join("") : title.slice(0, space - 1).join("") + "…"
    return prefix + text + due
}

export function buildPanel(tasks: readonly Task[], options: { today: number; limit?: number }) {
    const limit = Math.max(1, Math.min(20, Math.trunc(options.limit ?? 5))) || 5
    const pending = tasks.filter(task => !task.completed)
    const lines: string[] = []
    if (!tasks.length) {
        lines.push("Görev yok.", 'Eklemek için: todo add "Başlık"')
    } else {
        lines.push(`${pending.length} açık · ${tasks.length - pending.length} tamamlandı`)
        if (!pending.length) lines.push("Hepsi tamam.")
        const overdue = pending.filter(task => task.dueDate !== null && task.dueDate < options.today).length
        if (overdue) lines.push(`Gecikmiş: ${overdue}`)
        pending.sort((a, b) => (a.dueDate ?? Infinity) - (b.dueDate ?? Infinity)
            || rank[a.priority] - rank[b.priority] || a.id - b.id)
        lines.push(...pending.slice(0, limit).map(taskLine))
        if (pending.length > limit) lines.push(`+${pending.length - limit} daha`)
    }
    return { title: panelMetadata.title, lines, open: [...panelMetadata.open] }
}
