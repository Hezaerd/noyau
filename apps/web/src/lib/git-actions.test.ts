import type { VcsStatusResult } from "@noyau/protocol/git"
import { describe, expect, it } from "vite-plus/test"

import {
  actionNeedsDialog,
  buildMenuItems,
  requiresDefaultBranchConfirmation,
  resolveQuickAction,
  suggestPublishRepository,
} from "./git-actions"

const status = (overrides: Partial<VcsStatusResult> = {}): VcsStatusResult => ({
  isRepo: true,
  cwd: "/tmp/repo",
  refName: "feat/checkout",
  isDefaultRef: false,
  hasPrimaryRemote: true,
  hasWorkingTreeChanges: false,
  hasUpstream: true,
  aheadCount: 0,
  behindCount: 0,
  worktreePath: null,
  ...overrides,
})

describe("git-actions", () => {
  it("propose commit + push + PR quand le working tree a des changements", () => {
    const dirty = status({ hasWorkingTreeChanges: true })
    expect(resolveQuickAction(dirty, false)).toEqual({
      label: "Commit, push & PR",
      disabled: false,
      kind: "open_dialog",
      action: "commit_push_pr",
    })
    expect(buildMenuItems(dirty, false).map((item) => item.id)).toEqual(["commit", "push", "pr"])
    expect(buildMenuItems(dirty, false).find((item) => item.id === "commit")?.disabled).toBe(false)
    expect(buildMenuItems(dirty, false).find((item) => item.id === "pr")?.disabled).toBe(true)
  })

  it("pousse seul sur la branche par défaut sans changements", () => {
    const aheadDefault = status({
      refName: "main",
      isDefaultRef: true,
      aheadCount: 1,
    })
    expect(resolveQuickAction(aheadDefault, false)).toEqual({
      label: "Push",
      disabled: false,
      kind: "run_action",
      action: "push",
    })
    expect(requiresDefaultBranchConfirmation("push", true)).toBe(true)
    expect(actionNeedsDialog("push")).toBe(false)
  })

  it("ouvre une PR sur une feature déjà poussée", () => {
    expect(resolveQuickAction(status(), false)).toEqual({
      label: "Créer une PR",
      disabled: false,
      kind: "open_dialog",
      action: "create_pr",
    })
  })

  it("bloque quand le status n’est pas un repo", () => {
    expect(resolveQuickAction(status({ isRepo: false }), false).disabled).toBe(true)
    expect(buildMenuItems(status({ isRepo: false }), false)).toEqual([])
  })

  it("propose Créer le repo quand origin est absent", () => {
    const localOnly = status({ hasPrimaryRemote: false })
    expect(resolveQuickAction(localOnly, false)).toEqual({
      label: "Créer le repo",
      disabled: false,
      kind: "open_publish",
    })
    expect(buildMenuItems(localOnly, false).map((item) => item.id)).toEqual(["commit", "publish"])
    expect(
      resolveQuickAction(status({ hasPrimaryRemote: false, hasWorkingTreeChanges: true }), false),
    ).toEqual({
      label: "Commit",
      disabled: false,
      kind: "open_dialog",
      action: "commit",
    })
  })

  it("préremplit owner/repo depuis le login gh et le basename", () => {
    expect(suggestPublishRepository("/tmp/noyau", "hezaerd")).toBe("hezaerd/noyau")
    expect(suggestPublishRepository("/tmp/noyau/", null)).toBe("noyau")
  })
})
