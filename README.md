# Todo CLI

A small, local-first task manager that runs directly from the terminal.

I built Todo CLI as a practical TypeScript project to manage tasks without relying on a web interface, external service, or database server. The goal was to keep the application simple while still supporting the features I actually need from a command-line task manager.

The application can be used interactively or entirely through CLI commands.

## Features

* Interactive terminal UI
* Add, edit, complete, and delete tasks
* Task priorities: `low`, `medium`, `high`
* Due dates
* Multiple tags per task
* Filter tasks by priority, tag, or completion status
* Sort tasks by due date, priority, creation time, or ID
* Persistent local JSON storage
* Global `todo` command
* Works independently without an internet connection

## Tech Stack

* **TypeScript**
* **Node.js**
* **npm**
* **JSON** for local persistence
* **Git / GitHub**
* Terminal-based user interface

## Project Structure

```text
todo-cli/
├── src/
│   ├── cli.ts
│   ├── storage.ts
│   └── task.ts
├── data/
│   └── tasks.json
├── package.json
├── package-lock.json
├── tsconfig.json
├── .gitignore
└── README.md
```

### `src/cli.ts`

Contains the command-line interface and interactive terminal UI.

It handles:

* CLI command parsing
* Task creation
* Task editing
* Task completion
* Task deletion
* Filtering
* Sorting
* Interactive navigation
* Task detail views
* Keyboard input

Running `todo` without a command opens the interactive interface.

### `src/storage.ts`

Responsible for reading and writing task data.

The application stores tasks in:

```text
data/tasks.json
```

The storage path is resolved relative to the application source rather than the current working directory. This allows the global `todo` command to work even when it is executed outside the project directory.

### `src/task.ts`

Defines the TypeScript task model and priority type.

The current task structure is:

```ts
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
```

## Installation

Clone the repository:

```bash
git clone https://github.com/bbnet90/todo-cli.git
cd todo-cli
```

Install the dependencies:

```bash
npm install
```

Compile the TypeScript source:

```bash
npx tsc
```

The TypeScript compiler generates the JavaScript files used to execute the CLI.

Then link the command globally:

```bash
sudo npm link
```

After linking, the application can be started with:

```bash
todo
```

## Interactive Mode

Running:

```bash
todo
```

opens the interactive interface.

Example:

```text
TODO LIST
────────────────────────────────

❯ [ ] #1 [HIGH] C ödevi  2026-09-25  (university, c)
  [ ] #2 [MEDIUM] Git çalış
  [✓] #3 [LOW] README yaz

↑ ↓ Navigate   Enter Open   q Quit
```

The interface can be navigated with the arrow keys.

Press `Enter` to open a task or select `+ Add Note`.

Inside a task:

```text
TASK DETAILS
────────────────────────────────

❯ Title: C ödevi
  Priority: HIGH
  Due Date: 2026-09-25
  Tags: university, c
  Status: Pending
  Done
  Delete
  Back

↑ ↓ Navigate   Enter Select   Esc Back
```

## CLI Usage

### Start interactive mode

```bash
todo
```

### Add a task

```bash
todo add "C ödevi"
```

### Add a task with priority

```bash
todo add "C ödevi" --priority high
```

Available priorities:

```text
low
medium
high
```

### Add a due date

Due dates use the `YYYYMMDD` format:

```bash
todo add "C ödevi" --due 20260925
```

The date is displayed as:

```text
2026-09-25
```

### Add tags

Multiple tags can be assigned to a task:

```bash
todo add "C ödevi" --tag university --tag c
```

### Combine options

```bash
todo add "C ödevi" \
  --priority high \
  --due 20260925 \
  --tag university \
  --tag c
```

### List tasks

```bash
todo list
```

### Filter by priority

```bash
todo list --priority high
```

### Filter by tag

```bash
todo list --tag university
```

### Show pending tasks

```bash
todo list --pending
```

### Show completed tasks

```bash
todo list --completed
```

Filters can also be combined:

```bash
todo list --tag university --priority high --pending
```

### Sort tasks

Sort by due date:

```bash
todo list --sort due
```

Sort by priority:

```bash
todo list --sort priority
```

Sort by creation time:

```bash
todo list --sort created
```

Sort by ID:

```bash
todo list --sort id
```

### Complete a task

```bash
todo done 1
```

### Edit a task

```bash
todo edit 1 "C ödevini teslim et"
```

Options can also be changed while editing:

```bash
todo edit 1 "C ödevini teslim et" \
  --priority high \
  --due 20260928 \
  --tag university \
  --tag programming
```

### Delete a task

```bash
todo delete 1
```

### Delete all tasks

```bash
todo clear
```

### Show help

```bash
todo help
```

## Data Storage

Todo CLI currently uses a local JSON file instead of a database.

Example:

```json
[
  {
    "id": 1,
    "title": "C ödevi",
    "completed": false,
    "priority": "high",
    "dueDate": 20260925,
    "tags": [
      "university",
      "c"
    ],
    "createdAt": "2026-09-21T18:30:00.000Z"
  }
]
```

This keeps the project easy to inspect and removes the need for a database server or external service.

The `data/tasks.json` file contains local task data and is intentionally excluded from Git.

## Git Ignore Policy

The repository does not track generated or machine-specific files.

Ignored files include:

```text
node_modules/
data/tasks.json

src/*.js
src/*.js.map
src/*.d.ts
src/*.d.ts.map
```

The repository therefore contains the TypeScript source rather than generated build artifacts or personal task data.

After cloning the repository, dependencies and generated files can be recreated locally with:

```bash
npm install
npx tsc
```

## Design Decisions

### Local-first

Todo CLI does not require:

* An account
* An internet connection
* A web server
* A remote database
* A third-party API

Tasks remain on the local machine.

### TypeScript source

The application is written in TypeScript to provide:

* Static typing
* Explicit task models
* Safer command handling
* Easier maintenance as the project grows

### JSON persistence

JSON was chosen deliberately for the current version.

For a small personal task manager, a JSON file is enough to provide persistent storage without adding database complexity.

The storage layer is separated from the CLI, so the persistence implementation can be changed independently in the future if needed.

## Project Status

Todo CLI is a complete standalone project.

It is usable both as a normal command-line application and as an interactive terminal application.

The project was also built as a practical exercise in:

* TypeScript
* Node.js CLI development
* File-based persistence
* Terminal input handling
* Argument parsing
* Data modeling
* Git workflow
* Global CLI installation

## Future Integration

Although Todo CLI works independently, it may eventually become one component of a larger personal developer environment called **Developer Command Center**.

A possible architecture would look like:

```text
Developer Command Center
├── Todo
├── System
├── Git
├── Projects
└── Settings
```

In that architecture, Developer Command Center could detect whether the `todo` command is installed and expose Todo CLI as the task-management module.

Todo CLI would remain an independent application and would not depend on Developer Command Center.

## License

This project is currently intended for personal and educational use.
