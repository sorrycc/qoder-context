import { mkdir, readFile, rename, writeFile } from "node:fs/promises"
import { dirname } from "node:path"
import { DAY_MS, lastDays, rangeDays } from "../shared/days.js"
import type { DayBucket, Overview, Range, SessionCard, SessionSummary, Tally } from "../shared/types.js"
import { foldTranscript, mapLimit, type TranscriptLocator } from "./transcripts.js"

export const HEATMAP_DAYS = 56
const CACHE_VERSION = 4
const CACHE_ENTRY_LIMIT = 3_000
const SESSION_CARD_LIMIT = 300
const TALLY_LIMIT = 12
const FOLD_CONCURRENCY = 4

interface CacheEntry {
  readonly version: string
  readonly summary: SessionSummary
}

/**
 * Keeps one folded summary per transcript, keyed by file and its size/mtime version, so
 * a refresh only re-reads the transcripts that changed since the last scan.
 */
export class OverviewIndex {
  private readonly entries = new Map<string, CacheEntry>()
  private loaded: Promise<void> | null = null
  private scanning: Promise<{ summaries: SessionSummary[]; scanned: number }> | null = null

  constructor(
    private readonly locator: TranscriptLocator,
    private readonly cacheFile: string,
    private readonly onError: (event: string, error: unknown) => void = () => undefined,
  ) {}

  async overview(range: Range, now = Date.now()): Promise<Overview> {
    const { summaries, scanned } = await this.scan(now)
    return aggregate(summaries, range, now, scanned)
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

  private async runScan(now: number) {
    this.loaded ??= this.load()
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
        const summary = (await foldTranscript(transcript.file, transcript.id)).summary()
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
    return { summaries, scanned: files.length }
  }

  private async load(): Promise<void> {
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

export function aggregate(summaries: readonly SessionSummary[], range: Range, now: number, scanned = summaries.length): Overview {
  const inRange = new Set(lastDays(rangeDays(range), now))
  const weekDays = lastDays(7, now)
  const heatDays = lastDays(HEATMAP_DAYS, now)
  const byDay = new Map<string, { tokens: number; requests: number; turns: number; toolRuns: number }>()
  const kpi = { sessions: 0, tokens: 0, turns: 0, requests: 0, toolRuns: 0 }
  const composition = { cacheRead: 0, uncached: 0, output: 0 }
  const tools = new Map<string, { count: number; lastAt: number }>()
  const skills = new Map<string, { count: number; lastAt: number }>()
  const commands = new Map<string, { count: number; lastAt: number }>()
  const cards: SessionCard[] = []
  let prompt = 0

  for (const summary of summaries) {
    for (const bucket of summary.days) {
      const total = byDay.get(bucket.day) ?? { tokens: 0, requests: 0, turns: 0, toolRuns: 0 }
      total.tokens += bucket.tokens
      total.requests += bucket.requests
      total.turns += bucket.turns
      total.toolRuns += bucket.toolRuns
      byDay.set(bucket.day, total)
    }
    const active = summary.days.filter((bucket) => inRange.has(bucket.day))
    if (active.length === 0) continue
    kpi.sessions += 1
    for (const bucket of active) {
      kpi.tokens += bucket.tokens
      kpi.requests += bucket.requests
      kpi.turns += bucket.turns
      kpi.toolRuns += bucket.toolRuns
    }
    prompt += summary.tokens.prompt
    composition.cacheRead += summary.tokens.cacheRead
    composition.uncached += Math.max(0, summary.tokens.prompt - summary.tokens.cacheRead)
    composition.output += summary.tokens.output
    merge(tools, summary.tools)
    merge(skills, summary.skills)
    merge(commands, summary.commands)
    cards.push(toCard(summary))
  }

  cards.sort((a, b) => b.lastAt - a.lastAt)
  const empty = (day: string): DayBucket => ({ day, tokens: 0, requests: 0, turns: 0, toolRuns: 0 })
  return {
    range,
    generatedAt: now,
    scannedFiles: scanned,
    kpi: { ...kpi, cacheHitRate: prompt > 0 ? composition.cacheRead / prompt : null },
    week: weekDays.map((day) => {
      const bucket = byDay.get(day)
      return bucket ? { day, ...bucket } : empty(day)
    }),
    heatmap: heatDays.map((day) => ({ day, tokens: byDay.get(day)?.tokens ?? 0, requests: byDay.get(day)?.requests ?? 0 })),
    composition,
    tools: topTallies(tools),
    skills: topTallies(skills),
    commands: topTallies(commands),
    sessions: cards.slice(0, SESSION_CARD_LIMIT),
    sessionsTruncated: Math.max(0, cards.length - SESSION_CARD_LIMIT),
  }
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
    days: summary.days.map((bucket) => bucket.day),
    tools: summary.tools.map((tally) => tally.name),
    skills: summary.skills.map((tally) => tally.name),
    commands: summary.commands.map((tally) => tally.name),
  }
}

function merge(target: Map<string, { count: number; lastAt: number }>, tallies: readonly Tally[]): void {
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

function topTallies(source: Map<string, { count: number; lastAt: number }>): Tally[] {
  return [...source]
    .map(([name, entry]) => ({ name, ...entry }))
    .sort((a, b) => b.count - a.count || b.lastAt - a.lastAt)
    .slice(0, TALLY_LIMIT)
}
