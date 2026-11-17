import type { CommandRun, ContextEvent, RequestPoint, SessionDetail, TimingStats } from "../shared/types.js"
import { searchTerms } from "./lists.js"

/** Requests looked back over to estimate how fast the context grows. */
const GROWTH_SPAN = 20

export interface Gauge {
  readonly used: number
  readonly window: number | null
  /** used / window, or null when the window is unknown. */
  readonly ratio: number | null
  readonly cached: number
  readonly uncached: number
  /** Tokens left before the window is full, or null when the window is unknown. */
  readonly headroom: number | null
  /** Average prompt growth per request since the last compaction, when it grows at all. */
  readonly growth: number | null
  /** Requests left at that pace, or null when either side is unknown. */
  readonly requestsLeft: number | null
}

/** What the window holds now, how much is left and, at the recent pace, for how many requests. */
export function contextGauge(detail: SessionDetail): Gauge {
  const { summary, requests, events } = detail
  const used = summary.contextTokens
  const window = summary.contextWindow && summary.contextWindow > 0 ? summary.contextWindow : null
  const last = requests.at(-1)
  const cached = last && last.prompt === used ? Math.min(last.cacheRead, used) : 0
  const headroom = window === null ? null : Math.max(0, window - used)

  // Only requests after the last compaction describe the current fill.
  const compaction = events.findLast((event) => event.kind === "compaction")
  const since = compaction ? Math.max(0, compaction.requestIndex - detail.requestsTruncated) : 0
  const span = requests.slice(Math.max(since, requests.length - GROWTH_SPAN - 1))
  const first = span[0]
  const growth = first && last && span.length >= 3 ? (last.prompt - first.prompt) / (span.length - 1) : 0
  const pace = growth >= 1 ? growth : null

  return {
    used,
    window,
    ratio: window === null ? null : used / window,
    cached,
    uncached: Math.max(0, used - cached),
    headroom,
    growth: pace,
    requestsLeft: pace === null || headroom === null ? null : Math.floor(headroom / pace),
  }
}

export interface TimelineItem {
  readonly key: string
  readonly event: ContextEvent
  /** How many identical retries or errors in a row this item stands for. */
  readonly count: number
  /** When the first of those happened; `event.at` is the latest. */
  readonly firstAt: number
}

/** Newest-first events, with runs of identical retries or errors folded into one item. */
export function timeline(events: readonly ContextEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const event of events) {
    const previous = items.at(-1)
    if (previous && event.kind !== "compaction" && previous.event.kind === event.kind && previous.event.text === event.text) {
      items[items.length - 1] = { ...previous, event, count: previous.count + 1 }
      continue
    }
    items.push({ key: `${event.kind}-${event.at}-${items.length}`, event, count: 1, firstAt: event.at })
  }
  return items.reverse()
}

/** A path's last segment and the one or two directories above it, for compact file rows. */
export function splitPath(path: string): { readonly name: string; readonly dir: string } {
  const parts = path.split(/[/\\]/).filter(Boolean)
  const name = parts.at(-1) ?? path
  const dir = parts.slice(-3, -1).join("/")
  return { name, dir: parts.length > 3 ? `…/${dir}` : dir }
}

/** Index in `requests` of the request an event led into: the first one after it, else the last. */
export function eventRequest(event: ContextEvent, offset: number, count: number): number | null {
  const index = event.requestIndex - offset
  if (count === 0 || index < 0) return null
  return Math.min(index, count - 1)
}

/** Each request's change in prompt size since the previous one; null for the first shown. */
export function promptDeltas(requests: readonly RequestPoint[]): (number | null)[] {
  return requests.map((request, index) => (index === 0 ? null : request.prompt - requests[index - 1]!.prompt))
}

/** The command without a leading `cd` into the session's own folder, which most runs start with. */
export function displayCommand(command: string, cwd: string | null): string {
  if (!cwd) return command
  for (const quoted of [cwd, `"${cwd}"`, `'${cwd}'`]) {
    for (const join of [" && ", "; "]) {
      const prefix = `cd ${quoted}${join}`
      if (command.startsWith(prefix) && command.length > prefix.length) return command.slice(prefix.length).trimStart()
    }
  }
  return command
}

/** A completed run at least this long counts as slow. */
export const SLOW_MS = 10_000

export type RunFilter = "all" | "failed" | "slow" | "background"
export type RunSort = "latest" | "slowest"

export function isSlow(run: CommandRun): boolean {
  return run.durationMs !== null && run.durationMs >= SLOW_MS && run.status !== "background"
}

const RUN_FILTERS: Record<RunFilter, (run: CommandRun) => boolean> = {
  all: () => true,
  failed: (run) => run.status === "failed",
  slow: isSlow,
  background: (run) => run.status === "background",
}

export interface RunFacts {
  readonly counts: Readonly<Record<RunFilter, number>>
  /** Runs that finished one way or another (not running, not backgrounded). */
  readonly settled: number
  readonly totalMs: number
  readonly slowest: CommandRun | null
  readonly lastFailure: CommandRun | null
}

export function runFacts(runs: readonly CommandRun[]): RunFacts {
  const counts = { all: runs.length, failed: 0, slow: 0, background: 0 }
  let settled = 0
  let totalMs = 0
  let slowest: CommandRun | null = null
  let lastFailure: CommandRun | null = null
  for (const run of runs) {
    for (const kind of ["failed", "slow", "background"] as const) if (RUN_FILTERS[kind](run)) counts[kind] += 1
    if (run.status === "ok" || run.status === "failed" || run.status === "cancelled") settled += 1
    if (run.status !== "background" && run.durationMs !== null) {
      totalMs += run.durationMs
      if (!slowest || run.durationMs > (slowest.durationMs ?? 0)) slowest = run
    }
    if (run.status === "failed" && (!lastFailure || run.at >= lastFailure.at)) lastFailure = run
  }
  return { counts, settled, totalMs, slowest, lastFailure }
}

/** The runs a filter, program and search leave, newest or slowest first. */
export function visibleRuns(
  runs: readonly CommandRun[],
  options: { readonly filter: RunFilter; readonly program: string | null; readonly query: string; readonly sort: RunSort },
): CommandRun[] {
  const terms = searchTerms(options.query)
  const keep = RUN_FILTERS[options.filter]
  const result = runs.filter(
    (run) =>
      keep(run) &&
      (options.program === null || run.programs.includes(options.program)) &&
      terms.every((term) => run.command.toLowerCase().includes(term)),
  )
  result.reverse()
  if (options.sort === "slowest") result.sort((a, b) => (b.durationMs ?? -1) - (a.durationMs ?? -1))
  return result
}

export interface TimingPart {
  readonly kind: "model" | "tool" | "compact"
  readonly ms: number
  readonly share: number
}

/** The active time and its parts with their shares; parts that took no time are left out. */
export function timingParts(timing: TimingStats): { readonly activeMs: number; readonly parts: readonly TimingPart[]; readonly rate: number | null } {
  const activeMs = timing.modelMs + timing.toolMs + timing.compactMs
  const parts = (
    [
      { kind: "model", ms: timing.modelMs },
      { kind: "tool", ms: timing.toolMs },
      { kind: "compact", ms: timing.compactMs },
    ] as const
  )
    .filter((part) => part.ms > 0)
    .map((part) => ({ ...part, share: part.ms / activeMs }))
  return { activeMs, parts, rate: timing.modelMs >= 1_000 && timing.timedOutput > 0 ? timing.timedOutput / (timing.modelMs / 1_000) : null }
}
