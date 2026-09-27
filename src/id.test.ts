import test from 'node:test'
import assert from 'node:assert/strict'
import { reindexTasks } from './task.js'

test('reindexTasks keeps IDs sequential after deletions', () => {
  const tasks = [
    { id: 1, title: 'First' },
    { id: 2, title: 'Second' },
    { id: 2, title: 'Third' }
  ]

  assert.deepEqual(reindexTasks(tasks), [
    { id: 1, title: 'First' },
    { id: 2, title: 'Second' },
    { id: 3, title: 'Third' }
  ])
})
