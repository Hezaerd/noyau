import symbolsFontUrl from "./fonts/SymbolsNerdFontMono-Regular.woff2?url"

export const DEFAULT_TERMINAL_FONT_SIZE = 12

const TERMINAL_FONT_LOAD_TEXT = "iMW0@# ."
const TERMINAL_FONT_LOAD_VARIANTS = [
  "normal 400",
  "normal 700",
  "italic 400",
  "italic 700",
] as const

/** Faces the canvas can name. CSS `ui-monospace` is not a valid canvas family. */
export const DEFAULT_TERMINAL_FONT_FAMILY =
  '"SF Mono", "SFMono-Regular", Menlo, Monaco, Consolas, "Liberation Mono", "Symbols Nerd Font Mono", monospace'

let symbolsFontLoad: Promise<void> | null = null

export const ensureTerminalSymbolsFont = (): Promise<void> => {
  if (symbolsFontLoad !== null) {
    return symbolsFontLoad
  }
  symbolsFontLoad = (async () => {
    try {
      const face = new FontFace("Symbols Nerd Font Mono", `url(${symbolsFontUrl})`)
      document.fonts.add(await face.load())
    } catch {
      // Locally installed fallback faces still apply.
    }
  })()
  return symbolsFontLoad
}

export const loadTerminalFontFamily = async (size: number): Promise<string> => {
  await ensureTerminalSymbolsFont()
  try {
    await Promise.all(
      TERMINAL_FONT_LOAD_VARIANTS.map((variant) =>
        document.fonts.load(
          `${variant} ${size}px ${DEFAULT_TERMINAL_FONT_FAMILY}`,
          TERMINAL_FONT_LOAD_TEXT,
        ),
      ),
    )
  } catch {
    // The fixed-width fallback stack remains available if a face cannot load.
  }
  return DEFAULT_TERMINAL_FONT_FAMILY
}
