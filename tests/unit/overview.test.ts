import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { aggregate, OverviewIndex } from "../../src/node/overview.js"
import { TranscriptLocator, resolveProjectsRoot } from "../../src/node/transcripts.js"
import { localDay } from "../../src/shared/days.js"
import type { SessionSummary } from "../../src/shared/types.js"
import { assistant, human, T0, toolUse } from "./fixtures.js"

const DAY = 86_400_000

function summary(id: string, days: { day: string; tokens: number }[], extra: Partial<SessionSummary> = {}): SessionSummary {
  return {
    id,
    title: id,
    cwd: "/work",
    gitBranch: null,
    model: null,
    firstAt: T0,
    lastAt: T0,
    turns: 1,
    requests: 1,
    tokens: { prompt: 100, cacheRead: 60, cacheCreate: 0, output: 10 },
    contextTokens: 100,
    contextWindow: 1_000,
    compactions: 0,
    toolRuns: 0,
    toolErrors: 0,
    subagents: 0,
    days: days.map((bucket) => ({ ...bucket, requests: 1, turns: 1, toolRuns: 2 })),
    tools: [{ name: "Bash", count: 2, lastAt: T0 }],
    skills: [],
    commands: [],
    ...extra,
  }
}

describe("aggregate", () => {
  it("counts only buckets inside the range while week and heatmap cover all sessions", () => {
    const today = localDay(T0)
    const old = localDay(T0 - 10 * DAY)
    const overview = aggregate(
      [summary("recent", [{ day: today, tokens: 50 }, { day: old, tokens: 7 }]), summary("old", [{ day: old, tokens: 9 }])],
      "7d",
      T0,
    )
    expect(overview.kpi.sessions).toBe(1)
    expect(overview.kpi.tokens).toBe(50)
    expect(overview.kpi.toolRuns).toBe(2)
    expect(overview.kpi.cacheHitRate).toBeCloseTo(0.6)
    expect(overview.week.at(-1)).toMatchObject({ day: today, tokens: 50 })
    expect(overview.heatmap.find((cell) => cell.day === old)).toMatchObject({ tokens: 16, requests: 2 })
    expect(overview.sessions.map((card) => card.id)).toEqual(["recent"])
    expect(overview.tools).toEqual([{ name: "Bash", count: 2, lastAt: T0 }])
  })

  it("returns no cache-hit rate when nothing is in range", () => {
    expect(aggregate([], "today", T0).kpi.cacheHitRate).toBeNull()
  })
})

describe("OverviewIndex", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "qoder-context-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("folds transcripts with their subagents and reuses the cache until a file changes", async () => {
    const projects = join(root, "projects")
    const project = join(projects, "-work-demo")
    const sessionId = "11111111-2222-3333-4444-555555555555"
    await mkdir(join(project, sessionId, "subagents"), { recursive: true })
    const lines = (entries: unknown[]) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
    // Local noon, so "today" holds the entries whatever time the suite runs.
    const now = new Date().setHours(12, 0, 0, 0)
    const minute = (offset: number) => (now - T0) / 60_000 - offset
    await writeFile(
      join(project, `${sessionId}.jsonl`),
      lines([human("go", minute(5)), assistant("m1", minute(4), [toolUse("t1", "Read", { file_path: "/a" })], { input_tokens: 300, output_tokens: 30 })]),
    )
    await writeFile(
      join(project, sessionId, "subagents", "agent-a.jsonl"),
      lines([assistant("s1", minute(3), [], { input_tokens: 200, output_tokens: 20 }, { isSidechain: true })]),
    )
    const index = new OverviewIndex(new TranscriptLocator(projects), join(root, "storage", "cache.json"))
    const first = await index.overview("today", now)
    expect(first.kpi).toMatchObject({ sessions: 1, tokens: 550, turns: 1, requests: 2, toolRuns: 1 })
    expect(first.sessions[0]).toMatchObject({ id: sessionId, contextTokens: 300 })

    const reloaded = new OverviewIndex(new TranscriptLocator(projects), join(root, "storage", "cache.json"))
    expect((await reloaded.overview("today", now)).kpi.tokens).toBe(550)
  })

  it("resolves the product's config root, honouring the explicit override", () => {
    expect(resolveProjectsRoot("qoder", {}, "/home/u")).toBe("/home/u/.qoder/projects")
    expect(resolveProjectsRoot("qoder-cn", {}, "/home/u")).toBe("/home/u/.qoder-cn/projects")
    expect(resolveProjectsRoot("qoder", { QODER_CONFIG_DIR: "/custom" }, "/home/u")).toBe("/custom/projects")
  })
})
