import { describe, expect, it } from "vite-plus/test"

import type { DesktopUpdateState } from "../src/lib/desktop-update"
import {
  desktopUpdateDescription,
  desktopUpdateHasInstaller,
  desktopUpdateIsChannelSwitch,
  desktopUpdateOpenErrorMessage,
  desktopUpdatePrimaryAction,
  desktopUpdatePrimaryActionLabel,
  desktopUpdateStatusLabel,
  desktopUpdateVersionLine,
} from "../src/lib/desktop-update"

const available: DesktopUpdateState = {
  phase: "idle",
  result: {
    _tag: "available",
    currentVersion: "0.1.0",
    availableVersion: "0.2.0",
    installerName: "Noyau-0.2.0-mac-arm64.dmg",
    installerUrl:
      "https://github.com/hezaerd/noyau/releases/download/v0.2.0/Noyau-0.2.0-mac-arm64.dmg",
    releaseUrl: "https://github.com/hezaerd/noyau/releases/tag/v0.2.0",
    channel: "latest",
  },
}

describe("desktop update presentation", () => {
  it("joins the current version and channel hint", () => {
    expect(desktopUpdateVersionLine("0.2.0", undefined)).toBe("0.2.0")
    expect(desktopUpdateVersionLine("0.2.1-nightly.20260824.2", "nightly")).toBe(
      "0.2.1-nightly.20260824.2 · nightly",
    )
    expect(desktopUpdateVersionLine("0.0.0", "dev")).toBe("0.0.0 · dev")
  })

  it("offers Vérifier until an installer is available", () => {
    expect(desktopUpdatePrimaryAction({ phase: "idle", result: undefined })).toBe("check")
    expect(
      desktopUpdatePrimaryAction({
        phase: "idle",
        result: { _tag: "current", currentVersion: "0.2.0", channel: "latest" },
      }),
    ).toBe("check")
    expect(desktopUpdatePrimaryAction(available)).toBe("open")
    expect(desktopUpdatePrimaryActionLabel("open")).toBe("Ouvrir l’installeur")
    expect(desktopUpdateHasInstaller(available.result)).toBe(true)
  })

  it("hides the action on a local development build", () => {
    expect(
      desktopUpdatePrimaryAction({
        phase: "idle",
        result: { _tag: "unsupported", currentVersion: "0.0.0" },
      }),
    ).toBeNull()
    expect(
      desktopUpdateStatusLabel({
        phase: "idle",
        result: { _tag: "unsupported", currentVersion: "0.0.0" },
      }),
    ).toBe("Build locale — pas de mise à jour.")
  })

  it("describes the available installer and opening errors", () => {
    expect(desktopUpdateDescription(available, "0.1.0")).toBe("0.1.0 — v0.2.0 disponible.")
    expect(desktopUpdateStatusLabel({ ...available, phase: "opening" })).toBe(
      "Ouverture de l’installeur…",
    )
    expect(desktopUpdateOpenErrorMessage({ _tag: "opened" })).toBeUndefined()
    expect(desktopUpdateOpenErrorMessage({ _tag: "failed", message: "boom" })).toBe("boom")
    expect(desktopUpdateOpenErrorMessage({ _tag: "unavailable", reason: "current" })).toBe(
      "Aucun installeur à ouvrir.",
    )
  })

  it("labels a channel switch as a separate app installer", () => {
    expect(desktopUpdateIsChannelSwitch("nightly", "latest")).toBe(true)
    expect(desktopUpdateIsChannelSwitch("latest", "latest")).toBe(false)
    expect(
      desktopUpdateStatusLabel(
        {
          phase: "idle",
          result: {
            ...available.result!,
            channel: "nightly",
            availableVersion: "0.2.1-nightly.20260824.2",
          },
        },
        "latest",
      ),
    ).toBe("Installeur nightly v0.2.1-nightly.20260824.2 — app séparée.")
  })
})
