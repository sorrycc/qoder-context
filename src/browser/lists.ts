import { localDay } from "../shared/days.js"
import type { SessionCard } from "../shared/types.js"

export type Sort = "recent" | "tokens" | "context"
export type TallyKind = "tools" | "skills" | "commands"
export interface Filter {
  readonly day: string | null
  readonly tally: { readonly kind: TallyKind; readonly name: string } | null
  readonly query: string
}

/** Lower-cased, whitespace-separated search terms; every term must match. */
export function searchTerms(query: string): string[] {
  return query.toLowerCase().split(/\s+/).filter(Boolean)
}

export function visibleSessions(sessions: readonly SessionCard[], filter: Filter, sort: Sort): SessionCard[] {
  const terms = searchTerms(filter.query)
  const result = sessions.filter((session) => {
    if (filter.day && !session.days.includes(filter.day)) return false
    if (filter.tally && !session[filter.tally.kind].includes(filter.tally.name)) return false
    if (terms.length === 0) return true
    const haystack = `${session.title ?? ""} ${session.cwd ?? ""}`.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
  if (sort === "tokens") result.sort((a, b) => b.tokens - a.tokens)
  else if (sort === "context") result.sort((a, b) => b.contextTokens - a.contextTokens)
  return result
}

export interface Segment {
  readonly text: string
  readonly match: boolean
}

/** Splits `text` into plain and matched runs for every case-insensitive occurrence of `terms`. */
export function highlight(text: string, terms: readonly string[]): Segment[] {
  if (terms.length === 0 || text.length === 0) return [{ text, match: false }]
  const lower = text.toLowerCase()
  const marked = new Array<boolean>(text.length).fill(false)
  for (const term of terms) {
    for (let at = lower.indexOf(term); at !== -1; at = lower.indexOf(term, at + term.length)) {
      marked.fill(true, at, at + term.length)
    }
  }
  const segments: Segment[] = []
  let start = 0
  for (let index = 1; index <= text.length; index += 1) {
    if (index === text.length || marked[index] !== marked[start]) {
      segments.push({ text: text.slice(start, index), match: marked[start] ?? false })
      start = index
    }
  }
  return segments
}

export type DayLabel = { readonly kind: "today" | "yesterday" } | { readonly kind: "date"; readonly day: string }

export interface SessionGroup {
  readonly key: string
  /** Null for a flat list (non-chronological sorts), which shows no group header. */
  readonly label: DayLabel | null
  readonly sessions: readonly SessionCard[]
  readonly tokens: number
}

/**
 * Groups sessions by the local day they were last active, in their given order, so a recency-sorted
 * list reads Today / Yesterday / dates. Other sorts keep one unlabelled group.
 */
export function groupSessions(sessions: readonly SessionCard[], sort: Sort, now = Date.now()): SessionGroup[] {
  if (sort !== "recent") {
    return sessions.length === 0 ? [] : [{ key: "all", label: null, sessions, tokens: sumTokens(sessions) }]
  }
  const today = localDay(now)
  const date = new Date(now)
  const yesterday = localDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12).getTime())
  const groups: { key: string; label: DayLabel; sessions: SessionCard[] }[] = []
  for (const session of sessions) {
    const day = localDay(session.lastAt)
    const last = groups.at(-1)
    if (last?.key === day) {
      last.sessions.push(session)
      continue
    }
    const label: DayLabel = day === today ? { kind: "today" } : day === yesterday ? { kind: "yesterday" } : { kind: "date", day }
    groups.push({ key: day, label, sessions: [session] })
  }
  return groups.map((group) => ({ ...group, tokens: sumTokens(group.sessions) }))
}

function sumTokens(sessions: readonly SessionCard[]): number {
  return sessions.reduce((sum, session) => sum + session.tokens, 0)
}

/** Sessions rendered per page; more load as the list scrolls into view. */
export const SESSION_PAGE = 36
/** Tally rows shown before "Show all". */
export const TALLY_CAP = 6
