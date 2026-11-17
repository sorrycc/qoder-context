import type { ContextEvent, SessionDetail } from "../shared/types.js"

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
