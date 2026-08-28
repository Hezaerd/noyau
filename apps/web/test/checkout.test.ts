import { ThreadId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vite-plus/test"

import {
  branchPickerBadge,
  isRemovableWorktreeRef,
  isWorktreeDeleteGesture,
  envModeLockedOf,
  envModeOf,
  isSelectingWorktreeBase,
  clearCreatedCheckout,
  peekCreatedCheckout,
  draftCheckoutOf,
  rememberCreatedCheckout,
  resolveBranchSelectionTarget,
  resolveBranchTriggerLabel,
  resolveEffectiveEnvMode,
  resolveEnvModeLabel,
  resolveEnvModeTriggerLabel,
  resolveLocalCheckoutBranchMismatch,
  resolvePrepareWorktree,
  resolveSidebarCheckoutBranch,
  resolveWorktreeBaseBranch,
} from "../src/lib/checkout"

describe("checkout helpers", () => {
  it("verrouille le checkout une fois le path bindé ou le premier Turn lancé", () => {
    expect(envModeLockedOf({ latestTurn: null })).toBe(false)
    expect(envModeLockedOf({})).toBe(false)
    expect(envModeLockedOf({ latestTurn: null, isRunning: true })).toBe(true)
    expect(envModeLockedOf({ latestTurn: { turnId: "turn_1" } })).toBe(true)
    expect(envModeLockedOf({ worktreePath: "/tmp/wt" })).toBe(true)
    expect(envModeLockedOf({ worktreePath: null, latestTurn: null })).toBe(false)
  })

  it("détecte ⌘⇧ clic / ctrl⇧ clic pour supprimer un worktree", () => {
    expect(
      isWorktreeDeleteGesture({ metaKey: true, shiftKey: true, ctrlKey: false, altKey: false }),
    ).toBe(true)
    expect(
      isWorktreeDeleteGesture({ metaKey: false, shiftKey: true, ctrlKey: true, altKey: false }),
    ).toBe(true)
    expect(
      isWorktreeDeleteGesture({ metaKey: true, shiftKey: false, ctrlKey: false, altKey: false }),
    ).toBe(false)
    expect(
      isWorktreeDeleteGesture({ metaKey: true, shiftKey: true, ctrlKey: false, altKey: true }),
    ).toBe(false)
  })

  it("n'autorise la suppression que des worktrees liés", () => {
    expect(
      isRemovableWorktreeRef({ current: false, worktreePath: "/tmp/wt" }, "/tmp/repo", null),
    ).toBe(true)
    expect(
      isRemovableWorktreeRef({ current: true, worktreePath: "/tmp/repo" }, "/tmp/repo", null),
    ).toBe(false)
    expect(
      isRemovableWorktreeRef({ current: true, worktreePath: "/tmp/wt" }, "/tmp/wt", "/tmp/wt"),
    ).toBe(true)
    expect(isRemovableWorktreeRef({ current: false, worktreePath: null }, "/tmp/repo", null)).toBe(
      false,
    )
  })

  it("priorise current, worktree, puis default sur le badge", () => {
    expect(
      branchPickerBadge(
        { current: true, isDefault: true, isRemote: false, worktreePath: "/tmp/wt" },
        "/tmp/repo",
      ),
    ).toBe("current")
    expect(
      branchPickerBadge(
        { current: false, isDefault: true, isRemote: false, worktreePath: "/tmp/wt" },
        "/tmp/repo",
      ),
    ).toBe("worktree")
    expect(
      branchPickerBadge(
        { current: false, isDefault: true, isRemote: false, worktreePath: null },
        "/tmp/repo",
      ),
    ).toBe("default")
    expect(
      branchPickerBadge(
        { current: false, isDefault: false, isRemote: false, worktreePath: "/tmp/repo" },
        "/tmp/repo",
      ),
    ).toBeNull()
  })

  it("traite worktreePath null comme local seulement après bind", () => {
    expect(envModeOf({ branch: "main", worktreePath: null })).toBe("local")
    expect(envModeOf({ branch: "feat", worktreePath: "/tmp/wt" })).toBe("worktree")
  })

  it("garde l'intention worktree tant que le path n'est pas bindé", () => {
    expect(resolveEffectiveEnvMode({ worktreePath: null, draftEnvMode: "worktree" })).toBe(
      "worktree",
    )
    expect(resolveEffectiveEnvMode({ worktreePath: null, draftEnvMode: "local" })).toBe("local")
    expect(resolveEffectiveEnvMode({ worktreePath: "/tmp/wt", draftEnvMode: "local" })).toBe(
      "worktree",
    )
  })

  it("affiche Depuis {base} tant que le worktree n'est pas créé", () => {
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: null,
        baseBranch: "main",
        liveBranch: "feat",
        startFromOrigin: false,
        status: undefined,
      }),
    ).toBe("Depuis main")
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: null,
        baseBranch: "main",
        liveBranch: "feat",
        startFromOrigin: true,
        status: undefined,
      }),
    ).toBe("Depuis origin/main")
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: null,
        baseBranch: null,
        liveBranch: null,
        startFromOrigin: true,
        status: undefined,
      }),
    ).toBe("Choisir une base")
    expect(isSelectingWorktreeBase({ envMode: "worktree", worktreePath: null })).toBe(true)
    expect(isSelectingWorktreeBase({ envMode: "worktree", worktreePath: "/tmp/wt" })).toBe(false)
  })

  it("prend la branche default du repo comme base, pas un main hardcodé", () => {
    expect(
      resolveWorktreeBaseBranch({
        refs: [
          { name: "feat", isDefault: false, isRemote: false },
          { name: "develop", isDefault: true, isRemote: false },
        ],
        currentBranch: "feat",
      }),
    ).toBe("develop")
    expect(
      resolveWorktreeBaseBranch({
        refs: [{ name: "origin/trunk", isDefault: true, isRemote: true }],
        currentBranch: "feat",
      }),
    ).toBe("trunk")
    expect(resolveWorktreeBaseBranch({ refs: [], currentBranch: "feat" })).toBe("feat")
  })

  it("prépare le worktree depuis origin par défaut", () => {
    expect(
      resolvePrepareWorktree({
        envMode: "worktree",
        worktreePath: null,
        baseBranch: "main",
      }),
    ).toEqual({ baseBranch: "main", startFromOrigin: true })
    expect(
      resolvePrepareWorktree({
        envMode: "worktree",
        worktreePath: null,
        baseBranch: "main",
        startFromOrigin: false,
      }),
    ).toEqual({ baseBranch: "main" })
    expect(
      resolvePrepareWorktree({
        envMode: "worktree",
        worktreePath: "/tmp/wt",
        baseBranch: "main",
      }),
    ).toBeUndefined()
    expect(resolvePrepareWorktree({ envMode: "local", baseBranch: "main" })).toBeUndefined()
    expect(resolvePrepareWorktree({ envMode: "worktree", baseBranch: "  " })).toBeUndefined()
  })

  it("libellé du trigger : pending, bindé, ou local", () => {
    expect(resolveEnvModeLabel("worktree")).toBe("Nouveau worktree")
    expect(resolveEnvModeLabel("local")).toBe("Checkout courant")
    expect(draftCheckoutOf("local")).toEqual({ envMode: "local", startFromOrigin: false })
    expect(draftCheckoutOf("worktree")).toEqual({ envMode: "worktree", startFromOrigin: true })
    expect(
      resolveEnvModeTriggerLabel({
        envMode: "worktree",
        worktreePath: null,
        locked: true,
      }),
    ).toBe("Nouveau worktree")
    expect(
      resolveEnvModeTriggerLabel({
        envMode: "local",
        worktreePath: "/tmp/wt",
        locked: true,
      }),
    ).toBe("Worktree")
    expect(
      resolveEnvModeTriggerLabel({
        envMode: "local",
        worktreePath: null,
        locked: true,
      }),
    ).toBe("Checkout local")
  })

  it("réutilise un worktree déjà extrait ailleurs", () => {
    expect(
      resolveBranchSelectionTarget(
        { name: "feat", isRemote: false, worktreePath: "/tmp/other" },
        "/tmp/repo",
      ),
    ).toEqual({ kind: "reuse", worktreePath: "/tmp/other" })
    expect(
      resolveBranchSelectionTarget(
        { name: "main", isRemote: false, worktreePath: "/tmp/repo" },
        "/tmp/repo",
      ),
    ).toEqual({ kind: "switch" })
  })

  it("restaure l'intention worktree après create → navigation", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000099")
    rememberCreatedCheckout({
      threadId,
      envMode: "worktree",
      baseBranch: "develop",
      startFromOrigin: true,
    })
    expect(
      peekCreatedCheckout(ThreadId.make("20000000-0000-4000-8000-000000000098")),
    ).toBeUndefined()
    expect(peekCreatedCheckout(threadId)).toEqual({
      threadId,
      envMode: "worktree",
      baseBranch: "develop",
      startFromOrigin: true,
    })
    expect(peekCreatedCheckout(threadId)).toEqual({
      threadId,
      envMode: "worktree",
      baseBranch: "develop",
      startFromOrigin: true,
    })
    clearCreatedCheckout(threadId)
    expect(peekCreatedCheckout(threadId)).toBeUndefined()
  })

  it("signale un mismatch seulement en local sans worktree", () => {
    expect(
      resolveLocalCheckoutBranchMismatch({
        envMode: "local",
        threadBranch: "feat",
        liveBranch: "main",
        worktreePath: null,
      }),
    ).toEqual({ previous: "feat", current: "main" })
    expect(
      resolveLocalCheckoutBranchMismatch({
        envMode: "worktree",
        threadBranch: "feat",
        liveBranch: "main",
        worktreePath: null,
      }),
    ).toBeNull()
  })

  it("affiche le snapshot du Thread, sinon le HEAD live", () => {
    expect(resolveSidebarCheckoutBranch({ threadBranch: "feat/bound", liveBranch: "main" })).toBe(
      "feat/bound",
    )
    expect(resolveSidebarCheckoutBranch({ threadBranch: null, liveBranch: "main" })).toBe("main")
    expect(resolveSidebarCheckoutBranch({ threadBranch: null, liveBranch: null })).toBeNull()
  })
})
