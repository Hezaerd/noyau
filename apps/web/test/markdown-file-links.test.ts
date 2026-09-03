import { describe, expect, it } from "vitest"

import {
  buildFileLinkParentSuffixByPath,
  collectThreadMarkdownFileLinks,
  fileLinkChipLabel,
  resolveInlineCodeFileLinkMeta,
  parseTicketMarkdownHref,
  rewriteComposerMentionsToMarkdownFileLinks,
  rewriteMarkdownFileLinkDestinations,
  transformThreadMarkdownFileHref,
  transformThreadMarkdownTicketHref,
  resolveMarkdownFileLinkMeta,
  resolveMarkdownFileLinkTarget,
  rewriteMarkdownFileUriHref,
} from "../src/lib/markdown-file-links"

describe("rewriteMarkdownFileUriHref", () => {
  it("rewrites file uri hrefs into direct path hrefs", () => {
    expect(rewriteMarkdownFileUriHref("file:///Users/julius/project/src/main.ts#L42")).toBe(
      "/Users/julius/project/src/main.ts#L42",
    )
  })

  it("preserves encoded octets so file paths are decoded only once later", () => {
    expect(rewriteMarkdownFileUriHref("file:///Users/julius/project/file%2520name.md")).toBe(
      "/Users/julius/project/file%2520name.md",
    )
  })

  it("normalizes file uri hrefs for windows drive paths", () => {
    expect(
      rewriteMarkdownFileUriHref(
        "file:///D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx#L69",
      ),
    ).toBe("D:/Programme/t3code/apps/web/src/components/chat/OpenInPicker.tsx#L69")
  })

  it("rewrites relative file destinations to a harden-safe https href", () => {
    expect(transformThreadMarkdownFileHref("src/greet.py", "/Users/hezaerd/project")).toBe(
      "https://file.invalid/?p=%2FUsers%2Fhezaerd%2Fproject%2Fsrc%2Fgreet.py",
    )
    expect(transformThreadMarkdownFileHref("src/foo.ts:12", "/Users/hezaerd/project")).toBe(
      "https://file.invalid/?p=%2FUsers%2Fhezaerd%2Fproject%2Fsrc%2Ffoo.ts%3A12",
    )
    expect(
      transformThreadMarkdownFileHref("https://example.com/docs", "/Users/hezaerd/project"),
    ).toBeNull()
  })

  it("rewrites file mentions in markdown without touching fences or external links", () => {
    const rewritten = rewriteMarkdownFileLinkDestinations(
      "See [greet.py](src/greet.py) and [docs](https://example.com).\n\n```\n[nope](src/hidden.ts)\n```",
      "/Users/hezaerd/project",
    )
    expect(rewritten).toContain("https://file.invalid/?p=")
    expect(rewritten).toContain("https://example.com")
    expect(rewritten).toContain("[nope](src/hidden.ts)")
  })

  it("turns composer @path mentions into markdown file links", () => {
    expect(
      rewriteComposerMentionsToMarkdownFileLinks(
        "Que peux tu me dire que le fichier @astro.config.mjs",
      ),
    ).toBe("Que peux tu me dire que le fichier [astro.config.mjs](astro.config.mjs)")
    expect(rewriteComposerMentionsToMarkdownFileLinks("Voir @src/adapter.ts ensuite")).toBe(
      "Voir [adapter.ts](src/adapter.ts) ensuite",
    )
    expect(rewriteComposerMentionsToMarkdownFileLinks("Voir [greet.py](src/greet.py)")).toBe(
      "Voir [greet.py](src/greet.py)",
    )
    expect(
      rewriteComposerMentionsToMarkdownFileLinks(
        "Garde `@astro.config.mjs` et\n```\n@hidden.ts\n```",
      ),
    ).toBe("Garde `@astro.config.mjs` et\n```\n@hidden.ts\n```")
    expect(rewriteComposerMentionsToMarkdownFileLinks("Le fichier **@astro.config.mjs**.")).toBe(
      "Le fichier **[astro.config.mjs](astro.config.mjs)**.",
    )
  })

  it("turns composer ticket mentions into markdown ticket links", () => {
    const ticketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"
    expect(
      rewriteComposerMentionsToMarkdownFileLinks(`travaille sur @ticket:${ticketId}`, [
        {
          ticketId,
          title: "Mentioner ticket dans transcript",
          columnName: "En cours",
          done: false,
        },
      ]),
    ).toBe(`travaille sur [Mentioner ticket dans transcript](ticket:${ticketId})`)
  })

  it("rewrites ticket markdown hrefs to a harden-safe https href", () => {
    const ticketId = "40818da4-a4de-46f6-a60f-1aa305093a6e"
    expect(transformThreadMarkdownTicketHref(`ticket:${ticketId}`)).toBe(
      `https://ticket.invalid/?id=${ticketId}`,
    )
    expect(parseTicketMarkdownHref(`https://ticket.invalid/?id=${ticketId}`)).toBe(ticketId)
    expect(
      rewriteMarkdownFileLinkDestinations(
        `[Mentioner ticket dans transcript](ticket:${ticketId})`,
        "/Users/hezaerd/project",
      ),
    ).toBe(`[Mentioner ticket dans transcript](https://ticket.invalid/?id=${ticketId})`)
  })

  it("unwraps angle-bracketed file uri hrefs", () => {
    expect(
      rewriteMarkdownFileUriHref(" <file:///D:/Programme/t3code/apps/web/src/markdown-links.ts> "),
    ).toBe("D:/Programme/t3code/apps/web/src/markdown-links.ts")
  })
})

describe("resolveMarkdownFileLinkTarget", () => {
  it("resolves absolute posix file paths", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/AGENTS.md")).toBe(
      "/Users/julius/project/AGENTS.md",
    )
  })

  it("resolves relative file paths against cwd", () => {
    expect(resolveMarkdownFileLinkTarget("src/processRunner.ts:71", "/Users/julius/project")).toBe(
      "/Users/julius/project/src/processRunner.ts:71",
    )
  })

  it("resolves repo-root public paths against cwd instead of the host root", () => {
    expect(resolveMarkdownFileLinkTarget("/og-default.jpg", "/Users/julius/project")).toBe(
      "/Users/julius/project/og-default.jpg",
    )
    expect(resolveMarkdownFileLinkTarget("/favicon.ico", "/Users/julius/project")).toBe(
      "/Users/julius/project/favicon.ico",
    )
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/og-default.jpg")).toBe(
      "/Users/julius/project/og-default.jpg",
    )
  })

  it("does not treat filename line references as external schemes", () => {
    expect(resolveMarkdownFileLinkTarget("script.ts:10", "/Users/julius/project")).toBe(
      "/Users/julius/project/script.ts:10",
    )
  })

  it("resolves bare file names against cwd", () => {
    expect(resolveMarkdownFileLinkTarget("AGENTS.md", "/Users/julius/project")).toBe(
      "/Users/julius/project/AGENTS.md",
    )
  })

  it("maps #L line anchors to editor line suffixes", () => {
    expect(resolveMarkdownFileLinkTarget("/Users/julius/project/src/main.ts#L42C7")).toBe(
      "/Users/julius/project/src/main.ts:42:7",
    )
  })

  it("ignores external urls", () => {
    expect(resolveMarkdownFileLinkTarget("https://example.com/docs")).toBeNull()
  })

  it("does not double-decode file URLs", () => {
    expect(resolveMarkdownFileLinkTarget("file:///Users/julius/project/file%2520name.md")).toBe(
      "/Users/julius/project/file%20name.md",
    )
  })

  it("formats tooltip display paths relative to the cwd when possible", () => {
    expect(
      resolveMarkdownFileLinkMeta(
        "file:///C:/Users/mike/dev-stuff/t3code/apps/web/src/session-logic.ts#L501",
        "C:/Users/mike/dev-stuff/t3code",
      ),
    ).toMatchObject({
      displayPath: "t3code/apps/web/src/session-logic.ts:501",
      workspaceRelativePath: "apps/web/src/session-logic.ts",
    })
  })

  it("does not create a preview path for files outside the workspace", () => {
    expect(resolveMarkdownFileLinkMeta("/tmp/report.ts", "/repo/project")).toMatchObject({
      workspaceRelativePath: null,
    })
  })

  it("does not treat app routes as file links", () => {
    expect(resolveMarkdownFileLinkTarget("/chat/settings")).toBeNull()
  })
})

describe("resolveInlineCodeFileLinkMeta", () => {
  it("links relative paths with file extensions", () => {
    expect(
      resolveInlineCodeFileLinkMeta(".plans/worktree-management-v1.md", "/Users/julius/project"),
    ).toMatchObject({
      targetPath: "/Users/julius/project/.plans/worktree-management-v1.md",
      basename: "worktree-management-v1.md",
    })
  })

  it("links absolute posix paths and rejects app routes", () => {
    expect(resolveInlineCodeFileLinkMeta("/Users/julius/project/AGENTS.md")).toMatchObject({
      targetPath: "/Users/julius/project/AGENTS.md",
    })
    expect(resolveInlineCodeFileLinkMeta("/usr/local/bin/tool")).toMatchObject({
      targetPath: "/usr/local/bin/tool",
    })
    expect(resolveInlineCodeFileLinkMeta("/workspace/Makefile")).toMatchObject({
      basename: "Makefile",
    })
    expect(resolveInlineCodeFileLinkMeta("/chat/settings")).toBeNull()
  })

  it("links windows drive paths", () => {
    expect(resolveInlineCodeFileLinkMeta("C:\\Users\\mike\\project\\src\\main.ts")).toMatchObject({
      basename: "main.ts",
    })
  })

  it("links relative paths with line positions", () => {
    expect(
      resolveInlineCodeFileLinkMeta("src/processRunner.ts:71", "/Users/julius/project"),
    ).toMatchObject({
      targetPath: "/Users/julius/project/src/processRunner.ts:71",
      line: 71,
    })
  })

  it("links bare filenames only when a line suffix marks them as file references", () => {
    expect(resolveInlineCodeFileLinkMeta("script.ts:10", "/Users/julius/project")).toMatchObject({
      targetPath: "/Users/julius/project/script.ts:10",
      line: 10,
    })
    expect(resolveInlineCodeFileLinkMeta("AGENTS.md", "/Users/julius/project")).toBeNull()
  })

  it("links extensionless bare filenames with a line suffix", () => {
    expect(resolveInlineCodeFileLinkMeta("Makefile:12", "/Users/julius/project")).toMatchObject({
      targetPath: "/Users/julius/project/Makefile:12",
      basename: "Makefile",
      line: 12,
    })
    expect(resolveInlineCodeFileLinkMeta("Dockerfile:8:2", "/Users/julius/project")).toMatchObject({
      line: 8,
      column: 2,
    })
    expect(resolveInlineCodeFileLinkMeta("Makefile:12")).toBeNull()
  })

  it("does not treat arbitrary name:digits shapes as files", () => {
    expect(resolveInlineCodeFileLinkMeta("error:1", "/Users/julius/project")).toBeNull()
    expect(resolveInlineCodeFileLinkMeta("TODO:12", "/Users/julius/project")).toBeNull()
    expect(resolveInlineCodeFileLinkMeta("port:3000", "/Users/julius/project")).toBeNull()
  })

  it("ignores hosts, ports, versions, commands, and git refs", () => {
    expect(resolveInlineCodeFileLinkMeta("127.0.0.1:3000", "/Users/julius/project")).toBeNull()
    expect(resolveInlineCodeFileLinkMeta("localhost:3000", "/Users/julius/project")).toBeNull()
    expect(
      resolveInlineCodeFileLinkMeta("example.com/index.html", "/Users/julius/project"),
    ).toBeNull()
    expect(resolveInlineCodeFileLinkMeta("origin/main", "/Users/julius/project")).toBeNull()
    expect(resolveInlineCodeFileLinkMeta("apps/web", "/Users/julius/project")).toBeNull()
    expect(resolveInlineCodeFileLinkMeta("git worktree list --porcelain")).toBeNull()
    expect(resolveInlineCodeFileLinkMeta("https://example.com/docs.html")).toBeNull()
  })

  it("prefers file over country-code host when a line suffix is present", () => {
    expect(resolveInlineCodeFileLinkMeta("script.pl:10", "/Users/julius/project")).toMatchObject({
      targetPath: "/Users/julius/project/script.pl:10",
      line: 10,
    })
    expect(
      resolveInlineCodeFileLinkMeta("example.pl/index.html", "/Users/julius/project"),
    ).toBeNull()
  })

  it("ignores relative paths without a cwd to resolve against", () => {
    expect(resolveInlineCodeFileLinkMeta(".plans/worktree-management-v1.md")).toBeNull()
  })
})

describe("collectThreadMarkdownFileLinks", () => {
  it("collects markdown links and inline code paths, and disambiguates colliding basenames", () => {
    const collected = collectThreadMarkdownFileLinks(
      "See [foo.ts](src/foo.ts) and `lib/foo.ts:12` plus [docs](https://example.com).",
      "/Users/hezaerd/project",
    )

    expect(collected.byHref.get("src/foo.ts")?.basename).toBe("foo.ts")
    expect(collected.byInlineCode.get("lib/foo.ts:12")?.line).toBe(12)
    expect(collected.byHref.has("https://example.com")).toBe(false)
    expect(collected.parentSuffixByPath.get("src/foo.ts")).toBe("src")
    expect(collected.parentSuffixByPath.get("lib/foo.ts")).toBe("lib")
  })

  it("labels a chip with parent suffix and line", () => {
    const meta = resolveMarkdownFileLinkMeta("src/foo.ts:12", "/Users/hezaerd/project")
    expect(meta).not.toBeNull()
    if (meta === null) {
      return
    }
    expect(fileLinkChipLabel(meta, "src")).toBe("foo.ts · src · L12")
  })

  it("keeps the final segment for a directory path with a trailing separator", () => {
    expect(resolveMarkdownFileLinkMeta("/tmp/favicons/", "/repo/project")).toMatchObject({
      basename: "favicons",
    })
  })
})

describe("buildFileLinkParentSuffixByPath", () => {
  it("adds the shortest unique parent suffix when basenames collide", () => {
    const suffixes = buildFileLinkParentSuffixByPath(["src/foo.ts", "lib/foo.ts"])
    expect(suffixes.get("src/foo.ts")).toBe("src")
    expect(suffixes.get("lib/foo.ts")).toBe("lib")
  })

  it("leaves unique basenames unsuffixed", () => {
    expect(buildFileLinkParentSuffixByPath(["src/foo.ts", "lib/bar.ts"]).size).toBe(0)
  })
})
