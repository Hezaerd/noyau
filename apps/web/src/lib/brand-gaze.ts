const GAZE_MAX_RIGHT = 2.8
const GAZE_MAX_LEFT = 2.2
const GAZE_MAX_UP = 2.6
const GAZE_MAX_DOWN = 2
const GAZE_SQUISH_X = 0.04
const GAZE_SQUISH_Y = 0.03

export const GAZE_LERP = 0.16

export interface GazeAxes {
  readonly nx: number
  readonly ny: number
}

export interface GazePose {
  readonly x: number
  readonly y: number
  readonly scaleX: number
  readonly scaleY: number
}

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value))

export const REST_GAZE: GazePose = { x: 0, y: 0, scaleX: 1, scaleY: 1 }

export function gazeAxes(x: number, y: number, width: number, height: number): GazeAxes {
  if (width <= 0 || height <= 0) {
    return { nx: 0, ny: 0 }
  }
  return {
    nx: clamp((x / width) * 2 - 1, -1, 1),
    ny: clamp((y / height) * 2 - 1, -1, 1),
  }
}

export function gazeTransform(nx: number, ny: number): GazePose {
  return {
    x: nx * (nx > 0 ? GAZE_MAX_RIGHT : GAZE_MAX_LEFT),
    y: ny * (ny < 0 ? GAZE_MAX_UP : GAZE_MAX_DOWN),
    scaleX: 1 - GAZE_SQUISH_X * Math.abs(nx),
    scaleY: 1 - GAZE_SQUISH_Y * Math.abs(ny),
  }
}

export function lerpGaze(current: GazePose, target: GazePose, t: number): GazePose {
  return {
    x: current.x + (target.x - current.x) * t,
    y: current.y + (target.y - current.y) * t,
    scaleX: current.scaleX + (target.scaleX - current.scaleX) * t,
    scaleY: current.scaleY + (target.scaleY - current.scaleY) * t,
  }
}

export function applyGazeToEyes(eyes: Iterable<SVGElement>, pose: GazePose): void {
  const transform = `translate(${pose.x}px, ${pose.y}px) scale(${pose.scaleX}, ${pose.scaleY})`
  for (const eye of eyes) {
    eye.style.transform = transform
  }
}
