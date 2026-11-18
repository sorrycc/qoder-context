export function formatTokens(value: number): string {
  if (value >= 1_000_000_000) return `${trim(value / 1_000_000_000)}B`
  if (value >= 1_000_000) return `${trim(value / 1_000_000)}M`
  if (value >= 1_000) return `${trim(value / 1_000)}k`
  return String(Math.round(value))
}

/** Qoder credits: two decimals while small, one up to a thousand, then k/M like tokens. */
export function formatCredits(value: number): string {
  if (value <= 0) return "0"
  if (value < 0.01) return "<0.01"
  if (value < 10) return value.toFixed(2).replace(/\.?0+$/, "")
  if (value < 1_000) return value.toFixed(1).replace(/\.0$/, "")
  return formatTokens(value)
}

export function formatPercent(ratio: number | null, digits = 1): string {
  return ratio === null || !Number.isFinite(ratio) ? "—" : `${(ratio * 100).toFixed(digits)}%`
}

/** `/Users/me/Projects/app` → `~/Projects/app`, so the meaningful tail survives truncation. */
export function shortPath(path: string): string {
  return path.replace(/^\/(?:Users|home)\/[^/]+(?=\/|$)/, "~").replace(/^[A-Za-z]:\\Users\\[^\\]+(?=\\|$)/, "~")
}

function trim(value: number): string {
  return value >= 100 ? value.toFixed(0) : value >= 10 ? value.toFixed(1).replace(/\.0$/, "") : value.toFixed(2).replace(/\.?0+$/, "")
}
