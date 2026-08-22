const MARKDOWN_LANGUAGES = new Set(["md", "mdx", "markdown"])

const EXTENSIONLESS_LANGUAGES = {
  brewfile: "ruby",
  caddyfile: "caddyfile",
  containerfile: "dockerfile",
  dockerfile: "dockerfile",
  fastfile: "ruby",
  gemfile: "ruby",
  gnumakefile: "makefile",
  jenkinsfile: "groovy",
  justfile: "just",
  makefile: "makefile",
  podfile: "ruby",
  procfile: "plaintext",
  rakefile: "ruby",
  vagrantfile: "ruby",
} as const

const EXTENSION_LANGUAGE_ALIASES = {
  cjs: "javascript",
  cts: "typescript",
  mjs: "javascript",
  mts: "typescript",
  py: "python",
  yml: "yaml",
} as const

type ExtensionlessLanguage = keyof typeof EXTENSIONLESS_LANGUAGES
type ExtensionLanguageAlias = keyof typeof EXTENSION_LANGUAGE_ALIASES

const isExtensionlessLanguage = (value: string): value is ExtensionlessLanguage =>
  value in EXTENSIONLESS_LANGUAGES

const isExtensionLanguageAlias = (value: string): value is ExtensionLanguageAlias =>
  value in EXTENSION_LANGUAGE_ALIASES

const basenameOfPath = (pathValue: string): string => {
  const slashIndex = Math.max(pathValue.lastIndexOf("/"), pathValue.lastIndexOf("\\"))
  return slashIndex === -1 ? pathValue : pathValue.slice(slashIndex + 1)
}

export const languageFromFilePath = (pathValue: string): string => {
  const basename = basenameOfPath(pathValue)
  const specialKey = basename.toLowerCase()
  if (isExtensionlessLanguage(specialKey)) {
    return EXTENSIONLESS_LANGUAGES[specialKey]
  }

  const dot = basename.lastIndexOf(".")
  if (dot <= 0 || dot === basename.length - 1) {
    return "text"
  }

  const extension = basename.slice(dot + 1).toLowerCase()
  return isExtensionLanguageAlias(extension) ? EXTENSION_LANGUAGE_ALIASES[extension] : extension
}

export const isMarkdownFilePath = (pathValue: string): boolean =>
  MARKDOWN_LANGUAGES.has(languageFromFilePath(pathValue))

export const wrapAsCodeFence = (code: string, language: string): string => {
  const runs = code.match(/`+/g)
  const ticks = Math.max(3, ...(runs ?? []).map((run) => run.length)) + (runs === null ? 0 : 1)
  const fence = "`".repeat(ticks)
  return `${fence}${language}\n${code}\n${fence}`
}

export const filePreviewMarkdown = (pathValue: string, text: string): string => {
  if (isMarkdownFilePath(pathValue)) {
    return text
  }
  return wrapAsCodeFence(text, languageFromFilePath(pathValue))
}
