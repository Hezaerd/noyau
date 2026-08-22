const failedFaviconHosts = new Set<string>()

export const resolveExternalWebLinkHost = (href: string | undefined): string | null => {
  if (href === undefined || href.length === 0) {
    return null
  }
  try {
    const url = new URL(href)
    if (url.protocol !== "http:" && url.protocol !== "https:") {
      return null
    }
    return url.hostname.length === 0 ? null : url.hostname
  } catch {
    return null
  }
}

export const markdownExternalLinkFaviconSrc = (host: string): string =>
  `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=32`

export const markdownExternalLinkFaviconFailed = (host: string): boolean =>
  failedFaviconHosts.has(host)

export const rememberMarkdownExternalLinkFaviconFailure = (host: string): void => {
  failedFaviconHosts.add(host)
}

export const resetMarkdownExternalLinkFavicons = (): void => {
  failedFaviconHosts.clear()
}
