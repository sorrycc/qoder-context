export const DAY_MS = 86_400_000

/** Local calendar day, so buckets match the user's own "today". */
export function localDay(ms: number): string {
  const date = new Date(ms)
  const month = String(date.getMonth() + 1).padStart(2, "0")
  const day = String(date.getDate()).padStart(2, "0")
  return `${date.getFullYear()}-${month}-${day}`
}

/** The `count` local days ending at `endMs`, oldest first. */
export function lastDays(count: number, endMs: number): string[] {
  const end = new Date(endMs)
  const days: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) {
    days.push(localDay(new Date(end.getFullYear(), end.getMonth(), end.getDate() - offset, 12).getTime()))
  }
  return days
}

export function rangeDays(range: "today" | "7d" | "30d"): number {
  return range === "today" ? 1 : range === "7d" ? 7 : 30
}
