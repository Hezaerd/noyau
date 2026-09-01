export const isRendererForeground = (input: {
  readonly visibilityState: DocumentVisibilityState
  readonly hasFocus: boolean
}): boolean => input.visibilityState === "visible" && input.hasFocus

export const readRendererForeground = (): boolean =>
  isRendererForeground({
    visibilityState: document.visibilityState,
    hasFocus: document.hasFocus(),
  })
