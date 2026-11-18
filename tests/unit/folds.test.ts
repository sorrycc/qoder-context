import { appendFile, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { afterEach, beforeEach, describe, expect, it } from "vitest"
import { FoldCache } from "../../src/node/folds.js"
import { describe as describeFile, foldTranscript, readJsonl, TranscriptLocator } from "../../src/node/transcripts.js"
import { assistant, human, toolUse } from "./fixtures.js"

const SESSION = "11111111-2222-3333-4444-555555555555"
const line = (entry: unknown) => `${JSON.stringify(entry)}\n`

describe("readJsonl", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "qoder-context-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("stops before a half-written line and picks it up whole once it is finished", async () => {
    const file = join(root, "a.jsonl")
    const second = line({ type: "user", n: 2 })
    await writeFile(file, line({ type: "user", n: 1 }) + "not json\n" + second.slice(0, 10))
    const seen: unknown[] = []
    const mark = await readJsonl(file, (entry) => seen.push(entry))
    expect(seen).toEqual([{ type: "user", n: 1 }])
    await appendFile(file, second.slice(10))
    const next = await readJsonl(file, (entry) => seen.push(entry), mark!)
    expect(seen).toEqual([{ type: "user", n: 1 }, { type: "user", n: 2 }])
    expect(await readJsonl(file, (entry) => seen.push(entry), next!)).toEqual(next)
    expect(seen).toHaveLength(2)
  })

  it("takes a final line without a newline when it already parses", async () => {
    const file = join(root, "a.jsonl")
    await writeFile(file, JSON.stringify({ type: "user" }))
    const seen: unknown[] = []
    expect((await readJsonl(file, (entry) => seen.push(entry)))?.offset).toBe(JSON.stringify({ type: "user" }).length)
    expect(seen).toHaveLength(1)
  })

  it("reports a rewritten file instead of reading on from a stale offset", async () => {
    const file = join(root, "a.jsonl")
    await writeFile(file, line({ type: "user", n: 1 }))
    const mark = await readJsonl(file, () => undefined)
    await writeFile(file, line({ type: "user", n: 9 }) + line({ type: "user", n: 2 }))
    expect(await readJsonl(file, () => undefined, mark!)).toBeNull()
  })

  it("splits lines that span read chunks", async () => {
    const file = join(root, "a.jsonl")
    const big = { type: "user", text: "x".repeat(600_000) }
    await writeFile(file, line(big) + line({ type: "user", n: 2 }))
    const seen: unknown[] = []
    await readJsonl(file, (entry) => seen.push(entry))
    expect(seen).toEqual([big, { type: "user", n: 2 }])
  })
})

describe("FoldCache", () => {
  let root: string
  let file: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "qoder-context-"))
    file = join(root, `${SESSION}.jsonl`)
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  const current = async () => (await describeFile(file, SESSION))!

  it("folds appended entries onto the cached fold, matching a fold from scratch", async () => {
    const folds = new FoldCache()
    await writeFile(file, line(human("go", 0)) + line(assistant("m1", 1, [toolUse("t1", "Read", { file_path: "/a" })], { input_tokens: 300, output_tokens: 30 })))
    expect(await folds.use(await current(), (fold) => fold.summary().requests)).toBe(1)

    await appendFile(file, line(human("more", 2)) + line(assistant("m2", 3, [toolUse("t2", "Edit", { file_path: "/a" })], { input_tokens: 900, output_tokens: 40 })))
    await mkdir(join(root, SESSION, "subagents"), { recursive: true })
    await writeFile(join(root, SESSION, "subagents", "agent-a.jsonl"), line(assistant("s1", 4, [], { input_tokens: 50, output_tokens: 5 }, { isSidechain: true })))
    const resumed = await folds.use(await current(), (fold) => fold.detail())
    expect(resumed).toEqual((await foldTranscript(file, SESSION)).detail())
    expect(resumed.summary).toMatchObject({ requests: 3, turns: 2, contextTokens: 900, subagents: 1 })
  })

  it("credits entries appended to an earlier subagent transcript to that subagent", async () => {
    const folds = new FoldCache()
    const dir = join(root, SESSION, "subagents")
    await mkdir(dir, { recursive: true })
    await writeFile(file, line(human("go", 0)))
    await writeFile(join(dir, "agent-a.jsonl"), line(assistant("a1", 1, [], { input_tokens: 10 }, { isSidechain: true })))
    await writeFile(join(dir, "agent-b.jsonl"), line(assistant("b1", 2, [], { input_tokens: 20 }, { isSidechain: true })))
    await writeFile(join(dir, "agent-b.meta.json"), JSON.stringify({ agentType: "Plan", description: "Plan it" }))
    await folds.use(await current(), (fold) => fold.summary())

    await appendFile(join(dir, "agent-a.jsonl"), line(assistant("a2", 3, [], { input_tokens: 100 }, { isSidechain: true })))
    // A folder's mtime only moves when entries are added or removed; bump the version as a new write would.
    const resumed = await folds.use({ ...(await current()), version: "appended" }, (fold) => fold.detail())
    expect(resumed.agents.map(({ id, type, requests, tokens }) => ({ id, type, requests, tokens }))).toEqual([
      { id: "a", type: null, requests: 2, tokens: 110 },
      { id: "b", type: "Plan", requests: 1, tokens: 20 },
    ])
    expect(resumed).toEqual((await foldTranscript(file, SESSION)).detail())
  })

  it("starts over when a transcript is rewritten or a subagent transcript disappears", async () => {
    const folds = new FoldCache()
    await mkdir(join(root, SESSION, "subagents"), { recursive: true })
    const sub = join(root, SESSION, "subagents", "agent-a.jsonl")
    await writeFile(sub, line(assistant("s1", 4, [], { input_tokens: 50, output_tokens: 5 }, { isSidechain: true })))
    await writeFile(file, line(assistant("m1", 1, [], { input_tokens: 300, output_tokens: 30 })))
    await folds.use(await current(), (fold) => fold.summary())

    await writeFile(file, line(assistant("m9", 1, [], { input_tokens: 700, output_tokens: 30 })))
    expect(await folds.use({ ...(await current()), version: "rewritten" }, (fold) => fold.summary())).toMatchObject({ requests: 2, contextTokens: 700 })

    await rm(sub)
    expect(await folds.use({ ...(await current()), version: "no-sub" }, (fold) => fold.summary())).toMatchObject({ requests: 1, subagents: 0 })
  })

  it("serializes calls for one file so concurrent readers see the same complete fold", async () => {
    const folds = new FoldCache()
    await writeFile(file, line(assistant("m1", 1, [], { input_tokens: 300, output_tokens: 30 })))
    const transcript = await current()
    const counts = await Promise.all([1, 2, 3].map(() => folds.use(transcript, (fold) => fold.summary().requests)))
    expect(counts).toEqual([1, 1, 1])
  })
})

describe("TranscriptLocator.list", () => {
  let root: string

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), "qoder-context-"))
  })

  afterEach(async () => {
    await rm(root, { recursive: true, force: true })
  })

  it("reuses a folder's listing until an entry is added, and sees subagent folders created later", async () => {
    const project = join(root, "-work-demo")
    await mkdir(project, { recursive: true })
    await writeFile(join(project, `${SESSION}.jsonl`), line(human("go", 0)))
    const locator = new TranscriptLocator(root)
    const first = await locator.list(0)
    expect(first.map((file) => file.id)).toEqual([SESSION])
    expect(first[0]?.version.endsWith(":0")).toBe(true)

    const other = "22222222-2222-3333-4444-555555555555"
    await writeFile(join(project, `${other}.jsonl`), line(human("go", 0)))
    await mkdir(join(project, SESSION, "subagents"), { recursive: true })
    const second = await locator.list(0)
    expect(second.map((file) => file.id).sort()).toEqual([SESSION, other])
    expect(second.find((file) => file.id === SESSION)?.version.endsWith(":0")).toBe(false)
  })
})
