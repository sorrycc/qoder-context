import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ringArcs } from "../../src/browser/charts.js"
import { contextGauge, splitPath, timeline } from "../../src/browser/session-model.js"
import { SessionDetails } from "../../src/node/session.js"
import { TranscriptLocator } from "../../src/node/transcripts.js"
import type { ContextEvent, RequestPoint, SessionDetail } from "../../src/shared/types.js"
import { assistant, human } from "./fixtures.js"

function request(prompt: number, cacheRead = 0): RequestPoint {
  return { at: 0, turn: 1, prompt, cacheRead, output: 10, model: null, tools: [] }
}

function detail(requests: RequestPoint[], overrides: { window?: number | null; events?: ContextEvent[]; truncated?: number } = {}): SessionDetail {
  return {
    summary: {
      id: "s",
      title: null,
      cwd: null,
      gitBranch: null,
      model: null,
      firstAt: 0,
      lastAt: 0,
      turns: 1,
      requests: requests.length,
      tokens: { prompt: 0, cacheRead: 0, cacheCreate: 0, output: 0 },
      contextTokens: requests.at(-1)?.prompt ?? 0,
      contextWindow: overrides.window === undefined ? 100_000 : overrides.window,
      compactions: 0,
      toolRuns: 0,
      toolErrors: 0,
      subagents: 0,
      days: [],
      tools: [],
      skills: [],
      commands: [],
    },
    requests,
    requestsTruncated: overrides.truncated ?? 0,
    events: overrides.events ?? [],
    files: [],
  }
}

const compaction = (requestIndex: number): ContextEvent => ({
  kind: "compaction",
  at: 0,
  trigger: "auto",
  preTokens: null,
  postTokens: null,
  durationMs: null,
  requestIndex,
})

describe("contextGauge", () => {
  it("splits the fill, measures headroom and estimates requests left at the recent pace", () => {
    const gauge = contextGauge(detail([request(10_000), request(20_000), request(30_000, 25_000)]))
    expect(gauge).toEqual({
      used: 30_000,
      window: 100_000,
      ratio: 0.3,
      cached: 25_000,
      uncached: 5_000,
      headroom: 70_000,
      growth: 10_000,
      requestsLeft: 7,
    })
  })

  it("only measures growth since the last compaction, offset by truncated requests", () => {
    const requests = [request(80_000), request(90_000), request(5_000), request(6_000), request(7_000)]
    expect(contextGauge(detail(requests, { events: [compaction(2)] })).growth).toBe(1_000)
    expect(contextGauge(detail(requests, { events: [compaction(12)], truncated: 10 })).growth).toBe(1_000)
    // Too few requests since the compaction to tell.
    expect(contextGauge(detail(requests, { events: [compaction(4)] })).growth).toBeNull()
  })

  it("leaves headroom and pace unknown without a window, and never estimates for a shrinking context", () => {
    const unknown = contextGauge(detail([request(1), request(2), request(3)], { window: null }))
    expect(unknown).toMatchObject({ ratio: null, headroom: null, requestsLeft: null })
    const shrinking = contextGauge(detail([request(30), request(20), request(10)]))
    expect(shrinking).toMatchObject({ growth: null, requestsLeft: null })
    expect(contextGauge(detail([request(120_000)])).headroom).toBe(0)
  })
})

describe("timeline", () => {
  it("orders newest first and folds runs of identical retries or errors", () => {
    const retry = (at: number, text = "rate limited"): ContextEvent => ({ kind: "retry", at, text, requestIndex: 1 })
    const items = timeline([retry(1), retry(2), retry(3), { ...compaction(2), at: 4 }, retry(5, "timeout"), retry(6)])
    expect(items.map((item) => [item.event.kind, item.event.at, item.count, item.firstAt])).toEqual([
      ["retry", 6, 1, 6],
      ["retry", 5, 1, 5],
      ["compaction", 4, 1, 4],
      ["retry", 3, 3, 1],
    ])
    // Keys stay put as the run grows, so a refresh doesn't remount the row.
    expect(timeline([retry(1), retry(2)])[0]?.key).toBe(timeline([retry(1)])[0]?.key)
  })
})

describe("splitPath", () => {
  it("keeps the file name and a short directory tail", () => {
    expect(splitPath("/Users/me/app/src/index.ts")).toEqual({ name: "index.ts", dir: "…/app/src" })
    expect(splitPath("src/index.ts")).toEqual({ name: "index.ts", dir: "src" })
    expect(splitPath("README.md")).toEqual({ name: "README.md", dir: "" })
  })
})

describe("ringArcs", () => {
  it("lays arcs end to end with a gap only between visible arcs, clamped to one turn", () => {
    const [cached, uncached] = ringArcs([25, 25], 100, 400)
    expect(cached).toEqual({ dash: "98 302", offset: -0, drawn: 98 })
    expect(uncached).toEqual({ dash: "98 302", offset: -100, drawn: 98 })
    expect(ringArcs([0, 50], 100, 400)[1]).toEqual({ dash: "200 200", offset: -0, drawn: 200 })
    expect(ringArcs([300, 50], 100, 400).map((arc) => arc.drawn)).toEqual([398, 0])
    expect(ringArcs([5], 0, 400)[0]?.drawn).toBe(0)
  })
})

describe("SessionDetails", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "qoder-context-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("answers unchanged for the version the caller holds until the transcript changes", async () => {
    const projects = join(root, "projects")
    await mkdir(join(projects, "-work-demo"), { recursive: true })
    const sessionId = "11111111-2222-3333-4444-555555555555"
    const file = join(projects, "-work-demo", `${sessionId}.jsonl`)
    const lines = (entries: unknown[]) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
    await writeFile(file, lines([human("go", 0), assistant("m1", 1, [], { input_tokens: 300, output_tokens: 30 })]))
    const details = new SessionDetails(new TranscriptLocator(projects))

    expect(await details.load(undefined)).toEqual({ status: "unbound" })
    expect(await details.load("99999999-2222-3333-4444-555555555555")).toEqual({ status: "missing" })
    const first = await details.load(sessionId)
    if (first.status !== "ok") throw new Error(first.status)
    expect(first.detail.summary.contextTokens).toBe(300)
    expect(await details.load(sessionId)).toBe(first)
    expect(await details.load(sessionId, first.version)).toEqual({ status: "unchanged", version: first.version })

    await writeFile(file, lines([human("go", 0), assistant("m1", 1, [], { input_tokens: 300, output_tokens: 30 }), assistant("m2", 2, [], { input_tokens: 900, output_tokens: 30 })]))
    const second = await details.load(sessionId, first.version)
    expect(second.status === "ok" && second.detail.summary.contextTokens).toBe(900)
  })
})
