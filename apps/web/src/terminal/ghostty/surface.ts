import { GhosttyTerminalCore, type GhosttySnapshot, type GhosttyTheme } from "./core"
import { shouldBlinkTerminalCursor } from "./cursor"
import { DEFAULT_TERMINAL_FONT_SIZE, loadTerminalFontFamily } from "./fonts"
import {
  measureGhosttyCell,
  renderGhosttySnapshot,
  terminalGridSize,
  type GhosttyCellMetrics,
} from "./renderer"
import { themeFromElement } from "./theme"

const CONTENT_PADDING = 4
const CURSOR_BLINK_INTERVAL_MS = 500
const RESIZE_NOTIFY_MS = 150

/**
 * Canvas 2D surface over libghostty-vt. The PTY stays on the server; this
 * class only parses VT, paints the grid, and encodes keys back to bytes.
 */
export class GhosttyTerminalSurface {
  readonly canvas: HTMLCanvasElement
  cols = 1
  rows = 1

  private readonly mount: HTMLElement
  private readonly input: HTMLTextAreaElement
  private readonly context: CanvasRenderingContext2D
  private readonly core: GhosttyTerminalCore
  private readonly onData: (data: string) => void
  private readonly onResize: (cols: number, rows: number) => void
  private readonly resizeObserver: ResizeObserver
  private readonly reducedMotionMedia = globalThis.matchMedia?.("(prefers-reduced-motion: reduce)")
  private metrics: GhosttyCellMetrics
  private fontFamily: string
  private readonly fontSize = DEFAULT_TERMINAL_FONT_SIZE
  private snapshot: GhosttySnapshot | null = null
  private frame = 0
  private cursorTimer: number | null = null
  private cursorOn = true
  private renderedCursorY: number | null = null
  private forceFullRender = true
  private disposed = false
  private focused = false
  private resizeNotified = false
  private canvasConfigured = false
  private resizeNotifyTimer: number | null = null
  private dprMedia: MediaQueryList | null = null

  private constructor(
    mount: HTMLElement,
    canvas: HTMLCanvasElement,
    input: HTMLTextAreaElement,
    context: CanvasRenderingContext2D,
    core: GhosttyTerminalCore,
    metrics: GhosttyCellMetrics,
    fontFamily: string,
    onData: (data: string) => void,
    onResize: (cols: number, rows: number) => void,
  ) {
    this.mount = mount
    this.canvas = canvas
    this.input = input
    this.context = context
    this.core = core
    this.metrics = metrics
    this.fontFamily = fontFamily
    this.onData = onData
    this.onResize = onResize
    this.resizeObserver = new ResizeObserver(() => {
      this.fit()
    })
    this.installEvents()
    this.watchDevicePixelRatio()
    this.reducedMotionMedia?.addEventListener("change", this.onReducedMotionChange)
    document.fonts.addEventListener("loadingdone", this.onFontsLoaded)
    this.resizeObserver.observe(mount)
  }

  static async create(
    mount: HTMLElement,
    onData: (data: string) => void,
    onResize: (cols: number, rows: number) => void,
  ): Promise<GhosttyTerminalSurface> {
    const theme = themeFromElement(mount)
    const canvas = document.createElement("canvas")
    canvas.className = "block size-full cursor-text"
    canvas.setAttribute("aria-hidden", "true")

    const input = document.createElement("textarea")
    input.setAttribute("aria-label", "Terminal")
    input.autocapitalize = "off"
    input.autocomplete = "off"
    input.spellcheck = false
    input.style.cssText =
      "position:absolute;left:4px;top:4px;width:1px;height:1px;opacity:0;padding:0;border:0;resize:none;pointer-events:none;"

    mount.replaceChildren(canvas, input)
    if (getComputedStyle(mount).position === "static") {
      mount.style.position = "relative"
    }

    const context = canvas.getContext("2d", { alpha: false })
    if (context === null) {
      throw new Error("Canvas 2D is unavailable")
    }
    context.fillStyle = `rgb(${theme.background.r}, ${theme.background.g}, ${theme.background.b})`
    context.fillRect(0, 0, canvas.width, canvas.height)

    const fontFamily = await loadTerminalFontFamily(DEFAULT_TERMINAL_FONT_SIZE)
    const metrics = measureGhosttyCell(context, DEFAULT_TERMINAL_FONT_SIZE, fontFamily)
    const grid = terminalGridSize(mount.clientWidth, mount.clientHeight, metrics, CONTENT_PADDING)
    const core = await GhosttyTerminalCore.create(
      grid.cols,
      grid.rows,
      metrics.width,
      metrics.height,
      theme,
      onData,
    )
    const surface = new GhosttyTerminalSurface(
      mount,
      canvas,
      input,
      context,
      core,
      metrics,
      fontFamily,
      onData,
      onResize,
    )
    surface.fit()
    surface.requestRender()
    return surface
  }

  write(data: string): void {
    if (this.disposed) {
      return
    }
    this.core.write(data)
    this.cursorOn = true
    this.requestRender()
  }

  resetAndWrite(data: string): void {
    if (this.disposed) {
      return
    }
    this.core.resetAndWrite(data)
    this.cursorOn = true
    this.forceFullRender = true
    this.requestRender()
  }

  setTheme(theme: GhosttyTheme): void {
    if (this.disposed) {
      return
    }
    this.core.setTheme(theme)
    this.forceFullRender = true
    this.requestRender()
  }

  syncThemeFromMount(): void {
    this.setTheme(themeFromElement(this.mount))
  }

  focus(): void {
    this.input.focus({ preventScroll: true })
  }

  dispose(): void {
    if (this.disposed) {
      return
    }
    this.disposed = true
    this.resizeObserver.disconnect()
    document.fonts.removeEventListener("loadingdone", this.onFontsLoaded)
    this.dprMedia?.removeEventListener("change", this.onDevicePixelRatioChange)
    this.dprMedia = null
    this.reducedMotionMedia?.removeEventListener("change", this.onReducedMotionChange)
    if (this.resizeNotifyTimer !== null) {
      window.clearTimeout(this.resizeNotifyTimer)
      this.resizeNotifyTimer = null
      this.onResize(this.cols, this.rows)
    }
    if (this.frame !== 0) {
      window.cancelAnimationFrame(this.frame)
    }
    if (this.cursorTimer !== null) {
      window.clearTimeout(this.cursorTimer)
    }
    this.removeEvents()
    this.core.dispose()
    this.canvas.remove()
    this.input.remove()
  }

  private fit(): boolean {
    if (this.disposed) {
      return false
    }
    const width = this.mount.clientWidth
    const height = this.mount.clientHeight
    if (width <= 0 || height <= 0) {
      return false
    }
    const ratio = window.devicePixelRatio || 1
    const pixelWidth = Math.max(1, Math.round(width * ratio))
    const pixelHeight = Math.max(1, Math.round(height * ratio))
    let shouldRender = false
    if (
      this.canvas.width !== pixelWidth ||
      this.canvas.height !== pixelHeight ||
      !this.canvasConfigured
    ) {
      this.canvas.width = pixelWidth
      this.canvas.height = pixelHeight
      this.context.setTransform(ratio, 0, 0, ratio, 0, 0)
      this.canvasConfigured = true
      this.forceFullRender = true
      shouldRender = true
    }
    const grid = terminalGridSize(width, height, this.metrics, CONTENT_PADDING)
    if (grid.cols !== this.cols || grid.rows !== this.rows || !this.resizeNotified) {
      this.cols = grid.cols
      this.rows = grid.rows
      this.core.resize(grid.cols, grid.rows, this.metrics.width, this.metrics.height)
      this.notifyResize()
      this.forceFullRender = true
      shouldRender = true
    }
    if (shouldRender) {
      this.renderFrame()
    }
    return true
  }

  private notifyResize(): void {
    this.resizeNotified = true
    if (this.resizeNotifyTimer !== null) {
      window.clearTimeout(this.resizeNotifyTimer)
    }
    this.resizeNotifyTimer = window.setTimeout(() => {
      this.resizeNotifyTimer = null
      if (!this.disposed) {
        this.onResize(this.cols, this.rows)
      }
    }, RESIZE_NOTIFY_MS)
  }

  private requestRender(): void {
    if (this.disposed || this.frame !== 0) {
      return
    }
    this.frame = window.requestAnimationFrame(() => {
      this.frame = 0
      this.renderFrame()
    })
  }

  private renderFrame(): void {
    if (this.disposed) {
      return
    }
    if (this.frame !== 0) {
      window.cancelAnimationFrame(this.frame)
      this.frame = 0
    }
    this.snapshot = this.core.snapshot()
    if (!this.blinkEnabled()) {
      this.cursorOn = true
    }
    renderGhosttySnapshot({
      context: this.context,
      snapshot: this.snapshot,
      metrics: this.metrics,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      padding: CONTENT_PADDING,
      forceFull: this.forceFullRender,
      cursorOn: this.cursorOn,
      previousCursorY: this.renderedCursorY,
      focused: this.focused,
    })
    this.renderedCursorY =
      this.cursorOn && this.snapshot.cursorVisible && this.snapshot.cursorY >= 0
        ? this.snapshot.cursorY
        : null
    this.forceFullRender = false
    this.scheduleCursorBlink()
  }

  private scheduleCursorBlink(): void {
    if (this.cursorTimer !== null) {
      window.clearTimeout(this.cursorTimer)
    }
    this.cursorTimer = null
    if (!this.blinkEnabled()) {
      return
    }
    this.cursorTimer = window.setTimeout(() => {
      this.cursorTimer = null
      this.cursorOn = !this.cursorOn
      this.requestRender()
    }, CURSOR_BLINK_INTERVAL_MS)
  }

  private blinkEnabled(): boolean {
    const snapshot = this.snapshot
    if (snapshot === null) {
      return false
    }
    return shouldBlinkTerminalCursor(
      this.focused,
      snapshot.cursorBlinking,
      snapshot.cursorVisible,
      this.reducedMotionMedia?.matches ?? false,
    )
  }

  private readonly onKeyDown = (event: KeyboardEvent): void => {
    if (event.isComposing) {
      return
    }
    const encoded = this.core.encodeKey(event, "press")
    if (encoded.length === 0) {
      return
    }
    event.preventDefault()
    this.onData(encoded)
    this.cursorOn = true
    this.requestRender()
  }

  private readonly onKeyUp = (event: KeyboardEvent): void => {
    if (event.isComposing) {
      return
    }
    const encoded = this.core.encodeKey(event, "release")
    if (encoded.length === 0) {
      return
    }
    this.onData(encoded)
  }

  private readonly onPaste = (event: ClipboardEvent): void => {
    event.preventDefault()
    const text = event.clipboardData?.getData("text") ?? ""
    if (text.length === 0) {
      return
    }
    const encoded = this.core.encodePaste(text)
    if (encoded.length > 0) {
      this.onData(encoded)
    }
  }

  private readonly onPointerDown = (): void => {
    this.focus()
  }

  private readonly onWheel = (event: WheelEvent): void => {
    event.preventDefault()
    const rowDelta =
      Math.trunc(event.deltaY / this.metrics.height) ||
      (event.deltaY === 0 ? 0 : event.deltaY > 0 ? 1 : -1)
    if (rowDelta === 0) {
      return
    }
    this.core.scroll(rowDelta)
    this.forceFullRender = true
    this.requestRender()
  }

  private readonly onFocus = (): void => {
    this.focused = true
    this.cursorOn = true
    this.requestRender()
  }

  private readonly onBlur = (): void => {
    this.focused = false
    this.cursorOn = true
    this.requestRender()
  }

  private readonly onFontsLoaded = (): void => {
    if (this.disposed) {
      return
    }
    this.metrics = measureGhosttyCell(this.context, this.fontSize, this.fontFamily)
    this.forceFullRender = true
    this.fit()
  }

  private readonly onReducedMotionChange = (): void => {
    this.cursorOn = true
    this.requestRender()
  }

  private readonly onDevicePixelRatioChange = (): void => {
    this.watchDevicePixelRatio()
    this.fit()
  }

  private watchDevicePixelRatio(): void {
    this.dprMedia?.removeEventListener("change", this.onDevicePixelRatioChange)
    this.dprMedia = window.matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`)
    this.dprMedia.addEventListener("change", this.onDevicePixelRatioChange)
  }

  private installEvents(): void {
    this.input.addEventListener("keydown", this.onKeyDown)
    this.input.addEventListener("keyup", this.onKeyUp)
    this.input.addEventListener("paste", this.onPaste)
    this.input.addEventListener("focus", this.onFocus)
    this.input.addEventListener("blur", this.onBlur)
    this.canvas.addEventListener("pointerdown", this.onPointerDown)
    this.mount.addEventListener("wheel", this.onWheel, { passive: false })
  }

  private removeEvents(): void {
    this.input.removeEventListener("keydown", this.onKeyDown)
    this.input.removeEventListener("keyup", this.onKeyUp)
    this.input.removeEventListener("paste", this.onPaste)
    this.input.removeEventListener("focus", this.onFocus)
    this.input.removeEventListener("blur", this.onBlur)
    this.canvas.removeEventListener("pointerdown", this.onPointerDown)
    this.mount.removeEventListener("wheel", this.onWheel)
  }
}
