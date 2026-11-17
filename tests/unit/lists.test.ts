import { describe, expect, it } from "vitest"
import { widthClass } from "../../src/browser/host.js"
import { groupSessions, highlight, searchTerms, visibleSessions, type Filter } from "../../src/browser/lists.js"
import type { SessionCard } from "../../src/shared/types.js"

const noon = new Date(2026, 10, 18, 12).getTime()
const HOUR = 3_600_000

function card(id: string, overrides: Partial<SessionCard> = {}): SessionCard {
  return {
    id,
    title: id,
    cwd: null,
    lastAt: noon,
    tokens: 0,
    turns: 1,
    requests: 1,
    contextTokens: 0,
    contextWindow: null,
    cacheRead: 0,
    prompt: 0,
    output: 0,
    days: [],
    tools: [],
    skills: [],
    commands: [],
    ...overrides,
  }
}

const none: Filter = { day: null, tally: null, query: "" }

describe("visibleSessions", () => {
  const sessions = [
    card("a", { title: "Fix login bug", cwd: "/Users/me/web", tokens: 10, contextTokens: 300, tools: ["Bash"], days: ["2026-11-18"] }),
    card("b", { title: "Write docs", cwd: "/Users/me/api", tokens: 30, contextTokens: 100, days: ["2026-11-17"] }),
    card("c", { title: null, cwd: "/Users/me/web", tokens: 20, contextTokens: 200, tools: ["Bash", "Read"] }),
  ]

  it("keeps the given order for recent and sorts by tokens or context", () => {
    expect(visibleSessions(sessions, none, "recent").map((s) => s.id)).toEqual(["a", "b", "c"])
    expect(visibleSessions(sessions, none, "tokens").map((s) => s.id)).toEqual(["b", "c", "a"])
    expect(visibleSessions(sessions, none, "context").map((s) => s.id)).toEqual(["a", "c", "b"])
  })

  it("filters by day, tally and every search term across title and folder", () => {
    expect(visibleSessions(sessions, { ...none, day: "2026-11-17" }, "recent").map((s) => s.id)).toEqual(["b"])
    expect(visibleSessions(sessions, { ...none, tally: { kind: "tools", name: "Bash" } }, "recent").map((s) => s.id)).toEqual(["a", "c"])
    expect(visibleSessions(sessions, { ...none, query: "  WEB " }, "recent").map((s) => s.id)).toEqual(["a", "c"])
    expect(visibleSessions(sessions, { ...none, query: "web login" }, "recent").map((s) => s.id)).toEqual(["a"])
    expect(visibleSessions(sessions, { ...none, query: "docs web" }, "recent")).toEqual([])
  })
})

describe("highlight", () => {
  it("returns the text unmarked without terms", () => {
    expect(highlight("abc", [])).toEqual([{ text: "abc", match: false }])
    expect(highlight("", searchTerms("x"))).toEqual([{ text: "", match: false }])
  })

  it("marks every case-insensitive occurrence and merges overlaps", () => {
    expect(highlight("Fix the fix", ["fix"])).toEqual([
      { text: "Fix", match: true },
      { text: " the ", match: false },
      { text: "fix", match: true },
    ])
    expect(highlight("abcdef", searchTerms("bcd CDE"))).toEqual([
      { text: "a", match: false },
      { text: "bcde", match: true },
      { text: "f", match: false },
    ])
  })
})

describe("groupSessions", () => {
  it("groups a recent list into today, yesterday and dated days with token sums", () => {
    const sessions = [
      card("a", { lastAt: noon, tokens: 5 }),
      card("b", { lastAt: noon - 2 * HOUR, tokens: 7 }),
      card("c", { lastAt: noon - 24 * HOUR }),
      card("d", { lastAt: noon - 72 * HOUR }),
    ]
    const groups = groupSessions(sessions, "recent", noon)
    expect(groups.map((group) => [group.label, group.sessions.map((s) => s.id)])).toEqual([
      [{ kind: "today" }, ["a", "b"]],
      [{ kind: "yesterday" }, ["c"]],
      [{ kind: "date", day: "2026-11-15" }, ["d"]],
    ])
    expect(groups[0]?.tokens).toBe(12)
  })

  it("keeps other sorts as one unlabelled group", () => {
    const sessions = [card("a", { lastAt: noon - 72 * HOUR }), card("b")]
    expect(groupSessions(sessions, "tokens", noon)).toEqual([{ key: "all", label: null, sessions, tokens: 0 }])
    expect(groupSessions([], "tokens", noon)).toEqual([])
  })
})

describe("widthClass", () => {
  it("splits narrow sidebars, regular panes and wide editors", () => {
    expect([widthClass(320), widthClass(519), widthClass(520), widthClass(1199), widthClass(1200)]).toEqual([
      "narrow",
      "narrow",
      "regular",
      "regular",
      "wide",
    ])
  })
})
