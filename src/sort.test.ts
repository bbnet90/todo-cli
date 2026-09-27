import test from 'node:test'
import assert from 'node:assert/strict'
import type { Task } from './task.js'
import { sortTasksForDisplay } from './task.js'

test('sortTasksForDisplay orders priority without mutating the original array', () => {
  const tasks: Task[] = [
    { id: 1, title: 'Low', completed: false, priority: 'low', dueDate: 20260925, tags: [], createdAt: '2026-09-27T00:00:00.000Z' },
    { id: 2, title: 'High', completed: false, priority: 'high', dueDate: 20260920, tags: [], createdAt: '2026-09-29T00:00:00.000Z' },
    { id: 3, title: 'Medium', completed: false, priority: 'medium', dueDate: 20260922, tags: [], createdAt: '2026-09-28T00:00:00.000Z' }
  ]

  const sorted = sortTasksForDisplay(tasks, 'priority')

  assert.deepEqual(sorted.map((task) => task.id), [2, 3, 1])
  assert.deepEqual(tasks.map((task) => task.id), [1, 2, 3])
})
