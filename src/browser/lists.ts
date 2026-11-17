import { localDay } from "../shared/days.js"
import type { SessionCard } from "../shared/types.js"

export type Sort = "recent" | "tokens" | "context"
export type TallyKind = "tools" | "skills" | "commands"
/** How the session list is sectioned: by the day each was last active, or by project folder. */
export type Grouping = "date" | "workspace"
export interface Filter {
  readonly day: string | null
  readonly tally: { readonly kind: TallyKind; readonly name: string } | null
  /** A project folder (a session's cwd). */
  readonly workspace: string | null
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
    if (filter.workspace !== null && session.cwd !== filter.workspace) return false
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

export type GroupLabel =
  | { readonly kind: "today" | "yesterday" }
  | { readonly kind: "date"; readonly day: string }
  | { readonly kind: "workspace"; readonly path: string | null }

export interface SessionGroup {
  readonly key: string
  /** Null for a flat list (non-chronological sorts), which shows no group header. */
  readonly label: GroupLabel | null
  readonly sessions: readonly SessionCard[]
  /** Sessions and tokens of the whole group, also when `sessions` is one page of it. */
  readonly count: number
  readonly tokens: number
}

/**
 * Groups sessions in their given order. By date, a recency-sorted list reads Today / Yesterday /
 * dates and other sorts keep one unlabelled group. By workspace, folders come in the order their
 * first session does, so the sort decides which folder leads; sessions without one come last.
 */
export function groupSessions(sessions: readonly SessionCard[], sort: Sort, by: Grouping = "date", now = Date.now()): SessionGroup[] {
  if (by === "workspace") {
    const folders = new Map<string | null, SessionCard[]>()
    for (const session of sessions) {
      const list = folders.get(session.cwd)
      if (list) list.push(session)
      else folders.set(session.cwd, [session])
    }
    const loose = folders.get(null)
    folders.delete(null)
    if (loose) folders.set(null, loose)
    return [...folders].map(([path, list]) => finish({ key: `ws:${path ?? ""}`, label: { kind: "workspace", path }, sessions: list }))
  }
  if (sort !== "recent") {
    return sessions.length === 0 ? [] : [finish({ key: "all", label: null, sessions })]
  }
  const today = localDay(now)
  const date = new Date(now)
  const yesterday = localDay(new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1, 12).getTime())
  const groups: { key: string; label: GroupLabel; sessions: SessionCard[] }[] = []
  for (const session of sessions) {
    const day = localDay(session.lastAt)
    const last = groups.at(-1)
    if (last?.key === day) {
      last.sessions.push(session)
      continue
    }
    const label: GroupLabel = day === today ? { kind: "today" } : day === yesterday ? { kind: "yesterday" } : { kind: "date", day }
    groups.push({ key: day, label, sessions: [session] })
  }
  return groups.map(finish)
}

function finish(group: Pick<SessionGroup, "key" | "label" | "sessions">): SessionGroup {
  return { ...group, count: group.sessions.length, tokens: group.sessions.reduce((sum, session) => sum + session.tokens, 0) }
}

/** The first `limit` sessions across `groups`, keeping each group's whole count and tokens. */
export function pageGroups(groups: readonly SessionGroup[], limit: number): SessionGroup[] {
  const page: SessionGroup[] = []
  let left = limit
  for (const group of groups) {
    if (left <= 0) break
    page.push(group.sessions.length <= left ? group : { ...group, sessions: group.sessions.slice(0, left) })
    left -= group.sessions.length
  }
  return page
}

/** Sessions rendered per page; more load as the list scrolls into view. */
export const SESSION_PAGE = 36
/** Tally rows shown before "Show all". */
export const TALLY_CAP = 6
