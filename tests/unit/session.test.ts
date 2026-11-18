import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { ringArcs } from "../../src/browser/charts.js"
import { createTranslate } from "../../src/browser/i18n.js"
import {
  composition,
  contextGauge,
  creditsSub,
  displayCommand,
  eventCounts,
  eventRequest,
  fileFacts,
  fleetFacts,
  fleetTree,
  promptDeltas,
  requestSeries,
  runFacts,
  seriesIndex,
  SLOW_MS,
  splitPath,
  timeline,
  timingParts,
  turnSeries,
  visibleFiles,
  visibleRuns,
} from "../../src/browser/session-model.js"
import type { HostUsageReader } from "../../src/node/host-usage.js"
import { SessionDetails } from "../../src/node/session.js"
import { TranscriptLocator } from "../../src/node/transcripts.js"
import type { CommandRun, ContextEstimate, ContextEvent, FileActivity, FleetAgent, HostUsage, RequestPoint, SessionDetail } from "../../src/shared/types.js"
import { assistant, human, toolUse } from "./fixtures.js"

function request(prompt: number, cacheRead = 0, extra: Partial<RequestPoint> = {}): RequestPoint {
  return { at: 0, turn: 1, prompt, cacheRead, output: 10, model: null, tools: [], latencyMs: null, credits: null, cause: "tools", reply: null, ...extra }
}

const NO_ESTIMATE: ContextEstimate = { user: 0, injected: 0, skills: 0, toolCalls: 0, reasoning: 0, answers: 0 }

function detail(
  requests: RequestPoint[],
  overrides: { window?: number | null; events?: ContextEvent[]; truncated?: number; estimate?: Partial<ContextEstimate>; host?: HostUsage } = {},
): SessionDetail {
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
      credits: 0,
      originalCredits: 0,
      metered: 0,
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
      dayTallies: [],
    },
    requests,
    requestsTruncated: overrides.truncated ?? 0,
    events: overrides.events ?? [],
    files: [],
    commands: [],
    commandsTruncated: 0,
    timing: { modelMs: 0, toolMs: 0, compactMs: 0, timedOutput: 0, ribbon: [] },
    prompts: [],
    estimate: { ...NO_ESTIMATE, ...overrides.estimate },
    host: overrides.host ?? null,
    models: [],
    agents: [],
  }
}

function agent(id: string, parent: string | null, firstAt: number, extra: Partial<FleetAgent> = {}): FleetAgent {
  return {
    id,
    parent,
    type: null,
    description: null,
    model: null,
    status: "done",
    requests: 1,
    tokens: 100,
    credits: 0,
    toolRuns: 0,
    contextTokens: 0,
    firstAt,
    lastAt: firstAt + 1,
    result: null,
    ...extra,
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

  it("folds repeated identical injections but keeps different ones apart", () => {
    const inject = (at: number, label: string): ContextEvent => ({ kind: "inject", at, item: "hook", label, count: null, tokens: 10, requestIndex: 0 })
    const items = timeline([inject(1, "UserPromptSubmit"), inject(2, "UserPromptSubmit"), inject(3, "SessionStart")])
    expect(items.map((item) => [item.event.at, item.count])).toEqual([
      [3, 1],
      [2, 2],
    ])
  })
})

describe("event and file filters", () => {
  it("counts events per filter group", () => {
    const error: ContextEvent = { kind: "error", at: 1, text: "x", requestIndex: 0 }
    const model: ContextEvent = { kind: "model", at: 1, from: "a", to: "b", requestIndex: 0 }
    const mode: ContextEvent = { kind: "mode", at: 1, mode: "plan", active: true, requestIndex: 0 }
    expect(eventCounts([compaction(1), error, { ...error, at: 2 }, model, mode])).toEqual({ all: 5, compaction: 1, inject: 0, switch: 2, issue: 2 })
  })

  it("splits files into edited, read-only, searched and images with line totals", () => {
    const file = (path: string, writes: number, extra: Partial<FileActivity> = {}): FileActivity => ({
      path,
      reads: 1,
      writes,
      added: 0,
      removed: 0,
      searches: 0,
      image: false,
      lastAt: 0,
      ...extra,
    })
    const files = [
      file("/a", 2, { added: 10, removed: 3 }),
      file("/b", 0),
      file("/c", 1, { added: 1 }),
      file("/d.png", 0, { image: true }),
      file("/e", 0, { reads: 0, searches: 3 }),
    ]
    expect(fileFacts(files)).toEqual({ counts: { all: 5, edited: 2, read: 2, searched: 1, images: 1 }, added: 11, removed: 3 })
    expect(visibleFiles(files, "edited").map((f) => f.path)).toEqual(["/a", "/c"])
    expect(visibleFiles(files, "read").map((f) => f.path)).toEqual(["/b", "/d.png"])
    expect(visibleFiles(files, "searched").map((f) => f.path)).toEqual(["/e"])
    expect(visibleFiles(files, "images").map((f) => f.path)).toEqual(["/d.png"])
    expect(visibleFiles(files, "all")).toBe(files)
  })
})

describe("trend series", () => {
  it("folds requests into one column per turn, keeping the last prompt and summing the rest", () => {
    const requests = [
      request(100, 0, { turn: 1, cause: "prompt", tools: ["Read"], latencyMs: 5, credits: 0.5 }),
      request(150, 0, { turn: 1, tools: ["Edit"], latencyMs: null, credits: null, reply: "done" }),
      request(90, 0, { turn: 2, cause: "prompt" }),
    ]
    const series = turnSeries(requests)
    expect(series.points.map((point) => [point.turn, point.prompt, point.output, point.cause, point.reply])).toEqual([
      [1, 150, 20, "prompt", "done"],
      [2, 90, 10, "prompt", null],
    ])
    expect(series.points[0]).toMatchObject({ tools: ["Read", "Edit"], latencyMs: 5, credits: 0.5 })
    expect([series.first, series.last]).toEqual([
      [0, 2],
      [1, 2],
    ])
    expect([seriesIndex(series, 1), seriesIndex(series, 2), seriesIndex(series, 3)]).toEqual([0, 1, null])
    const flat = requestSeries(requests)
    expect(flat.points).toBe(requests)
    expect(seriesIndex(flat, 2)).toBe(2)
  })
})

describe("composition", () => {
  it("gives the system prompt and tools what the estimates leave of the prompt", () => {
    const parts = composition(detail([request(10_000)], { estimate: { user: 1_000, toolCalls: 3_000, skills: 500 } }))
    expect(parts.source).toBe("estimate")
    expect(parts.parts).toEqual([
      { key: "system", tokens: 5_500 },
      { key: "skills", tokens: 500 },
      { key: "user", tokens: 1_000 },
      { key: "toolCalls", tokens: 3_000 },
    ])
  })

  it("scales estimates that overshoot the prompt down to fit it", () => {
    const parts = composition(detail([request(1_000)], { estimate: { user: 1_000, answers: 1_000 } }))
    expect(parts.parts).toEqual([
      { key: "user", tokens: 500 },
      { key: "answers", tokens: 500 },
    ])
  })

  it("sizes the system prompt, tools and skills from Qoder's meter and spreads the rest over the estimates", () => {
    const host: HostUsage = { at: 1, used: 0.1, systemPrompt: 0.02, tools: 0.03, skills: 0.01, messages: 0.04 }
    const parts = composition(detail([request(10_000)], { window: 100_000, host, estimate: { user: 1_000, toolCalls: 1_000, skills: 9_999 } }))
    expect(parts.source).toBe("host")
    expect(parts.parts).toEqual([
      { key: "systemPrompt", tokens: 2_000 },
      { key: "tools", tokens: 3_000 },
      { key: "skills", tokens: 1_000 },
      { key: "user", tokens: 1_000 },
      { key: "toolCalls", tokens: 1_000 },
    ])
    // Without estimates the rest is plain messages; without a window the meter can't be sized.
    expect(composition(detail([request(10_000)], { window: 100_000, host })).parts.at(-1)).toEqual({ key: "messages", tokens: 4_000 })
    expect(composition(detail([request(10_000)], { window: null, host })).source).toBe("estimate")
    expect(composition(detail([])).parts).toEqual([])
  })
})

describe("fleet", () => {
  it("nests subagents under their launcher in launch order, keeping orphans and cycles visible", () => {
    const agents = [agent("b", null, 2), agent("a", null, 1), agent("a1", "a", 3), agent("a1x", "a1", 4), agent("lost", "gone", 5), agent("self", "self", 6)]
    expect(fleetTree(agents).map((row) => `${row.agent.id}:${row.depth}`)).toEqual(["a:0", "a1:1", "a1x:2", "b:0", "lost:0", "self:0"])
  })

  it("counts agents by status and sums their tokens and credits", () => {
    const facts = fleetFacts([agent("a", null, 1, { status: "running", credits: 1.5 }), agent("b", null, 2, { status: "failed", credits: 0.5 })])
    expect(facts).toEqual({ counts: { running: 1, done: 0, failed: 1, stopped: 0, unknown: 0 }, tokens: 200, credits: 2 })
  })
})

describe("creditsSub", () => {
  const t = createTranslate("en")
  it("names unmetered requests first, then the discount", () => {
    expect(creditsSub(0, 0, 0, 0, t)).toBeUndefined()
    expect(creditsSub(0, 0, 0, 4, t)).toBe("Not metered")
    expect(creditsSub(1, 1, 1, 4, t)).toBe("1 of 4 requests metered")
    expect(creditsSub(1, 1, 2, 2_588, t)).toBe("2 of 2,588 requests metered")
    expect(creditsSub(1, 2, 4, 4, t)).toBe("2 before discounts")
    expect(creditsSub(1, 1, 4, 4, t)).toBeUndefined()
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

  it("labels subagents from their meta files, takes status from task files and adds Qoder's meter", async () => {
    const projects = join(root, "projects")
    const sessionId = "11111111-2222-3333-4444-555555555555"
    const subagents = join(projects, "-work-demo", sessionId, "subagents")
    await mkdir(subagents, { recursive: true })
    const lines = (entries: unknown[]) => entries.map((entry) => JSON.stringify(entry)).join("\n") + "\n"
    await writeFile(
      join(projects, "-work-demo", `${sessionId}.jsonl`),
      lines([human("go", 0), assistant("m1", 1, [toolUse("call-1", "Agent", { prompt: "look" })], { input_tokens: 300, output_tokens: 30 })]),
    )
    await writeFile(join(subagents, "agent-aExplore-1.jsonl"), lines([assistant("s1", 2, [], { input_tokens: 200, output_tokens: 20, credits: 0.25 })]))
    await writeFile(join(subagents, "agent-aExplore-1.meta.json"), JSON.stringify({ agentType: "Explore", description: "Find it", toolUseId: "call-1" }))
    await writeFile(join(subagents, "task-1.json"), JSON.stringify({ agentId: "aExplore-1", status: "failed", resolvedModel: "ultimate", result: "  Gave\nup  " }))
    await writeFile(join(subagents, "task-broken.json"), "{")
    const meter: HostUsage = { at: 5, used: 0.1, systemPrompt: 0.02, tools: 0.03, skills: 0.01, messages: 0.04 }
    const host = { read: async (id: string) => (id === sessionId ? meter : null) } as unknown as HostUsageReader
    const loaded = await new SessionDetails(new TranscriptLocator(projects), undefined, host).load(sessionId)
    if (loaded.status !== "ok") throw new Error(loaded.status)
    expect(loaded.detail.host).toEqual(meter)
    expect(loaded.detail.agents).toEqual([
      expect.objectContaining({ id: "aExplore-1", parent: null, type: "Explore", description: "Find it", status: "failed", model: "dfmodel", result: "Gave up", credits: 0.25 }),
    ])
  })
})

describe("command runs", () => {
  const run = (overrides: Partial<CommandRun>): CommandRun => ({
    id: "r",
    command: "ls",
    programs: ["ls"],
    at: 0,
    durationMs: 100,
    status: "ok",
    exitCode: 0,
    requestIndex: 0,
    turn: 1,
    subagent: false,
    ...overrides,
  })

  it("drops a leading cd into the session folder only", () => {
    expect(displayCommand("cd /w/app && npm test", "/w/app")).toBe("npm test")
    expect(displayCommand('cd "/w/app"; ls', "/w/app")).toBe("ls")
    expect(displayCommand("cd /w/other && ls", "/w/app")).toBe("cd /w/other && ls")
    expect(displayCommand("cd /w/app && ", "/w/app")).toBe("cd /w/app && ")
    expect(displayCommand("ls", null)).toBe("ls")
  })

  it("counts failures, slow and background runs and finds the slowest and the last failure", () => {
    const runs = [
      run({ id: "a", at: 1, durationMs: SLOW_MS }),
      run({ id: "b", at: 2, status: "failed", exitCode: 1, durationMs: 50 }),
      run({ id: "c", at: 3, status: "background", durationMs: 60_000 }),
      run({ id: "d", at: 4, status: "running", durationMs: null }),
      run({ id: "e", at: 5, status: "failed", exitCode: 2, durationMs: 20 }),
    ]
    const facts = runFacts(runs)
    expect(facts.counts).toEqual({ all: 5, failed: 2, slow: 1, background: 1 })
    expect(facts.settled).toBe(3)
    expect(facts.totalMs).toBe(SLOW_MS + 70)
    expect(facts.slowest?.id).toBe("a")
    expect(facts.lastFailure?.id).toBe("e")
  })

  it("filters by kind, program and search, newest or slowest first", () => {
    const runs = [
      run({ id: "a", command: "npm test", programs: ["npm"], durationMs: 300 }),
      run({ id: "b", command: "git status", programs: ["git"], durationMs: 900 }),
      run({ id: "c", command: "npm run build", programs: ["npm"], status: "failed", durationMs: 100 }),
    ]
    const ids = (options: Partial<Parameters<typeof visibleRuns>[1]>) =>
      visibleRuns(runs, { filter: "all", program: null, query: "", sort: "latest", ...options }).map((item) => item.id)
    expect(ids({})).toEqual(["c", "b", "a"])
    expect(ids({ sort: "slowest" })).toEqual(["b", "a", "c"])
    expect(ids({ program: "npm" })).toEqual(["c", "a"])
    expect(ids({ filter: "failed" })).toEqual(["c"])
    expect(ids({ query: "NPM te" })).toEqual(["a"])
  })
})

describe("trend helpers", () => {
  it("maps an event to the request after it, or the last one, within the shown window", () => {
    expect(eventRequest(compaction(5), 2, 10)).toBe(3)
    expect(eventRequest(compaction(15), 2, 10)).toBe(9)
    expect(eventRequest(compaction(1), 2, 10)).toBeNull()
    expect(eventRequest(compaction(0), 0, 0)).toBeNull()
  })

  it("measures each request's prompt change", () => {
    expect(promptDeltas([request(100), request(250), request(40)])).toEqual([null, 150, -210])
  })

  it("splits active time into shares and an output rate over model time", () => {
    const parts = timingParts({ modelMs: 6_000, toolMs: 3_000, compactMs: 0, timedOutput: 600, ribbon: [] })
    expect(parts.activeMs).toBe(9_000)
    expect(parts.parts.map((part) => [part.kind, part.share])).toEqual([
      ["model", 6_000 / 9_000],
      ["tool", 3_000 / 9_000],
    ])
    expect(parts.rate).toBe(100)
    expect(timingParts({ modelMs: 500, toolMs: 0, compactMs: 0, timedOutput: 10, ribbon: [] }).rate).toBeNull()
  })
})
