import { describe, expect, it } from "vite-plus/test"

import {
  hasSpecificPierreIconForFileName,
  inferEntryKindFromPath,
  NOYAU_PIERRE_ICONS,
  resolvePierreIconForEntry,
  syntheticFileNameForLanguageId,
} from "../src/lib/pierre-icons"

describe("Pierre file icons", () => {
  it("uses Pierre exact filename and complete-set extension mappings", () => {
    expect(resolvePierreIconForEntry("Dockerfile", "file")?.token).toBe("docker")
    expect(resolvePierreIconForEntry("src/Button.tsx", "file")?.token).toBe("react")
    expect(resolvePierreIconForEntry("vite.config.ts", "file")?.token).toBe("vite")
  })

  it("extends Pierre with Noyau-specific exact filename icons", () => {
    expect(resolvePierreIconForEntry("package.json", "file")?.name).toBe(
      "noyau-file-icon-package-json",
    )
    expect(resolvePierreIconForEntry("config/tsconfig.json", "file")?.name).toBe(
      "noyau-file-icon-tsconfig",
    )
    expect(resolvePierreIconForEntry("AGENTS.md", "file")?.name).toBe("noyau-file-icon-agents")
    expect(resolvePierreIconForEntry("CLAUDE.md", "file")?.name).toBe("noyau-file-icon-claude")
    expect(resolvePierreIconForEntry("README.md", "file")?.name).toBe("noyau-file-icon-readme")
    expect(resolvePierreIconForEntry("pnpm-lock.yaml", "file")?.name).toBe("noyau-file-icon-pnpm")
    expect(resolvePierreIconForEntry("pnpm-workspace.yaml", "file")?.name).toBe(
      "noyau-file-icon-pnpm",
    )
  })

  it("ships every custom icon referenced by the extended resolver", () => {
    const customIconNames = new Set(Object.values(NOYAU_PIERRE_ICONS.byFileName))
    for (const iconName of customIconNames) {
      expect(NOYAU_PIERRE_ICONS.spriteSheet).toContain(`id="${iconName}"`)
    }
  })

  it("uses the Pierre default icon for unknown file types", () => {
    expect(resolvePierreIconForEntry("artifact.unknown-ext", "file")?.token).toBe("default")
    expect(hasSpecificPierreIconForFileName("artifact.unknown-ext")).toBe(false)
  })

  it("leaves directory rendering to the shared folder fallback", () => {
    expect(resolvePierreIconForEntry("packages/client-runtime", "directory")).toBeNull()
  })

  it("infers file vs directory from the path shape", () => {
    expect(inferEntryKindFromPath("src/main.ts")).toBe("file")
    expect(inferEntryKindFromPath("packages/client-runtime")).toBe("directory")
    expect(inferEntryKindFromPath(".github")).toBe("directory")
    expect(inferEntryKindFromPath(".git")).toBe("directory")
    expect(inferEntryKindFromPath(".env.local")).toBe("file")
    expect(inferEntryKindFromPath(".gitignore")).toBe("file")
    expect(inferEntryKindFromPath(".env")).toBe("file")
    expect(inferEntryKindFromPath(".npmrc")).toBe("file")
  })

  it("normalizes common markdown fence language aliases", () => {
    expect(syntheticFileNameForLanguageId("typescript")).toBe("file.ts")
    expect(syntheticFileNameForLanguageId("shellscript")).toBe("file.sh")
    expect(syntheticFileNameForLanguageId("python")).toBe("file.py")
  })
})
