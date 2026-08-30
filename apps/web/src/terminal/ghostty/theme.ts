import type { GhosttyColor, GhosttyTheme } from "./core"

const FALLBACK_FOREGROUND: GhosttyColor = { r: 237, g: 237, b: 242 }
const FALLBACK_BACKGROUND: GhosttyColor = { r: 15, g: 15, b: 19 }

const hexPair = (digits: string, start: number): number =>
  Number.parseInt(digits.slice(start, start + 2), 16)

export const parseCssColor = (value: string): GhosttyColor | null => {
  const trimmed = value.trim()
  const hex6 = /^#([\da-f]{6})$/i.exec(trimmed)
  const six = hex6?.[1]
  if (six !== undefined) {
    return { r: hexPair(six, 0), g: hexPair(six, 2), b: hexPair(six, 4) }
  }
  const hex3 = /^#([\da-f]{3})$/i.exec(trimmed)
  const three = hex3?.[1]
  const r3 = three?.[0]
  const g3 = three?.[1]
  const b3 = three?.[2]
  if (r3 !== undefined && g3 !== undefined && b3 !== undefined) {
    return {
      r: Number.parseInt(r3 + r3, 16),
      g: Number.parseInt(g3 + g3, 16),
      b: Number.parseInt(b3 + b3, 16),
    }
  }
  const rgb = /^rgba?\(\s*(\d+)\s*[, ]\s*(\d+)\s*[, ]\s*(\d+)/i.exec(trimmed)
  const r = rgb?.[1]
  const g = rgb?.[2]
  const b = rgb?.[3]
  if (r === undefined || g === undefined || b === undefined) {
    return null
  }
  return { r: Number(r), g: Number(g), b: Number(b) }
}

export const themeFromElement = (element: HTMLElement): GhosttyTheme => {
  const styles = getComputedStyle(element)
  const foreground = parseCssColor(styles.getPropertyValue("--foreground")) ?? FALLBACK_FOREGROUND
  const background = parseCssColor(styles.getPropertyValue("--background")) ?? FALLBACK_BACKGROUND
  return {
    foreground,
    background,
    cursor: foreground,
  }
}
