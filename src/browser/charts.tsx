import { formatPercent, formatTokens } from "../shared/format.js"
import type { ContextEvent, DayBucket, RequestPoint } from "../shared/types.js"
import type { Translate } from "./i18n.js"
import { enter } from "./motion.js"

export const SERIES = {
  cacheRead: "var(--qc-cached)",
  uncached: "var(--qc-uncached)",
  output: "var(--qc-output)",
} as const

function weekdayLabel(day: string, locale: string): string {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).toLocaleDateString(locale, { weekday: "short" })
}

export function WeekBars({ days, locale }: { readonly days: readonly DayBucket[]; readonly locale: string }) {
  const width = 320
  const height = 120
  const top = 14
  const max = Math.max(1, ...days.map((day) => day.tokens))
  const slot = width / Math.max(1, days.length)
  return (
    <svg className="qc-svg" viewBox={`0 ${-top} ${width} ${height + top + 18}`} role="img">
      {days.map((day, index) => {
        const barHeight = (day.tokens / max) * height
        return (
          <g key={day.day}>
            <rect
              className="qc-bar qc-grow-y"
              style={enter(index)}
              x={index * slot + slot * 0.2}
              y={height - barHeight}
              width={slot * 0.6}
              height={Math.max(barHeight, day.tokens > 0 ? 2 : 0)}
              rx={3}
              fill="var(--qc-accent)"
            >
              <title>{`${day.day} · ${formatTokens(day.tokens)} · ${day.requests} req`}</title>
            </rect>
            {day.tokens > 0 ? (
              <text className="qc-fade" style={enter(index + 4)} x={index * slot + slot / 2} y={height - barHeight - 4} textAnchor="middle">
                {formatTokens(day.tokens)}
              </text>
            ) : null}
            <text x={index * slot + slot / 2} y={height + 14} textAnchor="middle">
              {weekdayLabel(day.day, locale)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

export function Heatmap({
  cells,
  selected,
  onSelect,
}: {
  readonly cells: readonly { readonly day: string; readonly tokens: number }[]
  readonly selected: string | null
  readonly onSelect: (day: string | null) => void
}) {
  const size = 14
  const gap = 3
  const firstWeekday = cells[0] ? weekdayOf(cells[0].day) : 0
  const max = Math.max(1, ...cells.map((cell) => cell.tokens))
  const columns = Math.ceil((cells.length + firstWeekday) / 7)
  return (
    <svg className="qc-svg" viewBox={`0 0 ${columns * (size + gap)} ${7 * (size + gap)}`} role="img" style={{ maxWidth: columns * 22 }}>
      {cells.map((cell, index) => {
        const position = index + firstWeekday
        const level = cell.tokens === 0 ? 0 : 0.18 + 0.82 * Math.sqrt(cell.tokens / max)
        return (
          <rect
            key={cell.day}
            className="qc-heat-cell qc-fade"
            style={enter(Math.floor(position / 7), 16)}
            x={Math.floor(position / 7) * (size + gap)}
            y={(position % 7) * (size + gap)}
            width={size}
            height={size}
            rx={3}
            fill={level === 0 ? "var(--qc-fill-2)" : "var(--qc-heat)"}
            fillOpacity={level === 0 ? 1 : level}
            stroke={selected === cell.day ? "var(--qc-text)" : "none"}
            strokeWidth={1.5}
            onClick={() => onSelect(selected === cell.day ? null : cell.day)}
          >
            <title>{`${cell.day} · ${formatTokens(cell.tokens)}`}</title>
          </rect>
        )
      })}
    </svg>
  )
}

function weekdayOf(day: string): number {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1).getDay()
}

export function Donut({
  parts,
}: {
  readonly parts: readonly { readonly label: string; readonly value: number; readonly color: string }[]
}) {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const radius = 40
  const circumference = 2 * Math.PI * radius
  let offset = 0
  return (
    <div className="qc-donut">
      <svg viewBox="0 0 104 104" role="img">
        <circle cx={52} cy={52} r={radius} fill="none" stroke="var(--qc-fill-2)" strokeWidth={14} />
        {total > 0
          ? parts.map((part) => {
              const length = (part.value / total) * circumference
              const segment = (
                <circle
                  key={part.label}
                  cx={52}
                  cy={52}
                  r={radius}
                  fill="none"
                  stroke={part.color}
                  strokeWidth={14}
                  style={{ strokeDasharray: `${length} ${circumference - length}`, strokeDashoffset: -offset }}
                  transform="rotate(-90 52 52)"
                >
                  <title>{`${part.label} · ${formatTokens(part.value)}`}</title>
                </circle>
              )
              offset += length
              return segment
            })
          : null}
        <text x={52} y={56} textAnchor="middle" style={{ fontSize: "var(--qc-font-md)", fill: "var(--qc-text)", fontWeight: "var(--qc-weight-bold)" }}>
          {formatTokens(total)}
        </text>
      </svg>
      <ul className="qc-donut-legend">
        {parts.map((part) => (
          <li key={part.label}>
            <i className="qc-swatch" style={{ background: part.color }} />
            <span>{part.label}</span>
            <span className="qc-count">
              {formatTokens(part.value)} · {formatPercent(total > 0 ? part.value / total : null, 0)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** Horizontal stacked meter; parts are sized against `scale` and sweep in on mount. */
export function StackBar({
  parts,
  scale,
  large,
  label,
}: {
  readonly parts: readonly { readonly value: number; readonly color: string }[]
  readonly scale: number
  readonly large?: boolean
  readonly label?: string
}) {
  const width = (value: number) => `${scale > 0 ? Math.min(100, (Math.max(0, value) / scale) * 100) : 0}%`
  return (
    <span className={large ? "qc-meter qc-meter-lg" : "qc-meter"} role={label ? "img" : undefined} aria-label={label}>
      <span className="qc-meter-fill qc-fill-in">
        {parts.map((part, index) => (
          <span key={index} style={{ width: width(part.value), background: part.color }} />
        ))}
      </span>
    </span>
  )
}

export function MiniStack({ cacheRead, prompt, output }: { readonly cacheRead: number; readonly prompt: number; readonly output: number }) {
  return (
    <StackBar
      scale={prompt + output}
      parts={[
        { value: cacheRead, color: SERIES.cacheRead },
        { value: prompt - cacheRead, color: SERIES.uncached },
        { value: output, color: SERIES.output },
      ]}
    />
  )
}

/** One stacked bar per request: cached prompt, uncached prompt, output. Compactions draw dashed rules. */
export function RequestTrend({
  requests,
  events,
  offset,
  window,
  t,
}: {
  readonly requests: readonly RequestPoint[]
  readonly events: readonly ContextEvent[]
  readonly offset: number
  readonly window: number | null
  readonly t: Translate
}) {
  const height = 150
  const bar = Math.max(4, Math.min(18, 640 / Math.max(1, requests.length)))
  const gap = bar > 6 ? 2 : 1
  const width = Math.max(240, requests.length * (bar + gap))
  const peak = Math.max(1, ...requests.map((request) => request.prompt + request.output))
  const max = window && window < peak * 4 ? Math.max(window, peak) : peak
  const scale = (value: number) => (value / max) * height
  const compactions = events.filter((event) => event.kind === "compaction")
  return (
    <div className="qc-scroll">
      <svg className="qc-trend" width={width} height={height + 14} viewBox={`0 0 ${width} ${height + 14}`} role="img">
        {window && window <= max ? (
          <g>
            <line x1={0} x2={width} y1={height - scale(window)} y2={height - scale(window)} stroke="var(--qc-text-3)" strokeDasharray="2 3" />
            <text x={width - 2} y={height - scale(window) - 3} textAnchor="end">
              {formatTokens(window)}
            </text>
          </g>
        ) : null}
        {requests.map((request, index) => {
          const x = index * (bar + gap)
          const cached = scale(Math.min(request.cacheRead, request.prompt))
          const uncached = scale(Math.max(0, request.prompt - request.cacheRead))
          const output = scale(request.output)
          const label = [
            t("request", { index: offset + index + 1 }),
            t("turn", { turn: request.turn }),
            `${t("prompt")} ${formatTokens(request.prompt)} (${t("cached")} ${formatTokens(request.cacheRead)})`,
            `${t("output")} ${formatTokens(request.output)}`,
            request.model ?? "",
            request.tools.join(", "),
          ]
            .filter(Boolean)
            .join("\n")
          return (
            <g key={offset + index} className="qc-bar qc-grow-y">
              <title>{label}</title>
              <rect x={x} y={height - cached} width={bar} height={cached} fill={SERIES.cacheRead} />
              <rect x={x} y={height - cached - uncached} width={bar} height={uncached} fill={SERIES.uncached} />
              <rect x={x} y={height - cached - uncached - output} width={bar} height={output} fill={SERIES.output} />
            </g>
          )
        })}
        {compactions.map((event) => {
          const index = event.requestIndex - offset
          if (index < 0 || index > requests.length) return null
          const x = index * (bar + gap) - gap / 2
          return (
            <g key={`c${event.at}`}>
              <line x1={x} x2={x} y1={0} y2={height} stroke="var(--qc-warning)" strokeDasharray="4 3" strokeWidth={1.5} />
              <text x={x + 3} y={10} style={{ fill: "var(--qc-warning)" }}>
                ✂
              </text>
            </g>
          )
        })}
      </svg>
    </div>
  )
}

export function Legend({ t }: { readonly t: Translate }) {
  return (
    <div className="qc-legend">
      <span>
        <i className="qc-swatch" style={{ background: SERIES.cacheRead }} />
        {t("cacheRead")}
      </span>
      <span>
        <i className="qc-swatch" style={{ background: SERIES.uncached }} />
        {t("uncached")}
      </span>
      <span>
        <i className="qc-swatch" style={{ background: SERIES.output }} />
        {t("output")}
      </span>
    </div>
  )
}
