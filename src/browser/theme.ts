export type Scheme = "light" | "dark"

/** Parses computed `rgb()` / `rgba()` colours (comma or space syntax); anything else is null. */
export function parseRgb(color: string): readonly [number, number, number, number] | null {
  const match = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(color.trim())
  if (!match) return null
  const alphaText = match[4]
  const alpha = alphaText === undefined ? 1 : alphaText.endsWith("%") ? Number.parseFloat(alphaText) / 100 : Number(alphaText)
  return [Number(match[1]), Number(match[2]), Number(match[3]), alpha]
}

/** WCAG relative luminance of an sRGB colour, 0 (black) to 1 (white). */
export function luminance([red, green, blue]: readonly [number, number, number, ...number[]]): number {
  const linear = (channel: number) => {
    const value = channel / 255
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * linear(red) + 0.7152 * linear(green) + 0.0722 * linear(blue)
}

/** Light or dark, judged from the host surface, falling back to the text colour, then light. */
export function schemeOf(surface: string, text: string): Scheme {
  const background = parseRgb(surface)
  if (background && background[3] > 0) return luminance(background) < 0.4 ? "dark" : "light"
  const foreground = parseRgb(text)
  if (foreground) return luminance(foreground) > 0.5 ? "dark" : "light"
  return "light"
}
