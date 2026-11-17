import { memo, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react"
import { localDay } from "../shared/days.js"
import { formatPercent, formatTokens } from "../shared/format.js"
import type { ContextEvent, DayBucket, RequestPoint } from "../shared/types.js"
import { formatDuration, type Translate } from "./i18n.js"
import { enter, useTweenedNumber } from "./motion.js"
import { TipBody, Tooltip, useChartTip } from "./tooltip.js"

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

export function WeekBars({ days, locale, t }: { readonly days: readonly DayBucket[]; readonly locale: string; readonly t: Translate }) {
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
}

/** Sqrt-scaled fill opacity for a heatmap cell, 0 for an empty day. */
export function heatLevel(tokens: number, max: number): number {
  return tokens <= 0 || max <= 0 ? 0 : 0.18 + 0.82 * Math.sqrt(Math.min(1, tokens / max))
}

const HEAT_STEPS = [0, 0.25, 0.5, 0.75, 1] as const

export function Heatmap({
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
}

export function Donut({
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
}

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

const TREND = { height: 150, top: 22, bottom: 18, axis: 40, pad: 8 } as const

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

/**
 * One stacked bar per request: cached prompt, uncached prompt, output. Compactions draw a dashed
 * rule with a marker before the first request after them. The y axis stays put while the plot
 * scrolls; hovering or arrowing through it highlights a column and shows its tooltip.
 */
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
  const tip = useChartTip()
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { height, top, bottom, pad } = TREND
  const bar = Math.max(4, Math.min(18, 640 / Math.max(1, requests.length)))
  const gap = bar > 6 ? 2 : 1
  const pitch = bar + gap
  const width = Math.max(240, requests.length * pitch)
  const geometry = useMemo(() => {
    const peak = Math.max(1, ...requests.map((request) => request.prompt + request.output))
    const scale = niceScale(window && window < peak * 4 ? Math.max(window, peak) : peak)
    return { ...scale, y: (value: number) => height - (value / scale.top) * height }
  }, [requests, window, height])
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

  const bars = useMemo(
    () =>
      requests.map((request, index) => (
        <g key={offset + index} className="qc-grow-y" data-qc-tip={index}>
          {stackRects(request, index * pitch, bar, geometry.y)}
        </g>
      )),
    [requests, pitch, bar, geometry, offset],
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

  const move = (event: PointerEvent<SVGSVGElement>) => {
    const x = event.clientX - event.currentTarget.getBoundingClientRect().left - pad
    const index = Math.min(requests.length - 1, Math.max(0, Math.floor(x / pitch)))
    if (index !== tip.active && requests.length > 0) tip.show(index)
  }

  const active = tip.active === null ? undefined : requests[tip.active]
  const activeCompaction = tip.active === null ? undefined : compactions.get(tip.active)
  const plotHeight = top + height + bottom
  const showWindow = window !== null && window <= geometry.top
  return (
    <div className="qc-tip-host qc-trend-wrap" ref={tip.hostRef}>
      <svg className="qc-trend-axis" width={TREND.axis} height={plotHeight} viewBox={`0 ${-top} ${TREND.axis} ${plotHeight}`} aria-hidden="true">
        <text x={TREND.axis - 6} y={height + 3} textAnchor="end">
          0
        </text>
        {geometry.ticks
          .filter((tick) => !showWindow || Math.abs(geometry.y(tick) - geometry.y(window)) > 11)
          .map((tick) => (
            <text key={tick} x={TREND.axis - 6} y={geometry.y(tick) + 3} textAnchor="end">
              {formatTokens(tick)}
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
          onPointerMove={move}
          onPointerLeave={tip.hide}
          {...tip.keyboard(requests.length)}
        >
          {geometry.ticks.map((tick) => (
            <line key={tick} className="qc-grid-line" x1={0} x2={width} y1={geometry.y(tick)} y2={geometry.y(tick)} />
          ))}
          <line className="qc-axis" x1={0} x2={width} y1={height + 0.5} y2={height + 0.5} />
          {tip.active !== null ? (
            <rect className="qc-band qc-trend-band" x={tip.active * pitch - gap} y={-top + 4} width={bar + gap * 2} height={height + top - 4} rx={2} />
          ) : null}
          <g className="qc-bars" data-dim={active ? "true" : undefined}>
            {bars}
          </g>
          {active && tip.active !== null ? <g className="qc-bars-active">{stackRects(active, tip.active * pitch, bar, geometry.y)}</g> : null}
          {showWindow ? <line className="qc-window" x1={-pad} x2={width + pad} y1={geometry.y(window)} y2={geometry.y(window)} /> : null}
          {[...compactions.keys()].map((index) => {
            const x = index * pitch - gap / 2
            return (
              <g key={`c${index}`} className="qc-compaction">
                <line x1={x} x2={x} y1={-top + 16} y2={height} />
                <circle cx={x} cy={-top + 8} r={7} />
                <text x={x} y={-top + 11.5} textAnchor="middle">
                  ✂
                </text>
              </g>
            )
          })}
          {requests.map((_, index) =>
            (offset + index + 1) % every === 0 ? (
              <text key={index} className={tip.active === index ? "qc-today" : undefined} x={index * pitch + bar / 2} y={height + 13} textAnchor="middle">
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
            rows={[
              { label: t("cacheRead"), value: formatTokens(Math.min(active.cacheRead, active.prompt)), color: SERIES.cacheRead },
              { label: t("uncached"), value: formatTokens(Math.max(0, active.prompt - active.cacheRead)), color: SERIES.uncached },
              { label: t("output"), value: formatTokens(active.output), color: SERIES.output },
              {
                label: window ? t("promptOfWindow") : t("promptTotal"),
                value: window ? `${formatTokens(active.prompt)} · ${formatPercent(active.prompt / window, 0)}` : formatTokens(active.prompt),
              },
            ]}
            note={
              <>
                {activeCompaction ? (
                  <div className="qc-tip-warn">
                    ✂ {t("compaction", { trigger: activeCompaction.trigger })} ·{" "}
                    {t("compactionDetail", {
                      pre: activeCompaction.preTokens === null ? "?" : formatTokens(activeCompaction.preTokens),
                      post: activeCompaction.postTokens === null ? "?" : formatTokens(activeCompaction.postTokens),
                      duration: formatDuration(activeCompaction.durationMs),
                    })}
                  </div>
                ) : null}
                {[active.model, toolList(active.tools)].filter(Boolean).join(" · ")}
              </>
            }
          />
        ) : null}
      </Tooltip>
    </div>
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
