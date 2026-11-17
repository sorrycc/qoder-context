import { useCallback, useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type FocusEvent, type KeyboardEvent, type PointerEvent, type ReactNode, type RefObject } from "react"

/** Where a chart item sits, in the tooltip host's coordinates. */
export interface Anchor {
  readonly x: number
  readonly top: number
  readonly bottom: number
}

const GAP = 8
const EDGE = 4

/**
 * Places a `width`×`height` tooltip centred over `anchor`, kept inside `[0, hostWidth]` where it fits.
 * It flips below the anchor when there isn't `height + GAP` of room above it (`roomAbove`, measured
 * from the anchor's top to the viewport's top).
 */
export function placeTip(anchor: Anchor, width: number, height: number, hostWidth: number, roomAbove: number) {
  const half = width / 2
  const x = width + EDGE * 2 >= hostWidth ? hostWidth / 2 : Math.min(Math.max(anchor.x, half + EDGE), hostWidth - half - EDGE)
  const below = roomAbove < height + GAP
  return { left: x - half, top: below ? anchor.bottom + GAP : anchor.top - height - GAP, below }
}

export type RovingLayout = { readonly kind: "row" } | { readonly kind: "grid"; readonly rows: number }

/**
 * The index a key moves the active item to, or undefined when the key isn't a navigation key.
 * Rows move with Left/Right; grids are column-major (`rows` items per column), so Up/Down step one
 * item and Left/Right step a whole column.
 */
export function nextIndex(key: string, current: number | null, count: number, layout: RovingLayout): number | undefined {
  if (count <= 0) return undefined
  const from = current ?? -1
  const column = layout.kind === "grid" ? layout.rows : 1
  const step: Record<string, number> = { ArrowRight: column, ArrowLeft: -column }
  if (layout.kind === "grid") Object.assign(step, { ArrowDown: 1, ArrowUp: -1 })
  if (key === "Home") return 0
  if (key === "End") return count - 1
  const delta = step[key]
  if (delta === undefined) return undefined
  if (current === null) return delta > 0 ? 0 : count - 1
  return Math.min(count - 1, Math.max(0, from + delta))
}

export interface ChartTip {
  readonly hostRef: RefObject<HTMLDivElement | null>
  readonly active: number | null
  /** Shows the tooltip for item `index`, anchored to the host's `[data-qc-tip="index"]` element. */
  readonly show: (index: number) => void
  readonly hide: () => void
  /** Spread onto the focusable chart surface for arrow-key navigation. */
  readonly keyboard: (count: number, layout?: RovingLayout, onEnter?: (index: number) => void) => {
    readonly tabIndex: 0
    readonly "aria-describedby": string
    readonly onKeyDown: (event: KeyboardEvent) => void
    readonly onFocus: () => void
    readonly onBlur: () => void
  }
  readonly id: string
  readonly anchor: Anchor | null
  readonly open: boolean
}

/**
 * Hover/focus state for one chart. The last item stays rendered while the tooltip fades out, so
 * `active` (what to highlight) and `open` (whether the tooltip shows) are tracked apart.
 */
export function useChartTip(): ChartTip {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const id = useId()
  const [state, setState] = useState<{ index: number | null; anchor: Anchor | null }>({ index: null, anchor: null })

  const show = useCallback((index: number) => {
    const host = hostRef.current
    const target = host?.querySelector(`[data-qc-tip="${index}"]`)
    if (!host || !target) return
    const base = host.getBoundingClientRect()
    const rect = target.getBoundingClientRect()
    const anchor = { x: rect.left + rect.width / 2 - base.left, top: rect.top - base.top, bottom: rect.bottom - base.top }
    setState({ index, anchor })
  }, [])
  const hide = useCallback(() => setState((current) => (current.index === null ? current : { ...current, index: null })), [])

  const indexRef = useRef(state.index)
  indexRef.current = state.index
  const keyboard = useCallback<ChartTip["keyboard"]>(
    (count, layout = { kind: "row" }, onEnter) => ({
      tabIndex: 0,
      "aria-describedby": id,
      onKeyDown: (event) => {
        if (event.key === "Escape") return hide()
        if ((event.key === "Enter" || event.key === " ") && onEnter && indexRef.current !== null) {
          event.preventDefault()
          return onEnter(indexRef.current)
        }
        const next = nextIndex(event.key, indexRef.current, count, layout)
        if (next === undefined) return
        event.preventDefault()
        show(next)
      },
      onFocus: () => {
        if (indexRef.current === null && count > 0) show(count - 1)
      },
      onBlur: hide,
    }),
    [hide, id, show],
  )

  return { hostRef, active: state.index, show, hide, keyboard, id, anchor: state.anchor, open: state.index !== null }
}

/** The `data-qc-tip` index of the item an event came from, or null. */
function tipIndexOf(target: EventTarget | null): number | null {
  const item = target instanceof Element ? target.closest("[data-qc-tip]") : null
  return item ? Number(item.getAttribute("data-qc-tip")) : null
}

/**
 * Delegated hover/focus handlers for a list of `[data-qc-tip]` items, spread onto their container.
 * A resting pointer opens the tooltip after `delayMs`; once open it follows the pointer from item to
 * item at once, and crossing a gap between items doesn't close it. Keyboard focus opens it at once.
 */
export function useHoverTip(tip: ChartTip, delayMs: number) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const openRef = useRef(tip.open)
  openRef.current = tip.open
  const { show, hide } = tip
  useEffect(() => () => clearTimeout(timer.current ?? undefined), [])

  return useMemo(() => {
    const schedule = (index: number | null) => {
      clearTimeout(timer.current ?? undefined)
      if (index === null) timer.current = setTimeout(hide, 80)
      else if (openRef.current) show(index)
      else timer.current = setTimeout(() => show(index), delayMs)
    }
    return {
      onPointerOver: (event: PointerEvent) => schedule(tipIndexOf(event.target)),
      onPointerLeave: () => schedule(null),
      onFocus: (event: FocusEvent) => {
        const index = tipIndexOf(event.target)
        clearTimeout(timer.current ?? undefined)
        if (index !== null) show(index)
      },
      onBlur: () => {
        clearTimeout(timer.current ?? undefined)
        hide()
      },
    }
  }, [delayMs, hide, show])
}

/**
 * Floating card for a chart; render it inside the element that carries `tip.hostRef`. It glides
 * between items while open but appears in place when it opens, so it never slides in from a stale spot.
 */
export function Tooltip({ tip, children }: { readonly tip: ChartTip; readonly children: ReactNode }) {
  const ref = useRef<HTMLDivElement | null>(null)
  const wasOpen = useRef(false)
  const [place, setPlace] = useState<{ left: number; top: number; below: boolean; glide: boolean } | null>(null)
  const { anchor, open } = tip

  useLayoutEffect(() => {
    const node = ref.current
    const host = tip.hostRef.current
    const glide = wasOpen.current
    wasOpen.current = open
    if (!node || !host || !anchor || !open) return
    const roomAbove = host.getBoundingClientRect().top + anchor.top
    setPlace({ ...placeTip(anchor, node.offsetWidth, node.offsetHeight, host.clientWidth, roomAbove), glide })
  }, [anchor, open, tip.hostRef])

  return (
    <div
      ref={ref}
      id={tip.id}
      role="tooltip"
      aria-live="polite"
      className="qc-tip"
      data-open={open && place ? "true" : undefined}
      data-below={place?.below ? "true" : undefined}
      data-glide={place?.glide ? "true" : undefined}
      style={place ? { translate: `${place.left}px ${place.top}px` } : undefined}
    >
      {anchor ? children : null}
    </div>
  )
}

/** Standard tooltip body: a heading and label/value rows with optional swatches. */
export function TipBody({
  title,
  rows,
  note,
}: {
  readonly title: ReactNode
  readonly rows: readonly { readonly label: ReactNode; readonly value: ReactNode; readonly color?: string }[]
  readonly note?: ReactNode
}) {
  return (
    <>
      <div className="qc-tip-title">{title}</div>
      {rows.length > 0 ? (
        <dl className="qc-tip-rows">
          {rows.map((row, index) => (
            <div key={index}>
              <dt>
                {row.color ? <i className="qc-swatch" style={{ background: row.color }} /> : null}
                {row.label}
              </dt>
              <dd>{row.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
      {note ? <div className="qc-tip-note">{note}</div> : null}
    </>
  )
}
