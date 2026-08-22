import { collectComposerInlineTokens } from "@noyau/shared/composer-inline-tokens"

const WINDOWS_DRIVE_PATH_PATTERN = /^[A-Za-z]:[\\/]/
const WINDOWS_UNC_PATH_PATTERN = /^\\\\/
const EXTERNAL_SCHEME_PATTERN = /^([A-Za-z][A-Za-z0-9+.-]*):(.*)$/
const RELATIVE_PATH_PREFIX_PATTERN = /^(~\/|\.{1,2}\/)/
const RELATIVE_FILE_PATH_PATTERN = /^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)+(?::\d+){0,2}$/
const RELATIVE_FILE_NAME_PATTERN = /^[A-Za-z0-9._-]+\.[A-Za-z0-9_-]+(?::\d+){0,2}$/
const POSITION_SUFFIX_PATTERN = /:\d+(?::\d+)?$/
const POSITION_ONLY_PATTERN = /^\d+(?::\d+)?$/
const INLINE_CODE_DISQUALIFIER_PATTERN = /[\s`]/
const PATH_SEPARATOR_PATTERN = /[\\/]/
const FILE_EXTENSION_PATTERN = /\.[A-Za-z0-9_-]+$/
const NUMERIC_DOTTED_PATTERN = /^\d+(?:\.\d+)+$/
const BARE_EXTENSIONLESS_POSITION_PATTERN = /^[A-Za-z0-9_-]+(?::\d+){1,2}$/
const MARKDOWN_LINK_HREF_PATTERN = /\[[^\]]*]\(([^)\s]+)(?:\s+["'][^"']*["'])?\)/g
const FENCED_CODE_SEGMENT_PATTERN = /(```[\s\S]*?(?:```|$))/
const INLINE_CODE_SPAN_PATTERN = /`([^`\n]+)`/g
const INLINE_CODE_SEGMENT_PATTERN = /(`[^`\n]+`)/

const POSIX_FILE_ROOT_PREFIXES = [
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

const EXTENSIONLESS_FILE_NAMES = new Set([
  "Makefile",
  "makefile",
  "GNUmakefile",
  "Dockerfile",
  "Containerfile",
  "Justfile",
  "justfile",
  "Rakefile",
  "Gemfile",
  "Procfile",
  "Brewfile",
  "Caddyfile",
  "Vagrantfile",
  "Jenkinsfile",
  "Podfile",
  "Fastfile",
  "BUILD",
  "WORKSPACE",
  "LICENSE",
  "LICENCE",
  "COPYING",
  "NOTICE",
  "AUTHORS",
  "CONTRIBUTORS",
  "CHANGELOG",
  "README",
  "CODEOWNERS",
])

const SINGLE_LABEL_HOSTNAMES = new Set(["localhost"])

const GENERIC_HOSTNAME_TLDS = new Set([
  "com",
  "net",
  "org",
  "io",
  "dev",
  "app",
  "ai",
  "co",
  "edu",
  "gov",
  "mil",
  "info",
  "biz",
  "xyz",
  "me",
  "tv",
  "cc",
  "gg",
  "chat",
  "cloud",
  "site",
  "online",
  "tech",
  "store",
  "link",
])

const COUNTRY_HOSTNAME_TLDS = new Set([
  "uk",
  "de",
  "fr",
  "nl",
  "se",
  "no",
  "fi",
  "dk",
  "pl",
  "ch",
  "at",
  "be",
  "es",
  "it",
  "pt",
  "eu",
  "us",
  "ca",
  "au",
  "nz",
  "jp",
  "kr",
  "cn",
  "br",
  "ru",
  "mx",
  "ie",
  "cz",
  "tr",
  "sg",
  "hk",
])

export interface PathAndPosition {
  readonly path: string
  readonly line: string | undefined
  readonly column: string | undefined
}

export interface MarkdownFileLinkMeta {
  readonly filePath: string
  readonly targetPath: string
  readonly displayPath: string
  readonly workspaceRelativePath: string | null
  readonly basename: string
  readonly line: number | undefined
  readonly column: number | undefined
}

export interface ThreadMarkdownFileLinks {
  readonly workspaceRoot?: string | undefined
  readonly byHref: ReadonlyMap<string, MarkdownFileLinkMeta>
  readonly byInlineCode: ReadonlyMap<string, MarkdownFileLinkMeta>
  readonly parentSuffixByPath: ReadonlyMap<string, string>
}

export const splitPathAndPosition = (value: string): PathAndPosition => {
  let path = value
  const columnMatch = path.match(/:(\d+)$/)
  if (columnMatch?.[1] === undefined) {
    return { path, line: undefined, column: undefined }
  }

  let column: string | undefined = columnMatch[1]
  path = path.slice(0, -columnMatch[0].length)

  const lineMatch = path.match(/:(\d+)$/)
  if (lineMatch?.[1] !== undefined) {
    return { path: path.slice(0, -lineMatch[0].length), line: lineMatch[1], column }
  }

  return { path, line: column, column: undefined }
}

const isWindowsAbsolutePath = (value: string): boolean =>
  WINDOWS_DRIVE_PATH_PATTERN.test(value) || value.startsWith("\\\\")

const isAbsolutePath = (value: string): boolean =>
  value.startsWith("/") || isWindowsAbsolutePath(value)

const isWindowsPathStyle = (value: string): boolean =>
  isWindowsAbsolutePath(value) || /[A-Za-z]:\\/.test(value)

const joinPath = (base: string, next: string, separator: "/" | "\\"): string => {
  const cleanBase = base.replace(/[\\/]+$/, "")
  if (separator === "\\") {
    return `${cleanBase}\\${next.replaceAll("/", "\\")}`
  }
  return `${cleanBase}/${next.replace(/^\/+/, "")}`
}

const inferHomeFromCwd = (cwd: string): string | undefined => {
  const posixUser = cwd.match(/^\/Users\/([^/]+)/)
  if (posixUser?.[1] !== undefined) {
    return `/Users/${posixUser[1]}`
  }
  const posixHome = cwd.match(/^\/home\/([^/]+)/)
  if (posixHome?.[1] !== undefined) {
    return `/home/${posixHome[1]}`
  }
  const windowsUser = cwd.match(/^([A-Za-z]:\\Users\\[^\\]+)/)
  return windowsUser?.[1]
}

export const resolvePathLinkTarget = (rawPath: string, cwd: string): string => {
  const { path, line, column } = splitPathAndPosition(rawPath)

  let resolvedPath = path
  if (path.startsWith("~/")) {
    const home = inferHomeFromCwd(cwd)
    if (home !== undefined) {
      const separator: "/" | "\\" = isWindowsPathStyle(home) ? "\\" : "/"
      resolvedPath = joinPath(home, path.slice(2), separator)
    }
  } else if (isWorkspaceRootRelativePath(path) || !isAbsolutePath(path)) {
    const separator: "/" | "\\" = isWindowsPathStyle(cwd) ? "\\" : "/"
    resolvedPath = joinPath(cwd, path.replace(/^\/+/, ""), separator)
  }

  if (line === undefined) {
    return resolvedPath
  }
  return `${resolvedPath}:${line}${column === undefined ? "" : `:${column}`}`
}

const normalizePathSeparators = (path: string): string => path.replaceAll("\\", "/")

const canonicalizeWindowsDrivePath = (path: string): string =>
  /^\/[A-Za-z]:\//.test(path) ? path.slice(1) : path

const trimTrailingPathSeparators = (path: string): string => path.replace(/[\\/]+$/, "")

const basenameOfPath = (path: string): string => {
  const trimmed = path.replace(/[/\\]+$/, "") || path
  const separatorIndex = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"))
  return separatorIndex >= 0 ? trimmed.slice(separatorIndex + 1) : trimmed
}

const stripRelativePrefixes = (path: string): string =>
  path.replace(/^\.\/+/, "").replace(/^\/+/, "")

export const formatWorkspaceRelativePath = (
  pathWithPosition: string,
  workspaceRoot: string | undefined,
): string => {
  const { path, line, column } = splitPathAndPosition(pathWithPosition)
  const normalizedPath = canonicalizeWindowsDrivePath(normalizePathSeparators(path))

  let displayPath = normalizedPath
  if (workspaceRoot !== undefined) {
    const normalizedWorkspaceRoot = canonicalizeWindowsDrivePath(
      normalizePathSeparators(trimTrailingPathSeparators(workspaceRoot)),
    )
    const workspaceLabel = basenameOfPath(normalizedWorkspaceRoot)
    const pathForCompare = normalizedPath.toLowerCase()
    const workspaceForCompare = normalizedWorkspaceRoot.toLowerCase()
    const workspaceWithSeparator = `${workspaceForCompare}/`
    const workspaceLabelWithSeparator = `${workspaceLabel.toLowerCase()}/`

    if (pathForCompare === workspaceForCompare) {
      displayPath = workspaceLabel
    } else if (pathForCompare.startsWith(workspaceWithSeparator)) {
      displayPath = `${workspaceLabel}/${normalizedPath.slice(normalizedWorkspaceRoot.length + 1)}`
    } else if (!normalizedPath.startsWith("/")) {
      const relativePath = stripRelativePrefixes(normalizedPath)
      displayPath = pathForCompare.startsWith(workspaceLabelWithSeparator)
        ? normalizedPath
        : `${workspaceLabel}/${relativePath}`
    }
  }

  if (line === undefined) {
    return displayPath
  }
  return `${displayPath}:${line}${column === undefined ? "" : `:${column}`}`
}

const safeDecode = (value: string): string => {
  try {
    return decodeURIComponent(value)
  } catch {
    return value
  }
}

const unwrapMarkdownLinkDestination = (value: string): string =>
  value.startsWith("<") && value.endsWith(">") ? value.slice(1, -1) : value

export const normalizeMarkdownLinkDestination = (value: string): string =>
  unwrapMarkdownLinkDestination(value.trim())

interface HrefPathAndHash {
  readonly path: string
  readonly hash: string
}

const stripSearchAndHash = (value: string): HrefPathAndHash => {
  const hashIndex = value.indexOf("#")
  const pathWithSearch = hashIndex >= 0 ? value.slice(0, hashIndex) : value
  const rawHash = hashIndex >= 0 ? value.slice(hashIndex) : ""
  const queryIndex = pathWithSearch.indexOf("?")
  const path = queryIndex >= 0 ? pathWithSearch.slice(0, queryIndex) : pathWithSearch
  return { path, hash: rawHash }
}

const normalizeWindowsDrivePath = (path: string): string =>
  /^\/[A-Za-z]:[\\/]/.test(path) ? path.slice(1) : path

const parseFileUrlHref = (
  href: string,
  options?: { readonly decodePath?: boolean },
): { readonly path: string; readonly hash: string } | null => {
  try {
    const parsed = new URL(href)
    if (parsed.protocol.toLowerCase() !== "file:") {
      return null
    }
    const rawPath = parsed.pathname
    if (rawPath.length === 0) {
      return null
    }
    const normalizedPath = normalizeWindowsDrivePath(rawPath)
    return {
      path: options?.decodePath === false ? normalizedPath : safeDecode(normalizedPath),
      hash: parsed.hash,
    }
  } catch {
    return null
  }
}

export const rewriteMarkdownFileUriHref = (href: string | undefined): string | null => {
  if (href === undefined || href.length === 0) {
    return null
  }
  const target = parseFileUrlHref(normalizeMarkdownLinkDestination(href), { decodePath: false })
  if (target === null) {
    return null
  }
  return `${target.path}${target.hash}`
}

const isPosixFilesystemRootPath = (path: string): boolean =>
  POSIX_FILE_ROOT_PREFIXES.some((prefix) => path === prefix.slice(0, -1) || path.startsWith(prefix))

const looksLikePosixFilesystemPath = (path: string): boolean => {
  if (!path.startsWith("/")) {
    return false
  }
  if (isPosixFilesystemRootPath(path)) {
    return true
  }
  if (POSITION_SUFFIX_PATTERN.test(path)) {
    return true
  }
  const basename = path.slice(path.lastIndexOf("/") + 1)
  return /\.[A-Za-z0-9_-]+$/.test(basename)
}

/** `/og-default.jpg` is repo-root relative, not `/` on the host. */
export const isWorkspaceRootRelativePath = (path: string): boolean =>
  path.startsWith("/") &&
  !isPosixFilesystemRootPath(path) &&
  !WINDOWS_DRIVE_PATH_PATTERN.test(path) &&
  !WINDOWS_UNC_PATH_PATTERN.test(path)

const appendLineColumnFromHash = (path: string, hash: string): string => {
  if (hash.length === 0 || POSITION_SUFFIX_PATTERN.test(path)) {
    return path
  }
  const match = hash.match(/^#L(\d+)(?:C(\d+))?$/i)
  if (match?.[1] === undefined) {
    return path
  }
  const column = match[2]
  return `${path}:${match[1]}${column === undefined ? "" : `:${column}`}`
}

const isLikelyPathCandidate = (path: string): boolean => {
  if (WINDOWS_DRIVE_PATH_PATTERN.test(path) || WINDOWS_UNC_PATH_PATTERN.test(path)) {
    return true
  }
  if (RELATIVE_PATH_PREFIX_PATTERN.test(path)) {
    return true
  }
  if (path.startsWith("/")) {
    return looksLikePosixFilesystemPath(path)
  }
  return RELATIVE_FILE_PATH_PATTERN.test(path) || RELATIVE_FILE_NAME_PATTERN.test(path)
}

const isRelativePath = (path: string): boolean =>
  RELATIVE_PATH_PREFIX_PATTERN.test(path) ||
  (!path.startsWith("/") &&
    !WINDOWS_DRIVE_PATH_PATTERN.test(path) &&
    !WINDOWS_UNC_PATH_PATTERN.test(path))

const hasExternalScheme = (path: string): boolean => {
  const match = path.match(EXTERNAL_SCHEME_PATTERN)
  if (match === null) {
    return false
  }
  const rest = match[2] ?? ""
  if (rest.startsWith("//")) {
    return true
  }
  return !POSITION_ONLY_PATTERN.test(rest)
}

export const resolveMarkdownFileLinkTarget = (
  href: string | undefined,
  cwd?: string,
): string | null => {
  if (href === undefined) {
    return null
  }
  const rawHref = normalizeMarkdownLinkDestination(href)
  if (rawHref.length === 0 || rawHref.startsWith("#")) {
    return null
  }

  const fileUrlTarget = rawHref.toLowerCase().startsWith("file:") ? parseFileUrlHref(rawHref) : null
  const source = fileUrlTarget ?? stripSearchAndHash(rawHref)
  const decodedPath = normalizeWindowsDrivePath(
    fileUrlTarget !== null ? source.path.trim() : safeDecode(source.path.trim()),
  )
  const decodedHash = safeDecode(source.hash.trim())

  if (decodedPath.length === 0) {
    return null
  }
  if (
    !WINDOWS_DRIVE_PATH_PATTERN.test(decodedPath) &&
    !WINDOWS_UNC_PATH_PATTERN.test(decodedPath) &&
    hasExternalScheme(decodedPath)
  ) {
    return null
  }
  if (!isLikelyPathCandidate(decodedPath)) {
    return null
  }

  const pathWithPosition = appendLineColumnFromHash(decodedPath, decodedHash)
  if (isWorkspaceRootRelativePath(splitPathAndPosition(pathWithPosition).path)) {
    return cwd === undefined ? pathWithPosition : resolvePathLinkTarget(pathWithPosition, cwd)
  }
  if (!isRelativePath(pathWithPosition)) {
    return pathWithPosition
  }
  if (cwd === undefined) {
    return null
  }
  return resolvePathLinkTarget(pathWithPosition, cwd)
}

const FILE_HREF_PROBE_CWD = "/"
const THREAD_FILE_HREF_ORIGIN = "https://file.invalid"

export const encodeThreadMarkdownFileHref = (targetPath: string): string =>
  `${THREAD_FILE_HREF_ORIGIN}/?p=${encodeURIComponent(targetPath)}`

export const decodeThreadMarkdownFileHref = (href: string): string | null => {
  try {
    const url = new URL(href)
    if (url.origin !== THREAD_FILE_HREF_ORIGIN) {
      return null
    }
    const path = url.searchParams.get("p")
    return path !== null && path.length > 0 ? path : null
  } catch {
    return null
  }
}

export const transformThreadMarkdownFileHref = (
  href: string,
  workspaceRoot: string | undefined,
): string | null => {
  const decoded = decodeThreadMarkdownFileHref(href)
  if (decoded !== null) {
    return encodeThreadMarkdownFileHref(decoded)
  }
  const rewritten = rewriteMarkdownFileUriHref(href)
  const candidate = rewritten ?? href
  const target = resolveMarkdownFileLinkTarget(candidate, workspaceRoot ?? FILE_HREF_PROBE_CWD)
  if (target === null) {
    return null
  }
  return encodeThreadMarkdownFileHref(target)
}

const markdownFileLinkFromMentionPath = (path: string): string => {
  const label = basenameOfPath(path).replaceAll("\\", "\\\\").replaceAll("]", "\\]")
  const href = /[\s()]/.test(path) ? `<${path}>` : path
  return `[${label}](${href})`
}

const rewriteComposerMentionsInProse = (text: string): string => {
  const mentions = collectComposerInlineTokens(text).filter((token) => token.type === "mention")
  if (mentions.length === 0) {
    return text
  }
  let output = ""
  let cursor = 0
  for (const mention of mentions) {
    if (mention.start < cursor) {
      continue
    }
    output += text.slice(cursor, mention.start)
    output += mention.source.startsWith("[")
      ? mention.source
      : markdownFileLinkFromMentionPath(mention.value)
    cursor = mention.end
  }
  return output + text.slice(cursor)
}

const rewriteComposerMentionsOutsideInlineCode = (text: string): string =>
  text
    .split(INLINE_CODE_SEGMENT_PATTERN)
    .map((segment, index) => (index % 2 === 1 ? segment : rewriteComposerMentionsInProse(segment)))
    .join("")

export const rewriteComposerMentionsToMarkdownFileLinks = (text: string): string => {
  const segments = text.split(FENCED_CODE_SEGMENT_PATTERN)
  return segments
    .map((segment, index) =>
      index % 2 === 1 ? segment : rewriteComposerMentionsOutsideInlineCode(segment),
    )
    .join("")
}

export const rewriteMarkdownFileLinkDestinations = (
  text: string,
  workspaceRoot: string | undefined,
): string => {
  const segments = text.split(FENCED_CODE_SEGMENT_PATTERN)
  return segments
    .map((segment, index) => {
      if (index % 2 === 1) {
        return segment
      }
      return segment.replace(MARKDOWN_LINK_HREF_PATTERN, (full, href: string) => {
        const transformed = transformThreadMarkdownFileHref(href, workspaceRoot)
        if (transformed === null) {
          return full
        }
        return full.replace(`(${href}`, `(${transformed}`)
      })
    })
    .join("")
}

const looksLikeHostname = (segment: string, hasPosition: boolean): boolean => {
  if (segment.startsWith(".")) {
    return false
  }
  const lowered = segment.toLowerCase()
  if (SINGLE_LABEL_HOSTNAMES.has(lowered)) {
    return true
  }
  if (NUMERIC_DOTTED_PATTERN.test(segment)) {
    return true
  }
  const labels = lowered.split(".")
  const lastLabel = labels[labels.length - 1]
  if (labels.length < 2 || lastLabel === undefined) {
    return false
  }
  if (GENERIC_HOSTNAME_TLDS.has(lastLabel)) {
    return true
  }
  return !hasPosition && COUNTRY_HOSTNAME_TLDS.has(lastLabel)
}

const workspaceRelativePath = (path: string, workspaceRoot: string | undefined): string | null => {
  if (workspaceRoot === undefined) {
    return null
  }
  const normalizedPath = normalizeWindowsDrivePath(path.replaceAll("\\", "/"))
  const normalizedRoot = normalizeWindowsDrivePath(workspaceRoot.replaceAll("\\", "/")).replace(
    /\/+$/,
    "",
  )
  if (!normalizedPath.toLowerCase().startsWith(`${normalizedRoot.toLowerCase()}/`)) {
    return null
  }
  return normalizedPath.slice(normalizedRoot.length + 1)
}

const buildFileLinkMetaFromTarget = (targetPath: string, cwd?: string): MarkdownFileLinkMeta => {
  const { path, line, column } = splitPathAndPosition(targetPath)
  const parsedLine = line === undefined ? Number.NaN : Number.parseInt(line, 10)
  const parsedColumn = column === undefined ? Number.NaN : Number.parseInt(column, 10)
  const lineNumber = Number.isFinite(parsedLine) ? parsedLine : undefined
  const columnNumber = Number.isFinite(parsedColumn) ? parsedColumn : undefined

  return {
    filePath: path,
    targetPath,
    displayPath: formatWorkspaceRelativePath(targetPath, cwd),
    workspaceRelativePath: workspaceRelativePath(path, cwd),
    basename: basenameOfPath(path),
    line: lineNumber,
    column: columnNumber,
  }
}

export const resolveMarkdownFileLinkMeta = (
  href: string | undefined,
  cwd?: string,
): MarkdownFileLinkMeta | null => {
  const targetPath = resolveMarkdownFileLinkTarget(href, cwd)
  if (targetPath === null) {
    return null
  }
  return buildFileLinkMetaFromTarget(targetPath, cwd)
}

export const resolveInlineCodeFileLinkMeta = (
  codeText: string,
  cwd?: string,
): MarkdownFileLinkMeta | null => {
  const trimmed = codeText.trim()
  if (trimmed.length === 0 || INLINE_CODE_DISQUALIFIER_PATTERN.test(trimmed)) {
    return null
  }

  const candidate =
    WINDOWS_DRIVE_PATH_PATTERN.test(trimmed) || WINDOWS_UNC_PATH_PATTERN.test(trimmed)
      ? trimmed
      : trimmed.replaceAll("\\", "/")

  const hasPosition = POSITION_SUFFIX_PATTERN.test(candidate)
  if (!hasPosition && !PATH_SEPARATOR_PATTERN.test(candidate)) {
    return null
  }

  const hasUnambiguousPathPrefix =
    RELATIVE_PATH_PREFIX_PATTERN.test(candidate) ||
    candidate.startsWith("/") ||
    WINDOWS_DRIVE_PATH_PATTERN.test(candidate) ||
    WINDOWS_UNC_PATH_PATTERN.test(candidate)
  if (!hasUnambiguousPathPrefix) {
    const withoutPosition = candidate.replace(POSITION_SUFFIX_PATTERN, "")
    const firstSegment = withoutPosition.split("/")[0] ?? withoutPosition
    if (looksLikeHostname(firstSegment, hasPosition)) {
      return null
    }
    if (!hasPosition && !FILE_EXTENSION_PATTERN.test(basenameOfPath(withoutPosition))) {
      return null
    }
  }

  const resolved = resolveMarkdownFileLinkMeta(candidate, cwd)
  if (resolved !== null) {
    return resolved
  }

  if (
    cwd !== undefined &&
    BARE_EXTENSIONLESS_POSITION_PATTERN.test(candidate) &&
    EXTENSIONLESS_FILE_NAMES.has(candidate.replace(POSITION_SUFFIX_PATTERN, ""))
  ) {
    return buildFileLinkMetaFromTarget(resolvePathLinkTarget(candidate, cwd), cwd)
  }
  return null
}

export const normalizeMarkdownLinkHrefKey = (href: string): string => {
  const normalizedHref = normalizeMarkdownLinkDestination(href)
  return rewriteMarkdownFileUriHref(normalizedHref) ?? normalizedHref
}

export const lookupThreadMarkdownFileLinkMeta = (
  href: string | undefined,
  fileLinks: {
    readonly byHref: ReadonlyMap<string, MarkdownFileLinkMeta>
    readonly workspaceRoot?: string | undefined
  },
): MarkdownFileLinkMeta | undefined => {
  const encodedTarget = href === undefined ? null : decodeThreadMarkdownFileHref(href)
  const normalizedHref =
    href === undefined ? "" : normalizeMarkdownLinkHrefKey(encodedTarget ?? href)
  if (normalizedHref.length === 0) {
    return undefined
  }
  return (
    fileLinks.byHref.get(normalizedHref) ??
    resolveMarkdownFileLinkMeta(normalizedHref, fileLinks.workspaceRoot) ??
    undefined
  )
}

export const extractMarkdownLinkHrefs = (text: string): readonly string[] => {
  const hrefs: string[] = []
  for (const match of text.matchAll(MARKDOWN_LINK_HREF_PATTERN)) {
    const href = match[1]?.trim()
    if (href !== undefined && href.length > 0) {
      hrefs.push(href)
    }
  }
  return hrefs
}

export const extractInlineCodeSpans = (text: string): readonly string[] => {
  const spans: string[] = []
  const segments = text.split(FENCED_CODE_SEGMENT_PATTERN)
  for (let index = 0; index < segments.length; index += 2) {
    for (const match of (segments[index] ?? "").matchAll(INLINE_CODE_SPAN_PATTERN)) {
      const span = match[1]?.trim()
      if (span !== undefined && span.length > 0) {
        spans.push(span)
      }
    }
  }
  return spans
}

const pathParentSegments = (path: string): string[] => {
  const segments = path
    .replaceAll("\\", "/")
    .split("/")
    .filter((segment) => segment.length > 0)
  return segments.slice(0, -1)
}

export const buildFileLinkParentSuffixByPath = (
  filePaths: ReadonlyArray<string>,
): ReadonlyMap<string, string> => {
  const groups = new Map<string, Set<string>>()
  for (const filePath of filePaths) {
    const pathSegments = filePath
      .replaceAll("\\", "/")
      .split("/")
      .filter((segment) => segment.length > 0)
    const basename = pathSegments[pathSegments.length - 1]
    if (basename === undefined) {
      continue
    }
    const group = groups.get(basename) ?? new Set<string>()
    group.add(filePath)
    groups.set(basename, group)
  }

  const suffixByPath = new Map<string, string>()
  for (const group of groups.values()) {
    const uniquePaths = [...group]
    if (uniquePaths.length < 2) {
      continue
    }

    const parentSegmentsByPath = new Map(
      uniquePaths.map((filePath) => [filePath, pathParentSegments(filePath)]),
    )
    const minUniqueDepthByPath = new Map<string, number>()

    for (const filePath of uniquePaths) {
      const segments = parentSegmentsByPath.get(filePath) ?? []
      let resolvedDepth = segments.length
      for (let depth = 1; depth <= segments.length; depth += 1) {
        const candidate = segments.slice(-depth).join("/")
        const collision = uniquePaths.some((otherPath) => {
          if (otherPath === filePath) {
            return false
          }
          const otherSegments = parentSegmentsByPath.get(otherPath) ?? []
          return otherSegments.slice(-depth).join("/") === candidate
        })
        if (!collision) {
          resolvedDepth = depth
          break
        }
      }
      minUniqueDepthByPath.set(filePath, resolvedDepth)
    }

    for (const filePath of uniquePaths) {
      const segments = parentSegmentsByPath.get(filePath) ?? []
      if (segments.length === 0) {
        continue
      }
      const minUniqueDepth = minUniqueDepthByPath.get(filePath) ?? 1
      const suffixDepth = Math.min(segments.length, Math.max(minUniqueDepth, 2))
      suffixByPath.set(filePath, segments.slice(-suffixDepth).join("/"))
    }
  }

  return suffixByPath
}

export const fileLinkSuffixKey = (meta: MarkdownFileLinkMeta): string =>
  meta.workspaceRelativePath ?? meta.filePath

export const fileLinkChipLabel = (
  meta: MarkdownFileLinkMeta,
  parentSuffix: string | undefined,
): string => {
  const labelParts = [meta.basename]
  if (parentSuffix !== undefined && parentSuffix.length > 0) {
    labelParts.push(parentSuffix)
  }
  if (meta.line !== undefined) {
    labelParts.push(
      `L${String(meta.line)}${meta.column === undefined ? "" : `:C${String(meta.column)}`}`,
    )
  }
  return labelParts.join(" · ")
}

export const collectThreadMarkdownFileLinks = (
  text: string,
  workspaceRoot: string | undefined,
): ThreadMarkdownFileLinks => {
  const byHref = new Map<string, MarkdownFileLinkMeta>()
  for (const href of extractMarkdownLinkHrefs(text)) {
    const normalizedHref = normalizeMarkdownLinkHrefKey(href)
    if (byHref.has(normalizedHref)) {
      continue
    }
    const meta = resolveMarkdownFileLinkMeta(normalizedHref, workspaceRoot)
    if (meta !== null) {
      byHref.set(normalizedHref, meta)
    }
  }

  const byInlineCode = new Map<string, MarkdownFileLinkMeta>()
  for (const span of extractInlineCodeSpans(text)) {
    if (byInlineCode.has(span)) {
      continue
    }
    const meta = resolveInlineCodeFileLinkMeta(span, workspaceRoot)
    if (meta !== null) {
      byInlineCode.set(span, meta)
    }
  }

  return {
    workspaceRoot,
    byHref,
    byInlineCode,
    parentSuffixByPath: buildFileLinkParentSuffixByPath([
      ...[...byHref.values()].map(fileLinkSuffixKey),
      ...[...byInlineCode.values()].map(fileLinkSuffixKey),
    ]),
  }
}

export const emptyThreadMarkdownFileLinks = (workspaceRoot?: string): ThreadMarkdownFileLinks => ({
  workspaceRoot,
  byHref: new Map(),
  byInlineCode: new Map(),
  parentSuffixByPath: new Map(),
})
