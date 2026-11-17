import type { CSSProperties, ReactNode } from "react"
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
