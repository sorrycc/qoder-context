import { mkdtemp, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { HostUsageReader, parseHostUsage } from "../../src/node/host-usage.js"

const categories = (shares: Record<string, number>) => Object.entries(shares).map(([type, percentage]) => ({ name: type, type, percentage, tokens: 0 }))

describe("parseHostUsage", () => {
  it("reads window shares per category, scaling 0–100 percentages down", () => {
    const shares = { system_prompt: 0.02, system_tools: 0.06, skills: 0.04, messages: 0.04, free_space: 0.68, auto_compact: 0.16 }
    expect(parseHostUsage({ categories: categories(shares) }, 7)).toEqual({ at: 7, used: 0.16, systemPrompt: 0.02, tools: 0.06, skills: 0.04, messages: 0.04 })
    const percent = parseHostUsage({ categories: categories({ system_prompt: 2, system_tools: 6, messages: 12, free_space: 80 }) }, 7)
    expect(percent).toMatchObject({ systemPrompt: 0.02, tools: 0.06, messages: 0.12 })
  })

  it("gives up on shapes it doesn't know", () => {
    expect(parseHostUsage(null, 1)).toBeNull()
    expect(parseHostUsage({ categories: "x" }, 1)).toBeNull()
    expect(parseHostUsage({ categories: categories({ free_space: 1 }) }, 1)).toBeNull()
    expect(parseHostUsage({ categories: [] }, 1)).toBeNull()
    expect(parseHostUsage({ categories: categories({ messages: 0.1 }) }, Number.NaN)).toBeNull()
  })
})

describe("HostUsageReader", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "qoder-context-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("reads the saved snapshot for a session and returns null for anything missing", async () => {
    const { DatabaseSync } = await import("node:sqlite")
    const file = join(root, "main.sqlite")
    const database = new DatabaseSync(file)
    database.exec("CREATE TABLE chat_session_context_usage (session_id TEXT PRIMARY KEY, snapshot_json TEXT NOT NULL, updated_at INTEGER NOT NULL)")
    const snapshot = JSON.stringify({ categories: categories({ system_prompt: 0.1, system_tools: 0.1, messages: 0.2, free_space: 0.6 }) })
    database.prepare("INSERT INTO chat_session_context_usage VALUES (?, ?, ?)").run("s1", snapshot, 42)
    database.close()

    const errors: string[] = []
    const reader = new HostUsageReader(file, (event) => errors.push(event))
    expect(await reader.read("s1")).toEqual({ at: 42, used: 0.4, systemPrompt: 0.1, tools: 0.1, skills: 0, messages: 0.2 })
    expect(await reader.read("s2")).toBeNull()
    expect(await new HostUsageReader(join(root, "none.sqlite")).read("s1")).toBeNull()
    expect(await new HostUsageReader(null).read("s1")).toBeNull()
    expect(errors).toEqual([])

    const empty = join(root, "empty.sqlite")
    new DatabaseSync(empty).close()
    expect(await new HostUsageReader(empty, (event) => errors.push(event)).read("s1")).toBeNull()
    expect(errors).toEqual(["host_usage.read_failed"])
  })
})
