import assert from "node:assert/strict"
import test from "node:test"
import type { Task } from "./task.js"
import { buildPanel } from "./panel.js"

const today = 20260102
function task(id: number, fields: Partial<Task> = {}): Task {
    return { id, priority: "medium", completed: false, title: "Görev", dueDate: null,
        tags: [], createdAt: "", ...fields }
}

test("empty and all done", () => {
    assert.deepEqual(buildPanel([], { today }), {
        title: "Yapılacaklar", lines: ["Görev yok.", 'Eklemek için: todo add "Başlık"'], open: ["todo"]
    })
    assert.deepEqual(buildPanel([task(1, { completed: true, dueDate: 20250101 })], { today }).lines,
        ["0 açık · 1 tamamlandı", "Hepsi tamam."])
})

test("orders by date, priority and id; counts only overdue pending tasks", () => {
    const tasks = [task(9), task(8, { priority: "high" }), task(2, { dueDate: today }),
        task(1, { dueDate: today }), task(5, { priority: "high", dueDate: today }),
        task(6, { dueDate: 20260101, priority: "low" }), task(3, { completed: true, dueDate: 20240101 })]
    assert.deepEqual(buildPanel(tasks, { today }).lines, ["6 açık · 1 tamamlandı", "Gecikmiş: 1",
        "• #6 Görev · 01.01", "! #5 Görev · 02.01", "• #1 Görev · 02.01", "• #2 Görev · 02.01",
        "! #8 Görev", "+1 daha"])
    assert.equal(tasks[0]?.id, 9)
})

test("clamps direct calls to one through twenty", () => {
    const tasks = Array.from({ length: 22 }, (_, i) => task(i + 1))
    assert.equal(buildPanel(tasks, { today, limit: 0 }).lines.at(-1), "+21 daha")
    assert.equal(buildPanel(tasks, { today, limit: 42 }).lines.at(-1), "+2 daha")
})

test("clips by Unicode code point and keeps the date; sanitizes controls", () => {
    const tasks = ["🙂".repeat(50), "e\u0301".repeat(45), "abc".repeat(40)].map(
        (title, i) => task(i + 1, { title, dueDate: today }))
    for (const line of buildPanel(tasks, { today }).lines.slice(1)) {
        assert.equal(Array.from(line).length, 44)
        assert.ok(line.endsWith("… · 02.01"))
        assert.doesNotMatch(line, /[\uD800-\uDFFF]/u)
    }
    assert.equal(buildPanel([task(1, { title: "  A\r\n\x1b\x7f\u0085  B\u2028C " })],
        { today }).lines[1], "• #1 A B C")
})
