export const BASE_SERVER_PORT = 3001
export const BASE_WEB_PORT = 5173
export const MAX_HASH_OFFSET = 3000
export const MAX_PORT = 65_535

// HTTP(S) requests to these ports are blocked by the Fetch standard before a
// browser reaches the network. Keep the complete list here so a hashed offset
// cannot produce a URL that curl accepts but browsers reject.
// https://fetch.spec.whatwg.org/#port-blocking
const FETCH_BAD_PORTS = new Set([
  0, 1, 7, 9, 11, 13, 15, 17, 19, 20, 21, 22, 23, 25, 37, 42, 43, 53, 69, 77, 79, 87, 95, 101, 102,
  103, 104, 109, 110, 111, 113, 115, 117, 119, 123, 135, 137, 139, 143, 161, 179, 389, 427, 465,
  512, 513, 514, 515, 526, 530, 531, 532, 540, 548, 554, 556, 563, 587, 601, 636, 989, 990, 993,
  995, 1719, 1720, 1723, 2049, 3659, 4045, 4190, 5060, 5061, 6000, 6566, 6665, 6666, 6667, 6668,
  6669, 6679, 6697, 10080,
])

export type DevPortRole = "server" | "web"

export type DevPortOffset = {
  readonly offset: number
  readonly source: string
}

export type DevPortPair = {
  readonly serverPort: number
  readonly webPort: number
}

export type OffsetResolution =
  | { readonly _tag: "ok"; readonly offset: number; readonly source: string }
  | { readonly _tag: "invalid"; readonly portOffset: number }

export type AvailableOffset =
  | { readonly _tag: "ok"; readonly offset: number }
  | { readonly _tag: "exhausted"; readonly startOffset: number }

export type ParsedDevPort =
  | { readonly _tag: "ok"; readonly port: number }
  | { readonly _tag: "empty" }
  | { readonly _tag: "invalid" }

export type OffsetProbe =
  | {
      readonly _tag: "probe"
      readonly offset: number
      readonly serverPort: number
      readonly webPort: number
    }
  | { readonly _tag: "exhausted"; readonly startOffset: number }

export const invalidPortOffsetMessage = (portOffset: number): string =>
  `NOYAU_PORT_OFFSET must be at least 0; received ${String(portOffset)}.`

export const exhaustedPortsMessage = (startOffset: number): string =>
  `No required dev ports were available from offset ${String(startOffset)} through maximum port ${String(MAX_PORT)}.`

/** FNV-1a 32-bit, then folded into `1…MAX_HASH_OFFSET` so offset 0 stays the main checkout. */
export const hashPortOffset = (seed: string): number => {
  let hash = 2_166_136_261
  for (const char of seed) {
    hash ^= char.codePointAt(0) ?? 0
    hash = Math.imul(hash, 16_777_619)
  }
  return ((hash >>> 0) % MAX_HASH_OFFSET) + 1
}

export const isBrowserAllowedPort = (port: number): boolean => !FETCH_BAD_PORTS.has(port)

export const parseDevPort = (raw: string | undefined): ParsedDevPort => {
  const trimmed = raw?.trim()
  if (trimmed === undefined || trimmed === "") {
    return { _tag: "empty" }
  }
  if (!/^\d+$/.test(trimmed)) {
    return { _tag: "invalid" }
  }
  const port = Number(trimmed)
  if (port < 1 || port > MAX_PORT) {
    return { _tag: "invalid" }
  }
  return { _tag: "ok", port }
}

export const readDevPort = (raw: string | undefined, fallback: number): number => {
  const parsed = parseDevPort(raw)
  return parsed._tag === "ok" ? parsed.port : fallback
}

export const portPairForOffset = (offset: number): DevPortPair => ({
  serverPort: BASE_SERVER_PORT + offset,
  webPort: BASE_WEB_PORT + offset,
})

const offsetPairIsExhausted = (
  offset: number,
  requireServerPort: boolean,
  requireWebPort: boolean,
): boolean => {
  const { serverPort, webPort } = portPairForOffset(offset)
  const serverPortOutOfRange = serverPort > MAX_PORT
  const webPortOutOfRange = webPort > MAX_PORT
  return (
    (requireServerPort && serverPortOutOfRange) ||
    (requireWebPort && webPortOutOfRange) ||
    (!requireServerPort && !requireWebPort && (serverPortOutOfRange || webPortOutOfRange))
  )
}

const offsetPairShouldSkip = (
  offset: number,
  requireServerPort: boolean,
  requireWebPort: boolean,
): boolean => {
  const { serverPort, webPort } = portPairForOffset(offset)
  return (
    (requireWebPort && !isBrowserAllowedPort(webPort)) ||
    (requireServerPort && !isBrowserAllowedPort(serverPort))
  )
}

/** Yields offsets that are in range and not on a Fetch-blocked port. */
export function* iterateOffsetProbes(
  startOffset: number,
  requireServerPort: boolean,
  requireWebPort: boolean,
): Generator<OffsetProbe> {
  for (let candidate = startOffset; ; candidate += 1) {
    if (offsetPairIsExhausted(candidate, requireServerPort, requireWebPort)) {
      yield { _tag: "exhausted", startOffset }
      return
    }
    if (offsetPairShouldSkip(candidate, requireServerPort, requireWebPort)) {
      continue
    }
    const { serverPort, webPort } = portPairForOffset(candidate)
    yield { _tag: "probe", offset: candidate, serverPort, webPort }
  }
}

export const resolveOffset = (
  portOffset: number | undefined,
  devInstance: string | undefined,
  worktreePath: string | undefined,
): OffsetResolution => {
  if (portOffset !== undefined) {
    if (portOffset < 0) {
      return { _tag: "invalid", portOffset }
    }
    return { _tag: "ok", offset: portOffset, source: `NOYAU_PORT_OFFSET=${String(portOffset)}` }
  }

  const seed = devInstance?.trim()
  if (seed !== undefined && seed.length > 0) {
    if (/^\d+$/.test(seed)) {
      return { _tag: "ok", offset: Number(seed), source: `numeric NOYAU_DEV_INSTANCE=${seed}` }
    }
    return { _tag: "ok", offset: hashPortOffset(seed), source: `hashed NOYAU_DEV_INSTANCE=${seed}` }
  }

  const worktree = worktreePath?.trim()
  if (worktree !== undefined && worktree.length > 0) {
    return { _tag: "ok", offset: hashPortOffset(worktree), source: `worktree ${worktree}` }
  }

  return { _tag: "ok", offset: 0, source: "default ports" }
}

export const findFirstAvailableOffset = (
  startOffset: number,
  requireServerPort: boolean,
  requireWebPort: boolean,
  isPortAvailable: (port: number, role: DevPortRole) => boolean,
): AvailableOffset => {
  for (const step of iterateOffsetProbes(startOffset, requireServerPort, requireWebPort)) {
    if (step._tag === "exhausted") {
      return { _tag: "exhausted", startOffset: step.startOffset }
    }
    const serverOk = !requireServerPort || isPortAvailable(step.serverPort, "server")
    const webOk = !requireWebPort || isPortAvailable(step.webPort, "web")
    if (serverOk && webOk) {
      return { _tag: "ok", offset: step.offset }
    }
  }

  return { _tag: "exhausted", startOffset }
}
