import { memo, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { localDay } from "../shared/days.js"
import { formatPercent, formatTokens } from "../shared/format.js"
import type { ContextEvent, DayBucket, RequestPoint } from "../shared/types.js"
import { clockTime, formatDuration, type Translate } from "./i18n.js"
import { enter, prefersReducedMotion, useTweenedNumber } from "./motion.js"
import { promptDeltas } from "./session-model.js"
import { TipBody, Tooltip, useChartTip } from "./tooltip.js"
import { Collapse, Icon } from "./ui.js"

export const SERIES = {
  cacheRead: "var(--qc-cached)",
  uncached: "var(--qc-uncached)",
  output: "var(--qc-output)",
} as const

function dateOf(day: string): Date {
  const [year, month, date] = day.split("-").map(Number)
  return new Date(year ?? 1970, (month ?? 1) - 1, date ?? 1)
}

export function longDate(day: string, locale: string): string {
  return dateOf(day).toLocaleDateString(locale, { weekday: "short", month: "short", day: "numeric" })
}

/** A round axis top at or above `max` and the evenly spaced ticks up to it (1/2/2.5/5 × 10ⁿ steps). */
export function niceScale(max: number, count = 3): { readonly top: number; readonly ticks: readonly number[] } {
  if (!(max > 0)) return { top: 1, ticks: [] }
  const raw = max / count
  const power = 10 ** Math.floor(Math.log10(raw))
  const step = ([1, 2, 2.5, 5, 10].find((factor) => factor * power >= raw) ?? 10) * power
  const top = Math.ceil(max / step - 1e-9) * step
  return { top, ticks: Array.from({ length: Math.round(top / step) }, (_, index) => (index + 1) * step) }
}

/** Every how many slots an axis label fits when each slot is `slotPx` wide and labels need `minPx`. */
export function labelEvery(slotPx: number, minPx: number): number {
  const needed = minPx / Math.max(slotPx, 0.001)
  return [1, 2, 5, 10, 20, 25, 50, 100, 200, 500].find((step) => step >= needed) ?? 1000
}

export const WeekBars = memo(function WeekBars({ days, locale, t }: { readonly days: readonly DayBucket[]; readonly locale: string; readonly t: Translate }) {
  const tip = useChartTip()
  const width = 320
  const height = 112
  const top = 16
  const max = Math.max(1, ...days.map((day) => day.tokens))
  const slot = width / Math.max(1, days.length)
  const today = localDay(Date.now())
  const active = tip.active === null ? undefined : days[tip.active]
  return (
    <div className="qc-tip-host" ref={tip.hostRef}>
      <svg
        className="qc-svg qc-chart"
        viewBox={`0 ${-top} ${width} ${height + top + 18}`}
        role="img"
        aria-label={t("weekTitle")}
        onPointerLeave={tip.hide}
        {...tip.keyboard(days.length)}
      >
        <line className="qc-axis" x1={0} x2={width} y1={height + 0.5} y2={height + 0.5} />
        {days.map((day, index) => {
          const barHeight = (day.tokens / max) * height
          const isActive = tip.active === index
          const cx = index * slot + slot / 2
          return (
            <g key={day.day} data-active={isActive || undefined} onPointerEnter={() => tip.show(index)}>
              <rect className="qc-band" x={index * slot + 2} y={-top} width={slot - 4} height={height + top} rx={6} />
              <rect
                className="qc-bar qc-grow-y"
                style={enter(index)}
                data-qc-tip={index}
                x={index * slot + slot * 0.22}
                y={height - barHeight}
                width={slot * 0.56}
                height={Math.max(barHeight, day.tokens > 0 ? 2 : 0)}
                rx={3}
                fill="var(--qc-accent)"
              />
              {day.tokens > 0 ? (
                <text className="qc-fade qc-value" style={enter(index + 4)} x={cx} y={height - barHeight - 5} textAnchor="middle">
                  {formatTokens(day.tokens)}
                </text>
              ) : null}
              <text className={day.day === today ? "qc-today" : undefined} x={cx} y={height + 14} textAnchor="middle">
                {dateOf(day.day).toLocaleDateString(locale, { weekday: "short" })}
              </text>
            </g>
          )
        })}
      </svg>
      <Tooltip tip={tip}>
        {active ? (
          <TipBody
            title={longDate(active.day, locale)}
            rows={[
              { label: t("kpiTokens"), value: formatTokens(active.tokens), color: "var(--qc-accent)" },
              { label: t("kpiRequests"), value: active.requests.toLocaleString() },
              { label: t("kpiTurns"), value: active.turns.toLocaleString() },
              { label: t("kpiToolRuns"), value: active.toolRuns.toLocaleString() },
            ]}
          />
        ) : null}
      </Tooltip>
    </div>
  )
})

/** Sqrt-scaled fill opacity for a heatmap cell, 0 for an empty day. */
export function heatLevel(tokens: number, max: number): number {
  return tokens <= 0 || max <= 0 ? 0 : 0.18 + 0.82 * Math.sqrt(Math.min(1, tokens / max))
}

const HEAT_STEPS = [0, 0.25, 0.5, 0.75, 1] as const

export const Heatmap = memo(function Heatmap({
  cells,
  selected,
  onSelect,
  locale,
  t,
}: {
  readonly cells: readonly { readonly day: string; readonly tokens: number; readonly requests: number }[]
  readonly selected: string | null
  readonly onSelect: (day: string | null) => void
  readonly locale: string
  readonly t: Translate
}) {
  const tip = useChartTip()
  const size = 14
  const gap = 3
  const pitch = size + gap
  const left = 26
  const top = 14
  const firstWeekday = cells[0] ? dateOf(cells[0].day).getDay() : 0
  const max = Math.max(1, ...cells.map((cell) => cell.tokens))
  const columns = Math.ceil((cells.length + firstWeekday) / 7)
  const today = localDay(Date.now())
  const toggle = (index: number) => {
    const day = cells[index]?.day
    if (day) onSelect(selected === day ? null : day)
  }
  const months = useMemo(() => {
    const labels: { column: number; text: string }[] = []
    let previous = -1
    cells.forEach((cell, index) => {
      const date = dateOf(cell.day)
      const column = Math.floor((index + firstWeekday) / 7)
      if (date.getMonth() !== previous && (date.getDate() <= 7 || labels.length === 0)) {
        // A month that only clips the first column gives way to the next one's label.
        const last = labels.at(-1)
        if (last && column - last.column < 3) labels.pop()
        labels.push({ column, text: date.toLocaleDateString(locale, { month: "short" }) })
        previous = date.getMonth()
      }
    })
    return labels
  }, [cells, firstWeekday, locale])
  const weekdays = useMemo(
    // 2023-01-01 was a Sunday; label Mon, Wed and Fri.
    () => [1, 3, 5].map((weekday) => ({ weekday, text: new Date(2023, 0, 1 + weekday).toLocaleDateString(locale, { weekday: "short" }) })),
    [locale],
  )
  const active = tip.active === null ? undefined : cells[tip.active]
  return (
    <div className="qc-tip-host" ref={tip.hostRef} style={{ maxWidth: left + columns * 22 }}>
      <svg
        className="qc-svg qc-chart"
        viewBox={`${-left} ${-top} ${left + columns * pitch} ${top + 7 * pitch}`}
        role="img"
        aria-label={t("heatmapTitle")}
        onPointerLeave={tip.hide}
        {...tip.keyboard(cells.length, { kind: "grid", rows: 7 }, toggle)}
      >
        {months.map((month) => (
          <text key={month.column} x={month.column * pitch} y={-4}>
            {month.text}
          </text>
        ))}
        {weekdays.map((label) => (
          <text key={label.weekday} x={-6} y={label.weekday * pitch + size - 3} textAnchor="end">
            {label.text}
          </text>
        ))}
        {cells.map((cell, index) => {
          const position = index + firstWeekday
          const level = heatLevel(cell.tokens, max)
          return (
            <rect
              key={cell.day}
              data-qc-tip={index}
              className="qc-heat-cell qc-fade"
              data-active={tip.active === index || undefined}
              data-selected={selected === cell.day || undefined}
              data-today={cell.day === today || undefined}
              style={enter(Math.floor(position / 7), 16)}
              x={Math.floor(position / 7) * pitch}
              y={(position % 7) * pitch}
              width={size}
              height={size}
              rx={3}
              fill={level === 0 ? "var(--qc-fill-2)" : "var(--qc-heat)"}
              fillOpacity={level === 0 ? 1 : level}
              onPointerEnter={() => tip.show(index)}
              onClick={() => toggle(index)}
            />
          )
        })}
      </svg>
      <div className="qc-heat-legend" aria-hidden="true">
        <span>{t("heatLess")}</span>
        {HEAT_STEPS.map((step) => (
          <i
            key={step}
            className="qc-swatch"
            style={step === 0 ? { background: "var(--qc-fill-2)" } : { background: "var(--qc-heat)", opacity: heatLevel(step, 1) }}
          />
        ))}
        <span>{t("heatMore")}</span>
      </div>
      <Tooltip tip={tip}>
        {active ? (
          <TipBody
            title={longDate(active.day, locale)}
            rows={
              active.tokens > 0
                ? [
                    { label: t("kpiTokens"), value: formatTokens(active.tokens), color: "var(--qc-heat)" },
                    { label: t("kpiRequests"), value: active.requests.toLocaleString() },
                  ]
                : []
            }
            note={active.tokens === 0 ? t("noActivity") : selected === active.day ? t("heatClickToClear") : t("heatClickToFilter")}
          />
        ) : null}
      </Tooltip>
    </div>
  )
})

export const Donut = memo(function Donut({
  parts,
  t,
}: {
  readonly parts: readonly { readonly label: string; readonly value: number; readonly color: string }[]
  readonly t: Translate
}) {
  const [active, setActive] = useState<number | null>(null)
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const radius = 40
  const circumference = 2 * Math.PI * radius
  const visible = parts.filter((part) => part.value > 0).length
  const gap = visible > 1 ? 2 : 0
  let offset = 0
  const focus = active === null ? undefined : parts[active]
  return (
    <div className="qc-donut-wrap">
      <div className="qc-donut" data-active={active !== null || undefined} onPointerLeave={() => setActive(null)}>
        <svg viewBox="0 0 104 104" role="img" aria-label={t("compositionTitle")}>
          <circle cx={52} cy={52} r={radius} fill="none" stroke="var(--qc-fill-2)" strokeWidth={14} />
          {total > 0
            ? parts.map((part, index) => {
                const length = (part.value / total) * circumference
                const drawn = Math.max(0, length - gap)
                const segment = (
                  <circle
                    key={part.label}
                    className="qc-donut-seg"
                    data-active={active === index || undefined}
                    cx={52}
                    cy={52}
                    r={radius}
                    fill="none"
                    stroke={part.color}
                    strokeWidth={14}
                    style={{ strokeDasharray: `${drawn} ${circumference - drawn}`, strokeDashoffset: -(offset + gap / 2) }}
                    transform="rotate(-90 52 52)"
                    onPointerEnter={() => setActive(index)}
                  />
                )
                offset += length
                return segment
              })
            : null}
          <text className="qc-donut-value" x={52} y={focus ? 53 : 56} textAnchor="middle">
            {focus ? formatPercent(total > 0 ? focus.value / total : null, 0) : formatTokens(total)}
          </text>
          {focus ? (
            <text className="qc-donut-caption" x={52} y={66} textAnchor="middle">
              {formatTokens(focus.value)}
            </text>
          ) : null}
        </svg>
        <ul className="qc-donut-legend">
          {parts.map((part, index) => (
            <li
              key={part.label}
              tabIndex={0}
              data-active={active === index || undefined}
              onPointerEnter={() => setActive(index)}
              onFocus={() => setActive(index)}
              onBlur={() => setActive(null)}
            >
              <i className="qc-swatch" style={{ background: part.color }} />
              <span className="qc-name">{part.label}</span>
              <span className="qc-donut-tokens">{formatTokens(part.value)}</span>
              <span className="qc-donut-pct">{formatPercent(total > 0 ? part.value / total : null, 0)}</span>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
})

/**
 * Dash pattern and offset for consecutive ring arcs, `values` sized against `scale` (anything past a
 * full turn is dropped) and separated by `gap` where more than one is drawn.
 */
export function ringArcs(values: readonly number[], scale: number, circumference: number, gap = 2) {
  const lengths = values.map((value) => (scale > 0 ? (Math.max(0, value) / scale) * circumference : 0))
  const gaps = lengths.filter((length) => length > gap).length > 1 ? gap : 0
  let start = 0
  return lengths.map((length) => {
    const drawn = Math.max(0, Math.min(length, circumference - start) - gaps)
    const arc = { dash: `${drawn} ${circumference - drawn}`, offset: -start, drawn }
    start = Math.min(circumference, start + length)
    return arc
  })
}

const RING = { size: 132, stroke: 12, warn: 0.8 } as const

/**
 * Context fill as a ring: cached then uncached prompt against `scale` (the model window), easing
 * between refreshes and sweeping in on mount. A tick marks the 80% warning line; the centre holds
 * whatever the caller passes.
 */
export function ContextRing({
  cached,
  uncached,
  scale,
  label,
  warn,
  children,
}: {
  readonly cached: number
  readonly uncached: number
  readonly scale: number
  readonly label: string
  readonly warn: boolean
  readonly children: ReactNode
}) {
  const shownCached = useTweenedNumber(cached)
  const shownUncached = useTweenedNumber(uncached)
  const centre = RING.size / 2
  const radius = (RING.size - RING.stroke) / 2
  const circumference = 2 * Math.PI * radius
  const arcs = ringArcs([shownCached, shownUncached], scale, circumference)
  const tick = (RING.warn * 360 - 90) * (Math.PI / 180)
  const inner = radius - RING.stroke / 2 - 2
  const outer = radius + RING.stroke / 2 + 2
  return (
    <div className="qc-ring">
      <svg viewBox={`0 0 ${RING.size} ${RING.size}`} role="img" aria-label={label}>
        <circle className="qc-ring-track" cx={centre} cy={centre} r={radius} strokeWidth={RING.stroke} />
        {[SERIES.cacheRead, SERIES.uncached].map((color, index) => {
          const arc = arcs[index]
          return arc && arc.drawn > 0 ? (
            <circle
              key={color}
              cx={centre}
              cy={centre}
              r={radius}
              fill="none"
              stroke={color}
              strokeWidth={RING.stroke}
              strokeDasharray={arc.dash}
              strokeDashoffset={arc.offset}
              transform={`rotate(-90 ${centre} ${centre})`}
            />
          ) : null
        })}
        {scale > 0 ? (
          <line
            className="qc-ring-tick"
            data-warn={warn || undefined}
            x1={centre + Math.cos(tick) * inner}
            y1={centre + Math.sin(tick) * inner}
            x2={centre + Math.cos(tick) * outer}
            y2={centre + Math.sin(tick) * outer}
          />
        ) : null}
      </svg>
      <div className="qc-ring-centre">{children}</div>
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

type Compaction = Extract<ContextEvent, { kind: "compaction" }>

export type TrendMode = "total" | "delta"

const TREND = { height: 150, top: 22, bottom: 18, axis: 40, pad: 8 } as const

interface TrendGeometry {
  readonly ticks: readonly { readonly value: number; readonly label: string }[]
  /** Highest value on the axis, for the window line. */
  readonly top: number
  /** y of the zero line. */
  readonly zero: number
  readonly y: (value: number) => number
}

/** Total mode: zero at the bottom, the axis up to the peak request (or the window when it's close). */
export function totalGeometry(requests: readonly RequestPoint[], window: number | null, height: number): TrendGeometry {
  const peak = Math.max(1, ...requests.map((request) => request.prompt + request.output))
  const scale = niceScale(window && window < peak * 4 ? Math.max(window, peak) : peak)
  return {
    top: scale.top,
    zero: height,
    ticks: scale.ticks.map((value) => ({ value, label: formatTokens(value) })),
    y: (value) => height - (value / scale.top) * height,
  }
}

/**
 * Delta mode: growth above the zero line, shrinkage below. A compaction can shrink the prompt far
 * more than any request grows it, so the part below the line is capped at 1.5× the part above and
 * deeper drops are clipped (`floor`).
 */
export function deltaGeometry(deltas: readonly (number | null)[], height: number): TrendGeometry & { readonly floor: number } {
  const up = Math.max(1, ...deltas.map((delta) => delta ?? 0))
  const down = Math.max(0, ...deltas.map((delta) => -(delta ?? 0)))
  const upper = niceScale(up, 2)
  const lower = down > 0 ? niceScale(Math.min(down, upper.top * 1.5), 1) : { top: 0, ticks: [] }
  const unit = height / (upper.top + lower.top)
  const zero = upper.top * unit
  return {
    top: upper.top,
    zero,
    floor: -lower.top,
    ticks: [
      ...upper.ticks.map((value) => ({ value, label: `+${formatTokens(value)}` })),
      ...lower.ticks.map((value) => ({ value: -value, label: `−${formatTokens(value)}` })),
    ],
    y: (value) => zero - Math.max(value, -lower.top) * unit,
  }
}

/** A request's cached, uncached and output segments, stacked from the baseline at `x`. */
function stackRects(request: RequestPoint, x: number, bar: number, y: (value: number) => number) {
  const base = y(0)
  const cachedTop = y(Math.min(request.cacheRead, request.prompt))
  const promptTop = y(request.prompt)
  const outputTop = y(request.prompt + request.output)
  return (
    <>
      <rect x={x} y={cachedTop} width={bar} height={base - cachedTop} fill={SERIES.cacheRead} />
      <rect x={x} y={promptTop} width={bar} height={cachedTop - promptTop} fill={SERIES.uncached} />
      <rect x={x} y={outputTop} width={bar} height={promptTop - outputTop} fill={SERIES.output} />
    </>
  )
}

/** A signed change from the zero line; a clipped drop ends in a short broken stub. */
function deltaRect(delta: number | null, x: number, bar: number, geometry: TrendGeometry & { readonly floor: number }) {
  if (delta === null || delta === 0) return null
  const end = geometry.y(delta)
  if (delta > 0) return <rect x={x} y={end} width={bar} height={geometry.zero - end} fill={DELTA.growth} />
  const clipped = delta < geometry.floor
  return (
    <>
      <rect x={x} y={geometry.zero} width={bar} height={end - geometry.zero - (clipped ? 5 : 0)} fill={DELTA.shrink} />
      {clipped ? <rect x={x} y={end - 2} width={bar} height={2} fill={DELTA.shrink} /> : null}
    </>
  )
}

const DELTA = { growth: SERIES.uncached, shrink: "var(--qc-success)" } as const

/**
 * One bar per request, either the stacked prompt (cached, uncached) and output, or in delta mode the
 * prompt's change since the request before. Compactions draw a dashed rule with a marker before the
 * first request after them. The y axis stays put while the plot scrolls; hovering or arrowing through
 * it highlights a column and shows its tooltip. Clicking a column or a marker pins that request, and
 * `reveal` (bumped by the caller) scrolls the pinned request into view.
 */
export function RequestTrend({
  requests,
  events,
  offset,
  window,
  mode,
  pinned,
  reveal,
  onPin,
  children,
  t,
}: {
  readonly requests: readonly RequestPoint[]
  readonly events: readonly ContextEvent[]
  readonly offset: number
  readonly window: number | null
  readonly mode: TrendMode
  /** Index into `requests` of the pinned request. */
  readonly pinned: number | null
  readonly reveal: number
  readonly onPin: (index: number | null) => void
  /** Rendered between the chart and the pinned request, e.g. the legend. */
  readonly children?: ReactNode
  readonly t: Translate
}) {
  const tip = useChartTip()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { height, top, bottom, pad } = TREND
  const bar = Math.max(4, Math.min(18, 640 / Math.max(1, requests.length)))
  const gap = bar > 6 ? 2 : 1
  const pitch = bar + gap
  const width = Math.max(240, requests.length * pitch)
  const deltas = useMemo(() => promptDeltas(requests), [requests])
  const geometry = useMemo(
    () => (mode === "delta" ? deltaGeometry(deltas, height) : { ...totalGeometry(requests, window, height), floor: Number.NEGATIVE_INFINITY }),
    [mode, deltas, requests, window, height],
  )
  const compactions = useMemo(() => {
    const byIndex = new Map<number, Compaction>()
    for (const event of events) {
      if (event.kind !== "compaction") continue
      const index = event.requestIndex - offset
      if (index >= 0 && index <= requests.length) byIndex.set(index, event)
    }
    return byIndex
  }, [events, offset, requests.length])
  const every = labelEvery(pitch, 28)

  // The plot grows in as one group on mount (one animation instead of hundreds); requests that
  // arrive later grow in on their own.
  const mountedEnd = useRef(offset + requests.length)
  const bars = useMemo(
    () =>
      requests.map((request, index) => (
        <g key={offset + index} className={offset + index >= mountedEnd.current ? "qc-grow-y" : undefined} data-qc-tip={index}>
          {mode === "delta" ? deltaRect(deltas[index] ?? null, index * pitch, bar, geometry) : stackRects(request, index * pitch, bar, geometry.y)}
        </g>
      )),
    [requests, deltas, mode, pitch, bar, geometry, offset],
  )

  // Open on the latest requests; they're what the current context is made of.
  useEffect(() => {
    const scroller = scrollRef.current
    if (scroller) scroller.scrollLeft = scroller.scrollWidth
  }, [requests.length])

  // Keep the keyboard-selected column in view, then re-anchor the tooltip to it.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || tip.active === null) return
    const x = tip.active * pitch
    const target = x < scroller.scrollLeft ? x - pitch * 2 : x + pitch > scroller.scrollLeft + scroller.clientWidth ? x + pitch * 3 - scroller.clientWidth : null
    if (target === null) return
    scroller.scrollLeft = target
    tip.show(tip.active)
  }, [tip.active, tip.show, pitch])

  // Something outside the chart asked to show the pinned request: centre it.
  useEffect(() => {
    const scroller = scrollRef.current
    if (!scroller || pinned === null || reveal === 0) return
    scroller.scrollTo({ left: pinned * pitch + pad - scroller.clientWidth / 2, behavior: prefersReducedMotion() ? "auto" : "smooth" })
    // Only a new reveal scrolls; a pin from inside the chart is already in view.
  }, [reveal])

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left - pad
    const index = Math.min(requests.length - 1, Math.max(0, Math.floor(x / pitch)))
    if (index !== tip.active && requests.length > 0) tip.show(index)
  }
  const toggle = (index: number) => onPin(index === pinned ? null : index)

  const highlight = tip.active ?? pinned
  const lit = highlight === null ? undefined : requests[highlight]
  const active = tip.active === null ? undefined : requests[tip.active]
  const plotHeight = top + height + bottom
  const showWindow = mode === "total" && window !== null && window <= geometry.top
  const clear = (value: number) => !showWindow || Math.abs(geometry.y(value) - geometry.y(window)) > 11
  return (
    <>
      <div className="qc-tip-host qc-trend-wrap" ref={tip.hostRef}>
        <svg className="qc-trend-axis" width={TREND.axis} height={plotHeight} viewBox={`0 ${-top} ${TREND.axis} ${plotHeight}`} aria-hidden="true">
          <text x={TREND.axis - 6} y={geometry.zero + 3} textAnchor="end">
            0
          </text>
          {geometry.ticks
            .filter((tick) => clear(tick.value))
            .map((tick) => (
              <text key={tick.value} x={TREND.axis - 6} y={geometry.y(tick.value) + 3} textAnchor="end">
                {tick.label}
              </text>
            ))}
          {showWindow ? (
            <text className="qc-window-label" x={TREND.axis - 6} y={geometry.y(window) + 3} textAnchor="end">
              {formatTokens(window)}
            </text>
          ) : null}
        </svg>
        <div className="qc-scroll" ref={scrollRef} onScroll={tip.hide}>
          <svg
            className="qc-trend qc-chart"
            width={width + pad * 2}
            height={plotHeight}
            viewBox={`${-pad} ${-top} ${width + pad * 2} ${plotHeight}`}
            role="img"
            aria-label={t("trendTitle")}
            data-mode={mode}
            onPointerMove={move}
            onPointerLeave={tip.hide}
            onClick={() => (tip.active !== null ? toggle(tip.active) : undefined)}
            {...tip.keyboard(requests.length, undefined, toggle)}
          >
            {geometry.ticks.map((tick) => (
              <line key={tick.value} className="qc-grid-line" x1={0} x2={width} y1={geometry.y(tick.value)} y2={geometry.y(tick.value)} />
            ))}
            <line className="qc-axis" x1={0} x2={width} y1={height + 0.5} y2={height + 0.5} />
            {mode === "delta" ? <line className="qc-axis qc-zero" x1={0} x2={width} y1={geometry.zero + 0.5} y2={geometry.zero + 0.5} /> : null}
            {pinned !== null ? (
              <g className="qc-trend-pin" style={{ translate: `${pinned * pitch - gap}px 0` }}>
                <rect y={-top + 4} width={bar + gap * 2} height={height + top - 4} rx={3} />
                {reveal > 0 ? <rect key={reveal} className="qc-pin-pulse" y={-top + 4} width={bar + gap * 2} height={height + top - 4} rx={3} /> : null}
              </g>
            ) : null}
            {tip.active !== null ? (
              <rect
                className="qc-band qc-trend-band"
                style={{ translate: `${tip.active * pitch - gap}px 0` }}
                y={-top + 4}
                width={bar + gap * 2}
                height={height + top - 4}
                rx={2}
              />
            ) : null}
            <g key={mode} className={`qc-bars ${mode === "delta" ? "qc-fade" : "qc-grow-y"}`} data-dim={lit ? "true" : undefined}>
              {bars}
            </g>
            {lit && highlight !== null ? (
              <g className="qc-bars-active">
                {mode === "delta" ? deltaRect(deltas[highlight] ?? null, highlight * pitch, bar, geometry) : stackRects(lit, highlight * pitch, bar, geometry.y)}
              </g>
            ) : null}
            {showWindow ? <line className="qc-window" x1={-pad} x2={width + pad} y1={geometry.y(window)} y2={geometry.y(window)} /> : null}
            {[...compactions.keys()].map((index) => {
              const x = index * pitch - gap / 2
              return (
                <g
                  key={`c${index}`}
                  className="qc-compaction"
                  onPointerMove={(event) => event.stopPropagation()}
                  onClick={(event) => {
                    event.stopPropagation()
                    if (requests.length > 0) onPin(Math.min(index, requests.length - 1))
                  }}
                >
                  <line x1={x} x2={x} y1={-top + 16} y2={height} />
                  <circle cx={x} cy={-top + 8} r={7} />
                  <text x={x} y={-top + 11.5} textAnchor="middle">
                    ✂
                  </text>
                </g>
              )
            })}
            {requests.map((_, index) =>
              index === pinned || ((offset + index + 1) % every === 0 && (pinned === null || Math.abs(index - pinned) * pitch >= 24)) ? (
                <text key={index} className={highlight === index ? "qc-today" : undefined} x={index * pitch + bar / 2} y={height + 13} textAnchor="middle">
                  {offset + index + 1}
                </text>
              ) : null,
            )}
          </svg>
        </div>
        <Tooltip tip={tip}>
          {active && tip.active !== null ? (
            <TipBody
              title={
                <>
                  {t("request", { index: offset + tip.active + 1 })} <span className="qc-muted">· {t("turn", { turn: active.turn })}</span>
                </>
              }
              rows={requestRows(active, deltas[tip.active] ?? null, window, mode, t)}
              note={
                <>
                  {mode === "delta" && (deltas[tip.active] ?? 0) < geometry.floor ? <div className="qc-tip-warn">{t("deltaClipped")}</div> : null}
                  {compactions.get(tip.active) ? <CompactionNote event={compactions.get(tip.active)!} t={t} /> : null}
                  {[active.model, toolList(active.tools)].filter(Boolean).join(" · ")}
                </>
              }
            />
          ) : null}
        </Tooltip>
      </div>
      {children}
      <PinnedRequest
        request={pinned === null ? null : (requests[pinned] ?? null)}
        index={pinned === null ? null : offset + pinned}
        delta={pinned === null ? null : (deltas[pinned] ?? null)}
        compaction={pinned === null ? undefined : compactions.get(pinned)}
        window={window}
        onClose={() => onPin(null)}
        t={t}
      />
    </>
  )
}

function requestRows(request: RequestPoint, delta: number | null, window: number | null, mode: TrendMode, t: Translate) {
  const rows: { label: string; value: string; color?: string }[] = []
  if (mode === "delta" && delta !== null) {
    rows.push({ label: t("deltaChange"), value: signedTokens(delta), color: delta >= 0 ? DELTA.growth : DELTA.shrink })
  }
  rows.push(
    { label: t("cacheRead"), value: formatTokens(Math.min(request.cacheRead, request.prompt)), color: SERIES.cacheRead },
    { label: t("uncached"), value: formatTokens(Math.max(0, request.prompt - request.cacheRead)), color: SERIES.uncached },
    { label: t("output"), value: formatTokens(request.output), color: SERIES.output },
    {
      label: window ? t("promptOfWindow") : t("promptTotal"),
      value: window ? `${formatTokens(request.prompt)} · ${formatPercent(request.prompt / window, 0)}` : formatTokens(request.prompt),
    },
  )
  if (mode === "total" && delta !== null) rows.push({ label: t("deltaChange"), value: signedTokens(delta) })
  if (request.latencyMs !== null) rows.push({ label: t("latency"), value: formatElapsed(request.latencyMs) })
  return rows
}

function CompactionNote({ event, t }: { readonly event: Compaction; readonly t: Translate }) {
  return (
    <div className="qc-tip-warn">
      ✂ {t("compaction", { trigger: event.trigger })} ·{" "}
      {t("compactionDetail", {
        pre: event.preTokens === null ? "?" : formatTokens(event.preTokens),
        post: event.postTokens === null ? "?" : formatTokens(event.postTokens),
        duration: formatDuration(event.durationMs),
      })}
    </div>
  )
}

export function signedTokens(value: number): string {
  return value > 0 ? `+${formatTokens(value)}` : value < 0 ? `−${formatTokens(-value)}` : "0"
}

/** Durations that are often under a second: 840ms, 4.2s, then the usual minutes and hours. */
export function formatElapsed(ms: number): string {
  if (ms < 1_000) return `${Math.round(ms)}ms`
  if (ms < 10_000) return `${(ms / 1_000).toFixed(1)}s`
  return formatDuration(ms)
}

/** The pinned request's facts under the chart; it slides open and keeps its last content as it closes. */
function PinnedRequest({
  request,
  index,
  delta,
  compaction,
  window,
  onClose,
  t,
}: {
  readonly request: RequestPoint | null
  readonly index: number | null
  readonly delta: number | null
  readonly compaction: Compaction | undefined
  readonly window: number | null
  readonly onClose: () => void
  readonly t: Translate
}) {
  const last = useRef<{ request: RequestPoint; index: number; delta: number | null; compaction: Compaction | undefined } | null>(null)
  if (request && index !== null) last.current = { request, index, delta, compaction }
  const shown = last.current
  const open = request !== null
  return (
    <Collapse open={open}>
      {shown ? (
        <div className="qc-pin-strip" role="status" aria-label={t("pinnedLabel")}>
          <div className="qc-pin-head">
            <Icon name="pin" size={12} />
            <strong>{t("request", { index: shown.index + 1 })}</strong>
            <span className="qc-muted">
              {t("turn", { turn: shown.request.turn })} · {clockTime(t, shown.request.at)}
            </span>
            <button type="button" className="qc-icon-button qc-pin-close" aria-label={t("unpin")} onClick={onClose}>
              <Icon name="close" size={12} />
            </button>
          </div>
          <dl className="qc-pin-facts">
            <div>
              <dt>{window ? t("promptOfWindow") : t("promptTotal")}</dt>
              <dd>
                {formatTokens(shown.request.prompt)}
                {window ? <span className="qc-muted"> · {formatPercent(shown.request.prompt / window, 0)}</span> : null}
                {shown.delta !== null ? (
                  <span className="qc-pin-delta" data-sign={shown.delta >= 0 ? "up" : "down"}>
                    {signedTokens(shown.delta)}
                  </span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt>
                <i className="qc-swatch" style={{ background: SERIES.cacheRead }} />
                {t("cacheRead")}
              </dt>
              <dd>{formatPercent(shown.request.prompt > 0 ? Math.min(shown.request.cacheRead, shown.request.prompt) / shown.request.prompt : null, 0)}</dd>
            </div>
            <div>
              <dt>
                <i className="qc-swatch" style={{ background: SERIES.output }} />
                {t("output")}
              </dt>
              <dd>{formatTokens(shown.request.output)}</dd>
            </div>
            {shown.request.latencyMs !== null ? (
              <div>
                <dt>{t("latency")}</dt>
                <dd>{formatElapsed(shown.request.latencyMs)}</dd>
              </div>
            ) : null}
            {shown.request.tools.length > 0 ? (
              <div className="qc-pin-tools">
                <dt>{t("toolsTitle")}</dt>
                <dd>{toolList(shown.request.tools)}</dd>
              </div>
            ) : null}
          </dl>
          {shown.compaction ? <CompactionNote event={shown.compaction} t={t} /> : null}
        </div>
      ) : null}
    </Collapse>
  )
}

/** Up to three distinct tool names, then a "+n" for the rest. */
export function toolList(tools: readonly string[]): string {
  const unique = [...new Set(tools)]
  return unique.length > 3 ? `${unique.slice(0, 3).join(", ")} +${unique.length - 3}` : unique.join(", ")
}

export const Legend = memo(function Legend({
  t,
  compactions,
  window,
}: {
  readonly t: Translate
  readonly compactions?: boolean
  readonly window?: number | null
}) {
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
      {window ? (
        <span>
          <i className="qc-swatch qc-swatch-window" />
          {t("windowLabel", { window: formatTokens(window) })}
        </span>
      ) : null}
      {compactions ? (
        <span>
          <i className="qc-swatch qc-swatch-rule" />
          {t("compactionLegend")}
        </span>
      ) : null}
    </div>
  )
})
