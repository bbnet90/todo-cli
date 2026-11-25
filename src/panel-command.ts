import { buildPanel } from "./panel.js"
import { readPanelTasks } from "./storage.js"

function calendarDate(value: string) {
    if (!/^\d{8}$/.test(value) || value.startsWith("0000")) return false
    const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6)}`
    const date = new Date(iso + "T00:00:00Z")
    return Number.isFinite(date.getTime()) && date.toISOString().startsWith(iso + "T")
}

export function panelCommand(args: string[]): number {
    const now = new Date()
    let today = now.getFullYear() * 10000 + (now.getMonth() + 1) * 100 + now.getDate()
    let limit = 5
    let json = false
    for (let i = 0; i < args.length; i++) {
        const flag = args[i]
        if (flag === "--json") {
            json = true
        } else if (flag === "--limit") {
            const value = args[++i] ?? ""
            if (!/^\d+$/.test(value) || Number(value) < 1 || Number(value) > 20) {
                console.error("--limit 1 ile 20 arasında bir tam sayı olmalı.")
                return 1
            }
            limit = Number(value)
        } else if (flag === "--today") {
            const value = args[++i] ?? ""
            if (!calendarDate(value)) {
                console.error("--today geçerli bir YYYYMMDD tarihi olmalı.")
                return 1
            }
            today = Number(value)
        } else {
            console.error("Bilinmeyen panel seçeneği.")
            return 1
        }
    }
    const result = readPanelTasks()
    if (!result.ok) {
        console.error(result.error)
        return 1
    }
    const panel = buildPanel(result.tasks, { today, limit })
    console.log(json ? JSON.stringify(panel) : panel.lines.join("\n"))
    return 0
}
