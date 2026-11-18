import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { DAY_MS, lastDays, localDay, rangeDays } from "../shared/days.js"
import type { DayBucket, Overview, OverviewResponse, Range, SessionCard, SessionSummary, Tally, WorkspaceTally } from "../shared/types.js"
import { roundCredits } from "./fold.js"
import { FoldCache } from "./folds.js"
import { mapLimit, type TranscriptLocator } from "./transcripts.js"

export const HEATMAP_DAYS = 56
const CACHE_VERSION = 6
const CACHE_ENTRY_LIMIT = 3_000
const SESSION_CARD_LIMIT = 300
const TALLY_LIMIT = 24
/** Per-day tallies ride along with every overview, for every heatmap day, so they're kept short. */
const DAY_TALLY_LIMIT = 12
const FOLD_CONCURRENCY = 4

interface CacheEntry {
  readonly version: string
  readonly summary: SessionSummary
}

interface Scan {
  readonly summaries: SessionSummary[]
  readonly scanned: number
  /** Changes whenever any scanned transcript does. */
  readonly signature: string
}

/**
 * Keeps one folded summary per transcript, keyed by file and its size/mtime version, so
 * a refresh only re-reads the transcripts that changed since the last scan, and only their
 * appended part while their fold is still in the shared FoldCache.
 */
export class OverviewIndex {
  private readonly entries = new Map<string, CacheEntry>()
  private loaded: Promise<void> | null = null
  private scanning: Promise<Scan> | null = null

  constructor(
    private readonly locator: TranscriptLocator,
    private readonly cacheFile: string,
    private readonly onError: (event: string, error: unknown) => void = () => undefined,
    private readonly folds = new FoldCache(),
  ) {}

  async overview(range: Range, now = Date.now()): Promise<Overview> {
    const { summaries, scanned } = await this.scan(now)
    return aggregate(summaries, range, now, scanned)
  }

  /**
   * The overview for `range`, or `unchanged` when the caller already holds `known`: the same range
   * on the same local day over the same transcript versions, so the view keeps its objects and skips
   * the transfer and the re-render.
   */
  async load(range: Range, known?: unknown, now = Date.now()): Promise<OverviewResponse> {
    const { summaries, scanned, signature } = await this.scan(now)
    const version = `${range}:${localDay(now)}:${signature}`
    if (known === version) return { status: "unchanged", version }
    return { status: "ok", version, overview: aggregate(summaries, range, now, scanned) }
  }

  /** Cached summary for one session when the transcript has not changed since the last scan. */
  cached(file: string, version: string): SessionSummary | null {
    const entry = this.entries.get(file)
    return entry?.version === version ? entry.summary : null
  }

  private scan(now: number) {
    this.scanning ??= this.runScan(now).finally(() => {
      this.scanning = null
    })
    return this.scanning
  }

  private async runScan(now: number): Promise<Scan> {
    this.loaded ??= this.restore()
    await this.loaded
    const files = await this.locator.list(now - HEATMAP_DAYS * DAY_MS)
    let changed = false
    const summaries: SessionSummary[] = []
    const live = new Set<string>()
    await mapLimit(files, FOLD_CONCURRENCY, async (transcript) => {
      live.add(transcript.file)
      const hit = this.entries.get(transcript.file)
      if (hit?.version === transcript.version) {
        summaries.push(hit.summary)
        return
      }
      try {
        const summary = await this.folds.use(transcript, (fold) => fold.summary())
        this.entries.set(transcript.file, { version: transcript.version, summary })
        summaries.push(summary)
        changed = true
      } catch (error) {
        this.onError("fold.failed", error)
      }
    })
    for (const file of [...this.entries.keys()]) {
      if (!live.has(file)) {
        this.entries.delete(file)
        changed = true
      }
    }
    if (changed) await this.persist()
    const versions = files.map((file) => `${file.file}\0${file.version}`).sort()
    return { summaries, scanned: files.length, signature: `${files.length}.${hash(versions.join("\n"))}` }
  }

  private async restore(): Promise<void> {
    try {
      const parsed = JSON.parse(await readFile(this.cacheFile, "utf8")) as {
        version?: number
        entries?: [string, CacheEntry][]
      }
      if (parsed.version !== CACHE_VERSION || !Array.isArray(parsed.entries)) return
      for (const [file, entry] of parsed.entries.slice(0, CACHE_ENTRY_LIMIT)) this.entries.set(file, entry)
    } catch {
      // A missing or unreadable cache only costs one full scan.
    }
  }

  private async persist(): Promise<void> {
    const entries = [...this.entries]
      .sort((a, b) => b[1].summary.lastAt - a[1].summary.lastAt)
      .slice(0, CACHE_ENTRY_LIMIT)
    try {
      await mkdir(dirname(this.cacheFile), { recursive: true })
      const temporary = `${this.cacheFile}.tmp`
      await writeFile(temporary, JSON.stringify({ version: CACHE_VERSION, entries }))
      await rename(temporary, this.cacheFile)
    } catch (error) {
      this.onError("cache.write_failed", error)
    }
  }
}

type TallyTotals = Map<string, { count: number; lastAt: number }>
type DayTallyTotals = Record<"tools" | "skills" | "commands", TallyTotals>

export function aggregate(summaries: readonly SessionSummary[], range: Range, now: number, scanned = summaries.length): Overview {
  const inRange = new Set(lastDays(rangeDays(range), now))
  const weekDays = lastDays(7, now)
  const heatDays = lastDays(HEATMAP_DAYS, now)
  const onHeatmap = new Set(heatDays)
  const byDay = new Map<string, Omit<DayBucket, "day">>()
  const kpi = { sessions: 0, tokens: 0, turns: 0, requests: 0, toolRuns: 0, activeMs: 0, shellRuns: 0, shellFailures: 0, credits: 0, metered: 0 }
  const composition = { cacheRead: 0, uncached: 0, output: 0 }
  const rangeTallies: DayTallyTotals = { tools: new Map(), skills: new Map(), commands: new Map() }
  const tallyDays = new Map<string, DayTallyTotals>()
  const workspaces = new Map<string, { sessions: number; tokens: number; credits: number; activeMs: number; lastAt: number }>()
  const cards: SessionCard[] = []
  let prompt = 0

  for (const summary of summaries) {
    for (const bucket of summary.days) byDay.set(bucket.day, addBucket(byDay.get(bucket.day) ?? emptyTotals(), bucket))
    // Tallies are counted on the day each run happened, so the range and a picked day are exact.
    for (const tallies of summary.dayTallies) {
      if (!onHeatmap.has(tallies.day)) continue
      let day = tallyDays.get(tallies.day)
      if (!day) {
        day = { tools: new Map(), skills: new Map(), commands: new Map() }
        tallyDays.set(tallies.day, day)
      }
      for (const kind of TALLY_KINDS) {
        merge(day[kind], tallies[kind])
        if (inRange.has(tallies.day)) merge(rangeTallies[kind], tallies[kind])
      }
    }
    const active = summary.days.filter((bucket) => inRange.has(bucket.day))
    if (active.length === 0) continue
    kpi.sessions += 1
    const own = emptyTotals()
    for (const bucket of active) addBucket(own, bucket)
    kpi.tokens += own.tokens
    kpi.requests += own.requests
    kpi.turns += own.turns
    kpi.toolRuns += own.toolRuns
    kpi.activeMs += own.activeMs
    kpi.shellRuns += own.shellRuns
    kpi.shellFailures += own.shellFailures
    kpi.credits += own.credits
    kpi.metered += own.metered
    if (summary.cwd) {
      const workspace = workspaces.get(summary.cwd) ?? { sessions: 0, tokens: 0, credits: 0, activeMs: 0, lastAt: 0 }
      workspace.sessions += 1
      workspace.tokens += own.tokens
      workspace.credits += own.credits
      workspace.activeMs += own.activeMs
      workspace.lastAt = Math.max(workspace.lastAt, summary.lastAt)
      workspaces.set(summary.cwd, workspace)
    }
    prompt += summary.tokens.prompt
    composition.cacheRead += summary.tokens.cacheRead
    composition.uncached += Math.max(0, summary.tokens.prompt - summary.tokens.cacheRead)
    composition.output += summary.tokens.output
    cards.push(toCard(summary))
  }

  cards.sort((a, b) => b.lastAt - a.lastAt)
  return {
    range,
    generatedAt: now,
    scannedFiles: scanned,
    kpi: { ...kpi, credits: roundCredits(kpi.credits), cacheHitRate: prompt > 0 ? composition.cacheRead / prompt : null },
    week: weekDays.map((day) => {
      const bucket = byDay.get(day) ?? emptyTotals()
      return { day, ...bucket, credits: roundCredits(bucket.credits) }
    }),
    heatmap: heatDays.map((day) => ({ day, tokens: byDay.get(day)?.tokens ?? 0, requests: byDay.get(day)?.requests ?? 0 })),
    composition,
    tools: topTallies(rangeTallies.tools),
    skills: topTallies(rangeTallies.skills),
    commands: topTallies(rangeTallies.commands),
    dayTallies: Object.fromEntries(
      [...tallyDays].map(([day, tallies]) => [
        day,
        { tools: topTallies(tallies.tools, DAY_TALLY_LIMIT), skills: topTallies(tallies.skills, DAY_TALLY_LIMIT), commands: topTallies(tallies.commands, DAY_TALLY_LIMIT) },
      ]),
    ),
    workspaces: [...workspaces]
      .map(([path, entry]): WorkspaceTally => ({ path, ...entry, credits: roundCredits(entry.credits) }))
      .sort((a, b) => b.tokens - a.tokens || b.lastAt - a.lastAt)
      .slice(0, TALLY_LIMIT),
    sessions: cards.slice(0, SESSION_CARD_LIMIT),
    sessionsTruncated: Math.max(0, cards.length - SESSION_CARD_LIMIT),
  }
}

/** cyrb53: a fast 53-bit string hash, enough to tell scans apart. */
export function hash(text: string): string {
  let h1 = 0xdeadbeef
  let h2 = 0x41c6ce57
  for (let index = 0; index < text.length; index += 1) {
    const code = text.charCodeAt(index)
    h1 = Math.imul(h1 ^ code, 2654435761)
    h2 = Math.imul(h2 ^ code, 1597334677)
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909)
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909)
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36)
}

const TALLY_KINDS = ["tools", "skills", "commands"] as const

function emptyTotals(): { -readonly [K in Exclude<keyof DayBucket, "day">]: number } {
  return { tokens: 0, requests: 0, credits: 0, metered: 0, turns: 0, toolRuns: 0, activeMs: 0, shellRuns: 0, shellFailures: 0 }
}

/** Adds `bucket` into `total`. */
function addBucket(total: ReturnType<typeof emptyTotals>, bucket: DayBucket): ReturnType<typeof emptyTotals> {
  for (const key of Object.keys(total) as (keyof typeof total)[]) total[key] += bucket[key]
  return total
}

function toCard(summary: SessionSummary): SessionCard {
  return {
    id: summary.id,
    title: summary.title,
    cwd: summary.cwd,
    lastAt: summary.lastAt,
    tokens: summary.tokens.prompt + summary.tokens.output,
    turns: summary.turns,
    requests: summary.requests,
    contextTokens: summary.contextTokens,
    contextWindow: summary.contextWindow,
    cacheRead: summary.tokens.cacheRead,
    prompt: summary.tokens.prompt,
    output: summary.tokens.output,
    credits: summary.credits,
    metered: summary.metered,
    days: summary.days.map((bucket) => bucket.day),
    tools: summary.tools.map((tally) => tally.name),
    skills: summary.skills.map((tally) => tally.name),
    commands: summary.commands.map((tally) => tally.name),
  }
}

function merge(target: TallyTotals, tallies: readonly Tally[]): void {
  for (const tally of tallies) {
    const entry = target.get(tally.name)
    if (entry) {
      entry.count += tally.count
      entry.lastAt = Math.max(entry.lastAt, tally.lastAt)
    } else {
      target.set(tally.name, { count: tally.count, lastAt: tally.lastAt })
    }
  }
}

function topTallies(source: TallyTotals, limit = TALLY_LIMIT): Tally[] {
  return [...source]
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, limit)
}
