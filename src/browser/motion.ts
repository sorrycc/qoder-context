import { useEffect, useRef, useState, type CSSProperties } from "react"

/** Mirrors `--qc-dur-number` in styles.ts. */
export const NUMBER_MS = 600
/** Mirror `--qc-dur-slow` and `--qc-ease-out`, for Web Animations. */
export const SLIDE_MS = 360
export const EASE_OUT = "cubic-bezier(0.22, 1, 0.36, 1)"

export function prefersReducedMotion(): boolean {
  return globalThis.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false
}

export function easeOutCubic(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress))
  return 1 - (1 - clamped) ** 3
}

/** The eased value `progress` (0–1) of the way from `from` to `to`. */
export function tween(from: number, to: number, progress: number): number {
  return progress >= 1 ? to : from + (to - from) * easeOutCubic(progress)
}

/** Style that staggers a `.qc-enter` element's entrance; capped so long lists don't lag. */
export function enter(index: number, cap = 12): CSSProperties {
  return { "--qc-i": Math.min(index, cap) } as CSSProperties
}

/**
 * Counts up from 0 on mount, then eases between successive values. Jumps straight to the
 * target under prefers-reduced-motion or when either end isn't finite.
 */
export function useTweenedNumber(target: number, durationMs = NUMBER_MS): number {
  const [shown, setShown] = useState(() => (prefersReducedMotion() ? target : 0))
  const current = useRef(shown)

  useEffect(() => {
    const from = current.current
    if (from === target) return
    if (prefersReducedMotion() || !Number.isFinite(from) || !Number.isFinite(target)) {
      current.current = target
      setShown(target)
      return
    }
    const start = performance.now()
    let frame = requestAnimationFrame(function step(now) {
      const value = tween(from, target, (now - start) / durationMs)
      current.current = value
      setShown(value)
      if (value !== target) frame = requestAnimationFrame(step)
    })
    return () => cancelAnimationFrame(frame)
  }, [target, durationMs])

  return shown
}
