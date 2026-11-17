import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type KeyboardEvent, type ReactNode } from "react"
import { enter, useTweenedNumber } from "./motion.js"

export type Tone = "neutral" | "accent" | "success" | "warning" | "danger"

/** Renders `value` through `format`, easing between updates; null skips the tween. */
export function AnimatedNumber({ value, format }: { readonly value: number | null; readonly format: (value: number | null) => string }) {
  const shown = useTweenedNumber(value ?? 0)
  return <>{format(value === null ? null : shown)}</>
}

export function SectionHeader({ title, hint, aside }: { readonly title: ReactNode; readonly hint?: ReactNode; readonly aside?: ReactNode }) {
  return (
    <header className="qc-section-head">
      <h2>{title}</h2>
      {hint !== undefined ? <span className="qc-section-hint">{hint}</span> : null}
      {aside !== undefined ? <div className="qc-section-aside">{aside}</div> : null}
    </header>
  )
}

/** A surface card that fades in on mount, staggered by `index`. */
export function Card({
  title,
  hint,
  aside,
  index = 0,
  className,
  style,
  children,
}: {
  readonly title?: ReactNode
  readonly hint?: ReactNode
  readonly aside?: ReactNode
  readonly index?: number
  readonly className?: string
  readonly style?: CSSProperties
  readonly children: ReactNode
}) {
  return (
    <section className={`qc-card qc-enter${className ? ` ${className}` : ""}`} style={{ ...enter(index), ...style }}>
      {title !== undefined ? <SectionHeader title={title} hint={hint} aside={aside} /> : null}
      {children}
    </section>
  )
}

export function Kpi({
  label,
  value,
  format,
  sub,
  tone = "neutral",
  index = 0,
}: {
  readonly label: string
  readonly value: number | null
  readonly format: (value: number | null) => string
  readonly sub?: string
  readonly tone?: Tone
  readonly index?: number
}) {
  return (
    <div className="qc-card qc-kpi qc-enter" data-tone={tone} style={enter(index)}>
      <div className="qc-kpi-label">{label}</div>
      <div className="qc-kpi-value">
        <AnimatedNumber value={value} format={format} />
      </div>
      {sub ? <div className="qc-kpi-sub">{sub}</div> : null}
    </div>
  )
}

export function Skeleton({ height, width, radius }: { readonly height: number; readonly width?: number | string; readonly radius?: string }) {
  return <div className="qc-skeleton" style={{ height, width, borderRadius: radius }} aria-hidden="true" />
}

export function KpiSkeletons({ count }: { readonly count: number }) {
  return (
    <div className="qc-grid qc-kpis" aria-hidden="true">
      {Array.from({ length: count }, (_, index) => (
        <div key={index} className="qc-card qc-kpi qc-kpi-skeleton">
          <Skeleton height={10} width="55%" radius="var(--qc-radius-pill)" />
          <Skeleton height={20} width="40%" radius="var(--qc-radius-sm)" />
        </div>
      ))}
    </div>
  )
}

/** Small inline spinner for buttons with a pending action. */
export function Spinner() {
  return <span className="qc-spinner" aria-hidden="true" />
}

/** Context-window fill: warning from 80%, danger from 95%. */
export function contextTone(ratio: number | null): Tone {
  if (ratio === null) return "neutral"
  return ratio >= 0.95 ? "danger" : ratio >= 0.8 ? "warning" : "neutral"
}

export const formatCount = (value: number | null): string => (value === null ? "—" : Math.round(value).toLocaleString())

/**
 * Single-choice segmented control. A thumb slides under the chosen option (it is measured, so it
 * follows labels of any width and re-measures on resize); arrow keys move the choice.
 */
export function Segmented<T extends string>({
  label,
  value,
  options,
  onChange,
  className,
}: {
  readonly label: string
  readonly value: T
  readonly options: readonly { readonly value: T; readonly label: string }[]
  readonly onChange: (value: T) => void
  readonly className?: string
}) {
  const groupRef = useRef<HTMLDivElement | null>(null)

  useLayoutEffect(() => {
    const group = groupRef.current
    if (!group) return
    const place = () => {
      const chosen = group.querySelector<HTMLElement>('[aria-checked="true"]')
      if (!chosen) return
      group.style.setProperty("--qc-thumb-x", `${chosen.offsetLeft}px`)
      group.style.setProperty("--qc-thumb-y", `${chosen.offsetTop}px`)
      group.style.setProperty("--qc-thumb-w", `${chosen.offsetWidth}px`)
      group.style.setProperty("--qc-thumb-h", `${chosen.offsetHeight}px`)
      if (!group.dataset.measured) {
        group.dataset.measured = "true"
        // Slide only after the first placement, so the thumb never sweeps in from the corner.
        requestAnimationFrame(() => (group.dataset.animate = "true"))
      }
    }
    place()
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(place)
    observer?.observe(group)
    return () => observer?.disconnect()
  }, [value, options])

  const onKeyDown = (event: KeyboardEvent) => {
    const step = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0
    if (step === 0) return
    event.preventDefault()
    const index = options.findIndex((option) => option.value === value)
    const next = options[(index + step + options.length) % options.length]
    if (!next) return
    onChange(next.value)
    groupRef.current?.querySelector<HTMLElement>(`[data-value="${next.value}"]`)?.focus()
  }

  return (
    <div ref={groupRef} className={`qc-segment${className ? ` ${className}` : ""}`} role="radiogroup" aria-label={label} onKeyDown={onKeyDown}>
      <span className="qc-segment-thumb" aria-hidden="true" />
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          data-value={option.value}
          aria-checked={option.value === value}
          tabIndex={option.value === value ? 0 : -1}
          onClick={() => onChange(option.value)}
        >
          {option.label}
        </button>
      ))}
    </div>
  )
}

/** Animates its children open and closed by height; closed content is inert. */
export function Collapse({ open, children }: { readonly open: boolean; readonly children: ReactNode }) {
  return (
    <div className="qc-collapse" data-open={open || undefined} inert={!open}>
      <div>{children}</div>
    </div>
  )
}

/**
 * A list that shows its first `cap` items and folds the rest behind a "show all" toggle that
 * animates open. `forceOpen` keeps it open, e.g. while a selected item sits past the cap.
 */
export function CappedList<T>({
  items,
  cap,
  className,
  render,
  showAll,
  showLess,
  forceOpen = false,
}: {
  readonly items: readonly T[]
  readonly cap: number
  readonly className: string
  readonly render: (item: T, position: number) => ReactNode
  readonly showAll: string
  readonly showLess: string
  readonly forceOpen?: boolean
}) {
  const [expanded, setExpanded] = useState(false)
  const open = expanded || forceOpen
  return (
    <>
      <ul className={className}>{items.slice(0, cap).map(render)}</ul>
      {items.length > cap ? (
        <>
          <Collapse open={open}>
            <ul className={className}>{items.slice(cap).map((item, offset) => render(item, cap + offset))}</ul>
          </Collapse>
          <button type="button" className="qc-more" aria-expanded={open} disabled={forceOpen} onClick={() => setExpanded(!open)}>
            {open ? showLess : showAll}
            <Icon name="chevron" size={12} />
          </button>
        </>
      ) : null}
    </>
  )
}

/** The current time, ticking every `ms` so relative times stay fresh. */
export function useNow(ms: number): number {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), ms)
    return () => clearInterval(timer)
  }, [ms])
  return now
}

/** `value`, settled for `ms` before it updates. */
export function useDebounced<T>(value: T, ms: number): T {
  const [settled, setSettled] = useState(value)
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), ms)
    return () => clearTimeout(timer)
  }, [value, ms])
  return settled
}

const ICONS = {
  search: "M11 11l3 3M7 12A5 5 0 1 0 7 2a5 5 0 0 0 0 10z",
  close: "M4 4l8 8M12 4l-8 8",
  sparkle: "M8 1.5l1.6 4.4 4.4 1.6-4.4 1.6L8 13.5 6.4 9.1 2 7.5l4.4-1.6zM13 11.5l.6 1.4 1.4.6-1.4.6-.6 1.4-.6-1.4-1.4-.6 1.4-.6z",
  tool: "M10.5 2.5a3 3 0 0 0-3.7 3.9L2.5 10.7 5.3 13.5l4.3-4.3a3 3 0 0 0 3.9-3.7L11.6 7.4 9.6 6.4 8.6 4.4z",
  terminal: "M2.5 3.5h11v9h-11zM5 6.5l2 1.5-2 1.5M8.5 10H11",
  inbox: "M2 9l1.8-5.5h8.4L14 9v3.5H2zM2 9h3.5l1 1.5h3l1-1.5H14",
  chevron: "M4.5 6.5L8 10l3.5-3.5",
  refresh: "M13 8A5 5 0 1 1 11.5 4.5M12.2 2.2V5H9.4",
  scissors: "M6.3 4.5a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0zM6.3 11.5a1.8 1.8 0 1 1-3.6 0a1.8 1.8 0 1 1 3.6 0zM6 5.6l7.5 6M6 10.4l7.5-6",
  alert: "M8 2.2l6.2 11H1.8zM8 6.5v3M8 11.4v.1",
  folder: "M2 4h4l1.5 1.5H14v7H2z",
  branch: "M5 2.5v11M12.5 5a1.5 1.5 0 1 1-3 0a1.5 1.5 0 1 1 3 0zM11 6.5c0 3-6 2.5-6 5",
  chip: "M4.5 4.5h7v7h-7zM6.5 2v2.5M9.5 2v2.5M6.5 11.5V14M9.5 11.5V14M2 6.5h2.5M2 9.5h2.5M11.5 6.5H14M11.5 9.5H14",
  file: "M4 1.8h5l3 3v9.4H4zM9 1.8v3h3",
  gauge: "M2.5 11a5.5 5.5 0 1 1 11 0M8 11l2.5-3.5",
} as const

export type IconName = keyof typeof ICONS

export function Icon({ name, size = 16 }: { readonly name: IconName; readonly size?: number }) {
  return (
    <svg className="qc-icon" width={size} height={size} viewBox="0 0 16 16" aria-hidden="true">
      <path d={ICONS[name]} fill="none" stroke="currentColor" strokeWidth={1.4} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/** Friendly empty state: an icon, a line of text, an optional hint and action. */
export function EmptyState({
  icon,
  title,
  hint,
  action,
  compact,
}: {
  readonly icon: IconName
  readonly title: ReactNode
  readonly hint?: ReactNode
  readonly action?: ReactNode
  readonly compact?: boolean
}) {
  return (
    <div className="qc-empty-state" data-compact={compact || undefined}>
      <span className="qc-empty-icon">
        <Icon name={icon} size={compact ? 16 : 20} />
      </span>
      <span className="qc-empty-title">{title}</span>
      {hint ? <span className="qc-empty-hint">{hint}</span> : null}
      {action ? <div className="qc-empty-action">{action}</div> : null}
    </div>
  )
}
