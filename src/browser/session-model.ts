import type { CommandRun, ContextEvent, FileActivity, FleetAgent, RequestPoint, SessionDetail, TimingStats } from "../shared/types.js"
import { formatCredits, formatPercent } from "../shared/format.js"
import type { Translate } from "./i18n.js"
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

/** Events that repeat with the same content fold together: retries, errors and identical injections. */
function foldKey(event: ContextEvent): string | null {
  if (event.kind === "retry" || event.kind === "error") return `${event.kind}:${event.text}`
  if (event.kind === "inject") return `inject:${event.item}:${event.label}`
  return null
}

/** Newest-first events, with runs of identical retries, errors or injections folded into one item. */
export function timeline(events: readonly ContextEvent[]): TimelineItem[] {
  const items: TimelineItem[] = []
  for (const event of events) {
    const previous = items.at(-1)
    const key = foldKey(event)
    if (previous && key !== null && foldKey(previous.event) === key) {
      items[items.length - 1] = { ...previous, event, count: previous.count + 1 }
      continue
    }
    items.push({ key: `${event.kind}-${event.at}-${items.length}`, event, count: 1, firstAt: event.at })
  }
  return items.reverse()
}

/** Event kinds as the filter chips group them. */
export type EventGroup = "compaction" | "inject" | "switch" | "issue"
export type EventFilter = "all" | EventGroup

export const EVENT_GROUPS: Readonly<Record<ContextEvent["kind"], EventGroup>> = {
  compaction: "compaction",
  inject: "inject",
  model: "switch",
  mode: "switch",
  retry: "issue",
  error: "issue",
}

/** Events per group, for filter chips; `all` counts every event. */
export function eventCounts(events: readonly ContextEvent[]): Readonly<Record<EventFilter, number>> {
  const counts = { all: events.length, compaction: 0, inject: 0, switch: 0, issue: 0 }
  for (const event of events) counts[EVENT_GROUPS[event.kind]] += 1
  return counts
}

export type FileFilter = "all" | "edited" | "read" | "searched" | "images"

const FILE_FILTERS: Record<FileFilter, (file: FileActivity) => boolean> = {
  all: () => true,
  edited: (file) => file.writes > 0,
  read: (file) => file.writes === 0 && file.reads > 0,
  searched: (file) => file.searches > 0,
  images: (file) => file.image,
}

export interface FileFacts {
  readonly counts: Readonly<Record<FileFilter, number>>
  readonly added: number
  readonly removed: number
}

export function fileFacts(files: readonly FileActivity[]): FileFacts {
  const counts = { all: files.length, edited: 0, read: 0, searched: 0, images: 0 }
  let added = 0
  let removed = 0
  for (const file of files) {
    for (const kind of ["edited", "read", "searched", "images"] as const) if (FILE_FILTERS[kind](file)) counts[kind] += 1
    added += file.added
    removed += file.removed
  }
  return { counts, added, removed }
}

export function visibleFiles(files: readonly FileActivity[], filter: FileFilter): readonly FileActivity[] {
  return filter === "all" ? files : files.filter(FILE_FILTERS[filter])
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

export type TrendUnit = "request" | "turn"

/** The trend's columns: one per request, or one per turn with the requests it spans. */
export interface TrendSeries {
  readonly unit: TrendUnit
  readonly points: readonly RequestPoint[]
  /** Index into the requests of each column's first and last request. */
  readonly first: readonly number[]
  readonly last: readonly number[]
}

export function requestSeries(requests: readonly RequestPoint[]): TrendSeries {
  const indexes = requests.map((_, index) => index)
  return { unit: "request", points: requests, first: indexes, last: indexes }
}

/**
 * One column per turn: the prompt as its last request sent it (what the turn left in the window),
 * with the turn's output, tools, model time and credits added up.
 */
export function turnSeries(requests: readonly RequestPoint[]): TrendSeries {
  const points: RequestPoint[] = []
  const first: number[] = []
  const last: number[] = []
  requests.forEach((request, index) => {
    const at = points.length - 1
    const previous = points[at]
    if (previous && previous.turn === request.turn) {
      points[at] = {
        ...request,
        output: previous.output + request.output,
        tools: [...previous.tools, ...request.tools],
        latencyMs: previous.latencyMs === null && request.latencyMs === null ? null : (previous.latencyMs ?? 0) + (request.latencyMs ?? 0),
        credits: previous.credits === null && request.credits === null ? null : (previous.credits ?? 0) + (request.credits ?? 0),
        cause: previous.cause,
        reply: request.reply ?? previous.reply,
      }
      last[at] = index
      return
    }
    points.push(request)
    first.push(index)
    last.push(index)
  })
  return { unit: "turn", points, first, last }
}

/** The column of `series` that holds request `index`, or null when none does. */
export function seriesIndex(series: TrendSeries, index: number): number | null {
  for (let column = 0; column < series.points.length; column += 1) {
    if (index >= series.first[column]! && index <= series.last[column]!) return column
  }
  return null
}

export type CompositionKey = "system" | "systemPrompt" | "tools" | "skills" | "user" | "injected" | "toolCalls" | "reasoning" | "answers" | "messages"

export interface Composition {
  /** Parts in display order, each in tokens; together they make up `total`. */
  readonly parts: readonly { readonly key: CompositionKey; readonly tokens: number }[]
  readonly total: number
  /** "host" when Qoder's own meter sized the system prompt, tools and skills. */
  readonly source: "estimate" | "host"
}

const MESSAGE_KEYS = ["user", "injected", "toolCalls", "reasoning", "answers"] as const

/**
 * What the window holds now, split by kind. The transcript gives estimates for what it carries;
 * the system prompt and tool schemas get what is left of the reported prompt. When Qoder's meter
 * is known (and the window with it), it sizes the system prompt, tools and skills instead, and the
 * estimates share the rest. Estimates that overshoot the prompt are scaled down to fit it.
 */
export function composition(detail: SessionDetail): Composition {
  const total = detail.summary.contextTokens
  const window = detail.summary.contextWindow
  const { estimate, host } = detail
  if (total <= 0) return { parts: [], total: 0, source: "estimate" }
  const parts: { key: CompositionKey; tokens: number }[] = []
  const spread = (keys: readonly (keyof typeof estimate)[], room: number) => {
    const sum = keys.reduce((acc, key) => acc + estimate[key], 0)
    const scale = sum > room ? room / sum : 1
    for (const key of keys) parts.push({ key, tokens: estimate[key] * scale })
    return Math.min(sum, room)
  }
  if (host && window && window > 0) {
    const fixed = [
      { key: "systemPrompt", tokens: host.systemPrompt * window },
      { key: "tools", tokens: host.tools * window },
      { key: "skills", tokens: host.skills * window },
    ] as const
    const fixedSum = fixed.reduce((acc, part) => acc + part.tokens, 0)
    const scale = fixedSum > total ? total / fixedSum : 1
    for (const part of fixed) parts.push({ key: part.key, tokens: part.tokens * scale })
    const room = Math.max(0, total - fixedSum * scale)
    const used = spread(MESSAGE_KEYS, room)
    if (used === 0 && room > 0) parts.push({ key: "messages", tokens: room })
    return finishComposition(parts, total, "host")
  }
  const used = spread(["skills", ...MESSAGE_KEYS], total)
  parts.unshift({ key: "system", tokens: total - used })
  return finishComposition(parts, total, "estimate")
}

function finishComposition(parts: { key: CompositionKey; tokens: number }[], total: number, source: Composition["source"]): Composition {
  return { parts: parts.map((part) => ({ key: part.key, tokens: Math.round(part.tokens) })).filter((part) => part.tokens > 0), total, source }
}

export interface FleetRow {
  readonly agent: FleetAgent
  readonly depth: number
}

/** Subagents as a tree in launch order: each under the agent that launched it, unknown launchers at the top. */
export function fleetTree(agents: readonly FleetAgent[]): FleetRow[] {
  const ids = new Set(agents.map((agent) => agent.id))
  const children = new Map<string | null, FleetAgent[]>()
  for (const agent of agents) {
    const parent = agent.parent !== null && ids.has(agent.parent) && agent.parent !== agent.id ? agent.parent : null
    const list = children.get(parent)
    if (list) list.push(agent)
    else children.set(parent, [agent])
  }
  const rows: FleetRow[] = []
  const seen = new Set<string>()
  const walk = (parent: string | null, depth: number) => {
    for (const agent of [...(children.get(parent) ?? [])].sort((a, b) => a.firstAt - b.firstAt)) {
      if (seen.has(agent.id)) continue
      seen.add(agent.id)
      rows.push({ agent, depth })
      walk(agent.id, depth + 1)
    }
  }
  walk(null, 0)
  // A launch cycle leaves agents unreached; list them at the top rather than drop them.
  for (const agent of agents) if (!seen.has(agent.id)) rows.push({ agent, depth: 0 })
  return rows
}

export interface FleetFacts {
  readonly counts: Readonly<Record<FleetAgent["status"], number>>
  readonly tokens: number
  readonly credits: number
}

export function fleetFacts(agents: readonly FleetAgent[]): FleetFacts {
  const counts = { running: 0, done: 0, failed: 0, stopped: 0, unknown: 0 }
  let tokens = 0
  let credits = 0
  for (const agent of agents) {
    counts[agent.status] += 1
    tokens += agent.tokens
    credits += agent.credits
  }
  return { counts, tokens, credits }
}

/** What a credits figure leaves out: requests that weren't metered, or else the discount it got. */
export function creditsSub(credits: number, original: number, metered: number, requests: number, t: Translate): string | undefined {
  if (requests === 0) return undefined
  if (metered === 0) return t("creditsNone")
  // Counts rather than a share, which would round a handful of metered requests down to 0%.
  if (metered < requests) return t("creditsMetered", { metered, count: requests })
  return original > credits + 0.005 ? t("creditsList", { value: formatCredits(original) }) : undefined
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
