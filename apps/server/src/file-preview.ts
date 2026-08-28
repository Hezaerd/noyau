import type { WorkspaceRoot } from "@noyau/contracts/entities/environment"
import {
  FilePreviewFailed,
  type FilePreview,
  type FilePreviewImageMime,
  type FilePreviewUnsupportedReason,
} from "@noyau/contracts/file-preview"
import { Effect, FileSystem, Option, Path, Stream } from "effect"

export const TEXT_PREVIEW_BYTE_LIMIT = 64 * 1024
export const IMAGE_PREVIEW_BYTE_LIMIT = 2 * 1024 * 1024

const PNG_MAGIC = Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a)
const JPEG_MAGIC = Uint8Array.of(0xff, 0xd8, 0xff)
const GIF_MAGIC = Uint8Array.of(0x47, 0x49, 0x46, 0x38)
const RIFF_MAGIC = Uint8Array.of(0x52, 0x49, 0x46, 0x46)
const WEBP_MAGIC = Uint8Array.of(0x57, 0x45, 0x42, 0x50)
const ICO_MAGIC = Uint8Array.of(0x00, 0x00, 0x01, 0x00)

const POSIX_FILESYSTEM_ROOT_PREFIXES = [
  "/Users/",
  "/home/",
  "/tmp/",
  "/var/",
  "/etc/",
  "/opt/",
  "/mnt/",
  "/Volumes/",
  "/private/",
  "/root/",
  "/usr/",
  "/bin/",
  "/sbin/",
  "/lib/",
  "/lib64/",
  "/srv/",
  "/dev/",
  "/proc/",
  "/sys/",
  "/run/",
  "/boot/",
  "/media/",
  "/workspace/",
  "/workspaces/",
] as const

const WORKSPACE_ASSET_DIRS = ["public", "static"] as const

const IMAGE_EXTENSION_MIME = new Map<string, FilePreviewImageMime>([
  [".png", "image/png"],
  [".jpg", "image/jpeg"],
  [".jpeg", "image/jpeg"],
  [".gif", "image/gif"],
  [".webp", "image/webp"],
  [".svg", "image/svg+xml"],
  [".ico", "image/x-icon"],
])

export interface ReadFilePreviewInput {
  readonly requestedPath: string
  readonly workspaceRoot: WorkspaceRoot
}

const startsWithBytes = (bytes: Uint8Array, magic: Uint8Array, offset = 0): boolean => {
  if (bytes.length < offset + magic.length) {
    return false
  }
  return magic.every((value, index) => bytes[offset + index] === value)
}

const hasNul = (bytes: Uint8Array): boolean => bytes.includes(0)

const decodeUtf8 = (bytes: Uint8Array): string | undefined => {
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(bytes)
  } catch {
    return undefined
  }
}

const looksLikeSvg = (bytes: Uint8Array): boolean => {
  const text = decodeUtf8(bytes.slice(0, Math.min(bytes.length, 512)))
  if (text === undefined) {
    return false
  }
  return /<svg[\s>]/i.test(text.trimStart())
}

const sniffImageMime = (
  bytes: Uint8Array,
  extensionMime: FilePreviewImageMime | undefined,
): FilePreviewImageMime | undefined => {
  if (startsWithBytes(bytes, PNG_MAGIC)) {
    return "image/png"
  }
  if (startsWithBytes(bytes, JPEG_MAGIC)) {
    return "image/jpeg"
  }
  if (startsWithBytes(bytes, GIF_MAGIC)) {
    return "image/gif"
  }
  if (startsWithBytes(bytes, RIFF_MAGIC) && startsWithBytes(bytes, WEBP_MAGIC, 8)) {
    return "image/webp"
  }
  if (startsWithBytes(bytes, ICO_MAGIC)) {
    return "image/x-icon"
  }
  if (extensionMime === "image/svg+xml" || looksLikeSvg(bytes)) {
    return looksLikeSvg(bytes) ? "image/svg+xml" : undefined
  }
  return undefined
}

const stripTrailingSeparator = (value: string, sep: string): string =>
  value.length > sep.length && value.endsWith(sep) ? value.slice(0, -sep.length) : value

export const isPathInsideWorkspace = (
  candidate: string,
  workspaceRoot: string,
  pathApi: Path.Path,
): boolean => {
  const root = stripTrailingSeparator(pathApi.normalize(workspaceRoot), pathApi.sep)
  const target = stripTrailingSeparator(pathApi.normalize(candidate), pathApi.sep)
  return target === root || target.startsWith(`${root}${pathApi.sep}`)
}

const isRejectedPreviewPath = (requestedPath: string): boolean =>
  requestedPath.includes("\0") ||
  requestedPath.startsWith("~") ||
  /^[A-Za-z][A-Za-z0-9+.-]*:/.test(requestedPath)

const isPosixFilesystemRootPath = (path: string): boolean =>
  POSIX_FILESYSTEM_ROOT_PREFIXES.some(
    (prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix),
  )

const resolveRequestedPath = (
  requestedPath: string,
  workspaceRoot: WorkspaceRoot,
  pathApi: Path.Path,
): string | undefined => {
  if (isRejectedPreviewPath(requestedPath)) {
    return undefined
  }
  const resolved = pathApi.normalize(pathApi.resolve(workspaceRoot, requestedPath))
  if (isPathInsideWorkspace(resolved, workspaceRoot, pathApi)) {
    return resolved
  }
  if (pathApi.isAbsolute(requestedPath) && isPosixFilesystemRootPath(requestedPath)) {
    return undefined
  }
  if (pathApi.isAbsolute(requestedPath)) {
    const remapped = pathApi.normalize(
      pathApi.resolve(workspaceRoot, requestedPath.replace(/^[/\\]+/, "")),
    )
    return isPathInsideWorkspace(remapped, workspaceRoot, pathApi) ? remapped : undefined
  }
  return undefined
}

const workspaceAssetCandidates = (
  missingPath: string,
  workspaceRoot: WorkspaceRoot,
  pathApi: Path.Path,
): ReadonlyArray<string> => {
  const relative = pathApi.relative(workspaceRoot, missingPath)
  if (relative.length === 0 || relative.startsWith("..") || relative.includes(pathApi.sep)) {
    return []
  }
  return WORKSPACE_ASSET_DIRS.map((directory) =>
    pathApi.normalize(pathApi.join(workspaceRoot, directory, relative)),
  ).filter((candidate) => isPathInsideWorkspace(candidate, workspaceRoot, pathApi))
}

const mtimeMsOf = (info: FileSystem.File.Info): number =>
  Option.match(info.mtime, {
    onNone: () => 0,
    onSome: (mtime) => Math.max(0, mtime.getTime()),
  })

const unsupported = (reason: FilePreviewUnsupportedReason, mtimeMs: number): FilePreview => ({
  kind: "unsupported",
  reason,
  mtimeMs,
})

const readCappedBytes = (
  fileSystem: FileSystem.FileSystem,
  filePath: string,
  byteSize: number,
  limit: number,
): Effect.Effect<Uint8Array, FilePreviewFailed> => {
  const bytesToRead = Math.min(byteSize, limit)
  if (bytesToRead === 0) {
    return Effect.succeed(new Uint8Array())
  }
  if (byteSize <= limit) {
    return fileSystem
      .readFile(filePath)
      .pipe(Effect.mapError(() => new FilePreviewFailed({ reason: "unreadable" })))
  }
  return fileSystem.stream(filePath, { bytesToRead }).pipe(
    Stream.runFold(
      () => new Uint8Array(0),
      (acc, chunk) => {
        const next = new Uint8Array(acc.length + chunk.length)
        next.set(acc)
        next.set(chunk, acc.length)
        return next
      },
    ),
    Effect.mapError(() => new FilePreviewFailed({ reason: "unreadable" })),
  )
}

export const readFilePreview = Effect.fn("readFilePreview")(function* (
  input: ReadFilePreviewInput,
): Effect.fn.Return<FilePreview, FilePreviewFailed, FileSystem.FileSystem | Path.Path> {
  const fileSystem = yield* FileSystem.FileSystem
  const pathApi = yield* Path.Path
  const lexical = resolveRequestedPath(input.requestedPath, input.workspaceRoot, pathApi)
  if (lexical === undefined || !isPathInsideWorkspace(lexical, input.workspaceRoot, pathApi)) {
    return yield* new FilePreviewFailed({ reason: "outside-workspace" })
  }

  let target = lexical
  const exists = yield* fileSystem
    .exists(target)
    .pipe(Effect.mapError(() => new FilePreviewFailed({ reason: "unreadable" })))
  if (!exists) {
    const found = yield* Effect.gen(function* () {
      for (const candidate of workspaceAssetCandidates(lexical, input.workspaceRoot, pathApi)) {
        if (
          yield* fileSystem
            .exists(candidate)
            .pipe(Effect.mapError(() => new FilePreviewFailed({ reason: "unreadable" })))
        ) {
          return candidate
        }
      }
      return undefined
    })
    if (found === undefined) {
      return yield* new FilePreviewFailed({ reason: "not-found" })
    }
    target = found
  }

  const workspaceReal = yield* fileSystem
    .realPath(input.workspaceRoot)
    .pipe(Effect.orElseSucceed(() => pathApi.normalize(input.workspaceRoot)))
  const real = yield* fileSystem
    .realPath(target)
    .pipe(Effect.mapError(() => new FilePreviewFailed({ reason: "not-found" })))
  if (!isPathInsideWorkspace(real, workspaceReal, pathApi)) {
    return yield* new FilePreviewFailed({ reason: "outside-workspace" })
  }

  const info = yield* fileSystem
    .stat(real)
    .pipe(Effect.mapError(() => new FilePreviewFailed({ reason: "unreadable" })))
  const mtimeMs = mtimeMsOf(info)
  const byteSize = Number(info.size)
  if (info.type === "Directory") {
    return unsupported("directory", mtimeMs)
  }
  if (info.type !== "File") {
    return unsupported("binary", mtimeMs)
  }
  if (!Number.isFinite(byteSize) || byteSize < 0) {
    return yield* new FilePreviewFailed({ reason: "unreadable" })
  }
  if (byteSize === 0) {
    return unsupported("empty", mtimeMs)
  }

  const extensionMime = IMAGE_EXTENSION_MIME.get(pathApi.extname(real).toLowerCase())
  const head = yield* readCappedBytes(fileSystem, real, byteSize, Math.min(byteSize, 512))
  const imageMime = sniffImageMime(head, extensionMime)

  if (imageMime !== undefined) {
    if (byteSize > IMAGE_PREVIEW_BYTE_LIMIT) {
      return unsupported("too-large", mtimeMs)
    }
    const bytes =
      head.length === byteSize ? head : yield* readCappedBytes(fileSystem, real, byteSize, byteSize)
    return { kind: "image", mime: imageMime, bytes, mtimeMs }
  }

  if (extensionMime !== undefined) {
    return unsupported("binary", mtimeMs)
  }

  const textBytes = yield* readCappedBytes(fileSystem, real, byteSize, TEXT_PREVIEW_BYTE_LIMIT)
  if (hasNul(textBytes)) {
    return unsupported("binary", mtimeMs)
  }
  const text = decodeUtf8(textBytes)
  if (text === undefined) {
    return unsupported("binary", mtimeMs)
  }
  return {
    kind: "text",
    text,
    truncated: byteSize > TEXT_PREVIEW_BYTE_LIMIT,
    mtimeMs,
  }
})
