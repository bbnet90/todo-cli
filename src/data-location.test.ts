import assert from "node:assert/strict"
import { execFile, execFileSync } from "node:child_process"
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join, resolve } from "node:path"
import test from "node:test"
import { pathToFileURL } from "node:url"
import { promisify } from "node:util"
import { dataFile } from "./storage.js"

test("platform data path and override precedence", () => {
    assert.equal(dataFile("win32", { APPDATA: "D:\\User" }, "C:\\Home"), "D:\\User\\todo-cli\\tasks.json")
    assert.equal(dataFile("win32", {}, "C:\\Home"), "C:\\Home\\AppData\\Roaming\\todo-cli\\tasks.json")
    assert.equal(dataFile("linux", { XDG_DATA_HOME: "/shared" }, "/home/u"), "/shared/todo-cli/tasks.json")
    for (const env of [{}, { XDG_DATA_HOME: "relative" }]) {
        assert.equal(dataFile("linux", env, "/home/u"), "/home/u/.local/share/todo-cli/tasks.json")
    }
    assert.equal(dataFile("win32", { APPDATA: "D:\\User", TODO_CLI_DATA_FILE: "tasks" }), resolve("tasks"))
})

test("package-local migration is read-only until a locked default-path write", async t => {
    const root = mkdtempSync(join(tmpdir(), "todo-location-"))
    t.after(() => rmSync(root, { recursive: true, force: true }))
    const pkg = join(root, "package")
    function install() {
        cpSync("src", join(pkg, "src"), { recursive: true, filter: p => !p.endsWith(".map") })
        cpSync("package.json", join(pkg, "package.json"))
    }
    install()
    const env: NodeJS.ProcessEnv = { ...process.env, XDG_DATA_HOME: join(root, "xdg"), APPDATA: join(root, "roaming"),
        HOME: root, USERPROFILE: root }
    delete env.TODO_CLI_DATA_FILE
    const cli = join(pkg, "src", "cli.js")
    const storage = new URL("./storage.js", pathToFileURL(cli)).href
    const storageCall = (code: string) => execFileSync(process.execPath,
        ["--input-type=module", "-e", "import * as store from " + JSON.stringify(storage) + "; " + code],
        { env, encoding: "utf8" })
    const run = (...args: string[]) => execFileSync(process.execPath, [cli, ...args], { env, encoding: "utf8" })
    const legacy = join(pkg, "data", "tasks.json")
    mkdirSync(dirname(legacy))
    const original = JSON.stringify([{ id: 1, title: "legacy", completed: false, priority: "medium",
        dueDate: null, tags: [], createdAt: "" }])
    writeFileSync(legacy, original)
    const openUid = storageCall("process.stdout.write(store.readTasks()[0].uid)")
    const userFile = dataFile(process.platform, env)
    assert.match(run("list"), /legacy/)
    assert.match(run("panel"), /legacy/)
    assert.match(run("panel", "--json"), /legacy/)
    assert.equal(JSON.parse(run("panel", "--describe")).id, "todo")
    assert.ok(!existsSync(dirname(userFile)))
    assert.equal(readFileSync(legacy, "utf8"), original)

    const execute = promisify(execFile)
    const titles = Array.from({ length: 16 }, (_, i) => "new-" + i)
    await Promise.all(titles.map(title => execute(process.execPath, [cli, "add", title], { env })))
    const rows: { id: number; uid: string; title: string }[] = JSON.parse(readFileSync(userFile, "utf8"))
    assert.deepEqual(rows.map(row => row.id), Array.from({ length: 17 }, (_, i) => i + 1))
    assert.deepEqual(rows.map(row => row.title).sort(), ["legacy", ...titles].sort())
    assert.equal(new Set(rows.map(row => row.uid)).size, 17)
    assert.equal(readFileSync(legacy, "utf8"), original)
    if (process.platform === "linux") assert.equal(statSync(dirname(userFile)).mode & 0o777, 0o700)
    assert.equal(rows[0]!.uid, openUid)
    storageCall("store.updateByUid(" + JSON.stringify(openUid) + ", task => { task.completed = true })")
    assert.equal(JSON.parse(readFileSync(userFile, "utf8"))[0].completed, true)
    writeFileSync(legacy, "{")
    assert.match(run("list"), /new-15/)
    rmSync(pkg, { recursive: true })
    install()
    assert.match(run("list"), /legacy/)
    assert.match(run("list"), /new-15/)
})
