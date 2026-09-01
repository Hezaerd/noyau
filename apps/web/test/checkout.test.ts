import type { VcsStatusResult } from "@noyau/contracts/git"
import { ProjectId, ThreadId } from "@noyau/contracts/ids"
import { describe, expect, it } from "vite-plus/test"

import {
  branchPickerBadge,
  clearDraftCheckout,
  envModeLockedOf,
  envModeOf,
  isSelectingWorktreeBase,
  clearCreatedCheckout,
  peekCreatedCheckout,
  peekDraftCheckout,
  draftCheckoutOf,
  rememberCreatedCheckout,
  rememberDraftCheckout,
  resolveOpenedThreadCheckout,
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

const liveStatus = (refName: string, dirty = false): VcsStatusResult => ({
  isRepo: true,
  cwd: "/tmp/wt",
  refName,
  isDefaultRef: false,
  hasPrimaryRemote: true,
  hasWorkingTreeChanges: dirty,
  hasUpstream: false,
  aheadCount: 0,
  behindCount: 0,
  worktreePath: "/tmp/wt",
  pr: null,
})

describe("checkout helpers", () => {
  it("verrouille le checkout une fois le path bindé ou le premier Turn lancé", () => {
    expect(envModeLockedOf({ latestTurn: null })).toBe(false)
    expect(envModeLockedOf({})).toBe(false)
    expect(envModeLockedOf({ latestTurn: null, isRunning: true })).toBe(true)
    expect(envModeLockedOf({ latestTurn: { turnId: "turn_1" } })).toBe(true)
    expect(envModeLockedOf({ worktreePath: "/tmp/wt" })).toBe(true)
    expect(envModeLockedOf({ worktreePath: null, latestTurn: null })).toBe(false)
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
    ).toBe("From main")
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: null,
        baseBranch: "main",
        liveBranch: "feat",
        startFromOrigin: true,
        status: undefined,
      }),
    ).toBe("From origin/main")
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: null,
        baseBranch: null,
        liveBranch: null,
        startFromOrigin: true,
        status: undefined,
      }),
    ).toBe("Choose a base")
    expect(isSelectingWorktreeBase({ envMode: "worktree", worktreePath: null })).toBe(true)
    expect(isSelectingWorktreeBase({ envMode: "worktree", worktreePath: "/tmp/wt" })).toBe(false)
  })

  it("prend la branche persistée du Thread une fois le worktree bindé", () => {
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: "/tmp/wt",
        baseBranch: "noyau/safer-reconnect-backoff",
        liveBranch: "noyau/f4ae4e0e",
        startFromOrigin: false,
        status: liveStatus("noyau/f4ae4e0e"),
      }),
    ).toBe("noyau/safer-reconnect-backoff")
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: "/tmp/wt",
        baseBranch: "noyau/safer-reconnect-backoff",
        liveBranch: "noyau/f4ae4e0e",
        startFromOrigin: false,
        status: liveStatus("noyau/f4ae4e0e", true),
      }),
    ).toBe("noyau/safer-reconnect-backoff · dirty")
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: "/tmp/wt",
        baseBranch: "noyau/safer-reconnect-backoff",
        liveBranch: null,
        startFromOrigin: false,
        status: undefined,
      }),
    ).toBe("noyau/safer-reconnect-backoff")
    expect(
      resolveBranchTriggerLabel({
        envMode: "worktree",
        worktreePath: "/tmp/wt",
        baseBranch: "",
        liveBranch: "noyau/f4ae4e0e",
        startFromOrigin: false,
        status: liveStatus("main"),
      }),
    ).toBe("noyau/f4ae4e0e")
  })

  it("garde le HEAD live en checkout local", () => {
    expect(
      resolveBranchTriggerLabel({
        envMode: "local",
        worktreePath: null,
        baseBranch: "feat/bound",
        liveBranch: "main",
        startFromOrigin: false,
        status: liveStatus("main"),
      }),
    ).toBe("main")
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
    expect(resolveEnvModeLabel("worktree")).toBe("New worktree")
    expect(resolveEnvModeLabel("local")).toBe("Current checkout")
    expect(draftCheckoutOf("local")).toEqual({ envMode: "local", startFromOrigin: false })
    expect(draftCheckoutOf("worktree")).toEqual({ envMode: "worktree", startFromOrigin: true })
    expect(
      resolveEnvModeTriggerLabel({
        envMode: "worktree",
        worktreePath: null,
        locked: true,
      }),
    ).toBe("New worktree")
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
    ).toBe("Local checkout")
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

  it("applique la préférence worktree aux drafts sans path bindé", () => {
    expect(
      resolveOpenedThreadCheckout({
        worktreePath: null,
        threadBranch: null,
        latestTurn: null,
        pending: undefined,
        preferredEnvMode: "worktree",
      }),
    ).toEqual({
      envMode: "worktree",
      startFromOrigin: true,
      baseBranch: null,
    })
    expect(
      resolveOpenedThreadCheckout({
        worktreePath: null,
        threadBranch: "feat",
        latestTurn: { turnId: "turn_1" },
        pending: undefined,
        preferredEnvMode: "worktree",
      }),
    ).toEqual({
      envMode: "local",
      startFromOrigin: false,
      baseBranch: "feat",
    })
    expect(
      resolveOpenedThreadCheckout({
        worktreePath: null,
        threadBranch: null,
        latestTurn: undefined,
        pending: undefined,
        preferredEnvMode: "worktree",
      }),
    ).toEqual({
      envMode: "local",
      startFromOrigin: false,
      baseBranch: null,
    })
  })

  it("garde l'intention retenue d'un draft plutôt que de forcer local", () => {
    const threadId = ThreadId.make("20000000-0000-4000-8000-000000000097")
    expect(
      resolveOpenedThreadCheckout({
        worktreePath: null,
        threadBranch: null,
        latestTurn: null,
        pending: {
          threadId,
          envMode: "worktree",
          baseBranch: "develop",
          startFromOrigin: true,
        },
        preferredEnvMode: "local",
      }),
    ).toEqual({
      envMode: "worktree",
      startFromOrigin: true,
      baseBranch: "develop",
    })
  })

  it("retient l'intention de plusieurs drafts en parallèle", () => {
    const first = ThreadId.make("20000000-0000-4000-8000-000000000096")
    const second = ThreadId.make("20000000-0000-4000-8000-000000000095")
    rememberCreatedCheckout({
      threadId: first,
      envMode: "worktree",
      baseBranch: "main",
      startFromOrigin: true,
    })
    rememberCreatedCheckout({
      threadId: second,
      envMode: "local",
      baseBranch: null,
      startFromOrigin: false,
    })
    expect(peekCreatedCheckout(first)?.envMode).toBe("worktree")
    expect(peekCreatedCheckout(second)?.envMode).toBe("local")
    clearCreatedCheckout()
    expect(peekCreatedCheckout(first)?.envMode).toBe("worktree")
    clearCreatedCheckout(first)
    expect(peekCreatedCheckout(first)).toBeUndefined()
    expect(peekCreatedCheckout(second)?.envMode).toBe("local")
    clearCreatedCheckout(second)
  })

  it("isole l'intention de plusieurs nouveaux Threads", () => {
    const projectId = ProjectId.make("10000000-0000-4000-8000-000000000001")
    const first = "30000000-0000-4000-8000-000000000001"
    const second = "30000000-0000-4000-8000-000000000002"
    rememberDraftCheckout({
      projectId,
      draftId: first,
      checkout: { envMode: "worktree", baseBranch: "main", startFromOrigin: true },
    })
    rememberDraftCheckout({
      projectId,
      draftId: second,
      checkout: { envMode: "local", baseBranch: null, startFromOrigin: false },
    })

    expect(peekDraftCheckout(projectId, first)?.baseBranch).toBe("main")
    expect(peekDraftCheckout(projectId, second)?.envMode).toBe("local")
    clearDraftCheckout(projectId, first)
    expect(peekDraftCheckout(projectId, first)).toBeUndefined()
    expect(peekDraftCheckout(projectId, second)?.envMode).toBe("local")
    clearDraftCheckout(projectId, second)
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
