export const GET_CURSOR_POINT_CHANNEL = "noyau:desktop:cursor-point"

export interface CursorClientPoint {
  readonly x: number
  readonly y: number
  readonly width: number
  readonly height: number
}

export const cursorPointInContent = (
  cursor: { readonly x: number; readonly y: number },
  bounds: {
    readonly x: number
    readonly y: number
    readonly width: number
    readonly height: number
  },
): CursorClientPoint => ({
  x: cursor.x - bounds.x,
  y: cursor.y - bounds.y,
  width: bounds.width,
  height: bounds.height,
})
