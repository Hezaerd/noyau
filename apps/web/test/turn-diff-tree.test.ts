import { describe, expect, it } from "vite-plus/test"

import { buildTurnDiffTree, summarizeTurnDiffStats } from "../src/lib/turn-diff-tree.ts"

describe("summarizeTurnDiffStats", () => {
  it("somme les additions et suppressions", () => {
    const stat = summarizeTurnDiffStats([
      { path: "README.md", additions: 3, deletions: 1 },
      { path: "docs/notes.md", additions: 0, deletions: 0 },
      { path: "src/index.ts", additions: 5, deletions: 2 },
    ])

    expect(stat).toEqual({ additions: 8, deletions: 3 })
  })
})

describe("buildTurnDiffTree", () => {
  it("construit des dossiers imbriqués avec stats agrégées", () => {
    const tree = buildTurnDiffTree([
      { path: "src/index.ts", additions: 2, deletions: 1 },
      { path: "src/components/Button.tsx", additions: 4, deletions: 2 },
      { path: "README.md", additions: 1, deletions: 0 },
    ])

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "src",
        path: "src",
        stat: { additions: 6, deletions: 3 },
        children: [
          {
            kind: "directory",
            name: "components",
            path: "src/components",
            stat: { additions: 4, deletions: 2 },
            children: [
              {
                kind: "file",
                name: "Button.tsx",
                path: "src/components/Button.tsx",
                stat: { additions: 4, deletions: 2 },
              },
            ],
          },
          {
            kind: "file",
            name: "index.ts",
            path: "src/index.ts",
            stat: { additions: 2, deletions: 1 },
          },
        ],
      },
      {
        kind: "file",
        name: "README.md",
        path: "README.md",
        stat: { additions: 1, deletions: 0 },
      },
    ])
  })

  it("garde les stats à zéro et n'agrège que les valeurs numériques", () => {
    const tree = buildTurnDiffTree([
      { path: "docs/notes.md", additions: 0, deletions: 0 },
      { path: "docs/todo.md", additions: 1, deletions: 1 },
    ])

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "docs",
        path: "docs",
        stat: { additions: 1, deletions: 1 },
        children: [
          {
            kind: "file",
            name: "notes.md",
            path: "docs/notes.md",
            stat: { additions: 0, deletions: 0 },
          },
          {
            kind: "file",
            name: "todo.md",
            path: "docs/todo.md",
            stat: { additions: 1, deletions: 1 },
          },
        ],
      },
    ])
  })

  it("normalise les séparateurs Windows", () => {
    const tree = buildTurnDiffTree([
      { path: "apps\\web\\src\\index.ts", additions: 2, deletions: 1 },
    ])

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "apps/web/src",
        path: "apps/web/src",
        stat: { additions: 2, deletions: 1 },
        children: [
          {
            kind: "file",
            name: "index.ts",
            path: "apps/web/src/index.ts",
            stat: { additions: 2, deletions: 1 },
          },
        ],
      },
    ])
  })

  it("compacte uniquement les chaînes de dossiers uniques", () => {
    const tree = buildTurnDiffTree([
      { path: "apps/server/src/index.ts", additions: 2, deletions: 1 },
      { path: "apps/server/main.ts", additions: 4, deletions: 0 },
    ])

    expect(tree).toEqual([
      {
        kind: "directory",
        name: "apps/server",
        path: "apps/server",
        stat: { additions: 6, deletions: 1 },
        children: [
          {
            kind: "directory",
            name: "src",
            path: "apps/server/src",
            stat: { additions: 2, deletions: 1 },
            children: [
              {
                kind: "file",
                name: "index.ts",
                path: "apps/server/src/index.ts",
                stat: { additions: 2, deletions: 1 },
              },
            ],
          },
          {
            kind: "file",
            name: "main.ts",
            path: "apps/server/main.ts",
            stat: { additions: 4, deletions: 0 },
          },
        ],
      },
    ])
  })

  it("préserve les espaces en tête/queue des segments", () => {
    const tree = buildTurnDiffTree([
      { path: "a/file.ts", additions: 1, deletions: 0 },
      { path: " a/file.ts", additions: 2, deletions: 0 },
    ])

    expect(tree).toHaveLength(2)
    const directoryNodes = tree.filter(
      (node): node is Extract<(typeof tree)[number], { kind: "directory" }> =>
        node.kind === "directory",
    )
    const names = directoryNodes.map((node) => node.name)
    const paths = directoryNodes.map((node) => node.path)
    expect(names).toEqual(expect.arrayContaining([" a", "a"]))
    expect(new Set(names).size).toBe(2)
    expect(paths).toEqual(expect.arrayContaining([" a", "a"]))
    expect(new Set(paths).size).toBe(2)
  })
})
